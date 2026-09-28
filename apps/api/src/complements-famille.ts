import { schema } from "@beile/db";
import type { Evenement } from "@beile/contracts";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authentifie, base, corps, journaliser, refuser, type Variables } from "./commun";
import { inscrireAuRegistre } from "./ecriture";
import { dossier } from "./parcours";

/** Routes complémentaires de l'espace « famille » (ajoutées pendant le branchement du front). */
export const complementsFamille = new Hono<{ Variables: Variables }>();

/**
 * Justification d'absence par un responsable légal.
 * Le registre est en ajout seul : l'absence d'origine n'est jamais modifiée. Un fait JUSTIFICATION_ABSENCE
 * la référence, avec le motif déclaré ; l'établissement le voit dans le parcours et statue.
 * Accès décidé par l'ABAC (parent + lien de filiation vérifié + finalité « suivi familial »), puis journalisé.
 */
complementsFamille.post("/famille/absences/justification", authentifie, async (c) => {
  const profil = c.get("profil");
  const saisie = await corps(c, z.object({
    absenceIds: z.array(z.string().regex(/^EVT-[A-Za-z0-9-]+$/)).min(1).max(10),
    motif: z.string().trim().min(5).max(200),
  }).strict());
  if (!profil.npi || !profil.habilitations.some((h) => h.role === "parent")) {
    await journaliser(profil, "Justification d'absence", saisie.absenceIds.join(", "), "suivi_familial", false, "role");
    refuser("Aucune habilitation « parent » : justification refusée et journalisée");
  }

  const absences = await base().select().from(schema.evenements).where(and(inArray(schema.evenements.id, saisie.absenceIds), eq(schema.evenements.type, "ABSENCE")));
  if (absences.length !== new Set(saisie.absenceIds).size) throw new HTTPException(404, { message: "Absence introuvable au registre" });
  const apprenants = [...new Set(absences.map((a) => a.apprenantId))];
  if (apprenants.length !== 1 || !apprenants[0]) throw new HTTPException(422, { message: "Les absences doivent concerner un seul et même enfant" });
  const apprenantId = apprenants[0];

  // Décision ABAC (rôle, relation de filiation vérifiée, finalité) prise et journalisée par dossier().
  const r = await dossier(profil, apprenantId, "suivi_familial", "Justification d'absence — contrôle d'accès");
  if (!r.dossier) refuser("Cet enfant n'est pas rattaché à votre identité : justification refusée et journalisée");

  // Une absence est bloquée si elle est déjà justifiée, ou couverte par un justificatif transmis/validé.
  // Un justificatif REFUSÉ par l'établissement peut être représenté : il ne bloque pas l'absence d'origine.
  const decisions = new Map<string, Extract<Evenement, { type: "DECISION_JUSTIFICATION" }>>();
  for (const e of r.dossier!.evenements) {
    if (e.type !== "DECISION_JUSTIFICATION") continue;
    const avant = decisions.get(e.justificationId);
    if (!avant || avant.survenuLe <= e.survenuLe) decisions.set(e.justificationId, e);
  }
  const dejaJustifiees = new Set(absences.filter((a) => (a.donnees as { justifiee?: boolean }).justifiee).map((a) => a.id));
  for (const e of r.dossier!.evenements) {
    if (e.type !== "JUSTIFICATION_ABSENCE" || decisions.get(e.id)?.decision === "refusee") continue;
    for (const id of e.absenceIds) dejaJustifiees.add(id);
  }
  const aJustifier = absences.filter((a) => !dejaJustifiees.has(a.id));
  if (!aJustifier.length) throw new HTTPException(409, { message: "Ces absences sont déjà justifiées" });

  const [id] = await inscrireAuRegistre([{
    type: "JUSTIFICATION_ABSENCE", auteurId: profil.id, etablissementId: aJustifier[0]!.etablissementId, apprenantId,
    donnees: {
      apprenantId,
      absenceIds: aJustifier.map((a) => a.id),
      dates: [...new Set(aJustifier.map((a) => String((a.donnees as { date?: string }).date ?? "")))],
      classeId: (aJustifier[0]!.donnees as { classeId?: string }).classeId ?? null,
      motif: saisie.motif,
      declarantNpi: profil.npi,
    },
  }]);
  await journaliser(profil, "Justification d'absence", `${apprenantId} · ${aJustifier.length} absence(s)`, "suivi_familial", true, null);
  return c.json({ enregistre: id, absenceIds: aJustifier.map((a) => a.id) }, 201);
});
