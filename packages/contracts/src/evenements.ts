import { z } from "zod";
import { Matiere, Niveau } from "./referentiels";

/**
 * Registre d'événements éducatifs (Education Event Ledger).
 * Ajout seul : une correction est un nouvel événement qui référence l'original.
 * L'état courant et les indicateurs se calculent à partir de ce registre.
 */

export const SourceDonnee = z.enum(["beile", "registre_national", "educmaster", "examens"]);
export type SourceDonnee = z.infer<typeof SourceDonnee>;

const Base = z.object({
  id: z.string(),
  survenuLe: z.string(),
  enregistreLe: z.string(),
  auteurId: z.string(),
  source: SourceDonnee,
  etablissementId: z.string().nullable(),
});

export const Examen = z.enum(["CEP", "BEPC", "BAC"]);
export type Examen = z.infer<typeof Examen>;

export const Evenement = z.discriminatedUnion("type", [
  Base.extend({
    type: z.literal("INSCRIPTION"),
    apprenantId: z.string(),
    classeId: z.string(),
    anneeScolaire: z.string(),
  }),
  Base.extend({
    type: z.literal("EVALUATION"),
    apprenantId: z.string(),
    classeId: z.string(),
    matiere: Matiere,
    note: z.number().min(0).max(20),
    trimestre: z.number().int().min(1).max(3),
    anneeScolaire: z.string(),
  }),
  Base.extend({
    type: z.literal("CORRECTION_EVALUATION"),
    apprenantId: z.string(),
    evenementCorrigeId: z.string(),
    nouvelleNote: z.number().min(0).max(20),
    motif: z.string(),
  }),
  Base.extend({
    type: z.literal("ABSENCE"),
    apprenantId: z.string(),
    classeId: z.string(),
    date: z.string(),
    justifiee: z.boolean(),
    anneeScolaire: z.string(),
  }),
  /**
   * Justificatif d'absence transmis par un responsable légal. Ajout seul : il référence les absences
   * d'origine (jamais modifiées) et porte le motif déclaré. L'établissement statue ensuite par un fait
   * DECISION_JUSTIFICATION.
   */
  Base.extend({
    type: z.literal("JUSTIFICATION_ABSENCE"),
    apprenantId: z.string(),
    absenceIds: z.array(z.string()),
    dates: z.array(z.string()),
    classeId: z.string().nullable(),
    motif: z.string(),
    declarantNpi: z.string(),
  }),
  /** Décision de l'établissement sur un justificatif : référence le fait JUSTIFICATION_ABSENCE d'origine. */
  Base.extend({
    type: z.literal("DECISION_JUSTIFICATION"),
    apprenantId: z.string(),
    justificationId: z.string(),
    absenceIds: z.array(z.string()),
    decision: z.enum(["validee", "refusee"]),
    motif: z.string().nullable(),
  }),
  Base.extend({
    type: z.literal("PASSAGE"),
    apprenantId: z.string(),
    deNiveau: Niveau,
    versNiveau: Niveau,
    decision: z.enum(["admis", "redouble"]),
    anneeScolaire: z.string(),
  }),
  Base.extend({
    type: z.literal("TRANSFERT"),
    apprenantId: z.string(),
    deEtablissementId: z.string(),
    versEtablissementId: z.string(),
    versClasseId: z.string(),
    anneeScolaire: z.string(),
  }),
  Base.extend({
    type: z.literal("ABANDON"),
    apprenantId: z.string(),
    anneeScolaire: z.string(),
  }),
  Base.extend({
    type: z.literal("REPRISE"),
    apprenantId: z.string(),
    classeId: z.string(),
    anneeScolaire: z.string(),
  }),
  Base.extend({
    type: z.literal("RESULTAT_EXAMEN"),
    apprenantId: z.string(),
    examen: Examen,
    session: z.string(),
    moyenne: z.number(),
    admis: z.boolean(),
  }),
  Base.extend({
    type: z.literal("CERTIFICATION"),
    apprenantId: z.string(),
    certificatId: z.string(),
    examen: Examen,
    session: z.string(),
    mention: z.string(),
  }),
  /**
   * Révocation d'un diplôme par l'autorité de certification. Le diplôme n'est jamais effacé — la
   * révocation est un fait du registre qui référence le certificat, et l'état courant
   * (core.certificats.revoque) s'en déduit. Le service public de vérification rend alors « révoqué ».
   */
  Base.extend({
    type: z.literal("REVOCATION_CERTIFICAT"),
    apprenantId: z.string(),
    certificatId: z.string(),
    motif: z.string(),
  }),
  Base.extend({
    type: z.literal("REGULARISATION_IDENTITE_DEMANDEE"),
    apprenantId: z.string(),
    motif: z.string(),
  }),
  Base.extend({
    type: z.literal("AFFECTATION_ENSEIGNANT"),
    enseignantId: z.string(),
    versEtablissementId: z.string(),
  }),
  Base.extend({
    type: z.literal("FORMATION_ENSEIGNANT"),
    enseignantId: z.string(),
    formation: z.string(),
    statut: z.enum(["inscrit", "validee"]),
  }),
]);
export type Evenement = z.infer<typeof Evenement>;
export type TypeEvenement = Evenement["type"];

/** Distributive Omit : conserve le discriminant de chaque membre de l'union. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Événement à enregistrer : l'identifiant et la date d'enregistrement sont attribués par le registre. */
export type NouvelEvenement = DistributiveOmit<Evenement, "id" | "enregistreLe">;
