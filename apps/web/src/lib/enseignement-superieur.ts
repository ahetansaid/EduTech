import type { Concours, CycleLMD, Diplome, Domaine, EtablissementSup, Matiere, TypeParcours } from "@beile/contracts";
import { moyennesParMatiere, type NoteEffective } from "@/lib/api/parcours";

/**
 * Enseignement supérieur & formation professionnelle — catalogue indicatif + moteur d'adéquation.
 *
 * Prolonge `pistesOrientation()` (choix de série au lycée) d'un cran, vers l'amont : quelles
 * filières du supérieur (Licence/Master/Doctorat, écoles nationales, EFTP) un profil réel du
 * passeport peut viser, et sur quels critères. Doctrine identique : INDICATIF, critères visibles,
 * aucune valeur inventée pour une matière non évaluée (elle ne fait que baisser la couverture).
 *
 * ⚠️ CATALOGUE TRANSITOIRE EN CODE — même statut que `FILIERES` aujourd'hui. Ce n'est PAS le
 * registre officiel : la liste vraie (écoles, capacités, sessions, séries d'accès) est une DONNÉE
 * à verrouiller à l'arrêté MESRS/MESTFP puis à sertir en base à l'étape de migration (S1/S2).
 * Les `criteres` ne référencent que des matières présentes dans le passeport K-12 (`MATIERES`) :
 * on ne note une filière que sur ce que l'élève a réellement passé.
 */

/** Grande famille de série de bac (alignée sur les codes déjà employés par `pistesOrientation`). */
export type SerieBac = "A" | "C" | "D" | "G" | "T";

export interface CritereAcces {
  matiere: Matiere;
  /** Pondération affichée ; l'ensemble des poids d'une filière somme à 1. */
  poids: number;
}

export interface FiliereCatalogue {
  id: string;
  nom: string;
  etablissement: string;
  sigle?: string;
  voie: TypeParcours;
  /** null pour une filière EFTP hors LMD (CAP, BT, BTS…). */
  cycle: CycleLMD | null;
  diplomeVise: Diplome;
  domaine: Domaine;
  /** Entrée sélective par concours (le calendrier vit dans le volet concours, pas ici). */
  accesConcours: boolean;
  seriesAcces: SerieBac[];
  criteres: CritereAcces[];
}

/* ================================================================== Catalogue de départ */

