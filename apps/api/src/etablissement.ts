import { randomUUID } from "node:crypto";
import { AUTORITE_EXAMEN, NIVEAUX, QUALITES_CONSEIL, type Habilitation, type Niveau } from "@beile/contracts";
import { schema } from "@beile/db";
import { aujourdhui } from "@beile/simulation/scolarite";
import { communeById } from "@beile/simulation/territoire";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authentifie, base, comparerFr, corps, dateCalendaire, journaliser, refuser, revoquerSessionsDuCompte, type Variables } from "./commun";
import { classesCourantes, inscrireAuRegistre, type NouveauFait } from "./ecriture";
import { bilans, enBaisse, scolarisesEtablissement } from "./lectures";

/**
 * Espace établissement : tableau de bord, apprenants, transitions, examens, accompagnement.
 * Accès : le chef de l'établissement (gestion) ; l'inspecteur de la circonscription (lecture, contrôle).
 * Toutes les lectures passent par la projection core.scolarites et des agrégats SQL : coût constant par écran.
 */
export const etablissement = new Hono<{ Variables: Variables }>();

const ID_ETAB = z.string().regex(/^ETB-[A-Z0-9-]+$/);
const TRIMESTRE_COURANT = 2;
const FORMATION_OBLIGATOIRE = "Évaluation formative en mathématiques";
const moyenneDe = (v: (number | null)[]) => { const x = v.filter((n): n is number => n != null); return x.length ? x.reduce((s, n) => s + n, 0) / x.length : null; };

async function acces(c: Context<{ Variables: Variables }>, etablissementId: string, ecriture = false) {
  const profil = c.get("profil");
  const [etab] = await base().select().from(schema.etablissements).where(eq(schema.etablissements.id, etablissementId));
  if (!etab) throw new HTTPException(404, { message: "Établissement inconnu" });
  const chef = profil.habilitations.some((h) => h.role === "chef_etablissement" && h.perimetre.niveau === "etablissement" && h.perimetre.etablissementId === etablissementId);
  const inspecteur = !ecriture && profil.habilitations.some((h) => h.role === "inspecteur" && h.perimetre.niveau === "circonscription" && h.perimetre.circonscription === etab.circonscription);
  if (!chef && !inspecteur) {
    await journaliser(profil, ecriture ? "Action sur un établissement" : "Consultation d'un établissement", etablissementId, ecriture ? "gestion" : "controle", false, "perimetre");
    refuser("Établissement hors de votre périmètre : refus journalisé");
  }
  return { profil, etab, finalite: chef ? ("gestion" as const) : ("controle" as const) };
}

/** Tableau de bord : chiffres clés, classes, alertes utiles à la direction, absences du jour. */
etablissement.get("/etablissements/:id/tableau", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil, etab, finalite } = await acces(c, id);
  const jour = aujourdhui();
  const [classes, eleves, enseignants, formes, absentsDuJour, seances] = await Promise.all([
    base().select().from(schema.classes).where(eq(schema.classes.etablissementId, id)),
    scolarisesEtablissement(id),
    base().select({ id: schema.enseignants.id, nom: schema.enseignants.nom, prenoms: schema.enseignants.prenoms }).from(schema.enseignants).where(eq(schema.enseignants.etablissementId, id)),
    base().selectDistinct({ id: schema.evenements.enseignantId }).from(schema.evenements)
      .where(and(eq(schema.evenements.type, "FORMATION_ENSEIGNANT"), eq(schema.evenements.etablissementId, id), sql`${schema.evenements.donnees}->>'formation' like ${FORMATION_OBLIGATOIRE + "%"}`)),
    base().select({ id: schema.evenements.id, apprenantId: schema.evenements.apprenantId, classeId: sql<string>`${schema.evenements.donnees}->>'classeId'`, enregistreLe: schema.evenements.survenuLe })
      .from(schema.evenements)
      .where(and(eq(schema.evenements.type, "ABSENCE"), eq(schema.evenements.etablissementId, id), sql`${schema.evenements.donnees}->>'date' = ${jour}`)),
    // Une ligne par conseil enregistré, dans l'ordre chronologique : la dernière séance de chaque classe gagne.
    // Les membres ne sortent pas du registre — ce tableau se lit aussi sous une habilitation d'inspecteur, et
    // un parent délégué qui siège n'a rien à faire dans une liste diffusée hors du conseil.
    base().select({
      classeId: sql<string>`${schema.evenements.donnees}->>'classeId'`,
      dateSeance: sql<string>`${schema.evenements.donnees}->>'dateSeance'`,
      nombreDeMembres: sql<number>`coalesce(jsonb_array_length(${schema.evenements.donnees}->'membres'), 0)::int`,
    }).from(schema.evenements)
      .where(and(eq(schema.evenements.type, "CONSEIL_DE_CLASSE"), eq(schema.evenements.etablissementId, id)))
      // Le « dernier conseil » est celui de la séance la plus récente, pas le dernier enregistré (saisie antidatée).
      .orderBy(sql`${schema.evenements.donnees}->>'dateSeance'`, schema.evenements.survenuLe),
  ]);
  const b = await bilans(eleves.map((e) => e.id), TRIMESTRE_COURANT);
  const nom = new Map(eleves.map((a) => [a.id, `${a.prenoms} ${a.nom}`]));
  const formesIds = new Set(formes.map((f) => f.id));
  const derniereSeance = new Map(seances.filter((s) => s.classeId).map((s) => [s.classeId as string, { dateSeance: s.dateSeance, nombreDeMembres: s.nombreDeMembres }]));
  const lignesClasses = classes.map((cl) => {
    const membres = eleves.filter((e) => e.classeId === cl.id);
    const principal = enseignants.find((e) => e.id === cl.enseignantPrincipalId);
    return {
      id: cl.id, libelle: cl.libelle, niveau: cl.niveau, capacite: cl.capacite, effectif: membres.length,
      moyenne: moyenneDe(membres.map((m) => b.get(m.id)?.moyenneTrimestre ?? null)),
      absentsDuJour: absentsDuJour.filter((x) => x.classeId === cl.id).length,
      professeurPrincipal: principal ? `${principal.prenoms} ${principal.nom}` : null,
      conseil: derniereSeance.get(cl.id) ?? null,
    };
  }).sort((x, y) => comparerFr(x.libelle, y.libelle));
  const baisse = eleves.map((e) => ({ apprenantId: e.id, nom: nom.get(e.id), notes: b.get(e.id)?.dernieresMaths ?? [], baisse: enBaisse(b.get(e.id)) }))
    .filter((x) => x.baisse != null).sort((x, y) => y.baisse! - x.baisse!);
  await journaliser(profil, "Consultation du tableau de bord", id, finalite, true, null);
  return c.json({
    etablissement: { id: etab.id, nom: etab.nom, communeId: etab.communeId, circonscription: etab.circonscription, capacite: etab.capacite, cycle: etab.cycle },
    date: jour,
    trimestre: TRIMESTRE_COURANT,
    chiffres: { apprenants: eleves.length, capacite: etab.capacite, enseignants: enseignants.length, moyenne: moyenneDe(eleves.map((e) => b.get(e.id)?.moyenneTrimestre ?? null)), absentsDuJour: absentsDuJour.length },
    classes: lignesClasses,
    alertes: {
      baisse,
      regularisations: eleves.filter((a) => a.statutIdentite === "regularisation_en_cours").map((a) => ({ id: a.id, nom: nom.get(a.id) })),
      enseignantsSansFormation: enseignants.filter((e) => !formesIds.has(e.id)).length,
      formationObligatoire: FORMATION_OBLIGATOIRE,
      surcharges: lignesClasses.filter((x) => x.effectif > x.capacite).map((x) => ({ classe: x.libelle, effectif: x.effectif, capacite: x.capacite })),
    },
    absencesDuJour: absentsDuJour.map((x) => ({ id: x.id, apprenantId: x.apprenantId, nom: x.apprenantId ? nom.get(x.apprenantId) : null, classe: classes.find((cl) => cl.id === x.classeId)?.libelle, enregistreLe: x.enregistreLe }))
      .sort((x, y) => y.enregistreLe.getTime() - x.enregistreLe.getTime()),
  });
});

