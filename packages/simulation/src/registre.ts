import type {
  CodeIndicateur,
  Cycle,
  DefinitionIndicateur,
  ExamenNationalK12,
  Illustration,
  Milieu,
  Niveau,
  PerimetreIndicateur,
  RequeteSemantique,
  Sexe,
  StatutEtablissement,
} from "@beile/contracts";
import { EXAMENS_NATIONAUX_K12, NIVEAUX } from "@beile/contracts";
import {
  AGE_THEORIQUE,
  ANNEES,
  type Annee,
  cycleDuNiveau,
  type EtablissementGenere,
  type MatiereSuivie,
  partAuDessus,
  RETARD,
  type StatCommuneAnnee,
} from "./macro";

/**
 * Registre des calculateurs.
 *
 * Le dictionnaire national publie des définitions ; ce registre est la seule chose qui sache les
 * produire. Les deux vivent dans le même objet, donc une définition ne peut plus exister sans son
 * calcul : `Record<CodeIndicateur, EntreeRegistre>` est vérifié à la compilation, ajouter un code au
 * contrat sans écrire sa contribution fait échouer `npm run typecheck`. C'est là que se joue
 * l'indépendance vis-à-vis d'une API de langage : un décideur qui pose une question obtient un chiffre
 * calculé par une fonction écrite et relue, ou une explication de ce qui manque pour le calculer —
 * jamais une probabilité.
 *
 * Chaque entrée porte aussi son lexique (`evocateurs`, `priorite`, `garde`) : le traducteur de questions
 * n'a plus de chaîne de `if` à main levée, il parcourt le registre. Un indicateur nouveau devient
 * interrogeable dès qu'il est déclaré, sans retoucher l'analyseur.
 */

export type Filtres = RequeteSemantique["filtres"];

/** Le triplet que la couche d'agrégation accumule pour chaque groupe de ventilation. */
export interface Contribution {
  num: number;
  den: number;
  effectif: number;
}

export interface NoteCellule {
  moy: number;
  et: number;
}

export interface CelluleExamen {
  nom: ExamenNationalK12;
  inscrits: number;
  presents: number;
  admis: number;
}

/**
 * Une observation : la plus petite unité que le driver sait construire, déjà restreinte au périmètre et
 * aux filtres de territoire. Un calculateur ne choisit pas ce qu'il observe — il reçoit l'assiette que
 * sa définition déclare, et ne peut donc pas compter une cellule qui n'existe pas.
 */
export interface Observation {
  communeId: string;
  departementId: string;
  milieu: Milieu;
  annee: Annee;
  niveau: Niveau | null;
  sexe: Sexe | null;
  statut: StatutEtablissement | null;
  /** Population de la cellule, déjà pondérée par l'intervalle d'âge demandé. */
  effectif: number;
  /** Part de la cellule dans l'intervalle d'âge demandé (1 si le filtre est absent). */
  poidsAge: number;
  stats: StatCommuneAnnee;
  /** Toutes les années observées de la commune, pour les calculs qui comparent deux années. */
  annees: Record<Annee, StatCommuneAnnee>;
  projection2030: number;
  etabs: EtablissementGenere[];
  examen: CelluleExamen | null;
  notes: NoteCellule | null;
  matiere: MatiereSuivie;
  partsStatut: Record<Cycle, Record<StatutEtablissement, number>> | null;
}

/** Ce qu'un calculateur exige en plus de la question : ici, la moyenne demandée et le seuil qui la lit. */
export type Parametre = "seuil" | "matiere" | "infrastructure";

export interface EntreeCoucheStatistique {
  sorte: "couche-statistique";
  contribution: (o: Observation, f: Filtres) => Contribution | null;
}

/**
 * Un indicateur que la couche statistique ne peut pas rendre, parce qu'aucune de ses assiettes ne porte
 * la mesure. Le registre le déclare quand même — avec le service qui le calcule et la fonction pure qui
 * fait le arithmetic — pour que le dictionnaire et l'écran de scolarité rendent le même chiffre.
 * `ask` refuse ces codes et dit lequel les rend : c'est la réponse honnête, pas un nombre approximé.
 */
export interface AgregeCapitalisation {
  creditsAcquis: number;
  creditsAttendus: number;
}

export interface EntreeServiceMetier {
  sorte: "service-metier";
  service: string;
  rendre: (lignes: readonly AgregeCapitalisation[]) => {
    creditsAcquis: number;
    creditsAttendus: number;
    tauxCapitalisation: number | null;
  };
}

export interface EntreeRegistre {
  definition: DefinitionIndicateur;
  /** Mots (sans accent, en minuscules) par lesquels un décideur nomme cet indicateur. */
  evocateurs: string[];
  /** Rang de test du lexique : le plus petit est testé en premier, donc le plus spécifique gagne. */
  priorite: number;
  /** Une question ne demande cet indicateur que si la condition tient. */
  garde?: (question: string, f: Filtres) => boolean;
  /**
   * Ce qu'il faut répondre quand le lexique a désigné cet indicateur mais que sa garde l'a écarté et
   * qu'aucun autre ne prend le relais. Une phrase, pas un silence : un décideur qui demande « combien
   * d'enfants non scolarisés » doit apprendre que ce nombre n'est pas publié, et ce que le registre sait
   * rendre à la place.
   */
  horsPortee?: string;
  parametres: Parametre[];
  /** L'indicateur sait-il restreindre son calcul à un intervalle d'âge. */
  filtreAge: boolean;
  rend: EntreeCoucheStatistique | EntreeServiceMetier;
}

export const SOURCE_STATISTIQUE = "Registre des événements BEILE, EducMaster, système d'examens (données simulées)";
const SOURCE_REGISTRE = "Registre des écritures du supérieur (BEILE, module scolarité) — aucune donnée simulée";

/* --------------------------------------------------------------------- Utilitaires de calcul. */

const contribution = (num: number, den: number, effectif: number): Contribution => ({ num, den, effectif });

/** Part de l'effectif d'un niveau dont l'âge (au 31/12 de l'année d'observation) est dans l'intervalle. */
export function partAge(niveau: Niveau, ageMin?: number, ageMax?: number): number {
  if (ageMin === undefined && ageMax === undefined) return 1;
  const base = AGE_THEORIQUE[niveau];
  return RETARD.reduce((s, p, k) => {
    const age = base + k;
    return s + ((ageMin === undefined || age >= ageMin) && (ageMax === undefined || age <= ageMax) ? p : 0);
  }, 0);
}

/**
 * Part de la cohorte en retard d'au moins `retardMin` années, parmi les apprenants de la bande d'âge
 * demandée. Le rapport à `partAge` est ce qui rend le taux lisible sous un filtre d'âge : sans lui,
 * demander « les 15-17 ans » compterait comme surâgés des élèves que le filtre a lui-même sélectionnés.
 */
export function partRetard(niveau: Niveau, retardMin: number, ageMin?: number, ageMax?: number): number {
  const base = AGE_THEORIQUE[niveau];
  let dans = 0;
  let grave = 0;
  RETARD.forEach((p, k) => {
    const age = base + k;
    const comprise = (ageMin === undefined || age >= ageMin) && (ageMax === undefined || age <= ageMax);
    if (!comprise) return;
    dans += p;
    if (k >= retardMin) grave += p;
  });
  return dans > 0 ? grave / dans : 0;
}

const effectifTotal = (a: StatCommuneAnnee) =>
  NIVEAUX.reduce((s, n) => s + a.niveaux[n].effectifF + a.niveaux[n].effectifM, 0);

/** Niveau retenu par les filtres, et son poids dans l'intervalle d'âge : la somme des deux sert d'assiette. */
function niveauxSelectionnes(f: Filtres) {
  return NIVEAUX.filter((n) => (!f.niveau || n === f.niveau) && (!f.cycle || cycleDuNiveau(n) === f.cycle));
}

