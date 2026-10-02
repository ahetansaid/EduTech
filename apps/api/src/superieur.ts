import { randomUUID } from "node:crypto";
import { Concours, StatutConcours, StatutStage, type Profil } from "@beile/contracts";
import { schema } from "@beile/db";
import { and, asc, count, desc, eq, isNull } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authentifie, base, corps, journaliser, refuser, type Variables } from "./commun";
import { perimetrePilotage } from "./pilotage";

/**
 * Enseignement supérieur & formation professionnelle — surface serveur du domaine.
 *
 * Doctrine héritée des autres modules, sans nouvelle surface d'accès :
 *  - la lecture du catalogue (filières, établissements du supérieur, concours) relève de l'autorité
 *    de pilotage (`perimetrePilotage`) : données de référence non nominatives ;
 *  - l'ouverture et le pilotage d'une session de concours relèvent du bureau central, comme les
 *    examens nationaux (`administration_centrale` + périmètre national), refus journalisé ;
 *  - un vœu n'est consultable et posable que par l'apprenant lui-même : `apprenant_id` est forcé à
 *    l'habilitation « apprenant » de la session, jamais fourni par le client ;
 *  - le STAGE est une donnée nominative : il ne passe jamais par `perimetrePilotage` (celui-ci ne
 *    reçoit que des effectifs agrégés). Y ont droit l'apprenant, l'enseignant qui s'est porté
 *    encadrant, et la direction de l'établissement d'attache — jamais un rôle de pilotage.
 *
 * Les valeurs d'énum (voie, cycle, diplôme, statuts…) sont validées par les contrats zod ci-dessous ;
 * la colonne est un `text` simple en base (drizzle ne crée pas de type enum ici).
 */
export const superieur = new Hono<{ Variables: Variables }>();

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const ID_ETAB = z.string().regex(/^ETB-[A-Za-z0-9-]+$/);
const ID_STAGE = z.string().regex(/^STG-[A-Za-z0-9-]+$/);
/** Un apprenant ne peut que préparer puis soumettre : les statuts d'autorité
 *  (`admissible`, `admis`, `refuse`, `desiste`) ne sont pas posables depuis le client. */
const STATUT_POSEABLE = z.enum(["brouillon", "soumis"]);

/** Autorité du bureau du supérieur : administration centrale siégeant au niveau national. Refus journalisé.
 *  Partagée avec la scolarité du supérieur (`etudiants-superieur.ts`) : une seule porte d'entrée du bureau. */
export async function bureauSup(c: Context<{ Variables: Variables }>, action: string) {
  const profil = c.get("profil");
  const hab = profil.habilitations.some((x) => x.role === "administration_centrale" && x.perimetre.niveau === "national");
  if (!hab) {
    await journaliser(profil, action, "Bureau de l'enseignement supérieur", "gestion", false, "role");
    refuser("Bureau de l'enseignement supérieur : accès réservé à l'administration centrale.");
  }
  return profil;
}

/** L'apprenant connecté, ou refus — même résolution que le passeport (`perimetre.apprenantId`). */
export function monApprenant(profil: Profil) {
  const h = profil.habilitations.find((x) => x.role === "apprenant" && x.perimetre.niveau === "personnel");
  if (h?.perimetre.niveau !== "personnel") return refuser("Aucune habilitation « apprenant »");
  return h.perimetre.apprenantId;
}

/** L'enseignant connecté, par son identifiant national (même résolution que pour la saisie d'appel). */
export async function monEnseignant(profil: Profil) {
  if (!profil.npi) return refuser("Aucune identité d'enseignant rattachée à ce compte");
  const [e] = await base().select({ id: schema.enseignants.id }).from(schema.enseignants).where(eq(schema.enseignants.npi, profil.npi));
  if (!e) return refuser("Aucune identité d'enseignant rattachée à ce compte");
  return e.id;
}

/** Établissement d'attache actuel d'un apprenant, lu dans la projection de scolarité — jamais fourni par le client.
 *  Partagée avec le guichet : un acte se délivre depuis l'établissement où l'étudiant est inscrit. */
