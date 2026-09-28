import { randomUUID } from "node:crypto";
import type { ContratPedagogique, LigneCapitalisation, Mention, ResultatCapitalisation } from "@beile/contracts";
import {
  AvisConseil, AutoriteEquivalence, Composante, ConclusionControle, CycleEpes, DecisionDiplome,
  DeliberationDiplome, Diplome, homologationOperante, ModeDeliberation, OfficeDeliberant,
  PhaseEpes, PorteeRegle, RegleCompensation, ReglePonderation, RegleSessionRetenue, RegimePedagogique,
  SessionEvaluation, StatutAccreditation, StatutAgrement, StatutCompte, StatutEquivalence,
  StatutInscriptionUE, StatutJury, modeCertifiable, Tutelle, TypeGroupe, TypePeriode, TypeUE,
  VoieAcquisition, VOIES_SANS_NOTE,
} from "@beile/contracts";
import { schema } from "@beile/db";
import { aujourdhui } from "@beile/simulation/scolarite";
import { communesDuPerimetre, DICTIONNAIRE } from "@beile/simulation/semantique";
import { and, asc, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authentifie, base, corps, journaliser, refuser, type Variables } from "./commun";
import { dejaSaisi, ID_SAISIE, inscrireAuRegistre, type NouveauFait } from "./ecriture";
import { mentionDe } from "./examens";
import { accesEtablissement, bureauSup, ID_ETAB, monApprenant, monEnseignant } from "./superieur";
import { perimetrePilotage } from "./pilotage";

/**
 * Scolarité du supérieur — écrire les faits de gestion des étudiants et leurs projections.
 *
 * Doctrine, identique aux autres volets et non négociable :
 *  - LE REGISTRE SEUL ÉCRIT L'ÉTAT D'UNE PERSONNE. Toute ligne nominative nouvelle (inscription,
 *    contrat, note, acquis, jury, délibération, transfert) passe par `inscrireAuRegistre`, et sa
 *    projection se construit dans LA MÊME transaction (`ecriture.ts`). Aucune table de scolarité
 *    écrite à la main : sinon `ledger.evenements` cesse d'être la source et la recette ne prouve plus rien.
 *  - AUCUN NOUVEAU RÔLE. Ce module réutilise les portes de `superieur.ts` : `accesEtablissement`
 *    (chef : écrire ; inspecteur de la circonscription : lire), `bureauSup` (administration centrale
 *    au niveau national), `monApprenant`, `monEnseignant`, `perimetrePilotage` (agrégats seulement).
 *  - LES PORTÉES SONT CELLES DE L'ÉTAT. Un jury d'examen national, un cycle EPES, une homologation et
 *    une équivalence « nationale » ne se déclarent pas depuis le bureau d'un établissement.
 *  - LE CLIENT NE POMPE PAS LES CHIFFRES. Crédits validés, moyenne générale et mention sont calculés
 *    ici depuis les acquis enregistrés : une mention saisie serait une inflation libre du diplôme.
 *  - LIBERTÉ, PAS BRICOLAGE. Un établissement choisit son régime et ses huit paramètres ; la règle qui
 *    l'a jugé est citée sur chaque acquis (`regleValidationId`).
 */
export const scolariteSuperieure = new Hono<{ Variables: Variables }>();

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ANNEE = z.string().regex(/^\d{4}-\d{4}$/);
const ID_APPRENANT = z.string().regex(/^APP-\d{6}$/);
const ID_INSCRIPTION = z.string().regex(/^INS-[A-Za-z0-9-]+$/);
const ID_PERIODE = z.string().regex(/^PRI-[A-Za-z0-9-]+$/);
const ID_UE = z.string().regex(/^UEC-[A-Za-z0-9-]+$/);
const ID_OFFRE = z.string().regex(/^OFU-[A-Za-z0-9-]+$/);
const ID_GROUPE = z.string().regex(/^GRP-[A-Za-z0-9-]+$/);
const ID_CONTRAT = z.string().regex(/^ICU-[A-Za-z0-9-]+$/);
const ID_REGLE = z.string().regex(/^RGL-[A-Za-z0-9-]+$/);
const ID_JURY = z.string().regex(/^JUR-[A-Za-z0-9-]+$/);
const ID_EQUIVALENCE = z.string().regex(/^EQC-[A-Za-z0-9-:.]+$/);
const ID_HOMOLOGATION = z.string().regex(/^HMG-[A-Za-z0-9-]+$/);
const ID_FILIERE = z.string().regex(/^FIL-[A-Za-z0-9-]+$/);
const NOTE = z.number().min(0).max(20).refine((n) => Number.isInteger(n * 4), "au quart de point");
// Aucun vocabulaire fermé ne se redéclare ici : les enums sont ceux des contrats, seule liste qui
// vaille à la fois pour l'API, pour l'écran et pour les colonnes `text()` de la base.
// Seule exception assumée : une sous-liste fermée par le circuit, dérivée de la liste du contrat.
const HORS_NOTE = VoieAcquisition.refine((v) => VOIES_SANS_NOTE.includes(v), "voie sans note attendue");

/* ------------------------------------------------------------------ Règle applicable (précédence des portées) */

const RANG: Record<PorteeRegle, number> = { nationale: 0, etablissement: 1, filiere: 2, periode: 3 };
type RegleLue = Awaited<ReturnType<typeof regleAppliquee>>;

/**
 * La règle en vigueur pour une décision : la portée la plus précise qui couvre la cible, appliquée EN
 * BLOC (voir `RegleValidation`) — la décision reste donc rattachable à UNE ligne citable à l'étudiant.
 *
 * Aucune ligne trouvée = décision impossible (409), et c'est voulu : `validations_ue.regle_validation_id`
 * est une clé étrangère, et une moyenne calculée sous des paramètres que personne n'a déclarés ne se
 * défendrait devant aucun jury.
 */
async function regleAppliquee(cible: { etablissementId: string; filiereId: string; periodeId: string | null; regime: RegimePedagogique }) {
  const lignes = await base().select().from(schema.reglesValidation).where(and(
    or(isNull(schema.reglesValidation.etablissementId), eq(schema.reglesValidation.etablissementId, cible.etablissementId)),
    or(isNull(schema.reglesValidation.filiereId), eq(schema.reglesValidation.filiereId, cible.filiereId)),
    // Une règle attachée à une période ne couvre pas une décision qui n'a pas de période.
    or(isNull(schema.reglesValidation.periodeId), eq(schema.reglesValidation.periodeId, cible.periodeId ?? "")),
    or(isNull(schema.reglesValidation.regime), eq(schema.reglesValidation.regime, cible.regime)),
  ));
  const meilleure = lignes.sort((a, b) => RANG[a.portee] - RANG[b.portee]).at(-1);
  if (!meilleure) throw new HTTPException(409, { message: "Aucune règle de validation en vigueur pour ce périmètre : décision impossible" });
  return meilleure;
}

/* ------------------------------------------------------------------ Moteur d'acquisition (les huit paramètres) */

interface NoteLue { ueId: string; session: SessionEvaluation; note: number; creditsEcts: number; coefficient: number; survenuLe: Date }
type Decision = { acquise: boolean; voie: "note_session" | "compensation"; moyenne: number | null; justification: string };

const poidsDe = (n: { creditsEcts: number; coefficient: number }, ponderation: RegleLue["ponderation"]) =>
  ponderation === "ects" ? n.creditsEcts : ponderation === "coefficient" ? n.coefficient : n.creditsEcts * n.coefficient;

function moyennePonderee(lignes: { note: number; poids: number }[]) {
  const total = lignes.reduce((s, x) => s + x.poids, 0);
  return total ? lignes.reduce((s, x) => s + x.note * x.poids, 0) / total : null;
}

/** Une UE repassée plusieurs fois ne compte qu'une fois : le paramètre 5 dit laquelle est retenue. */
function retenuesParUe(notes: NoteLue[], sessionRetenue: RegleLue["sessionRetenue"]) {
  const parUe = new Map<string, NoteLue>();
  for (const n of notes) {
    const deja = parUe.get(n.ueId);
    if (!deja || (sessionRetenue === "meilleure" ? n.note > deja.note : n.survenuLe > deja.survenuLe)) parUe.set(n.ueId, n);
  }
  return parUe;
}

const moyenneDePeriode = (notes: NoteLue[], regle: RegleLue) =>
  moyennePonderee([...retenuesParUe(notes, regle.sessionRetenue).values()].map((n) => ({ note: n.note, poids: poidsDe(n, regle.ponderation) })));

const deux = (n: number) => n.toFixed(2);

/**
 * Décision d'acquisition d'une UE par la règle appliquée. La `justification` renvoyée est celle qui
 * sera enregistrée sur l'acquis : c'est le texte que l'étudiant lit, pas une trace interne.
 *
 * La compensation n'est jamais une faveur. Elle suppose la moyenne exigée (paramètre 6) et, bloc par
 * bloc (paramètre 3), un bloc entièrement noté. Des données manquantes rendent une décision
 * « impossible », jamais un acquis par défaut.
 */
function deciderAcquisition(p: { regle: RegleLue; notesUe: NoteLue[]; notesPeriode: NoteLue[]; blocUeIds: string[] | null }): Decision {
  const { regle, notesUe, notesPeriode } = p;
  if (!notesUe.length) return { acquise: false, voie: "note_session", moyenne: null, justification: "Aucune note enregistrée pour cette UE : rien à valider." };
  const retenue = notesUe[0] ? retenuesParUe(notesUe, regle.sessionRetenue).get(notesUe[0].ueId)! : null;
  if (!retenue) return { acquise: false, voie: "note_session", moyenne: null, justification: "Aucune note enregistrée pour cette UE : rien à valider." };
  const note = retenue.note;
  if (regle.noteEliminatoire !== null && note < regle.noteEliminatoire) {
    return { acquise: false, voie: "note_session", moyenne: note, justification: `Note ${deux(note)} < seuil éliminatoire ${deux(regle.noteEliminatoire)} : aucune compensation ne rachète cette UE.` };
  }
  if (note >= regle.seuilAcquisition) {
    return { acquise: true, voie: "note_session", moyenne: note, justification: `Note ${deux(note)} (session ${retenue.session}) ≥ seuil d'acquisition ${deux(regle.seuilAcquisition)} — règle ${regle.id}.` };
  }
  if (regle.compensation === "aucune") {
    return { acquise: false, voie: "compensation", moyenne: note, justification: `Note ${deux(note)} < seuil ${deux(regle.seuilAcquisition)} et compensation exclue par la règle ${regle.id}.` };
  }
  // Paramètre 6 laissé à null = « aucune condition de moyenne » assumée par la règle déclarée : le
  // modèle suit le paramètre, il ne le corrige pas en secret.
  if (regle.seuilMoyennePeriode !== null) {
    const moyenne = moyenneDePeriode(notesPeriode, regle);
    if (moyenne === null) return { acquise: false, voie: "compensation", moyenne: null, justification: "Compensation impossible : aucune moyenne de période calculable (aucune note)." };
    if (moyenne < regle.seuilMoyennePeriode) return { acquise: false, voie: "compensation", moyenne, justification: `Compensation refusée : moyenne de période ${deux(moyenne)} < ${deux(regle.seuilMoyennePeriode)} exigé par la règle ${regle.id}.` };
  }
  if (regle.compensation === "par_bloc") {
    if (!p.blocUeIds?.length) return { acquise: false, voie: "compensation", moyenne: note, justification: `Règle ${regle.id} : compensation « par bloc », mais cette UE n'est dans aucun bloc déclaré — décision impossible.` };
    const duBloc = [...retenuesParUe(notesPeriode.filter((n) => p.blocUeIds!.includes(n.ueId)), regle.sessionRetenue).values()];
    if (duBloc.length < 2) return { acquise: false, voie: "compensation", moyenne: note, justification: "Compensation par bloc impossible : le bloc n'est pas entièrement noté." };
    const moyenneBloc = moyennePonderee(duBloc.map((n) => ({ note: n.note, poids: poidsDe(n, regle.ponderation) })))!;
    if (moyenneBloc < regle.seuilAcquisition) return { acquise: false, voie: "compensation", moyenne: moyenneBloc, justification: `Compensation refusée : moyenne du bloc ${deux(moyenneBloc)} < seuil ${deux(regle.seuilAcquisition)}.` };
    return { acquise: true, voie: "compensation", moyenne: moyenneBloc, justification: `Compensation par bloc : note ${deux(note)} rachetée par la moyenne du bloc (${deux(moyenneBloc)}) — règle ${regle.id}.` };
  }
  const moyenne = moyenneDePeriode(notesPeriode, regle);
  if (moyenne === null) return { acquise: false, voie: "compensation", moyenne: null, justification: "Compensation impossible : aucune moyenne de période calculable (aucune note)." };
  return { acquise: true, voie: "compensation", moyenne, justification: `Compensation entre toutes les UE : moyenne de période ${deux(moyenne)} rachète la note ${deux(note)} — règle ${regle.id}.` };
}

/** Paramètre 7 : au-delà de sa durée, un acquis reste au registre mais ne compte plus au diplôme. */
function acquisToujoursValide(acquiseLe: string, dureeAns: number) {
  return !dureeAns || Number(acquiseLe.slice(0, 4)) + dureeAns >= Number(aujourdhui().slice(0, 4));
}

/* ------------------------------------------------------------------ Portes d'autorité partagées */

/** Droits d'un jury : examen national = bureau du supérieur ; capitalisation = la direction de
 *  l'établissement dont la filière est jugée. Le mode doit être ouvert au diplôme — deux autorités
 *  coexistent au Bénin, mais pas pour n'importe quel diplôme. */
