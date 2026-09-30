import { diplomeCertifie, type CycleLMD, type Diplome, type Domaine, type TypeParcours } from "@beile/contracts";
import { moyennesParMatiere, type NoteEffective } from "@/lib/api/parcours";
import type { FiliereSup } from "@/lib/api/superieur-public";

/**
 * Enseignement supérieur & formation professionnelle — libellés partagés + moteur d'adéquation.
 *
 * Prolonge `pistesOrientation()` (choix de série au lycée) d'un cran, vers l'amont : quelles
 * filières du supérieur (Licence/Master/Doctorat, écoles nationales, EFTP) un profil réel du
 * passeport peut viser, et sur quels critères. Doctrine identique : INDICATIF, critères visibles,
 * aucune valeur inventée pour une matière non évaluée (elle ne fait que baisser la couverture).
 *
 * Le catalogue (filières, établissements, concours, stages) n'est plus en code : il vient du
 * registre servi par l'API (`@/lib/api/superieur-public`). Ce module ne garde que ce qui ne
 * dépend d'aucune donnée : libellés, prédicats et moteur de calcul.
 */

/** Grande famille de série de bac (alignée sur les codes déjà employés par `pistesOrientation`). */
export type SerieBac = string;

export interface CritereAcces {
  matiere: string;
  /** Pondération affichée ; l'ensemble des poids d'une filière somme à 1. */
  poids: number;
}

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
  /** Habilitation en cours de validité (registre). */
  habilitee: boolean;
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
export function adequationFilieres(filieres: FiliereSup[], notes: NoteEffective[], annee: string | null, serieEnvisagee: SerieBac | null = null): PisteSuperieure[] {
  const parMatiere = new Map(moyennesParMatiere(notes, annee).map((m) => [m.matiere as string, m]));

  const pistes = filieres.map((f): Omit<PisteSuperieure, "ecartTete"> => {
    const criteres: CritereEvalue[] = f.criteresOrientation.map((c) => ({ ...c, moyenne: parMatiere.get(c.matiere)?.moyenne ?? null, nb: parMatiere.get(c.matiere)?.nb ?? 0 }));
    const evalues = criteres.filter((c) => c.moyenne != null);
    const couverture = arrondi(evalues.reduce((s, c) => s + c.poids, 0));
    const score = couverture > 0 ? arrondi(evalues.reduce((s, c) => s + c.moyenne! * c.poids, 0) / couverture) : null;
    const seriesAcces = f.serieBacRequise;
    return {
      id: f.id, nom: f.nom, etablissement: f.etablissement.nom, sigle: f.etablissement.sigle ?? undefined,
      voie: f.voie, cycle: f.cycle, diplomeVise: f.diplomeVise, domaine: f.domaine, accesConcours: f.accesConcours,
      habilitee: f.habilitee, seriesAcces, criteres, couverture, score,
      // Liste vide = aucune série de bac déclarée (ex. accès sur licence) : on ne tranche pas.
      accessibleParSerie: serieEnvisagee && seriesAcces.length ? seriesAcces.includes(serieEnvisagee) : null,
    };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  const tete = pistes[0]?.score ?? null;
  return pistes.map((p) => ({ ...p, ecartTete: p.score != null && tete != null ? arrondi(tete - p.score) : null }));
}

/** Une filière mérite d'être mise en avant : assez de critères évalués et, si c'est une tête, un écart net. */
export function estFiliereValidee(p: PisteSuperieure): boolean {
  return p.couverture >= 0.6 && (p.ecartTete == null || p.ecartTete >= 0.5);
}

/* ================================================================== Prédicats (sans données) */

const EFTP_DIPLOMES = new Set<Diplome>(["CAP", "BEP", "BAC_TECHNIQUE", "BT", "BTS", "CQP"]);

/** Filière EFTP : voie technologique/professionnelle/apprentissage ou diplôme hors LMD. */
export const estFiliereEFTP = (f: { voie: TypeParcours; diplomeVise: Diplome }): boolean =>
  f.voie === "technique" || f.voie === "professionnel" || f.voie === "apprentissage" || EFTP_DIPLOMES.has(f.diplomeVise);

/**
 * Échelle des qualifications, telle qu'elle s'affiche. Elle se DÉRITE de `MODES_CERTIFICATION` : un sigle
 * qu'aucune autorité publique ne publie (`BT`, `BEP` — voir docs/referentiels/benin-etablissements.md §9)
 * sort de l'échelle sans cesser d'être classé EFTP juste au-dessus. Les deux questions sont distinctes :
 * « de quelle voie relève cette filière » se lit dans le registre, « que peut certifier l'État » se lit
 * dans la source — et une liste recopiée à la main promet encore longtemps après qu'elle a été infirmée.
 */
const MAILLONS_EFTP: Diplome[] = ["CAP", "BEP", "BAC_TECHNIQUE", "BT", "BTS", "CQP"];
export const ECHELLE_EFTP: readonly Diplome[] = MAILLONS_EFTP.filter((d) => diplomeCertifie(d));

/* ================================================================== Libellés partagés */

/**
 * Type d'établissement du supérieur. Les deux instituts de formation professionnelle sont rendus par le
 * DÉVELOPPEMENT DU TYPE, non par un sigle : `INFP` est haïtien et `IRFP` n'apparaît dans aucune source
 * béninoise lue (docs/referentiels/benin-etablissements.md §9, point 3). Les sigles réellement rencontrés
 * — CFPA, LTP, LTA, CMTH, CFTH, CFME, INIFRCF, ADET — relèvent du catalogue, donc du réseau à recalrer
 * (tâche #62), pas de ce dictionnaire de types.
 */
export const LIBELLE_TYPE_ETAB: Record<string, string> = {
  universite: "Université", ecole_nationale: "École nationale", ecole_superieure: "École supérieure", institut: "Institut",
  lycee_technique: "Lycée technique", centre_formation_professionnelle: "Centre de formation professionnelle",
  institut_regional_formation_professionnelle: "Institut régional de formation professionnelle",
  institut_national_formation_professionnelle: "Institut national de formation professionnelle",
  ecole_d_application: "École d'application",
};

/** Domaine de formation, lisible (miroir de `Domaine`). */
export const LIBELLE_DOMAINE: Record<Domaine, string> = {
  sciences_exactes: "Sciences exactes", sciences_vie_sante: "Sciences de la vie et de la santé", sciences_technologie: "Sciences et technologies",
  agronomie: "Agronomie", droit_economie_gestion: "Droit, économie et gestion", lettres_arts_sc_humaines: "Lettres, arts et sciences humaines",
  sciences_education: "Sciences de l'éducation", metier: "Métiers",
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