export async function etablissementDe(apprenantId: string) {
  const [scolarite] = await base().select({ etablissementId: schema.scolarites.etablissementId }).from(schema.scolarites).where(eq(schema.scolarites.apprenantId, apprenantId));
  return scolarite?.etablissementId ?? null;
}

/** Accès à un établissement : chef de CET établissement (lecture et écriture) ou inspecteur de sa
 *  circonscription (lecture seule, contrôle). Refus journalisé ; aucun rôle élargi.
 *  Partagée avec la scolarité du supérieur : le supérieur n'ajoute aucun rôle, il réutilise ceux-là. */
export async function accesEtablissement(c: Context<{ Variables: Variables }>, etablissementId: string, ecriture = false) {
  const profil = c.get("profil");
  const [etab] = await base().select().from(schema.etablissements).where(eq(schema.etablissements.id, etablissementId));
  if (!etab) throw new HTTPException(404, { message: "Établissement inconnu" });
  const chef = profil.habilitations.some((h) => h.role === "chef_etablissement" && h.perimetre.niveau === "etablissement" && h.perimetre.etablissementId === etablissementId);
  const inspecteur = !ecriture && profil.habilitations.some((h) => h.role === "inspecteur" && h.perimetre.niveau === "circonscription" && h.perimetre.circonscription === etab.circonscription);
  if (!chef && !inspecteur) {
    await journaliser(profil, ecriture ? "Validation dans un établissement" : "Consultation d'un établissement", etablissementId, ecriture ? "gestion" : "controle", false, "perimetre");
    refuser("Établissement hors de votre périmètre : refus journalisé");
  }
  return { profil, etab, finalite: chef ? ("gestion" as const) : ("controle" as const) };
}

/* ------------------------------------------------------------------ Lecture du catalogue (autorité de pilotage) */

superieur.get("/enseignement-superieur/filieres", authentifie, async (c) => {
  const profil = c.get("profil");
  perimetrePilotage(profil);
  const voie = c.req.query("voie");
  const lignes = await base().select().from(schema.filiereSuperieure).orderBy(asc(schema.filiereSuperieure.nom));
  const vues = voie ? lignes.filter((f) => f.voie === voie) : lignes;
  await journaliser(profil, "Consultation du catalogue des filières", `${vues.length} filière(s)`, "gestion", true, null);
  return c.json(vues);
});

superieur.get("/enseignement-superieur/etablissements", authentifie, async (c) => {
  const profil = c.get("profil");
  perimetrePilotage(profil);
  const lignes = await base().select().from(schema.etablissements).where(eq(schema.etablissements.cycle, "superieur")).orderBy(asc(schema.etablissements.nom));
  await journaliser(profil, "Consultation du réseau des établissements du supérieur", `${lignes.length} établissement(s)`, "gestion", true, null);
  return c.json(lignes);
});

superieur.get("/enseignement-superieur/concours", authentifie, async (c) => {
  const profil = c.get("profil");
  perimetrePilotage(profil);
  const lignes = await base().select().from(schema.concoursSession).orderBy(asc(schema.concoursSession.session), asc(schema.concoursSession.nom));
  await journaliser(profil, "Consultation des sessions de concours", `${lignes.length} session(s)`, "gestion", true, null);
  return c.json(lignes);
});

/* ------------------------------------------------------------------ Concours (bureau central) */

/** Ouvrir une session de concours rattachée à une filière existante. Un doublon (filière, session) est
 *  refusé par la contrainte d'unicité → 409 global, jamais un faux « créé ». */
