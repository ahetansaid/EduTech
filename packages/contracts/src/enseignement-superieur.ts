import { z } from "zod";
import { StatutEtablissement } from "./referentiels";

/**
 * Enseignement supérieur & formation professionnelle — référentiel LMD + EFTP (Bénin).
 *
 * Trois voies et deux carrefours :
 *   - voie universitaire (MESRS) : Licence → Master → Doctorat ;
 *   - écoles nationales (rattachées à une université ou autonomes, ex. ENAM → UAC) ;
 *   - voie EFTP (MESTFP + ministère de l'Emploi/PME) : CAP → BEP → bac technique → BT → BTS → CQP.
 *   - carrefour 1 — le BAC : pivot d'entrée depuis le K-12 (volet `examens`).
 *   - carrefour 2 — la passerelle CQP / BTS → licence professionnelle : une seule échelle des qualifications.
 *
 * Ce module ne décrit que des FORMES. Les listes officielles (séries de bac, écoles, capacités,
 * sessions de concours) sont des DONNÉES : catalogue provisoire côté web aujourd'hui, puis seed en
 * base au franchissement de l'étape de migration. Le type `TypeParcours` reprend MOT POUR MOT
 * l'enum de la table db `parcours.type` pour que la future écriture d'un parcours supérieur se
 * branche sans renommage.
 */

/* ================================================================== Cycle & diplômes */

/** Composante LMD effectivement ouverte dans une filière. */
export const Composante = z.enum(["L1", "L2", "L3", "M1", "M2", "Dr"]);
export type Composante = z.infer<typeof Composante>;

export const CycleLMD = z.enum(["licence", "master", "doctorat"]);
export type CycleLMD = z.infer<typeof CycleLMD>;

/**
 * Diplômes nationaux des deux voies, servant à la fois de « diplôme requis à l'entrée » et de
 * « diplôme visé à la sortie ». Le BAC figure ici en tant que CREDENTIEL ; l'organisation de son
 * examen (sessions, centres, jurys) reste dans le volet `examens` (enum `Examen`).
 */
export const Diplome = z.enum([
  "CAP", "BEP", "BAC_TECHNIQUE", "BT", "BTS", "CQP",
  "BAC", "LICENCE", "LICENCE_PRO", "MASTER", "MASTER_PRO", "DOCTORAT", "DES",
]);
export type Diplome = z.infer<typeof Diplome>;

/** Miroir exact de l'enum db `parcours.type` — ne renomme rien, pour brancher la migration sans cout. */
export const TypeParcours = z.enum([
  "scolaire", "technique", "professionnel", "universitaire", "apprentissage", "formation_courte", "alphabetisation",
]);
export type TypeParcours = z.infer<typeof TypeParcours>;

/* ================================================================== Établissement */

/** Tutelle(s) de l'établissement : la double tutelle MESTFP + Emploi/PME est fréquente en EFTP. */
export const Tutelle = z.enum(["MESRS", "MESTFP", "EMPLOI_PME"]);
export type Tutelle = z.infer<typeof Tutelle>;

export const TypeEtablissementSup = z.enum([
  "universite", "ecole_nationale", "ecole_superieure", "institut",
  "lycee_technique", "centre_formation_professionnelle",
  "institut_regional_formation_professionnelle", "institut_national_formation_professionnelle", "ecole_d_application",
]);
export type TypeEtablissementSup = z.infer<typeof TypeEtablissementSup>;

export const EtablissementSup = z.object({
  id: z.string(),
  nom: z.string(),
  sigle: z.string().nullable(),
  type: TypeEtablissementSup,
  statut: StatutEtablissement,
  tuts: z.array(Tutelle).min(1),
  communeId: z.string(),
  /** Établissement-parent pour une école rattachée (ex. ENAM → UAC) ; null sinon. */
  rattachementId: z.string().nullable(),
});
export type EtablissementSup = z.infer<typeof EtablissementSup>;

/* ================================================================== Filière */

export const Domaine = z.enum([
  "sciences_exactes", "sciences_vie_sante", "sciences_technologie", "agronomie",
  "droit_economie_gestion", "lettres_arts_sc_humaines", "sciences_education", "metier",
]);
export type Domaine = z.infer<typeof Domaine>;

/**
 * Une filière est une offre d'une école/université/un CFP. Elle indique à quelle voie elle
 * rattache un parcours réussi (`typeParcours`), les études suivies (`cycle`, null pour une filière
 * EFTP non-LMD telle qu'un CAP ou un BTS), et les conditions d'accès lisibles.
 */
