import { randomUUID } from "node:crypto";
import { MATIERES, type Matiere, type Profil } from "@beile/contracts";
import { schema } from "@beile/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authentifie, base, corps, journaliser, limiteDebitPartage, refuser, type Variables } from "./commun";
import { anneeAdmise, chefDe, cleClasse, cleProfil, normaliser } from "./import-eleves";
import { matiereDe, personnelDe } from "./import-services";
import { enseignantDe } from "./parcours";

/**
 * Emploi du temps (docs/cadrage/EMPLOI_DU_TEMPS.md, lot 1). BEILE ne le CALCULE pas : l'établissement l'importe,
 * BEILE le contrôle (services, chevauchements, plages plausibles) et le rend lisible.
 *
 * Import « remplacer par classe » : chaque classe du fichier reçoit exactement les cours listés. Une classe dont une
 * ligne est refusée est bloquée en entier — son emploi du temps actuel reste intact.
 */
export const emploiDuTemps = new Hono<{ Variables: Variables }>();

const ID_ETAB = z.string().regex(/^ETB-[A-Za-z0-9-]+$/);
const ID_CLASSE = z.string().regex(/^CLS-[A-Za-z0-9-]+$/);
const MAX_LIGNES = 3000;
export const JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"] as const;

const Ligne = z.object({
  n: z.number().int().min(1).max(100_000),
  classe: z.string().trim().min(1).max(40),
  jour: z.string().trim().min(1).max(12),
  debut: z.string().trim().min(3).max(5),
  fin: z.string().trim().min(3).max(5),
  matiere: z.string().trim().min(1).max(40),
  enseignant: z.string().trim().min(2).max(100).optional(),
  npiEnseignant: z.string().regex(/^\d{10}$/).optional(),
  salle: z.string().trim().max(30).optional(),
}).strict().refine((l) => !!l.enseignant || !!l.npiEnseignant, "enseignant ou npiEnseignant");

const Requete = z.object({
  mode: z.enum(["simulation", "import"]),
  anneeScolaire: z.string().regex(/^\d{4}-\d{4}$/),
  idImport: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  lignes: z.array(Ligne).min(1).max(MAX_LIGNES).refine((ls) => new Set(ls.map((l) => l.n)).size === ls.length, "numéros de ligne (n) en double"),
}).strict();

/** « lundi », « Lun », « 1 » → 1 ; dimanche et inconnus → null. */
export function jourDe(v: string): number | null {
  const k = normaliser(v);
  if (/^[1-6]$/.test(k)) return Number(k);
  const i = JOURS.findIndex((j) => normaliser(j) === k || normaliser(j).slice(0, 3) === k);
  return i >= 0 ? i + 1 : null;
}
/** « 7:30 », « 07h30 », « 7H30 » → 450 minutes ; heure impossible → null. */
export function minutesDe(v: string): number | null {
  const r = /^([01]?\d|2[0-3])[:hH]([0-5]\d)$/.exec(v.trim());
  return r ? Number(r[1]) * 60 + Number(r[2]) : null;
}
export const heure = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

type Statut = "a_importer" | "deja_present" | "erreur";
interface Resultat { n: number; statut: Statut; classe: string; classeId?: string; matiere?: Matiere; enseignant?: string; motif?: string }
interface Cours { classeId: string; jour: number; debut: number; fin: number; matiere: string; enseignantId: string; salle: string | null }
const cle = (c: Cours) => `${c.classeId}|${c.jour}|${c.debut}|${c.fin}|${c.matiere}|${c.enseignantId}|${c.salle ?? ""}`;
const chevauche = (a: Cours, b: Cours) => a.jour === b.jour && a.debut < b.fin && b.debut < a.fin;