async function accesJury(c: Context<{ Variables: Variables }>, etablissementId: string, jury: { autorite: "examen_national" | "jury_capitalisation"; diplome: Diplome; filiereId: string | null }, action: string) {
  if (!modeCertifiable(jury.diplome, jury.autorite)) throw new HTTPException(422, { message: `Le diplôme ${jury.diplome} n'est pas délibéré par cette autorité` });
  if (jury.autorite === "examen_national") return { profil: await bureauSup(c, action) };
  if (!jury.filiereId) throw new HTTPException(422, { message: "Un jury de capitalisation doit désigner la filière qu'il juge" });
  const [filiere] = await base().select({ etablissementId: schema.filiereSuperieure.etablissementId }).from(schema.filiereSuperieure).where(eq(schema.filiereSuperieure.id, jury.filiereId));
  if (!filiere || filiere.etablissementId !== etablissementId) throw new HTTPException(422, { message: "La filière jugée ne relève pas de cet établissement" });
  return { profil: (await accesEtablissement(c, etablissementId, true)).profil };
}

/** Droit d'inscrire d'un établissement privé, selon l'étape du cycle EPES. Un établissement public n'a
 *  pas de cycle : l'autorisation d'ouverture ne contraint pas l'État lui-même. */
async function droitInscrire(etablissementId: string, statutEtablissement: string) {
  if (statutEtablissement === "public") return;
  const lignes = await base().select().from(schema.cyclesEpes).where(eq(schema.cyclesEpes.etablissementId, etablissementId));
  const ouvert = lignes.some((x) => x.statut === "accorde" && (x.phase === "agrement" || (x.phase === "autorisation_ouverture" && (!x.echeanceLe || x.echeanceLe >= aujourdhui()))));
  if (ouvert) return;
  throw new HTTPException(409, { message: `Établissement privé ${lignes[0] ? `au cycle « ${lignes[0].phase} » (${lignes[0].statut})` : "sans cycle EPES enregistré"} : le droit d'inscrire n'est pas ouvert` });
}

async function filiereDe(filiereId: string) {
  const [f] = await base().select().from(schema.filiereSuperieure).where(eq(schema.filiereSuperieure.id, filiereId));
  if (!f) throw new HTTPException(404, { message: "Filière inconnue" });
  return f;
}

/** Inscription supérieure courante d'une personne — lue dans la projection, jamais fournie par le client.
 *  Partagée avec le guichet de l'étudiant (`guichet.ts`) : un acte se délivre au titre d'une inscription. */
export async function inscriptionDe(apprenantId: string, etablissementId?: string, anneeUniversitaire?: string) {
  const [insc] = await base().select().from(schema.inscriptionsSuperieures)
    .where(and(
      eq(schema.inscriptionsSuperieures.apprenantId, apprenantId),
      ...(etablissementId ? [eq(schema.inscriptionsSuperieures.etablissementId, etablissementId)] : []),
      ...(anneeUniversitaire ? [eq(schema.inscriptionsSuperieures.anneeUniversitaire, anneeUniversitaire)] : []),
    ))
    .orderBy(desc(schema.inscriptionsSuperieures.anneeUniversitaire)).limit(1);
  return insc ?? null;
}

/* ================================================================== Référentiel de scolarité d'un établissement
 * Périodes, UE, offres et groupes ne sont pas des faits sur une personne : ce sont des décisions de
 * gestion, écrites directement. Mais sous la porte `accesEtablissement`, et chaque rattachement est
 * vérifié — faute de quoi une direction déclarerait des UE chez son voisin.
 */

scolariteSuperieure.post("/etablissements/:id/periodes", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil } = await accesEtablissement(c, id, true);
  const saisie = await corps(c, z.object({
    filiereId: ID_FILIERE, composante: Composante.nullable().default(null),
    type: TypePeriode, numero: z.number().int().min(1).max(12),
    intitule: z.string().trim().min(2).max(80), anneeUniversitaire: ANNEE,
    debut: DATE.nullable().default(null), fin: DATE.nullable().default(null),
    creditsAttendus: z.number().int().min(0).max(60).default(0),
  }).strict());
  if ((await filiereDe(saisie.filiereId)).etablissementId !== id) throw new HTTPException(422, { message: "Filière hors de cet établissement" });
  if (saisie.debut && saisie.fin && saisie.fin < saisie.debut) throw new HTTPException(422, { message: "Date de fin antérieure à la date de début" });
  const [periode] = await base().insert(schema.periodes).values({ id: `PRI-${randomUUID()}`, ...saisie })
    .onConflictDoUpdate({
      target: [schema.periodes.filiereId, schema.periodes.anneeUniversitaire, schema.periodes.composante, schema.periodes.type, schema.periodes.numero],
      set: { intitule: saisie.intitule, debut: saisie.debut, fin: saisie.fin, creditsAttendus: saisie.creditsAttendus },
    }).returning();
  await journaliser(profil, "Déclaration d'une période de formation", `${saisie.filiereId} · ${saisie.type} ${saisie.numero}`, "gestion", true, null);
  return c.json(periode, 201);
});

scolariteSuperieure.post("/etablissements/:id/unites-enseignement", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil } = await accesEtablissement(c, id, true);
  const saisie = await corps(c, z.object({
    filiereId: ID_FILIERE, code: z.string().trim().min(2).max(16), intitule: z.string().trim().min(2).max(120),
    type: TypeUE,
    creditsEcts: z.number().int().min(1).max(30), coefficient: z.number().min(0.5).max(10).default(1),
    periodeType: TypePeriode.nullable().default(null),
    periodeNumero: z.number().int().min(1).max(12).nullable().default(null),
    prerequis: z.array(z.string().trim().min(2).max(16)).max(20).default([]),
  }).strict());
  if ((await filiereDe(saisie.filiereId)).etablissementId !== id) throw new HTTPException(422, { message: "Filière hors de cet établissement" });
  const [ue] = await base().insert(schema.unitesEnseignement).values({ id: `UEC-${randomUUID()}`, ...saisie })
    .onConflictDoUpdate({
      target: [schema.unitesEnseignement.filiereId, schema.unitesEnseignement.code],
      set: { intitule: saisie.intitule, type: saisie.type, creditsEcts: saisie.creditsEcts, coefficient: saisie.coefficient, periodeType: saisie.periodeType, periodeNumero: saisie.periodeNumero, prerequis: saisie.prerequis },
    }).returning();
  await journaliser(profil, "Déclaration d'une unité d'enseignement", `${saisie.filiereId} · ${saisie.code}`, "gestion", true, null);
  return c.json(ue, 201);
});

scolariteSuperieure.post("/etablissements/:id/offres", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil } = await accesEtablissement(c, id, true);
  const saisie = await corps(c, z.object({
    ueId: ID_UE, periodeId: ID_PERIODE, enseignantId: z.string().regex(/^ENS-[A-Za-z0-9-]+$/).nullable().default(null),
    session: SessionEvaluation.default("normale"),
    volumeCm: z.number().int().min(0).max(400).default(0), volumeTd: z.number().int().min(0).max(400).default(0),
    volumeTp: z.number().int().min(0).max(400).default(0), capacite: z.number().int().min(0).max(2000).nullable().default(null),
  }).strict());
  const [periode] = await base().select({ filiereId: schema.periodes.filiereId }).from(schema.periodes).where(eq(schema.periodes.id, saisie.periodeId));
  if (!periode) throw new HTTPException(422, { message: "Période inconnue" });
  if ((await filiereDe(periode.filiereId)).etablissementId !== id) throw new HTTPException(422, { message: "Période hors de cet établissement" });
  const [ue] = await base().select().from(schema.unitesEnseignement).where(eq(schema.unitesEnseignement.id, saisie.ueId));
  if (!ue) throw new HTTPException(404, { message: "Unité d'enseignement inconnue" });
  if (ue.filiereId !== periode.filiereId) throw new HTTPException(422, { message: "Cette UE n'appartient pas à la filière de la période" });
  if (saisie.enseignantId) {
    const [e] = await base().select({ id: schema.enseignants.id }).from(schema.enseignants)
      .where(and(eq(schema.enseignants.id, saisie.enseignantId), eq(schema.enseignants.etablissementId, id)));
    if (!e) throw new HTTPException(422, { message: "Enseignant rattaché à un autre établissement" });
  }
  const valeurs = { ueId: ue.id, periodeId: saisie.periodeId, etablissementId: id, enseignantId: saisie.enseignantId, session: saisie.session, volumeCm: saisie.volumeCm, volumeTd: saisie.volumeTd, volumeTp: saisie.volumeTp, capacite: saisie.capacite };
  const [offre] = await base().insert(schema.offresUe).values({ id: `OFU-${randomUUID()}`, ...valeurs })
    .onConflictDoUpdate({ target: [schema.offresUe.ueId, schema.offresUe.periodeId, schema.offresUe.session], set: valeurs }).returning();
  await journaliser(profil, "Ouverture d'une offre d'UE", `${saisie.periodeId} · ${ue.code}`, "gestion", true, null);
  return c.json(offre, 201);
});

scolariteSuperieure.post("/etablissements/:id/groupes", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil } = await accesEtablissement(c, id, true);
  const saisie = await corps(c, z.object({
    offreUeId: ID_OFFRE, type: TypeGroupe,
    intitule: z.string().trim().min(1).max(60), capacite: z.number().int().min(1).max(2000),
    enseignantId: z.string().regex(/^ENS-[A-Za-z0-9-]+$/).nullable().default(null), creneau: z.string().trim().max(60).nullable().default(null),
  }).strict());
  const [offre] = await base().select({ etablissementId: schema.offresUe.etablissementId }).from(schema.offresUe).where(eq(schema.offresUe.id, saisie.offreUeId));
  if (!offre || offre.etablissementId !== id) throw new HTTPException(422, { message: "Offre hors de cet établissement" });
  if (saisie.enseignantId) {
    const [e] = await base().select({ id: schema.enseignants.id }).from(schema.enseignants)
      .where(and(eq(schema.enseignants.id, saisie.enseignantId), eq(schema.enseignants.etablissementId, id)));
    if (!e) throw new HTTPException(422, { message: "Enseignant rattaché à un autre établissement" });
  }
  const [groupe] = await base().insert(schema.groupes).values({ id: `GRP-${randomUUID()}`, ...saisie })
    .onConflictDoUpdate({ target: [schema.groupes.offreUeId, schema.groupes.type, schema.groupes.intitule], set: { capacite: saisie.capacite, enseignantId: saisie.enseignantId, creneau: saisie.creneau } })
    .returning();
  await journaliser(profil, "Ouverture d'un groupe", `${saisie.offreUeId} · ${saisie.type} ${saisie.intitule}`, "gestion", true, null);
  return c.json(groupe, 201);
});

scolariteSuperieure.get("/etablissements/:id/filieres", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil, finalite } = await accesEtablissement(c, id);
  // Les filières du catalogue national se lisent sous `perimetrePilotage` ; celles de CHEZ SOI se
  // lisent par la porte établissement. Sans cette ligne, un chef ne pourrait pas nommer la filière
  // qu'il déclare, et son écran ne serait peuplé que d'identifiants `FIL-…`.
  const lignes = await base().select().from(schema.filiereSuperieure)
    .where(eq(schema.filiereSuperieure.etablissementId, id))
    .orderBy(asc(schema.filiereSuperieure.nom));
  await journaliser(profil, "Consultation des filières de l'établissement", `${lignes.length} filière(s)`, finalite, true, null);
  return c.json(lignes);
});

scolariteSuperieure.get("/etablissements/:id/periodes", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil, finalite } = await accesEtablissement(c, id);
  const annee = c.req.query("annee");
  const filiereId = c.req.query("filiereId");
  const { periodes } = schema;
  const lignes = await base().select({ periode: periodes }).from(periodes)
    .innerJoin(schema.filiereSuperieure, eq(schema.filiereSuperieure.id, periodes.filiereId))
    .where(eq(schema.filiereSuperieure.etablissementId, id))
    .orderBy(asc(periodes.anneeUniversitaire), asc(periodes.numero));
  const vues = lignes
    .filter((l) => (!annee || l.periode.anneeUniversitaire === annee) && (!filiereId || l.periode.filiereId === filiereId))
    .map((l) => l.periode);
  await journaliser(profil, "Consultation des périodes de formation", `${vues.length} période(s)`, finalite, true, null);
  return c.json(vues);
});

scolariteSuperieure.get("/etablissements/:id/offres", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil, finalite } = await accesEtablissement(c, id);
  const periodeId = c.req.query("periodeId");
  const lignes = await base().select().from(schema.offresUe)
    .where(and(eq(schema.offresUe.etablissementId, id), ...(periodeId ? [eq(schema.offresUe.periodeId, periodeId)] : [])))
    .orderBy(asc(schema.offresUe.periodeId), asc(schema.offresUe.session));
  await journaliser(profil, "Consultation des offres d'UE", `${lignes.length} offre(s)`, finalite, true, null);
  return c.json(lignes);
});

/** Catalogue d'UE des filières de l'établissement : ce qu'une équivalence ou un transfert peut reconnaître. */
scolariteSuperieure.get("/etablissements/:id/unites-enseignement", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil, finalite } = await accesEtablissement(c, id);
  const filiereId = c.req.query("filiereId");
  const lignes = await base().select({ ue: schema.unitesEnseignement, filiereNom: schema.filiereSuperieure.nom })
    .from(schema.unitesEnseignement)
    .innerJoin(schema.filiereSuperieure, eq(schema.filiereSuperieure.id, schema.unitesEnseignement.filiereId))
    .where(and(eq(schema.filiereSuperieure.etablissementId, id), ...(filiereId ? [eq(schema.unitesEnseignement.filiereId, filiereId)] : [])))
    .orderBy(asc(schema.unitesEnseignement.code));
  await journaliser(profil, "Consultation du catalogue d'UE de l'établissement", `${lignes.length} UE`, finalite, true, null);
  return c.json(lignes);
});

