import { z } from "zod";
import { Examen } from "./evenements";

/**
 * Examens nationaux, façon e-résultat : une session (examen + session), des centres,
 * des candidatures portant un numéro de table, et une publication consultable par tous.
 * La décision est binaire (admis / non_admis) ; la moyenne et la mention ne circulent que
 * lorsque le jury a délibéré et que la session est publiée.
 */

export const StatutSession = z.enum(["ouverte", "composition", "deliberation", "publiee"]);
export type StatutSession = z.infer<typeof StatutSession>;

export const Decision = z.enum(["admis", "non_admis"]);
export type Decision = z.infer<typeof Decision>;

/** Mention du jury, alignée sur le barème déjà en usage (ne s'applique qu'aux admis). */
export const Mention = z.enum(["Très bien", "Bien", "Assez bien", "Passable"]);
export type Mention = z.infer<typeof Mention>;

export const CentreExamen = z.object({
  id: z.string(),
  nom: z.string(),
  communeId: z.string(),
  capacite: z.number().int().nonnegative(),
});
export type CentreExamen = z.infer<typeof CentreExamen>;

export const SessionExamen = z.object({
  id: z.string(),
  examen: Examen,
  session: z.string(),
  statut: StatutSession,
  arretCandidatures: z.string().nullable(),
  publieeLe: z.string().nullable(),
});
export type SessionExamen = z.infer<typeof SessionExamen>;

/** Candidature d'un apprenant à une session : centre retenu + numéro de table qui le convoque. */
export const Candidature = z.object({
  id: z.string(),
  sessionId: z.string(),
  apprenantId: z.string(),
  centreId: z.string(),
  numeroTable: z.string(),
  decision: Decision.nullable(),
  moyenne: z.number().nullable(),
  mention: Mention.nullable(),
});
export type Candidature = z.infer<typeof Candidature>;

/** Requête de recherche publique : par examen, session et numéro de table. */
export const RechercheResultat = z.object({
  examen: Examen,
  session: z.string().trim().min(1).max(40),
  table: z.string().trim().min(1).max(40),
});
export type RechercheResultat = z.infer<typeof RechercheResultat>;

/**
 * Verdict public. On ne renvoie jamais plus que le strict nécessaire, et uniquement
 * lorsque la session est publiée : c'est le service offert à un tiers sans compte.
 */
export const ResultatExamenPublic = z.discriminatedUnion("statut", [
  z.object({
    statut: z.literal("admis"),
    titulaire: z.string(),
    examen: Examen,
    session: z.string(),
    numeroTable: z.string(),
    centre: z.string(),
    moyenne: z.number(),
    mention: Mention,
  }),
  z.object({
    statut: z.literal("non_admis"),
    titulaire: z.string(),
    examen: Examen,
    session: z.string(),
    numeroTable: z.string(),
    centre: z.string(),
  }),
  z.object({
    statut: z.literal("session_non_publiee"),
    examen: Examen,
    session: z.string(),
    explication: z.string(),
  }),
  z.object({ statut: z.literal("introuvable"), explication: z.string() }),
]);
export type ResultatExamenPublic = z.infer<typeof ResultatExamenPublic>;
