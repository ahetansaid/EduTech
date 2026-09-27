import { z } from "zod";
import { Composante, Diplome } from "./enseignement-superieur";
import {
  DecisionDiplome, ModeDeliberation, RegimePedagogique, SessionEvaluation,
  StatutCompte, StatutInscriptionUE, StatutJury, VoieAcquisition,
} from "./etudiants-superieur";
import { Matiere, Mention, Niveau } from "./referentiels";

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

  /* -------------------------------------------------- Enseignement supérieur (LMD + EFTP)
   * Mêmes faits, autre régime : un étudiant du supérieur n'est pas un élève de plus. La colonne
   * `type` de `ledger.evenements` est un `text` libre — ajouter ces membres à l'union ne demande
   * aucune migration, seulement leurs projections CQRS.
   */

  /** Une inscription supérieure = une personne, une filière, une année. Plusieurs lignes par personne. */
  Base.extend({
    type: z.literal("INSCRIPTION_SUPERIEURE"),
    apprenantId: z.string(),
    inscriptionId: z.string(),
    filiereId: z.string(),
    /** null pour une filière EFTP hors LMD. */
    composante: Composante.nullable(),
    anneeUniversitaire: z.string(),
    /** Le régime choisi par l'établissement est un fait enregistré, pas une déduction. */
    regimePedagogique: RegimePedagogique,
    /** Dimension de comptage national ; aucun montant, aucune bourse. */
    statutCompte: StatutCompte,
  }),
  /** Contrat d'UE signé par l'étudiant (choix individuel, jamais une classe entière). */
  Base.extend({
    type: z.literal("INSCRIPTION_UE"),
    apprenantId: z.string(),
    inscriptionUeId: z.string(),
    inscriptionSuperieureId: z.string(),
    offreUeId: z.string(),
    groupeId: z.string().nullable(),
    statut: StatutInscriptionUE,
  }),
  /** Note d'une UE à une session. Une UE peut être notée sans être acquise : la note ne suffit pas. */
  Base.extend({
    type: z.literal("EVALUATION_UE"),
    apprenantId: z.string(),
    offreUeId: z.string(),
    ueId: z.string(),
    session: SessionEvaluation,
    note: z.number().min(0).max(20),
    creditsEcts: z.number().int().positive(),
    coefficient: z.number().positive(),
  }),
  /** Acquisition d'un crédit ECTS : le seul fait qui rende un acquis définitif et transférable. */
  Base.extend({
    type: z.literal("VALIDATION_UE"),
    apprenantId: z.string(),
    validationId: z.string(),
    ueId: z.string(),
    /** null quand l'acquisition ne vient d'aucune offre (VAE, équivalence, acquis antérieur). */
    offreUeId: z.string().nullable(),
    periodeId: z.string().nullable(),
    voie: VoieAcquisition,
    /** Session dont provient l'acquisition ; `hors_session` pour une voie sans composition. */
    session: SessionEvaluation,
    creditsAcquis: z.number().int().positive(),
    moyenne: z.number().min(0).max(20).nullable(),
    /** La règle appliquée, après précédence : réponse à « pourquoi cette UE est-elle acquise ? ». */
    regleValidationId: z.string(),
    justification: z.string(),
  }),
  /** Vie du jury (constitution, réunion, délibération, publication) : la trace de l'acte, pas son contenu. */
  Base.extend({
    type: z.literal("JURY_PERIODE"),
    juryId: z.string(),
    autorite: ModeDeliberation,
    diplome: Diplome,
    periodeId: z.string().nullable(),
    sessionExamenId: z.string().nullable(),
    statut: StatutJury,
    /** Le jury se prouve par ses membres : sans eux, la composition ne serait pas reconstructible. */
    president: z.string(),
    membres: z.array(z.string()),
    quorum: z.number().int().positive(),
    /** Référence du procès-verbal signé : la source reste le papier, BEILE en tient la trace. */
    pvReference: z.string().nullable(),
  }),
  /** Décision d'un jury portant sur un diplôme national, avant émission du certificat. */
  Base.extend({
    type: z.literal("DELIBERATION_DIPLOME"),
    apprenantId: z.string(),
    deliberationId: z.string(),
    juryId: z.string(),
    filiereId: z.string(),
    decision: DecisionDiplome,
    creditsValides: z.number().int().nonnegative(),
    creditsRequis: z.number().int().nonnegative(),
    moyenneGenerale: z.number().min(0).max(20).nullable(),
    mention: Mention.nullable(),
    /** Ce qui manque : sans cela, un ajournement n'est pas contestable. */
    ueManquantes: z.array(z.string()),
  }),
  /** Report de crédits acquis vers une autre inscription — le transfert d'un capital, pas d'une année. */
  Base.extend({
    type: z.literal("TRANSFERT_CREDITS"),
    apprenantId: z.string(),
    deInscriptionSuperieureId: z.string(),
    versInscriptionSuperieureId: z.string(),
    versEtablissementId: z.string(),
    creditsTransferts: z.number().int().nonnegative(),
    ueIds: z.array(z.string()),
  }),
  Base.extend({
    type: z.literal("ABANDON_SUPERIEUR"),
    apprenantId: z.string(),
    inscriptionSuperieureId: z.string(),
    anneeUniversitaire: z.string(),
    motif: z.string().nullable(),
  }),
]);
export type Evenement = z.infer<typeof Evenement>;
export type TypeEvenement = Evenement["type"];

/** Distributive Omit : conserve le discriminant de chaque membre de l'union. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Événement à enregistrer : l'identifiant et la date d'enregistrement sont attribués par le registre. */
export type NouvelEvenement = DistributiveOmit<Evenement, "id" | "enregistreLe">;