/** Liste des apprenants scolarisés, avec les signaux utiles (baisse, identité à régulariser). */
etablissement.get("/etablissements/:id/eleves", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil, finalite } = await acces(c, id);
  const eleves = await scolarisesEtablissement(id);
  const b = await bilans(eleves.map((e) => e.id), TRIMESTRE_COURANT);
  await journaliser(profil, "Consultation de la liste des apprenants", id, finalite, true, null);
  return c.json(eleves.map((a) => {
    const x = b.get(a.id);
    return { id: a.id, nom: a.nom, prenoms: a.prenoms, sexe: a.sexe, dateNaissance: a.dateNaissance, statutIdentite: a.statutIdentite, classeId: a.classeId, classe: a.classe, moyenne: x?.moyenneTrimestre ?? null, absences: x?.absences ?? 0, baisseMaths: enBaisse(x) != null ? x!.dernieresMaths : null };
  }).sort((x, y) => comparerFr(x.classe, y.classe) || comparerFr(x.nom, y.nom)));
});

/* ------------------------------------------------------------------ Organisation pédagogique (classes) */

/** Enseignants rattachés à l'établissement : sert à désigner un professeur principal. */
etablissement.get("/etablissements/:id/enseignants", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil, finalite } = await acces(c, id);
  const lignes = await base().select({ id: schema.enseignants.id, prenoms: schema.enseignants.prenoms, nom: schema.enseignants.nom, matieres: schema.enseignants.matieres })
    .from(schema.enseignants).where(eq(schema.enseignants.etablissementId, id));
  await journaliser(profil, "Consultation des enseignants de l'établissement", id, finalite, true, null);
  return c.json(lignes.map((x) => ({ id: x.id, nom: `${x.prenoms} ${x.nom}`, matieres: x.matieres })).sort((a, b) => comparerFr(a.nom, b.nom)));
});

/**
 * Personnel enseignant : grade, ancienneté, classes et matières tenues, charge (élèves), formations
 * suivies, et suivi des notes du trimestre par classe et matière. Le registre ne rattache pas une note à
 * la personne qui l'a saisie : l'activité se lit donc sur la relation pédagogique (telle classe, telle
 * matière), jamais attribuée à un individu.
 */
etablissement.get("/etablissements/:id/personnel", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil, finalite } = await acces(c, id);
  const [enseignants, enseignements, effectifs, notes, formations] = await Promise.all([
    base().select().from(schema.enseignants).where(eq(schema.enseignants.etablissementId, id)),
    base().select({ enseignantId: schema.enseignements.enseignantId, classeId: schema.enseignements.classeId, matiere: schema.enseignements.matiere, libelle: schema.classes.libelle, niveau: schema.classes.niveau, principal: schema.classes.enseignantPrincipalId })
      .from(schema.enseignements).innerJoin(schema.classes, eq(schema.classes.id, schema.enseignements.classeId))
      .where(eq(schema.classes.etablissementId, id)),
    base().execute<{ classe_id: string; n: number }>(sql`select classe_id, count(*)::int as n from core.scolarites where statut = 'scolarise' and classe_id in (select id from core.classes where etablissement_id = ${id}) group by classe_id`),
    base().execute<{ classe_id: string; matiere: string; n: number; derniere: string | null }>(sql`
      select n.classe_id, n.matiere, count(*)::int as n, max(n.survenu_le)::text as derniere from core.notes n
      where n.trimestre = ${TRIMESTRE_COURANT} and n.classe_id in (select id from core.classes where etablissement_id = ${id})
      group by n.classe_id, n.matiere`),
    base().select({ enseignantId: schema.evenements.enseignantId, formation: sql<string>`${schema.evenements.donnees}->>'formation'`, le: schema.evenements.survenuLe })
      .from(schema.evenements).where(and(eq(schema.evenements.type, "FORMATION_ENSEIGNANT"), eq(schema.evenements.etablissementId, id))),
  ]);
  const effectif = new Map(effectifs.map((x) => [x.classe_id, x.n]));
  const suivi = new Map(notes.map((x) => [`${x.classe_id}|${x.matiere}`, x]));
  const annee = Number(aujourdhui().slice(0, 4));
  await journaliser(profil, "Consultation du personnel enseignant", id, finalite, true, null);
  const personnel = enseignants.map((e) => {
    const tenues = enseignements.filter((x) => x.enseignantId === e.id).map((x) => {
      const s = suivi.get(`${x.classeId}|${x.matiere}`);
      return { classeId: x.classeId, classe: x.libelle, niveau: x.niveau, matiere: x.matiere, principal: x.principal === e.id, effectif: effectif.get(x.classeId) ?? 0, notesTrimestre: s?.n ?? 0, derniereNote: s?.derniere ?? null };
    }).sort((a, b) => comparerFr(a.classe, b.classe));
    const suivies = formations.filter((f) => f.enseignantId === e.id).sort((a, b) => b.le.toISOString().localeCompare(a.le.toISOString()));
    return {
      id: e.id, nom: e.nom, prenoms: e.prenoms, sexe: e.sexe, grade: e.grade, matieres: e.matieres,
      anciennete: e.dateRecrutement ? Math.max(0, annee - Number(String(e.dateRecrutement).slice(0, 4))) : null,
      classes: tenues,
      eleves: [...new Set(tenues.map((t) => t.classeId))].reduce((s, cid) => s + (effectif.get(cid) ?? 0), 0),
      formations: suivies.map((f) => ({ intitule: f.formation, le: f.le.toISOString().slice(0, 10) })),
      formationObligatoire: suivies.some((f) => f.formation?.startsWith(FORMATION_OBLIGATOIRE)),
    };
  }).sort((a, b) => comparerFr(a.nom, b.nom));
  return c.json({ trimestre: TRIMESTRE_COURANT, formationObligatoire: FORMATION_OBLIGATOIRE, personnel });
});

/**
 * Édition d'une classe par le chef de l'établissement : capacité et professeur principal.
 * La capacité peut être abaissée sous l'effectif courant : la surcharge est une alerte de pilotage,
 * pas une interdiction (on ne supprime aucun élève pour faire rentrer le chiffre). Le professeur
 * principal désigné doit enseigner dans l'établissement.
 */
etablissement.post("/etablissements/:id/classes/:classeId", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const classeId = z.string().regex(/^CLS-[A-Za-z0-9-]+$/).parse(c.req.param("classeId"));
  const { profil } = await acces(c, id, true);
  const saisie = await corps(c, z.object({
    capacite: z.coerce.number().int().min(1).max(2000),
    enseignantPrincipalId: z.string().regex(/^ENS-[A-Za-z0-9-]+$/).nullable(),
  }).strict());
  const [classe] = await base().select().from(schema.classes).where(eq(schema.classes.id, classeId));
  if (!classe || classe.etablissementId !== id) throw new HTTPException(404, { message: "Classe inconnue ou hors de votre établissement" });
  if (saisie.enseignantPrincipalId) {
    const [prof] = await base().select({ id: schema.enseignants.id }).from(schema.enseignants)
      .where(and(eq(schema.enseignants.id, saisie.enseignantPrincipalId), eq(schema.enseignants.etablissementId, id)));
    if (!prof) throw new HTTPException(422, { message: "Le professeur principal désigné n'enseigne pas dans cet établissement" });
  }
  await base().update(schema.classes).set({ capacite: saisie.capacite, enseignantPrincipalId: saisie.enseignantPrincipalId }).where(eq(schema.classes.id, classeId));
  await journaliser(profil, "Modification d'une classe", `${classeId} (${classe.libelle})`, "gestion", true, null);
  return c.json({ id: classeId, libelle: classe.libelle, capacite: saisie.capacite, enseignantPrincipalId: saisie.enseignantPrincipalId });
});

