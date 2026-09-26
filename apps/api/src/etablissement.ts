import { randomUUID } from "node:crypto";
import { NIVEAUX, type Certificat, type Habilitation, type Niveau } from "@beile/contracts";
import { schema } from "@beile/db";
import { empreinteCertificat } from "@beile/simulation/micro";
import { aujourdhui } from "@beile/simulation/scolarite";
import { communeById } from "@beile/simulation/territoire";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authentifie, base, comparerFr, corps, journaliser, refuser, type Variables } from "./commun";
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
  const [classes, eleves, enseignants, formes, absentsDuJour] = await Promise.all([
    base().select().from(schema.classes).where(eq(schema.classes.etablissementId, id)),
    scolarisesEtablissement(id),
    base().select({ id: schema.enseignants.id, nom: schema.enseignants.nom, prenoms: schema.enseignants.prenoms }).from(schema.enseignants).where(eq(schema.enseignants.etablissementId, id)),
    base().selectDistinct({ id: schema.evenements.enseignantId }).from(schema.evenements)
      .where(and(eq(schema.evenements.type, "FORMATION_ENSEIGNANT"), eq(schema.evenements.etablissementId, id), sql`${schema.evenements.donnees}->>'formation' like ${FORMATION_OBLIGATOIRE + "%"}`)),
    base().select({ id: schema.evenements.id, apprenantId: schema.evenements.apprenantId, classeId: sql<string>`${schema.evenements.donnees}->>'classeId'`, enregistreLe: schema.evenements.survenuLe })
      .from(schema.evenements)
      .where(and(eq(schema.evenements.type, "ABSENCE"), eq(schema.evenements.etablissementId, id), sql`${schema.evenements.donnees}->>'date' = ${jour}`)),
  ]);
  const b = await bilans(eleves.map((e) => e.id), TRIMESTRE_COURANT);
  const nom = new Map(eleves.map((a) => [a.id, `${a.prenoms} ${a.nom}`]));
  const formesIds = new Set(formes.map((f) => f.id));
  const lignesClasses = classes.map((cl) => {
    const membres = eleves.filter((e) => e.classeId === cl.id);
    const principal = enseignants.find((e) => e.id === cl.enseignantPrincipalId);
    return {
      id: cl.id, libelle: cl.libelle, niveau: cl.niveau, capacite: cl.capacite, effectif: membres.length,
      moyenne: moyenneDe(membres.map((m) => b.get(m.id)?.moyenneTrimestre ?? null)),
      absentsDuJour: absentsDuJour.filter((x) => x.classeId === cl.id).length,
      professeurPrincipal: principal ? `${principal.prenoms} ${principal.nom}` : null,
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
 * l'admission au niveau supérieur ou le maintien. Le registre reçoit un fait PASSAGE (décision datée) puis
 * un fait REPRISE qui réinscrit l'élève dans sa division de l'année suivante — projection à jour, familles
 * notifiées. Les divisions de l'année cible sont créées au besoin ; la capacité d'une division existante est
 * respectée (on ouvre une nouvelle division plutôt que de la saturer). Le niveau terminal (Tle) sort par la
 * certification des examens nationaux, non par le conseil : la promotion collective s'y arrête.
 */
etablissement.post("/etablissements/:id/classes/:classeId/conseil-passage", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const classeId = z.string().regex(/^CLS-[A-Za-z0-9-]+$/).parse(c.req.param("classeId"));
  const { profil } = await acces(c, id, true);
  const saisie = await corps(c, z.object({
    anneeScolaire: z.string().regex(/^\d{4}-\d{4}$/, "format attendu : AAAA-AAAA"),
    capaciteNouvelleDivision: z.coerce.number().int().min(1).max(2000).default(60),
    decisions: z.array(z.object({
      apprenantId: z.string().regex(/^APP-\d{6}$/),
      decision: z.enum(["admis", "redouble"]),
    }).strict()).min(1).max(80),
  }).strict());
  const [classe] = await base().select().from(schema.classes).where(eq(schema.classes.id, classeId));
  if (!classe || classe.etablissementId !== id) throw new HTTPException(404, { message: "Classe inconnue ou hors de votre établissement" });
  if (saisie.anneeScolaire === classe.anneeScolaire) throw new HTTPException(422, { message: "L'année cible doit différer de l'année en cours" });
  const idxNiveau = NIVEAUX.indexOf(classe.niveau as Niveau);
  if (idxNiveau < 0) throw new HTTPException(422, { message: "Niveau de classe non reconnu dans le référentiel national" });
  const niveauSuivant = NIVEAUX[idxNiveau + 1] as Niveau | undefined;
  const admisses = saisie.decisions.filter((d) => d.decision === "admis");
  if (admisses.length && !niveauSuivant) throw new HTTPException(422, { message: `« ${classe.niveau} » est le niveau terminal : la sortie des admis relève de la certification des examens nationaux, pas du conseil de passage` });

  // Les apprenants doivent être scolarisés dans cette classe.
  const courantes = await classesCourantes(saisie.decisions.map((d) => d.apprenantId));
  const horsClasse = saisie.decisions.filter((d) => courantes.get(d.apprenantId) !== classeId).map((d) => d.apprenantId);
  if (horsClasse.length) throw new HTTPException(422, { message: `Apprenants hors de la classe : ${horsClasse.join(", ")}` });
  const idsParNiveau = new Set(saisie.decisions.map((d) => d.apprenantId));
  if (idsParNiveau.size !== saisie.decisions.length) throw new HTTPException(422, { message: "Un même apprenant ne peut apparaître deux fois" });

  const divisions = new Map<string, Division[]>();
  const divisionsCrees: string[] = [];
  const faits = [] as NouveauFait[];
  for (const d of saisie.decisions) {
    const versNiveau: Niveau = d.decision === "admis" ? niveauSuivant! : (classe.niveau as Niveau);
    if (!divisions.has(versNiveau)) divisions.set(versNiveau, await divisionsAccueil(id, versNiveau, saisie.anneeScolaire));
    const pool = divisions.get(versNiveau)!;
    // Place disponible = capacite - effectif courant ; sinon on ouvre une nouvelle division.
    let cible = pool.filter((x) => x.effectif < x.capacite).sort((a, b) => (b.capacite - b.effectif) - (a.capacite - a.effectif))[0];
    if (!cible) {
      const nouvelle = `CLS-${randomUUID()}`;
      await base().insert(schema.classes).values({ id: nouvelle, etablissementId: id, niveau: versNiveau, libelle: `${versNiveau} — ${saisie.anneeScolaire}`, anneeScolaire: saisie.anneeScolaire, capacite: saisie.capaciteNouvelleDivision, enseignantPrincipalId: null });
      cible = { id: nouvelle, capacite: saisie.capaciteNouvelleDivision, effectif: 0 };
      pool.push(cible);
      divisionsCrees.push(nouvelle);
    }
    cible.effectif += 1;
    faits.push({ type: "PASSAGE", auteurId: profil.id, etablissementId: id, apprenantId: d.apprenantId, donnees: { apprenantId: d.apprenantId, deNiveau: classe.niveau, versNiveau, decision: d.decision, anneeScolaire: saisie.anneeScolaire } });
    faits.push({ type: "REPRISE", auteurId: profil.id, etablissementId: id, apprenantId: d.apprenantId, donnees: { apprenantId: d.apprenantId, classeId: cible.id, anneeScolaire: saisie.anneeScolaire } });
  }
  await inscrireAuRegistre(faits);
  const admis = admisses.length, maintenus = saisie.decisions.length - admis;
  await journaliser(profil, "Conseil de passage", `${classeId} (${classe.libelle}) · ${admis} admis, ${maintenus} maintenus`, "gestion", true, null);
  return c.json({ classeId, anneeScolaire: saisie.anneeScolaire, admis, maintenus, divisionsCrees }, 201);
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
        declarantNpi: d.declarantNpi ?? null,
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

/* ------------------------------------------------------------------ Examens et certification */

/** Examen national → niveau de classe dont les apprenants constituent le candidaturé. */
const EXAMEN = z.enum(["CEP", "BEPC", "BAC"]);
const NIVEAU_PAR_EXAMEN: Record<z.infer<typeof EXAMEN>, string> = { CEP: "CM2", BEPC: "3e", BAC: "Tle" };

/** Session par défaut : la session de juin de l'année en cours ; le centre d'examen la précise en production. */
const sessionParDefaut = () => `Juin ${aujourdhui().slice(0, 4)}`;
const anneeDeSession = (session: string) => session.match(/\d{4}/)?.[0] ?? aujourdhui().slice(0, 4);

async function candidatsPourExamen(etablissementId: string, niveau: string) {
  const eleves = (await scolarisesEtablissement(etablissementId)).filter((e) => e.niveau === niveau);
  const b = await bilans(eleves.map((e) => e.id));
  return eleves.map((e) => ({ ...e, moyenne: b.get(e.id)?.moyenne ?? null }));
}

etablissement.get("/etablissements/:id/examens", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil, finalite } = await acces(c, id);
  const examen = EXAMEN.parse(c.req.query("examen") ?? "BEPC");
  const session = c.req.query("session")?.trim() || sessionParDefaut();
  const [candidats, certificats] = await Promise.all([
    candidatsPourExamen(id, NIVEAU_PAR_EXAMEN[examen]),
    // Diplômes délivrés aux apprenants passés par l'établissement (registre), y compris ceux qui l'ont quitté.
    base().select({ c: schema.certificats, titulaire: sql<string>`${schema.apprenants.prenoms} || ' ' || ${schema.apprenants.nom}` })
      .from(schema.certificats).innerJoin(schema.apprenants, eq(schema.apprenants.id, schema.certificats.apprenantId))
      .where(sql`${schema.certificats.apprenantId} in (select apprenant_id from ledger.evenements where etablissement_id = ${id} and type in ('INSCRIPTION', 'TRANSFERT', 'REPRISE'))`),
  ]);
  await journaliser(profil, "Consultation des examens", id, finalite, true, null);
  return c.json({
    examen, session, niveau: NIVEAU_PAR_EXAMEN[examen],
    classes: [...new Set(candidats.map((x) => x.classe))].sort(),
    candidats: candidats.map((x) => ({ id: x.id, nom: `${x.prenoms} ${x.nom}`, classe: x.classe, moyenne: x.moyenne })).sort((x, y) => comparerFr(x.nom, y.nom)),
    deliberee: certificats.some((x) => x.c.examen === examen && x.c.session === session),
    certificats: certificats.map((x) => ({ ...x.c, titulaire: x.titulaire })).sort((x, y) => y.delivreLe.localeCompare(x.delivreLe)),
  });
});

/**
 * Délibération d'un examen national (déléguée au centre d'examen) : résultats et diplômes vérifiables, en une transaction.
 * Honnêteté de la note : tant que le centre d'examen n'a pas transmis la note officielle de l'épreuve, la décision ne peut
 * s'appuyer que sur la moyenne annuelle de l'apprenant. Cette note est donc PROVISOIRE — elle n'est pas inventée (aucune
 * majoration, aucun bornage), et l'admission n'est jamais déduite d'une donnée absente : sans moyenne enregistrée, le
 * candidat n'est pas jugé et ne reçoit pas de diplôme.
 */
etablissement.post("/etablissements/:id/examens/deliberation", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil } = await acces(c, id, true);
  const saisie = await corps(c, z.object({ examen: EXAMEN.default("BEPC"), session: z.string().trim().min(1).max(40).optional() }).strict());
  const examen = saisie.examen;
  const session = saisie.session?.trim() || sessionParDefaut();
  const candidats = await candidatsPourExamen(id, NIVEAU_PAR_EXAMEN[examen]);
  if (!candidats.length) throw new HTTPException(422, { message: `Aucun candidat scolarisé au niveau requis pour le ${examen}` });
  const [deja] = await base().select({ id: schema.certificats.id }).from(schema.certificats)
    .where(and(eq(schema.certificats.examen, examen), eq(schema.certificats.session, session), inArray(schema.certificats.apprenantId, candidats.map((a) => a.id)))).limit(1);
  if (deja) throw new HTTPException(409, { message: "Session déjà délibérée" });
  const annee = anneeDeSession(session);
  const delivreLe = aujourdhui();
  const juges = candidats.filter((a) => a.moyenne != null);
  const certs: Certificat[] = [];
  const faits = juges.flatMap((a) => {
    // Note provisoire = moyenne annuelle réelle, arrondie telle quelle ; la note officielle du centre s'y substituera par événement correctif.
    const moyenne = Number(a.moyenne!.toFixed(2));
    const admis = moyenne >= 10;
    const f = [{ type: "RESULTAT_EXAMEN", auteurId: profil.id, etablissementId: id, apprenantId: a.id, source: "examens" as const, donnees: { apprenantId: a.id, examen, session, moyenne, admis } as Record<string, unknown> }];
    if (admis) {
      const mention = moyenne >= 16 ? "Très bien" : moyenne >= 14 ? "Bien" : moyenne >= 12 ? "Assez bien" : "Passable";
      const brut = { id: `CERT-${examen}-${annee}-${a.id.slice(4)}`, apprenantId: a.id, examen, session, mention, moyenne, delivreLe };
      certs.push({ ...brut, empreinte: empreinteCertificat(brut, `${a.prenoms} ${a.nom}`), revoque: false });
      f.push({ type: "CERTIFICATION", auteurId: profil.id, etablissementId: id, apprenantId: a.id, source: "examens" as const, donnees: { apprenantId: a.id, certificatId: brut.id, examen, session, mention } });
    }
    return f;
  });
  await inscrireAuRegistre(faits, async (tx) => { if (certs.length) await tx.insert(schema.certificats).values(certs); });
  await journaliser(profil, `Délibération du ${examen}`, `${id} · ${juges.length} candidat(s) jugé(s)`, "gestion", true, null);
  return c.json({ examen, session, candidats: candidats.length, nonJuges: candidats.length - juges.length, diplomes: certs.length }, 201);
});

