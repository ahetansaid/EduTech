import type { CycleLMD, Diplome, Domaine, Matiere, TypeParcours } from "@beile/contracts";
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
    id: "l-medecine", nom: "Médecine (première année commune)", etablissement: "Université des Sciences Médicales", sigle: "UNIMED",
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
