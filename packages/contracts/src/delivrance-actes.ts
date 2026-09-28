import { z } from "zod";
import { Composante, Diplome } from "./enseignement-superieur";
import { RegimePedagogique, StatutCompte } from "./etudiants-superieur";

/**
 * Délivrance des actes — le guichet de l'étudiant.
 *
 * Ce module n'existe pas parce que BEILE ne savait rien faire, mais parce qu'il modélisait le
 * diplôme comme un OBJET (`core.certificats`) et jamais comme un PROCESSUS. Or la douleur béninoise
 * est un délai, pas un contenu : la DEC publie elle-même ses délais (fiche CatIS `PS01536`, e-service
 * ouvert le 21/04/2026 : relevé 72 h, attestation 1 semaine, diplôme 2 semaines ; `PS00940` : diplôme
 * de licence national en 2 mois) et la ministre du MESRS impute la perte des bourses aux résultats
 * « pas donnés à bonne date » (ask.gouv.bj n°7). Daté, le retard devient imputable à un maillon.
 *
 * Trois principes de modélisation :
 *   1. l'acte est un FAIT du registre, pas une colonne : une demande, une mise à disposition, une
 *      remise, un refus, chacun horodaté et non répudiable ;
 *   2. le délai applicable est **copié à la demande** : si le barème bouge, l'historique ne se
 *      réécrit pas — sinon on jugerait rétrospectivement un guichet sur une règle nouvelle ;
 *   3. la chaîne est opposable : un diplôme national exige l'original de l'attestation définitive,
 *      qui exige l'originale de la provisoire (`PS00941`, `PS00942`). Un ordre qui ne serait pas celui
 *      des textes serait une fiction juridique.
 *
 * Trois couches, décidées par l'utilisateur le 2026-09-28, découplées exprés :
 *   A — éligibilité certifiée : l'Attestation de scolarité et de progression, déduite des faits
 *       d'inscription et d'acquis (`PS01179` réclame une fiche de préinscription validée, `PS01180`
 *       un relevé attestant le passage en année supérieure) ;
 *   B — statut d'allocataire : décision datée, autorité nommée, référence d'arrêté, période couverte ;
 *   C — maintien du droit : échéances de dépôt et dossiers manquants, parce que la perte de bourse
 *       vient du dépôt hors délai et du résultat non transmis, non du mérite.
 *
 * Limite stricte, reprise de la doctrine `etudiants-superieur` : BEILE **atteste** et **date**, il ne
 * perçoit aucune redevance et ne liquide rien. Une redevance n'entre ici que comme **référence de
 * quittance** — jamais comme montant ; pas davantage de RIB ni de pièce bancaire, qui resteraient de
 * toute façon hors du compartiment `core`.
 */

/* ================================================================== Vocabulaire de l'acte */

/**
 * Types d'actes délivrés dans le supérieur, nommés d'après les fiches CatIS et non inventés :
 * « Attestation de succès Provisoire aux examens nationaux de Licence » (`PS00942`), « … admission
 * définitive » (`PS00941`), « Diplôme de licence des examens nationaux » (`PS00940`), « Relevé de
 * notes » (`PS01536`). L'équivalence de diplôme (`PS00268`) est volontairement absente : elle est
 * statuée par la DGES/CNEED, pas par un guichet d'établissement, et n'a donc pas de circuit ici.
 */
export const TypeActe = z.enum([
  "releve_de_notes",
  "attestation_de_scolarite",
  "attestation_de_progression",
  "attestation_reussite_provisoire",
  "attestation_reussite_definitive",
  "diplome",
  "duplicata_de_diplome",
]);
export type TypeActe = z.infer<typeof TypeActe>;

/** Libellés administratifs, tels que l'usager les lit au guichet. */
export const LIBELLE_ACTE: Readonly<Record<TypeActe, string>> = {
  releve_de_notes: "Relevé de notes",
  attestation_de_scolarite: "Attestation de scolarité",
  attestation_de_progression: "Attestation de scolarité et de progression",
  attestation_reussite_provisoire: "Attestation de succès provisoire",
  attestation_reussite_definitive: "Attestation de succès (admission définitive)",
  diplome: "Diplôme",
  duplicata_de_diplome: "Duplicata de diplôme",
};

