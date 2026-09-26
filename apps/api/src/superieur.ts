import { randomUUID } from "node:crypto";
import { Concours, StatutConcours, type Profil } from "@beile/contracts";
import { schema } from "@beile/db";
import { and, asc, eq } from "drizzle-orm";
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
 *    l'habilitation « apprenant » de la session, jamais fourni par le client.
 *
 * Les valeurs d'énum (voie, cycle, diplôme, statuts…) sont validées par les contrats zod ci-dessous ;
 * la colonne est un `text` simple en base (drizzle ne crée pas de type enum ici).
 */
export const superieur = new Hono<{ Variables: Variables }>();

/** Autorité du bureau du supérieur : administration centrale siégeant au niveau national. Refus journalisé. */
async function bureauSup(c: Context<{ Variables: Variables }>, action: string) {
  const profil = c.get("profil");
  const hab = profil.habilitations.some((x) => x.role === "administration_centrale" && x.perimetre.niveau === "national");
  if (!hab) {
    await journaliser(profil, action, "Bureau de l'enseignement supérieur", "gestion", false, "role");
    refuser("Bureau de l'enseignement supérieur : accès réservé à l'administration centrale.");
  }
  return profil;
}

/** L'apprenant connecté, ou refus — même résolution que le passeport (`perimetre.apprenantId`). */
function monApprenant(profil: Profil) {
  const h = profil.habilitations.find((x) => x.role === "apprenant" && x.perimetre.niveau === "personnel");
  if (h?.perimetre.niveau !== "personnel") return refuser("Aucune habilitation « apprenant »");
  return h.perimetre.apprenantId;
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
    statut: z.enum(["brouillon", "soumis"]).default("brouillon"),
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