async function analyser(etablissementId: string, saisie: z.infer<typeof Requete>) {
  const classes = await base().select().from(schema.classes)
    .where(and(eq(schema.classes.etablissementId, etablissementId), eq(schema.classes.anneeScolaire, saisie.anneeScolaire)));
  const parCle = new Map(classes.map((c) => [cleClasse(c.libelle), c]));
  const libelle = (id: string) => classes.find((c) => c.id === id)?.libelle ?? id;
  const { trouver, nomDe } = await personnelDe(etablissementId);
  const ids = classes.map((c) => c.id);
  const services = new Set(ids.length
    ? (await base().select().from(schema.enseignements).where(inArray(schema.enseignements.classeId, ids))).map((s) => `${s.enseignantId}|${s.classeId}|${s.matiere}`)
    : []);
  const existants: (Cours & { id: string })[] = ids.length
    ? (await base().select().from(schema.cours).where(and(eq(schema.cours.etablissementId, etablissementId), eq(schema.cours.anneeScolaire, saisie.anneeScolaire))))
      .map((c) => ({ id: c.id, classeId: c.classeId, jour: c.jour, debut: c.debut, fin: c.fin, matiere: c.matiere, enseignantId: c.enseignantId, salle: c.salle }))
    : [];

  // Passe 1 : chaque ligne seule (classe, matière, enseignant, service, jour, heures).
  const resultats: Resultat[] = [];
  const candidats: { n: number; cours: Cours }[] = [];
  for (const l of [...saisie.lignes].sort((a, b) => a.n - b.n)) {
    const classe = parCle.get(cleClasse(l.classe));
    const r = (statut: Statut, extra: Partial<Resultat> = {}) => { resultats.push({ n: l.n, statut, classe: l.classe, ...(classe ? { classeId: classe.id } : {}), ...extra }); };
    if (!classe) { r("erreur", { motif: `Classe « ${l.classe} » inconnue pour ${saisie.anneeScolaire}` }); continue; }
    const matiere = matiereDe(l.matiere);
    if (!matiere) { r("erreur", { motif: `Matière « ${l.matiere} » non reconnue (${MATIERES.join(", ")})` }); continue; }
    const profs = trouver(l);
    if (!profs.length) { r("erreur", { matiere, motif: "Enseignant introuvable parmi le personnel affecté à votre établissement" }); continue; }
    if (profs.length > 1) { r("erreur", { matiere, motif: "Homonymes dans votre personnel : préciser le NPI de l'enseignant" }); continue; }
    const prof = profs[0]!;
    const enseignant = `${prof.prenoms} ${prof.nom}`;
    if (!services.has(`${prof.id}|${classe.id}|${matiere}`)) { r("erreur", { matiere, enseignant, motif: `${enseignant} n'a pas de service en ${matiere} pour ${classe.libelle} : importez d'abord les services` }); continue; }
    const jour = jourDe(l.jour);
    if (!jour) { r("erreur", { matiere, enseignant, motif: `Jour « ${l.jour} » non reconnu (lundi à samedi)` }); continue; }
    const debut = minutesDe(l.debut), fin = minutesDe(l.fin);
    if (debut == null || fin == null) { r("erreur", { matiere, enseignant, motif: "Heure invalide : HH:MM (ex. 07:30)" }); continue; }
    if (debut < 360 || fin > 1200) { r("erreur", { matiere, enseignant, motif: "Cours hors de la plage 06:00 – 20:00" }); continue; }
    if (fin - debut < 15 || fin - debut > 240) { r("erreur", { matiere, enseignant, motif: "Durée d'une séance : de 15 min à 4 h" }); continue; }
    r("a_importer", { matiere, enseignant });
    candidats.push({ n: l.n, cours: { classeId: classe.id, jour, debut, fin, matiere, enseignantId: prof.id, salle: l.salle ? l.salle.trim() : null } });
  }
  const ligne = (n: number) => resultats.find((x) => x.n === n)!;
  const rejeter = (n: number, motif: string) => { const x = ligne(n); x.statut = "erreur"; x.motif = motif; };

  // Passe 2 : chevauchements, contre les cours gardés (classes non remplacées) et les cours retenus du fichier.
  // Une classe bloquée garde son emploi du temps actuel : on recommence tant que l'ensemble des classes bloquées change.
  const classesDuFichier = new Set(resultats.flatMap((x) => (x.classeId ? [x.classeId] : [])));
  const bloquees = new Set<string>();
  for (let tour = 0; tour < 10; tour++) {
    for (const x of resultats) if (x.statut === "erreur" && x.classeId) bloquees.add(x.classeId);
    const gardes = existants.filter((e) => !classesDuFichier.has(e.classeId) || bloquees.has(e.classeId));
    const retenus: { n: number; cours: Cours }[] = [];
    for (const c of candidats) {
      if (ligne(c.n).statut === "erreur") continue;
      // Une classe bloquée n'écrit rien, mais ses chevauchements sont tout de même signalés : le chef corrige tout
      // en une fois au lieu de découvrir les problèmes l'un après l'autre.
      const classeBloquee = bloquees.has(c.cours.classeId);
      const conflit = (o: Cours) => chevauche(c.cours, o) && (o.classeId === c.cours.classeId || o.enseignantId === c.cours.enseignantId || (!!o.salle && !!c.cours.salle && normaliser(o.salle) === normaliser(c.cours.salle)));
      const g = gardes.find(conflit);
      const f = retenus.find((r) => conflit(r.cours));
      const autre = f?.cours ?? g;
      if (autre) {
        const quoi = autre.classeId === c.cours.classeId ? `la classe a déjà ${autre.matiere}` : autre.enseignantId === c.cours.enseignantId ? `${nomDe(autre.enseignantId)} est en ${libelle(autre.classeId)}` : `la salle ${autre.salle} est occupée par ${libelle(autre.classeId)}`;
        rejeter(c.n, `Chevauchement ${JOURS[autre.jour - 1]} ${heure(autre.debut)}–${heure(autre.fin)} : ${quoi}${f ? ` (ligne ${f.n})` : ""}`);
        continue;
      }
      if (!classeBloquee) retenus.push(c);
    }
    const avant = bloquees.size;
    for (const x of resultats) if (x.statut === "erreur" && x.classeId) bloquees.add(x.classeId);
    if (bloquees.size === avant) {
      // Stable : on bloque les lignes restantes des classes bloquées, puis on calcule ce qui change.
      for (const x of resultats) if (x.statut !== "erreur" && x.classeId && bloquees.has(x.classeId)) { x.statut = "erreur"; x.motif = "Classe bloquée : une autre ligne de cette classe est refusée, corrigez-la d'abord"; }
      const remplacees = [...classesDuFichier].filter((id) => !bloquees.has(id));
      const changees = remplacees.filter((id) => {
        const avantSet = existants.filter((e) => e.classeId === id).map(cle).sort().join(",");
        const apresSet = retenus.filter((r) => r.cours.classeId === id).map((r) => cle(r.cours)).sort().join(",");
        return avantSet !== apresSet;
      });
      for (const x of resultats) if (x.statut === "a_importer" && x.classeId && !changees.includes(x.classeId)) x.statut = "deja_present";
      return {
        resultats, existants, libelle,
        changees, aEcrire: retenus.filter((r) => changees.includes(r.cours.classeId)).map((r) => r.cours),
        retires: existants.filter((e) => changees.includes(e.classeId)).length,
      };
    }
  }
  throw new HTTPException(422, { message: "Fichier trop contradictoire pour être analysé : corrigez les chevauchements signalés" });
}

