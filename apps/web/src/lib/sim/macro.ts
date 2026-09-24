import type { Cycle, Etablissement, Niveau, StatutEtablissement } from "@beile/contracts";
import { NIVEAUX } from "@beile/contracts";
import { clamp, createRng, hashString } from "./rng";
import {
  bboxOf,
  COMMUNES,
  communeGeometry,
  CONTEXTE_DEPARTEMENT,
  pointInGeometry,
  POIDS_DEPARTEMENT,
} from "./territoire";

/**
 * Couche statistique nationale simulée.
 *
 * Le navigateur ne peut pas porter 3 millions d'apprenants individuels : le niveau national est
 * donc un « cube » agrégé (commune × année × sexe × niveau), cohérent par construction avec les
 * établissements générés. Le niveau individuel existe pour les établissements pilotes (micro.ts)
 * et leurs événements alimentent en direct ce cube.
 */

export const ANNEES = ["2021-2022", "2022-2023", "2023-2024", "2024-2025", "2025-2026"] as const;
export type Annee = (typeof ANNEES)[number];
export const ANNEE_COURANTE: Annee = "2025-2026";

export const MATIERES_SUIVIES = ["Mathématiques", "Français"] as const;
export type MatiereSuivie = (typeof MATIERES_SUIVIES)[number];

/** Âge théorique d'entrée dans chaque niveau. */
export const AGE_THEORIQUE: Record<Niveau, number> = {
  CI: 6, CP: 7, CE1: 8, CE2: 9, CM1: 10, CM2: 11,
  "6e": 12, "5e": 13, "4e": 14, "3e": 15, "2nde": 16, "1re": 17, Tle: 18,
};
/** Retard scolaire : part des élèves ayant 0, 1, 2 ou 3 ans de plus que l'âge théorique. */
export const RETARD = [0.55, 0.25, 0.13, 0.07] as const;

export const cycleDuNiveau = (n: Niveau): Cycle =>
  (["CI", "CP", "CE1", "CE2", "CM1", "CM2"] as Niveau[]).includes(n) ? "primaire" : "secondaire";

/** Poids relatifs des niveaux (déperdition le long du cursus). */
const POIDS_NIVEAU: Record<Niveau, number> = {
  CI: 1.18, CP: 1.1, CE1: 1.05, CE2: 1.0, CM1: 0.95, CM2: 0.92,
  "6e": 0.62, "5e": 0.56, "4e": 0.5, "3e": 0.46, "2nde": 0.3, "1re": 0.26, Tle: 0.23,
};

export interface CelluleNiveau {
  effectifF: number;
  effectifM: number;
  /** Moyenne et écart-type par matière et par sexe (distribution normale bornée 0–20). */
  notes: Record<MatiereSuivie, { F: { moy: number; et: number }; M: { moy: number; et: number } }>;
}

export interface StatCommuneAnnee {
  niveaux: Record<Niveau, CelluleNiveau>;
  capacite: number;
  enseignants: number;
  enseignantsQualifies: number;
  tauxAbsenteisme: number;
  tauxAbandon: number;
  populationScolarisable: number;
  /** Part des établissements ayant transmis leurs données (couverture). */
  couverture: number;
  fraicheurJours: number;
}

export interface ResultatExamen {
  inscrits: number;
  presents: number;
  admis: number;
}

export interface CommuneStats {
  communeId: string;
  departementId: string;
  milieu: "urbain" | "rural";
  annees: Record<Annee, StatCommuneAnnee>;
  examens: Record<Annee, Record<"CEP" | "BEPC" | "BAC", ResultatExamen>>;
  projection2030: number;
  distanceMoyenneKm: number;
}

export interface EtablissementGenere extends Etablissement {
  effectif: number;
  enseignants: number;
  indicePerformance: number;
  transmis: boolean;
}

/** Fonction de répartition de la loi normale (approximation d'Abramowitz-Stegun). */
export function normalCdf(x: number, moy: number, et: number): number {
  const z = (x - moy) / (et * Math.SQRT2);
  const t = 1 / (1 + 0.3275911 * Math.abs(z));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + (z >= 0 ? y : -y));
}
/** Part des notes ≥ seuil. */
export const partAuDessus = (seuil: number, moy: number, et: number) => 1 - normalCdf(seuil, moy, et);

