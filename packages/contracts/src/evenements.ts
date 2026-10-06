import { z } from "zod";
import { Composante, Diplome } from "./enseignement-superieur";
import { DiplomeAtteste } from "./certification";
import { AutoriteDelivrance, ModeRetrait, PieceIdentite, TypeActe, TypeDecisionAllocation } from "./delivrance-actes";
import {
  DecisionDiplome, ModeDeliberation, OfficeDeliberant, RegimePedagogique, SessionEvaluation,
  StatutCompte, StatutInscriptionUE, StatutJury, VoieAcquisition,
} from "./etudiants-superieur";
import { Matiere, Mention, Niveau } from "./referentiels";

/**
 * Registre d'événements éducatifs (Education Event Ledger).
 * Ajout seul : une correction est un nouvel événement qui référence l'original.
 * L'état courant et les indicateurs se calculent à partir de ce registre.
 */

/**
 * D'où vient un fait. BEILE est la couche nationale : la plupart des faits sont REÇUS des systèmes qui
 * les produisent (EducMaster pour la vie scolaire, l'autorité d'examen pour les verdicts, l'université
 * pour ses délibérations, la DBAU pour les allocations) ; « beile » désigne la saisie de secours.
 */
export const SourceDonnee = z.enum(["beile", "registre_national", "educmaster", "examens", "universite", "dbau"]);
export type SourceDonnee = z.infer<typeof SourceDonnee>;