/**
 * Qui délivre. Le nommer est le seul moyen d'imputer un délai : « le diplôme tarde » ne se soigne
 * pas, « la DEC Supérieure retarde de 40 jours » oui. `dec_sup` = Direction des Examens et Concours
 * du MESRS (fiches `PS00940`/`PS00941`/`PS00942`, portail decsup.bj) ; `dbau` = Direction des
 * Bourses et Aides Universitaires ; `dges` = Direction Générale de l'Enseignement Supérieur.
 */
export const AutoriteDelivrance = z.enum(["etablissement", "dec_sup", "dges", "dbau"]);
export type AutoriteDelivrance = z.infer<typeof AutoriteDelivrance>;

/** Noms que l'usager lit à l'écran : une autorité désignée par son sigle seulement ne s'impute pas. */
export const LIBELLE_AUTORITE: Readonly<Record<AutoriteDelivrance, string>> = {
  etablissement: "guichet de l'établissement",
  dec_sup: "Direction des Examens et Concours (DEC)",
  dges: "Direction Générale de l'Enseignement Supérieur (DGES)",
  dbau: "Direction des Bourses et Aides Universitaires (DBAU)",
};

/**
 * Délai contractuel publié, en jours calendaires, avec sa source nommément citée. Ce sont des
 * délais ANNONCÉS par l'administration béninoise, pas des objectifs BEILE : l'écran doit pouvoir
 * dire d'où ils viennent. Aucun de ces chiffres n'est une promesse de notre système.
 */
export const BAREME_DELAI: Readonly<Record<TypeActe, { jours: number; autorite: AutoriteDelivrance; source: string }>> = {
  releve_de_notes: { jours: 3, autorite: "etablissement", source: "CatIS PS01536 — relevé de l'année en cours : 72 heures" },
  attestation_de_scolarite: { jours: 3, autorite: "etablissement", source: "par défaut du relevé, même guichet d'établissement (à confirmer par arrêté)" },
  attestation_de_progression: { jours: 3, autorite: "etablissement", source: "pièce exigée au renouvellement (CatIS PS01180) ; délai non publié, aligné sur le relevé" },
  attestation_reussite_provisoire: { jours: 30, autorite: "dec_sup", source: "CatIS PS00942 — 1 mois, valable 1 an" },
  attestation_reussite_definitive: { jours: 30, autorite: "dec_sup", source: "CatIS PS00941 — 1 mois" },
  diplome: { jours: 60, autorite: "dec_sup", source: "CatIS PS00940 — 2 mois (examen national de licence)" },
  duplicata_de_diplome: { jours: 60, autorite: "dec_sup", source: "faute de délai publié propre au duplicata, celui du diplôme (à confirmer)" },
};

/**
 * Précédence légale d'un acte : l'acte dont l'original est exigé pour l'obtenir. Issue des listes de
 * pièces des fiches (`PS00941` exige « l'attestation PROVISOIRE DE SUCCES DE LA DEC (ORIGINALE) »,
 * `PS00940` exige la définitive). null = aucun acte préalable, seulement des faits scolarité.
 */
export const PRECEDENCE_ACTE: Readonly<Record<TypeActe, TypeActe | null>> = {
  releve_de_notes: null,
  attestation_de_scolarite: null,
  attestation_de_progression: "releve_de_notes",
  attestation_reussite_provisoire: "releve_de_notes",
  attestation_reussite_definitive: "attestation_reussite_provisoire",
  diplome: "attestation_reussite_definitive",
  duplicata_de_diplome: "diplome",
};

export const precedenceDe = (t: TypeActe): TypeActe | null => PRECEDENCE_ACTE[t];

/* ================================================================== Cycle de vie de la demande */

export const StatutDemande = z.enum([
  "demandee", "en_instruction", "disponible", "remise", "refusee", "retiree",
]);
export type StatutDemande = z.infer<typeof StatutDemande>;