emploiDuTemps.post("/etablissements/:id/import/emploi-du-temps", authentifie, limiteDebitPartage("import-edt", 20, 3_600_000, cleProfil), async (c) => {
  const profil = c.get("profil");
  const id = ID_ETAB.parse(c.req.param("id"));
  if (!chefDe(profil, id)) {
    await journaliser(profil, "Import d'un emploi du temps", id, "gestion", false, "perimetre");
    refuser("L'emploi du temps se dépose par le chef de CET établissement : refus journalisé");
  }
  const saisie = await corps(c, Requete);
  if (!(await anneeAdmise(id, saisie.anneeScolaire))) {
    await journaliser(profil, "Import d'un emploi du temps", `${id} · ${saisie.anneeScolaire}`, "gestion", false, "annee");
    throw new HTTPException(422, { message: `Année ${saisie.anneeScolaire} non ouverte pour l'import` });
  }
  const a = await analyser(id, saisie);
  const sortie = (r: Resultat) => { const { classeId: _interne, ...reste } = r; return reste; };
  const totaux = {
    lignes: a.resultats.length,
    aImporter: a.resultats.filter((x) => x.statut === "a_importer").length,
    dejaPresents: a.resultats.filter((x) => x.statut === "deja_present").length,
    erreurs: a.resultats.filter((x) => x.statut === "erreur").length,
    classesRemplacees: a.changees.length,
    coursRetires: a.retires,
  };
  if (saisie.mode === "simulation" || !a.changees.length) {
    await journaliser(profil, "Vérification d'un emploi du temps", `${id} · ${JSON.stringify(totaux)}`, "gestion", true, null);
    return c.json({ mode: saisie.mode, ecrit: false, totaux, classes: a.changees.map(a.libelle), lignes: a.resultats.map(sortie) });
  }
  const instantane = a.existants.map((e) => e.id).sort().join(",");
  const enseignants = [...new Set(a.aEcrire.map((x) => x.enseignantId))];
  try {
    await base().transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`services-edt:${id}`}))`);
      // Rien ne doit avoir bougé depuis l'analyse : emploi du temps, services utilisés, affectation des enseignants.
      const maintenant = await tx.select({ id: schema.cours.id }).from(schema.cours).where(and(eq(schema.cours.etablissementId, id), eq(schema.cours.anneeScolaire, saisie.anneeScolaire)));
      if (maintenant.map((x) => x.id).sort().join(",") !== instantane) throw new HTTPException(409, { message: "L'emploi du temps a changé pendant l'import : relancez la vérification" });
      const ici = enseignants.length ? await tx.select({ id: schema.enseignants.id }).from(schema.enseignants).where(and(inArray(schema.enseignants.id, enseignants), eq(schema.enseignants.etablissementId, id))) : [];
      if (ici.length !== enseignants.length) throw new HTTPException(409, { message: "Un enseignant du fichier vient de quitter l'établissement : relancez la vérification" });
      const servis = new Set((await tx.select().from(schema.enseignements).where(inArray(schema.enseignements.classeId, a.changees))).map((s) => `${s.enseignantId}|${s.classeId}|${s.matiere}`));
      if (a.aEcrire.some((x) => !servis.has(`${x.enseignantId}|${x.classeId}|${x.matiere}`))) throw new HTTPException(409, { message: "Un service a été retiré pendant l'import : relancez la vérification" });
      await tx.delete(schema.cours).where(and(eq(schema.cours.etablissementId, id), inArray(schema.cours.classeId, a.changees)));
      if (a.aEcrire.length) await tx.insert(schema.cours).values(a.aEcrire.map((x) => ({ id: `CRS-${randomUUID()}`, etablissementId: id, anneeScolaire: saisie.anneeScolaire, ...x })));
    });
  } catch (err) {
    if (err instanceof HTTPException && err.status === 409) await journaliser(profil, "Import d'un emploi du temps", `${id} · ${err.message}`, "gestion", false, "concurrence");
    throw err;
  }
  const refusees = a.resultats.filter((x) => x.statut === "erreur").map((x) => x.n).slice(0, 40).join(",");
  await journaliser(profil, "Import d'un emploi du temps", `${id} · ${saisie.anneeScolaire} · classes ${a.changees.map(a.libelle).join(", ").slice(0, 300)} · ${a.aEcrire.length} cours, ${a.retires} cours retiré(s), ${totaux.erreurs} ligne(s) refusée(s)${refusees ? ` [${refusees}]` : ""}`, "gestion", true, null);
  return c.json({ mode: "import", ecrit: true, totaux: { ...totaux, coursEcrits: a.aEcrire.length }, classes: a.changees.map(a.libelle), lignes: a.resultats.map((r) => sortie(r.statut === "a_importer" ? { ...r, statut: "deja_present" as Statut } : r)) }, 201);
});

/* ------------------------------------------------------------------ Saisie à l'écran : une séance à la fois */

const ID_SEANCE = z.string().regex(/^CRS-[A-Za-z0-9-]+$/);
const ID_ENSEIGNANT = z.string().regex(/^ENS-[A-Za-z0-9-]+$/);
const Seance = z.object({
  classeId: ID_CLASSE,
  jour: z.number().int().min(1).max(6),
  debut: z.string().regex(/^\d{1,2}:\d{2}$/),
  fin: z.string().regex(/^\d{1,2}:\d{2}$/),
  matiere: z.string().trim().min(1).max(40),
  enseignantId: ID_ENSEIGNANT,
  salle: z.string().trim().max(30).optional(),
}).strict();

/**
 * Une séance saisie ou modifiée à l'écran par l'administration de l'école : MÊMES contrôles que l'import (classe de
 * l'établissement, enseignant affecté, service, plages, chevauchements de classe, d'enseignant et de salle), faits
 * DANS la transaction, sous le verrou commun aux imports de services et d'emploi du temps.
 */
async function ecrireSeance(profil: Profil, etablissementId: string, s: z.infer<typeof Seance>, remplace: string | null) {
  const matiere = matiereDe(s.matiere);
  if (!matiere) throw new HTTPException(422, { message: `Matière « ${s.matiere} » non reconnue (${MATIERES.join(", ")})` });
  const debut = minutesDe(s.debut), fin = minutesDe(s.fin);
  if (debut == null || fin == null) throw new HTTPException(422, { message: "Heure invalide : HH:MM (ex. 07:30)" });
  if (debut < 360 || fin > 1200) throw new HTTPException(422, { message: "Cours hors de la plage 06:00 – 20:00" });
  if (fin - debut < 15 || fin - debut > 240) throw new HTTPException(422, { message: "Durée d'une séance : de 15 min à 4 h" });
  const salle = s.salle ? s.salle : null;
  return base().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`services-edt:${etablissementId}`}))`);
    const [classe] = await tx.select().from(schema.classes).where(and(eq(schema.classes.id, s.classeId), eq(schema.classes.etablissementId, etablissementId)));
    if (!classe) throw new HTTPException(422, { message: "Classe inconnue ou hors de votre établissement" });
    // Même règle que l'import (anneeAdmise). Limite connue : BEILE n'a pas encore de notion d'année CLOSE — une année
    // qui a des classes reste admise. La date de clôture est une décision métier (note de cadrage, décision 4).
    if (!(await anneeAdmise(etablissementId, classe.anneeScolaire))) throw new HTTPException(422, { message: `Année ${classe.anneeScolaire} non ouverte : son emploi du temps ne se modifie plus` });
    let avant: typeof schema.cours.$inferSelect | undefined;
    if (remplace) {
      [avant] = await tx.select().from(schema.cours).where(and(eq(schema.cours.id, remplace), eq(schema.cours.etablissementId, etablissementId)));
      if (!avant) throw new HTTPException(404, { message: "Séance inconnue ou hors de votre établissement" });
      if (avant.anneeScolaire !== classe.anneeScolaire) throw new HTTPException(422, { message: "Une séance ne change pas d'année scolaire : supprimez-la et créez-en une nouvelle" });
    }
    const [prof] = await tx.select().from(schema.enseignants).where(and(eq(schema.enseignants.id, s.enseignantId), eq(schema.enseignants.etablissementId, etablissementId)));
    if (!prof) throw new HTTPException(422, { message: "Enseignant introuvable parmi le personnel affecté à votre établissement" });
    const [service] = await tx.select().from(schema.enseignements).where(and(eq(schema.enseignements.enseignantId, prof.id), eq(schema.enseignements.classeId, classe.id), eq(schema.enseignements.matiere, matiere)));
    if (!service) throw new HTTPException(422, { message: `${prof.prenoms} ${prof.nom} n'a pas de service en ${matiere} pour ${classe.libelle} : attribuez d'abord le service` });
    // Chevauchements : toutes les séances de l'établissement, cette année, le même jour — sauf celle qu'on modifie.
    const memeJour = await tx.select({ c: schema.cours, classe: schema.classes.libelle, nom: schema.enseignants.nom, prenoms: schema.enseignants.prenoms })
      .from(schema.cours).innerJoin(schema.classes, eq(schema.classes.id, schema.cours.classeId)).innerJoin(schema.enseignants, eq(schema.enseignants.id, schema.cours.enseignantId))
      .where(and(eq(schema.cours.etablissementId, etablissementId), eq(schema.cours.anneeScolaire, classe.anneeScolaire), eq(schema.cours.jour, s.jour)));
    for (const { c: o, classe: libelleAutre, nom, prenoms } of memeJour) {
      if (o.id === remplace || !(debut < o.fin && o.debut < fin)) continue;
      const quoi = o.classeId === classe.id ? `la classe a déjà ${o.matiere}` : o.enseignantId === prof.id ? `${prenoms} ${nom} est en ${libelleAutre}` : salle && o.salle && normaliser(o.salle) === normaliser(salle) ? `la salle ${o.salle} est occupée par ${libelleAutre}` : null;
      if (quoi) throw new HTTPException(409, { message: `Chevauchement ${JOURS[s.jour - 1]} ${heure(o.debut)}–${heure(o.fin)} : ${quoi}` });
    }
    const valeurs = { etablissementId, classeId: classe.id, anneeScolaire: classe.anneeScolaire, jour: s.jour, debut, fin, matiere, enseignantId: prof.id, salle };
    const id = remplace ?? `CRS-${randomUUID()}`;
    if (remplace) await tx.update(schema.cours).set(valeurs).where(and(eq(schema.cours.id, remplace), eq(schema.cours.etablissementId, etablissementId)));
    else await tx.insert(schema.cours).values({ id, ...valeurs });
    // Trace compacte (le journal garde 200 caractères) : la classe une fois, puis « avant → après » champ par champ.
    type Etat = { jour: number; debut: number; fin: number; matiere: string; enseignantId: string; salle: string | null; classeId: string };
    const champs = (x: Etat) => ({ classe: x.classeId, creneau: `${JOURS[x.jour - 1]!.slice(0, 3)} ${heure(x.debut)}–${heure(x.fin)}`, matiere: x.matiere, enseignant: x.enseignantId, salle: x.salle ?? "—" });
    const apres = champs(valeurs);
    const trace = avant
      ? (() => { const a = champs(avant); return Object.entries(apres).filter(([k, v]) => a[k as keyof typeof a] !== v).map(([k, v]) => `${k} ${a[k as keyof typeof a]}→${v}`).join(" · ") || "inchangée"; })()
      : Object.values(apres).join(" ");
    return { id, classe: classe.libelle, enseignant: `${prof.prenoms} ${prof.nom}`, matiere, jour: s.jour, debut: heure(debut), fin: heure(fin), salle, trace: avant ? `${avant.classeId} · ${trace}` : trace };
  });
}