superieur.post("/enseignement-superieur/concours", authentifie, async (c) => {
  const profil = await bureauSup(c, "Ouverture d'une session de concours");
  const { nom, filiereId, session, statut, diplomeRequis, serieRequise, places, epreuves, ouvertureLe, clotureLe, epreuvesLe } = await corps(c, Concours.omit({ id: true }).strict());
  const [filiere] = await base().select({ id: schema.filiereSuperieure.id }).from(schema.filiereSuperieure).where(eq(schema.filiereSuperieure.id, filiereId));
  if (!filiere) throw new HTTPException(422, { message: "Filière inconnue du catalogue" });
  const id = `CCS-${randomUUID()}`;
  await base().insert(schema.concoursSession).values({ id, nom, filiereId, session, statut, diplomeRequis, serieRequise, places, epreuves, ouvertureLe, clotureLe, epreuvesLe });
  await journaliser(profil, "Ouverture d'une session de concours", `${nom} ${session}`, "gestion", true, null);
  return c.json({ id, nom, filiereId, session, statut }, 201);
});

/** Faire avancer une session dans son cycle de vie (annonce → … → clos). Le statut est la seule mutation.
 *  POST et non PATCH : l'API n'autorise que GET/POST côté CORS (double soumission CSRF incluse). */
superieur.post("/enseignement-superieur/concours/:id/statut", authentifie, async (c) => {
  const profil = await bureauSup(c, "Mise à jour du statut d'une session de concours");
  const id = z.string().regex(/^CCS-[A-Za-z0-9-]+$/).parse(c.req.param("id"));
  const { statut } = await corps(c, z.object({ statut: StatutConcours }).strict());
  const [maj] = await base().update(schema.concoursSession).set({ statut }).where(eq(schema.concoursSession.id, id)).returning({ id: schema.concoursSession.id });
  if (!maj) throw new HTTPException(404, { message: "Session de concours introuvable" });
  await journaliser(profil, "Mise à jour du statut d'une session de concours", id, "gestion", true, null);
  return c.json({ id, statut });
});

/* ------------------------------------------------------------------ Vœux de l'apprenant (auto-scopés) */

/** Vœux de l'année en cours, dans l'ordre de préférence. Réservé à l'apprenant lui-même. */
superieur.get("/moi/voeux", authentifie, async (c) => {
  const profil = c.get("profil");
  const apprenantId = monApprenant(profil);
  const annee = c.req.query("annee");
  const lignes = await base().select().from(schema.voeuSuperieur)
    .where(annee ? and(eq(schema.voeuSuperieur.apprenantId, apprenantId), eq(schema.voeuSuperieur.anneeScolaire, annee)) : eq(schema.voeuSuperieur.apprenantId, apprenantId))
    .orderBy(asc(schema.voeuSuperieur.anneeScolaire), asc(schema.voeuSuperieur.rang));
  await journaliser(profil, "Consultation de ses vœux d'orientation", `${lignes.length} vœu(x)`, "consultation_personnelle", true, null);
  return c.json(lignes);
});

/** Poser ou mettre à jour un vœu. L'`apprenant_id` est celui de la session, jamais celui du client. */
superieur.post("/moi/voeux", authentifie, async (c) => {
  const profil = c.get("profil");
  const apprenantId = monApprenant(profil);
  const { filiereId, concoursId, rang, statut, anneeScolaire } = await corps(c, z.object({
    filiereId: z.string().trim().min(1).max(80),
    concoursId: z.string().trim().min(1).max(80).nullable().default(null),
    rang: z.number().int().min(1).max(20),
    statut: STATUT_POSEABLE.default("brouillon"),
    anneeScolaire: z.string().regex(/^\d{4}-\d{4}$/),
  }).strict());
  const [filiere] = await base().select({ id: schema.filiereSuperieure.id }).from(schema.filiereSuperieure).where(eq(schema.filiereSuperieure.id, filiereId));
  if (!filiere) throw new HTTPException(422, { message: "Filière inconnue du catalogue" });
  const id = `VOE-${randomUUID()}`;
  const [pose] = await base().insert(schema.voeuSuperieur)
    .values({ id, apprenantId, filiereId, concoursId, rang, statut, anneeScolaire })
    .onConflictDoUpdate({ target: [schema.voeuSuperieur.apprenantId, schema.voeuSuperieur.filiereId, schema.voeuSuperieur.anneeScolaire], set: { concoursId, rang, statut } })
    .returning();
  await journaliser(profil, "Dépôt d'un vœu d'orientation", filiereId, "consultation_personnelle", true, null);
  return c.json(pose, 201);
});