/**
 * Transitions autorisées, en données et non en branches. Sans table de transitions, un écran
 * pourrait marquer « remis » un acte jamais préparé — ce qui est exactement la fraude au guichet.
 * `retiree` : l'étudiant annule sa propre demande ; une demande refusée ne se rouvre pas, elle se
 * redépose (un refus reste dans l'histoire).
 */
export const TRANSITIONS_ACTE: Readonly<Record<StatutDemande, readonly StatutDemande[]>> = {
  demandee: ["en_instruction", "disponible", "refusee", "retiree"],
  en_instruction: ["disponible", "refusee"],
  disponible: ["remise", "refusee"],
  remise: [],
  refusee: [],
  retiree: [],
};

export const transitionValide = (de: StatutDemande, vers: StatutDemande) => TRANSITIONS_ACTE[de].includes(vers);

/**
 * Comment l'acte est remis. Les quatre modes viennent de la fiche `PS00189` (retrait du diplôme :
 * « le titulaire … un géniteur … un mandataire muni d'une procuration notariée ou établie au
 * tribunal … l'autorité académique »), augmentés du canal dématérialisé que `PS01536` a ouvert en
 * 2026 (téléchargement, gratuit jusqu'à trois fois).
 */
export const ModeRetrait = z.enum(["titulaire", "geniteur", "mandataire", "autorite_academique", "dematerialise"]);
export type ModeRetrait = z.infer<typeof ModeRetrait>;

/** Pièce d'identité présentée au guichet, même fiche. Une remise sans pièce nommée n'est pas prouvée. */
export const PieceIdentite = z.enum(["carte_nationale_identite", "passeport", "acte_naissance", "procuration_notariee", "procuration_tribunal"]);
export type PieceIdentite = z.infer<typeof PieceIdentite>;

/**
 * Une demande d'acte, de bout en bout. Les dates sont portées par la ligne (et par le registre) :
 * c'est `disponibleLe - demandeeLe` qui mesure le guichet, `remisLe - disponibleLe` qui mesure
 * l'étudiant. Ne garder qu'une seule des deux rendrait tout débat impossible.
 */
export const DemandeActe = z.object({
  id: z.string(),
  apprenantId: z.string(),
  etablissementId: z.string().nullable(),
  typeActe: TypeActe,
  autorite: AutoriteDelivrance,
  /** AAAA-AAAA. Un relevé ou une attestation se demande au titre d'une année, jamais « en général ». */
  anneeUniversitaire: z.string().nullable(),
  periodeId: z.string().nullable(),
  statut: StatutDemande,
  /** Copié du barème au moment du dépôt : le délai jugé est celui qui courait ce jour-là. */
  delaiContractuelJours: z.number().int().positive(),
  delaiSource: z.string(),
  motifDemande: z.string().nullable(),
  /** Exigée pour un duplicata (perte, vol) : sans trace, le duplicata est un second original. */
  motifRefus: z.string().nullable(),
  demandeeLe: z.string(),
  disponibleLe: z.string().nullable(),
  remisLe: z.string().nullable(),
  modeRetrait: ModeRetrait.nullable(),
  piecePresentee: PieceIdentite.nullable(),
  /** Nom du réceptionnaire quand ce n'est pas le titulaire (géniteur, mandataire, autorité). */
  remisA: z.string().nullable(),
  /** Référence de quittance, jamais un montant : `PS00940` exige « originale et copie de la quittance ». */
  referenceQuittance: z.string().nullable(),
  /** Empreinte des champs signés de l'acte : un tiers peut vérifier le document sans compte. */
  empreinte: z.string().nullable(),
  /**
   * Ci-dessous, deux valeurs **calculées à la lecture**, jamais stockées : les garder dans le même
   * contrat que la ligne évite qu'un écran fasse son arithmetic des délais avec sa propre horloge.
   */
  joursEcoules: z.number().int().nullable(),
  retardJours: z.number().int().nullable(),
});
export type DemandeActe = z.infer<typeof DemandeActe>;

/** Statuts qu'un guichet (ou l'État) peut imposer à une demande : `demandee` se dépose, `retiree` se retire. */
export const StatutViseParGuichet = z.enum(["en_instruction", "disponible", "remise", "refusee"]);
export type StatutViseParGuichet = z.infer<typeof StatutViseParGuichet>;