export const Filiere = z.object({
  id: z.string(),
  etablissementId: z.string(),
  domaine: Domaine,
  nom: z.string(),
  voie: TypeParcours,
  cycle: CycleLMD.nullable(),
  diplomeVise: Diplome,
  /** Composantes effectivement ouvertes dans cette filière (ex. L1, L2, L3). */
  composantes: z.array(Composante),
  creditsECTS: z.number().int().nonnegative(),
  capaciteAnnuelle: z.number().int().nonnegative().nullable(),
  /** Liste ouverte, verrouillée à l'arrêté MESRS/MESTFP au seed. */
  serieBacRequise: z.array(z.string()),
  /** Le cycle d'entrée est sélectif par concours ; le calendrier et les épreuves vivent dans `Concours`. */
  accesConcours: z.boolean(),
  /** Durée cumulée de(s) stage(s) obligatoire(s), en mois. 0 si aucun. */
  stageObligatoireMois: z.number().int().nonnegative(),
});
export type Filiere = z.infer<typeof Filiere>;

/* ================================================================== Concours */

export const StatutConcours = z.enum(["annonce", "inscriptions", "admissibilite", "ecrits", "oraux", "resultats", "clos"]);
export type StatutConcours = z.infer<typeof StatutConcours>;

export const EpreuveConcours = z.object({ matiere: z.string(), coef: z.number().positive() });
export type EpreuveConcours = z.infer<typeof EpreuveConcours>;

/**
 * Session de concours rattachée à une filière sélective. Branchée sur le même « bureau »
 * `administration_centrale` + périmètre `national` que le module `examens` — sans duplications
 * de plateforme.
 */
export const Concours = z.object({
  id: z.string(),
  nom: z.string(),
  filiereId: z.string(),
  session: z.string(),
  statut: StatutConcours,
  diplomeRequis: Diplome,
  serieRequise: z.array(z.string()),
  places: z.number().int().nonnegative().nullable(),
  epreuves: z.array(EpreuveConcours),
  ouvertureLe: z.string().nullable(),
  clotureLe: z.string().nullable(),
  epreuvesLe: z.string().nullable(),
});
export type Concours = z.infer<typeof Concours>;

/* ================================================================== Vœux */

export const StatutVoeu = z.enum(["brouillon", "soumis", "admissible", "admis", "refuse", "desiste"]);
export type StatutVoeu = z.infer<typeof StatutVoeu>;

/** Vœu d'orientation supérieur déposé par un apprenant. Un vœu ≠ une inscription. */
export const Voeu = z.object({
  id: z.string(),
  apprenantId: z.string(),
  filiereId: z.string(),
  /** Si le cycle est sélectif, le vœu précise le concours visé. */
  concoursId: z.string().nullable(),
  rang: z.number().int().min(1),
  statut: StatutVoeu,
  anneeScolaire: z.string(),
});
export type Voeu = z.infer<typeof Voeu>;

/* ================================================================== Stage */

export const StatutStage = z.enum([
  "recherche", "piste", "convention_en_cours", "signe", "en_cours", "termine", "interrompu",
]);
export type StatutStage = z.infer<typeof StatutStage>;

/**
 * Stage rattaché à une filière ou à un apprenant déjà inscrit dans le supérieur.
 * Le volet reste transversal (L3, M2, licence pro, écoles, CFP, terminale technique) —
 * il n'est pas une sous-liste des filières.
 */
export const Stage = z.object({
  id: z.string(),
  apprenantId: z.string(),
  etablissementId: z.string().nullable(),
  entreprise: z.string(),
  tuteurPro: z.string().nullable(),
  /** Enseignant BEILE (rôle `enseignant` + relation pédagogique) assurant l'encadrement académique. */
  tuteurAcademiqueId: z.string().nullable(),
  du: z.string().nullable(),
  au: z.string().nullable(),
  statut: StatutStage,
  valideParEtablissement: z.boolean(),
});
export type Stage = z.infer<typeof Stage>;

/* ================================================================== Synthèse indicative */

/**
 * Résultat d'un calcul d'adéquation « profil du passeport ↔ filière » — même doctrine que
 * `PisteOrientation` : indicatif, critères visibles, aucune valeur inventée pour une matière
 * non évaluée. Peut être rendu côté client à partir du passeport, avant toute écriture d'un vœu
 * en base.
 */
export const AdequationFiliere = z.object({
  filiereId: z.string(),
  /** 0-1 : part des critères pondérés réellement évalués dans le passeport. */
  couverture: z.number().min(0).max(1),
  /** Score 0-20 calculé sur les seules matières évaluées ; null si couverture = 0. */
  score: z.number().min(0).max(20).nullable(),
  /** Moyenne de la classe/du territoire au même critère (pour un écart lisible). */
  moyenneReference: z.number().nullable(),
  serieBacEnvisagee: z.string().nullable(),
});
export type AdequationFiliere = z.infer<typeof AdequationFiliere>;