/**
 * Groupes ouverts sur les offres de l'établissement. La déclaration de groupe existait, sa lecture
 * non : une direction qui ouvre un groupe sans pouvoir le relire ne peut ni vérifier la capacité
 * restante ni corriger un créneau. Périmètre strictement le sien, par la même porte.
 */
scolariteSuperieure.get("/etablissements/:id/groupes", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil, finalite } = await accesEtablissement(c, id);
  const offreUeId = c.req.query("offreUeId");
  const lignes = await base().select({ groupe: schema.groupes, offrePeriodeId: schema.offresUe.periodeId })
    .from(schema.groupes)
    .innerJoin(schema.offresUe, eq(schema.offresUe.id, schema.groupes.offreUeId))
    .where(and(eq(schema.offresUe.etablissementId, id), ...(offreUeId ? [eq(schema.groupes.offreUeId, offreUeId)] : [])))
    .orderBy(asc(schema.groupes.offreUeId), asc(schema.groupes.type), asc(schema.groupes.intitule));
  await journaliser(profil, "Consultation des groupes de l'établissement", `${lignes.length} groupe(s)`, finalite, true, null);
  // La période de l'offre voyage avec la ligne : sans elle, filtrer les groupes d'une période
  // signifierait relancer une requête par groupe depuis l'écran.
  return c.json(lignes.map(({ groupe, offrePeriodeId }) => ({ ...groupe, periodeId: offrePeriodeId })));
});

/* ================================================================== Inscription (promotion) */

/**
 * Inscrire une personne dans une filière pour une année. Trois choses ne viennent jamais du client :
 * l'établissement (la porte), le droit d'inscrire (cycle EPES) et la place disponible (projection).
 */
scolariteSuperieure.post("/etablissements/:id/inscriptions", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil, etab } = await accesEtablissement(c, id, true);
  const saisie = await corps(c, z.object({
    apprenantId: ID_APPRENANT, filiereId: ID_FILIERE, composante: Composante.nullable().default(null),
    anneeUniversitaire: ANNEE, regimePedagogique: RegimePedagogique,
    numeroEtudiant: z.string().trim().max(24).nullable().default(null),
    statutCompte: StatutCompte.default("non_precise"),
  }).strict());
  const [apprenant] = await base().select({ id: schema.apprenants.id }).from(schema.apprenants).where(eq(schema.apprenants.id, saisie.apprenantId));
  if (!apprenant) throw new HTTPException(404, { message: "Apprenant inconnu" });
  const filiere = await filiereDe(saisie.filiereId);
  if (filiere.etablissementId !== id) throw new HTTPException(422, { message: "Filière hors de cet établissement" });
  if (saisie.composante && !filiere.composantes.includes(saisie.composante)) throw new HTTPException(422, { message: `Composante ${saisie.composante} non ouverte dans cette filière` });
  await droitInscrire(id, etab.statut);
  if (await inscriptionDe(saisie.apprenantId, id, saisie.anneeUniversitaire)) throw new HTTPException(409, { message: "Déjà inscrit·e dans cet établissement pour cette année" });

  // L'homologation borne les effectifs par son quota déclaré ; son absence ne bloque pas encore
  // l'enseignement, seulement la certification — la porte est au jury, pas au guichet.
  const [hmg] = await base().select({ quotaAnnuel: schema.homologationsFiliere.quotaAnnuel }).from(schema.homologationsFiliere)
    .where(and(eq(schema.homologationsFiliere.etablissementId, id), eq(schema.homologationsFiliere.filiereId, saisie.filiereId)));
  const capaciteFiliere = filiere.capaciteParComposante.find((x) => x.composante === saisie.composante)?.places ?? filiere.capaciteAnnuelle;
  const plafonds = [hmg?.quotaAnnuel ?? null, capaciteFiliere].filter((x): x is number => x !== null);
  const [{ n: deja } = { n: 0 }] = await base().select({ n: count() }).from(schema.inscriptionsSuperieures)
    .where(and(
      eq(schema.inscriptionsSuperieures.filiereId, saisie.filiereId),
      eq(schema.inscriptionsSuperieures.anneeUniversitaire, saisie.anneeUniversitaire),
      ...(saisie.composante ? [eq(schema.inscriptionsSuperieures.composante, saisie.composante)] : []),
    ));
  const plafond = plafonds.length ? Math.min(...plafonds) : null;
  if (plafond !== null && deja >= plafond) {
    await journaliser(profil, "Inscription au-delà du plafond déclaré", `${saisie.filiereId} ${saisie.anneeUniversitaire} (${deja}/${plafond})`, "gestion", false, "capacite");
    throw new HTTPException(409, { message: `Plafond d'inscriptions atteint pour cette filière (${deja}/${plafond})` });
  }

  const inscriptionId = `INS-${randomUUID()}`;
  const [evenementId] = await inscrireAuRegistre([{
    type: "INSCRIPTION_SUPERIEURE", auteurId: profil.id, etablissementId: id, apprenantId: saisie.apprenantId,
    donnees: {
      apprenantId: saisie.apprenantId, inscriptionId, filiereId: saisie.filiereId, composante: saisie.composante,
      numeroEtudiant: saisie.numeroEtudiant, anneeUniversitaire: saisie.anneeUniversitaire,
      regimePedagogique: saisie.regimePedagogique, statutCompte: saisie.statutCompte,
    },
  }]);
  await journaliser(profil, "Inscription dans l'enseignement supérieur", `${saisie.apprenantId} → ${saisie.filiereId} ${saisie.anneeUniversitaire}`, "gestion", true, null);
  return c.json({ inscriptionId, evenementId }, 201);
});

/** Abandon d'une inscription : la promotion ferme, les acquis restent acquis. */
scolariteSuperieure.post("/etablissements/:id/inscriptions/:inscriptionId/abandon", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const inscriptionId = ID_INSCRIPTION.parse(c.req.param("inscriptionId"));
  const { profil } = await accesEtablissement(c, id, true);
  const { motif } = await corps(c, z.object({ motif: z.string().trim().max(140).nullable().default(null) }).strict());
  const [insc] = await base().select().from(schema.inscriptionsSuperieures)
    .where(and(eq(schema.inscriptionsSuperieures.id, inscriptionId), eq(schema.inscriptionsSuperieures.etablissementId, id)));
  if (!insc) throw new HTTPException(404, { message: "Inscription introuvable dans cet établissement" });
  const [evenementId] = await inscrireAuRegistre([{
    type: "ABANDON_SUPERIEUR", auteurId: profil.id, etablissementId: id, apprenantId: insc.apprenantId,
    donnees: { apprenantId: insc.apprenantId, inscriptionSuperieureId: inscriptionId, anneeUniversitaire: insc.anneeUniversitaire, motif },
  }]);
  await journaliser(profil, "Abandon d'une inscription dans le supérieur", inscriptionId, "gestion", true, null);
  return c.json({ inscriptionId, statut: "abandon", evenementId });
});

scolariteSuperieure.get("/etablissements/:id/inscriptions", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil, finalite } = await accesEtablissement(c, id);
  const annee = c.req.query("annee");
  const filiereId = c.req.query("filiereId");
  // Nominatif : jamais par `perimetrePilotage`, seulement par la porte établissement.
  // Le nom accompagne la ligne : une promotion réduite à `APP-000123` est illisible par la direction
  // qui l'a inscrite, et cette jointure ne franchit aucune porte de plus — elle est dans la ligne même.
  const lignes = await base().select({
    inscription: schema.inscriptionsSuperieures,
    apprenant: { id: schema.apprenants.id, nom: schema.apprenants.nom, prenoms: schema.apprenants.prenoms },
    filiere: { id: schema.filiereSuperieure.id, nom: schema.filiereSuperieure.nom, voie: schema.filiereSuperieure.voie, diplomeVise: schema.filiereSuperieure.diplomeVise },
  }).from(schema.inscriptionsSuperieures)
    .innerJoin(schema.apprenants, eq(schema.apprenants.id, schema.inscriptionsSuperieures.apprenantId))
    .innerJoin(schema.filiereSuperieure, eq(schema.filiereSuperieure.id, schema.inscriptionsSuperieures.filiereId))
    .where(and(
      eq(schema.inscriptionsSuperieures.etablissementId, id),
      ...(annee ? [eq(schema.inscriptionsSuperieures.anneeUniversitaire, annee)] : []),
      ...(filiereId ? [eq(schema.inscriptionsSuperieures.filiereId, filiereId)] : []),
    ))
    .orderBy(asc(schema.inscriptionsSuperieures.anneeUniversitaire), asc(schema.inscriptionsSuperieures.id));
  await journaliser(profil, "Consultation des inscriptions de l'établissement", `${lignes.length} inscription(s)`, finalite, true, null);
  return c.json(lignes);
});

/* ================================================================== Contrat pédagogique */

/**
 * Poser une proposition de contrat. L'apprenant ne peut que PROPOSER : la signature engage
 * l'établissement, et `validee` ne s'obtient que par un fait de validation. Les prérequis sont
 * vérifiés contre les acquis enregistrés, jamais contre une déclaration.
 */
scolariteSuperieure.post("/moi/contrat/ue", authentifie, async (c) => {
  const profil = c.get("profil");
  const apprenantId = monApprenant(profil);
  const { offreUeId, groupeId } = await corps(c, z.object({ offreUeId: ID_OFFRE, groupeId: ID_GROUPE.nullable().default(null) }).strict());
  const insc = await inscriptionDe(apprenantId);
  if (!insc) throw new HTTPException(404, { message: "Aucune inscription dans l'enseignement supérieur" });
  const [offre] = await base().select().from(schema.offresUe).where(eq(schema.offresUe.id, offreUeId));
  if (!offre) throw new HTTPException(404, { message: "Offre d'UE introuvable" });
  if (offre.etablissementId !== insc.etablissementId) throw new HTTPException(422, { message: "Cette offre ne relève pas de votre établissement d'attache" });
  const [ue] = await base().select().from(schema.unitesEnseignement).where(eq(schema.unitesEnseignement.id, offre.ueId));
  if (!ue) throw new HTTPException(404, { message: "Unité d'enseignement inconnue" });
  if (groupeId) {
    const [g] = await base().select().from(schema.groupes).where(eq(schema.groupes.id, groupeId));
    if (!g || g.offreUeId !== offreUeId) throw new HTTPException(422, { message: "Groupe étranger à cette offre" });
  }

  const acquis = await base().select({ ueId: schema.validationsUe.ueId }).from(schema.validationsUe).where(eq(schema.validationsUe.apprenantId, apprenantId));
  const idsAcquis = new Set(acquis.map((x) => x.ueId));
  if (ue.prerequis.length) {
    const prérequises = await base().select({ id: schema.unitesEnseignement.id, code: schema.unitesEnseignement.code }).from(schema.unitesEnseignement)
      .where(and(inArray(schema.unitesEnseignement.code, ue.prerequis), eq(schema.unitesEnseignement.filiereId, ue.filiereId)));
    const manquants = prérequises.filter((p) => !idsAcquis.has(p.id)).map((p) => p.code);
    if (manquants.length) throw new HTTPException(409, { message: `Prérequis non acquis pour ${ue.code} : ${manquants.join(", ")}` });
  }
  const capacite = groupeId
    ? (await base().select({ capacite: schema.groupes.capacite }).from(schema.groupes).where(eq(schema.groupes.id, groupeId)))[0]?.capacite ?? null
    : offre.capacite;
  if (capacite !== null) {
    const [{ n } = { n: 0 }] = await base().select({ n: count() }).from(schema.inscriptionsUe)
      .where(and(
        eq(schema.inscriptionsUe.offreUeId, offreUeId),
        ...(groupeId ? [eq(schema.inscriptionsUe.groupeId, groupeId)] : []),
        inArray(schema.inscriptionsUe.statut, ["proposee", "signee", "validee"]),
      ));
    if (n >= capacite) throw new HTTPException(409, { message: `Capacité atteinte (${n}/${capacite})` });
  }
  const [contrat] = await base().select().from(schema.inscriptionsUe)
    .where(and(eq(schema.inscriptionsUe.inscriptionSuperieureId, insc.id), eq(schema.inscriptionsUe.offreUeId, offreUeId)));
  if (contrat && contrat.statut !== "proposee") throw new HTTPException(409, { message: `Contrat déjà ${contrat.statut} : seule la direction peut le faire avancer` });

  const inscriptionUeId = contrat?.id ?? `ICU-${randomUUID()}`;
  const [evenementId] = await inscrireAuRegistre([{
    type: "INSCRIPTION_UE", auteurId: profil.id, etablissementId: insc.etablissementId, apprenantId,
    donnees: { inscriptionUeId, inscriptionSuperieureId: insc.id, apprenantId, offreUeId, groupeId, statut: "proposee", motifRefus: null },
  }]);
  await journaliser(profil, "Proposition d'un contrat d'UE", `${ue.code} (${offreUeId})`, "consultation_personnelle", true, null);
  return c.json({ inscriptionUeId, statut: "proposee", evenementId }, 201);
});

/** Décision de la direction sur un contrat : signer, abandonner, ne pas valider. `validee` n'est pas
 *  posable ici — un contrat s'instruit par un acquis, pas par une signature rétroactive. */