/**
 * Décision du guichet : une seule forme, le statut visé porte les champs exigés autour de lui. C'est
 * le serveur qui exige le motif d'un refus, le mode d'une remise et la procuration d'un mandataire —
 * un formulaire qui pourrait soumettre une `remise` sans réceptionnaire recréerait la fraude au guichet.
 */
export const DecisionGuichet = z.object({
  statut: StatutViseParGuichet,
  /**
   * Date légale de l'acte, déclarée par l'agent qui prépare ou qui remet : le guichet qui enregistre le
   * lendemain d'une remise ne doit pas fabriquer un jour de retard pour l'étudiant.
   */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  modeRetrait: ModeRetrait.optional(),
  piecePresentee: PieceIdentite.nullable().optional(),
  remisA: z.string().trim().max(120).nullable().optional(),
  /** Référence de quittance, jamais un montant. */
  referenceQuittance: z.string().trim().max(60).nullable().optional(),
  motif: z.string().trim().max(200).optional(),
}).strict();
export type DecisionGuichet = z.infer<typeof DecisionGuichet>;

/* ================================================================== Couche A — éligibilité certifiée */

/**
 * Passage constaté au titre de l'année. `non_delibere` n'est pas une note : c'est l'aveu qu'aucune
 * délibération n'a été enregistrée — le cas qui fait perdre la bourse, précisément. `refuse` rejoint
 * `DecisionDiplome` : un jury peut prononcer un refus, et une attestation qui le fondrait dans
 * « ajourné » dirait faux sur la décision rendue.
 */
export const PassageConstate = z.enum(["admis", "admis_sous_reserve", "ajourne", "refuse", "non_delibere"]);
export type PassageConstate = z.infer<typeof PassageConstate>;

/**
 * Attestation de scolarité et de progression : la pièce que la DBAU réclame déjà sur papier
 * (« copie de la fiche de préinscription validée », `PS01179` ; « relevé attestant le passage en
 * année supérieure », `PS01180`). Tout ce qu'elle affirme est déduit de faits déjà enregistrés —
 * inscription, crédits acquis, délibération. Rien n'y est saisi à la main, sinon elle ne serait
 * pas vérifiable.
 */
export const AttestationScolarite = z.object({
  apprenantId: z.string(),
  numeroEtudiant: z.string().nullable(),
  etablissementId: z.string(),
  etablissementNom: z.string(),
  filiereIntitule: z.string(),
  diplomeVise: Diplome,
  composante: Composante.nullable(),
  anneeUniversitaire: z.string(),
  regimePedagogique: RegimePedagogique,
  inscriteLe: z.string(),
  /**
   * Crédits capitalisés AU TITRE DE L'ANNÉE (acquis rattachés à une période de cette année) et cumul
   * porté par la projection d'inscription. Les confondre laisserait un étudiant de L2 à 60 crédits
   * passer pour un étudiant ayant validé son année : c'est exactement ce que la DBAU vérifie.
   */
  creditsAcquisAnnee: z.number().int().nonnegative(),
  creditsAcquisCumules: z.number().int().nonnegative(),
  /** Crédits que l'année permettait de capitaliser, selon les périodes déclarées. 0 = aucune période déclarée. */
  creditsAttendusAnnee: z.number().int().nonnegative(),
  /**
   * Moyenne telle que le jury l'a arrêtée (`deliberations_diplome.moyenne_generale`), jamais recompétée
   * ici : une moyenne que personne n'a délibérée ne se certifie pas. Null = année non délibérée.
   */
  moyennePonderee: z.number().min(0).max(20).nullable(),
  passage: PassageConstate,
  /** Date de la délibération citée ci-dessus ; null si aucune. Sans elle, « admis » ne veut rien dire d'une année précise. */
  delibereLe: z.string().nullable(),
  delivreLe: z.string(),
  /**
   * Empreinte de l'acte signé quand une demande du guichet existe ; à défaut, empreinte de l'aperçu
   * calculé ici. La distinction est affichée : un aperçu n'est pas un document délivré.
   */
  empreinte: z.string(),
  /** L'acte du guichet qui porte cette attestation ; null si elle n'a pas encore été demandée. */
  demandeId: z.string().nullable(),
  /** false = aucun acte délivré : le document affiché n'a aucune valeur administrative. */
  delivre: z.boolean(),
});
export type AttestationScolarite = z.infer<typeof AttestationScolarite>;

