import { randomUUID } from "node:crypto";
import {
  FraisTerme, LIBELLE_TERME_FRAIS, QualiteAgentEncaisseur, TYPES_FAITS_FRAIS,
  type CouvertureTerme, type DeclarationCadence, type Evenement, type Finalite, type LigneFraisEcole, type Profil, type SituationFrais, type StatutFrais,
} from "@beile/contracts";
import { schema } from "@beile/db";
import { decider } from "@beile/simulation/abac";
import { situationApprenant } from "@beile/simulation/projections";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authentifie, base, cleUtilisateur, corps, dateCalendaire, journaliser, limiteDebit, refuser, sansSomme, type Variables } from "./commun";
import { contexteApprenant, enEvenement } from "./donnees";
import { dejaSaisi, inscrireAuRegistre } from "./ecriture";
import { signaler } from "./vigie";

/**
 * Situation des frais scolaires : ce que l'école encaisse, ce que la famille sait.
 *
 * Aucun montant ne passe par ici et aucun n'est calculé : la somme reste sur la pièce papier et dans la
 * comptabilité de l'établissement (docs/cadrage/FRAIS_SCOLARITE.md). Le registre redit ce que la quittance
 * contient déjà — une référence, une date, la qualité de qui a encaissé — parce que le RGCP attache la
 * quittance au versement (décret n°2014-571 du 07/10/2014, art. 50) et nomme les régisseurs de recettes
 * (art. 27). Ce qui n'existe pas au registre : une dette. Un statut « attendu » ne suspend ni bulletin, ni
 * examen, ni accès à l'école, et l'absence d'une pièce enregistrée n'est pas la preuve d'un paiement absent.
 *
 * Aucune migration : `ledger.evenements.type` est un texte libre, et la situation se recalcule à la lecture.
 */
export const frais = new Hono<{ Variables: Variables }>();

const ANNEE = z.string().regex(/^\d{4}-\d{4}$/, "année scolaire attendue (AAAA-AAAA)");
const DATE = z.string().refine(dateCalendaire, "date du calendrier attendue (AAAA-MM-JJ)");
const CLE = z.string().regex(/^[0-9a-f-]{16,48}$/);

/**
 * Seules finalités admises à faire redescendre une trace de frais : le responsable légal qui paie, et
 * l'administration de l'école. Partout ailleurs — dossier de l'élève lui-même, lecture pédagogique de
 * l'enseignant, pilotage, export — les faits de frais sont retirés de la liste avant la réponse.
 */
export const ADMET_FRAIS: ReadonlySet<Finalite> = new Set<Finalite>(["suivi_familial", "gestion"]);
const FAITS_FRAIS = new Set<string>(TYPES_FAITS_FRAIS);
/** Un fait de frais ne s'affiche jamais dans un parcours général. */
export const estFaitFrais = (type: string) => FAITS_FRAIS.has(type);

/**
 * Le contrat refuse déjà une CLÉ `montant` (`.strict()` au paquet contrats). Reste le texte libre — le cadre de
 * l'appel, le motif d'une mesure, la référence d'une pièce — où « 15 000 francs CFA par terme » ferait entrer au
 * registre national ce qu'il ne doit pas contenir : c'est `sansSomme`, en `commun.ts` parce que la même règle
 * garde désormais la réponse écrite d'une réclamation.
 *
 * Les RÉFÉRENCES (quittance, délibération, texte) ne sont pas scannées : ce sont des numéros opaques, et un
 * rapprochement de lettres sur un numéro serait un faux positif. C'est pour la même raison — mais dans l'autre
 * sens — que la marque aléatoire de la recette ne peut être que chiffrée : elle se glisse dans le texte d'une
 * réclamation et dans le motif d'une réponse, qui sont scannés, et une suite de lettres en base 36 pourrait y
 * composer « CFA » au hasard. Le garde ne doit rien à un tirage.
 */

/* ------------------------------------------------------------------ Faits */

type FaitQuittance = Extract<Evenement, { type: "QUITTANCE_FRAIS" }>;
type FaitExoneration = Extract<Evenement, { type: "EXONERATION_FRAIS" }>;
type FaitCadence = Extract<Evenement, { type: "CADENCE_FRAIS" }>;

const parAnnee = <T extends { type: string; anneeScolaire: string; apprenantId?: string }>(evs: readonly T[], anneeScolaire: string) =>
  evs.filter((e) => e.anneeScolaire === anneeScolaire);

/**
 * Le calendrier tel que le vit une école béninoise (UTC+1, sans changement d'heure). `aujourdhui()` du moteur
 * est en UTC : à 00 h 30 à Cotonou il est encore la veille en UTC, et une quittance délivrée le matin même
 * serait refusée pour « ne se signe pas d'avance » — ou un terme déclaré exigeable aujourd'hui passerait pour
 * exigible demain. La pièce papier est datée du jour local, le registre doit la lire à la même aune.
 */
export const jourLocal = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);

/**
 * Clé de rapprochement d'une référence de quittance : ce que porte le carnet, débarrassé de la casse, des
 * espaces et de la ponctuation. Sans cette normalisation, `q-12` et `Q 12` sont deux références distinctes et
 * le doublon le plus simple à commettre — recopier le même numéro avec un autre alphabet — échappe au contrôle.
 */
export const referenceNormalisee = (r: string) => r.toUpperCase().replace(/[^A-Z0-9]/g, "");

/* ------------------------------------------------------------------ Calcul */

/** Un terme appelé « annualité » n'est couvert que par une pièce d'annualité : une école qui découpe déclare des termes. */
const couvreTerme = (terme: FraisTerme, piece: FraisTerme) => piece === terme || (piece === "ANNEE" && terme !== "ANNEE");