/* ------------------------------------------------------------------ Cycle annuel : conseil de passage */

/** Division d'accueil pour une année donnée : la moins saturée, ou une nouvelle créée si tout est plein. */
interface Division { id: string; capacite: number; effectif: number }

async function divisionsAccueil(etablissementId: string, niveau: string, anneeScolaire: string) {
  const lignes = await base().select({ id: schema.classes.id, capacite: schema.classes.capacite })
    .from(schema.classes)
    .where(and(eq(schema.classes.etablissementId, etablissementId), eq(schema.classes.niveau, niveau), eq(schema.classes.anneeScolaire, anneeScolaire)));
  if (!lignes.length) return [] as Division[];
  const comptes = await base().select({ classeId: schema.scolarites.classeId, n: count() })
    .from(schema.scolarites).where(inArray(schema.scolarites.classeId, lignes.map((l) => l.id))).groupBy(schema.scolarites.classeId);
  const parClasse = new Map(comptes.map((x) => [x.classeId, Number(x.n)]));
  return lignes.map((l) => ({ id: l.id, capacite: l.capacite, effectif: parClasse.get(l.id) ?? 0 }));
}

/**
 * Conseil de passage de fin d'année : le chef d'établissement prononce, pour chaque apprenant d'une classe,
 * l'admission au niveau supérieur ou le maintien. Le registre reçoit d'abord un fait CONSEIL_DE_CLASSE — la
 * séance elle-même : sa date, les membres qui y siègent, la référence du procès-verbal — puis, pour chaque
 * apprenant, un fait PASSAGE (la décision) suivi d'un fait REPRISE qui réinscrit l'élève dans sa division de
 * l'année suivante : projection à jour, familles notifiées. Les divisions de l'année cible sont créées au
 * besoin ; la capacité d'une division existante est respectée (on ouvre une nouvelle division plutôt que de la
 * saturer). Le niveau terminal (Tle) sort par la certification des examens nationaux, non par le conseil : la
 * promotion collective s'y arrête.
 *
 * La séance est exigée, pas proposée : sans elle le registre saurait ce qu'un conseil a décidé sans avoir
 * jamais su qu'il s'est réuni. Et elle ne se corrige pas — un conseil tenu à nouveau est un second fait.
 */