/* ------------------------------------------------------------------ Stages (nominatif : périmètre strict) */

/** Stages déclarés par l'apprenant connecté. */
superieur.get("/moi/stages", authentifie, async (c) => {
  const profil = c.get("profil");
  const apprenantId = monApprenant(profil);
  const lignes = await base().select().from(schema.stage).where(eq(schema.stage.apprenantId, apprenantId)).orderBy(asc(schema.stage.du));
  await journaliser(profil, "Consultation de ses stages", `${lignes.length} stage(s)`, "consultation_personnelle", true, null);
  return c.json(lignes);
});

/** Déclarer un stage. Le client ne choisit ni l'apprenant ni l'établissement : ils viennent de la
 *  session et de la scolarité courante, sinon n'importe qui rattacherait son stage à un autre réseau. */
superieur.post("/moi/stages", authentifie, async (c) => {
  const profil = c.get("profil");
  const apprenantId = monApprenant(profil);
  const { entreprise, tuteurPro, du, au } = await corps(c, z.object({
    entreprise: z.string().trim().min(2).max(140),
    tuteurPro: z.string().trim().max(120).nullable().default(null),
    du: DATE.nullable().default(null),
    au: DATE.nullable().default(null),
  }).strict());
  if (du && au && au < du) throw new HTTPException(422, { message: "Date de fin antérieure à la date de début" });
  // Un stage du supérieur s'attache à l'inscription en cours (établissement ET filière : sans filière,
  // aucune statistique de stage par filière). La scolarité du K-12 ne sert qu'à défaut, pour un stage
  // de lycée technique.
  const [insc] = await base().select({ etablissementId: schema.inscriptionsSuperieures.etablissementId, filiereId: schema.inscriptionsSuperieures.filiereId })
    .from(schema.inscriptionsSuperieures)
    .where(and(eq(schema.inscriptionsSuperieures.apprenantId, apprenantId), eq(schema.inscriptionsSuperieures.statut, "inscrit")))
    .orderBy(desc(schema.inscriptionsSuperieures.anneeUniversitaire)).limit(1);
  const etablissementId = insc?.etablissementId ?? await etablissementDe(apprenantId);
  if (!etablissementId) throw new HTTPException(422, { message: "Aucune scolarité rattachée à un établissement : stage non déclarable" });
  const id = `STG-${randomUUID()}`;
  const [declare] = await base().insert(schema.stage).values({ id, apprenantId, etablissementId, filiereId: insc?.filiereId ?? null, entreprise, tuteurPro, du, au }).returning();
  await journaliser(profil, "Déclaration d'un stage", entreprise, "consultation_personnelle", true, null);
  return c.json(declare, 201);
});

/** Faire avancer son propre stage dans le cycle de vie. La clause sur l'apprenant rend toute mutation
 *  d'un stage d'autrui impossible, même avec un identifiant deviné. */
superieur.post("/moi/stages/:id/statut", authentifie, async (c) => {
  const profil = c.get("profil");
  const apprenantId = monApprenant(profil);
  const id = ID_STAGE.parse(c.req.param("id"));
  const { statut } = await corps(c, z.object({ statut: StatutStage }).strict());
  const [maj] = await base().update(schema.stage).set({ statut })
    .where(and(eq(schema.stage.id, id), eq(schema.stage.apprenantId, apprenantId)))
    .returning({ id: schema.stage.id });
  if (!maj) throw new HTTPException(404, { message: "Stage introuvable" });
  await journaliser(profil, "Mise à jour du statut d'un stage", id, "consultation_personnelle", true, null);
  return c.json({ id, statut });
});

/* -- Volet encadrement académique : l'enseignant ne voit que les stages dont IL s'est porté responsable */