/** Examen national qui observe un niveau : la fin de cycle, pas le niveau demandé lui-même. */
export function examenDuNiveau(niveau: Niveau | null | undefined): ExamenNationalK12 {
  if (niveau === undefined || niveau === null) return "BEPC";
  if (cycleDuNiveau(niveau) === "primaire") return "CEP";
  return ["6e", "5e", "4e", "3e"].includes(niveau) ? "BEPC" : "BAC";
}

const jauge = (
  echelle: string,
  sens: Illustration["sens"],
  reference: string | null,
  paliers: Illustration["paliers"],
  lecture: string,
): Illustration => ({ forme: "jauge", echelle, sens, reference, paliers, lecture });

/* ---------------------------------------------------------------------------- Le registre. */

/** L'arithmétique de la capitalisation, une seule fois écrite : l'écran et le dictionnaire ne peuvent plus diverger. */
export const tauxDeCapitalisation = (acquis: number, attendus: number) =>
  attendus > 0 ? Math.round((acquis / attendus) * 1000) / 10 : null;

const REGISTRE_VERIFIE = {
  /* ---------------------------------------------------------------- Primaires et secondaire : flux. */
  effectif_apprenants: {
    priorite: 130,
    parametres: [],
    filtreAge: true,
    evocateurs: ["combien", "nombre", "effectif", "inscrits", "scolarises", "apprenants", "eleves", "enfants"],
    // Le comptage porte sur les inscrits : une question sur les enfants que l'école n'accueille pas ne
    // doit pas retomber ici, elle n'a pas de dénominateur dans cette assiette.
    garde: (q) => !/\bnon scolarises\b|hors ecole\b|exclusion\b/.test(q),
    definition: {
      code: "effectif_apprenants", nom: "Effectif des apprenants",
      definition: "Nombre d'apprenants inscrits et non sortis (abandon ou transfert hors système) à la date d'observation.",
      formule: "Σ inscriptions + reprises + transferts entrants − abandons − transferts sortants",
      unite: "nombre", moteur: "simulation", perimetre: "k12", assiette: "cellule",
      source: SOURCE_STATISTIQUE, frequence: "Quasi temps réel",
      proprietaire: "Direction de la programmation et de la prospective", version: "1.2",
      dimensions: ["sexe", "departement", "commune", "milieu", "statut", "niveau", "cycle", "annee"],
      effectifMinimalPublication: 5,
      libelleNumerateur: "apprenants inscrits et non sortis", libelleDenominateur: null,
      illustration: jauge("1 à plusieurs millions", "hausse_favorable", "taille du réseau, pas une performance",
        [{ max: null, mention: "Valeur absolue" }],
        "Une population, pas un résultat : elle se lit avec les ratios (encadrement, occupation, parité), jamais seule."),
    },
    rend: { sorte: "couche-statistique", contribution: (o) => contribution(o.effectif, 1, o.effectif) },
  },

  croissance_effectifs: {
    priorite: 100,
    parametres: [],
    filtreAge: false,
    evocateurs: ["croissance", "augmentation des effectifs", "pression demographique", "densification", "afflux"],
    definition: {
      code: "croissance_effectifs", nom: "Croissance des effectifs",
      definition: "Variation relative de l'effectif scolarisé entre l'année observée et l'avant-dernière année close de la série. Une croissance forte sans capacité ni enseignants ajoutés est le signal le plus fiable d'une rentrée sous tension.",
      formule: "(effectif de l'année − effectif d'il y a deux ans) ÷ effectif d'il y a deux ans × 100",
      unite: "pourcentage", moteur: "simulation", perimetre: "k12", assiette: "commune",
      source: SOURCE_STATISTIQUE, frequence: "Annuelle",
      proprietaire: "Direction de la programmation et de la prospective", version: "1.0",
      dimensions: ["departement", "commune", "milieu", "annee"],
      effectifMinimalPublication: 10,
      libelleNumerateur: "variation absolue des effectifs sur deux ans, en pourcentage",
      libelleDenominateur: "effectifs de l'année de référence",
      illustration: jauge("−20 % à +40 %", "neutre", "au-delà de +10 % sur deux ans, la capacité ne suit généralement pas",
        [{ max: -5, mention: "Décroissance" }, { max: 10, mention: "Stable" }, { max: 20, mention: "Forte poussée" }, { max: null, mention: "Afflux" }],
        "Un solde positif n'est pas une bonne nouvelle : il dit où l'on doit bâtir. Croisé avec le taux d'occupation, il distingue une commune qui grandit bien d'une commune qui sature."),
    },
    rend: {
      sorte: "couche-statistique",
      contribution: (o) => {
        const idx = ANNEES.indexOf(o.annee);
        const ref = idx >= 2 ? ANNEES[idx - 2] : undefined;
        const avant = ref ? o.annees[ref] : undefined;
        if (!avant) return null;
        const base = effectifTotal(avant);
        if (base <= 0) return null;
        return contribution(o.effectif - base, base, o.effectif);
      },
    },
  },

  effectif_projete_2030: {
    priorite: 105,
    parametres: [],
    filtreAge: false,
    evocateurs: ["projection", "2030", "effectif previsible", "a horizon", "anticiper les besoins", "combien dans"],
    definition: {
      code: "effectif_projete_2030", nom: "Effectif scolarisable projeté à 2030",
      definition: "Population d'âge scolaire attendue en 2030 pour la commune, extrapolée de la croissance observée de la population scolarisable. C'est une projection démographique, pas un engagement de construction.",
      formule: "population scolarisable de l'année courante × (1 + croissance annualisée ÷ 2)^4",
      unite: "nombre", moteur: "simulation", perimetre: "pilotage", assiette: "commune",
      source: SOURCE_STATISTIQUE, frequence: "Réévaluée à chaque campagne de projection",
      proprietaire: "Direction de la programmation et de la prospective", version: "1.0",
      dimensions: ["departement", "commune", "milieu"],
      effectifMinimalPublication: 5,
      libelleNumerateur: "effectif scolarisable projeté", libelleDenominateur: null,
      illustration: jauge("Dizaines à centaines de milliers", "neutre", "à comparer à la capacité d'accueil actuelle de la commune",
        [{ max: null, mention: "Projection" }],
        "Une projection ne se juge pas seule : soustraite de la capacité actuelle, elle donne le nombre de salles à programmer, pas un pourcentage de plus."),
    },
    rend: {
      sorte: "couche-statistique",
      // L'assiette communale ne porte qu'une année ; la projection, elle, est millésimée par la commune.
      contribution: (o, f) => (f.anneeScolaire && f.anneeScolaire !== ANNEES[ANNEES.length - 1] ? null : contribution(o.projection2030, 1, o.effectif)),
    },
  },

  /* ---------------------------------------------------------------- Primaires et secondaire : résultats. */
  taux_seuil_moyenne: {
    priorite: 60,
    parametres: ["seuil", "matiere"],
    filtreAge: true,
    evocateurs: ["moyenne", "note", "au moins", "au dessus", "reussite scolaire"],
    garde: (q, f) => f.seuil !== undefined && /moyenne|note|\/\s*20|au moins|superieure?/.test(q),
    definition: {
      code: "taux_seuil_moyenne", nom: "Proportion d'apprenants atteignant un seuil de moyenne",
      definition: "Part des apprenants évalués dont la moyenne annuelle dans la matière est supérieure ou égale au seuil.",
      formule: "apprenants évalués avec moyenne ≥ seuil ÷ apprenants évalués × 100",
      unite: "pourcentage", moteur: "simulation", perimetre: "k12", assiette: "cellule",
      source: SOURCE_STATISTIQUE, frequence: "Périodique (trimestre)",
      proprietaire: "Direction des examens et concours", version: "2.0",
      dimensions: ["sexe", "departement", "commune", "milieu", "statut", "niveau", "cycle", "annee"],
      effectifMinimalPublication: 10,
      libelleNumerateur: "apprenants dont la moyenne atteint le seuil", libelleDenominateur: "apprenants évalués dans la matière",
      illustration: jauge("0 à 100 %", "hausse_favorable", "valeur nationale de la même année, même matière, même seuil",
        [{ max: 10, mention: "Très faible" }, { max: 25, mention: "Faible" }, { max: 45, mention: "Moyen" }, { max: null, mention: "Élevé" }],
        "Le seuil change tout : 15/20 mesure l'excellence, 10/20 mesure la réussite minimale. Un chiffre rendu sans son seuil n'a pas de sens."),
    },
    rend: {
      sorte: "couche-statistique",
      contribution: (o, f) => {
        if (!o.notes) return null;
        const seuil = f.seuil ?? 10;
        return contribution(o.effectif * partAuDessus(seuil, o.notes.moy, o.notes.et), o.effectif, o.effectif);
      },
    },
  },

  moyenne_generale: {
    priorite: 70,
    parametres: ["matiere"],
    filtreAge: true,
    evocateurs: ["moyenne", "note moyenne", "niveau moyen", "de combien"],
    definition: {
      code: "moyenne_generale", nom: "Moyenne des apprenants",
      definition: "Moyenne arithmétique des moyennes annuelles des apprenants évalués dans la matière.",
      formule: "Σ moyennes des apprenants évalués ÷ apprenants évalués",
      unite: "note", moteur: "simulation", perimetre: "k12", assiette: "cellule",
      source: SOURCE_STATISTIQUE, frequence: "Périodique (trimestre)",
      proprietaire: "Direction des examens et concours", version: "1.1",
      dimensions: ["sexe", "departement", "commune", "milieu", "statut", "niveau", "cycle", "annee"],
      effectifMinimalPublication: 10,
      libelleNumerateur: "somme des moyennes des apprenants évalués", libelleDenominateur: "apprenants évalués dans la matière",
      illustration: jauge("0 à 20", "hausse_favorable", "10/20 : le seuil de la moyenne acquis",
        [{ max: 8, mention: "Très insuffisant" }, { max: 12, mention: "À la limite" }, { max: 14, mention: "Satisfaisant" }, { max: null, mention: "Bon" }],
        "Une moyenne lissée cache ses extrêmes : à lire avec l'écart-type relatif et la proportion au seuil, sinon elle classe mal les territoires."),
    },
    rend: {
      sorte: "couche-statistique",
      contribution: (o) => (o.notes ? contribution(o.effectif * o.notes.moy, o.effectif, o.effectif) : null),
    },
  },

  dispersion_moyennes: {
    priorite: 65,
    parametres: ["matiere"],
    filtreAge: true,
    evocateurs: ["dispersion", "heterogeneite", "ecart type", "injustice scolaire", "regulier"],
    definition: {
      code: "dispersion_moyennes", nom: "Dispersion relative des moyennes",
      definition: "Écart-type des moyennes rapporté à la moyenne elle-même, pondéré par les effectifs : la dispersion des niveaux à l'intérieur d'un même groupe, exprimée en pourcentage de la moyenne. Elle croît quand un groupe étire ses extrêmes, même si sa moyenne ne bouge pas.",
      formule: "Σ (effectif de la cellule × écart-type ÷ moyenne de la cellule) ÷ Σ effectifs évalués × 100",
      unite: "pourcentage", moteur: "simulation", perimetre: "k12", assiette: "cellule",
      source: SOURCE_STATISTIQUE, frequence: "Périodique (trimestre)",
      proprietaire: "Direction des examens et concours", version: "1.0",
      dimensions: ["sexe", "departement", "commune", "milieu", "statut", "niveau", "cycle", "annee"],
      effectifMinimalPublication: 10,
      libelleNumerateur: "écart-types rapportés pondérés par les effectifs", libelleDenominateur: "apprenants évalués dans la matière",
      illustration: jauge("10 à 60 %", "baisse_favorable", "en dessous de 25 %, les classes sont homogènes",
        [{ max: 25, mention: "Homogène" }, { max: 32, mention: "Étirement modéré" }, { max: 45, mention: "Très hétérogène" }, { max: null, mention: "Éclatement" }],
        "Deux communes à la même moyenne peuvent avoir des politiques contraires : celle qui est dispersée a des élèves à rattraper, pas un niveau collectif à élever."),
    },
    rend: {
      sorte: "couche-statistique",
      contribution: (o) =>
        o.notes && o.notes.moy > 0 ? contribution((o.effectif * o.notes.et) / o.notes.moy, o.effectif, o.effectif) : null,
    },
  },

  /* ---------------------------------------------------------------- Primaires et secondaire : climat scolaire. */
  taux_absenteisme: {
    priorite: 20,
    parametres: [],
    filtreAge: false,
    evocateurs: ["absent", "absenteisme", "taux d absence", "manquent", "presence en classe"],
    definition: {
      code: "taux_absenteisme", nom: "Taux d'absentéisme",
      definition: "Part des demi-journées de classe manquées, justifiées ou non, sur les demi-journées dues.",
      formule: "demi-journées d'absence ÷ demi-journées dues × 100",
      unite: "pourcentage", moteur: "simulation", perimetre: "k12", assiette: "commune",
      source: SOURCE_STATISTIQUE, frequence: "Quotidienne",
      proprietaire: "Direction de l'enseignement secondaire", version: "1.0",
      dimensions: ["departement", "commune", "milieu", "annee"],
      effectifMinimalPublication: 10,
      libelleNumerateur: "demi-journées manquées", libelleDenominateur: "demi-journées dues",
      illustration: jauge("0 à 20 %", "baisse_favorable", "au-delà de 11,5 %, la progression pédagogique est compromise",
        [{ max: 6, mention: "Favorable" }, { max: 11.5, mention: "Sous surveillance" }, { max: 15, mention: "Attention" }, { max: null, mention: "Critique" }],
        "L'absentéisme est le premier signe visible d'un décrochage qui n'est pas encore enregistré : il précède l'abandon de plusieurs semaines."),
    },
    rend: { sorte: "couche-statistique", contribution: (o) => contribution(o.effectif * o.stats.tauxAbsenteisme, o.effectif, o.effectif) },
  },

  taux_abandon: {
    priorite: 10,
    parametres: [],
    filtreAge: false,
    evocateurs: ["abandon*", "abandonne*", "decroch*", "quittent l ecole", "quitte* l ecole", "descolaris*", "sortie anticip*", "demission*"],
    definition: {
      code: "taux_abandon", nom: "Taux d'abandon",
      definition: "Part des apprenants inscrits en début d'année ayant quitté le système sans transfert au cours de l'année.",
      formule: "abandons de l'année ÷ inscrits en début d'année × 100",
      unite: "pourcentage", moteur: "simulation", perimetre: "k12", assiette: "commune",
      source: SOURCE_STATISTIQUE, frequence: "Annuelle",
      proprietaire: "Direction de la programmation et de la prospective", version: "1.0",
      dimensions: ["departement", "commune", "milieu", "annee"],
      effectifMinimalPublication: 10,
      libelleNumerateur: "apprenants sortis du système sans transfert", libelleDenominateur: "inscrits en début d'année",
      illustration: jauge("0 à 15 %", "baisse_favorable", "cible du secteur : sous 5 %",
        [{ max: 3, mention: "Favorable" }, { max: 7, mention: "Sous surveillance" }, { max: 10, mention: "Attention" }, { max: null, mention: "Critique" }],
        "Un point d'abandon perdu ne se rattrape pas dans l'année : c'est la mesure qui commande les actions de reprise, pas les statistiques de rentrée."),
    },
    rend: { sorte: "couche-statistique", contribution: (o) => contribution(o.effectif * o.stats.tauxAbandon, o.effectif, o.effectif) },
  },

  taux_surage: {
    priorite: 95,
    parametres: [],
    filtreAge: true,
    evocateurs: ["surage", "retard scolaire", "age theorique", "trop age", "redoublent", "age de retard", "en retard de", "eleves en retard"],
    // « données en retard de déclaration » se lit à la fraîcheur, pas au surâge : les deux portent « retard ».
    garde: (q) => !/declaration|donnees|transmis/.test(q),
    definition: {
      code: "taux_surage", nom: "Taux de surâge",
      definition: "Part des apprenants ayant au moins deux ans de plus que l'âge théorique du niveau fréquenté (âge retenu au 31 décembre de l'année d'observation). Mesure de la répétition et des entrées tardives, pas de l'âge lui-même.",
      formule: "apprenants en retard d'au moins deux ans ÷ apprenants du niveau (et de la bande d'âge demandée) × 100",
      unite: "pourcentage", moteur: "simulation", perimetre: "k12", assiette: "cellule",
      source: SOURCE_STATISTIQUE, frequence: "Annuelle",
      proprietaire: "Direction de la programmation et de la prospective", version: "1.0",
      dimensions: ["sexe", "departement", "commune", "milieu", "statut", "niveau", "cycle", "annee"],
      effectifMinimalPublication: 10,
      libelleNumerateur: "apprenants en retard d'au moins deux ans", libelleDenominateur: "apprenants du niveau observé",
      illustration: jauge("0 à 60 %", "baisse_favorable", "le surâge se concentre au primaire et dans le secondaire rural",
        [{ max: 15, mention: "Faible" }, { max: 30, mention: "Modéré" }, { max: 45, mention: "Élevé" }, { max: null, mention: "Massif" }],
        "Un taux de surâge élevé ne dit pas que les élèves sont plus âgés : il dit qu'ils ont redoublé ou sont entrés tard à l'école, et qu'ils sortiront avant la fin du cycle si rien n'est fait."),
    },
    rend: {
      sorte: "couche-statistique",
      contribution: (o, f) => {
        if (!o.niveau || o.effectif <= 0) return null;
        const part = partRetard(o.niveau, 2, f.ageMin, f.ageMax);
        return contribution(o.effectif * part, o.effectif, o.effectif);
      },
    },
  },

  indice_parite: {
    priorite: 75,
    parametres: [],
    filtreAge: true,
    evocateurs: ["parite", "equite filles", "disparite filles", "filles avantagees", "indice de parite"],
    definition: {
      code: "indice_parite", nom: "Indice de parité filles-garçons",
      definition: "Nombre de filles scolarisées pour un garçon, dans le périmètre observé. Un indice de 1,00 est la parité ; en dessous, les filles sont sous-représentées ; au-dessus, elles le sont davantage que les garçons.",
      formule: "effectif des filles ÷ effectif des garçons",
      unite: "indice", moteur: "simulation", perimetre: "k12", assiette: "commune",
      source: SOURCE_STATISTIQUE, frequence: "Annuelle",
      proprietaire: "Direction de la programmation et de la prospective", version: "1.0",
      dimensions: ["departement", "commune", "milieu", "statut", "niveau", "cycle", "annee"],
      effectifMinimalPublication: 10,
      libelleNumerateur: "filles scolarisées", libelleDenominateur: "garçons scolarisés",
      illustration: jauge("0,70 à 1,20", "neutre", "1,00 : la parité",
        [{ max: 0.85, mention: "Écart marqué en défaveur des filles" }, { max: 0.95, mention: "Léger déséquilibre" }, { max: 1.05, mention: "Parité" }, { max: null, mention: "Filles plus nombreuses" }],
        "La parité se ventile : un indice national proche de 1 masque régulièrement un secondaire rural où les filles sortent plus tôt."),
    },
    rend: {
      sorte: "couche-statistique",
      contribution: (o, f) => {
        let filles = 0;
        let garcons = 0;
        for (const niveau of niveauxSelectionnes(f)) {
          const cycle = cycleDuNiveau(niveau);
          const poidsAge = partAge(niveau, f.ageMin, f.ageMax);
          // Un statut demandé pèse les deux sexes de la même part : le rapport reste la parité observée.
          const partStatut = f.statut ? o.partsStatut?.[cycle]?.[f.statut] ?? 0 : 1;
          const cell = o.stats.niveaux[niveau];
          filles += cell.effectifF * poidsAge * partStatut;
          garcons += cell.effectifM * poidsAge * partStatut;
        }
        return garcons > 0 ? contribution(filles, garcons, filles + garcons) : null;
      },
    },
  },

  /* ---------------------------------------------------------------- Primaires et secondaire : examens. */
  taux_reussite_examen: {
    priorite: 50,
    parametres: [],
    filtreAge: false,
    evocateurs: ["reussite", "admis", "cep", "bepc", "bac", "examen", "deliberation"],
    definition: {
      code: "taux_reussite_examen", nom: "Taux de réussite à l'examen",
      definition: "Nombre de candidats admis rapporté au nombre de candidats effectivement évalués (présents).",
      formule: "candidats admis ÷ candidats présents × 100",
      unite: "pourcentage", moteur: "simulation", perimetre: "k12", assiette: "examen",
      source: SOURCE_STATISTIQUE, frequence: "Annuelle (après délibération)",
      proprietaire: "Direction des examens et concours", version: "3.1",
      dimensions: ["departement", "commune", "milieu", "examen", "annee"],
      effectifMinimalPublication: 10,
      libelleNumerateur: "candidats admis", libelleDenominateur: "candidats présents à l'examen",
      illustration: jauge("0 à 100 %", "hausse_favorable", "moyenne nationale de la session",
        [{ max: 30, mention: "Très faible" }, { max: 55, mention: "Moyen" }, { max: 75, mention: "Bon" }, { max: null, mention: "Élevé" }],
        "Le dénominateur est politique : sur les présents, on mesure l'enseignement ; sur les inscrits, on mesure aussi l'absentéisme. La définition dit « présents », et le taux de présence est un autre indicateur."),
    },
    rend: {
      sorte: "couche-statistique",
      contribution: (o) => (o.examen ? contribution(o.examen.admis, o.examen.presents, o.examen.presents) : null),
    },
  },

  taux_presence_examen: {
    priorite: 15,
    parametres: [],
    filtreAge: false,
    evocateurs: ["presence a l examen", "presence aux epreuves", "candidats presents", "defaillants", "abstention", "qui ne vient pas"],
    definition: {
      code: "taux_presence_examen", nom: "Taux de présence aux épreuves",
      definition: "Part des candidats inscrits à un examen national qui se sont effectivement présentés aux épreuves.",
      formule: "candidats présents ÷ candidats inscrits × 100",
      unite: "pourcentage", moteur: "simulation", perimetre: "k12", assiette: "examen",
      source: SOURCE_STATISTIQUE, frequence: "Annuelle (après la dernière épreuve)",
      proprietaire: "Direction des examens et concours", version: "1.0",
      dimensions: ["departement", "commune", "milieu", "examen", "annee"],
      effectifMinimalPublication: 10,
      libelleNumerateur: "candidats présents aux épreuves", libelleDenominateur: "candidats inscrits",
      illustration: jauge("80 à 100 %", "hausse_favorable", "un taux de présence sous 95 % signale des désistements en amont des épreuves",
        [{ max: 93, mention: "Défaillances élevées" }, { max: 96, mention: "Sous surveillance" }, { max: null, mention: "Favorable" }],
        "Cette mesure lit ce que le taux de réussite ne voit pas : des candidats qui se sont retirés avant d'être notés, souvent les plus fragiles."),
    },
    rend: {
      sorte: "couche-statistique",
      contribution: (o) => (o.examen && o.examen.inscrits > 0 ? contribution(o.examen.presents, o.examen.inscrits, o.examen.inscrits) : null),
    },
  },

  /* ---------------------------------------------------------------- Encadrement et accueil. */
  ratio_apprenants_enseignant: {
    priorite: 30,
    parametres: [],
    filtreAge: false,
    evocateurs: ["par enseignant", "ratio", "encadrement", "maitre", "professeur", "nombre d eleves par maitre"],
    definition: {
      code: "ratio_apprenants_enseignant", nom: "Ratio apprenants par enseignant",
      definition: "Nombre d'apprenants pour un enseignant en poste, tous statuts confondus.",
      formule: "effectif des apprenants ÷ enseignants en poste",
      unite: "ratio", moteur: "simulation", perimetre: "k12", assiette: "commune",
      source: SOURCE_STATISTIQUE, frequence: "Mensuelle",
      proprietaire: "Direction des ressources humaines", version: "1.1",
      dimensions: ["departement", "commune", "milieu", "annee"],
      effectifMinimalPublication: 1,
      libelleNumerateur: "apprenants scolarisés", libelleDenominateur: "enseignants en poste",
      illustration: jauge("25 à 80 apprenants par enseignant", "baisse_favorable", "au-delà de 54, la différenciation pédagogique devient impossible",
        [{ max: 40, mention: "Confortable" }, { max: 54, mention: "Dense" }, { max: 65, mention: "Surchargé" }, { max: null, mention: "Critique" }],
        "Le ratio se dégrade toujours avant que les résultats ne baissent : c'est l'indicateur avancé de la pression sur le corps enseignant."),
    },
    rend: { sorte: "couche-statistique", contribution: (o) => contribution(o.effectif, o.stats.enseignants, o.effectif) },
  },

  part_enseignants_qualifies: {
    priorite: 80,
    parametres: [],
    filtreAge: false,
    evocateurs: ["enseignant qualifie", "qualification des enseignants", "maitres qualifies", "personnel qualifie", "non qualifies", "formation des maitres"],
    definition: {
      code: "part_enseignants_qualifies", nom: "Part des enseignants qualifiés",
      definition: "Part des enseignants en poste dont la qualification attestée répond au référentiel du niveau enseigné. Un enseignant contracté sans formation initiale est compté dans le ratio d'encadrement mais pas ici.",
      formule: "enseignants qualifiés ÷ enseignants en poste × 100",
      unite: "pourcentage", moteur: "simulation", perimetre: "k12", assiette: "commune",
      source: SOURCE_STATISTIQUE, frequence: "Mensuelle",
      proprietaire: "Direction des ressources humaines", version: "1.0",
      dimensions: ["departement", "commune", "milieu", "annee"],
      effectifMinimalPublication: 10,
      libelleNumerateur: "enseignants dont la qualification est attestée", libelleDenominateur: "enseignants en poste",
      illustration: jauge("40 à 100 %", "hausse_favorable", "la qualification minimale requise pour enseigner est la norme",
        [{ max: 55, mention: "Très insuffisante" }, { max: 70, mention: "Insuffisante" }, { max: 85, mention: "Correcte" }, { max: null, mention: "Satisfaisante" }],
        "À ratio égal, deux communes n'encadrent pas pareil : c'est cette part qui distingue la quantité d'encadrement de sa qualité."),
    },
    rend: {
      sorte: "couche-statistique",
      contribution: (o) => (o.stats.enseignants > 0 ? contribution(o.stats.enseignantsQualifies, o.stats.enseignants, o.effectif) : null),
    },
  },

  taux_occupation: {
    priorite: 40,
    parametres: [],
    filtreAge: false,
    evocateurs: ["occupation", "capacite d accueil", "surcharg", "sature", "taux d accueil", "effectif par etablissement"],
    definition: {
      code: "taux_occupation", nom: "Taux d'occupation des établissements",
      definition: "Rapport entre l'effectif accueilli et la capacité d'accueil déclarée des établissements.",
      formule: "effectif ÷ capacité d'accueil × 100",
      unite: "pourcentage", moteur: "simulation", perimetre: "k12", assiette: "commune",
      source: SOURCE_STATISTIQUE, frequence: "Mensuelle",
      proprietaire: "Direction de la programmation et de la prospective", version: "1.0",
      dimensions: ["departement", "commune", "milieu", "annee"],
      effectifMinimalPublication: 1,
      libelleNumerateur: "apprenants accueillis", libelleDenominateur: "capacité d'accueil déclarée",
      illustration: jauge("50 à 180 %", "baisse_favorable", "100 % : la capacité déclarée est exactement atteinte",
        [{ max: 75, mention: "Sous-utilisé" }, { max: 100, mention: "Capacité atteinte" }, { max: 112, mention: "Tendu" }, { max: null, mention: "Saturation" }],
        "Au-dessus de 100 %, l'excédent n'est pas une statistique : il est accueilli dans des effectifs pléthoriques ou des salles de fortune."),
    },
    rend: { sorte: "couche-statistique", contribution: (o) => contribution(o.effectif, o.stats.capacite, o.effectif) },
  },

  places_disponibles: {
    priorite: 35,
    parametres: [],
    filtreAge: false,
    evocateurs: ["places", "capacite restante", "places libres", "deficit de places", "nouvelles places", "ou construire"],
    definition: {
      code: "places_disponibles", nom: "Places d'accueil disponibles",
      definition: "Capacité d'accueil déclarée moins l'effectif réellement accueilli. Une valeur négative est un déficit : autant d'apprenants accueillis au-delà de la capacité, et donc le nombre de places à créer pour revenir à la norme.",
      formule: "capacité d'accueil − effectif accueilli",
      unite: "nombre", moteur: "simulation", perimetre: "k12", assiette: "commune",
      source: SOURCE_STATISTIQUE, frequence: "Mensuelle",
      proprietaire: "Direction de la programmation et de la prospective", version: "1.0",
      dimensions: ["departement", "commune", "milieu", "annee"],
      effectifMinimalPublication: 5,
      libelleNumerateur: "places restantes (ou déficit, si négatif)", libelleDenominateur: null,
      illustration: jauge("Milliers négatifs à milliers positifs", "hausse_favorable", "0 : la capacité couvre exactement l'effectif",
        [{ max: -2000, mention: "Déficit structurel" }, { max: 0, mention: "Saturation" }, { max: 3000, mention: "Marge étroite" }, { max: null, mention: "Capacité excédentaire" }],
        "Le taux d'occupation dit l'intensité, ce solde dit la décision : c'est le nombre de salles à inscrire au plan d'équipement de la commune."),
    },
    rend: { sorte: "couche-statistique", contribution: (o) => contribution(o.stats.capacite - o.effectif, 1, o.effectif) },
  },

  ratio_apprenants_salle: {
    priorite: 25,
    parametres: [],
    filtreAge: false,
    evocateurs: ["par salle", "densite", "nombre d eleves par classe", "effectif par classe", "taille de classe", "salles de classe"],
    definition: {
      code: "ratio_apprenants_salle", nom: "Densité d'apprenants par salle",
      definition: "Nombre d'apprenants pour une salle de classe dans le parc d'établissements observé. La salle, et non l'enseignant : c'est l'infrastructure qui borne l'effectif d'une classe quand les postes manquent.",
      formule: "Σ effectifs des établissements ÷ Σ salles de classe",
      unite: "ratio", moteur: "simulation", perimetre: "k12", assiette: "etablissement",
      source: SOURCE_STATISTIQUE, frequence: "Mensuelle",
      proprietaire: "Direction de la programmation et de la prospective", version: "1.0",
      dimensions: ["departement", "commune", "milieu", "statut"],
      effectifMinimalPublication: 5,
      libelleNumerateur: "apprenants accueillis", libelleDenominateur: "salles de classe déclarées",
      illustration: jauge("20 à 120 apprenants par salle", "baisse_favorable", "la norme d'accueil usuelle se situe autour de 50 à 60",
        [{ max: 45, mention: "Confortable" }, { max: 70, mention: "Dense" }, { max: 90, mention: "Surpeuplée" }, { max: null, mention: "Hors norme" }],
        "Un ratio d'encadrement correct avec une densité de salle excessive décrit des classes complètes tenues par peu d'enseignants : la première mesure à prendre est une salle, pas un poste."),
    },
    rend: {
      sorte: "couche-statistique",
      contribution: (o) => {
        if (!o.etabs.length) return null;
        const salles = o.etabs.reduce((s, e) => s + e.sallesDeClasse, 0);
        return salles > 0 ? contribution(o.effectif, salles, o.effectif) : null;
      },
    },
  },

  taux_acces_infrastructure: {
    priorite: 85,
    parametres: ["infrastructure"],
    filtreAge: false,
    evocateurs: ["latrines", "electricite", "internet", "point d eau", "eau potable", "bibliotheque", "equipement", "connectivite", "acces a l eau", "taux d equipement"],
    definition: {
      code: "taux_acces_infrastructure", nom: "Taux d'accès à un équipement",
      definition: "Part des établissements du périmètre réellement dotés de l'équipement demandé. Cinq équipements sont observés — point d'eau, raccordement électrique, accès internet, latrines, bibliothèque — et aucune moyenne n'est faite entre eux : un réseau doté à 80 % en latrines et à 5 % en internet n'est pas « doté à 42 % ».",
      formule: "établissements disposant de l'équipement ÷ établissements observés × 100",
      unite: "pourcentage", moteur: "simulation", perimetre: "k12", assiette: "etablissement",
      source: SOURCE_STATISTIQUE, frequence: "Annuelle (recensement de l'infrastructure)",
      proprietaire: "Direction de la programmation et de la prospective", version: "1.0",
      dimensions: ["departement", "commune", "milieu", "statut"],
      effectifMinimalPublication: 5,
      libelleNumerateur: "établissements disposant de l'équipement", libelleDenominateur: "établissements observés",
      illustration: jauge("0 à 100 %", "hausse_favorable", "un équipement déclaré par l'établissement, non vérifié sur site",
        [{ max: 20, mention: "Quasi absent" }, { max: 50, mention: "Minoritaire" }, { max: 80, mention: "Majoritaire" }, { max: null, mention: "Généralisé" }],
        "L'équipement se demande un par un : la question « sont-ils équipés » n'a pas de réponse, celle « ont-ils l'eau » oui."),
    },
    rend: {
      sorte: "couche-statistique",
      contribution: (o, f) => {
        if (!f.infrastructure || !o.etabs.length) return null;
        const dotes = o.etabs.filter((e) => e.infrastructures[f.infrastructure!]).length;
        return contribution(dotes, o.etabs.length, o.effectif);
      },
    },
  },

  /* ---------------------------------------------------------------- Pilotage transverse : la donnée elle-même. */
  population_scolarisable: {
    priorite: 88,
    parametres: [],
    filtreAge: false,
    evocateurs: ["population scolarisable", "age scolaire", "enfants d age", "bassin scolaire", "combien d enfants en age"],
    // Un comptage, pas un taux : « le taux de scolarisation dans la population d'âge scolaire » demande le
    // rapport, pas la population. La garde rend la main à `taux_scolarisation_brut`.
    garde: (q) => !/\btaux\b|\bproportion\b|\bpart\b/.test(q) && /\bcombien\b|\bpopulation\b|\beffectif\b|\bnombre\b/.test(q),
    definition: {
      code: "population_scolarisable", nom: "Population d'âge scolaire",
      definition: "Enfants résidant dans le périmètre et ayant atteint l'âge théorique de la scolarité obligatoire au 31 décembre de l'année observée. C'est le dénominateur du taux brut de scolarisation : il est estimé à partir des effectifs déclarés et du taux de scolarisation retenu pour la commune, non d'un recensement indépendant.",
      formule: "effectif scolarisé ÷ taux brut de scolarisation retenu pour la commune",
      unite: "nombre", moteur: "simulation", perimetre: "pilotage", assiette: "commune",
      source: SOURCE_STATISTIQUE, frequence: "Annuelle",
      proprietaire: "Direction de la programmation et de la prospective", version: "1.0",
      dimensions: ["departement", "commune", "milieu", "annee"],
      effectifMinimalPublication: 5,
      libelleNumerateur: "enfants d'âge scolaire théorique", libelleDenominateur: null,
      illustration: jauge("Milliers à centaines de milliers", "neutre", "à comparer à l'effectif réellement scolarisé de la même année",
        [{ max: null, mention: "Estimation" }],
        "Deux usages, un seul chiffre : soustrait de l'effectif scolarisé, il estime les enfants hors de l'école ; rapporté à la capacité d'accueil, il dimensionne les salles à construire. C'est une estimation de planification, pas un recensement."),
    },
    rend: {
      sorte: "couche-statistique",
      contribution: (o) => (o.stats.populationScolarisable > 0 ? contribution(o.stats.populationScolarisable, 1, o.effectif) : null),
    },
  },

  taux_scolarisation_brut: {
    priorite: 90,
    parametres: [],
    filtreAge: false,
    garde: (q) => !/\bcombien\b|\bnombre\b|\beffectif\b/.test(q),
    horsPortee: "Le nombre d'enfants que l'école n'accueille pas n'est pas un indicateur publié : il faudrait une source démographique indépendante de l'école pour le compter, et aucune n'est enregistrée ici. Ce que le registre sait rendre est le taux brut de scolarisation, qui rapporte les effectifs scolarisés à la population d'âge scolaire théorique de la commune — son complément appliqué à cette population donne l'ordre de grandeur, pas un chiffre officiel.",
    evocateurs: ["scolarisation", "taux de scolarisation", "acces a l ecole", "population scolarisable", "non scolarises", "enfants hors ecole", "exclusion scolaire"],
    definition: {
      code: "taux_scolarisation_brut", nom: "Taux brut de scolarisation",
      definition: "Effectif réellement scolarisé rapporté à la population d'âge scolaire théorique de la commune. Il est dit « brut » parce qu'il compte les élèves de tout âge au numérateur, y compris ceux qui ne sont pas d'âge scolaire ; à ce titre il peut dépasser 100 % dans une commune qui accueille au-delà de son bassin.",
      formule: "effectif scolarisé ÷ population scolarisable × 100",
      unite: "pourcentage", moteur: "simulation", perimetre: "k12", assiette: "commune",
      source: SOURCE_STATISTIQUE, frequence: "Annuelle",
      proprietaire: "Direction de la programmation et de la prospective", version: "1.0",
      dimensions: ["departement", "commune", "milieu", "annee"],
      effectifMinimalPublication: 10,
      libelleNumerateur: "apprenants scolarisés, tous âges", libelleDenominateur: "population d'âge scolaire théorique",
      illustration: jauge("50 à 120 %", "hausse_favorable", "l'objectif du secteur est la scolarisation complète de la tranche d'âge",
        [{ max: 65, mention: "Exclusion massive" }, { max: 80, mention: "Insuffisant" }, { max: 95, mention: "Proche de la cible" }, { max: null, mention: "Accueil au-delà du bassin" }],
        "Le hors-cadre est l'information : au-dessus de 100 %, la commune scolarise des enfants qui n'y habitent pas ; en dessous de 65 %, des enfants du bassin ne sont inscrits nulle part."),
    },
    rend: {
      sorte: "couche-statistique",
      contribution: (o) =>
        o.stats.populationScolarisable > 0 ? contribution(o.effectif, o.stats.populationScolarisable, o.effectif) : null,
    },
  },

  taux_depot_donnees: {
    priorite: 110,
    parametres: [],
    filtreAge: false,
    evocateurs: ["transmis", "transmission des donnees", "depot", "couverture des donnees", "donnees manquantes", "reliquet", "donnees pas jour", "declaration"],
    definition: {
      code: "taux_depot_donnees", nom: "Taux de transmission des données",
      definition: "Part des établissements attendus ayant effectivement transmis leur déclaration pour l'année en cours. Les années closes sont réputées entièrement transmises : une année archivée et validée ne peut plus être en attente.",
      formule: "établissements ayant transmis ÷ établissements attendus × 100",
      unite: "pourcentage", moteur: "simulation", perimetre: "pilotage", assiette: "etablissement",
      source: SOURCE_STATISTIQUE, frequence: "Continue (à chaque dépôt)",
      proprietaire: "Direction de la programmation et de la prospective", version: "1.0",
      dimensions: ["departement", "commune", "milieu", "statut"],
      effectifMinimalPublication: 5,
      libelleNumerateur: "établissements ayant transmis leur déclaration", libelleDenominateur: "établissements attendus",
      illustration: jauge("0 à 100 %", "hausse_favorable", "sous 90 %, les agrégats du périmètre ne sont plus comparables d'une commune à l'autre",
        [{ max: 65, mention: "Non exploitable" }, { max: 85, mention: "Partiel" }, { max: 95, mention: "Bon" }, { max: null, mention: "Exhaustif" }],
        "C'est l'indicateur à regarder avant n'importe quel autre : une commune à 60 % de transmission produit des taux qui décrivent ses déposants, pas ses écoles."),
    },
    rend: {
      sorte: "couche-statistique",
      contribution: (o) => {
        if (!o.etabs.length) return null;
        const transmis = o.etabs.filter((e) => e.transmis).length;
        return contribution(transmis, o.etabs.length, o.effectif);
      },
    },
  },

  fraicheur_donnees: {
    priorite: 115,
    parametres: [],
    filtreAge: false,
    evocateurs: ["fraicheur", "anciennete des donnees", "derniere mise a jour", "donnee a jour", "retard de declaration", "depuis quand"],
    definition: {
      code: "fraicheur_donnees", nom: "Fraîcheur moyenne des données",
      definition: "Nombre de jours écoulés depuis le dernier dépôt, moyen sur le périmètre et pondéré par les effectifs : une commune dont le seul grand établissement a déposé il y a trois semaines n'est pas à jour.",
      formule: "Σ (effectif de la commune × jours depuis le dépôt) ÷ Σ effectifs",
      unite: "jours", moteur: "simulation", perimetre: "pilotage", assiette: "commune",
      source: SOURCE_STATISTIQUE, frequence: "Continue (à chaque dépôt)",
      proprietaire: "Direction de la programmation et de la prospective", version: "1.0",
      dimensions: ["departement", "commune", "milieu", "annee"],
      effectifMinimalPublication: 10,
      libelleNumerateur: "jours depuis le dépôt, pondérés par les effectifs", libelleDenominateur: "apprenants du périmètre",
      illustration: jauge("0 à 30 jours", "baisse_favorable", "au-delà de 30 jours, la donnée est considérée comme périmée pour le pilotage",
        [{ max: 3, mention: "À jour" }, { max: 9, mention: "Récente" }, { max: 20, mention: "Ancienne" }, { max: null, mention: "Périmée" }],
        "La fraîcheur se relit avec le taux de transmission : beaucoup de dépôts mais anciens décrit un réseau qui déclare tard, pas un réseau qui ne déclare pas."),
    },
    rend: { sorte: "couche-statistique", contribution: (o) => contribution(o.effectif * o.stats.fraicheurJours, o.effectif, o.effectif) },
  },

  /* ---------------------------------------------------------------- Supérieur : registre, pas couche statistique. */
  credits_ects_acquis: {
    priorite: 5,
    parametres: [],
    filtreAge: false,
    evocateurs: ["ects", "credit", "credits capitalises", "validation d ue", "semestre valide"],
    definition: {
      code: "credits_ects_acquis", nom: "Crédits ECTS acquis",
      definition: "Somme des crédits ECTS attachés aux acquisitions d'unité d'enseignement encore en cours de validité, pour la population et la période observées. Une UE s'acquiert en bloc, jamais au prorata : le crédit entier est compté à la date d'acquisition, et un acquis périmé selon la règle de validité sort du compte sans disparaître du registre.",
      formule: "Σ crédits acquis des validations d'UE dont l'acquis est en cours de validité",
      unite: "nombre", moteur: "registre", perimetre: "superieur", assiette: "commune",
      source: SOURCE_REGISTRE, frequence: "À chaque décision de validation",
      proprietaire: "Direction générale de l'enseignement supérieur (MESRS)", version: "1.0",
      dimensions: ["annee"], effectifMinimalPublication: 10,
      libelleNumerateur: "crédits ECTS attachés aux acquis valides", libelleDenominateur: null,
      illustration: jauge("0 à 180 crédits", "hausse_favorable", "30 crédits : une année LMD validée",
        [{ max: 29, mention: "Année non capitalisée" }, { max: 60, mention: "Deux années" }, { max: 180, mention: "Licence complète" }, { max: null, mention: "Au-delà" }],
        "Un total de crédits ne se compare qu'à un attendu : rendu seul, il ne dit ni si l'étudiant est à jour, ni s'il avance."),
    },
    rend: {
      sorte: "service-metier",
      service: "/enseignement-superieur/scolarite/credits-ects (service de scolarité du supérieur, par établissement et par voie)",
      rendre: (lignes) => {
        const acquis = lignes.reduce((s, l) => s + l.creditsAcquis, 0);
        const attendus = lignes.reduce((s, l) => s + l.creditsAttendus, 0);
        return { creditsAcquis: acquis, creditsAttendus: attendus, tauxCapitalisation: tauxDeCapitalisation(acquis, attendus) };
      },
    },
  },

  taux_capitalisation_ects: {
    priorite: 5,
    parametres: [],
    filtreAge: false,
    evocateurs: ["capitalisation", "taux de capitalisation", "credits attendus", "progression du parcours", "retard lmd", "valider son annee"],
    definition: {
      code: "taux_capitalisation_ects", nom: "Taux de capitalisation des crédits ECTS",
      definition: "Part, en pourcentage, des crédits attendus sur la période qui ont été réellement acquis par les étudiants sous contrat signé. C'est la mesure du parcours LMD : un étudiant qui valide sa période a capitalisé 30 crédits sur 30. Le dénominateur est la population contractée, pas la population inscrite : un étudiant sans contrat signé n'a rien eu à valider, et le compter ferait baisser le taux pour une raison administrative.",
      formule: "crédits ECTS acquis ÷ (crédits attendus de la période × étudiants sous contrat signé) × 100",
      unite: "pourcentage", moteur: "registre", perimetre: "superieur", assiette: "commune",
      source: SOURCE_REGISTRE, frequence: "Périodique (à la clôture de période)",
      proprietaire: "Direction générale de l'enseignement supérieur (MESRS)", version: "1.0",
      dimensions: ["annee"], effectifMinimalPublication: 10,
      libelleNumerateur: "crédits ECTS acquis", libelleDenominateur: "crédits attendus de la période",
      illustration: jauge("0 à 100 %", "hausse_favorable", "100 % : la période est intégralement capitalisée",
        [{ max: 55, mention: "Parcours en retard" }, { max: 75, mention: "Partiel" }, { max: 92, mention: "Proche du régime normal" }, { max: null, mention: "Capitalisation pleine" }],
        "Sous 75 %, le retard n'est pas une hypothèse : il se retrouvera dans les taux de soutenance deux ou trois ans plus tard."),
    },
    rend: {
      sorte: "service-metier",
      service: "/enseignement-superieur/scolarite/credits-ects (rendu par voie, avec le seuil de publication appliqué à la population distincte)",
      rendre: (lignes) => {
        const acquis = lignes.reduce((s, l) => s + l.creditsAcquis, 0);
        const attendus = lignes.reduce((s, l) => s + l.creditsAttendus, 0);
        return { creditsAcquis: acquis, creditsAttendus: attendus, tauxCapitalisation: tauxDeCapitalisation(acquis, attendus) };
      },
    },
  },
} satisfies Record<CodeIndicateur, EntreeRegistre>;