etablissement.post("/etablissements/:id/classes/:classeId/conseil-passage", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const classeId = z.string().regex(/^CLS-[A-Za-z0-9-]+$/).parse(c.req.param("classeId"));
  const { profil } = await acces(c, id, true);
  const saisie = await corps(c, z.object({
    anneeScolaire: z.string().regex(/^\d{4}-\d{4}$/, "format attendu : AAAA-AAAA"),
    capaciteNouvelleDivision: z.coerce.number().int().min(1).max(2000).default(60),
    seance: z.object({
      dateSeance: z.string().refine(dateCalendaire, "date du calendrier attendue (AAAA-MM-JJ)"),
      // Des qualités, jamais des noms : le registre ne s'efface pas (élèves délégués mineurs, parents).
      membres: z.array(z.enum(QUALITES_CONSEIL)).min(1).max(20),
      referencePv: z.string().trim().max(40).nullable().default(null),
    }).strict(),
    decisions: z.array(z.object({
      apprenantId: z.string().regex(/^APP-\d{6}$/),
      decision: z.enum(["admis", "redouble"]),
    }).strict()).min(1).max(80),
  }).strict());
  const [classe] = await base().select().from(schema.classes).where(eq(schema.classes.id, classeId));
  if (!classe || classe.etablissementId !== id) throw new HTTPException(404, { message: "Classe inconnue ou hors de votre établissement" });
  if (saisie.anneeScolaire === classe.anneeScolaire) throw new HTTPException(422, { message: "L'année cible doit différer de l'année en cours" });
  if (saisie.seance.dateSeance > aujourdhui()) throw new HTTPException(422, { message: `Le conseil ne peut pas être tenu après aujourd'hui (${aujourdhui()})` });
  // Le conseil de passage se tient pendant l'année scolaire de la classe (rentrée de septembre au plus tôt).
  const rentree = `${classe.anneeScolaire.slice(0, 4)}-09-01`;
  if (saisie.seance.dateSeance < rentree) throw new HTTPException(422, { message: `La séance doit dater de l'année scolaire ${classe.anneeScolaire} (au plus tôt le ${rentree})` });
  const idxNiveau = NIVEAUX.indexOf(classe.niveau as Niveau);
  if (idxNiveau < 0) throw new HTTPException(422, { message: "Niveau de classe non reconnu dans le référentiel national" });
  const niveauSuivant = NIVEAUX[idxNiveau + 1] as Niveau | undefined;
  const admisses = saisie.decisions.filter((d) => d.decision === "admis");
  // Fin de cycle : la suite ne relève pas du conseil de classe. L'entrée en 6e suit le CEP et une
  // affectation, l'entrée en 2nde le BEPC et l'orientation, la sortie de terminale le baccalauréat.
  const FIN_DE_CYCLE: Record<string, string> = { CM2: "CEP", "3e": "BEPC", Tle: "baccalauréat" };
  if (admisses.length && (FIN_DE_CYCLE[classe.niveau] || !niveauSuivant)) {
    throw new HTTPException(422, { message: `« ${classe.niveau} » termine un cycle : la suite relève du ${FIN_DE_CYCLE[classe.niveau] ?? "examen national"} et de l'affectation, pas du conseil de passage. Seul le redoublement se décide ici.` });
  }

  // Les apprenants doivent être scolarisés dans cette classe.
  const courantes = await classesCourantes(saisie.decisions.map((d) => d.apprenantId));
  const horsClasse = saisie.decisions.filter((d) => courantes.get(d.apprenantId) !== classeId).map((d) => d.apprenantId);
  if (horsClasse.length) throw new HTTPException(422, { message: `Apprenants hors de la classe : ${horsClasse.join(", ")}` });
  const idsParNiveau = new Set(saisie.decisions.map((d) => d.apprenantId));
  if (idsParNiveau.size !== saisie.decisions.length) throw new HTTPException(422, { message: "Un même apprenant ne peut apparaître deux fois" });

  const divisions = new Map<string, Division[]>();
  const divisionsCrees: string[] = [];
  const nouvellesClasses: (typeof schema.classes.$inferInsert)[] = [];
  const faits = [] as NouveauFait[];
  faits.push({
    type: "CONSEIL_DE_CLASSE", auteurId: profil.id, etablissementId: id, apprenantId: null,
    donnees: { classeId, anneeScolaire: saisie.anneeScolaire, ...saisie.seance },
  });
  for (const d of saisie.decisions) {
    const versNiveau: Niveau = d.decision === "admis" ? niveauSuivant! : (classe.niveau as Niveau);
    if (!divisions.has(versNiveau)) divisions.set(versNiveau, await divisionsAccueil(id, versNiveau, saisie.anneeScolaire));
    const pool = divisions.get(versNiveau)!;
    // Place disponible = capacite - effectif courant ; sinon on ouvre une nouvelle division.
    let cible = pool.filter((x) => x.effectif < x.capacite).sort((a, b) => (b.capacite - b.effectif) - (a.capacite - a.effectif))[0];
    if (!cible) {
      const nouvelle = `CLS-${randomUUID()}`;
      // Créée dans la transaction du registre (plus bas) : un échec ne laisse aucune classe orpheline.
      nouvellesClasses.push({ id: nouvelle, etablissementId: id, niveau: versNiveau, libelle: `${versNiveau} — ${saisie.anneeScolaire}`, anneeScolaire: saisie.anneeScolaire, capacite: saisie.capaciteNouvelleDivision, enseignantPrincipalId: null });
      cible = { id: nouvelle, capacite: saisie.capaciteNouvelleDivision, effectif: 0 };
      pool.push(cible);
      divisionsCrees.push(nouvelle);
    }
    cible.effectif += 1;
    faits.push({ type: "PASSAGE", auteurId: profil.id, etablissementId: id, apprenantId: d.apprenantId, donnees: { apprenantId: d.apprenantId, deNiveau: classe.niveau, versNiveau, decision: d.decision, anneeScolaire: saisie.anneeScolaire } });
    faits.push({ type: "REPRISE", auteurId: profil.id, etablissementId: id, apprenantId: d.apprenantId, donnees: { apprenantId: d.apprenantId, classeId: cible.id, anneeScolaire: saisie.anneeScolaire } });
  }
  // Deux soumissions simultanées (deux onglets, un rejeu réseau) : verrou sur la classe, puis on relit DANS la
  // transaction que chaque apprenant y est encore. Sinon : deux séances, deux passages par élève, deux divisions.
  const ids = saisie.decisions.map((d) => d.apprenantId);
  await inscrireAuRegistre(faits, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`conseil:${classeId}`}))`);
    const [{ n } = { n: 0 }] = (await tx.execute(sql`select count(*)::int n from core.scolarites where classe_id = ${classeId} and apprenant_id in ${ids}`)) as unknown as { n: number }[];
    if (n !== ids.length) throw new HTTPException(409, { message: "Ce conseil vient d'être enregistré : la classe a déjà changé" });
    if (nouvellesClasses.length) await tx.insert(schema.classes).values(nouvellesClasses);
  });
  const admis = admisses.length, maintenus = saisie.decisions.length - admis;
  await journaliser(profil, "Conseil de passage", `${classeId} (${classe.libelle}) · séance du ${saisie.seance.dateSeance}, ${saisie.seance.membres.length} membre(s) · ${admis} admis, ${maintenus} maintenus`, "gestion", true, null);
  return c.json({ classeId, anneeScolaire: saisie.anneeScolaire, dateSeance: saisie.seance.dateSeance, nombreDeMembres: saisie.seance.membres.length, admis, maintenus, divisionsCrees }, 201);
});

/* ------------------------------------------------------------------ Transitions */

async function chefDeLApprenant(c: Context<{ Variables: Variables }>, apprenantId: string) {
  const profil = c.get("profil");
  const [sco] = await base().select().from(schema.scolarites).where(eq(schema.scolarites.apprenantId, apprenantId));
  const chef = !!sco?.etablissementId && profil.habilitations.some((h) => h.role === "chef_etablissement" && h.perimetre.niveau === "etablissement" && h.perimetre.etablissementId === sco.etablissementId);
  if (!chef || sco?.statut !== "scolarise") {
    await journaliser(profil, "Transition d'un apprenant", apprenantId, "gestion", false, "perimetre");
    refuser("Seul le chef de l'établissement où l'apprenant est scolarisé peut enregistrer cette transition");
  }
  return { profil, sco: sco! };
}

etablissement.post("/apprenants/:id/transfert", authentifie, async (c) => {
  const apprenantId = z.string().regex(/^APP-\d{6}$/).parse(c.req.param("id"));
  const { versClasseId } = await corps(c, z.object({ versClasseId: z.string().regex(/^CLS-[A-Za-z0-9-]+$/) }).strict());
  const { profil, sco } = await chefDeLApprenant(c, apprenantId);
  const [classe] = await base().select().from(schema.classes).where(eq(schema.classes.id, versClasseId));
  if (!classe || classe.etablissementId === sco.etablissementId) throw new HTTPException(422, { message: "Classe d'accueil invalide (autre établissement requis)" });
  const [id] = await inscrireAuRegistre([{ type: "TRANSFERT", auteurId: profil.id, etablissementId: classe.etablissementId, apprenantId, donnees: { apprenantId, deEtablissementId: sco.etablissementId, versEtablissementId: classe.etablissementId, versClasseId, anneeScolaire: classe.anneeScolaire } }]);
  await journaliser(profil, "Transfert d'un apprenant", `${apprenantId} → ${versClasseId}`, "gestion", true, null);
  return c.json({ enregistre: id }, 201);
});

etablissement.post("/apprenants/:id/abandon", authentifie, async (c) => {
  const apprenantId = z.string().regex(/^APP-\d{6}$/).parse(c.req.param("id"));
  const { motif } = await corps(c, z.object({ motif: z.string().trim().min(5).max(200) }).strict());
  const { profil, sco } = await chefDeLApprenant(c, apprenantId);
  const [classe] = await base().select().from(schema.classes).where(eq(schema.classes.id, sco.classeId!));
  const [id] = await inscrireAuRegistre([{ type: "ABANDON", auteurId: profil.id, etablissementId: sco.etablissementId, apprenantId, donnees: { apprenantId, anneeScolaire: classe?.anneeScolaire ?? "", motif } }]);
  await journaliser(profil, "Déclaration d'abandon", apprenantId, "gestion", true, null);
  return c.json({ enregistre: id }, 201);
});

/* ------------------------------------------------------------------ Justificatifs d'absence (famille → établissement) */

interface DonneesJustification { apprenantId?: string | null; absenceIds?: string[]; dates?: string[]; motif?: string; classeId?: string | null; declarantNpi?: string | null }

/**
 * Justificatifs transmis par les familles pour l'établissement, avec leur état : en attente, validé ou refusé.
 * Le registre est en ajout seul — un justificatif reste visible après décision, la décision le référence.
 * Lecture : le chef (gestion) et l'inspecteur de la circonscription (contrôle).
 */
etablissement.get("/etablissements/:id/justificatifs", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil, finalite } = await acces(c, id);
  const [justifs, decisions] = await Promise.all([
    base().select({ id: schema.evenements.id, apprenantId: schema.evenements.apprenantId, survenuLe: schema.evenements.survenuLe, donnees: schema.evenements.donnees })
      .from(schema.evenements)
      .where(and(eq(schema.evenements.type, "JUSTIFICATION_ABSENCE"), eq(schema.evenements.etablissementId, id)))
      .orderBy(desc(schema.evenements.survenuLe)),
    base().select({ survenuLe: schema.evenements.survenuLe, donnees: schema.evenements.donnees })
      .from(schema.evenements)
      .where(and(eq(schema.evenements.type, "DECISION_JUSTIFICATION"), eq(schema.evenements.etablissementId, id))),
  ]);
  // Dernière décision par justificatif (ajout seul : la plus récente l'emporte).
  const parJustif = new Map<string, { decision: "validee" | "refusee"; motif: string | null; le: Date }>();
  for (const x of decisions) {
    const d = x.donnees as { justificationId?: string; decision?: "validee" | "refusee"; motif?: string | null };
    if (!d.justificationId) continue;
    const avant = parJustif.get(d.justificationId);
    if (!avant || avant.le <= x.survenuLe) parJustif.set(d.justificationId, { decision: d.decision ?? "validee", motif: d.motif ?? null, le: x.survenuLe });
  }
  const apprenantIds = [...new Set(justifs.map((j) => j.apprenantId).filter((x): x is string => !!x))];
  const noms = apprenantIds.length
    ? await base().select({ id: schema.apprenants.id, nom: schema.apprenants.nom, prenoms: schema.apprenants.prenoms }).from(schema.apprenants).where(inArray(schema.apprenants.id, apprenantIds))
    : [];
  const nomDe = new Map(noms.map((n) => [n.id, `${n.prenoms} ${n.nom}`]));
  await journaliser(profil, "Consultation des justificatifs d'absence", id, finalite, true, null);
  return c.json({
    enAttente: justifs.filter((j) => !parJustif.has(j.id)).length,
    peutStatuer: finalite === "gestion",
    justificatifs: justifs.map((j) => {
      const d = j.donnees as DonneesJustification;
      const dec = parJustif.get(j.id) ?? null;
      return {
        id: j.id,
        apprenantId: j.apprenantId,
        nom: j.apprenantId ? nomDe.get(j.apprenantId) ?? null : null,
        dates: d.dates ?? [],
        absenceIds: d.absenceIds ?? [],
        motif: d.motif ?? "",
        classeId: d.classeId ?? null,
        // NPI du parent déclarant masqué : la direction sait qu'un responsable a déclaré, sans son identifiant.
        declarantNpi: d.declarantNpi ? `••••••${d.declarantNpi.slice(-4)}` : null,
        transmisLe: j.survenuLe,
        statut: dec ? dec.decision : ("en_attente" as const),
        decisionMotif: dec?.motif ?? null,
        decideLe: dec?.le ?? null,
      };
    }),
  });
});

/**
 * Décision du chef d'établissement sur un justificatif : validation ou refus motivé.
 * Ajout seul au registre (DECISION_JUSTIFICATION référence le justificatif d'origine, jamais modifié).
 * Une seule décision par justificatif ; la famille est notifiée.
 */
etablissement.post("/etablissements/:id/justificatifs/:justificationId/decision", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil } = await acces(c, id, true);
  const justificationId = z.string().regex(/^EVT-[A-Za-z0-9-]+$/).parse(c.req.param("justificationId"));
  const saisie = await corps(c, z.object({
    decision: z.enum(["validee", "refusee"]),
    motif: z.string().trim().max(200).optional(),
  }).strict().refine((s) => s.decision === "validee" || (s.motif ?? "").length >= 5, "Un motif d'au moins 5 caractères est requis pour refuser un justificatif"));

  const [justif] = await base().select().from(schema.evenements)
    .where(and(eq(schema.evenements.id, justificationId), eq(schema.evenements.type, "JUSTIFICATION_ABSENCE"), eq(schema.evenements.etablissementId, id)));
  if (!justif) {
    await journaliser(profil, "Décision sur un justificatif d'absence", justificationId, "gestion", false, "perimetre");
    throw new HTTPException(404, { message: "Justificatif introuvable dans votre établissement" });
  }
  const [deja] = await base().select({ id: schema.evenements.id }).from(schema.evenements)
    .where(and(eq(schema.evenements.type, "DECISION_JUSTIFICATION"), sql`${schema.evenements.donnees}->>'justificationId' = ${justificationId}`)).limit(1);
  if (deja) throw new HTTPException(409, { message: "Ce justificatif a déjà fait l'objet d'une décision" });

  const d = justif.donnees as DonneesJustification;
  const absenceIds = d.absenceIds ?? [];
  const [eid] = await inscrireAuRegistre([{
    type: "DECISION_JUSTIFICATION", auteurId: profil.id, etablissementId: id, apprenantId: justif.apprenantId,
    donnees: { apprenantId: d.apprenantId ?? justif.apprenantId, justificationId, absenceIds, decision: saisie.decision, motif: saisie.motif ?? null },
  }]);
  await journaliser(profil, saisie.decision === "validee" ? "Justificatif d'absence validé" : "Justificatif d'absence refusé", `${justificationId} (${absenceIds.length} absence(s))`, "gestion", true, null);
  return c.json({ enregistre: eid, decision: saisie.decision }, 201);
});

/* ------------------------------------------------------------------ Examens nationaux (lecture seule) */

/**
 * Examens nationaux, côté établissement : LECTURE SEULE. Un établissement ne délibère jamais un examen
 * national (DEC du MEMP pour le CEP, DEC du MESTFP pour le BEPC et pour le BAC) et
 * ne délivre aucun diplôme national. Il voit ses candidats (numéro de table, centre) et, une fois la
 * session publiée par l'autorité, le verdict officiel et le diplôme délivré en son nom.
 */
etablissement.get("/etablissements/:id/examens", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil, finalite } = await acces(c, id);
  const eleves = sql`(select apprenant_id from core.scolarites where etablissement_id = ${id})`;
  const [candidatures, diplomes] = await Promise.all([
    base().select({
      sessionId: schema.examensSessions.id, examen: schema.examensSessions.examen, session: schema.examensSessions.session,
      statut: schema.examensSessions.statut, publieeLe: schema.examensSessions.publieeLe,
      numeroTable: schema.examensCandidatures.numeroTable, centre: schema.examensCentres.nom,
      apprenantId: schema.examensCandidatures.apprenantId, nom: sql<string>`${schema.apprenants.prenoms} || ' ' || ${schema.apprenants.nom}`,
      decision: schema.examensCandidatures.decision, moyenne: schema.examensCandidatures.moyenne, mention: schema.examensCandidatures.mention,
    }).from(schema.examensCandidatures)
      .innerJoin(schema.examensSessions, eq(schema.examensSessions.id, schema.examensCandidatures.sessionId))
      .innerJoin(schema.examensCentres, eq(schema.examensCentres.id, schema.examensCandidatures.centreId))
      .innerJoin(schema.apprenants, eq(schema.apprenants.id, schema.examensCandidatures.apprenantId))
      .where(sql`${schema.examensCandidatures.apprenantId} in ${eleves}`)
      .orderBy(sql`${schema.examensSessions.session} desc`, schema.examensCandidatures.numeroTable),
    // Diplômes délivrés aux apprenants passés par l'établissement (registre), y compris ceux qui l'ont quitté.
    base().select({ c: schema.certificats, titulaire: sql<string>`${schema.apprenants.prenoms} || ' ' || ${schema.apprenants.nom}` })
      .from(schema.certificats).innerJoin(schema.apprenants, eq(schema.apprenants.id, schema.certificats.apprenantId))
      .where(sql`${schema.certificats.apprenantId} in (select apprenant_id from ledger.evenements where etablissement_id = ${id} and type in ('INSCRIPTION', 'TRANSFERT', 'REPRISE'))`),
  ]);
  const diplomeDe = new Map(diplomes.map((d) => [`${d.c.apprenantId}|${d.c.examen}|${d.c.session}`, d.c.id]));
  const sessions = new Map<string, { sessionId: string; examen: string; session: string; statut: string; publieeLe: string | null; autorite: string; candidats: unknown[] }>();
  for (const l of candidatures) {
    const publiee = l.statut === "publiee";
    const autorite = l.examen === "CEP" || l.examen === "BEPC" || l.examen === "BAC" ? AUTORITE_EXAMEN[l.examen].libelle : "Autorité d'examen";
    const s = sessions.get(l.sessionId) ?? { sessionId: l.sessionId, examen: l.examen, session: l.session, statut: l.statut, publieeLe: l.publieeLe, autorite, candidats: [] as unknown[] };
    // Avant publication, le verdict n'existe pas pour l'établissement : il appartient à l'autorité.
    s.candidats.push({
      apprenantId: l.apprenantId, nom: l.nom, numeroTable: l.numeroTable, centre: l.centre,
      decision: publiee ? l.decision : null, mention: publiee ? l.mention : null, moyenne: publiee && l.moyenne !== null ? Number(l.moyenne) : null,
      certificatId: publiee ? diplomeDe.get(`${l.apprenantId}|${l.examen}|${l.session}`) ?? null : null,
    });
    sessions.set(l.sessionId, s);
  }
  await journaliser(profil, "Consultation des examens nationaux de l'établissement", id, finalite, true, null);
  return c.json({
    sessions: [...sessions.values()],
    diplomes: diplomes.map((x) => ({ ...x.c, titulaire: x.titulaire })).sort((x, y) => y.delivreLe.localeCompare(x.delivreLe)),
  });
});

/* ------------------------------------------------------------------ Accompagnement (moteur de workflow) */

/** Proposition d'accompagnement : une demande suit le circuit ACCOMPAGNEMENT ; aucune mesure sans décision humaine. */
etablissement.post("/etablissements/:id/accompagnement", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil } = await acces(c, id, true);
  const { apprenantIds, objet } = await corps(c, z.object({ apprenantIds: z.array(z.string().regex(/^APP-\d{6}$/)).min(1).max(80), objet: z.string().trim().min(5).max(200) }).strict());
  // Seuls des élèves scolarisés dans CET établissement peuvent faire l'objet d'une proposition.
  const [{ n } = { n: 0 }] = (await base().execute(sql`select count(distinct s.apprenant_id)::int n from core.scolarites s left join core.classes c on c.id = s.classe_id
    where s.apprenant_id in ${[...new Set(apprenantIds)]} and coalesce(s.etablissement_id, c.etablissement_id) = ${id}`)) as unknown as { n: number }[];
  if (n !== new Set(apprenantIds).size) throw new HTTPException(422, { message: "Certains apprenants ne sont pas scolarisés dans cet établissement" });
  // Circuit paramétrable : l'étape de validation pédagogique relève de l'inspecteur de la circonscription
  // (rôle réel du référentiel). Upsert auto-correcteur : une base déjà peuplée avec un rôle obsolète est réparée.
  const etapesAccompagnement = [{ ordre: 1, code: "PROPOSITION", role: "chef_etablissement", delaiJours: 0 }, { ordre: 2, code: "VALIDATION_CONSEIL", role: "inspecteur", delaiJours: 7 }, { ordre: 3, code: "INFORMATION_FAMILLES", role: "chef_etablissement", delaiJours: 3 }];
  await base().insert(schema.modelesCircuit).values({ code: "ACCOMPAGNEMENT", libelle: "Accompagnement pédagogique", version: "1.1", etapes: etapesAccompagnement })
    .onConflictDoUpdate({ target: schema.modelesCircuit.code, set: { etapes: etapesAccompagnement, version: "1.1" } });
  const demandeId = `DEM-${randomUUID()}`;
  await base().insert(schema.demandes).values({ id: demandeId, modele: "ACCOMPAGNEMENT", objet: `${objet} (${apprenantIds.length} apprenants)`, demandeurId: profil.id, ressource: id, etapeCourante: "VALIDATION_CONSEIL", statut: "en_cours", echeance: new Date(Date.now() + 7 * 86_400_000) });
  await base().insert(schema.decisions).values({ id: `DEC-${randomUUID()}`, demandeId, etape: "PROPOSITION", auteurId: profil.id, decision: "valide", motif: apprenantIds.join(",") });
  await journaliser(profil, "Proposition d'accompagnement", `${demandeId} · ${apprenantIds.length} apprenants`, "gestion", true, null);
  return c.json({ demandeId, etape: "VALIDATION_CONSEIL" }, 201);
});

etablissement.get("/etablissements/:id/demandes", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  await acces(c, id);
  return c.json(await base().select().from(schema.demandes).where(eq(schema.demandes.ressource, id)));
});

/* ------------------------------------------------------------------ Moteur de circuits : statuer sur une demande */

/** Une habilitation couvre-t-elle cet établissement ? (national > département > circonscription > établissement) */
function couvreEtab(h: Habilitation, etab: { id: string; communeId: string; circonscription: string }) {
  const p = h.perimetre;
  if (p.niveau === "national") return true;
  if (p.niveau === "departement") return communeById.get(etab.communeId)?.departementId === p.departementId;
  if (p.niveau === "circonscription") return p.circonscription === etab.circonscription;
  if (p.niveau === "etablissement") return p.etablissementId === etab.id;
  return false;
}

type EtapeCircuit = { ordre: number; code: string; role: string; delaiJours: number };

/**
 * Effet métier d'une affectation acceptée au terme du circuit AFFECTATION : l'enseignant change
 * d'établissement, son affectation précédente est close (date de fin), une affectation datée est ouverte,
 * et le fait AFFECTATION_ENSEIGNANT est inscrit au registre. L'enseignant est libéré de tout rôle de
 * professeur principal dans son ancien établissement (la classe ne reste pas sans référent).
 */
async function appliquerAffectation(profil: import("@beile/contracts").Profil, enseignantId: string, versEtablissementId: string, fonction: string) {
  const [ens] = await base().select().from(schema.enseignants).where(eq(schema.enseignants.id, enseignantId));
  if (!ens || ens.etablissementId === versEtablissementId) return;
  const du = aujourdhui();
  await base().update(schema.affectations).set({ valideAu: du }).where(and(eq(schema.affectations.enseignantId, enseignantId), isNull(schema.affectations.valideAu)));
  await base().insert(schema.affectations).values({ id: `AFF-${randomUUID()}`, enseignantId, etablissementId: versEtablissementId, fonction });
  await base().update(schema.enseignants).set({ etablissementId: versEtablissementId }).where(eq(schema.enseignants.id, enseignantId));
  await base().update(schema.classes).set({ enseignantPrincipalId: null })
    .where(and(eq(schema.classes.enseignantPrincipalId, enseignantId), eq(schema.classes.etablissementId, ens.etablissementId)));
  // Les enseignements dans l'ancien établissement prennent fin : sinon l'enseignant muté continuerait de lire
  // les carnets et de saisir notes et absences dans des classes qui ne sont plus les siennes.
  await base().execute(sql`delete from core.enseignements e using core.classes c
    where c.id = e.classe_id and e.enseignant_id = ${enseignantId} and c.etablissement_id = ${ens.etablissementId}`);
  // Habilitation « enseignant » : elle suit l'affectation (nouvel établissement).
  if (ens.npi) {
    const [p] = await base().select().from(schema.profils).where(eq(schema.profils.npi, ens.npi));
    if (p) {
      const habs = (p.habilitations as { role: string; perimetre: { niveau: string; etablissementId?: string } }[]).map((h) =>
        h.role === "enseignant" && h.perimetre.niveau === "etablissement" && h.perimetre.etablissementId === ens.etablissementId ? { ...h, perimetre: { niveau: "etablissement", etablissementId: versEtablissementId } } : h);
      await base().update(schema.profils).set({ habilitations: habs }).where(eq(schema.profils.id, p.id));
      const [cpt] = await base().select({ id: schema.comptes.id }).from(schema.comptes).where(eq(schema.comptes.profilId, p.id));
      if (cpt) await revoquerSessionsDuCompte(cpt.id);
    }
  }
  await inscrireAuRegistre([{ type: "AFFECTATION_ENSEIGNANT", auteurId: profil.id, apprenantId: null, enseignantId, etablissementId: versEtablissementId, donnees: { enseignantId, versEtablissementId } }]);
}

/**
 * Demande d'affectation d'un enseignant (mouvement inter-établissements). L'initiative et l'expression
 * du besoin relèvent de la direction départementale dont le département couvre l'établissement d'accueil ;
 * le circuit AFFECTATION se poursuit ensuite (proposition de l'administration centrale, prise de fonction
 * par le chef de l'établissement d'accueil). Le mouvement n'est effectif qu'à l'acceptation du circuit.
 */
etablissement.post("/enseignants/:id/affectation", authentifie, async (c) => {
  const enseignantId = z.string().regex(/^ENS-[A-Za-z0-9-]+$/).parse(c.req.param("id"));
  const profil = c.get("profil");
  const { versEtablissementId, fonction } = await corps(c, z.object({
    versEtablissementId: ID_ETAB,
    fonction: z.string().trim().min(3).max(80).default("Enseignant"),
  }).strict());
  if (!profil.habilitations.some((h) => h.role === "direction_departementale" && h.perimetre.niveau === "departement")) {
    await journaliser(profil, "Demande d'affectation d'un enseignant", enseignantId, "gestion", false, "role");
    refuser("Seule une direction départementale peut demander une affectation");
  }
  const [ens] = await base().select().from(schema.enseignants).where(eq(schema.enseignants.id, enseignantId));
  if (!ens) throw new HTTPException(404, { message: "Enseignant inconnu" });
  const [dest] = await base().select({ id: schema.etablissements.id, nom: schema.etablissements.nom, communeId: schema.etablissements.communeId, circonscription: schema.etablissements.circonscription })
    .from(schema.etablissements).where(eq(schema.etablissements.id, versEtablissementId));
  if (!dest) throw new HTTPException(422, { message: "Établissement d'accueil inconnu" });
  if (dest.id === ens.etablissementId) throw new HTTPException(422, { message: "L'enseignant exerce déjà dans cet établissement" });
  const hab = profil.habilitations.find((h) => h.role === "direction_departementale" && h.perimetre.niveau === "departement" && couvreEtab(h, dest));
  if (!hab) {
    await journaliser(profil, "Demande d'affectation d'un enseignant", `${enseignantId} → ${dest.id}`, "gestion", false, "perimetre");
    refuser("Seule la direction départementale compétente pour l'établissement d'accueil peut demander une affectation");
  }
  const etapesAffectation: EtapeCircuit[] = [{ ordre: 1, code: "BESOIN", role: "direction_departementale", delaiJours: 0 }, { ordre: 2, code: "PROPOSITION", role: "administration_centrale", delaiJours: 15 }, { ordre: 3, code: "PRISE_FONCTION", role: "chef_etablissement", delaiJours: 30 }];
  await base().insert(schema.modelesCircuit).values({ code: "AFFECTATION", libelle: "Affectation d'un enseignant", version: "1.0", etapes: etapesAffectation }).onConflictDoNothing();
  const demandeId = `DEM-${randomUUID()}`;
  await base().insert(schema.demandes).values({ id: demandeId, modele: "AFFECTATION", objet: `Affectation de ${ens.prenoms} ${ens.nom} → ${dest.nom}`, demandeurId: profil.id, ressource: dest.id, donnees: { enseignantId, versEtablissementId: dest.id, fonction }, etapeCourante: "PROPOSITION", statut: "en_cours", echeance: new Date(Date.now() + 15 * 86_400_000) });
  await base().insert(schema.decisions).values({ id: `DEC-${randomUUID()}`, demandeId, etape: "BESOIN", auteurId: profil.id, decision: "valide", motif: "Expression du besoin par la direction départementale" });
  await journaliser(profil, "Demande d'affectation d'un enseignant", `${enseignantId} → ${dest.id}`, "gestion", true, null);
  return c.json({ demandeId, enseignantId, versEtablissementId: dest.id, fonction, etapeCourante: "PROPOSITION", statut: "en_cours" }, 201);
});

/**
 * Demandes à traiter par l'utilisateur courant, tous circuits confondus : celles dont l'étape courante relève
 * d'un rôle qu'il porte, dans le périmètre de l'établissement ressource. C'est la file d'attente de l'administration
 * déléguée — chaque niveau (chef, inspecteur, direction) ne voit que ce qu'il peut réellement faire avancer.
 */
etablissement.get("/demandes/a-traiter", authentifie, async (c) => {
  const profil = c.get("profil");
  const modeles = await base().select().from(schema.modelesCircuit);
  const etapesParModele = new Map(modeles.map((m) => [m.code, [...(m.etapes as EtapeCircuit[])].sort((a, b) => a.ordre - b.ordre)]));
  const roles = new Set<string>(profil.habilitations.map((h) => h.role));
  const ouvertes = await base()
    .select({ d: schema.demandes, nom: schema.etablissements.nom, communeId: schema.etablissements.communeId, circonscription: schema.etablissements.circonscription })
    .from(schema.demandes)
    .leftJoin(schema.etablissements, eq(schema.etablissements.id, schema.demandes.ressource))
    .where(inArray(schema.demandes.statut, ["ouverte", "en_cours"]));
  const lignes = ouvertes.flatMap((l) => {
    const etape = etapesParModele.get(l.d.modele)?.find((e) => e.code === l.d.etapeCourante);
    if (!etape || !roles.has(etape.role)) return [];
    const hab = profil.habilitations.find((h) => h.role === etape.role);
    if (!hab) return [];
    const couvert = l.d.ressource && l.nom && l.communeId && l.circonscription
      ? couvreEtab(hab, { id: l.d.ressource, communeId: l.communeId, circonscription: l.circonscription })
      : hab.perimetre.niveau === "national";
    if (!couvert) return [];
    return [{ ...l.d, etablissement: l.nom ?? null, modeleLibelle: modeles.find((m) => m.code === l.d.modele)?.libelle ?? l.d.modele, etapeRole: etape.role }];
  }).sort((a, b) => b.creeeLe.getTime() - a.creeeLe.getTime());
  await journaliser(profil, "Consultation des demandes à traiter", `${lignes.length} demande(s)`, "gestion", true, null);
  return c.json(lignes);
});

/** Contexte d'une demande : modèle, étape courante, établissement ressource, et droit d'agir de l'utilisateur. */
async function contexteDemande(profil: import("@beile/contracts").Profil, demandeId: string) {
  const [demande] = await base().select().from(schema.demandes).where(eq(schema.demandes.id, demandeId));
  if (!demande) throw new HTTPException(404, { message: "Demande introuvable" });
  const [modele] = await base().select().from(schema.modelesCircuit).where(eq(schema.modelesCircuit.code, demande.modele));
  if (!modele) throw new HTTPException(404, { message: "Modèle de circuit introuvable" });
  const etapes = [...(modele.etapes as EtapeCircuit[])].sort((a, b) => a.ordre - b.ordre);
  const etape = etapes.find((e) => e.code === demande.etapeCourante) ?? null;
  const [etab] = demande.ressource
    ? await base().select({ id: schema.etablissements.id, communeId: schema.etablissements.communeId, circonscription: schema.etablissements.circonscription, nom: schema.etablissements.nom }).from(schema.etablissements).where(eq(schema.etablissements.id, demande.ressource))
    : [];
  const hab = etape ? profil.habilitations.find((h) => h.role === etape.role && (!etab || couvreEtab(h, etab))) : undefined;
  return { demande, modele, etapes, etape, etab: etab ?? null, peutStatuer: !!hab && ["ouverte", "en_cours"].includes(demande.statut) };
}

/**
 * Lecture d'une demande : son auteur, ou un porteur du rôle de l'une de ses étapes dans le périmètre
 * concerné (l'établissement ressource, ou le périmètre national si la demande n'en a pas). Personne
 * d'autre — une demande peut contenir des données personnelles (exercice des droits, affectation).
 */
function peutLireDemande(profil: import("@beile/contracts").Profil, ctx: Awaited<ReturnType<typeof contexteDemande>>) {
  if (ctx.demande.demandeurId === profil.id) return true;
  return ctx.etapes.some((e) => profil.habilitations.some((h) => h.role === e.role && (ctx.etab ? couvreEtab(h, ctx.etab) : h.perimetre.niveau === "national")));
}

/** Détail d'une demande : circuit, décisions déjà rendues (ajout seul), et droit d'agir de l'utilisateur. */
etablissement.get("/demandes/:id", authentifie, async (c) => {
  const profil = c.get("profil");
  const demandeId = z.string().regex(/^DEM-[A-Za-z0-9-]+$/).parse(c.req.param("id"));
  const ctx = await contexteDemande(profil, demandeId);
  if (!peutLireDemande(profil, ctx)) {
    await journaliser(profil, "Consultation d'une demande", demandeId, "gestion", false, "relation");
    refuser("Cette demande ne vous concerne pas : consultation refusée et journalisée");
  }
  await journaliser(profil, "Consultation d'une demande", demandeId, "gestion", true, null);
  const decisions = await base().select().from(schema.decisions).where(eq(schema.decisions.demandeId, demandeId));
  const [demandeur] = await base().select({ id: schema.profils.id, nomAffiche: schema.profils.nomAffiche }).from(schema.profils).where(eq(schema.profils.id, ctx.demande.demandeurId));
  return c.json({
    demande: { ...ctx.demande, demandeur: demandeur?.nomAffiche ?? null, etablissement: ctx.etab?.nom ?? null },
    modele: { code: ctx.modele.code, libelle: ctx.modele.libelle, etapes: ctx.etapes },
    etapeCourante: ctx.etape,
    peutStatuer: ctx.peutStatuer,
    decisions: decisions.sort((a, b) => a.horodatage.getTime() - b.horodatage.getTime()),
  });
});

/**
 * Statuer sur l'étape courante d'une demande : valide (avance), refuse (clôture), renvoye (retour à la première étape).
 * Réservé au rôle attendu par l'étape, dans le périmètre de l'établissement ressource. La décision est ajoutée
 * au registre workflow (ajout seul) et le demandeur est notifié. Aucun circuit n'est codé en dur.
 */
etablissement.post("/demandes/:id/decision", authentifie, async (c) => {
  const profil = c.get("profil");
  const demandeId = z.string().regex(/^DEM-[A-Za-z0-9-]+$/).parse(c.req.param("id"));
  const saisie = await corps(c, z.object({
    decision: z.enum(["valide", "refuse", "renvoye"]),
    motif: z.string().trim().max(500).optional(),
  }).strict().refine((s) => s.decision === "valide" || (s.motif ?? "").length >= 5, "Un motif d'au moins 5 caractères est requis pour refuser ou renvoyer"));

  const ctx = await contexteDemande(profil, demandeId);
  // Exercice des droits : la réponse à la personne est toujours motivée, et un renvoi n'a pas de sens
  // (la première étape est le dépôt par la personne elle-même, qu'aucune file ne présente).
  if (ctx.modele.code === "DROITS") {
    if (saisie.decision === "renvoye") throw new HTTPException(422, { message: "Une demande d'exercice des droits ne se renvoie pas : répondez, ou refusez en motivant." });
    if ((saisie.motif ?? "").length < 10) throw new HTTPException(422, { message: "La réponse adressée à la personne est obligatoire (10 caractères au moins)." });
  }
  if (!ctx.etape) throw new HTTPException(409, { message: "Étape courante incohérente avec le modèle de circuit" });
  if (!["ouverte", "en_cours"].includes(ctx.demande.statut)) throw new HTTPException(409, { message: "Cette demande est déjà close" });
  if (!ctx.peutStatuer) {
    await journaliser(profil, "Décision sur une demande", `${demandeId} · ${ctx.etape.code}`, "gestion", false, "role");
    refuser(`Cette étape relève du rôle « ${ctx.etape.role} » dans le périmètre concerné : décision refusée et journalisée`);
  }

  const idx = ctx.etapes.findIndex((e) => e.code === ctx.demande.etapeCourante);
  const suivante = idx >= 0 ? ctx.etapes[idx + 1] : undefined;
  let statut = ctx.demande.statut;
  let etape = ctx.demande.etapeCourante;
  if (saisie.decision === "refuse") statut = "refusee";
  else if (saisie.decision === "renvoye") { etape = ctx.etapes[0]!.code; statut = "en_cours"; }
  else if (suivante) etape = suivante.code;
  else statut = "acceptee";

  await base().insert(schema.decisions).values({ id: `DEC-${randomUUID()}`, demandeId, etape: ctx.etape.code, auteurId: profil.id, decision: saisie.decision, motif: saisie.motif ?? null });
  await base().update(schema.demandes).set({ etapeCourante: etape, statut }).where(eq(schema.demandes.id, demandeId));

  // Effet métier : la direction de l'établissement atteste la remontée — la relance de transmission aboutit
  // et ne sera pas rejouée (l'établissement est désormais marqué comme ayant transmis).
  if (ctx.modele.code === "RELANCE_TRANSMISSION" && saisie.decision === "valide" && ctx.etab) {
    await base().update(schema.etablissements).set({ transmis: true }).where(eq(schema.etablissements.id, ctx.etab.id));
  }

  // Effet métier : le circuit d'affectation arrive au terme de la prise de fonction → le mouvement devient effectif.
  if (ctx.modele.code === "AFFECTATION" && saisie.decision === "valide" && statut === "acceptee") {
    const d = ctx.demande.donnees as { enseignantId?: string; versEtablissementId?: string; fonction?: string } | null;
    if (d?.enseignantId && d?.versEtablissementId) await appliquerAffectation(profil, d.enseignantId, d.versEtablissementId, d.fonction ?? "Enseignant");
  }

  // Notification du demandeur (ajout seul, hors registre pédagogique) — jamais bloquante.
  const [demandeur] = await base().select({ npi: schema.profils.npi, nomAffiche: schema.profils.nomAffiche }).from(schema.profils).where(eq(schema.profils.id, ctx.demande.demandeurId));
  if (demandeur?.npi) {
    const verbe = saisie.decision === "valide" ? (statut === "acceptee" ? "acceptée" : `validée — étape suivante : ${etape}`) : saisie.decision === "refuse" ? "refusée" : `renvoyée — étape : ${etape}`;
    await base().insert(schema.notifications).values({
      id: `NOT-${randomUUID()}`, destinataireNpi: demandeur.npi, evenementId: null,
      titre: ctx.modele.code === "DROITS" ? (saisie.decision === "refuse" ? "Votre demande sur vos données : refus motivé" : "Réponse à votre demande sur vos données")
        : `Demande ${verbe.startsWith("acceptée") || verbe.startsWith("validée") ? "validée" : saisie.decision === "refuse" ? "refusée" : "renvoyée"}`,
      texte: `« ${ctx.demande.objet} » : ${verbe}.${saisie.motif ? ` Motif : ${saisie.motif}.` : ""}`,
    }).catch((e) => console.error("Notification demande :", e));
  }

  await journaliser(profil, "Décision sur une demande", `${demandeId} · ${ctx.etape.code} → ${saisie.decision}`, "gestion", true, null);
  return c.json({ demandeId, decision: saisie.decision, etape, statut }, 200);
});