export const CATALOGUE_FILIERES: FiliereCatalogue[] = [
  // ————— Université (MESRS) — Licence LMD
  {
    id: "l-maths", nom: "Licence Sciences et Technologies — Mathématiques", etablissement: "Université d'Abomey-Calavi", sigle: "UAC/FST",
    voie: "universitaire", cycle: "licence", diplomeVise: "LICENCE", domaine: "sciences_exactes",
    accesConcours: false, seriesAcces: ["C", "D"],
    criteres: [{ matiere: "Mathématiques", poids: 0.6 }, { matiere: "Sciences physiques", poids: 0.25 }, { matiere: "SVT", poids: 0.15 }],
  },
  {
    id: "l-info", nom: "Licence Informatique / Mathématiques appliquées", etablissement: "UAC — École Supérieure Polytechnique / FAST", sigle: "UAC",
    voie: "universitaire", cycle: "licence", diplomeVise: "LICENCE", domaine: "sciences_technologie",
    accesConcours: false, seriesAcces: ["C", "D"],
    criteres: [{ matiere: "Mathématiques", poids: 0.55 }, { matiere: "Sciences physiques", poids: 0.3 }, { matiere: "Anglais", poids: 0.15 }],
  },
  {
    id: "l-svt", nom: "Licence Sciences de la Vie et de la Terre", etablissement: "Université d'Abomey-Calavi", sigle: "UAC/FASA",
    voie: "universitaire", cycle: "licence", diplomeVise: "LICENCE", domaine: "sciences_vie_sante",
    accesConcours: false, seriesAcces: ["C", "D"],
    criteres: [{ matiere: "SVT", poids: 0.5 }, { matiere: "Sciences physiques", poids: 0.3 }, { matiere: "Mathématiques", poids: 0.2 }],
  },
  {
    id: "l-medecine", nom: "Médecine (première année commune)", etablissement: "Université des Sciences de la Santé", sigle: "UNIMED",
    voie: "universitaire", cycle: "licence", diplomeVise: "LICENCE", domaine: "sciences_vie_sante",
    accesConcours: true, seriesAcces: ["C", "D"],
    criteres: [{ matiere: "SVT", poids: 0.45 }, { matiere: "Sciences physiques", poids: 0.3 }, { matiere: "Mathématiques", poids: 0.25 }],
  },
  {
    id: "l-droit", nom: "Licence Droit", etablissement: "UAC — Faculté de Droit et de Science Politique", sigle: "UAC/FDSP",
    voie: "universitaire", cycle: "licence", diplomeVise: "LICENCE", domaine: "droit_economie_gestion",
    accesConcours: false, seriesAcces: ["A", "C", "D", "G"],
    criteres: [{ matiere: "Français", poids: 0.4 }, { matiere: "Histoire-Géographie", poids: 0.35 }, { matiere: "Éducation civique", poids: 0.25 }],
  },
  {
    id: "l-eco-gestion", nom: "Licence Économie et Gestion", etablissement: "UAC — Faculté des Sciences Économiques et de Gestion", sigle: "UAC/FSEG",
    voie: "universitaire", cycle: "licence", diplomeVise: "LICENCE", domaine: "droit_economie_gestion",
    accesConcours: false, seriesAcces: ["A", "C", "D", "G"],
    criteres: [{ matiere: "Mathématiques", poids: 0.4 }, { matiere: "Français", poids: 0.3 }, { matiere: "Histoire-Géographie", poids: 0.3 }],
  },
  {
    id: "l-lettres", nom: "Licence Lettres Modernes", etablissement: "UAC — Faculté des Lettres, Arts et Sciences Humaines", sigle: "UAC/FLASH",
    voie: "universitaire", cycle: "licence", diplomeVise: "LICENCE", domaine: "lettres_arts_sc_humaines",
    accesConcours: false, seriesAcces: ["A"],
    criteres: [{ matiere: "Français", poids: 0.55 }, { matiere: "Histoire-Géographie", poids: 0.25 }, { matiere: "Anglais", poids: 0.2 }],
  },
  {
    id: "l-enseignement", nom: "Licence Sciences de l'Éducation (professorat)", etablissement: "École Normale Supérieure", sigle: "ENS/UAC",
    voie: "universitaire", cycle: "licence", diplomeVise: "LICENCE", domaine: "sciences_education",
    accesConcours: true, seriesAcces: ["A", "C", "D"],
    criteres: [{ matiere: "Français", poids: 0.4 }, { matiere: "Mathématiques", poids: 0.35 }, { matiere: "Éducation civique", poids: 0.25 }],
  },

  // ————— Écoles nationales / supérieures (concours d'entrée)
  {
    id: "ecole-administration", nom: "École Nationale d'Administration et de Magistrature", etablissement: "ENAM (rattachée UAC)", sigle: "ENAM",
    voie: "universitaire", cycle: "master", diplomeVise: "MASTER", domaine: "droit_economie_gestion",
    accesConcours: true, seriesAcces: ["A", "C", "D", "G"],
    criteres: [{ matiere: "Français", poids: 0.4 }, { matiere: "Histoire-Géographie", poids: 0.3 }, { matiere: "Éducation civique", poids: 0.3 }],
  },
  {
    id: "ecole-btp", nom: "École Supérieure des Techniques Avancées / BTP", etablissement: "École Supérieure des Techniques Avancées", sigle: "ESTA",
    voie: "technique", cycle: "licence", diplomeVise: "LICENCE", domaine: "sciences_technologie",
    accesConcours: true, seriesAcces: ["C", "D", "T"],
    criteres: [{ matiere: "Mathématiques", poids: 0.5 }, { matiere: "Sciences physiques", poids: 0.4 }, { matiere: "SVT", poids: 0.1 }],
  },

  // ————— EFTP (MESTFP + Emploi/PME) — technologiques & professionnelles
  {
    id: "lp-energies", nom: "Licence Professionnelle Énergies et Développement Durable", etablissement: "Institut National de Formation Pédagogique / ESTS", sigle: "ESTS",
    voie: "professionnel", cycle: "licence", diplomeVise: "LICENCE_PRO", domaine: "sciences_technologie",
    accesConcours: false, seriesAcces: ["C", "D", "T"],
    criteres: [{ matiere: "Sciences physiques", poids: 0.4 }, { matiere: "Mathématiques", poids: 0.4 }, { matiere: "SVT", poids: 0.2 }],
  },
  {
    id: "bts-maintenance", nom: "BTS Maintenance Industrielle", etablissement: "Lycée Technique / CFP",
    voie: "professionnel", cycle: null, diplomeVise: "BTS", domaine: "metier",
    accesConcours: false, seriesAcces: ["C", "D", "T"],
    criteres: [{ matiere: "Mathématiques", poids: 0.4 }, { matiere: "Sciences physiques", poids: 0.4 }, { matiere: "Anglais", poids: 0.2 }],
  },
  {
    id: "bts-gestion", nom: "BTS Gestion et Comptabilité", etablissement: "Lycée Technique / CFP",
    voie: "professionnel", cycle: null, diplomeVise: "BTS", domaine: "droit_economie_gestion",
    accesConcours: false, seriesAcces: ["G", "A", "C"],
    criteres: [{ matiere: "Mathématiques", poids: 0.4 }, { matiere: "Français", poids: 0.3 }, { matiere: "Histoire-Géographie", poids: 0.3 }],
  },
];