/**
 * Le registre est d'abord vérifié tel quel (`satisfies`) : un code du contrat sans calculateur fait
 * échouer la compilation. La relecture explicite en `Record` ensuite élargit le type vu par les
 * consommateurs, sans quoi une entrée sans `garde` n'aurait pas cette propriété et le lexique ne
 * pourrait plus la tester.
 */
export const REGISTRE: Record<CodeIndicateur, EntreeRegistre> = REGISTRE_VERIFIE;

/** Le dictionnaire n'est plus une liste à part : il est la figure publique du registre. */
export const DICTIONNAIRE: Record<CodeIndicateur, DefinitionIndicateur> = Object.fromEntries(
  (Object.keys(REGISTRE) as CodeIndicateur[]).map((code) => [code, REGISTRE[code].definition]),
) as Record<CodeIndicateur, DefinitionIndicateur>;

export const CODES: CodeIndicateur[] = Object.keys(REGISTRE) as CodeIndicateur[];

/** Les codes qu'un moteur donné sait réellement rendre. */
export const codesDuMoteur = (moteur: DefinitionIndicateur["moteur"]): CodeIndicateur[] =>
  CODES.filter((code) => REGISTRE[code].definition.moteur === moteur);

export const estCalculeParLeRegistre = (code: CodeIndicateur) => REGISTRE[code].rend.sorte === "service-metier";

