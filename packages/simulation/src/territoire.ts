import type { Commune, Departement } from "@beile/contracts";
import departementsGeo from "./geo/departements.json";
import communesGeo from "./geo/communes.json";

/** Référentiel territorial : 12 départements, 77 communes (limites geoBoundaries). */

type GeoFeature<P> = { type: "Feature"; id: string; properties: P; geometry: GeoJSON.Geometry };
type DeptProps = { id: string; nom: string; chefLieu: string };
type CommuneProps = { id: string; nom: string; departementId: string; milieu: "urbain" | "rural"; cx: number; cy: number };

/**
 * d3-geo attend des anneaux extérieurs dans le sens horaire (convention sphérique), à l'inverse de
 * la RFC 7946 suivie par geoBoundaries. Sans réorientation, chaque polygone couvrirait le globe entier.
 */
function aireSignee(ring: number[][]) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j]![0]! - ring[i]![0]!) * (ring[j]![1]! + ring[i]![1]!);
  return a / 2; // < 0 : sens horaire (x = longitude, y = latitude, anneau parcouru de i-1 vers i)
}
function reorienter<T extends { features: { geometry: GeoJSON.Geometry }[] }>(fc: T): T {
  for (const f of fc.features) {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [];
    for (const poly of polys) poly.forEach((ring, k) => {
      const horaire = aireSignee(ring as number[][]) < 0;
      if ((k === 0 && !horaire) || (k > 0 && horaire)) ring.reverse();
    });
  }
  return fc;
}

export const DEPARTEMENTS_GEO = reorienter(departementsGeo as unknown as { type: "FeatureCollection"; features: GeoFeature<DeptProps>[] });
export const COMMUNES_GEO = reorienter(communesGeo as unknown as { type: "FeatureCollection"; features: GeoFeature<CommuneProps>[] });

export const DEPARTEMENTS: Departement[] = DEPARTEMENTS_GEO.features
  .map((f) => ({ id: f.properties.id, nom: f.properties.nom, chefLieu: f.properties.chefLieu }))
  .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

export const COMMUNES: (Commune & { cx: number; cy: number })[] = COMMUNES_GEO.features
  .map((f) => ({ ...f.properties }))
  .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

export const departementById = new Map(DEPARTEMENTS.map((d) => [d.id, d]));
export const communeById = new Map(COMMUNES.map((c) => [c.id, c]));

/**
 * Poids démographiques relatifs des départements (ordres de grandeur du recensement, arrondis).
 * Servent uniquement à répartir des effectifs fictifs de façon plausible.
 */
export const POIDS_DEPARTEMENT: Record<string, number> = {
  atlantique: 1.4,
  borgou: 1.21,
  oueme: 1.1,
  alibori: 0.87,
  zou: 0.85,
  atacora: 0.77,
  couffo: 0.75,
  collines: 0.72,
  littoral: 0.68,
  plateau: 0.62,
  donga: 0.54,
  mono: 0.5,
};

/**
 * Contexte éducatif relatif (1 = moyenne nationale). Le nord rural part d'un niveau plus bas,
 * ce qui produit les écarts territoriaux que le cockpit doit rendre visibles.
 */
export const CONTEXTE_DEPARTEMENT: Record<string, number> = {
  littoral: 1.18,
  oueme: 1.08,
  atlantique: 1.07,
  mono: 1.02,
  plateau: 0.98,
  zou: 1.0,
  couffo: 0.95,
  collines: 0.97,
  borgou: 0.9,
  donga: 0.88,
  atacora: 0.84,
  alibori: 0.78,
};

/** Test point-dans-polygone (géométries de communes). */
export function pointInGeometry(x: number, y: number, g: GeoJSON.Geometry): boolean {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  return polys.some((poly) => {
    const ring = poly[0];
    if (!ring) return false;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i] as number[];
      const [xj, yj] = ring[j] as number[];
      if ((yi! > y) !== (yj! > y) && x < ((xj! - xi!) * (y - yi!)) / (yj! - yi!) + xi!) inside = !inside;
    }
    return inside;
  });
}

export function bboxOf(g: GeoJSON.Geometry): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  for (const p of polys) for (const ring of p) for (const c of ring) {
    const [x, y] = c as number[];
    if (x! < minX) minX = x!;
    if (x! > maxX) maxX = x!;
    if (y! < minY) minY = y!;
    if (y! > maxY) maxY = y!;
  }
  return [minX, minY, maxX, maxY];
}

export const communeGeometry = new Map(COMMUNES_GEO.features.map((f) => [f.properties.id, f.geometry]));