const enCadence = (f: FaitCadence): DeclarationCadence => ({
  termes: f.termes, cadre: f.cadre, referenceDeliberation: f.referenceDeliberation, declareeLe: f.survenuLe.slice(0, 10),
});

/**
 * La situation d'un élève pour une année, recalculée à chaque lecture. Ce n'est pas un état stocké : rejouer
 * le registre la reconstruit, et une pièce retrouvée par l'école change l'affichage sans effacer ce qui avait
 * été écrit. Aucun terme n'est deviné : les lignes viennent de l'appel déclaré et des pièces elles-mêmes, jamais
 * d'une échéance que le registre inventerait à la place de l'école.
 */
export function calculerSituation(
  anneeScolaire: string,
  quittances: readonly FaitQuittance[],
  exonerations: readonly FaitExoneration[],
  cadence: FaitCadence | null,
  jour: string,
): SituationFrais {
  const ligne = (terme: FraisTerme, exigibleLe: string | null): CouvertureTerme => {
    const mesure = exonerations.find((x) => x.terme === null || couvreTerme(terme, x.terme));
    const piece = quittances.filter((x) => couvreTerme(terme, x.terme)).sort((a, b) => b.delivreeLe.localeCompare(a.delivreeLe))[0] ?? null;
    return {
      terme,
      exigibleLe,
      etat: mesure ? "exonere" : piece ? "paye" : exigibleLe === null ? "sans_appel" : exigibleLe < jour ? "attendu" : "a_venir",
      quittance: piece ? { reference: piece.referenceQuittance, delivreeLe: piece.delivreeLe, qualiteAgent: piece.qualiteAgent, agent: piece.agent } : null,
      mesure: mesure ? { nature: mesure.nature, motif: mesure.motif, autorite: mesure.autorite, decideLe: mesure.decideLe } : null,
    };
  };
  // Les termes appelés donnent les lignes, mais une pièce consignée hors appel reste visible : la masquer
  // ferait disparaître, à l'écran de l'école comme à celui de la famille, la trace d'une quittance pourtant
  // détenue par la famille — et le rapprochement n'aurait plus rien à comparer. Une ligne sans appel rendu
  // « sans_appel » n'entre pas dans le statut d'ensemble : l'année se juge sur ce que l'école a appelé.
  const appels = new Map<FraisTerme, string | null>((cadence?.termes ?? []).map((t) => [t.terme, t.exigibleLe]));
  const lignes = [...new Set<FraisTerme>([...appels.keys(), ...quittances.map((q) => q.terme), ...exonerations.map((x) => x.terme).filter((t): t is FraisTerme => !!t)])]
    .map((t) => ligne(t, appels.get(t) ?? null));
  const termes = lignes.filter((l) => appels.has(l.terme));
  const statut: StatutFrais = !cadence ? "sans_declaration"
    : termes.some((t) => t.etat === "attendu") ? "attendu"
      : termes.every((t) => t.etat === "exonere") ? "exonere"
        : termes.every((t) => t.etat === "paye" || t.etat === "exonere") ? "couvert" : "en_cours";
  const derniere = [...quittances].sort((a, b) => b.delivreeLe.localeCompare(a.delivreeLe))[0];
  return {
    anneeScolaire,
    statut,
    cadence: cadence ? enCadence(cadence) : null,
    termes: lignes,
    derniereQuittance: derniere ? { reference: derniere.referenceQuittance, delivreeLe: derniere.delivreeLe, terme: derniere.terme } : null,
  };
}

/** La cadence en vigueur pour une école et une année : la dernière déclarée, les précédentes restant au registre. */
export async function chargerCadence(etablissementId: string, anneeScolaire: string): Promise<FaitCadence | null> {
  const [l] = await base().select().from(schema.evenements)
    .where(and(eq(schema.evenements.type, "CADENCE_FRAIS"), eq(schema.evenements.etablissementId, etablissementId), sql`${schema.evenements.donnees}->>'anneeScolaire' = ${anneeScolaire}`))
    // Deux déclarations déposées à la seconde près existent : sans second critère, PostgreSQL choisirait au hasard
    // et l'écran changerait d'avis d'une lecture à l'autre. L'identifiant départage de façon stable.
    .orderBy(desc(schema.evenements.survenuLe), desc(schema.evenements.id)).limit(1);
  return l ? (enEvenement(l) as FaitCadence) : null;
}

/**
 * Situation d'un apprenant : la cadence de l'école qui le scolarise, et les seuls faits de cette école. Un
 * apprenant ne doit ses frais qu'à l'établissement qui l'accueille aujourd'hui (voir `ecoleDeLApprenant`) : une
 * pièce consignée par une école d'origine n'est pas la dette de celle-ci, et ses références, ses agents et ses
 * motifs ne se lisent pas depuis le compte d'une autre école.
 */
export async function lireSituationFrais(evenements: readonly Evenement[], etablissementId: string, anneeScolaire: string): Promise<SituationFrais> {
  const deLecole = <T extends { etablissementId: string }>(evs: readonly T[]) => evs.filter((e) => e.etablissementId === etablissementId);
  return calculerSituation(anneeScolaire,
    deLecole(parAnnee(quittancesDe(evenements), anneeScolaire)),
    deLecole(parAnnee(exonerationsDe(evenements), anneeScolaire)),
    await chargerCadence(etablissementId, anneeScolaire), jourLocal());
}

const quittancesDe = (evs: readonly Evenement[]) => evs.filter((e): e is FaitQuittance => e.type === "QUITTANCE_FRAIS");
const exonerationsDe = (evs: readonly Evenement[]) => evs.filter((e): e is FaitExoneration => e.type === "EXONERATION_FRAIS");

/* ------------------------------------------------------------------ Écritures de l'administration de l'école */