scolariteSuperieure.post("/etablissements/:id/contrat/ue", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil } = await accesEtablissement(c, id, true);
  const saisie = await corps(c, z.object({
    inscriptionUeId: ID_CONTRAT, statut: StatutInscriptionUE.exclude(["proposee", "validee"]),
    motifRefus: z.string().trim().max(140).nullable().default(null),
  }).strict());
  const [contrat] = await base().select().from(schema.inscriptionsUe).where(eq(schema.inscriptionsUe.id, saisie.inscriptionUeId));
  if (!contrat) throw new HTTPException(404, { message: "Contrat introuvable" });
  const [insc] = await base().select({ etablissementId: schema.inscriptionsSuperieures.etablissementId }).from(schema.inscriptionsSuperieures)
    .where(eq(schema.inscriptionsSuperieures.id, contrat.inscriptionSuperieureId));
  if (insc?.etablissementId !== id) {
    await journaliser(profil, "Décision sur un contrat d'un autre établissement", contrat.id, "gestion", false, "perimetre");
    throw new HTTPException(403, { message: "Contrat rattaché à un autre établissement : refus journalisé" });
  }
  if (saisie.statut !== "signee" && !saisie.motifRefus) throw new HTTPException(422, { message: "Un abandon ou une non-validation de contrat doit être motivé" });
  const [evenementId] = await inscrireAuRegistre([{
    type: "INSCRIPTION_UE", auteurId: profil.id, etablissementId: id, apprenantId: contrat.apprenantId,
    donnees: {
      inscriptionUeId: contrat.id, inscriptionSuperieureId: contrat.inscriptionSuperieureId, apprenantId: contrat.apprenantId,
      offreUeId: contrat.offreUeId, groupeId: contrat.groupeId, statut: saisie.statut, motifRefus: saisie.motifRefus,
    },
  }]);
  await journaliser(profil, `Décision sur un contrat d'UE (${saisie.statut})`, contrat.id, "gestion", true, null);
  return c.json({ inscriptionUeId: contrat.id, statut: saisie.statut, evenementId }, 201);
});

/**
 * Contrat pédagogique agrégé : ce qui est signé, ce qui est acquis, ce qui reste, et LA règle qui a
 * jugé. Rien d'estimé — une UE non évaluée est nommée comme telle, sans note inventée. Le cumul
 * applique le paramètre 7 : un acquis périmé reste lisible mais ne compte plus au diplôme.
 */
async function contratPedagogique(apprenantId: string): Promise<ContratPedagogique> {
  const insc = await inscriptionDe(apprenantId);
  if (!insc) throw new HTTPException(404, { message: "Aucune inscription dans l'enseignement supérieur" });
  const filiere = await filiereDe(insc.filiereId);
  const lignes = await base()
    .select({ contrat: schema.inscriptionsUe, ue: schema.unitesEnseignement, offre: schema.offresUe, groupe: schema.groupes })
    .from(schema.inscriptionsUe)
    .innerJoin(schema.offresUe, eq(schema.offresUe.id, schema.inscriptionsUe.offreUeId))
    .innerJoin(schema.unitesEnseignement, eq(schema.unitesEnseignement.id, schema.offresUe.ueId))
    .leftJoin(schema.groupes, eq(schema.groupes.id, schema.inscriptionsUe.groupeId))
    .where(eq(schema.inscriptionsUe.inscriptionSuperieureId, insc.id))
    .orderBy(asc(schema.unitesEnseignement.code));
  const [validations, notes] = await Promise.all([
    base().select().from(schema.validationsUe).where(and(eq(schema.validationsUe.apprenantId, apprenantId), eq(schema.validationsUe.etablissementId, insc.etablissementId))).orderBy(asc(schema.validationsUe.acquiseLe)),
    base().select({ ueId: schema.notesUe.ueId }).from(schema.notesUe).where(eq(schema.notesUe.apprenantId, apprenantId)),
  ]);
  const regle = await regleAppliquee({ etablissementId: insc.etablissementId, filiereId: insc.filiereId, periodeId: null, regime: insc.regimePedagogique });
  const valides = validations.filter((v) => acquisToujoursValide(v.acquiseLe, regle.dureeValiditeAcquis));
  const creditsAcquis = valides.reduce((s, v) => s + v.creditsAcquis, 0);
  const acquises = new Set(valides.map((v) => v.ueId));
  const notees = new Set(notes.map((n) => n.ueId));
  const signes = lignes.filter((l) => l.contrat.statut !== "proposee");
  return {
    inscription: insc,
    voie: filiere.voie,
    ueSignees: signes.map((l) => ({ inscriptionUe: l.contrat, ue: l.ue, offre: l.offre, groupe: l.groupe })),
    validations,
    creditsAcquis,
    creditsRestants: Math.max(0, filiere.creditsEcts - creditsAcquis),
    ueNonEvaluees: signes.filter((l) => !acquises.has(l.ue.id) && !notees.has(l.ue.id)).map((l) => l.ue.code),
    regleAppliquee: regle,
  };
}

scolariteSuperieure.get("/moi/contrat", authentifie, async (c) => {
  const profil = c.get("profil");
  const apprenantId = monApprenant(profil);
  const contrat = await contratPedagogique(apprenantId);
  await journaliser(profil, "Consultation de son contrat pédagogique", `${contrat.ueSignees.length} UE`, "consultation_personnelle", true, null);
  return c.json(contrat);
});

scolariteSuperieure.get("/etablissements/:id/contrat/:apprenantId", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const apprenantId = ID_APPRENANT.parse(c.req.param("apprenantId"));
  const { profil, finalite } = await accesEtablissement(c, id);
  if (!(await inscriptionDe(apprenantId, id))) throw new HTTPException(404, { message: "Aucune inscription de cette personne dans cet établissement" });
  const contrat = await contratPedagogique(apprenantId);
  await journaliser(profil, "Consultation du contrat pédagogique d'un étudiant", apprenantId, finalite, true, null);
  return c.json(contrat);
});

/* ================================================================== Évaluation, puis validation */

/** Offres dont l'enseignant connecté est responsable (offre ou groupe) : la même relation
 *  pédagogique qu'à l'appel du K-12, transposée — pas un rôle de plus. */
scolariteSuperieure.get("/moi/enseignements/offres", authentifie, async (c) => {
  const profil = c.get("profil");
  const enseignantId = await monEnseignant(profil);
  const [directes, groupes] = await Promise.all([
    base().select({ id: schema.offresUe.id }).from(schema.offresUe).where(eq(schema.offresUe.enseignantId, enseignantId)),
    base().select({ offreUeId: schema.groupes.offreUeId }).from(schema.groupes).where(eq(schema.groupes.enseignantId, enseignantId)),
  ]);
  const ids = [...new Set([...directes.map((o) => o.id), ...groupes.map((g) => g.offreUeId)])];
  const lignes = ids.length ? await base().select().from(schema.offresUe).where(inArray(schema.offresUe.id, ids)).orderBy(asc(schema.offresUe.periodeId)) : [];
  await journaliser(profil, "Consultation de ses offres d'UE", `${lignes.length} offre(s)`, "evaluation", true, null);
  return c.json(lignes);
});

/**
 * Saisie de notes d'UE à la session de l'offre. Seuls les titulaires d'un contrat signé ou validé sont
 * notables : sans contrat, une note ne peut devenir un acquis et ne serait comptée à aucun diplôme.
 */
scolariteSuperieure.post("/moi/enseignements/notes-ue", authentifie, async (c) => {
  const profil = c.get("profil");
  const saisie = await corps(c, z.object({
    offreUeId: ID_OFFRE,
    notes: z.array(z.object({ apprenantId: ID_APPRENANT, note: NOTE }).strict()).min(1).max(80),
    idSaisie: ID_SAISIE,
  }).strict());
  const enseignantId = await monEnseignant(profil);
  const [offre] = await base().select().from(schema.offresUe).where(eq(schema.offresUe.id, saisie.offreUeId));
  if (!offre) throw new HTTPException(404, { message: "Offre d'UE introuvable" });
  const mesGroupes = await base().select({ id: schema.groupes.id }).from(schema.groupes)
    .where(and(eq(schema.groupes.offreUeId, saisie.offreUeId), eq(schema.groupes.enseignantId, enseignantId)));
  if (offre.enseignantId !== enseignantId && !mesGroupes.length) {
    await journaliser(profil, "Saisie de notes d'UE", `${saisie.offreUeId} · ${offre.ueId}`, "evaluation", false, "relation");
    refuser("Vous n'êtes responsable ni de cette offre ni d'un de ses groupes : saisie refusée et journalisée");
  }
  const [ue] = await base().select().from(schema.unitesEnseignement).where(eq(schema.unitesEnseignement.id, offre.ueId));
  if (!ue) throw new HTTPException(404, { message: "Unité d'enseignement inconnue" });
  const contractes = await base().select({ apprenantId: schema.inscriptionsUe.apprenantId }).from(schema.inscriptionsUe)
    .where(and(eq(schema.inscriptionsUe.offreUeId, saisie.offreUeId), inArray(schema.inscriptionsUe.statut, ["signee", "validee"])));
  const admis = new Set(contractes.map((x) => x.apprenantId));
  const horsContrat = saisie.notes.filter((n) => !admis.has(n.apprenantId)).map((n) => n.apprenantId);
  if (horsContrat.length) throw new HTTPException(422, { message: `Sans contrat signé sur cette offre : ${horsContrat.join(", ")}` });
  const deja = await dejaSaisi(saisie.idSaisie, "EVALUATION_UE");
  if (deja) return c.json({ enregistres: deja, deja: true }, 200);
  const enregistres = await inscrireAuRegistre(saisie.notes.map((n) => ({
    type: "EVALUATION_UE", auteurId: enseignantId, etablissementId: offre.etablissementId, apprenantId: n.apprenantId,
    donnees: {
      apprenantId: n.apprenantId, offreUeId: saisie.offreUeId, ueId: ue.id, session: offre.session, note: n.note,
      creditsEcts: ue.creditsEcts, coefficient: ue.coefficient, ...(saisie.idSaisie ? { idSaisie: saisie.idSaisie } : {}),
    },
  })));
  await journaliser(profil, "Saisie de notes d'UE", `${saisie.offreUeId} (${enregistres.length})`, "evaluation", true, null);
  return c.json({ enregistres }, 201);
});

/**
 * Validation d'une période : le serveur applique la règle en vigueur et enregistre les acquis. Une
 * ligne non acquise n'est pas une erreur — c'est une décision rendue avec son motif, et l'absence de
 * fait au registre en est la preuve.
 */
scolariteSuperieure.post("/etablissements/:id/validations", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil } = await accesEtablissement(c, id, true);
  const saisie = await corps(c, z.object({
    periodeId: ID_PERIODE,
    lignes: z.array(z.object({ apprenantId: ID_APPRENANT, offreUeId: ID_OFFRE }).strict()).min(1).max(200),
    idSaisie: ID_SAISIE,
  }).strict());
  const [periode] = await base().select().from(schema.periodes).where(eq(schema.periodes.id, saisie.periodeId));
  if (!periode) throw new HTTPException(404, { message: "Période introuvable" });
  if ((await filiereDe(periode.filiereId)).etablissementId !== id) throw new HTTPException(422, { message: "Période hors de cet établissement" });
  const offres = await base().select().from(schema.offresUe).where(inArray(schema.offresUe.id, [...new Set(saisie.lignes.map((l) => l.offreUeId))]));
  if (offres.length !== new Set(saisie.lignes.map((l) => l.offreUeId)).size) throw new HTTPException(422, { message: "Une ou plusieurs offres d'UE sont inconnues" });
  if (offres.some((o) => o.periodeId !== saisie.periodeId || o.etablissementId !== id)) throw new HTTPException(422, { message: "Toutes les offres doivent être ouvertes dans cette période et cet établissement" });
  const apprenantIds = [...new Set(saisie.lignes.map((l) => l.apprenantId))];
  // Un rejeu de la même saisie ne doit pas inscrire un acquis deux fois : la clé d'idempotence est
  // vérifiée AVANT tout calcul, comme pour la saisie de notes.
  const deja = await dejaSaisi(saisie.idSaisie, "VALIDATION_UE");
  if (deja) return c.json({ enregistres: deja, deja: true }, 200);

  const [ues, notesBrutes, inscriptions, dejaValidees] = await Promise.all([
    base().select().from(schema.unitesEnseignement).where(eq(schema.unitesEnseignement.filiereId, periode.filiereId)),
    base().select({ n: schema.notesUe }).from(schema.notesUe)
      .innerJoin(schema.offresUe, eq(schema.offresUe.id, schema.notesUe.offreUeId))
      .where(and(inArray(schema.notesUe.apprenantId, apprenantIds), eq(schema.offresUe.periodeId, saisie.periodeId))),
    base().select().from(schema.inscriptionsSuperieures).where(inArray(schema.inscriptionsSuperieures.apprenantId, apprenantIds)),
    base().select({ apprenantId: schema.validationsUe.apprenantId, ueId: schema.validationsUe.ueId }).from(schema.validationsUe)
      .where(and(inArray(schema.validationsUe.apprenantId, apprenantIds), eq(schema.validationsUe.periodeId, saisie.periodeId))),
  ]);
  const parId = new Map(ues.map((u) => [u.id, u]));
  const idParCode = new Map(ues.map((u) => [u.code, u.id]));
  const acquises = new Set(dejaValidees.map((v) => `${v.apprenantId}|${v.ueId}`));
  const notesParApprenant = new Map<string, NoteLue[]>();
  for (const { n } of notesBrutes) {
    notesParApprenant.set(n.apprenantId, [...(notesParApprenant.get(n.apprenantId) ?? []), n as NoteLue]);
  }
  // Un régime par étudiant, donc une règle potentielle par régime : la cache évite une lecture par ligne.
  const regles = new Map<string, RegleLue>();
  const reglePour = async (regime: RegimePedagogique) => {
    const trouvee = regles.get(regime);
    if (trouvee) return trouvee;
    const r = await regleAppliquee({ etablissementId: id, filiereId: periode.filiereId, periodeId: saisie.periodeId, regime });
    regles.set(regime, r);
    return r;
  };

  const faits: NouveauFait[] = [];
  const rendu: { apprenantId: string; code: string; acquise: boolean; voie: string; justification: string }[] = [];
  for (const l of saisie.lignes) {
    const offre = offres.find((o) => o.id === l.offreUeId)!;
    const ue = parId.get(offre.ueId);
    if (!ue) throw new HTTPException(422, { message: `UE de l'offre ${offre.id} absente de la filière de la période` });
    if (acquises.has(`${l.apprenantId}|${ue.id}`)) {
      rendu.push({ apprenantId: l.apprenantId, code: ue.code, acquise: false, voie: "note_session", justification: `UE ${ue.code} déjà acquise sur cette période : aucun doublon enregistré.` });
      continue;
    }
    const insc = inscriptions.filter((x) => x.apprenantId === l.apprenantId).sort((a, b) => b.anneeUniversitaire.localeCompare(a.anneeUniversitaire))[0];
    if (!insc) throw new HTTPException(422, { message: `${l.apprenantId} : aucune inscription supérieure` });
    const regle = await reglePour(insc.regimePedagogique);
    const notesPeriode = notesParApprenant.get(l.apprenantId) ?? [];
    const blocUeIds = regle.compensation === "par_bloc"
      ? (regle.blocs.find((b) => b.ue.some((code) => idParCode.get(code) === ue.id))?.ue ?? []).map((code) => idParCode.get(code)).filter((x): x is string => !!x)
      : null;
    const d = deciderAcquisition({ regle, notesUe: notesPeriode.filter((n) => n.ueId === ue.id), notesPeriode, blocUeIds });
    rendu.push({ apprenantId: l.apprenantId, code: ue.code, acquise: d.acquise, voie: d.voie, justification: d.justification });
    if (!d.acquise) continue;
    faits.push({
      type: "VALIDATION_UE", auteurId: profil.id, etablissementId: id, apprenantId: l.apprenantId,
      donnees: {
        apprenantId: l.apprenantId, validationId: `VAL-${randomUUID()}`, ueId: ue.id, offreUeId: offre.id,
        periodeId: saisie.periodeId, voie: d.voie, session: offre.session, creditsAcquis: ue.creditsEcts,
        moyenne: d.moyenne, regleValidationId: regle.id, justification: d.justification,
        ...(saisie.idSaisie ? { idSaisie: `${saisie.idSaisie}:${ue.id}` } : {}),
      },
    });
  }
  const enregistres = faits.length ? await inscrireAuRegistre(faits) : [];
  await journaliser(profil, "Validation d'UE par la règle en vigueur", `${saisie.periodeId} (${faits.length}/${rendu.length})`, "evaluation", true, null);
  return c.json({ enregistres, reglesAppliquees: [...regles.values()].map((r) => r.id), rendu }, 201);
});