const FORTE_CROISSANCE = new Set(["abomey-calavi", "parakou", "seme-podji", "ouidah", "allada", "tchaourou", "malanville"]);

const PREFIXES_PRIMAIRE = ["EPP", "EPP", "EPP", "EP", "EPP"];
const PREFIXES_SECONDAIRE = ["CEG", "CEG", "CEG", "Lycée", "Complexe scolaire"];
const QUARTIERS = [
  "Centre", "Zongo", "Gare", "Marché", "Plateau", "Château d'eau", "Les Palmiers", "Les Manguiers",
  "Carrefour", "Nord", "Sud", "Est", "Ouest", "Hôpital", "Stade", "Mission", "Rails", "Lagune",
  "Colline", "Aéroport", "Village", "Kpota", "Houéto", "Agbokou", "Wénou", "Gbégamey", "Sokounon",
];

export interface CouchesNationales {
  communes: Map<string, CommuneStats>;
  etablissements: EtablissementGenere[];
  etablissementsParCommune: Map<string, EtablissementGenere[]>;
}

export function genererCoucheNationale(graine = 2026): CouchesNationales {
  const communes = new Map<string, CommuneStats>();
  const etablissements: EtablissementGenere[] = [];
  const etablissementsParCommune = new Map<string, EtablissementGenere[]>();

  const nbCommunesParDept = new Map<string, number>();
  for (const c of COMMUNES) nbCommunesParDept.set(c.departementId, (nbCommunesParDept.get(c.departementId) ?? 0) + 1);

  // Effectif total cible, année courante : ~3,4 millions d'apprenants du CI à la Terminale.
  const totalPoids = COMMUNES.reduce((s, c) => {
    const w = (POIDS_DEPARTEMENT[c.departementId] ?? 1) / (nbCommunesParDept.get(c.departementId) ?? 1);
    return s + w * (c.milieu === "urbain" ? 1.8 : 1) * (c.id === "cotonou" ? 2.2 : 1);
  }, 0);
  const EFFECTIF_NATIONAL = 3_400_000;
  const sommePoidsNiveau = NIVEAUX.reduce((s, n) => s + POIDS_NIVEAU[n], 0);

  for (const c of COMMUNES) {
    const r = createRng(hashString(c.id) ^ graine);
    const ctx = (CONTEXTE_DEPARTEMENT[c.departementId] ?? 1) * (c.milieu === "urbain" ? 1.05 : 0.98) * r.float(0.95, 1.05);
    const poids =
      ((POIDS_DEPARTEMENT[c.departementId] ?? 1) / (nbCommunesParDept.get(c.departementId) ?? 1)) *
      (c.milieu === "urbain" ? 1.8 : 1) * (c.id === "cotonou" ? 2.2 : 1) * r.float(0.75, 1.25);
    const effectifCourant = (EFFECTIF_NATIONAL * poids) / totalPoids;
    const croissance = FORTE_CROISSANCE.has(c.id) ? r.float(0.055, 0.075) : r.float(0.012, 0.032);
    const croissanceCapacite = FORTE_CROISSANCE.has(c.id) ? r.float(0.01, 0.02) : croissance * r.float(0.8, 1.1);
    const tauxScolarisation = clamp(0.62 + (ctx - 0.78) * 0.9 + r.float(-0.04, 0.04), 0.55, 0.98);
    const ratioCible = clamp(58 - (ctx - 0.78) * 55 + r.float(-4, 4), 32, 68);
    const occupationCourante = FORTE_CROISSANCE.has(c.id) ? r.float(1.18, 1.32) : r.float(0.82, 1.06);

    const annees = {} as Record<Annee, StatCommuneAnnee>;
    const examens = {} as CommuneStats["examens"];
    ANNEES.forEach((annee, i) => {
      const recul = ANNEES.length - 1 - i;
      const facteurEffectif = Math.pow(1 + croissance, -recul);
      const effectifAnnee = effectifCourant * facteurEffectif;
      const niveaux = {} as Record<Niveau, CelluleNiveau>;
      for (const n of NIVEAUX) {
        const eff = (effectifAnnee * POIDS_NIVEAU[n]) / sommePoidsNiveau;
        // Parité : légèrement défavorable aux filles au secondaire rural, en amélioration.
        const partF = clamp(0.495 - (cycleDuNiveau(n) === "secondaire" ? (1.05 - ctx) * 0.12 : 0) + i * 0.004, 0.4, 0.51);
        const progres = i * 0.16; // amélioration régulière des résultats depuis 2021-2022
        const baseMaths = 10.9 + (ctx - 1) * 6.5 + progres + r.float(-0.25, 0.25);
        const baseFr = 11.2 + (ctx - 1) * 5.5 + progres * 0.7 + r.float(-0.25, 0.25);
        niveaux[n] = {
          effectifF: Math.round(eff * partF),
          effectifM: Math.round(eff * (1 - partF)),
          notes: {
            Mathématiques: { F: { moy: baseMaths + 0.28, et: 3.4 }, M: { moy: baseMaths - 0.22, et: 3.5 } },
            Français: { F: { moy: baseFr + 0.45, et: 3.1 }, M: { moy: baseFr - 0.3, et: 3.2 } },
          },
        };
      }
      const occupation = occupationCourante * Math.pow((1 + croissance) / (1 + croissanceCapacite), -recul);
      const enseignants = Math.round(effectifAnnee / (ratioCible * Math.pow(1.004, recul)));
      annees[annee] = {
        niveaux,
        capacite: Math.round(effectifAnnee / occupation),
        enseignants,
        enseignantsQualifies: Math.round(enseignants * clamp(0.55 + (ctx - 0.78) * 0.8 + i * 0.02, 0.45, 0.95)),
        tauxAbsenteisme: clamp(0.13 - (ctx - 0.78) * 0.16 - i * 0.004 + r.float(-0.012, 0.012), 0.025, 0.18),
        tauxAbandon: clamp(0.085 - (ctx - 0.78) * 0.12 - i * 0.003 + r.float(-0.01, 0.01), 0.01, 0.12),
        populationScolarisable: Math.round(effectifAnnee / (tauxScolarisation - recul * 0.008)),
        couverture: i < ANNEES.length - 1 ? 1 : clamp(r.float(0.84, 1.0) - (c.departementId === "alibori" ? 0.2 : 0), 0.62, 1),
        fraicheurJours: i < ANNEES.length - 1 ? 0 : r.int(0, 9) + (c.departementId === "alibori" ? 12 : 0),
      };
      const effPrim = (effectifAnnee * POIDS_NIVEAU.CM2) / sommePoidsNiveau;
      const eff3e = (effectifAnnee * POIDS_NIVEAU["3e"]) / sommePoidsNiveau;
      const effTle = (effectifAnnee * POIDS_NIVEAU.Tle) / sommePoidsNiveau;
      const exam = (inscrits: number, base: number) => {
        const presents = Math.round(inscrits * r.float(0.95, 0.99));
        return { inscrits: Math.round(inscrits), presents, admis: Math.round(presents * clamp(base + (ctx - 1) * 0.6 + i * 0.012 + r.float(-0.03, 0.03), 0.2, 0.98)) };
      };
      examens[annee] = { CEP: exam(effPrim, 0.84), BEPC: exam(eff3e, 0.58), BAC: exam(effTle, 0.49) };
    });

    const courant = annees[ANNEE_COURANTE];
    communes.set(c.id, {
      communeId: c.id,
      departementId: c.departementId,
      milieu: c.milieu,
      annees,
      examens,
      projection2030: Math.round(courant.populationScolarisable * Math.pow(1 + croissance * 0.9, 4)),
      distanceMoyenneKm: Number((c.milieu === "urbain" ? r.float(0.6, 1.4) : r.float(1.8, 5.2) / ctx).toFixed(1)),
    });

    // Établissements : effectif courant réparti, coordonnées tirées à l'intérieur de la commune.
    const geom = communeGeometry.get(c.id);
    const bbox = geom ? bboxOf(geom) : [c.cx - 0.05, c.cy - 0.05, c.cx + 0.05, c.cy + 0.05];
    const tirerPoint = () => {
      for (let k = 0; k < 40; k++) {
        const x = r.float(bbox[0], bbox[2]);
        const y = r.float(bbox[1], bbox[3]);
        if (!geom || pointInGeometry(x, y, geom)) return [x, y] as const;
      }
      return [c.cx, c.cy] as const;
    };
    const effPrimaire = NIVEAUX.filter((n) => cycleDuNiveau(n) === "primaire").reduce((s, n) => s + courant.niveaux[n].effectifF + courant.niveaux[n].effectifM, 0);
    const effSecondaire = NIVEAUX.filter((n) => cycleDuNiveau(n) === "secondaire").reduce((s, n) => s + courant.niveaux[n].effectifF + courant.niveaux[n].effectifM, 0);
    const occupationCommune = (effPrimaire + effSecondaire) / courant.capacite;
    const liste: EtablissementGenere[] = [];
    const creer = (cycle: Cycle, total: number, tailleMoy: number) => {
      const nb = Math.max(1, Math.round(total / tailleMoy));
      const parts = Array.from({ length: nb }, () => r.float(0.5, 1.5));
      const somme = parts.reduce((s, p) => s + p, 0);
      parts.forEach((p, k) => {
        const effectif = Math.max(40, Math.round((total * p) / somme));
        const [lng, lat] = tirerPoint();
        const statut: StatutEtablissement = r.weighted(["public", "prive", "confessionnel"] as const, c.milieu === "urbain" ? [0.62, 0.3, 0.08] : [0.84, 0.1, 0.06]);
        const prefixe = cycle === "primaire" ? r.pick(PREFIXES_PRIMAIRE) : r.pick(PREFIXES_SECONDAIRE);
        const quartier = QUARTIERS[(k + hashString(c.id)) % QUARTIERS.length];
        const occupationEtab = clamp(occupationCommune * r.float(0.85, 1.15), 0.5, 1.7);
        const capacite = Math.round(effectif / occupationEtab);
        const e: EtablissementGenere = {
          id: `ETB-${c.id.slice(0, 3).toUpperCase()}-${cycle === "primaire" ? "P" : "S"}${String(k + 1).padStart(3, "0")}`,
          nom: `${prefixe} ${c.nom}${nb > 1 ? ` ${quartier}` : ""}${nb > QUARTIERS.length ? ` ${Math.floor(k / QUARTIERS.length) + 1}` : ""}`,
          cycle,
          statut,
          communeId: c.id,
          circonscription: `CS ${c.nom}`,
          lat: Number(lat.toFixed(4)),
          lng: Number(lng.toFixed(4)),
          capacite,
          sallesDeClasse: Math.max(2, Math.round(capacite / 50)),
          infrastructures: {
            eau: r.bool(clamp(0.45 + (ctx - 0.78) * 1.2, 0.3, 0.97)),
            electricite: r.bool(clamp(0.35 + (ctx - 0.78) * 1.4 + (c.milieu === "urbain" ? 0.2 : 0), 0.2, 0.98)),
            internet: r.bool(clamp(0.08 + (ctx - 0.78) * 0.9 + (c.milieu === "urbain" ? 0.25 : 0), 0.03, 0.85)),
            latrines: r.bool(clamp(0.6 + (ctx - 0.78) * 0.9, 0.4, 0.98)),
            bibliotheque: r.bool(cycle === "secondaire" ? 0.45 : 0.15),
          },
          effectif,
          enseignants: Math.max(2, Math.round(effectif / (ratioCible * r.float(0.85, 1.15)))),
          indicePerformance: Number(clamp(ctx * r.float(0.88, 1.12), 0.6, 1.4).toFixed(2)),
          transmis: r.bool(courant.couverture),
        };
        liste.push(e);
      });
    };
    creer("primaire", effPrimaire, 230);
    creer("secondaire", effSecondaire, 520);
    etablissementsParCommune.set(c.id, liste);
    etablissements.push(...liste);
  }

  return { communes, etablissements, etablissementsParCommune };
}