/**
 * Un compte qui n'administre aucune école n'a rien à consigner, et ce filtre s'applique AVANT toute lecture en
 * base. Sans lui, `ecoleDeLApprenant` répond 409 si l'apprenant n'est scolarisé nulle part, 403 s'il l'est dans
 * une école hors périmètre : deux réponses distinctes qui suffisent à un enseignant, à un parent ou à un élève
 * pour parcourir APP-000001, APP-000002… et reconstituer, route par route, qui est scolarisé au registre.
 */
async function compteEcoleRequis(c: Context<{ Variables: Variables }>, action: string) {
  const profil = c.get("profil") as Profil;
  if (profil.habilitations.some((h) => h.role === "chef_etablissement")) return;
  await journaliser(profil, action, "aucun établissement administré", "gestion", false, "role");
  refuser("Les faits de frais s'écrivent depuis le compte d'administration de l'école qui scolarise l'élève");
}

/** Un apprenant ne doit ses frais qu'à l'école qui le scolarise aujourd'hui : l'école se lit dans la projection. */
async function ecoleDeLApprenant(apprenantId: string) {
  const [s] = await base().select({ etablissementId: schema.scolarites.etablissementId, statut: schema.scolarites.statut })
    .from(schema.scolarites).where(eq(schema.scolarites.apprenantId, apprenantId));
  if (!s || !s.etablissementId || s.statut !== "scolarise") throw new HTTPException(409, { message: "Cet apprenant n'est actuellement scolarisé dans aucun établissement" });
  return s.etablissementId;
}

/**
 * Qui écrit un fait de frais : le compte d'administration de l'école qui scolarise l'élève. Ni l'inspection,
 * ni un autre établissement, ni un enseignant — et le refus est journalisé comme tout accès.
 */
async function administration(c: Context<{ Variables: Variables }>, etablissementId: string, action: string) {
  const profil = c.get("profil") as Profil;
  const chef = profil.habilitations.some((h) => h.role === "chef_etablissement" && h.perimetre.niveau === "etablissement" && h.perimetre.etablissementId === etablissementId);
  if (!chef) {
    await journaliser(profil, action, etablissementId, "gestion", false, "perimetre");
    refuser("Les faits de frais s'écrivent depuis le compte d'administration de l'école qui scolarise l'élève");
  }
  const [etab] = await base().select({ id: schema.etablissements.id, nom: schema.etablissements.nom }).from(schema.etablissements).where(eq(schema.etablissements.id, etablissementId));
  if (!etab) throw new HTTPException(404, { message: "Établissement inconnu du registre" });
  return { profil, etab };
}

/** Fait déjà inscrit (même clé), découvert dans la transaction : on rend la ligne existante sans rien réécrire. */
class DejaEnregistre extends Error { constructor(public id: string) { super("deja"); } }

/**
 * Déclaration de la cadence de l'année : quels termes l'école appelle et à quelle date. Aucun montant. Une
 * nouvelle déclaration remplace la lecture courante et n'efface pas la précédente — le registre est en ajout seul.
 */