/** Acquisition hors note de session (VAE, équivalence, acquis antérieur, décision de jury). La
 *  justification est obligatoire et les crédits viennent de l'UE, jamais du demandeur. */
scolariteSuperieure.post("/etablissements/:id/validations/hors-note", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil } = await accesEtablissement(c, id, true);
  const saisie = await corps(c, z.object({
    apprenantId: ID_APPRENANT, ueId: ID_UE, periodeId: ID_PERIODE.nullable().default(null),
    voie: HORS_NOTE,
    justification: z.string().trim().min(5).max(200),
  }).strict());
  const [ue] = await base().select().from(schema.unitesEnseignement).where(eq(schema.unitesEnseignement.id, saisie.ueId));
  if (!ue) throw new HTTPException(404, { message: "Unité d'enseignement inconnue" });
  const insc = await inscriptionDe(saisie.apprenantId, id);
  if (!insc) throw new HTTPException(422, { message: "Aucune inscription dans cet établissement : acquisition impossible" });
  const [existe] = await base().select({ id: schema.validationsUe.id }).from(schema.validationsUe)
    .where(and(eq(schema.validationsUe.apprenantId, saisie.apprenantId), eq(schema.validationsUe.ueId, saisie.ueId)));
  if (existe) throw new HTTPException(409, { message: "Cette UE est déjà acquise : un crédit ne s'inscrit pas deux fois" });
  const regle = await regleAppliquee({ etablissementId: id, filiereId: ue.filiereId, periodeId: saisie.periodeId, regime: insc.regimePedagogique });
  const validationId = `VAL-${randomUUID()}`;
  const [evenementId] = await inscrireAuRegistre([{
    type: "VALIDATION_UE", auteurId: profil.id, etablissementId: id, apprenantId: saisie.apprenantId,
    donnees: {
      apprenantId: saisie.apprenantId, validationId, ueId: ue.id, offreUeId: null, periodeId: saisie.periodeId,
      voie: saisie.voie, session: "hors_session", creditsAcquis: ue.creditsEcts, moyenne: null,
      regleValidationId: regle.id, justification: `${saisie.justification} (règle ${regle.id})`,
    },
  }]);
  await journaliser(profil, `Acquisition hors note de session (${saisie.voie})`, `${saisie.apprenantId} · ${ue.code}`, "evaluation", true, null);
  return c.json({ validationId, creditsAcquis: ue.creditsEcts, evenementId }, 201);
});

/**
 * La feuille de validation, avant l'écriture : pour cette période, qui a un contrat, une note saisie,
 * et un acquis déjà enregistré. L'écriture `POST /validations` existe depuis T2 ; sans cette lecture,
 * une direction validerait à l'aveugle — et une seule ligne hors filière ferait échouer le lot entier.
 * Aucune porte de plus : les mêmes lignes, déjà lisibles une par une par `accesEtablissement`.
 */
scolariteSuperieure.get("/etablissements/:id/validations/preparables", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const periodeId = ID_PERIODE.parse(c.req.query("periodeId") ?? "");
  const { profil, finalite } = await accesEtablissement(c, id);
  const [periode] = await base().select().from(schema.periodes).where(eq(schema.periodes.id, periodeId));
  if (!periode) throw new HTTPException(404, { message: "Période introuvable" });
  if ((await filiereDe(periode.filiereId)).etablissementId !== id) throw new HTTPException(422, { message: "Période hors de cet établissement" });
  const lignes = await base()
    .select({
      apprenantId: schema.inscriptionsUe.apprenantId,
      nom: schema.apprenants.nom,
      prenoms: schema.apprenants.prenoms,
      inscriptionId: schema.inscriptionsSuperieures.id,
      contratId: schema.inscriptionsUe.id,
      contratStatut: schema.inscriptionsUe.statut,
      offreUeId: schema.offresUe.id,
      ueCode: schema.unitesEnseignement.code,
      ueIntitule: schema.unitesEnseignement.intitule,
      creditsEcts: schema.unitesEnseignement.creditsEcts,
      notes: sql<number>`(select count(*)::int from ${schema.notesUe} n where n.offre_ue_id = ${schema.offresUe.id} and n.apprenant_id = ${schema.inscriptionsUe.apprenantId})`,
      noteMaximale: sql<number | null>`(select max(n.note) from ${schema.notesUe} n where n.offre_ue_id = ${schema.offresUe.id} and n.apprenant_id = ${schema.inscriptionsUe.apprenantId})`,
      dejaAcquise: sql<boolean>`exists (select 1 from ${schema.validationsUe} v where v.apprenant_id = ${schema.inscriptionsUe.apprenantId} and v.ue_id = ${schema.unitesEnseignement.id} and v.periode_id = ${periodeId})`,
    })
    .from(schema.inscriptionsUe)
    .innerJoin(schema.offresUe, eq(schema.offresUe.id, schema.inscriptionsUe.offreUeId))
    .innerJoin(schema.unitesEnseignement, eq(schema.unitesEnseignement.id, schema.offresUe.ueId))
    .innerJoin(schema.apprenants, eq(schema.apprenants.id, schema.inscriptionsUe.apprenantId))
    // L'inscription suit la période : un étudiant d'une autre filière ou d'une autre année ne peut pas
    // être jugé dans ce lot, et le serveur refuserait toute la saisie à cause de lui.
    .innerJoin(schema.inscriptionsSuperieures, and(
      eq(schema.inscriptionsSuperieures.id, schema.inscriptionsUe.inscriptionSuperieureId),
      eq(schema.inscriptionsSuperieures.filiereId, periode.filiereId),
      eq(schema.inscriptionsSuperieures.anneeUniversitaire, periode.anneeUniversitaire),
    ))
    .where(and(eq(schema.offresUe.periodeId, periodeId), eq(schema.offresUe.etablissementId, id)))
    .orderBy(asc(schema.apprenants.nom), asc(schema.apprenants.prenoms), asc(schema.unitesEnseignement.code));
  await journaliser(profil, "Consultation de la feuille de validation d'une période", `${periodeId} (${lignes.length} ligne(s))`, finalite, true, null);
  return c.json({ periode, lignes });
});

/* ================================================================== Règles de validation */

/** Une portée de règle est une portée d'autorité : la règle nationale ne se déclare pas depuis un
 *  établissement, et une règle d'établissement ne peut pas s'imposer à un autre. */
scolariteSuperieure.post("/regles-validation", authentifie, async (c) => {
  const saisie = await corps(c, z.object({
    regleId: ID_REGLE.nullable().default(null),
    portee: PorteeRegle,
    etablissementId: ID_ETAB.nullable().default(null), filiereId: ID_FILIERE.nullable().default(null),
    periodeId: ID_PERIODE.nullable().default(null), regime: RegimePedagogique.nullable().default(null),
    seuilAcquisition: z.number().min(0).max(20).default(10), noteEliminatoire: z.number().min(0).max(20).nullable().default(null),
    compensation: RegleCompensation.default("par_bloc"),
    ponderation: ReglePonderation.default("ects"),
    sessionRetenue: RegleSessionRetenue.default("meilleure"),
    seuilMoyennePeriode: z.number().min(0).max(20).nullable().default(null),
    dureeValiditeAcquis: z.number().int().min(0).max(20).default(5),
    reportCreditsInterEtab: z.boolean().default(true),
    blocs: z.array(z.object({ code: z.string().trim().min(1).max(20), ue: z.array(z.string().trim().min(1).max(20)).min(1).max(60) }).strict()).max(20).default([]),
  }).strict());
  const attendus: Record<PorteeRegle, ("etablissementId" | "filiereId" | "periodeId")[]> = {
    nationale: [], etablissement: ["etablissementId"], filiere: ["etablissementId", "filiereId"], periode: ["etablissementId", "filiereId", "periodeId"],
  };
  const manquants = attendus[saisie.portee].filter((champ) => saisie[champ] === null);
  if (manquants.length) throw new HTTPException(422, { message: `Portée « ${saisie.portee} » : préciser ${manquants.join(", ")}` });
  // La porte dépend de la portée, mais l'auditeur est toujours le profil dont la session a écrit.
  const profil = c.get("profil");
  if (saisie.portee === "nationale") {
    await bureauSup(c, "Déclaration de la règle nationale de validation");
  } else {
    const etablissementId = saisie.etablissementId!;
    await accesEtablissement(c, etablissementId, true);
    if (saisie.filiereId && (await filiereDe(saisie.filiereId)).etablissementId !== etablissementId) throw new HTTPException(422, { message: "Filière hors de cet établissement" });
    if (saisie.periodeId) {
      const [p] = await base().select({ filiereId: schema.periodes.filiereId }).from(schema.periodes).where(eq(schema.periodes.id, saisie.periodeId));
      if (!p || p.filiereId !== saisie.filiereId) throw new HTTPException(422, { message: "Période étrangère à cette filière" });
    }
  }
  // Une clé de portée que la portée n'exige pas reste null : sinon une règle « nationale » pourrait
  // porter l'identifiant d'un établissement et ne plus ressembler à ce que son auteur a déclaré.
  const porte = attendus[saisie.portee];
  const valeurs = {
    portee: saisie.portee,
    etablissementId: porte.includes("etablissementId") ? saisie.etablissementId : null,
    filiereId: porte.includes("filiereId") ? saisie.filiereId : null,
    periodeId: porte.includes("periodeId") ? saisie.periodeId : null,
    regime: saisie.regime, seuilAcquisition: saisie.seuilAcquisition, noteEliminatoire: saisie.noteEliminatoire,
    compensation: saisie.compensation, ponderation: saisie.ponderation, sessionRetenue: saisie.sessionRetenue,
    seuilMoyennePeriode: saisie.seuilMoyennePeriode, dureeValiditeAcquis: saisie.dureeValiditeAcquis,
    reportCreditsInterEtab: saisie.reportCreditsInterEtab, blocs: saisie.blocs,
  };
  const [regle] = await base().insert(schema.reglesValidation)
    .values({ id: saisie.regleId ?? `RGL-${randomUUID()}`, ...valeurs })
    .onConflictDoUpdate({ target: schema.reglesValidation.id, set: valeurs }).returning();
  await journaliser(profil, `Déclaration d'une règle de validation (${saisie.portee})`, regle!.id, "gestion", true, null);
  return c.json(regle, 201);
});

scolariteSuperieure.get("/etablissements/:id/regles-validation", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil, finalite } = await accesEtablissement(c, id);
  const lignes = await base().select().from(schema.reglesValidation)
    .where(or(isNull(schema.reglesValidation.etablissementId), eq(schema.reglesValidation.etablissementId, id)))
    .orderBy(asc(schema.reglesValidation.portee));
  await journaliser(profil, "Consultation des règles de validation applicables", `${lignes.length} règle(s)`, finalite, true, null);
  return c.json(lignes);
});

/* ================================================================== Certification : jury, puis délibération */

/** Constituer ou faire avancer un jury. Quorum et mode sont vérifiés ici : une délibération rendue par
 *  un jury incomplet serait un diplôme sans preuve. */
