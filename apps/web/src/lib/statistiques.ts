/**
 * Statistiques descriptives — fonctions pures, sans dépendance ni accès aux données.
 * Appeler ces fonctions sur des lignes *déjà* autorisées au rôle : elles ne créent aucun accès.
 * Le vocabulaire reste français et prudent : une moyenne masque une distribution, d'où médiane,
 * écart-type et répartition par bandes fournis côte à côte.
 */

export const moyenne = (xs: number[]): number | null =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

const triee = (xs: number[]) => [...xs].sort((a, b) => a - b);

/** Quantile par interpolation linéaire (rang « type 7 »). Attend un tableau trié croissant. */
export function quantile(tri: number[], p: number): number | null {
  const n = tri.length;
  if (!n) return null;
  if (n === 1) return tri[0]!;
  const idx = (n - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return tri[lo]! + (tri[hi]! - tri[lo]!) * (idx - lo);
}

export const mediane = (xs: number[]) => quantile(triee(xs), 0.5);

/** Écart-type (population) : dispersion des valeurs autour de leur moyenne ; null si moins de 2 valeurs. */
export function ecartType(xs: number[]): number | null {
  const m = moyenne(xs);
  if (xs.length < 2 || m == null) return null;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
}

export interface Bande { libelle: string; max?: number }

/**
 * Répartit des valeurs dans des bandes ordonnées par `max` croissant (bornes supérieures exclusives ;
 * la dernière bande est ouverte vers le haut). Renvoie l'effectif de chaque bande, dans l'ordre.
 */
export function repartir(xs: number[], bandes: Bande[]): number[] {
  const effectifs = new Array<number>(bandes.length).fill(0);
  for (const x of xs) {
    const i = bandes.findIndex((b) => b.max == null || x < b.max);
    effectifs[i === -1 ? bandes.length - 1 : i]++;
  }
  return effectifs;
}

/** Nombre et part de valeurs strictement inférieures à un seuil. */
export function sousSeuil(xs: number[], seuil: number): { k: number; taux: number | null } {
  const k = xs.reduce((a, x) => a + (x < seuil ? 1 : 0), 0);
  return { k, taux: xs.length ? k / xs.length : null };
}

/**
 * Coefficient de corrélation linéaire de Pearson entre deux séries appariées (r ∈ [-1, 1]).
 * null si moins de 3 paires ou si l'une des séries est constante (pas de liaison mesurable).
 * Ne mesure qu'un lien linéaire et N'IMPLIQUE AUCUNE causalité — à interpréter avec l'effectif.
 */
export function correlation(xs: readonly number[], ys: readonly number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = moyenne(xs.slice(0, n))!, my = moyenne(ys.slice(0, n))!;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx, dy = ys[i]! - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/** Drette des moindres carrés y = ordonnee + pente·x sur les paires appariées ; null si non calculable. */
export function droiteAjustee(xs: readonly number[], ys: readonly number[]): { pente: number; ordonnee: number } | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = moyenne(xs.slice(0, n))!, my = moyenne(ys.slice(0, n))!;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i]! - mx) * (ys[i]! - my); sxx += (xs[i]! - mx) ** 2; }
  if (sxx === 0) return null;
  const pente = sxy / sxx;
  return { pente, ordonnee: my - pente * mx };
}

/**
 * Asymétrie (coefficient de Pearson 2) : 3·(moyenne − médiane) / écart-type. Positif = queue tirée
 * vers les notes hautes (peu d'élèves très forts relèvent la moyenne) ; négatif = concentration en bas.
 * null si moins de 2 valeurs ou dispersion nulle.
 */
export function asymetrie(xs: number[]): number | null {
  const m = moyenne(xs), e = ecartType(xs), med = mediane(xs);
  if (m == null || e == null || med == null || e === 0) return null;
  return (3 * (m - med)) / e;
}

/**
 * Rang percentile d'une valeur `v` dans un jeu de valeurs `xs` : part de valeurs situées en dessous
 * (½ des égalités comprise), entre 0 et 1. Sert à dire « cet élément est au Nième percentile du groupe ».
 */
export function rangPercentile(xs: number[], v: number): number | null {
  if (!xs.length) return null;
  const inf = xs.reduce((a, x) => a + (x < v ? 1 : 0), 0);
  const egaux = xs.reduce((a, x) => a + (x === v ? 1 : 0), 0);
  return (inf + 0.5 * egaux) / xs.length;
}