async function seulAdministrationEcole(profil: Profil, etablissementId: string, action: string) {
  if (!chefDe(profil, etablissementId)) {
    await journaliser(profil, action, etablissementId, "gestion", false, "perimetre");
    refuser("L'emploi du temps se modifie par l'administration de CET établissement : refus journalisé");
  }
}
/** Un refus métier (séance inconnue, chevauchement, contrôle) est tracé comme un refus de périmètre : avec sa cible. */
async function tracerRefus<T>(profil: Profil, action: string, cible: string, f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (err) {
    if (err instanceof HTTPException && [404, 409, 422].includes(err.status)) {
      await journaliser(profil, action, `${cible} · ${err.message}`.slice(0, 200), "gestion", false, err.status === 409 ? "chevauchement" : err.status === 404 ? "perimetre" : "controle");
    }
    throw err;
  }
}
// Plafond propre aux écritures unitaires : un usage normal reste loin de 120 par heure ; au-delà, c'est un script.
const plafondSaisie = limiteDebitPartage("saisie-edt", 120, 3_600_000, cleProfil);

emploiDuTemps.post("/etablissements/:id/emploi-du-temps/seances", authentifie, plafondSaisie, async (c) => {
  const profil = c.get("profil");
  const id = ID_ETAB.parse(c.req.param("id"));
  await seulAdministrationEcole(profil, id, "Ajout d'une séance");
  const s = await corps(c, Seance);
  const r = await tracerRefus(profil, "Ajout d'une séance", `${id} · ${s.classeId}`, () => ecrireSeance(profil, id, s, null));
  await journaliser(profil, "Ajout d'une séance", `${id} · ${r.id} · ${r.trace}`.slice(0, 200), "gestion", true, null);
  const { trace: _t, ...sortie } = r;
  return c.json(sortie, 201);
});