/** Le service nommés qui rend un indicateur hors couche statistique — cité dans le refus, jamais un silence. */
export const serviceRendant = (code: CodeIndicateur): string | null => {
  const rend = REGISTRE[code].rend;
  return rend.sorte === "service-metier" ? rend.service : null;
};

/**
 * Ce que le traducteur sait interroger : un indicateur dont la couche statistique porte l'assiette.
 * La liste est dérivée du registre, donc elle ne peut pas promettre plus que le calcul.
 */
export const codesInterrogeables = (): CodeIndicateur[] =>
  CODES.filter((code) => REGISTRE[code].rend.sorte === "couche-statistique");

/**
 * Le mot du décideur n'est jamais exactement celui du dictionnaire : « enseignants qualifiés » ne contient
 * pas la chaîne « enseignant qualifie ». Un évocateur est donc testé comme une expression, mot à mot, où
 * chaque mot accepte une terminaison de pluriel ou de féminin, et où les espaces acceptent l'apostrophe.
 * La borne finale empêche « cap » de lire « capacité » : un sigle d'examen n'est pas un équipement.
 */
const CACHE_EVOQUE = new Map<string, RegExp>();

/** Un caractère littéral d'évocateur, échappé sans classe de caractères : les sigles du lexique n'en portent pas. */
const litteral = (m: string) => m.split("").map((c) => (/[a-z0-9]/.test(c) ? c : "\\" + c)).join("");