frais.post("/etablissements/:id/frais/cadence", authentifie, limiteDebit(10, 60_000, cleUtilisateur), async (c) => {
  const id = z.string().regex(/^ETB-[A-Za-z0-9-]+$/).parse(c.req.param("id"));
  const { profil, etab } = await administration(c, id, "Déclaration de la cadence des frais");
  const m = await corps(c, z.object({
    anneeScolaire: ANNEE,
    termes: z.array(z.object({ terme: FraisTerme, exigibleLe: DATE }).strict()).min(1).max(4),
    cadre: z.string().trim().min(10, "Cadre : 10 caractères au moins").max(400),
    referenceDeliberation: z.string().trim().max(120).nullish(),
    cle: CLE,
  }).strict());
  if (new Set(m.termes.map((t) => t.terme)).size !== m.termes.length) throw new HTTPException(422, { message: "Un même terme ne peut pas être appelé deux fois dans l'année" });
  // Seule la prose de l'agent se vérifie : une référence de délibération est un numéro d'acte, opaque.
  sansSomme("Cadre de l'appel", m.cadre);

  const idSaisie = `CADENCE-${profil.id}-${id}-${m.cle}`;
  const deja = await dejaSaisi(idSaisie, "CADENCE_FRAIS");
  if (deja) return c.json({ id: deja[0], etablissement: etab.nom, anneeScolaire: m.anneeScolaire, deja: true });
  const [precedente] = await base().select({ id: schema.evenements.id }).from(schema.evenements)
    .where(and(eq(schema.evenements.type, "CADENCE_FRAIS"), eq(schema.evenements.etablissementId, id), sql`${schema.evenements.donnees}->>'anneeScolaire' = ${m.anneeScolaire}`)).limit(1);
  let idEvenement: string;
  try {
    // `apprenant_id` est NULL ici : l'index d'unicité du registre ne protège rien (deux NULL ne se valent pas).
    // Verrou d'advisory puis relecture dans la transaction, comme pour les visites d'inspection.
    [idEvenement] = await inscrireAuRegistre([{
      type: "CADENCE_FRAIS", auteurId: profil.id, etablissementId: id, apprenantId: null, source: "beile",
      donnees: { etablissementId: id, anneeScolaire: m.anneeScolaire, termes: m.termes, cadre: m.cadre, referenceDeliberation: m.referenceDeliberation ?? null, idSaisie },
    }], async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${idSaisie}))`);
      const [l] = (await tx.execute(sql`select id from ledger.evenements where type = 'CADENCE_FRAIS' and donnees->>'idSaisie' = ${idSaisie} limit 1`)) as unknown as { id: string }[];
      if (l) throw new DejaEnregistre(l.id);
    }) as [string];
  } catch (e) {
    if (e instanceof DejaEnregistre) return c.json({ id: e.id, etablissement: etab.nom, anneeScolaire: m.anneeScolaire, deja: true });
    throw e;
  }
  await journaliser(profil, "Déclaration de la cadence des frais", `${id} · ${m.anneeScolaire}`, "gestion", true, null);
  return c.json({ id: idEvenement, etablissement: etab.nom, anneeScolaire: m.anneeScolaire, deja: false, remplace: precedente !== undefined }, 201);
});

/** Enregistrer une quittance : la pièce existe, on en consigne la référence. Rien n'est encaissé ici. */
frais.post("/apprenants/:id/frais/quittance", authentifie, limiteDebit(30, 60_000, cleUtilisateur), async (c) => {
  const apprenantId = z.string().regex(/^APP-\d{6}$/).parse(c.req.param("id"));
  await compteEcoleRequis(c, "Enregistrement d'une quittance");
  const etablissementId = await ecoleDeLApprenant(apprenantId);
  const { profil } = await administration(c, etablissementId, "Enregistrement d'une quittance");
  const m = await corps(c, z.object({
    anneeScolaire: ANNEE,
    terme: FraisTerme,
    delivreeLe: DATE,
    referenceQuittance: z.string().trim().min(3, "Référence de la quittance : 3 caractères au moins").max(60),
    qualiteAgent: QualiteAgentEncaisseur,
    agent: z.string().trim().max(80).nullish(),
    cle: CLE,
  }).strict());
  if (m.delivreeLe > jourLocal()) throw new HTTPException(422, { message: "Une quittance ne se signe pas d'avance" });
  if (m.qualiteAgent === "autre" && !m.agent) throw new HTTPException(422, { message: "Préciser la fonction de l'agent qui a délivré la pièce" });
  // La référence de la pièce n'est pas vérifiée ici : c'est un numéro de carnet, opaque, où une lettre isolée ne
  // désigne aucune somme. Seuls les textes que l'agent compose portent une intention de montant.
  sansSomme("Agent", m.agent);
  const [eleve] = await base().select({ id: schema.apprenants.id }).from(schema.apprenants).where(eq(schema.apprenants.id, apprenantId));
  if (!eleve) throw new HTTPException(404, { message: "Apprenant inconnu du registre" });
  // Une école qui a déclaré ses termes ne peut consigner une pièce que pour l'un d'eux ; celle qui n'a rien
  // déclaré reste libre d'enregistrer une pièce retrouvée — refuser serait punir l'absence de paperasse.
  const cadence = await chargerCadence(etablissementId, m.anneeScolaire);
  if (cadence?.termes.length && !cadence.termes.some((t) => t.terme === m.terme)) {
    throw new HTTPException(422, { message: `Terme non appelé par l'école cette année : la cadence déclare ${cadence.termes.map((t) => LIBELLE_TERME_FRAIS[t.terme]).join(", ")}` });
  }

  const idSaisie = `QUITTANCE-${profil.id}-${apprenantId}-${m.cle}`;
  const deja = await dejaSaisi(idSaisie, "QUITTANCE_FRAIS", apprenantId);
  if (deja) return c.json({ id: deja[0], apprenantId, deja: true });
  const [idEvenement] = await inscrireAuRegistre([{
    type: "QUITTANCE_FRAIS", auteurId: profil.id, etablissementId, apprenantId, source: "beile",
    donnees: {
      apprenantId, etablissementId, anneeScolaire: m.anneeScolaire, terme: m.terme, delivreeLe: m.delivreeLe,
      referenceQuittance: m.referenceQuittance, referenceNormalisee: referenceNormalisee(m.referenceQuittance),
      qualiteAgent: m.qualiteAgent, agent: m.agent ?? null, idSaisie,
    },
  }]) as [string];
  // Rapprochement : une même référence sur deux élèves d'une même école et d'une même année sent le brouillon
  // dupliqué ou la pièce raturée. La comparaison se fait sur une clé normalisée (casse, espaces, ponctuation)
  // parce que « q-12 » et « Q 12 » sont le même carnet ; le rapprochement reste borné à l'école et à l'année,
  // chaque établissement ayant sa propre numérotation de souche — comparer au-delà noierait la vigie en faux
  // positifs. Le fait n'est pas refusé (régulariser une pièce garde sa référence) mais la vigie est levée avec
  // son auteur : c'est le seul contrôle anti-détournement possible sans montants.
  const voisines = await base().select({ apprenantId: schema.evenements.apprenantId }).from(schema.evenements)
    .where(and(
      eq(schema.evenements.type, "QUITTANCE_FRAIS"), eq(schema.evenements.etablissementId, etablissementId),
      sql`${schema.evenements.donnees}->>'referenceNormalisee' = ${referenceNormalisee(m.referenceQuittance)}`,
      sql`${schema.evenements.donnees}->>'anneeScolaire' = ${m.anneeScolaire}`,
    ));
  const dupliquee = voisines.some((v) => v.apprenantId !== apprenantId);
  if (dupliquee) await signaler("quittance_reference_dupliquee", "haute", profil.id, `${etablissementId}|${m.anneeScolaire}|${m.referenceQuittance}`, `${profil.nomAffiche} : la référence ${m.referenceQuittance} est enregistrée pour plusieurs apprenants de ${etablissementId} en ${m.anneeScolaire}.`);
  await journaliser(profil, "Enregistrement d'une quittance", `${apprenantId} · ${m.terme}`, "gestion", true, null);
  return c.json({ id: idEvenement, apprenantId, deja: false, alerte: dupliquee ? "reference_deja_utilisee_dans_cette_ecole" : null }, 201);
});