/* ------------------------------------------------------------------ Accompagnement (moteur de workflow) */

/** Proposition d'accompagnement : une demande suit le circuit ACCOMPAGNEMENT ; aucune mesure sans décision humaine. */
etablissement.post("/etablissements/:id/accompagnement", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil } = await acces(c, id, true);
  const { apprenantIds, objet } = await corps(c, z.object({ apprenantIds: z.array(z.string().regex(/^APP-\d{6}$/)).min(1).max(80), objet: z.string().trim().min(5).max(200) }).strict());
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

/** Détail d'une demande : circuit, décisions déjà rendues (ajout seul), et droit d'agir de l'utilisateur. */
etablissement.get("/demandes/:id", authentifie, async (c) => {
  const profil = c.get("profil");
  const demandeId = z.string().regex(/^DEM-[A-Za-z0-9-]+$/).parse(c.req.param("id"));
  const ctx = await contexteDemande(profil, demandeId);
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
    motif: z.string().trim().max(200).optional(),
  }).strict().refine((s) => s.decision === "valide" || (s.motif ?? "").length >= 5, "Un motif d'au moins 5 caractères est requis pour refuser ou renvoyer"));

  const ctx = await contexteDemande(profil, demandeId);
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
      titre: `Demande ${verbe.startsWith("acceptée") || verbe.startsWith("validée") ? "validée" : saisie.decision === "refuse" ? "refusée" : "renvoyée"}`,
      texte: `« ${ctx.demande.objet} » : ${verbe}.${saisie.motif ? ` Motif : ${saisie.motif}.` : ""}`,
    }).catch((e) => console.error("Notification demande :", e));
  }

  await journaliser(profil, "Décision sur une demande", `${demandeId} · ${ctx.etape.code} → ${saisie.decision}`, "gestion", true, null);
  return c.json({ demandeId, decision: saisie.decision, etape, statut }, 200);
});