/**
 * Un mot suivi de `*` est déclaré comme radical : il accepte la suite du mot de sa famille, parce qu'une
 * question s'écrit « ont abandonné » alors que le dictionnaire s'écrit « abandon ». Seuls les mots marqués
 * y ont droit — la tolérance n'est jamais générale, pour qu'un radical court ne lise pas un mot d'une autre
 * famille (« cap » et « capacité » restent deux mesures différentes).
 */
const motEvoque = (m: string) => (m.endsWith("*") ? litteral(m.slice(0, -1)) + "[a-z]{0,5}" : litteral(m) + "e?s?");

const regexEvoque = (mot: string) => {
  let rx = CACHE_EVOQUE.get(mot);
  if (!rx) {
    const motif = mot
      .trim()
      .split(" ")
      .filter(Boolean)
      .map(motEvoque)
      .join(" +");
    rx = new RegExp("\\b" + motif + "\\b");
    CACHE_EVOQUE.set(mot, rx);
  }
  return rx;
};

export const evoque = (question: string, mots: readonly string[]) => mots.some((mot) => regexEvoque(mot).test(question));

/** Un indicateur par lequel un décideur peut le nommer, dans l'ordre où le lexique doit être testé. */
export function indicatorReconnu(question: string, f: Filtres): CodeIndicateur | null {
  // Du rang le plus bas au plus haut : un indicateur spécifique (« abandon ») doit être testé avant le
  // générique qui partage un mot avec lui (« combien d'élèves ont abandonné » n'est pas un effectif).
  const candidates = CODES.map((code) => ({ code, e: REGISTRE[code] })).sort((a, b) => a.e.priorite - b.e.priorite);
  for (const { code, e } of candidates) {
    if (e.rend.sorte !== "couche-statistique") continue;
    if (!evoque(question, e.evocateurs)) continue;
    if (e.garde && !e.garde(question, f)) continue;
    return code;
  }
  return null;
}

