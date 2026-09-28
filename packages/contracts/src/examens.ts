import { z } from "zod";
import { Examen } from "./evenements";
import type { OfficeDeliberant } from "./etudiants-superieur";
import { Mention } from "./referentiels";

/**
 * Examens nationaux. BEILE ne les organise pas et ne les délibère pas : l'autorité compétente le fait
 * (plateforme officielle eRESULTATS). BEILE RÉCEPTIONNE les verdicts du procès-verbal officiel, puis,
 * à la publication, délivre au nom de cette autorité les diplômes vérifiables qui entrent dans le
 * parcours de l'apprenant. Aucune décision n'est calculée ici : le PV fait foi.
 */

/** L'autorité qui organise, délibère et publie chaque examen national du K-12. */
export const AUTORITE_EXAMEN: Readonly<Record<Examen, { office: OfficeDeliberant; sigle: string; libelle: string }>> = {
  CEP: { office: "dec_memp", sigle: "DEC-MEMP", libelle: "Direction des Examens et Concours du ministère des Enseignements maternel et primaire" },
  BEPC: { office: "dec_mestfp", sigle: "DEC-MESTFP", libelle: "Direction des Examens et Concours du ministère des Enseignements secondaire, technique et de la Formation professionnelle" },
  BAC: { office: "office_du_bac", sigle: "Office du Bac", libelle: "Office du Baccalauréat" },
};

export const StatutSession = z.enum(["ouverte", "composition", "deliberation", "publiee"]);
export type StatutSession = z.infer<typeof StatutSession>;

/** Décision du procès-verbal, telle que le jury l'a prononcée (absent et exclu ne sont pas des échecs notés). */
export const Decision = z.enum(["admis", "non_admis", "absent", "exclu"]);
export type Decision = z.infer<typeof Decision>;

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

/**
 * Requête de recherche publique : examen, session et numéro de table. La date de naissance est un second
 * facteur facultatif : sans elle, on apprend un verdict et une mention sans savoir à qui ils appartiennent
 * (les numéros de table se suivent : sans ce second facteur, une session entière se lirait nom par nom).
 */
export const RechercheResultat = z.object({
  examen: Examen,
  session: z.string().trim().min(1).max(40),
  table: z.string().trim().min(1).max(40),
  naissance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type RechercheResultat = z.infer<typeof RechercheResultat>;

/** Identité révélée seulement quand la date de naissance présentée concorde avec le registre. */
const Identite = z.object({ titulaire: z.string(), moyenne: z.number().nullable() }).nullable();

/**
 * Verdict public, minimal et daté par son autorité. Sans second facteur : le verdict et la mention.
 * Avec une date de naissance concordante : le nom et la moyenne. `dateNonConcordante` dit qu'une date a
 * été présentée sans correspondre — sans rien révéler de plus.
 */
export const ResultatExamenPublic = z.discriminatedUnion("statut", [
  z.object({
    statut: z.literal("admis"), examen: Examen, session: z.string(), numeroTable: z.string(), centre: z.string(),
    mention: Mention, autorite: z.string(), identite: Identite, dateNonConcordante: z.boolean(),
  }),
  z.object({
    statut: z.literal("non_admis"), examen: Examen, session: z.string(), numeroTable: z.string(),
    autorite: z.string(), identite: Identite, dateNonConcordante: z.boolean(),
  }),
  z.object({ statut: z.literal("session_non_publiee"), examen: Examen, session: z.string(), explication: z.string() }),
  z.object({ statut: z.literal("introuvable"), explication: z.string() }),
]);
export type ResultatExamenPublic = z.infer<typeof ResultatExamenPublic>;

/** Session publiée, telle que le service public la propose au choix (plus de saisie libre à deviner). */
export const SessionPubliee = z.object({ examen: Examen, session: z.string(), publieeLe: z.string().nullable(), autorite: z.string() });
export type SessionPubliee = z.infer<typeof SessionPubliee>;