/* ================================================================== Adéquation (indicative) */

export interface CritereEvalue extends CritereAcces {
  moyenne: number | null;
  nb: number;
}

export interface PisteSuperieure {
  id: string;
  nom: string;
  etablissement: string;
  sigle?: string;
  voie: TypeParcours;
  cycle: CycleLMD | null;
  diplomeVise: Diplome;
  domaine: Domaine;
  accesConcours: boolean;
  seriesAcces: SerieBac[];
  /** null si aucune série de bac n'est envisagée encore ; sinon true/false selon l'accès direct. */
  accessibleParSerie: boolean | null;
  criteres: CritereEvalue[];
  /** Part des poids effectivement évaluée dans le passeport, 0..1. */
  couverture: number;
  /** Indice de compatibilité 0-20 calculé sur les seules matières évaluées ; null si couverture 0. */
  score: number | null;
  /** Écart avec la piste de tête (même base de calcul). */
  ecartTete: number | null;
}

const arrondi = (v: number) => Math.round(v * 100) / 100;

/**
 * Adéquation profil ↔ filières du supérieur, calculée sur les moyennes réelles de l'année.
 * Une matière non évaluée n'est jamais remplacée : elle réduit seulement la couverture.
 */
export function adequationFilieres(notes: NoteEffective[], annee: string | null, serieEnvisagee: SerieBac | null = null): PisteSuperieure[] {
  const parMatiere = new Map(moyennesParMatiere(notes, annee).map((m) => [m.matiere as string, m]));

  const pistes = CATALOGUE_FILIERES.map((f) => {
    const criteres: CritereEvalue[] = f.criteres.map((c) => ({ ...c, moyenne: parMatiere.get(c.matiere)?.moyenne ?? null, nb: parMatiere.get(c.matiere)?.nb ?? 0 }));
    const evalues = criteres.filter((c) => c.moyenne != null);
    const couverture = arrondi(evalues.reduce((s, c) => s + c.poids, 0));
    const score = couverture > 0 ? arrondi(evalues.reduce((s, c) => s + c.moyenne! * c.poids, 0) / couverture) : null;
    return { ...f, criteres, couverture, score, accessibleParSerie: serieEnvisagee ? f.seriesAcces.includes(serieEnvisagee) : null };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  const tete = pistes[0]?.score ?? null;
  return pistes.map((p) => ({ ...p, ecartTete: p.score != null && tete != null ? arrondi(tete - p.score) : null }));
}

/** Une filière mérite d'être mise en avant : assez de critères évalués et, si c'est une tête, un écart net. */
export function estFiliereValidee(p: PisteSuperieure): boolean {
  return p.couverture >= 0.6 && (p.ecartTete == null || p.ecartTete >= 0.5);
}

/* ================================================================== Stage obligatoire (indicatif) */

/** Durée de stage obligatoire (mois) par filière — indicatif, à sertir en base à S2. */
export const STAGE_OBLIGATOIRE_MOIS: Record<string, number> = {
  "l-info": 2, "l-medecine": 6, "l-enseignement": 3, "ecole-administration": 6, "ecole-btp": 3, "lp-energies": 4, "bts-maintenance": 5, "bts-gestion": 4,
};
export const stageMois = (id: string): number => STAGE_OBLIGATOIRE_MOIS[id] ?? 0;

const EFTP_DIPLOMES = new Set<Diplome>(["CAP", "BEP", "BAC_TECHNIQUE", "BT", "BTS", "CQP"]);

/** Filières EFTP (voie technologique/professionnelle/apprentissage ou diplôme hors LMD). */
export const filieresEFTP = (): FiliereCatalogue[] =>
  CATALOGUE_FILIERES.filter((f) => f.voie === "technique" || f.voie === "professionnel" || f.voie === "apprentissage" || EFTP_DIPLOMES.has(f.diplomeVise));

/** Filières imposant un stage. */
export const filieresAvecStage = (): FiliereCatalogue[] => CATALOGUE_FILIERES.filter((f) => stageMois(f.id) > 0);

export const nomFiliere = (id: string): string => CATALOGUE_FILIERES.find((f) => f.id === id)?.nom ?? id;

/* ================================================================== Libellés partagés */

export const LIBELLE_TYPE_ETAB: Record<string, string> = {
  universite: "Université", ecole_nationale: "École nationale", ecole_superieure: "École supérieure", institut: "Institut",
  lycee_technique: "Lycée technique", centre_formation_professionnelle: "CFP",
  institut_regional_formation_professionnelle: "IRFP", institut_national_formation_professionnelle: "INFP", ecole_d_application: "École d'application",
};

export const LIBELLE_TUTELLE: Record<string, string> = { MESRS: "MESRS", MESTFP: "MESTFP", EMPLOI_PME: "Emploi / PME" };

export const LIBELLE_STATUT_CONCOURS: Record<string, string> = {
  annonce: "Annoncé", inscriptions: "Inscriptions", admissibilite: "Admissibilité", ecrits: "Épreuves écrites", oraux: "Oral", resultats: "Résultats", clos: "Clôturé",
};

/** Libellé d'une voie (miroir de `TypeParcours`) — source unique pour la console et ses volets. */
export const LIBELLE_TYPE_PARCOURS: Record<TypeParcours, string> = {
  universitaire: "Universitaire", technique: "Technologique", professionnel: "Professionnelle", apprentissage: "Apprentissage",
  scolaire: "Scolaire", formation_courte: "Formation courte", alphabetisation: "Alphabétisation",
};

/** Libellé d'un diplôme national (deux voies confondues). */
export const LIBELLE_DIPLOME: Record<Diplome, string> = {
  CAP: "CAP", BEP: "BEP", BAC_TECHNIQUE: "Bac technique", BT: "BT", BTS: "BTS", CQP: "CQP",
  BAC: "Bac", LICENCE: "Licence", LICENCE_PRO: "Licence pro", MASTER: "Master", MASTER_PRO: "Master pro",
  DOCTORAT: "Doctorat", DES: "DES",
};

/** Nom lisible du cursus : un cycle LMD, sinon le diplôme visé (filière EFTP hors LMD). */
export function libelleCycle(f: { cycle: CycleLMD | null; diplomeVise: Diplome }): string {
  if (f.cycle === "licence") return "Licence";
  if (f.cycle === "master") return "Master";
  if (f.cycle === "doctorat") return "Doctorat";
  return LIBELLE_DIPLOME[f.diplomeVise];
}

/* ================================================================== Établissements (catalogue indicatif) */

/**
 * Liste INDICATIVE et volontairement courte. Elle illustre les TYPES (université, école nationale,
 * institut, école privée agréée) et la double tutelle EFTP — la liste officielle complète (arrêté
 * MESRS + écoles privées agréées) est une DONNÉE à sertir en base à S2, pas une vérité en dur ici.
 */
export const CATALOGUE_ETABLISSEMENTS: EtablissementSup[] = [
  { id: "uac", nom: "Université d'Abomey-Calavi", sigle: "UAC", type: "universite", statut: "public", tuts: ["MESRS"], communeId: "abomey-calavi", rattachementId: null },
  { id: "unimed", nom: "Université des Sciences de la Santé", sigle: "UNIMED", type: "universite", statut: "public", tuts: ["MESRS"], communeId: "cotonou", rattachementId: null },
  { id: "enam", nom: "École Nationale d'Administration et de Magistrature", sigle: "ENAM", type: "ecole_nationale", statut: "public", tuts: ["MESRS"], communeId: "cotonou", rattachementId: "uac" },
  { id: "ens", nom: "École Normale Supérieure", sigle: "ENS", type: "ecole_nationale", statut: "public", tuts: ["MESRS"], communeId: "cotonou", rattachementId: "uac" },
  { id: "insta-ap", nom: "Institut National de la Statistique Appliquée (INSta-Ap)", sigle: "INSta-Ap", type: "institut", statut: "public", tuts: ["MESRS"], communeId: "calavi", rattachementId: null },
  { id: "infp", nom: "Institut National de Formation Professionnelle", sigle: "INFP", type: "institut_national_formation_professionnelle", statut: "public", tuts: ["MESTFP", "EMPLOI_PME"], communeId: "cotonou", rattachementId: null },
  { id: "irfp", nom: "Institut Régional de Formation Professionnelle (par chef-lieu)", sigle: "IRFP", type: "institut_regional_formation_professionnelle", statut: "public", tuts: ["MESTFP", "EMPLOI_PME"], communeId: "portonovo", rattachementId: null },
  { id: "ecole-privee", nom: "École supérieure privée agréée (à référencer)", sigle: null, type: "ecole_superieure", statut: "prive", tuts: ["MESRS"], communeId: "cotonou", rattachementId: null },
];

/* ================================================================== Concours (sessions indicatives) */

/**
 * Sessions INDICATIVES façon calendrier-type : elles montrent la forme d'un concours (diplôme
 * requis, séries, places, épreuves pondérées, fenêtres de dates). Les chiffres (places, dates)
 * sont illustratifs et seront remplacés par les arrêtés officiels à S2.
 */
export const CATALOGUE_CONCOURS: Concours[] = [
  {
    id: "cc-medecine", nom: "Concours d'accès en Médecine", filiereId: "l-medecine", session: "2026", statut: "inscriptions",
    diplomeRequis: "BAC", serieRequise: ["C", "D"], places: 350,
    epreuves: [{ matiere: "Sciences de la vie et de la Terre", coef: 4 }, { matiere: "Sciences physiques", coef: 3 }, { matiere: "Mathématiques", coef: 3 }, { matiere: "Français", coef: 1 }],
    ouvertureLe: "2026-07-01", clotureLe: "2026-08-15", epreuvesLe: "2026-09-05",
  },
  {
    id: "cc-enam", nom: "Concours d'entrée ENAM (premier cycle)", filiereId: "ecole-administration", session: "2026", statut: "annonce",
    diplomeRequis: "BAC", serieRequise: ["A", "C", "D", "G"], places: 60,
    epreuves: [{ matiere: "Culture générale", coef: 5 }, { matiere: "Droit et économie", coef: 3 }, { matiere: "Conduite d'épreuve", coef: 3 }],
    ouvertureLe: null, clotureLe: null, epreuvesLe: null,
  },
  {
    id: "cc-ens", nom: "Concours d'entrée ENS (professorat)", filiereId: "l-enseignement", session: "2026", statut: "inscriptions",
    diplomeRequis: "BAC", serieRequise: ["A", "C", "D"], places: 120,
    epreuves: [{ matiere: "Dissertation", coef: 4 }, { matiere: "Mathématiques", coef: 3 }, { matiere: "Sciences physiques", coef: 3 }],
    ouvertureLe: "2026-07-10", clotureLe: "2026-08-20", epreuvesLe: "2026-09-10",
  },
  {
    id: "cc-esta", nom: "Concours d'accès École Supérieure Technique", filiereId: "ecole-btp", session: "2026", statut: "admissibilite",
    diplomeRequis: "BAC", serieRequise: ["C", "D", "T"], places: 90,
    epreuves: [{ matiere: "Mathématiques", coef: 4 }, { matiere: "Sciences physiques", coef: 4 }, { matiere: "Dessin technique", coef: 2 }],
    ouvertureLe: "2026-06-15", clotureLe: "2026-07-30", epreuvesLe: "2026-08-25",
  },
];