/* ================================================================== Couche B — statut d'allocataire */

/**
 * Les trois actes que la DBAU distingue, d'après les intitulés de fiches CatIS : attribution,
 * renouvellement, rétablissement (`PS01179`, `PS01178`). Le secours est une famille à part : le
 * MESRS en annonce un quota, avec repêchage de non-boursiers au semestre 3 (ask.gouv.bj n°7) ;
 * ce n'est pas une bourse et il ne faut pas le compter comme telle.
 */
export const TypeDecisionAllocation = z.enum(["attribution", "renouvellement", "retablissement", "secours"]);
export type TypeDecisionAllocation = z.infer<typeof TypeDecisionAllocation>;

/** Libellés des statuts de compte, tels qu'un étudiant les lit : un code source à l'écran ne certifie rien. */
export const LIBELLE_STATUT_COMPTE: Readonly<Record<StatutCompte, string>> = {
  boursier_integral: "Boursier intégral",
  demi_boursier: "Demi-boursier",
  secours: "Bénéficiaire d'un secours universitaire",
  payant: "Payant",
  non_precise: "Statut non déclaré",
};

/**
 * Décision de l'autorité sur une allocation. Le vocabulaire du compte est celui de
 * `StatutCompte` — élargi ici (boursier intégral / demi-boursier / secours / payant) parce que la
 * demi-bourse et le secours existent dans le mécanisme réel et que les fondre dans un « boursier »
 * unique fausserait le décompte national.
 *
 * FRONTIÈRE ACCEPTÉE, à ne pas élargir sans décision : **aucun montant, aucun échéancier, aucun RIB,
 * aucune pièce d'identité bancaire.** La liquidation reste à la DBAU et au Trésor public (les
 * bourses sont « virées dans les comptes bancaires » — ce virement n'est pas notre donnée). Une
 * référence d'arrêté, une autorité et une période couverte : assez pour certifier un statut, pas
 * assez pour tenir une comptabilité.
 */
export const AllocationEtudiante = z.object({
  id: z.string(),
  apprenantId: z.string(),
  etablissementId: z.string().nullable(),
  anneeUniversitaire: z.string(),
  /** `typeDecision` : dans le registre, `type` porte déjà le discriminant du fait. */
  typeDecision: TypeDecisionAllocation,
  statut: StatutCompte,
  autorite: z.enum(["dbau", "mesrs", "etablissement"]),
  /** Rappel du texte appliqué (décret 155-2017 du 10 mars 2017, tel que cité par le MESRS). */
  referenceActe: z.string().nullable(),
  decideLe: z.string(),
  /** Date limite de dépôt à laquelle cette décision répondait ; c'est le risque que voit la couche C. */
  echeanceId: z.string().nullable(),
  motif: z.string().nullable(),
});
export type AllocationEtudiante = z.infer<typeof AllocationEtudiante>;

/* ================================================================== Couche C — maintien de droit */

/**
 * Échéance nationale de dépôt d'un dossier d'allocation, par année et par type de décision. Un
 * calendrier n'est pas du code : la date bouge chaque année et c'est l'autorité qui la fixe.
 */
export const EcheanceDepot = z.object({
  id: z.string(),
  anneeUniversitaire: z.string(),
  typeDecision: TypeDecisionAllocation,
  dateLimite: z.string(),
  /** Ce que l'étudiant doit produire au titre de cette échéance. Vide = échéance informative. */
  actesExiges: z.array(TypeActe),
  autorite: z.enum(["dbau", "mesrs"]),
  /** Libellé affiché tel que déclaré — jamais une reformulation de nous. */
  intitule: z.string(),
});
export type EcheanceDepot = z.infer<typeof EcheanceDepot>;

export const StatutDossier = z.enum(["complet", "incomplet", "sans_echeance", "hors_delai"]);
export type StatutDossier = z.infer<typeof StatutDossier>;