/** Exonération ou prise en charge : un statut légitime (gratuité des filles dans le secondaire public), pas une anomalie. */
frais.post("/apprenants/:id/frais/exoneration", authentifie, limiteDebit(30, 60_000, cleUtilisateur), async (c) => {
  const apprenantId = z.string().regex(/^APP-\d{6}$/).parse(c.req.param("id"));
  await compteEcoleRequis(c, "Enregistrement d'une exonération");
  const etablissementId = await ecoleDeLApprenant(apprenantId);
  const { profil } = await administration(c, etablissementId, "Enregistrement d'une exonération");
  const m = await corps(c, z.object({
    anneeScolaire: ANNEE,
    terme: FraisTerme.nullish(),
    nature: z.enum(["exoneration", "prise_en_charge"]),
    motif: z.string().trim().min(5, "Motif : 5 caractères au moins").max(300),
    autorite: z.string().trim().min(3, "Autorité : 3 caractères au moins").max(120),
    referenceTexte: z.string().trim().max(160).nullish(),
    decideLe: DATE,
    cle: CLE,
  }).strict());
  if (m.decideLe > jourLocal()) throw new HTTPException(422, { message: "Une décision ne se signe pas d'avance" });
  sansSomme("Motif", m.motif);
  sansSomme("Autorité", m.autorite);
  const cadence = await chargerCadence(etablissementId, m.anneeScolaire);
  if (m.terme && cadence?.termes.length && !cadence.termes.some((t) => t.terme === m.terme)) throw new HTTPException(422, { message: "Terme non appelé par l'école cette année" });

  const idSaisie = `EXONERATION-${profil.id}-${apprenantId}-${m.cle}`;
  const deja = await dejaSaisi(idSaisie, "EXONERATION_FRAIS", apprenantId);
  if (deja) return c.json({ id: deja[0], apprenantId, deja: true });
  const [idEvenement] = await inscrireAuRegistre([{
    type: "EXONERATION_FRAIS", auteurId: profil.id, etablissementId, apprenantId, source: "beile",
    donnees: {
      apprenantId, etablissementId, anneeScolaire: m.anneeScolaire, terme: m.terme ?? null, nature: m.nature,
      motif: m.motif, autorite: m.autorite, referenceTexte: m.referenceTexte ?? null, decideLe: m.decideLe, idSaisie,
    },
  }]) as [string];
  await journaliser(profil, "Enregistrement d'une exonération", `${apprenantId} · ${m.nature}`, "gestion", true, null);
  return c.json({ id: idEvenement, apprenantId, deja: false }, 201);
});

/* ------------------------------------------------------------------ Réclamation : « j'ai payé, rien n'est enregistré » */

const DELAI_INSTRUCTION_JOURS = 7;

/**
 * Dépôt de la famille, réponse de l'école. Deux étapes, et c'est un choix assumé — pas un oublié.
 *
 * Le circuit générique `RECLAMATION` du socle (`packages/db/src/socle.ts:26`) en compte trois : dépôt,
 * instruction, « CORRECTION » par la direction départementale. Appliqué aux frais, le troisième maillon serait
 * une surface sans pouvoir : un fait de frais ne s'écrit QUE depuis le compte d'administration de l'école qui
 * scolarise l'élève (`compteEcoleRequis`, `administration`), et la direction départementale n'a aucune route pour
 * consigner une pièce. Lui ouvrir une étape reviendrait à faire croire à la famille qu'un échelon supérieur peut
 * réparer ce que seul l'école peut écrire. Le recours qui manque quand l'école refuse est dit tel quel au
 * cadrage (§7) ; il reste à construire, pas à maquiller.
 */
const CIRCUIT_RECLAMATION = {
  code: "RECLAMATION_FRAIS",
  libelle: "Pièce de frais payée et non consignée",
  etapes: [
    { ordre: 1, code: "DEPOT", role: "parent", delaiJours: 0 },
    { ordre: 2, code: "INSTRUCTION", role: "chef_etablissement", delaiJours: DELAI_INSTRUCTION_JOURS },
  ],
  version: "1.0",
};

/**
 * Une réclamation n'est pas un paiement et ne devient pas une boîte aux lettres :
 * 1. parler de CET élève se décide par le moteur ABAC sur `suivi_familial` (le lien de filiation vérifié), pas
 *    par un rôle deviné ici — le refus est journalisé comme tout accès ;
 * 2. ni somme ni devise dans le texte, et le terme réclamé doit être un terme que l'école a appelé cette
 *    année-là : on ne réclame pas une pièce pour un appel qui n'existe pas ;
 * 3. une seule réclamation vivante par élève, année et terme : la rejouer (clic double, réponse réseau perdue)
 *    renvoie la demande existante au lieu d'empiler deux dossiers sur la table de l'école.
 *
 * La visibilité ne change d'un octet nulle part : la réclamation se lit par la famille qui l'a déposée et par
 * l'administration de l'école, jamais par l'enseignant, la classe, l'élève ou un agrégat de pilotage.
 */
