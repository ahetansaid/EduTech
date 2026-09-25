import { randomUUID } from "node:crypto";
import { schema } from "@beile/db";
import { eq, inArray } from "drizzle-orm";
import { base } from "./commun";

/**
 * Notifications nées des faits : pour chaque événement enregistré, les responsables légaux (lien vérifié)
 * et l'apprenant lui-même sont notifiés. Aucune notification n'est rédigée à la main.
 */
export interface FaitNotifiable { id: string; type: string; apprenantId: string; donnees: Record<string, unknown> }

export async function notifierFaits(faits: FaitNotifiable[]) {
  const utiles = faits.filter((f) => ["ABSENCE", "EVALUATION", "INSCRIPTION", "CORRECTION_EVALUATION", "CERTIFICATION", "TRANSFERT"].includes(f.type));
  if (!utiles.length) return;
  const ids = [...new Set(utiles.map((f) => f.apprenantId))];
  const [apprenants, liens] = await Promise.all([
    base().select().from(schema.apprenants).where(inArray(schema.apprenants.id, ids)),
    base().select().from(schema.liensFamiliaux).where(inArray(schema.liensFamiliaux.apprenantId, ids)),
  ]);
  const classeIds = [...new Set(utiles.map((f) => f.donnees.classeId).filter((x): x is string => typeof x === "string"))];
  const classes = classeIds.length ? await base().select().from(schema.classes).where(inArray(schema.classes.id, classeIds)) : [];
  const lignes: (typeof schema.notifications.$inferInsert)[] = [];
  for (const f of utiles) {
    const a = apprenants.find((x) => x.id === f.apprenantId);
    if (!a) continue;
    const classe = classes.find((c) => c.id === f.donnees.classeId)?.libelle;
    const [titre, texte] =
      f.type === "ABSENCE" ? [`Absence de ${a.prenoms}`, `${a.prenoms} a été noté·e absent·e le ${String(f.donnees.date ?? "").split("-").reverse().join("/")}${classe ? ` en ${classe}` : ""}. Vous pouvez justifier l'absence auprès de l'établissement.`]
      : f.type === "EVALUATION" ? [`Nouvelle note pour ${a.prenoms}`, `${f.donnees.matiere} : ${String(f.donnees.note).replace(".", ",")}/20.`]
      : f.type === "CORRECTION_EVALUATION" ? [`Note corrigée pour ${a.prenoms}`, `Nouvelle note : ${String(f.donnees.nouvelleNote).replace(".", ",")}/20 — motif : ${f.donnees.motif}.`]
      : f.type === "INSCRIPTION" ? [`Inscription de ${a.prenoms} confirmée`, `${a.prenoms} est inscrit·e${classe ? ` en ${classe}` : ""} pour l'année ${f.donnees.anneeScolaire ?? ""}.`]
      : f.type === "CERTIFICATION" ? [`Diplôme délivré à ${a.prenoms}`, `${f.donnees.examen} — mention ${f.donnees.mention}. Le diplôme est vérifiable en ligne par QR code.`]
      : [`Transfert de ${a.prenoms}`, `Le dossier de ${a.prenoms} a été transféré vers son nouvel établissement, sans ressaisie.`];
    const destinataires = new Set([...liens.filter((l) => l.apprenantId === a.id && l.verifie).map((l) => l.responsableNpi), ...(a.npi ? [a.npi] : [])]);
    for (const npi of destinataires) lignes.push({ id: `NOT-${randomUUID()}`, destinataireNpi: npi, titre, texte, evenementId: f.id });
  }
  if (lignes.length) await base().insert(schema.notifications).values(lignes);
}

export async function notificationsDe(npi: string, limite = 50) {
  const { desc } = await import("drizzle-orm");
  return base().select().from(schema.notifications).where(eq(schema.notifications.destinataireNpi, npi)).orderBy(desc(schema.notifications.creeLe)).limit(limite);
}