scolariteSuperieure.post("/etablissements/:id/jurys", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const saisie = await corps(c, z.object({
    juryId: ID_JURY.nullable().default(null),
    autorite: ModeDeliberation,
    office: OfficeDeliberant.nullable().default(null),
    diplome: Diplome,
    periodeId: ID_PERIODE.nullable().default(null), filiereId: ID_FILIERE.nullable().default(null),
    sessionExamenId: z.string().trim().max(40).nullable().default(null),
    statut: StatutJury.default("constitue"),
    president: z.string().trim().min(3).max(120),
    membres: z.array(z.string().trim().min(3).max(120)).max(30).default([]),
    quorum: z.number().int().min(1).max(31),
    pvReference: z.string().trim().max(80).nullable().default(null),
  }).strict());
  const { profil } = await accesJury(c, id, saisie, "Constitution d'un jury de certification");
  if (saisie.membres.includes(saisie.president)) throw new HTTPException(422, { message: "Le président ne compte pas deux fois dans le quorum" });
  if (saisie.membres.length + 1 < saisie.quorum) throw new HTTPException(422, { message: `Jury incomplet : ${saisie.membres.length + 1} présent(s) pour un quorum de ${saisie.quorum}` });
  if (saisie.periodeId) {
    const [p] = await base().select({ filiereId: schema.periodes.filiereId }).from(schema.periodes).where(eq(schema.periodes.id, saisie.periodeId));
    if (!p || (saisie.filiereId && p.filiereId !== saisie.filiereId)) throw new HTTPException(422, { message: "Période étrangère à la filière jugée" });
  }
  const juryId = saisie.juryId ?? `JUR-${randomUUID()}`;
  const [evenementId] = await inscrireAuRegistre([{
    type: "JURY_PERIODE", auteurId: profil.id, etablissementId: id, apprenantId: null,
    donnees: {
      juryId, autorite: saisie.autorite, office: saisie.office, diplome: saisie.diplome, periodeId: saisie.periodeId,
      filiereId: saisie.filiereId, sessionExamenId: saisie.sessionExamenId, statut: saisie.statut,
      president: saisie.president, membres: saisie.membres, quorum: saisie.quorum, pvReference: saisie.pvReference,
    },
  }]);
  await journaliser(profil, `Constitution d'un jury (${saisie.autorite})`, `${juryId} · ${saisie.diplome}`, "gestion", true, null);
  return c.json({ juryId, statut: saisie.statut, evenementId }, 201);
});

/**
 * Délibérer une promotion. Le client ne fournit QUE la décision du jury : crédits validés, moyenne
 * générale et mention sont recalculés depuis les acquis enregistrés. La porte d'homologation est
 * franchie ici — sans homologation en cours, le diplôme n'est pas opposable et BEILE ne le certifie pas.
 */
scolariteSuperieure.post("/etablissements/:id/deliberations", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const saisie = await corps(c, z.object({
    juryId: ID_JURY,
    decisions: z.array(z.object({
      apprenantId: ID_APPRENANT, decision: DecisionDiplome,
      ueManquantes: z.array(z.string().trim().min(1).max(20)).max(60).default([]),
    }).strict()).min(1).max(200),
    idSaisie: ID_SAISIE,
  }).strict());
  const [jury] = await base().select().from(schema.jurys).where(eq(schema.jurys.id, saisie.juryId));
  if (!jury) throw new HTTPException(404, { message: "Jury introuvable" });
  if (!["delibere", "publie"].includes(jury.statut)) throw new HTTPException(409, { message: `Jury « ${jury.statut} » : il doit être déclaré délibérant avant de juger` });
  const { profil } = await accesJury(c, id, jury, "Délibération d'un jury de certification");
  if (!jury.filiereId) throw new HTTPException(422, { message: "Le jury ne désigne aucune filière : délibération impossible" });
  const filiere = await filiereDe(jury.filiereId);
  if (!filiere.creditsEcts) throw new HTTPException(409, { message: "Filière sans volume de crédits déclaré : nul ne peut être dit admis ni ajourné" });
  const [hmg] = await base().select().from(schema.homologationsFiliere)
    .where(and(eq(schema.homologationsFiliere.etablissementId, id), eq(schema.homologationsFiliere.filiereId, filiere.id)));
  const porte = hmg ? homologationOperante(hmg, aujourdhui()) : { operante: false, motif: "Aucune homologation enregistrée pour cette filière." };
  if (!porte.operante) {
    await journaliser(profil, "Délibération sur une filière non homologuée", `${filiere.id} · ${porte.motif}`, "gestion", false, "homologation");
    throw new HTTPException(409, { message: `Certification refusée : ${porte.motif}` });
  }

  const apprenantIds = [...new Set(saisie.decisions.map((d) => d.apprenantId))];
  const [validations, inscriptions] = await Promise.all([
    base().select().from(schema.validationsUe).where(and(inArray(schema.validationsUe.apprenantId, apprenantIds), eq(schema.validationsUe.etablissementId, id))),
    base().select().from(schema.inscriptionsSuperieures).where(inArray(schema.inscriptionsSuperieures.apprenantId, apprenantIds)),
  ]);
  const regles = new Map<string, RegleLue>();
  const deja = await dejaSaisi(saisie.idSaisie, "DELIBERATION_DIPLOME");
  if (deja) return c.json({ enregistres: deja, deja: true }, 200);

  const faits: NouveauFait[] = [];
  const rendu: { apprenantId: string; decision: DecisionDiplome | "non_enregistree"; creditsValides: number; moyenneGenerale: number | null; mention: Mention | null; motif: string }[] = [];
  for (const d of saisie.decisions) {
    const insc = inscriptions.filter((x) => x.apprenantId === d.apprenantId).sort((a, b) => b.anneeUniversitaire.localeCompare(a.anneeUniversitaire))[0];
    if (!insc) throw new HTTPException(422, { message: `${d.apprenantId} : aucune inscription dans cet établissement` });
    const regle = regles.get(insc.regimePedagogique) ?? await regleAppliquee({ etablissementId: id, filiereId: filiere.id, periodeId: jury.periodeId, regime: insc.regimePedagogique });
    regles.set(insc.regimePedagogique, regle);
    const acquis = validations.filter((v) => v.apprenantId === d.apprenantId && acquisToujoursValide(v.acquiseLe, regle.dureeValiditeAcquis));
    // Un diplôme ne se valide pas au-delà de son volume : les crédits comptés sont plafonnés au requis,
    // et l'excédent reste lisible dans le motif plutôt qu'inventé.
    const creditsAssis = acquis.reduce((s, v) => s + v.creditsAcquis, 0);
    const creditsValides = Math.min(creditsAssis, filiere.creditsEcts);
    // Les acquis hors note (VAE, équivalence) n'entrent dans aucune moyenne. S'il ne reste aucune note,
    // la moyenne est absente — et non 0, qui serait une décision que le jury n'a jamais prise.
    const notees = acquis.filter((v) => v.moyenne !== null);
    const moyenneGenerale = notees.length ? moyennePonderee(notees.map((v) => ({ note: v.moyenne!, poids: poidsDe({ creditsEcts: v.creditsAcquis, coefficient: 1 }, regle.ponderation) }))) : null;
    if (d.decision === "admis" && creditsAssis < filiere.creditsEcts) {
      rendu.push({ apprenantId: d.apprenantId, decision: "non_enregistree", creditsValides, moyenneGenerale, mention: null, motif: `Admission refusée : ${creditsAssis}/${filiere.creditsEcts} crédits acquis. Le jury doit statuer à nouveau (ajournement ou admission sous réserve).` });
      continue;
    }
    if (d.decision === "admis_sous_reserve" && !d.ueManquantes.length) throw new HTTPException(422, { message: `${d.apprenantId} : une admission sous réserve doit nommer ce qui manque` });
    const mention = d.decision === "admis" || d.decision === "admis_sous_reserve" ? (moyenneGenerale === null ? null : mentionDe(moyenneGenerale)) : null;
    const deliberationId = `DEB-${randomUUID()}`;
    const r = DeliberationDiplome.safeParse({
      id: deliberationId, apprenantId: d.apprenantId, juryId: jury.id, etablissementId: id, filiereId: filiere.id,
      diplome: jury.diplome, decision: d.decision, creditsValides, creditsRequis: filiere.creditsEcts,
      moyenneGenerale, mention, ueManquantes: d.ueManquantes, delibereLe: aujourdhui(), certificatId: null,
    });
    if (!r.success) throw new HTTPException(422, { message: `Délibération non conforme au contrat : ${r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(" ; ")}` });
    faits.push({
      type: "DELIBERATION_DIPLOME", auteurId: profil.id, etablissementId: id, apprenantId: d.apprenantId,
      donnees: {
        apprenantId: d.apprenantId, deliberationId, juryId: jury.id, filiereId: filiere.id, diplome: jury.diplome,
        decision: d.decision, creditsValides, creditsRequis: filiere.creditsEcts, moyenneGenerale, mention,
        ueManquantes: d.ueManquantes, ...(saisie.idSaisie ? { idSaisie: `${saisie.idSaisie}:${d.apprenantId}` } : {}),
      },
    });
    rendu.push({ apprenantId: d.apprenantId, decision: d.decision, creditsValides, moyenneGenerale, mention, motif: `Jury ${jury.id} — ${porte.motif ?? "homologation en cours"}.` });
  }
  const enregistres = faits.length ? await inscrireAuRegistre(faits) : [];
  await journaliser(profil, "Délibération d'un diplôme national", `${saisie.juryId} (${enregistres.length}/${saisie.decisions.length})`, "gestion", true, null);
  return c.json({ enregistres, rendu }, 201);
});

/** Jurys de l'établissement : les jurys d'examen national sont la liste du bureau du supérieur, pas
 *  celle d'un établissement — même en lecture. */
scolariteSuperieure.get("/etablissements/:id/jurys", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil, finalite } = await accesEtablissement(c, id);
  const lignes = await base().select({ j: schema.jurys }).from(schema.jurys)
    .innerJoin(schema.filiereSuperieure, eq(schema.filiereSuperieure.id, schema.jurys.filiereId))
    .where(and(eq(schema.filiereSuperieure.etablissementId, id), eq(schema.jurys.autorite, "jury_capitalisation")))
    .orderBy(desc(schema.jurys.statut));
  await journaliser(profil, "Consultation des jurys de l'établissement", `${lignes.length} jury(ies)`, finalite, true, null);
  return c.json(lignes.map((l) => l.j));
});

/**
 * Délibérations jugées dans l'établissement. La moyenne, les crédits et la mention viennent du
 * recalcul du serveur au jour du délibéré : l'écran les lit, il ne les saisit pas. Une délibération
 * sans certificat émis reste visible — c'est exactement l'état que #57 (certification du supérieur)
 * doit retrouver, pas une ligne à masquer.
 */
scolariteSuperieure.get("/etablissements/:id/deliberations", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil, finalite } = await accesEtablissement(c, id);
  const juryId = c.req.query("juryId");
  const lignes = await base().select({
    deliberation: schema.deliberationsDiplome,
    apprenant: { id: schema.apprenants.id, nom: schema.apprenants.nom, prenoms: schema.apprenants.prenoms },
    jury: { autorite: schema.jurys.autorite, office: schema.jurys.office, president: schema.jurys.president, statut: schema.jurys.statut },
  }).from(schema.deliberationsDiplome)
    .innerJoin(schema.apprenants, eq(schema.apprenants.id, schema.deliberationsDiplome.apprenantId))
    .innerJoin(schema.jurys, eq(schema.jurys.id, schema.deliberationsDiplome.juryId))
    .where(and(eq(schema.deliberationsDiplome.etablissementId, id), ...(juryId ? [eq(schema.deliberationsDiplome.juryId, juryId)] : [])))
    .orderBy(desc(schema.deliberationsDiplome.delibereLe), asc(schema.apprenants.nom));
  await journaliser(profil, "Consultation des délibérations de l'établissement", `${lignes.length} décision(s)`, finalite, true, null);
  return c.json(lignes);
});

/* ================================================================== Équivalences et transfert de crédits */

scolariteSuperieure.post("/etablissements/:id/equivalences", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil } = await accesEtablissement(c, id, true);
  const saisie = await corps(c, z.object({
    apprenantId: ID_APPRENANT, ueId: ID_UE, titreOrigine: z.string().trim().min(3).max(120),
    etablissementOrigine: z.string().trim().max(120).nullable().default(null), anneeOrigine: ANNEE.nullable().default(null),
    motif: z.string().trim().min(5).max(200),
  }).strict());
  const [ue] = await base().select({ id: schema.unitesEnseignement.id }).from(schema.unitesEnseignement).where(eq(schema.unitesEnseignement.id, saisie.ueId));
  if (!ue) throw new HTTPException(404, { message: "Unité d'enseignement inconnue" });
  if (!(await inscriptionDe(saisie.apprenantId, id))) throw new HTTPException(422, { message: "Aucune inscription dans cet établissement" });
  const [equivalence] = await base().insert(schema.equivalences).values({
    id: `EQC-${randomUUID()}`, apprenantId: saisie.apprenantId, etablissementId: id, ueId: ue.id,
    titreOrigine: saisie.titreOrigine, etablissementOrigine: saisie.etablissementOrigine, anneeOrigine: saisie.anneeOrigine,
    creditsReconnus: 0, statut: "demandee", autorite: "etablissement", motif: saisie.motif, decidePar: null, decideLe: null,
  }).returning();
  await journaliser(profil, "Dépôt d'une demande d'équivalence", `${saisie.apprenantId} · ${saisie.titreOrigine}`, "gestion", true, null);
  return c.json(equivalence, 201);
});