frais.post("/apprenants/:id/frais/reclamation", authentifie, limiteDebit(10, 60 * 60_000, cleUtilisateur), async (c) => {
  const profil = c.get("profil");
  const apprenantId = z.string().regex(/^APP-\d{6}$/).parse(c.req.param("id"));
  const ctx = await contexteApprenant(base(), apprenantId, profil);
  const decision = decider(profil, { ressource: { type: "dossier_apprenant", apprenantId }, finalite: "suivi_familial" }, { monde: ctx.monde, evenements: ctx.evenements });
  await journaliser(profil, "Dépôt d'une réclamation sur une pièce de frais", apprenantId, "suivi_familial", decision.autorise, decision.criteres.find((x) => !x.satisfait)?.critere ?? null);
  if (!decision.autorise) refuser("Une réclamation sur une pièce de frais se dépose pour son enfant, au sens du lien de filiation vérifié : dépôt refusé et journalisé");

  const etablissementId = await ecoleDeLApprenant(apprenantId);
  const m = await corps(c, z.object({
    anneeScolaire: ANNEE,
    terme: FraisTerme.nullish(),
    texte: z.string().trim().min(15, "Décrivez la pièce : 15 caractères au moins").max(500),
  }).strict());
  sansSomme("Texte de la réclamation", m.texte);
  const cadence = await chargerCadence(etablissementId, m.anneeScolaire);
  if (m.terme && cadence?.termes.length && !cadence.termes.some((t) => t.terme === m.terme)) throw new HTTPException(422, { message: "Terme non appelé par l'école cette année" });

  // Un dossier par élève, par année et par terme — pas par compte. Deux responsables légitimes du même enfant
  // (père et mère au registre) ne présentent pas deux réclamations identiques sur la table de l'école ; et la
  // clé se pose sur l'élève, donc la vérification et l'écriture partagent le même verrou, comme ailleurs quand
  // une lecture précède une écriture (« deux clics, deux dossiers » n'est pas une hypothèse rare ici).
  const dossier = await base().transaction(async (tx): Promise<{ id: string; deja: boolean; echeance: Date | null }> => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`reclamation:${apprenantId}:${m.anneeScolaire}:${m.terme ?? ""}`}))`);
    const vivantes = await tx.select({ id: schema.demandes.id }).from(schema.demandes)
      .where(and(eq(schema.demandes.modele, CIRCUIT_RECLAMATION.code), inArray(schema.demandes.statut, ["ouverte", "en_cours"]),
        sql`${schema.demandes.donnees}->>'apprenantId' = ${apprenantId}`,
        sql`${schema.demandes.donnees}->>'anneeScolaire' = ${m.anneeScolaire}`,
        m.terme ? sql`${schema.demandes.donnees}->>'terme' = ${m.terme}` : sql`coalesce(${schema.demandes.donnees}->>'terme', '') = ''`));
    if (vivantes.length) return { id: vivantes[0]!.id, deja: true, echeance: null };

    const id = `DEM-${randomUUID()}`;
    const echeance = new Date(Date.now() + DELAI_INSTRUCTION_JOURS * 86_400_000);
    await tx.insert(schema.modelesCircuit).values(CIRCUIT_RECLAMATION)
      .onConflictDoUpdate({ target: schema.modelesCircuit.code, set: { libelle: CIRCUIT_RECLAMATION.libelle, etapes: CIRCUIT_RECLAMATION.etapes, version: CIRCUIT_RECLAMATION.version } });
    await tx.insert(schema.demandes).values({
      id, modele: CIRCUIT_RECLAMATION.code,
      objet: `Pièce non consignée — ${apprenantId} · ${m.anneeScolaire}${m.terme ? ` · ${m.terme}` : ""}`,
      demandeurId: profil.id, ressource: etablissementId,
      donnees: { apprenantId, etablissementId, anneeScolaire: m.anneeScolaire, terme: m.terme ?? null, texte: m.texte },
      etapeCourante: "INSTRUCTION", statut: "en_cours", echeance,
    });
    await tx.insert(schema.decisions).values({ id: `DEC-${randomUUID()}`, demandeId: id, etape: "DEPOT", auteurId: profil.id, decision: "valide", motif: null });
    return { id, deja: false, echeance };
  });
  await journaliser(profil, "Dépôt d'une réclamation sur une pièce de frais", `${dossier.id} · ${apprenantId} · ${m.anneeScolaire}${m.terme ? ` ${m.terme}` : ""}`, "suivi_familial", true, null);
  if (dossier.deja) return c.json({ id: dossier.id, deja: true, statut: "en_cours" });
  return c.json({ id: dossier.id, echeance: dossier.echeance!.toISOString(), deja: false }, 201);
});

/**
 * Réclamations d'un élève ou d'une école, avec la dernière réponse rendue. `workflow.decisions` est en ajout
 * seul : la plus récente prime à l'écran, l'historique complet reste lisible au détail de la demande
 * (`GET /demandes/:id`), y compris par la famille qui l'a déposée.
 */
async function reclamationsLues(filtre: { apprenantId?: string; etablissementId?: string; anneeScolaire?: string }) {
  const cond = [eq(schema.demandes.modele, CIRCUIT_RECLAMATION.code)];
  if (filtre.apprenantId) cond.push(sql`${schema.demandes.donnees}->>'apprenantId' = ${filtre.apprenantId}`);
  if (filtre.etablissementId) cond.push(sql`${schema.demandes.donnees}->>'etablissementId' = ${filtre.etablissementId}`);
  if (filtre.anneeScolaire) cond.push(sql`${schema.demandes.donnees}->>'anneeScolaire' = ${filtre.anneeScolaire}`);
  const demandes = await base().select().from(schema.demandes).where(and(...cond)).orderBy(desc(schema.demandes.creeeLe)).limit(60);
  if (!demandes.length) return [];
  const reponses = await base().select().from(schema.decisions).where(and(inArray(schema.decisions.demandeId, demandes.map((d) => d.id)), sql`${schema.decisions.etape} <> 'DEPOT'`));
  const derniere = new Map<string, (typeof reponses)[number]>();
  for (const r of reponses.sort((a, b) => a.horodatage.getTime() - b.horodatage.getTime())) derniere.set(r.demandeId, r);
  return demandes.map((d) => {
    const x = d.donnees as { apprenantId?: string; terme?: string | null; texte?: string } | null;
    const r = derniere.get(d.id);
    return {
      id: d.id, apprenantId: x?.apprenantId ?? null, terme: x?.terme ?? null, texte: x?.texte ?? null,
      statut: d.statut, etapeCourante: d.etapeCourante, deposeeLe: d.creeeLe.toISOString(), echeance: d.echeance?.toISOString() ?? null,
      reponse: r ? { etape: r.etape, decision: r.decision, motif: r.motif, le: r.horodatage.toISOString() } : null,
    };
  });
}

/* ------------------------------------------------------------------ Lectures */

/**
 * Situation d'un élève, lue par celui qui la regarde légitimement : le responsable légal rattaché au registre
 * (finalité `suivi_familial`) ou l'administration de son école (`gestion`). La décision appartient au moteur
 * ABAC, pas à un rôle deviné ici ; l'accord comme le refus sont journalisés.
 */
frais.get("/apprenants/:id/frais", authentifie, limiteDebit(60, 60_000, cleUtilisateur), async (c) => {
  const profil = c.get("profil");
  const apprenantId = z.string().regex(/^APP-\d{6}$/).parse(c.req.param("id"));
  const ctx = await contexteApprenant(base(), apprenantId, profil);
  // Les deux finalités qui admettent une trace de frais sont évaluées par le moteur, et la première qui passe
  // décide : dériver la finalité du rôle (chef ⇒ « gestion ») reviendrait à refuser sa propre situation des
  // frais à un chef d'établissement parent d'un élève scolarisé ailleurs.
  const demander = (finalite: Finalite) => ({ finalite, decision: decider(profil, { ressource: { type: "dossier_apprenant", apprenantId }, finalite }, { monde: ctx.monde, evenements: ctx.evenements }) });
  const [suiviFamilial, gestion] = [demander("suivi_familial"), demander("gestion")] as const;
  const retenue = suiviFamilial.decision.autorise ? suiviFamilial : gestion;
  await journaliser(profil, "Consultation de la situation des frais", apprenantId, retenue.finalite, retenue.decision.autorise, retenue.decision.criteres.find((x) => !x.satisfait)?.critere ?? null);
  if (!retenue.decision.autorise || !ctx.apprenant) throw new HTTPException(403, { message: "La situation des frais ne se consulte que pour son enfant ou pour son école" });
  const situation = situationApprenant(ctx.monde, ctx.evenements, apprenantId);
  const annee = situation.classe?.anneeScolaire;
  if (!annee || !situation.etablissementId) return c.json({ decision: retenue.decision, apprenantId, anneeScolaire: null, situation: null, reclamations: [] });
  return c.json({
    decision: retenue.decision, apprenantId, anneeScolaire: annee,
    situation: await lireSituationFrais(ctx.evenements, situation.etablissementId, annee),
    // La famille lit ici ce qu'elle a déposé et la réponse de l'école ; l'administration de l'école lit la même
    // ligne depuis son état de rapprochement. Un seul objet, deux lecteurs légitimes, décidés par l'ABAC.
    reclamations: await reclamationsLues({ apprenantId, anneeScolaire: annee }),
  });
});

/**
 * État de rapprochement de l'école, terme par terme : ce qui a donné lieu à pièce, ce qui n'en a donné aucune,
 * ce qui est exonéré. Comparer un nombre de pièces à un effectif — pas une somme à une somme, qui n'existe
 * nulle part dans BEILE. L'école ne voit que ses élèves, et la lecture nominative est journalisée.
 */
frais.get("/etablissements/:id/frais", authentifie, limiteDebit(30, 60_000, cleUtilisateur), async (c) => {
  const id = z.string().regex(/^ETB-[A-Za-z0-9-]+$/).parse(c.req.param("id"));
  const { profil, etab } = await administration(c, id, "Consultation de la situation des frais de l'école");
  const annees = await base().selectDistinct({ anneeScolaire: schema.classes.anneeScolaire }).from(schema.classes)
    .where(eq(schema.classes.etablissementId, id)).orderBy(desc(schema.classes.anneeScolaire));
  const anneeScolaire = c.req.query("anneeScolaire") ?? annees[0]?.anneeScolaire ?? null;
  if (!anneeScolaire) return c.json({ etablissement: etab.nom, etablissementId: id, anneeScolaire: null, jour: jourLocal(), effectif: 0, annees: [], lignes: [], parTerme: [], totaux: {}, reclamations: [] });
  const annee = ANNEE.parse(anneeScolaire);
  // Le registre ne connaît une année d'école que par les classes qu'elle a ouvertes : une année arbitraire
  // rendrait un rapprochement d'élèves qui n'ont jamais été les siens.
  if (!annees.some((a) => a.anneeScolaire === annee)) throw new HTTPException(422, { message: `Aucune classe de cet établissement n'est déclarée en ${annee}` });
  const limite = z.coerce.number().int().min(1).max(500).catch(300).parse(c.req.query("limite"));
  // La recherche se fait côté serveur : sans elle, l'écran ne chercherait que dans les 300 lignes reçues et
  // prometteur d'un « retrouvez un élève précis » qui serait faux dès qu'une école est plus nombreuse.
  const recherche = (z.string().trim().min(1).max(60).catch("").parse(c.req.query("recherche")) || null)?.toLocaleLowerCase("fr");

  const [eleves, faits, cadence] = await Promise.all([
    // `scolarites` ne garde qu'une ligne par apprenant — l'état courant, sans colonne d'année : c'est donc
    // bien l'effectif scolarisé aujourd'hui dans l'école, et non la promotion de l'année lue. La distinction
    // est rendue à l'écran (`effectifCourant`) plutôt que gommée par un chiffre qui n'aurait pas de sens.
    base().select({ id: schema.apprenants.id, nom: schema.apprenants.nom, prenoms: schema.apprenants.prenoms, sexe: schema.apprenants.sexe, classeId: schema.scolarites.classeId, libelle: schema.classes.libelle })
      .from(schema.scolarites)
      .innerJoin(schema.apprenants, eq(schema.apprenants.id, schema.scolarites.apprenantId))
      .leftJoin(schema.classes, eq(schema.classes.id, schema.scolarites.classeId))
      .where(and(eq(schema.scolarites.etablissementId, id), eq(schema.scolarites.statut, "scolarise"))),
    base().select().from(schema.evenements)
      .where(and(inArray(schema.evenements.type, [...TYPES_FAITS_FRAIS]), eq(schema.evenements.etablissementId, id), sql`${schema.evenements.donnees}->>'anneeScolaire' = ${annee}`))
      .orderBy(schema.evenements.survenuLe),
    chargerCadence(id, annee),
  ]);
  // Les faits sont regroupés une fois pour toutes : la liste d'une école de 500 élèves ne parcourt pas le
  // registre cinq cents fois.
  const parEleve = new Map<string, Evenement[]>();
  for (const e of faits.map(enEvenement)) {
    // La cadence est un fait de l'école entière : seules la quittance et l'exonération nomment un élève.
    if (e.type !== "QUITTANCE_FRAIS" && e.type !== "EXONERATION_FRAIS") continue;
    const siennes = parEleve.get(e.apprenantId);
    if (siennes) siennes.push(e); else parEleve.set(e.apprenantId, [e]);
  }
  // Un élève qui a donné lieu à une pièce puis est sorti (mutation, abandon) reste dans l'état de
  // rapprochement : sa quittance existe au registre, la masquer parce qu'il n'est plus sur la liste du jour
  // ferait perdre une trace à l'école comme à sa famille. Il est marqué hors effectif.
  const surLaListe = new Set(eleves.map((x) => x.id));
  const sortants = await base().select({ id: schema.apprenants.id, nom: schema.apprenants.nom, prenoms: schema.apprenants.prenoms, sexe: schema.apprenants.sexe })
    .from(schema.apprenants).where(inArray(schema.apprenants.id, [...parEleve.keys()].filter((x) => !surLaListe.has(x))));
  const jour = jourLocal();
  const situationDe = (apprenantId: string) => {
    const siennes = parEleve.get(apprenantId) ?? [];
    return calculerSituation(annee, parAnnee(quittancesDe(siennes), annee), parAnnee(exonerationsDe(siennes), annee), cadence, jour);
  };
  const lignes: LigneFraisEcole[] = [
    ...eleves.map((e) => ({ apprenantId: e.id, nom: `${e.prenoms} ${e.nom}`, sexe: e.sexe, classe: e.libelle ?? null, ...situationDe(e.id) })),
    ...sortants.map((e) => ({ apprenantId: e.id, nom: `${e.prenoms} ${e.nom}`, sexe: e.sexe, classe: null, horsEffectif: true, ...situationDe(e.id) })),
  ];
  const compte = (s: StatutFrais) => lignes.filter((l) => l.statut === s).length;
  const parTerme = (cadence?.termes ?? []).map((t) => ({
    terme: t.terme, libelle: LIBELLE_TERME_FRAIS[t.terme], exigibleLe: t.exigibleLe,
    couvertes: lignes.filter((l) => l.termes.some((x) => x.terme === t.terme && x.etat === "paye")).length,
    exonerees: lignes.filter((l) => l.termes.some((x) => x.terme === t.terme && x.etat === "exonere")).length,
    attendues: lignes.filter((l) => l.termes.some((x) => x.terme === t.terme && x.etat === "attendu")).length,
    aVenir: lignes.filter((l) => l.termes.some((x) => x.terme === t.terme && x.etat === "a_venir")).length,
  }));
  await journaliser(profil, "Consultation de la situation des frais de l'école", `${id} · ${annee}`, "gestion", true, null);
  // Les agrégats ci-dessus sont calculés sur toute la population, recherche ou pas : un compte d'école doit
  // rester celui de l'école. Seule la liste nominative est filtrée puis tronquée.
  const matchantes = recherche ? lignes.filter((l) => l.nom.toLocaleLowerCase("fr").includes(recherche)) : lignes;
  const trie = matchantes.sort((a, b) => (a.statut === "attendu" ? 0 : 1) - (b.statut === "attendu" ? 0 : 1) || a.nom.localeCompare(b.nom, "fr"));
  // Le nom de l'élève joint à sa réclamation : l'école nomme déjà tous ses élèves ci-dessus, et une liste de
  // réclamations qui ne dirait que « APP-123456 » serait une liste à ne pas pouvoir traiter.
  const nomDe = new Map(lignes.map((l) => [l.apprenantId, l.nom]));
  const reclamations = (await reclamationsLues({ etablissementId: id, anneeScolaire: annee }))
    .map((r) => ({ ...r, nomApprenant: (r.apprenantId && nomDe.get(r.apprenantId)) || null }));
  return c.json({
    etablissement: etab.nom, etablissementId: id, anneeScolaire: annee, jour, annees: annees.map((a) => a.anneeScolaire),
    recherche,
    // La dernière année où l'école ouvre des classes : en dessous, l'effectif lu n'est plus la promotion de
    // l'année mais la liste scolarisée aujourd'hui, et l'écran doit le dire au lieu de laisser croire à un
    // rapprochement complet (le registre ne conserve pas d'historique des listes par année).
    anneeCourante: annees[0]?.anneeScolaire ?? null,
    cadence: cadence ? enCadence(cadence) : null,
    // Réclamations déposées pour les élèves de cette année : la réponse se rend depuis cet écran, et l'école
    // n'a pas à attendre que la famille revienne au guichet pour savoir où en est son dossier.
    reclamations,
    effectif: eleves.length,
    horsEffectif: sortants.length,
    totaux: { couvert: compte("couvert"), exonere: compte("exonere"), attendu: compte("attendu"), en_cours: compte("en_cours"), sans_declaration: compte("sans_declaration") },
    parTerme,
    trouves: trie.length,
    tronque: trie.length > limite,
    lignes: trie.slice(0, limite),
  });
});