/**
 * Lecture d'un dossier au regard d'une échéance : ce qui est dû, ce qui existe déjà dans le
 * registre, et dans combien de jours ça ferme. C'est là que la perte de bourse devient évitable —
 * la ministre impute ces pertes au dépôt hors délai, pas au mérite.
 *
 * Cet agrégat n'existe que pour la personne concernée ou l'administration : un effectif de dossiers
 * incomplets d'une petite filière se lit comme un annuaire, il tombe donc sous la règle des petits
 * effectifs côté lecture.
 */
export const DossierAllocation = z.object({
  apprenantId: z.string(),
  anneeUniversitaire: z.string(),
  /** L'échéance retenue — celle de la dernière décision de l'intéressé, ou d'une première demande. */
  typeDecision: TypeDecisionAllocation,
  echeance: EcheanceDepot.nullable(),
  joursRestants: z.number().int().nullable(),
  pieces: z.array(z.object({
    typeActe: TypeActe,
    /** Date de REMISE de la pièce. Une pièce prête au guichet mais non retirée compte manquante. */
    produiteLe: z.string().nullable(),
    /** Une pièce peut être prête au guichet mais pas encore remise : la distinction est l'action. */
    statutDemande: StatutDemande.nullable(),
  }).strict()),
  statut: StatutDossier,
});
export type DossierAllocation = z.infer<typeof DossierAllocation>;

/* ================================================================== Agrégats de pilotage */

/**
 * Délai constaté par unité (établissement, ou composante d'un établissement). Medianne seulement :
 * une moyenne se laisse tirer par deux guichets lents, et un effectif bas ne doit pas pouvoir
 * réidentifier un demandeur. `petiteUnite` prévient le lecteur, il ne masque rien — le masquage se
 * décide à la lecture, pas ici.
 */
export const DelaisConstates = z.object({
  etablissementId: z.string(),
  etablissementNom: z.string().nullable(),
  typeActe: TypeActe,
  /** L'autorité qui doit signer : sans elle, on imputerait à une université la lenteur de sa DEC. */
  autorite: AutoriteDelivrance,
  delaiContractuelJours: z.number().int().positive(),
  demandes: z.number().int().nonnegative(),
  remises: z.number().int().nonnegative(),
  /** Demandes closes plus vite que le délai publié. */
  dansDelai: z.number().int().nonnegative(),
  medianeJours: z.number().int().nullable(),
  petiteUnite: z.boolean(),
});
export type DelaisConstates = z.infer<typeof DelaisConstates>;

/* ================================================================== Vérification publique d'un acte */

/**
 * Réponse du service public de vérification, volontairement pauvre : elle prouve qu'un acte existe et
 * qu'il n'a pas été modifié, elle ne dit ni à qui il a été délivré ni ce qu'il contient. Un annuaire
 * de diplômes consultable par n'importe qui serait une fuite, pas un service.
 */
export const VerificationActe = z.discriminatedUnion("statut", [
  z.object({
    statut: z.literal("authentique"),
    demandeId: z.string(),
    typeActe: TypeActe,
    libelle: z.string(),
    autorite: AutoriteDelivrance,
    anneeUniversitaire: z.string().nullable(),
    delivreLe: z.string(),
  }),
  /** Demande retirée par son auteur avant toute mise à disposition : le dépôt a existé, le document non. */
  z.object({ statut: z.literal("retire"), demandeId: z.string(), libelle: z.string(), explication: z.string() }),
  /**
   * L'acte existe, mais aucune empreinte n'a été présentée : rien ne relie le papier tendu à ce que le
   * guichet a scellé. Même régime que les diplômes — le QR de l'acte porte l'empreinte.
   */
  z.object({ statut: z.literal("sans_empreinte"), demandeId: z.string(), libelle: z.string(), explication: z.string() }),
  z.object({ statut: z.literal("altere"), demandeId: z.string(), explication: z.string() }),
  z.object({ statut: z.literal("introuvable"), explication: z.string() }),
]);
export type VerificationActe = z.infer<typeof VerificationActe>;