/** Statuer sur une équivalence. Une équivalence d'autorité nationale relève du bureau du supérieur :
 *  au Bénin, la charge en incombe à une direction du MESRS, pas à l'établissement qui en profite. */
scolariteSuperieure.post("/etablissements/:id/equivalences/:equivalenceId/decision", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const equivalenceId = ID_EQUIVALENCE.parse(c.req.param("equivalenceId"));
  const saisie = await corps(c, z.object({
    statut: StatutEquivalence.exclude(["demandee"]),
    autorite: AutoriteEquivalence,
    motif: z.string().trim().min(5).max(200),
    creditsReconnus: z.number().int().min(0).max(30).nullable().default(null),
  }).strict());
  const [equivalence] = await base().select().from(schema.equivalences).where(eq(schema.equivalences.id, equivalenceId));
  if (!equivalence || equivalence.etablissementId !== id) throw new HTTPException(404, { message: "Équivalence introuvable dans cet établissement" });
  const { profil } = saisie.autorite === "nationale"
    ? { profil: await bureauSup(c, "Décision d'équivalence au nom de l'État") }
    : await accesEtablissement(c, id, true);
  const [statue] = await base().update(schema.equivalences).set({
    statut: saisie.statut, autorite: saisie.autorite, motif: saisie.motif, decidePar: profil.id, decideLe: aujourdhui(),
    ...(saisie.creditsReconnus !== null ? { creditsReconnus: saisie.creditsReconnus } : {}),
  }).where(and(eq(schema.equivalences.id, equivalenceId), eq(schema.equivalences.apprenantId, equivalence.apprenantId))).returning();
  if (!statue) throw new HTTPException(404, { message: "Équivalence introuvable" });
  await journaliser(profil, `Décision d'équivalence (${saisie.autorite} · ${saisie.statut})`, equivalenceId, saisie.autorite === "nationale" ? "controle" : "gestion", true, null);
  return c.json(statue);
});

scolariteSuperieure.get("/etablissements/:id/equivalences", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil, finalite } = await accesEtablissement(c, id);
  const lignes = await base().select().from(schema.equivalences).where(eq(schema.equivalences.etablissementId, id)).orderBy(asc(schema.equivalences.statut));
  await journaliser(profil, "Consultation des équivalences de l'établissement", `${lignes.length} demande(s)`, finalite, true, null);
  return c.json(lignes);
});

/**
 * Transférer un capital de crédits vers une inscription d'accueil. Le fait ne valide rien : il rend
 * l'acquis antérieur RECONNU (projection en `equivalences`), et l'établissement d'accueil valide
 * ensuite ligne par ligne (`voie: "equivalence"`). Sans cette seconde étape, le même crédit compterait
 * deux fois dans les effectifs nationaux.
 */
scolariteSuperieure.post("/etablissements/:id/transferts-credits", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil } = await accesEtablissement(c, id, true);
  const saisie = await corps(c, z.object({
    apprenantId: ID_APPRENANT, deInscriptionSuperieureId: ID_INSCRIPTION, ueIds: z.array(ID_UE).min(1).max(60),
    idSaisie: ID_SAISIE,
  }).strict());
  const vers = await inscriptionDe(saisie.apprenantId, id);
  if (!vers) throw new HTTPException(422, { message: "Aucune inscription d'accueil dans cet établissement" });
  const [de] = await base().select().from(schema.inscriptionsSuperieures)
    .where(and(eq(schema.inscriptionsSuperieures.id, saisie.deInscriptionSuperieureId), eq(schema.inscriptionsSuperieures.apprenantId, saisie.apprenantId)));
  if (!de) throw new HTTPException(404, { message: "Inscription d'origine introuvable pour cette personne" });
  if (de.id === vers.id) throw new HTTPException(422, { message: "Transfert vers sa propre inscription" });
  const regle = await regleAppliquee({ etablissementId: id, filiereId: vers.filiereId, periodeId: null, regime: vers.regimePedagogique });
  if (!regle.reportCreditsInterEtab) {
    await journaliser(profil, "Transfert de crédits refusé par la règle", `${regle.id} : report inter-établissements exclu`, "gestion", false, "regle");
    throw new HTTPException(409, { message: `La règle ${regle.id} n'autorise pas le report de crédits entre établissements` });
  }
  const ues = await base().select({ id: schema.unitesEnseignement.id, creditsEcts: schema.unitesEnseignement.creditsEcts }).from(schema.unitesEnseignement)
    .where(inArray(schema.unitesEnseignement.id, [...new Set(saisie.ueIds)]));
  if (ues.length !== new Set(saisie.ueIds).size) throw new HTTPException(422, { message: "Une ou plusieurs UE sont inconnues du catalogue" });
  const [evenementId] = await inscrireAuRegistre([{
    type: "TRANSFERT_CREDITS", auteurId: profil.id, etablissementId: id, apprenantId: saisie.apprenantId,
    donnees: {
      apprenantId: saisie.apprenantId, deInscriptionSuperieureId: de.id, versInscriptionSuperieureId: vers.id,
      versEtablissementId: id, creditsTransferts: ues.reduce((s, u) => s + u.creditsEcts, 0),
      ueIds: ues.map((u) => u.id), ...(saisie.idSaisie ? { idSaisie: saisie.idSaisie } : {}),
    },
  }]);
  await journaliser(profil, "Transfert de crédits entre inscriptions", `${de.id} → ${vers.id} (${ues.length} UE)`, "gestion", true, null);
  return c.json({ evenementId, ueIds: ues.map((u) => u.id), reconnues: true, regleAppliquee: regle.id }, 201);
});

/* ================================================================== Actes de l'État : cycle EPES, homologation */

scolariteSuperieure.post("/etablissements/:id/cycle-epes", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const profil = await bureauSup(c, "Suivi du cycle d'un établissement privé");
  if (!(await base().select({ id: schema.etablissements.id }).from(schema.etablissements).where(eq(schema.etablissements.id, id)))) throw new HTTPException(404, { message: "Établissement inconnu" });
  const saisie = await corps(c, z.object({
    autorite: Tutelle,
    phase: PhaseEpes,
    statut: StatutAgrement.default("instruit"),
    avisConseil: AvisConseil.default("non_demande"),
    acteReference: z.string().trim().max(80).nullable().default(null),
    accordeLe: DATE.nullable().default(null), echeanceLe: DATE.nullable().default(null),
    renouvellements: z.number().int().min(0).max(4).default(0),
    motif: z.string().trim().max(200).nullable().default(null),
  }).strict());
  const r = CycleEpes.safeParse({ id: "nouveau", etablissementId: id, ...saisie });
  if (!r.success) throw new HTTPException(422, { message: `Cycle EPES non conforme au contrat : ${r.error.issues.map((i) => i.message).join(" ; ")}` });
  const [ligne] = await base().insert(schema.cyclesEpes).values({ id: `EPS-${randomUUID()}`, etablissementId: id, ...saisie })
    .onConflictDoUpdate({ target: [schema.cyclesEpes.etablissementId, schema.cyclesEpes.autorite], set: saisie }).returning();
  await journaliser(profil, "Suivi du cycle d'un établissement privé", `${id} · ${saisie.autorite} ${saisie.phase}`, "controle", true, null);
  return c.json(ligne, 201);
});

/** Homologuer une filière : le couple (établissement, filière) est unique, et le diplôme visé ne se
 *  choisit pas — il est celui de la filière. */
scolariteSuperieure.post("/etablissements/:id/homologations", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const profil = await bureauSup(c, "Homologation d'une filière");
  const saisie = await corps(c, z.object({
    filiereId: ID_FILIERE, diplome: Diplome,
    statut: StatutAccreditation.default("instruite"),
    quotaAnnuel: z.number().int().min(0).max(20000).nullable().default(null),
    accordeeLe: DATE.nullable().default(null), echeanceLe: DATE.nullable().default(null),
    motif: z.string().trim().max(200).nullable().default(null),
  }).strict());
  const filiere = await filiereDe(saisie.filiereId);
  if (filiere.etablissementId !== id) throw new HTTPException(422, { message: "Filière hors de cet établissement" });
  if (filiere.diplomeVise !== saisie.diplome) throw new HTTPException(422, { message: `La filière vise ${filiere.diplomeVise}, pas ${saisie.diplome}` });
  const valeurs = { etablissementId: id, filiereId: saisie.filiereId, diplome: saisie.diplome, statut: saisie.statut, quotaAnnuel: saisie.quotaAnnuel, accordeeLe: saisie.accordeeLe, echeanceLe: saisie.echeanceLe, motif: saisie.motif };
  const [ligne] = await base().insert(schema.homologationsFiliere).values({ id: `HMG-${randomUUID()}`, ...valeurs, conclusionControle: "non_controle", dernierControleLe: null })
    .onConflictDoUpdate({ target: [schema.homologationsFiliere.etablissementId, schema.homologationsFiliere.filiereId], set: valeurs }).returning();
  await journaliser(profil, "Homologation d'une filière", `${id} · ${saisie.filiereId} (${saisie.statut})`, "controle", true, null);
  return c.json({ ...ligne, porte: homologationOperante(ligne!, aujourdhui()) }, 201);
});

/** Contrôle pédagogique : sa conclusion, avec l'échéance, ferme ou ouvre la porte de certification. */
scolariteSuperieure.post("/etablissements/:id/homologations/:homologationId/controle", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const homologationId = ID_HOMOLOGATION.parse(c.req.param("homologationId"));
  const profil = await bureauSup(c, "Contrôle pédagogique d'une filière homologuée");
  const { conclusion, motif } = await corps(c, z.object({
    conclusion: ConclusionControle,
    motif: z.string().trim().max(200).nullable().default(null),
  }).strict());
  const [ligne] = await base().update(schema.homologationsFiliere)
    .set({ conclusionControle: conclusion, dernierControleLe: aujourdhui(), ...(motif ? { motif } : {}) })
    .where(and(eq(schema.homologationsFiliere.id, homologationId), eq(schema.homologationsFiliere.etablissementId, id))).returning();
  if (!ligne) throw new HTTPException(404, { message: "Homologation introuvable dans cet établissement" });
  await journaliser(profil, "Contrôle pédagogique d'une filière homologuée", `${homologationId} · ${conclusion}`, "controle", true, null);
  return c.json({ ...ligne, porte: homologationOperante(ligne, aujourdhui()) });
});

/** Ce que l'établissement sait de SES actes administratifs — et rien de ceux des autres. */
scolariteSuperieure.get("/etablissements/:id/statut-administratif", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil, etab, finalite } = await accesEtablissement(c, id);
  const [cycles, homologations] = await Promise.all([
    base().select().from(schema.cyclesEpes).where(eq(schema.cyclesEpes.etablissementId, id)),
    base().select().from(schema.homologationsFiliere).where(eq(schema.homologationsFiliere.etablissementId, id)),
  ]);
  await journaliser(profil, "Consultation du statut administratif de l'établissement", id, finalite, true, null);
  return c.json({
    etablissement: { id: etab.id, nom: etab.nom, statut: etab.statut, cycle: etab.cycle, tutelles: etab.tutelles },
    cycles,
    homologations: homologations.map((h) => ({ ...h, porte: homologationOperante(h, aujourdhui()) })),
  });
});

/* ================================================================== Pilotage : des effectifs, rien de nominatif */

/**
 * Effets agrégés de la scolarité du supérieur. Des comptages nationaux seulement : aucune ligne
 * nominative, aucun établissement nommé — le détail par établissement passe par la porte
 * `accesEtablissement`, et par conséquent les petits effectifs cessent d'être agrégés.
 */
scolariteSuperieure.get("/enseignement-superieur/scolarite/effectifs", authentifie, async (c) => {
  const profil = c.get("profil");
  perimetrePilotage(profil);
  const [inscriptions, validations, homologations, jurys] = await Promise.all([
    base().select({ statut: schema.inscriptionsSuperieures.statut, effectif: count() }).from(schema.inscriptionsSuperieures).groupBy(schema.inscriptionsSuperieures.statut),
    base().select({ voie: schema.filiereSuperieure.voie, decisions: count(schema.validationsUe.id) }).from(schema.validationsUe)
      .innerJoin(schema.unitesEnseignement, eq(schema.unitesEnseignement.id, schema.validationsUe.ueId))
      .innerJoin(schema.filiereSuperieure, eq(schema.filiereSuperieure.id, schema.unitesEnseignement.filiereId))
      .groupBy(schema.filiereSuperieure.voie),
    base().select({ statut: schema.homologationsFiliere.statut, effectif: count() }).from(schema.homologationsFiliere).groupBy(schema.homologationsFiliere.statut),
    base().select({ statut: schema.jurys.statut, effectif: count() }).from(schema.jurys).groupBy(schema.jurys.statut),
  ]);
  await journaliser(profil, "Consultation des effectifs de la scolarité du supérieur", `${inscriptions.length} statut(s)`, "statistique", true, null);
  return c.json({ inscriptions, validations, homologations, jurys });
});

/* ================================================================== Crédit ECTS : le moteur « registre » du dictionnaire */

/** Les définitions publiées que ce module rend. Citer leur version, pas seulement leur nom. */
const DEFINITIONS_ECTS = [DICTIONNAIRE.credits_ects_acquis, DICTIONNAIRE.taux_capitalisation_ects];
/** Le seuil se lit dans la définition : deux chiffres, une seule règle de publication. */
const SEUIL_ECTS = Math.min(...DEFINITIONS_ECTS.map((d) => d.effectifMinimalPublication));

/**
 * Un acquis compte tant que sa propre règle le déclare valide (paramètre 7, `dureeValiditeAcquis`) :
 * date d'acquisition + durée de la règle qui l'a jugé. La durée vient de la ligne de règle et non d'une
 * constante de code, donc un établissement qui ramène la validité à trois ans voit son chiffre bouger
 * sans qu'on touche une ligne. Les acquis périmés restent rendus à part : les faire disparaître du total
 * ferait passer une règle pour une perte de donnée.
 */