/** Stages dont l'enseignant connecté est l'encadrant académique. */
superieur.get("/moi/stages/encadres", authentifie, async (c) => {
  const profil = c.get("profil");
  const enseignantId = await monEnseignant(profil);
  const lignes = await base().select().from(schema.stage).where(eq(schema.stage.tuteurAcademiqueId, enseignantId)).orderBy(asc(schema.stage.du));
  await journaliser(profil, "Consultation des stages encadrés", `${lignes.length} stage(s)`, "evaluation", true, null);
  return c.json(lignes);
});

/** Se porter encadrant académique d'un stage : la relation est prise sur soi, et un stage déjà
 *  encadré ne se déplace pas (clause `isNull` dans l'UPDATE, pas un contrôle d'abord). */
superieur.post("/moi/stages/:id/encadrer", authentifie, async (c) => {
  const profil = c.get("profil");
  const enseignantId = await monEnseignant(profil);
  const id = ID_STAGE.parse(c.req.param("id"));
  // Encadrer un stage suppose d'enseigner dans l'établissement de l'étudiant (sinon : lecture d'une ligne nominative sans relation).
  const [ens] = await base().select({ etablissementId: schema.enseignants.etablissementId }).from(schema.enseignants).where(eq(schema.enseignants.id, enseignantId));
  const [maj] = await base().update(schema.stage).set({ tuteurAcademiqueId: enseignantId })
    .where(and(eq(schema.stage.id, id), isNull(schema.stage.tuteurAcademiqueId), eq(schema.stage.etablissementId, ens?.etablissementId ?? "")))
    .returning({ id: schema.stage.id });
  if (!maj) throw new HTTPException(409, { message: "Stage inconnu ou déjà encadré" });
  await journaliser(profil, "Encadrement académique d'un stage", id, "evaluation", true, null);
  return c.json({ id, tuteurAcademiqueId: enseignantId });
});

/* -- Volet établissement : la direction de l'établissement d'attache, et elle seule, valide */

/** Stages rattachés à un établissement (chef : gestion ; inspecteur de la circonscription : lecture). */
superieur.get("/etablissements/:id/stages", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil, finalite } = await accesEtablissement(c, id);
  const lignes = await base().select().from(schema.stage).where(eq(schema.stage.etablissementId, id)).orderBy(asc(schema.stage.statut), asc(schema.stage.du));
  await journaliser(profil, "Consultation des stages de l'établissement", `${lignes.length} stage(s)`, finalite, true, null);
  return c.json(lignes);
});

/** Valider un stage au nom de l'établissement : seul le chef de CET établissement tranche, et la
 *  clause sur l'établissement empêche de valider un stage rattaché à un autre. */
superieur.post("/etablissements/:id/stages/:stageId/validation", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const stageId = ID_STAGE.parse(c.req.param("stageId"));
  const { profil } = await accesEtablissement(c, id, true);
  const [maj] = await base().update(schema.stage).set({ valideParEtablissement: true })
    .where(and(eq(schema.stage.id, stageId), eq(schema.stage.etablissementId, id)))
    .returning({ id: schema.stage.id });
  if (!maj) throw new HTTPException(404, { message: "Stage introuvable dans cet établissement" });
  await journaliser(profil, "Validation d'un stage par l'établissement", stageId, "gestion", true, null);
  return c.json({ id: stageId, valideParEtablissement: true });
});

/* -- Volet pilotage : des effectifs seulement, aucune ligne nominative */

/** Répartition des stages par statut : c'est tout ce que le pilotage est autorisé à voir. */
superieur.get("/enseignement-superieur/stages/effectifs", authentifie, async (c) => {
  const profil = c.get("profil");
  perimetrePilotage(profil);
  const lignes = await base().select({ statut: schema.stage.statut, effectif: count() }).from(schema.stage).groupBy(schema.stage.statut);
  await journaliser(profil, "Consultation des effectifs de stage", `${lignes.length} statut(s)`, "statistique", true, null);
  return c.json(lignes);
});
