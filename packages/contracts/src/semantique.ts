import { z } from "zod";
import { Cycle, Matiere, Milieu, Niveau, Sexe, StatutEtablissement } from "./referentiels";

/**
 * Couche sémantique et dictionnaire national des données (§11.2).
 * Aucun indicateur n'est calculé sans définition publiée.
 */

export const Dimension = z.enum(["sexe", "departement", "commune", "milieu", "statut", "niveau", "cycle", "examen", "annee"]);
export type Dimension = z.infer<typeof Dimension>;

export const DIMENSION_LIBELLE: Record<Dimension, string> = {
  sexe: "Sexe",
  departement: "Département",
  commune: "Commune",
  milieu: "Milieu",
  statut: "Statut de l'établissement",
  niveau: "Niveau",
  cycle: "Cycle d'enseignement",
  examen: "Examen",
  annee: "Année scolaire",
};

/** Examen national rendu par la couche statistique. Un par fin de cycle : CEP, BEPC, BAC. */
export const EXAMENS_NATIONAUX_K12 = ["CEP", "BEPC", "BAC"] as const;
export type ExamenNationalK12 = (typeof EXAMENS_NATIONAUX_K12)[number];

/** Équipement d'un établissement dont on peut mesurer la part d'accès. */
export const INFRASTRUCTURES = ["eau", "electricite", "internet", "latrines", "bibliotheque"] as const;
export type Infrastructure = (typeof INFRASTRUCTURES)[number];
export const INFRASTRUCTURE_LIBELLE: Record<Infrastructure, string> = {
  eau: "Point d'eau",
  electricite: "Raccordement électrique",
  internet: "Accès internet",
  latrines: "Latrines",
  bibliotheque: "Bibliothèque",
};

/**
 * Ce qu'un calculateur observe pour rendre sa valeur. Le driver de la couche statistique ne connaît
 * que ces quatre assiettes : un indicateur qui demanderait une cinquième n'a rien à calculer ici, et
 * le registre le dit au lieu de rendre un nombre approximé.
 */
export const AssietteCalcul = z.enum(["cellule", "commune", "etablissement", "examen"]);
export type AssietteCalcul = z.infer<typeof AssietteCalcul>;

/**
 * La voie de formation dont relève l'indicateur. Publier le périmètre, c'est permettre à un décideur
 * de savoir d'un coup d'œil si l'outil peut répondre à sa question — et à l'équipe, quels calculateurs
 * restent à écrire.
 */
export const PerimetreIndicateur = z.enum(["k12", "superieur", "eftp", "pilotage"]);
export type PerimetreIndicateur = z.infer<typeof PerimetreIndicateur>;
export const PERIMETRE_LIBELLE: Record<PerimetreIndicateur, string> = {
  k12: "Primaire et secondaire",
  superieur: "Enseignement supérieur (LMD)",
  eftp: "EFTP et apprentissage",
  pilotage: "Pilotage transverse",
};

/**
 * Ce qui calcule l'indicateur. Deux moteurs coexistent et le dire fait partie de la définition :
 * `simulation` = la couche statistique nationale du prototype ; `registre` = les écritures nominatives
 * du registre du supérieur, agrégées par l'API métier. Publier une définition sans moteur, ce serait
 * promettre un chiffre que personne ne rend ; l'exiger, ce serait faire croire qu'Ask Education le
 * calcule alors qu'il n'en a pas les données.
 */
export const MoteurCalcul = z.enum(["simulation", "registre"]);
export type MoteurCalcul = z.infer<typeof MoteurCalcul>;

export const MOTEUR_LIBELLE: Record<MoteurCalcul, string> = {
  simulation: "Couche statistique nationale",
  registre: "Registre du supérieur (écrans de scolarité)",
};

export const CodeIndicateur = z.enum([
  "effectif_apprenants",
  "taux_seuil_moyenne",
  "moyenne_generale",
  "taux_absenteisme",
  "ratio_apprenants_enseignant",
  "taux_occupation",
  "taux_abandon",
  "taux_reussite_examen",
  "credits_ects_acquis",
  "taux_capitalisation_ects",
  /* Périmètre primaire + secondaire, ajouté au registre du 2026-09-29. */
  "taux_scolarisation_brut",
  "population_scolarisable",
  "taux_surage",
  "indice_parite",
  "part_enseignants_qualifies",
  "ratio_apprenants_salle",
  "taux_acces_infrastructure",
  "places_disponibles",
  "taux_presence_examen",
  "dispersion_moyennes",
  "croissance_effectifs",
  "effectif_projete_2030",
  /* Périmètre pilotage transverse : la qualité de la donnée elle-même, mesurée comme les autres. */
  "taux_depot_donnees",
  "fraicheur_donnees",
]);
export type CodeIndicateur = z.infer<typeof CodeIndicateur>;

/**
 * La recette d'illustration. Elle est dans le contrat et non dans l'écran, parce que c'est le
 * propriétaire de l'indicateur qui sait comment sa valeur se lit : un taux d'abandon et un effectif
 * n'ont pas la même échelle, le même repère, ni le même sens. Une IA ne choisissait pas cela — le
 * registre le porte, et n'importe quelle interface (écran, CSV, impression) rend la même figure.
 */
export const FormeIllustration = z.enum([
  "jauge",
  "serie",
  "classement",
  "repartition",
  "carte",
  "matrice",
  "decomposition",
]);
export type FormeIllustration = z.infer<typeof FormeIllustration>;
export const FORME_LIBELLE: Record<FormeIllustration, string> = {
  jauge: "Jauge de référence",
  serie: "Série temporelle",
  classement: "Classement territorial",
  repartition: "Répartition",
  carte: "Carte choroplèthe",
  matrice: "Croisement de deux dimensions",
  decomposition: "Numérateur sur dénominateur",
};

