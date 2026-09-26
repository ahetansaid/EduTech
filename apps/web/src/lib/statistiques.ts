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