emploiDuTemps.post("/etablissements/:id/emploi-du-temps/seances/:seanceId", authentifie, plafondSaisie, async (c) => {
  const profil = c.get("profil");
  const id = ID_ETAB.parse(c.req.param("id"));
  const seanceId = ID_SEANCE.parse(c.req.param("seanceId"));
  await seulAdministrationEcole(profil, id, "Modification d'une séance");
  const s = await corps(c, Seance);
  const r = await tracerRefus(profil, "Modification d'une séance", `${id} · ${seanceId}`, () => ecrireSeance(profil, id, s, seanceId));
  // Avant → après : une séance déplacée ou réaffectée reste reconstituable depuis le journal.
  await journaliser(profil, "Modification d'une séance", `${seanceId} · ${r.trace}`.slice(0, 200), "gestion", true, null);
  const { trace: _t, ...sortie } = r;
  return c.json(sortie);
});

emploiDuTemps.post("/etablissements/:id/emploi-du-temps/seances/:seanceId/supprimer", authentifie, plafondSaisie, async (c) => {
  const profil = c.get("profil");
  const id = ID_ETAB.parse(c.req.param("id"));
  const seanceId = ID_SEANCE.parse(c.req.param("seanceId"));
  await seulAdministrationEcole(profil, id, "Suppression d'une séance");
  await corps(c, z.object({}).strict());
  const s = await tracerRefus(profil, "Suppression d'une séance", `${id} · ${seanceId}`, () => base().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`services-edt:${id}`}))`);
    const [cible] = await tx.select().from(schema.cours).where(and(eq(schema.cours.id, seanceId), eq(schema.cours.etablissementId, id)));
    if (!cible) throw new HTTPException(404, { message: "Séance inconnue ou hors de votre établissement" });
    if (!(await anneeAdmise(id, cible.anneeScolaire))) throw new HTTPException(422, { message: `Année ${cible.anneeScolaire} non ouverte : son emploi du temps ne se modifie plus` });
    await tx.delete(schema.cours).where(and(eq(schema.cours.id, seanceId), eq(schema.cours.etablissementId, id)));
    return cible;
  }));
  await journaliser(profil, "Suppression d'une séance", `${id} · ${seanceId} · ${s.classeId} ${s.matiere} ${JOURS[s.jour - 1]} ${heure(s.debut)}–${heure(s.fin)} ${s.enseignantId}${s.salle ? ` ${s.salle}` : ""}`.slice(0, 200), "gestion", true, null);
  return c.json({ supprime: seanceId });
});

/** Lecture d'un établissement : son chef, ou l'inspection de sa circonscription (lecture seule). */
async function lecteurEtablissement(profil: Profil, etablissementId: string) {
  const [etab] = await base().select({ id: schema.etablissements.id, circonscription: schema.etablissements.circonscription }).from(schema.etablissements).where(eq(schema.etablissements.id, etablissementId));
  if (!etab) throw new HTTPException(404, { message: "Établissement inconnu" });
  const chef = chefDe(profil, etablissementId);
  const inspecteur = profil.habilitations.some((h) => h.role === "inspecteur" && h.perimetre.niveau === "circonscription" && h.perimetre.circonscription === etab.circonscription);
  if (!chef && !inspecteur) {
    await journaliser(profil, "Consultation d'un emploi du temps", etablissementId, "gestion", false, "perimetre");
    refuser("Emploi du temps hors de votre périmètre : refus journalisé");
  }
  return chef ? ("gestion" as const) : ("controle" as const);
}

const enLigne = (c: typeof schema.cours.$inferSelect, extra: Record<string, unknown> = {}) => ({
  id: c.id, classeId: c.classeId, jour: c.jour, jourLibelle: JOURS[c.jour - 1], debut: heure(c.debut), fin: heure(c.fin), matiere: c.matiere, salle: c.salle, ...extra,
});

emploiDuTemps.get("/etablissements/:id/emploi-du-temps", authentifie, async (c) => {
  const profil = c.get("profil");
  const id = ID_ETAB.parse(c.req.param("id"));
  const finalite = await lecteurEtablissement(profil, id);
  const classeId = c.req.query("classe") ? ID_CLASSE.parse(c.req.query("classe")) : null;
  const annee = z.string().regex(/^\d{4}-\d{4}$/).optional().parse(c.req.query("annee"));
  const lignes = await base().select({ c: schema.cours, nom: schema.enseignants.nom, prenoms: schema.enseignants.prenoms, classe: schema.classes.libelle })
    .from(schema.cours).innerJoin(schema.enseignants, eq(schema.enseignants.id, schema.cours.enseignantId)).innerJoin(schema.classes, eq(schema.classes.id, schema.cours.classeId))
    .where(and(eq(schema.cours.etablissementId, id), ...(classeId ? [eq(schema.cours.classeId, classeId)] : []), ...(annee ? [eq(schema.cours.anneeScolaire, annee)] : [])))
    .orderBy(schema.cours.classeId, schema.cours.jour, schema.cours.debut);
  // Pour la saisie à l'écran (administration de l'école seulement) : les services de la classe, seuls couples
  // enseignant × matière admis pour une séance.
  const services = classeId && finalite === "gestion"
    ? (await base().select({ enseignantId: schema.enseignements.enseignantId, matiere: schema.enseignements.matiere, nom: schema.enseignants.nom, prenoms: schema.enseignants.prenoms })
      .from(schema.enseignements).innerJoin(schema.enseignants, eq(schema.enseignants.id, schema.enseignements.enseignantId))
      .where(and(eq(schema.enseignements.classeId, classeId), eq(schema.enseignants.etablissementId, id))))
      .map((s) => ({ enseignantId: s.enseignantId, matiere: s.matiere, enseignant: `${s.prenoms} ${s.nom}` }))
    : undefined;
  await journaliser(profil, "Consultation d'un emploi du temps", `${id}${classeId ? ` · ${classeId}` : ""}`, finalite, true, null);
  return c.json({ jours: JOURS, modifiable: finalite === "gestion", ...(services ? { services } : {}), cours: lignes.map((l) => enLigne(l.c, { classe: l.classe, enseignant: `${l.prenoms} ${l.nom}`, ...(finalite === "gestion" ? { enseignantId: l.c.enseignantId } : {}) })) });
});

/**
 * Mon emploi du temps (enseignant) : mes cours dans l'établissement où je suis affecté, pour UNE année scolaire
 * (la plus récente déposée, ou `?annee=`) — deux années mêlées gonfleraient les heures hebdomadaires.
 */
emploiDuTemps.get("/moi/emploi-du-temps", authentifie, async (c) => {
  const profil = c.get("profil");
  const e = await enseignantDe(profil);
  if (!e) {
    await journaliser(profil, "Consultation de mon emploi du temps", profil.id, "evaluation", false, "role");
    refuser("Aucune habilitation « enseignant » rattachée à un personnel du registre");
  }
  const demandee = z.string().regex(/^\d{4}-\d{4}$/).optional().parse(c.req.query("annee"));
  const mien = and(eq(schema.cours.enseignantId, e!.id), eq(schema.cours.etablissementId, e!.etablissementId));
  const annees = (await base().selectDistinct({ a: schema.cours.anneeScolaire }).from(schema.cours).where(mien)).map((x) => x.a).sort();
  const annee = demandee ?? annees.at(-1) ?? null;
  const lignes = annee ? await base().select({ c: schema.cours, classe: schema.classes.libelle }).from(schema.cours)
    .innerJoin(schema.classes, eq(schema.classes.id, schema.cours.classeId))
    .where(and(mien, eq(schema.cours.anneeScolaire, annee)))
    .orderBy(schema.cours.jour, schema.cours.debut) : [];
  const minutes = lignes.reduce((s, l) => s + (l.c.fin - l.c.debut), 0);
  return c.json({ jours: JOURS, anneeScolaire: annee, annees, heuresHebdomadaires: Math.round((minutes / 60) * 10) / 10, cours: lignes.map((l) => enLigne(l.c, { classe: l.classe })) });
});
