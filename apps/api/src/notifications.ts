import { randomUUID } from "node:crypto";
import { LIBELLE_ACTE } from "@beile/contracts";
import { schema } from "@beile/db";
import { and, eq, gte, inArray } from "drizzle-orm";
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
  const utiles = faits.filter((f) => ["ABSENCE", "EVALUATION", "INSCRIPTION", "CORRECTION_EVALUATION", "CERTIFICATION", "TRANSFERT", "CHANGEMENT_CLASSE", "DECISION_JUSTIFICATION", ...PERSONNEL].includes(f.type));
  if (!utiles.length) return;
  const ids = [...new Set(utiles.map((f) => f.apprenantId))];
  const [apprenants, liens] = await Promise.all([
    base().select().from(schema.apprenants).where(inArray(schema.apprenants.id, ids)),
    base().select().from(schema.liensFamiliaux).where(inArray(schema.liensFamiliaux.apprenantId, ids)),
  ]);
  const classeDe = (f: FaitNotifiable) => f.donnees.classeId ?? (f.type === "CHANGEMENT_CLASSE" ? f.donnees.versClasseId : undefined);
  const classeIds = [...new Set(utiles.map(classeDe).filter((x): x is string => typeof x === "string"))];
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
    const classe = classes.find((c) => c.id === classeDe(f))?.libelle;
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
      // Le motif n'est pas repris : il peut être disciplinaire, et un téléphone se partage. L'école l'explique de vive voix.
      : f.type === "CHANGEMENT_CLASSE" ? [`Changement de classe de ${a.prenoms}`, `${a.prenoms} rejoint la classe ${classe ?? ""} dans le même établissement. Ses notes déjà obtenues sont conservées.`]
      : f.type === "ALLOCATION_DECIDEE" ? [`Décision sur votre allocation ${String(f.donnees.anneeUniversitaire ?? "")}`.trim(), `L'autorité compétente a statué le ${dateFr(f.donnees.decideLe)} sur votre dossier d'allocation. Consultez le statut et la référence du texte dans votre espace. Aucune somme n'est précisée ici : la liquidation reste à l'administration payeuse.`]
      : [`Transfert de ${a.prenoms}`, `Le dossier de ${a.prenoms} a été transféré vers son nouvel établissement, sans ressaisie.`];
    const destinataires = new Set(PERSONNEL.has(f.type)
      ? (a.npi ? [a.npi] : [])
      : [...liens.filter((l) => l.apprenantId === a.id && l.verifie).map((l) => l.responsableNpi), ...(a.npi ? [a.npi] : [])]);
    for (const npi of destinataires) lignes.push({ id: `NOT-${randomUUID()}`, destinataireNpi: npi, titre, texte, evenementId: f.id });
  }
  if (lignes.length) await base().insert(schema.notifications).values(lignes);
  await avisSms(lignes, utiles);
}

/**
 * Notification d'une étape qui n'est pas un fait du registre (demande de transfert, refus, retrait) : mêmes
 * destinataires que pour un fait — responsables au lien vérifié et l'apprenant lui-même. Jamais bloquante.
 */
export async function notifierFamille(apprenantId: string, message: (prenoms: string) => [string, string]) {
  try {
    const [a] = await base().select().from(schema.apprenants).where(eq(schema.apprenants.id, apprenantId));
    if (!a) return;
    const liens = await base().select().from(schema.liensFamiliaux).where(and(eq(schema.liensFamiliaux.apprenantId, apprenantId), eq(schema.liensFamiliaux.verifie, true)));
    const [titre, texte] = message(a.prenoms);
    const destinataires = new Set([...liens.map((l) => l.responsableNpi), ...(a.npi ? [a.npi] : [])]);
    if (destinataires.size) await base().insert(schema.notifications).values([...destinataires].map((npi) => ({ id: `NOT-${randomUUID()}`, destinataireNpi: npi, titre, texte, evenementId: null })));
  } catch (err) {
    console.error("Notification de la famille impossible :", err instanceof Error ? err.message : err);
  }
}

/**
 * Avis SMS : seulement pour une absence (au plus un par compte et par jour) et un diplôme délivré, seulement vers
 * un numéro VÉRIFIÉ (preuve de possession par code). Le texte ne nomme pas l'enfant et ne donne aucune note : un
 * téléphone se partage. Préparés sans envoi tant que BEILE_AVIS_SMS vaut « journal » (voir messagerie.ts).
 */
const TEXTE_AVIS: Record<string, [string, string]> = {
  ABSENCE: ["avis-absence", "BEILE : une absence a été enregistrée aujourd'hui pour un enfant dont vous êtes responsable. Connectez-vous pour la consulter ou la justifier."],
  CERTIFICATION: ["avis-diplome", "BEILE : un diplôme a été délivré. Il est consultable et vérifiable dans votre espace."],
};

async function avisSms(lignes: (typeof schema.notifications.$inferInsert)[], faits: FaitNotifiable[]) {
  const typeDe = new Map(faits.map((f) => [f.id, f.type]));
  const parNpi = new Map<string, Set<string>>();
  for (const l of lignes) {
    const t = typeDe.get(String(l.evenementId));
    if (t && TEXTE_AVIS[t]) parNpi.set(l.destinataireNpi, (parNpi.get(l.destinataireNpi) ?? new Set()).add(t));
  }
  if (!parNpi.size) return;
  const comptes = await base().select({ id: schema.comptes.id, npi: schema.profils.npi, telephone: schema.comptes.telephone })
    .from(schema.comptes).innerJoin(schema.profils, eq(schema.profils.id, schema.comptes.profilId))
    .where(and(inArray(schema.profils.npi, [...parNpi.keys()]), eq(schema.comptes.actif, true), eq(schema.comptes.telephoneVerifie, true)));
  if (!comptes.length) return;
  const debutJour = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const dejaAvises = new Set((await base().select({ c: schema.messagesSortants.compteId, o: schema.messagesSortants.objet }).from(schema.messagesSortants)
    .where(and(inArray(schema.messagesSortants.compteId, comptes.map((c) => c.id)), gte(schema.messagesSortants.creeLe, debutJour)))).map((x) => `${x.c}|${x.o}`));
  const { preparerAvisSms } = await import("./messagerie");
  for (const c of comptes) {
    if (!c.telephone || !c.npi) continue;
    for (const t of parNpi.get(c.npi) ?? []) {
      const [objet, texte] = TEXTE_AVIS[t]!;
      if (dejaAvises.has(`${c.id}|${objet}`)) continue;
      dejaAvises.add(`${c.id}|${objet}`);
      await preparerAvisSms({ compteId: c.id, destinataire: c.telephone, objet, texte });
    }
  }
}

export async function notificationsDe(npi: string, limite = 50) {
  const { desc } = await import("drizzle-orm");
  return base().select().from(schema.notifications).where(eq(schema.notifications.destinataireNpi, npi)).orderBy(desc(schema.notifications.creeLe)).limit(limite);
}