/** Sens dans lequel la valeur s'améliore : c'est la moitié de la lecture d'un chiffre. */
export const SensValeur = z.enum(["hausse_favorable", "baisse_favorable", "neutre"]);
export type SensValeur = z.infer<typeof SensValeur>;

export const PalierIllustration = z.object({
  /** Borné inclus. `null` = borne supérieure ouverte (« et plus »). */
  max: z.number().nullable(),
  mention: z.string(),
});
export type PalierIllustration = z.infer<typeof PalierIllustration>;

export const Illustration = z.object({
  forme: FormeIllustration,
  /** Étendue réellement rendue par le calcul, pour que la figure ne mente pas sur ses bords. */
  echelle: z.string(),
  sens: SensValeur,
  /** Repère d'interprétation : valeur nationale, cible, norme publiée. */
  reference: z.string().nullable(),
  paliers: z.array(PalierIllustration).min(1),
  /** Ce que le décideur doit retenir, formulé sans la valeur : la lectrice, pas le chiffre. */
  lecture: z.string(),
});
export type Illustration = z.infer<typeof Illustration>;

export const DefinitionIndicateur = z.object({
  code: CodeIndicateur,
  nom: z.string(),
  definition: z.string(),
  formule: z.string(),
  unite: z.enum(["nombre", "pourcentage", "note", "ratio", "indice", "jours"]),
  /** Le moteur qui rend le chiffre. Un indicateur « registre » n'est pas interrogeable par Ask Education. */
  moteur: MoteurCalcul,
  /** La voie de formation couverte. Sert à répondre « cet outil sait-il mesurer ce que je demande ? ». */
  perimetre: PerimetreIndicateur,
  /** L'observation que le calculateur exige : ce qu'on doit avoir enregistré pour que le chiffre existe. */
  assiette: AssietteCalcul,
  source: z.string(),
  frequence: z.string(),
  proprietaire: z.string(),
  version: z.string(),
  dimensions: z.array(Dimension),
  /** Seuil de publication : en dessous, la cellule est masquée (protection contre la réidentification). */
  effectifMinimalPublication: z.number().int(),
  /** De quoi le numérateur et le dénominateur sont faits, en mots : un ratio sans assiette nommée se relit mal. */
  libelleNumerateur: z.string().nullable(),
  libelleDenominateur: z.string().nullable(),
  illustration: Illustration,
});
export type DefinitionIndicateur = z.infer<typeof DefinitionIndicateur>;

/** Requête structurée : seule sortie autorisée du modèle de langage. Le moteur calcule, jamais le LLM. */
export const RequeteSemantique = z.object({
  indicateur: CodeIndicateur,
  filtres: z
    .object({
      anneeScolaire: z.string().optional(),
      departementId: z.string().optional(),
      communeId: z.string().optional(),
      sexe: Sexe.optional(),
      milieu: Milieu.optional(),
      statut: StatutEtablissement.optional(),
      niveau: Niveau.optional(),
      cycle: Cycle.optional(),
      examen: z.enum(EXAMENS_NATIONAUX_K12).optional(),
      infrastructure: z.enum(INFRASTRUCTURES).optional(),
      ageMin: z.number().int().optional(),
      ageMax: z.number().int().optional(),
      matiere: Matiere.optional(),
      seuil: z.number().optional(),
    })
    .strict(),
  ventilation: z.array(Dimension).max(2),
});
export type RequeteSemantique = z.infer<typeof RequeteSemantique>;

export const IndiceConfiance = z.object({
  completude: z.number(),
  fraicheur: z.number(),
  coherence: z.number(),
  validation: z.number(),
  score: z.number(),
});
export type IndiceConfiance = z.infer<typeof IndiceConfiance>;

export const LigneResultat = z.object({
  cle: z.string(),
  libelle: z.string(),
  valeur: z.number().nullable(),
  effectif: z.number(),
  masquee: z.boolean(),
});
export type LigneResultat = z.infer<typeof LigneResultat>;

export const ResultatIndicateur = z.object({
  requete: RequeteSemantique,
  definition: DefinitionIndicateur,
  valeur: z.number().nullable(),
  numerateur: z.number().nullable(),
  denominateur: z.number(),
  lignes: z.array(LigneResultat),
  periode: z.string(),
  couverture: z.object({ etablissementsAyantTransmis: z.number(), etablissementsAttendus: z.number() }),
  confiance: IndiceConfiance,
  misAJourLe: z.string(),
});
export type ResultatIndicateur = z.infer<typeof ResultatIndicateur>;

export const MotifRefus = z.enum(["indicateur_inconnu", "question_ambigue", "hors_perimetre", "donnee_individuelle"]);
export type MotifRefus = z.infer<typeof MotifRefus>;

export const ReponseAsk = z.discriminatedUnion("statut", [
  z.object({
    statut: z.literal("repondu"),
    question: z.string(),
    interpretation: z.string(),
    requete: RequeteSemantique,
    resultat: ResultatIndicateur,
  }),
  z.object({
    statut: z.literal("refuse"),
    question: z.string(),
    motif: MotifRefus,
    explication: z.string(),
    requete: RequeteSemantique.nullable(),
  }),
]);
export type ReponseAsk = z.infer<typeof ReponseAsk>;