const ACQUIS_VALIDE = sql`${schema.validationsUe.acquiseLe} + make_interval(years => ${schema.reglesValidation.dureeValiditeAcquis}) >= current_date`;

type PeriodeBrute = {
  periodeId: string;
  etablissementId: string;
  filiere: string;
  voie: string;
  intitule: string;
  anneeUniversitaire: string;
  creditsParEtudiant: number;
  contrats: number;
  creditsAcquis: number;
  creditsPerimes: number;
};

/**
 * Une ligne par période ouverte sous le périmètre : ce qui est attendu (crédits de la période ×
 * contrats signés) et ce qui est acquis. Deux requêtes et non une jointure unique parce que contrats et
 * acquis sont deux éventails d'une même période — les joindre ensemble multiplierait les lignes et les
 * sommes, soit un total de crédits faux sous un libellé vrai.
 */
async function periodesBrutes(etablissements: Set<string> | null, annee: string | null): Promise<PeriodeBrute[]> {
  if (etablissements && etablissements.size === 0) return [];
  const restrictionEtab = etablissements ? inArray(schema.filiereSuperieure.etablissementId, [...etablissements]) : undefined;
  const restrictionAnnee = annee ? eq(schema.periodes.anneeUniversitaire, annee) : undefined;
  const attendus = await base().select({
    periodeId: schema.periodes.id,
    etablissementId: schema.filiereSuperieure.etablissementId,
    filiere: schema.filiereSuperieure.nom,
    voie: schema.filiereSuperieure.voie,
    intitule: schema.periodes.intitule,
    anneeUniversitaire: schema.periodes.anneeUniversitaire,
    creditsParEtudiant: sql<number>`max(${schema.periodes.creditsAttendus})::int`,
    contrats: sql<number>`count(distinct ${schema.inscriptionsUe.apprenantId})::int`,
  }).from(schema.periodes)
    .innerJoin(schema.filiereSuperieure, eq(schema.filiereSuperieure.id, schema.periodes.filiereId))
    .leftJoin(schema.offresUe, eq(schema.offresUe.periodeId, schema.periodes.id))
    // Un contrat `proposee` n'est pas attendu : l'étudiant ne l'a pas signé. `validee` reste compté,
    // c'est une UE d'une période antérieure que la direction a validée sans la re-signer.
    .leftJoin(schema.inscriptionsUe, and(eq(schema.inscriptionsUe.offreUeId, schema.offresUe.id), inArray(schema.inscriptionsUe.statut, ["signee", "validee"])))
    .where(and(restrictionAnnee, restrictionEtab))
    .groupBy(schema.periodes.id, schema.filiereSuperieure.etablissementId, schema.filiereSuperieure.nom, schema.filiereSuperieure.voie, schema.periodes.intitule, schema.periodes.anneeUniversitaire)
    .orderBy(schema.periodes.anneeUniversitaire, schema.filiereSuperieure.nom, schema.periodes.numero);

  const ids = attendus.map((p) => p.periodeId);
  const acquis = ids.length === 0 ? [] : await base().select({
    periodeId: schema.validationsUe.periodeId,
    creditsAcquis: sql<number>`coalesce(sum(${schema.validationsUe.creditsAcquis}) filter (where ${ACQUIS_VALIDE}), 0)::int`,
    creditsPerimes: sql<number>`coalesce(sum(${schema.validationsUe.creditsAcquis}) filter (where not ${ACQUIS_VALIDE}), 0)::int`,
  }).from(schema.validationsUe)
    .innerJoin(schema.reglesValidation, eq(schema.reglesValidation.id, schema.validationsUe.regleValidationId))
    .where(inArray(schema.validationsUe.periodeId, ids))
    .groupBy(schema.validationsUe.periodeId);
  const parId = new Map(acquis.map((a) => [a.periodeId ?? "", a]));
  return attendus.map((p) => ({
    ...p,
    creditsAcquis: parId.get(p.periodeId)?.creditsAcquis ?? 0,
    creditsPerimes: parId.get(p.periodeId)?.creditsPerimes ?? 0,
  }));
}

/** Le taux, arrondi au dixième : une virgule de plus n'ajouterait rien à une somme de crédits entiers. */
const tauxDe = (acquis: number, attendus: number) => (attendus > 0 ? Math.round((acquis / attendus) * 1000) / 10 : null);

/**
 * Cellule établissement : une ligne par période, effectif = population sous contrat. Rien n'est masqué
 * chez soi — le seuil de publication protège l'agrégat, pas la direction qui a enregistré les faits.
 */
async function lignesParPeriode(etablissements: Set<string> | null, annee: string | null): Promise<LigneCapitalisation[]> {
  const brutes = await periodesBrutes(etablissements, annee);
  return brutes.map((p) => {
    const attendus = p.creditsParEtudiant * p.contrats;
    return {
      cle: `periode:${p.periodeId}`,
      libelle: `${p.filiere} · ${p.intitule}`,
      etablissementId: p.etablissementId,
      anneeUniversitaire: p.anneeUniversitaire,
      creditsAcquis: p.creditsAcquis,
      creditsAttendus: attendus,
      creditsPerimes: p.creditsPerimes,
      apprenants: p.contrats,
      tauxCapitalisation: tauxDe(p.creditsAcquis, attendus),
      petiteUnite: p.contrats < SEUIL_ECTS,
      masquee: false,
    };
  });
}

/**
 * Populations sous contrat signé : par voie, et distincte sur tout le périmètre. Deux comptages et non
 * l'addition des seconds : un étudiant inscrit dans deux filières de voies différentes apparaîtrait deux
 * fois dans la somme, et un effectif gonflé est un seuil de publication cru à l'envers — il ferait
 * publier une cellule qui devrait rester masquée.
 */
async function populationsContractees(etablissements: Set<string> | null, annee: string | null) {
  if (etablissements && etablissements.size === 0) return { parVoie: new Map<string, number>(), totale: 0 };
  const ou = [inArray(schema.inscriptionsUe.statut, ["signee", "validee"]),
    annee ? eq(schema.periodes.anneeUniversitaire, annee) : undefined,
    etablissements ? inArray(schema.filiereSuperieure.etablissementId, [...etablissements]) : undefined];
  const joints = {
    offresUe: eq(schema.offresUe.id, schema.inscriptionsUe.offreUeId),
    periodes: eq(schema.periodes.id, schema.offresUe.periodeId),
    filiere: eq(schema.filiereSuperieure.id, schema.periodes.filiereId),
  };
  const [parVoie, [totale]] = await Promise.all([
    base().select({ voie: schema.filiereSuperieure.voie, apprenants: sql<number>`count(distinct ${schema.inscriptionsUe.apprenantId})::int` })
      .from(schema.inscriptionsUe)
      .innerJoin(schema.offresUe, joints.offresUe)
      .innerJoin(schema.periodes, joints.periodes)
      .innerJoin(schema.filiereSuperieure, joints.filiere)
      .where(and(...ou))
      .groupBy(schema.filiereSuperieure.voie),
    base().select({ apprenants: sql<number>`count(distinct ${schema.inscriptionsUe.apprenantId})::int` })
      .from(schema.inscriptionsUe)
      .innerJoin(schema.offresUe, joints.offresUe)
      .innerJoin(schema.periodes, joints.periodes)
      .innerJoin(schema.filiereSuperieure, joints.filiere)
      .where(and(...ou)),
  ]);
  const carte = new Map<string, number>();
  for (const p of parVoie) carte.set(p.voie, p.apprenants);
  return { parVoie: carte, totale: totale?.apprenants ?? 0 };
}

/**
 * Cellule pilotage : une ligne par voie, jamais par établissement. Le seuil de publication se lit sur la
 * population distincte de la voie ; sous lui, les valeurs ne sont pas rendues et `masquee` le dit.
 */
async function lignesParVoie(etablissements: Set<string> | null, annee: string | null): Promise<{ lignes: LigneCapitalisation[]; populationTotale: number }> {
  const brutes = await periodesBrutes(etablissements, annee);
  if (brutes.length === 0) return { lignes: [], populationTotale: 0 };
  const { parVoie, totale } = await populationsContractees(etablissements, annee);

  const parCle = new Map<string, PeriodeBrute[]>();
  for (const p of brutes) parCle.set(p.voie, [...(parCle.get(p.voie) ?? []), p]);
  const lignes = [...parCle.entries()].map(([voie, periodes]) => {
    const apprenants = parVoie.get(voie) ?? 0;
    const creditsAcquis = periodes.reduce((s, p) => s + p.creditsAcquis, 0);
    const creditsPerimes = periodes.reduce((s, p) => s + p.creditsPerimes, 0);
    const creditsAttendus = periodes.reduce((s, p) => s + p.creditsParEtudiant * p.contrats, 0);
    const annees = [...new Set(periodes.map((p) => p.anneeUniversitaire))].sort();
    const premiere = annees[0] ?? "—";
    const derniere = annees[annees.length - 1] ?? premiere;
    const publiable = apprenants >= SEUIL_ECTS;
    return {
      cle: `voie:${voie}`,
      libelle: voie,
      etablissementId: null,
      anneeUniversitaire: annees.length === 1 ? premiere : `${premiere} → ${derniere}`,
      creditsAcquis: publiable ? creditsAcquis : null,
      creditsAttendus: publiable ? creditsAttendus : null,
      creditsPerimes: publiable ? creditsPerimes : null,
      apprenants,
      tauxCapitalisation: publiable ? tauxDe(creditsAcquis, creditsAttendus) : null,
      petiteUnite: !publiable,
      masquee: !publiable,
    };
  });
  return { lignes, populationTotale: totale };
}

/**
 * Total de la réponse : somme des cellules publiées, sur la population distincte du périmètre. Les
 * cellules masquées n'y entrent pas — les y glisserais ferait du total un chiffre plus grand que la
 * somme de ce qui est affiché, ce qui est exactement ce que le seuil de publication interdit.
 */
function consolider(
  lignes: LigneCapitalisation[],
  cible: { cle: string; libelle: string; etablissementId: string | null; apprenants: number },
): LigneCapitalisation | null {
  if (!lignes.length) return null;
  const acquis = lignes.reduce((s, l) => s + (l.creditsAcquis ?? 0), 0);
  const attendus = lignes.reduce((s, l) => s + (l.creditsAttendus ?? 0), 0);
  const perimes = lignes.reduce((s, l) => s + (l.creditsPerimes ?? 0), 0);
  return {
    ...cible,
    anneeUniversitaire: lignes[0]!.anneeUniversitaire,
    creditsAcquis: acquis,
    creditsAttendus: attendus,
    creditsPerimes: perimes,
    tauxCapitalisation: tauxDe(acquis, attendus),
    petiteUnite: cible.apprenants < SEUIL_ECTS,
    masquee: cible.apprenants < SEUIL_ECTS,
  };
}

const enTeteCapitalisation = (annee: string | null, perimetre: string) => ({
  moteur: "registre" as const,
  anneeUniversitaire: annee,
  perimetre,
  definitions: DEFINITIONS_ECTS.map((d) => `${d.code} v${d.version}`),
  seuilPublication: SEUIL_ECTS,
});

/** L'année demandée, validée ; null = toutes les périodes enregistrées. */
const anneeDemandee = (c: Context) => {
  const a = c.req.query("annee");
  return a ? ANNEE.parse(a) : null;
};

/**
 * Ce que l'établissement capitalise réellement : ses crédits acquis, par période. Porte
 * `accesEtablissement` — chef et inspecteur de la circonscription, pas un rôle de pilotage : la
 * ventilation par période permet de rattacher une ligne à un groupe d'étudiants identifiable.
 */
scolariteSuperieure.get("/etablissements/:id/scolarite/credits-ects", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil, finalite } = await accesEtablissement(c, id);
  const annee = anneeDemandee(c);
  const [lignes, population] = await Promise.all([lignesParPeriode(new Set([id]), annee), populationsContractees(new Set([id]), annee)]);
  await journaliser(profil, "Consultation de la capitalisation ECTS de l'établissement", `${lignes.length} période(s)`, finalite, true, null);
  return c.json({
    ...enTeteCapitalisation(annee, id),
    lignes,
    total: consolider(lignes, { cle: "total", libelle: "Ensemble des périodes", etablissementId: id, apprenants: population.totale }),
  } satisfies ResultatCapitalisation);
});

/**
 * Même définition, agrégée nationale : une ligne par voie, sous le périmètre territorial de l'agent,
 * avec la règle des petites cellules appliquée ici pour de vrai. Aucun établissement nommé.
 */
scolariteSuperieure.get("/enseignement-superieur/scolarite/credits-ects", authentifie, async (c) => {
  const profil = c.get("profil");
  const perimetre = perimetrePilotage(profil);
  const communes = communesDuPerimetre(perimetre);
  const idsEtab = communes === null ? null : new Set((await base().select({ id: schema.etablissements.id }).from(schema.etablissements)
    .where(and(eq(schema.etablissements.cycle, "superieur"), inArray(schema.etablissements.communeId, [...communes])))).map((e) => e.id));
  const annee = anneeDemandee(c);
  const { lignes, populationTotale } = await lignesParVoie(idsEtab, annee);
  await journaliser(profil, "Consultation nationale de la capitalisation ECTS", `${lignes.length} voie(s)`, "statistique", true, null);
  return c.json({
    ...enTeteCapitalisation(annee, perimetre.niveau),
    lignes,
    total: consolider(lignes, { cle: "total", libelle: "Ensemble des voies publiées", etablissementId: null, apprenants: populationTotale }),
  } satisfies ResultatCapitalisation);
});