/** Les indicateurs qu'un décideur nomme mais que le registre ne sait pas calculer : à dire, pas à inventer. */
export interface EcartPerimetre {
  perimetre: PerimetreIndicateur;
  motifs: string[];
  ceQuiManque: string;
  ceQueNousSavons: string;
}

export const ECARTS_PERIMETRE: EcartPerimetre[] = [
  {
    perimetre: "eftp",
    motifs: ["bts", "cqp", "cap", "dt", "dtm", "cqm", "apprentissage", "chef d atelier", "metier", "artisan", "lycee technique", "cfpa", "insertion professionnelle", "diplome professionnel"],
    ceQuiManque: "aucun registre d'événements EFTP n'est encore alimenté : ni inscriptions en centre de formation, ni décisions de jury d'examen professionnel, ni sortants suivis. Le réseau (LTP, LTA, CFPA, CMTH, CFTH, INIFRCF, ADET) et l'échelle CQM → CAP → DT/DTM → bac technique → BTS → CQP → licence professionnelle sont connus et documentés, les chiffres non.",
    ceQueNousSavons: "les définitions publiées du dictionnaire couvrent le K-12 et le supérieur ; pour l'EFTP, la première donnée à enregistrer est la candidature à l'examen national professionnel, qui produirait immédiatement taux de présence et taux de réussite par métier.",
  },
  {
    perimetre: "superieur",
    motifs: ["concours", "voeu", "affectation", "insertion", "employabilite", "abandon etudiant", "frais de scolarite", "bourse", "diplome delivre par l etat"],
    ceQuiManque: "le registre du supérieur écrit les inscriptions, les validations d'UE et les décisions de jury ; il n'écrit pas encore le devenir des diplômés. Un taux d'insertion professionnelle exigerait une observation à un, trois et cinq ans après la soutenance, et aucune source béninoise lue ne la publie.",
    ceQueNousSavons: "les crédits ECTS acquis et le taux de capitalisation sont rendus par le service de scolarité, et les concours, filières et stages sont des objets du référentiel — consultables, pas encore mesurés.",
  },
];

/** Les examens nationaux de la couche statistique, pour la ventilation et les garde-fous du traducteur. */
export const EXAMENS_RENDES = EXAMENS_NATIONAUX_K12;

/**
 * L'indicateur que le lexique a désigné mais que sa garde a écarté, sans qu'aucun autre le remplace :
 * sa phrase `horsPortee` est la réponse honnête. Appelé par le traducteur seulement quand aucune
 * reconnaissance n'a abouti — sinon « combien d'élèves scolarisés », qui trouve un recalcul plus bas
 * dans le lexique, se verrait refuser.
 */
export function evocateurEcarte(question: string, f: Filtres): string | null {
  const candidates = CODES.map((code) => ({ code, e: REGISTRE[code] })).sort((a, b) => a.e.priorite - b.e.priorite);
  for (const { e } of candidates) {
    if (e.rend.sorte !== "couche-statistique") continue;
    if (!evoque(question, e.evocateurs)) continue;
    if (e.garde && !e.garde(question, f)) return e.horsPortee ?? null;
  }
  return null;
}