/** Qualités des membres d'un conseil de classe : ce que le registre retient d'eux (les noms restent au procès-verbal). */
export const QUALITES_CONSEIL = [
  "Chef d'établissement", "Censeur ou adjoint", "Professeur principal", "Enseignant", "Conseiller pédagogique",
  "Parent délégué", "Élève délégué", "Représentant de l'inspection", "Autre membre",
] as const;
export type QualiteConseil = (typeof QUALITES_CONSEIL)[number];

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
  /**
   * La séance qui statue, distincte des décisions qu'elle prend. Les faits PASSAGE disent ce qui a été
   * décidé pour chaque apprenant ; rien n'enregistrait jamais que le conseil s'était réuni, ce jour-là,
   * avec ces membres. Le procès-verbal signé restait seul hors du registre.
   *
   * Les membres sont désignés par leur QUALITÉ, jamais par leur nom : le registre ne s'efface pas, et des
   * parents délégués ou des élèves délégués (mineurs) y resteraient nommés pour toujours, sans droit à
   * l'effacement. Les noms restent au procès-verbal signé, dont la référence est inscrite.
   */
  Base.extend({
    type: z.literal("CONSEIL_DE_CLASSE"),
    etablissementId: z.string(),
    classeId: z.string(),
    anneeScolaire: z.string(),
    dateSeance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    membres: z.array(z.enum(QUALITES_CONSEIL)).min(1).max(20),
    referencePv: z.string().trim().max(40).nullable(),
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
  /**
   * Émission d'un diplôme vérifiable. Le fait porte la ligne entière, sceau compris : rejouer
   * `ledger.evenements` doit reconstruire `core.certificats`, sinon la certification devient un
   * document annexe que le registre ne contrôle plus.
   *
   * `examen` nomme ce qui est attesté — un examen du K-12 comme un diplôme national de l'EFTP ou du
   * LMD. `filiereId`, `delivrePar` et `office` ne se remplissent que pour le supérieur : le K-12 les
   * laisse vides, et c'est ce qui garde son sceau au format historique des diplômes déjà imprimés.
   * `delivrePar` et non `etablissementId` : la colonne de portée du fait désigne le centre d'examen,
   * celle du certificat désigne l'établissement qui a délivré — deux choses différentes pour un CEP.
   * `mention` et `moyenne` sont absentes quand le jury admet sur les seuls crédits acquis, sans
   * moyenne générale calculable — jamais un zéro inventé.
   */
  Base.extend({
    type: z.literal("CERTIFICATION"),
    apprenantId: z.string(),
    certificatId: z.string(),
    examen: DiplomeAtteste,
    filiereId: z.string().nullable(),
    delivrePar: z.string().nullable(),
    office: OfficeDeliberant.nullable(),
    session: z.string(),
    mention: Mention.nullable(),
    moyenne: z.number().min(0).max(20).nullable(),
    delivreLe: z.string(),
    empreinte: z.string(),
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

  /* -------------------------------------------------- Visites d'inspection.
   * Un fait sur un établissement, jamais sur une personne : la visite rend compte de ce qui s'est vu dans
   * l'école, pas du dossier d'un apprenant. La colonne `type` de `ledger.evenements` est un `text` libre —
   * ajouter ce membre ne demande aucune migration, et aucune projection : l'écran relit le registre.
   *
   * Aucune nomenclature n'est simulée : `objet` et `constats` restent du texte d'agent. Les textes
   * réglementaires consultés sur les inspections béninoises ne publient pas de typologie des motifs de
   * visite ; inventer une liste à trois cases et l'appeler « officielle » serait exactement ce que BEILE
   * refuse de faire.
   */
  Base.extend({
    type: z.literal("VISITE_D_INSPECTION"),
    etablissementId: z.string(),
    dateVisite: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    objet: z.string().trim().min(5).max(200),
    constats: z.string().trim().min(10).max(4000),
    recommandations: z.string().trim().max(4000).nullable(),
    /** Référence de l'acte papier ou du rapport signé, pour retrouver la pièce — pas pour la redondance. */
    referenceRapport: z.string().trim().max(80).nullable(),
    prochaineVisiteLe: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
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
    /** Le numéro d'étudiant est un fait de l'inscription : absent du registre, il ne serait pas reconstructible. */
    numeroEtudiant: z.string().nullable(),
    anneeUniversitaire: z.string(),
    /** Le régime choisi par l'établissement est un fait enregistré, pas une déduction. */
    regimePedagogique: RegimePedagogique,
    /** Dimension de comptage national ; le montant de la bourse reste hors du registre. */
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
    /** Un contrat refusé ou abandonné se justifie : sinon le motif n'existerait que dans l'écran. */
    motifRefus: z.string().nullable(),
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
    /** Office qui tient la session : un jury national sans office nommé ne serait pas opposable. */
    office: OfficeDeliberant.nullable(),
    diplome: Diplome,
    periodeId: z.string().nullable(),
    /** Filière jugée : sans elle, un jury de capitalisation ne serait rattachable à aucun cursus. */
    filiereId: z.string().nullable(),
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
    /** Repris de la ligne du jury par le serveur, jamais du client : la délibération se relit seule. */
    diplome: Diplome,
    decision: DecisionDiplome,
    creditsValides: z.number().int().nonnegative(),
    creditsRequis: z.number().int().nonnegative(),
    moyenneGenerale: z.number().min(0).max(20).nullable(),
    mention: Mention.nullable(),
    /** Ce qui manque : sans cela, un ajournement n'est pas contestable. */
    ueManquantes: z.array(z.string()),
    /** Le certificat émis sur cette décision, porté par le fait CERTIFICATION de la même délibération.
     *  Null pour un ajournement, un refus, et pour une admission sous réserve : le diplôme n'est pas
     *  encore délivré, donc rien n'est vérifiable par un tiers. */
    certificatId: z.string().nullable(),
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

  /* -------------------------------------------------- Guichet de l'étudiant et allocations
   * L'acte administratif entre au registre comme fait daté, et non comme colonne d'un écran : c'est
   * la date qui rend le retard imputable. Les dates légales (`demandeeLe`, `disponibleLe`, `remisLe`)
   * sont portées par le payload et non déduites de `survenuLe` — un guichet qui enregistre le
   * lendemain ne doit pas fabriquer un jour de retard.
   */

  /** Dépôt d'une demande d'acte. Le délai applicable y est copié : il ne se réécrira pas si le barème bouge. */
  Base.extend({
    type: z.literal("DEMANDE_ACTE"),
    apprenantId: z.string(),
    demandeId: z.string(),
    typeActe: TypeActe,
    autorite: AutoriteDelivrance,
    anneeUniversitaire: z.string().nullable(),
    periodeId: z.string().nullable(),
    delaiContractuelJours: z.number().int().positive(),
    delaiSource: z.string(),
    motifDemande: z.string().nullable(),
    demandeeLe: z.string(),
  }),
  /** Prise en charge par le guichet : le fait qui sépare « ma demande est tombée » de « quelqu'un la traite ». */
  Base.extend({
    type: z.literal("ACTE_EN_INSTRUCTION"),
    apprenantId: z.string(),
    demandeId: z.string(),
    prisEnChargeLe: z.string(),
  }),
  /** L'acte est prêt et signé : sans empreinte, la mise à disposition ne serait pas vérifiable. */
  Base.extend({
    type: z.literal("ACTE_DISPONIBLE"),
    apprenantId: z.string(),
    demandeId: z.string(),
    disponibleLe: z.string(),
    empreinte: z.string(),
  }),
  /** Remise, avec le mode et la pièce présentée : « remis » sans réceptionnaire n'est pas une preuve. */
  Base.extend({
    type: z.literal("ACTE_REMIS"),
    apprenantId: z.string(),
    demandeId: z.string(),
    remisLe: z.string(),
    modeRetrait: ModeRetrait,
    piecePresentee: PieceIdentite.nullable(),
    remisA: z.string().nullable(),
    /** Référence de quittance — une trace d'acquittement, jamais un montant. */
    referenceQuittance: z.string().nullable(),
  }),
  /** Refus motivé : un refus sans motif ne se conteste pas, donc n'existe pas dans ce modèle. */
  Base.extend({
    type: z.literal("ACTE_REFUSE"),
    apprenantId: z.string(),
    demandeId: z.string(),
    motif: z.string(),
    refuseLe: z.string(),
  }),
  /** L'étudiant retire sa propre demande : la demande reste visible, elle n'est pas effacée. */
  Base.extend({
    type: z.literal("ACTE_RETIRE"),
    apprenantId: z.string(),
    demandeId: z.string(),
    retireLe: z.string(),
  }),
  /** Décision de l'autorité sur une allocation. Aucun montant : la liquidation reste à la DBAU.
   *  `typeDecision` et non `type` : le discriminant de l'union est déjà pris par `type`. */
  Base.extend({
    type: z.literal("ALLOCATION_DECIDEE"),
    apprenantId: z.string(),
    allocationId: z.string(),
    anneeUniversitaire: z.string(),
    typeDecision: TypeDecisionAllocation,
    statutCompte: StatutCompte,
    autorite: z.enum(["dbau", "mesrs", "etablissement"]),
    referenceActe: z.string().nullable(),
    echeanceId: z.string().nullable(),
    motif: z.string().nullable(),
    decideLe: z.string(),
  }),
  /** Échéance nationale de dépôt : un calendrier est une donnée déclarée par l'autorité, pas du code. */
  Base.extend({
    type: z.literal("ECHEANCE_DEPOT"),
    echeanceId: z.string(),
    anneeUniversitaire: z.string(),
    typeDecision: TypeDecisionAllocation,
    dateLimite: z.string(),
    actesExiges: z.array(TypeActe),
    autorite: z.enum(["dbau", "mesrs"]),
    intitule: z.string(),
  }),
]);
export type Evenement = z.infer<typeof Evenement>;
export type TypeEvenement = Evenement["type"];

/** Distributive Omit : conserve le discriminant de chaque membre de l'union. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Événement à enregistrer : l'identifiant et la date d'enregistrement sont attribués par le registre. */
export type NouvelEvenement = DistributiveOmit<Evenement, "id" | "enregistreLe">;
