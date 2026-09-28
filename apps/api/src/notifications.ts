import { randomUUID } from "node:crypto";
import { LIBELLE_ACTE } from "@beile/contracts";
import { schema } from "@beile/db";
import { eq, inArray } from "drizzle-orm";
import { base } from "./commun";

/**
 * Notifications nées des faits : pour chaque événement enregistré, les responsables légaux (lien vérifié)
 * et l'apprenant lui-même sont notifiés. Aucune notification n'est rédigée à la main.
 */
export interface FaitNotifiable { id: string; type: string; apprenantId: string; donnees: Record<string, unknown> }

/**
 * Une démarche d'étudiant est personnelle. Contrairement à la vie scolaire d'un mineur, l'acte délivré à
 * un majeur et la décision prise sur son allocation ne vont pas à ses responsables légaux — le lien
 * familial est K-12, et un statut d'allocataire n'est pas une information de foyer.
 */
const PERSONNEL = new Set(["ACTE_DISPONIBLE", "ACTE_REMIS", "ACTE_REFUSE", "ALLOCATION_DECIDEE"]);

const dateFr = (v: unknown) => String(v ?? "").split("-").reverse().join("/");

export async function notifierFaits(faits: FaitNotifiable[]) {
  const utiles = faits.filter((f) => ["ABSENCE", "EVALUATION", "INSCRIPTION", "CORRECTION_EVALUATION", "CERTIFICATION", "TRANSFERT", "DECISION_JUSTIFICATION", ...PERSONNEL].includes(f.type));
  if (!utiles.length) return;
  const ids = [...new Set(utiles.map((f) => f.apprenantId))];
  const [apprenants, liens] = await Promise.all([
    base().select().from(schema.apprenants).where(inArray(schema.apprenants.id, ids)),
    base().select().from(schema.liensFamiliaux).where(inArray(schema.liensFamiliaux.apprenantId, ids)),
  ]);
  const classeIds = [...new Set(utiles.map((f) => f.donnees.classeId).filter((x): x is string => typeof x === "string"))];
  const classes = classeIds.length ? await base().select().from(schema.classes).where(inArray(schema.classes.id, classeIds)) : [];
  // Un fait de guichet nomme la demande, pas l'acte : le libellé se lit dans la projection, jamais dans
  // un champ qu'un agent aurait pu saisir à la main.
  const demandeIds = [...new Set(utiles.map((f) => f.donnees.demandeId).filter((x): x is string => typeof x === "string"))];
  const demandes = new Map<string, typeof schema.demandesActe.$inferSelect>();
  if (demandeIds.length) {
    for (const d of await base().select().from(schema.demandesActe).where(inArray(schema.demandesActe.id, demandeIds))) demandes.set(d.id, d);
  }
  const lignes: (typeof schema.notifications.$inferInsert)[] = [];
  for (const f of utiles) {
    const a = apprenants.find((x) => x.id === f.apprenantId);
    if (!a) continue;
    const classe = classes.find((c) => c.id === f.donnees.classeId)?.libelle;
    const demandeId = String(f.donnees.demandeId ?? "");
    const rattachee = demandes.get(demandeId);
    const acte = rattachee ? LIBELLE_ACTE[rattachee.typeActe] : "Acte administratif";
    const [titre, texte] =
      f.type === "ABSENCE" ? [`Absence de ${a.prenoms}`, `${a.prenoms} a été noté·e absent·e le ${dateFr(f.donnees.date)}${classe ? ` en ${classe}` : ""}. Vous pouvez justifier l'absence auprès de l'établissement.`]
      : f.type === "EVALUATION" ? [`Nouvelle note pour ${a.prenoms}`, `${f.donnees.matiere} : ${String(f.donnees.note).replace(".", ",")}/20.`]
      : f.type === "CORRECTION_EVALUATION" ? [`Note corrigée pour ${a.prenoms}`, `Nouvelle note : ${String(f.donnees.nouvelleNote).replace(".", ",")}/20 — motif : ${f.donnees.motif}.`]
      : f.type === "INSCRIPTION" ? [`Inscription de ${a.prenoms} confirmée`, `${a.prenoms} est inscrit·e${classe ? ` en ${classe}` : ""} pour l'année ${f.donnees.anneeScolaire ?? ""}.`]
      : f.type === "CERTIFICATION" ? [`Diplôme délivré à ${a.prenoms}`, `${f.donnees.examen} — mention ${f.donnees.mention}. Le diplôme est vérifiable en ligne par QR code.`]
      : f.type === "DECISION_JUSTIFICATION" ? (f.donnees.decision === "validee"
        ? [`Justificatif validé pour ${a.prenoms}`, `L'établissement a validé le justificatif d'absence de ${a.prenoms}.`]
        : [`Justificatif refusé pour ${a.prenoms}`, `L'établissement a refusé le justificatif d'absence de ${a.prenoms}${f.donnees.motif ? ` — motif : ${f.donnees.motif}` : ""}.`])
      : f.type === "ACTE_DISPONIBLE" ? [`${acte} : prêt à retirer`, `Mis à disposition le ${dateFr(f.donnees.disponibleLe)}. Vérifiez dans vos démarches le mode de retrait et la pièce d'identité exigés avant de vous déplacer.`]
      : f.type === "ACTE_REMIS" ? [`${acte} : remis`, `Remis le ${dateFr(f.donnees.remisLe)}. L'authenticité du document se vérifie en ligne avec l'identifiant ${demandeId}.`]
      : f.type === "ACTE_REFUSE" ? [`${acte} : demande refusée`, `Le guichet a refusé cette demande le ${dateFr(f.donnees.refuseLe)}${f.donnees.motif ? ` — motif : ${f.donnees.motif}` : ""}. Un refus ne se rouvre pas : une nouvelle demande se dépose une fois la pièce manquante obtenue.`]
      : f.type === "ALLOCATION_DECIDEE" ? [`Décision sur votre allocation ${String(f.donnees.anneeUniversitaire ?? "")}`.trim(), `L'autorité compétente a statué le ${dateFr(f.donnees.decideLe)} sur votre dossier d'allocation. Consultez le statut et la référence du texte dans votre espace. Aucune somme n'est précisée ici : la liquidation reste à l'administration payeuse.`]
      : [`Transfert de ${a.prenoms}`, `Le dossier de ${a.prenoms} a été transféré vers son nouvel établissement, sans ressaisie.`];
    const destinataires = new Set(PERSONNEL.has(f.type)
      ? (a.npi ? [a.npi] : [])
      : [...liens.filter((l) => l.apprenantId === a.id && l.verifie).map((l) => l.responsableNpi), ...(a.npi ? [a.npi] : [])]);
    for (const npi of destinataires) lignes.push({ id: `NOT-${randomUUID()}`, destinataireNpi: npi, titre, texte, evenementId: f.id });
  }
  if (lignes.length) await base().insert(schema.notifications).values(lignes);
}

export async function notificationsDe(npi: string, limite = 50) {
  const { desc } = await import("drizzle-orm");
  return base().select().from(schema.notifications).where(eq(schema.notifications.destinataireNpi, npi)).orderBy(desc(schema.notifications.creeLe)).limit(limite);
}
