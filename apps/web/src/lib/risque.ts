import type { EleveLigne } from "@/lib/api/etablissement";
import { nombre, note } from "@/lib/format";

/**
 * Score de risque de décrochage — 100 % local, déterministe et explicable.
 *
 * Chaque signal déjà présent dans la liste des apprenants contribue un nombre
 * de points visibles : aucune moyenne n'est cachée derrière un chiffre opaque.
 * Trois facteurs, dont les poids somment à 100 :
 *   · Insuffisance académique (moyenne générale)      — 40 pts
 *   · Absentéisme (cumul d'absences)                   — 40 pts
 *   · Tendance en mathématiques (pente de la baisse)   — 20 pts
 *
 * Le statut d'identité est administratif, pas un signal de décrochage : il est
 * volontairement exclu du score.
 */

export type NiveauRisque = "nominal" | "a_surveiller" | "urgent";
export type Sensibilite = "basse" | "normale" | "elevee";

export interface FacteurRisque {
  cle: string;
  libelle: string;
  /** Points attribués (0 → pointsMax). */
  points: number;
  /** Plafond du facteur, pour afficher « +18 / 40 ». */
  pointsMax: number;
  /** Valeur brute lisible, ex. « Moyenne 8,2/20 ». */
  detail: string;
}

export interface EvaluationRisque {
  score: number;
  niveau: NiveauRisque;
  facteurs: FacteurRisque[];
  /** Faux quand le signal est trop mince pour conclure (ni moyenne ni tendance). */
  fiable: boolean;
}

export const LIBELLE_NIVEAU: Record<NiveauRisque, string> = {
  nominal: "Nominal",
  a_surveiller: "À surveiller",
  urgent: "Urgent",
};

/** Décalage des seuils : « élevée » signale plus tôt, « basse » ne retient que l'évident. */
const FACTEUR_SEUIL: Record<Sensibilite, number> = { basse: 1.4, normale: 1, elevee: 0.7 };

const POIDS = { academique: 40, absence: 40, maths: 20 } as const;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Progression linéaire décroissante : 1 au point d'alerte max, 0 au point sans alerte. */
const rampe = (v: number, sansAlerte: number, alerteMax: number) =>
  clamp01((sansAlerte - v) / (sansAlerte - alerteMax));

// Repères pédagogiques : 12/20 = aucune alerte, 5/20 = alerte maximale ; 12 absences = saturation.
const MOYENNE_SANS_ALERTE = 12;
const MOYENNE_ALERTE_MAX = 5;
const ABSENCES_ALERTE_MAX = 12;
// Une perte de 8 points en maths sur la série = contribution maximale.
const BAISSE_MATHS_MAX = 8;

function niveauDu(score: number, sensibilite: Sensibilite): NiveauRisque {
  const s = FACTEUR_SEUIL[sensibilite];
  if (score >= 60 / s) return "urgent";
  if (score >= 35 / s) return "a_surveiller";
  return "nominal";
}

export function evaluerRisque(e: EleveLigne, sensibilite: Sensibilite = "normale"): EvaluationRisque {
  const pertes = e.baisseMaths && e.baisseMaths.length >= 2 ? Math.max(0, e.baisseMaths[0]! - e.baisseMaths[e.baisseMaths.length - 1]!) : 0;

  const academique: FacteurRisque = {
    cle: "academique",
    libelle: "Insuffisance académique",
    points: e.moyenne == null ? 0 : Math.round(rampe(e.moyenne, MOYENNE_SANS_ALERTE, MOYENNE_ALERTE_MAX) * POIDS.academique),
    pointsMax: POIDS.academique,
    detail: e.moyenne == null ? "Moyenne non encore établie" : `Moyenne ${note(e.moyenne)}`,
  };
  const absence: FacteurRisque = {
    cle: "absence",
    libelle: "Absentéisme",
    points: Math.round(rampe(e.absences, 0, ABSENCES_ALERTE_MAX) * POIDS.absence),
    pointsMax: POIDS.absence,
    detail: `${e.absences} absence${e.absences > 1 ? "s" : ""} cumulée${e.absences > 1 ? "s" : ""}`,
  };
  const maths: FacteurRisque = {
    cle: "maths",
    libelle: "Baisse en mathématiques",
    points: Math.round(clamp01(pertes / BAISSE_MATHS_MAX) * POIDS.maths),
    pointsMax: POIDS.maths,
    detail: e.baisseMaths ? `Maths ${e.baisseMaths.map((n) => nombre(n, 1)).join(" → ")}` : "Tendance maths stable",
  };

  const facteurs = [academique, absence, maths];
  const score = facteurs.reduce((s, f) => s + f.points, 0);
  return { score, niveau: niveauDu(score, sensibilite), facteurs, fiable: e.moyenne != null || !!e.baisseMaths };
}
