import { randomUUID } from "node:crypto";
import { schema } from "@beile/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { base } from "./commun";
import { notifierFaits } from "./notifications";

/**
 * Point d'écriture unique au registre d'événements.
 * Dans UNE transaction : ajout des événements (table en ajout seul) + mise à jour de la projection de
 * lecture core.scolarites. Puis, hors transaction, génération des notifications aux familles.
 */
export interface NouveauFait {
  type: string;
  apprenantId: string | null;
  enseignantId?: string | null;
  etablissementId: string | null;
  auteurId: string;
  source?: "beile" | "registre_national" | "educmaster" | "examens";
  donnees: Record<string, unknown>;
}

const PLACEMENT = new Set(["INSCRIPTION", "REPRISE", "TRANSFERT", "ABANDON"]);

export async function inscrireAuRegistre(faits: NouveauFait[], avant?: (tx: Parameters<Parameters<ReturnType<typeof base>["transaction"]>[0]>[0]) => Promise<void>) {
  const maintenant = new Date();
  const lignes = faits.map((f) => ({
    id: `EVT-${randomUUID()}`, type: f.type, survenuLe: maintenant, auteurId: f.auteurId, source: f.source ?? ("beile" as const),
    etablissementId: f.etablissementId, apprenantId: f.apprenantId, enseignantId: f.enseignantId ?? null, donnees: f.donnees,
  }));
  await base().transaction(async (tx) => {
    if (avant) await avant(tx);
    await tx.insert(schema.evenements).values(lignes);
    // Projection : classe et statut courants, pour les événements de placement.
    const placements = lignes.filter((l) => PLACEMENT.has(l.type) && l.apprenantId);
    if (placements.length) {
      const classeIds = placements.map((p) => (p.donnees.classeId ?? p.donnees.versClasseId) as string | undefined).filter((x): x is string => !!x);
      const classes = classeIds.length ? await tx.select().from(schema.classes).where(inArray(schema.classes.id, classeIds)) : [];
      for (const p of placements) {
        const classeId = p.type === "ABANDON" ? null : ((p.donnees.classeId ?? p.donnees.versClasseId) as string);
        const etablissementId = classeId ? classes.find((c) => c.id === classeId)?.etablissementId ?? null : null;
        const valeurs = { classeId, etablissementId, statut: (p.type === "ABANDON" ? "abandon" : "scolarise") as "abandon" | "scolarise", majLe: maintenant };
        await tx.insert(schema.scolarites).values({ apprenantId: p.apprenantId!, ...valeurs }).onConflictDoUpdate({ target: schema.scolarites.apprenantId, set: valeurs });
      }
    }
    // Projection des notes effectives : chaque évaluation ajoutée, chaque correction appliquée.
    const evaluations = lignes.filter((l) => l.type === "EVALUATION" && l.apprenantId);
    if (evaluations.length) {
      await tx.insert(schema.notes).values(evaluations.map((l) => ({
        evenementId: l.id, apprenantId: l.apprenantId!, classeId: String(l.donnees.classeId), matiere: String(l.donnees.matiere),
        trimestre: Number(l.donnees.trimestre), note: Number(l.donnees.note), noteInitiale: Number(l.donnees.note), survenuLe: maintenant,
      })));
    }
    for (const l of lignes.filter((x) => x.type === "CORRECTION_EVALUATION")) {
      await tx.update(schema.notes).set({ note: Number(l.donnees.nouvelleNote), corrigee: true }).where(eq(schema.notes.evenementId, String(l.donnees.evenementCorrigeId)));
    }
  });
  // Les notifications ne doivent jamais faire échouer l'écriture au registre.
  await notifierFaits(lignes.filter((l) => l.apprenantId).map((l) => ({ id: l.id, type: l.type, apprenantId: l.apprenantId!, donnees: l.donnees }))).catch((e) => console.error("Notifications :", e));
  return lignes.map((l) => l.id);
}

/** Identifiant de saisie côté client (file hors connexion) : clé d'idempotence des écritures rejouées. */
export const ID_SAISIE = z.string().regex(/^[A-Za-z0-9-]{8,64}$/).optional();

/** Événements déjà enregistrés pour cette saisie (rejeu après une réponse perdue) : on les renvoie sans rien réécrire. */
export async function dejaSaisi(idSaisie: string | undefined, type: string) {
  if (!idSaisie) return null;
  const lignes = await base().select({ id: schema.evenements.id }).from(schema.evenements)
    .where(and(eq(schema.evenements.type, type), sql`${schema.evenements.donnees}->>'idSaisie' = ${idSaisie}`));
  return lignes.length ? lignes.map((l) => l.id) : null;
}

/** Classe courante d'un ensemble d'apprenants, lue dans la projection (lecture indexée). */
export async function classesCourantes(apprenantIds: string[]) {
  if (!apprenantIds.length) return new Map<string, string | null>();
  const lignes = await base().select().from(schema.scolarites).where(inArray(schema.scolarites.apprenantId, apprenantIds));
  return new Map(lignes.map((l) => [l.apprenantId, l.statut === "scolarise" ? l.classeId : null]));
}

export async function effectifClasse(classeId: string) {
  return (await base().select({ id: schema.scolarites.apprenantId }).from(schema.scolarites).where(eq(schema.scolarites.classeId, classeId))).length;
}
