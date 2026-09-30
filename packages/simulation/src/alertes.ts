import type { AlerteTerritoriale, Perimetre, ReponseAlertes, RequeteSemantique } from "@beile/contracts";
import { formater, sensDe } from "./analyse";
import type { CouchesNationales } from "./macro";
import { ANNEES } from "./macro";
import { calculer, communesDuPerimetre } from "./semantique";
import { communeById, departementById } from "./territoire";

/**
 * Détection automatique des alertes territoriales : pour chaque indicateur qui a un sens de lecture, on
 * cherche les communes qui s'écartent nettement de leurs pairs (score robuste médiane / écart absolu
 * médian, qui ne se laisse pas masquer par les valeurs extrêmes qu'il doit trouver) et celles qui
 * décrochent d'une année sur l'autre. Seul le sens défavorable remonte : une commune nettement meilleure
 * que les autres n'est pas une alerte.
 *
 * Les communes sont toujours comparées à l'ensemble des communes du pays (une circonscription d'une
 * seule commune ou un département de huit ne font pas une référence solide) ; seules les alertes des
 * communes du périmètre de l'habilitation sont restituées. La médiane nationale est un agrégat.
 *
 * Déterministe, sans modèle de langage ; même cube, même périmètre, mêmes alertes.
 */

/** Indicateurs examinés : des taux et ratios qui se lisent (les volumes bruts et les indicateurs neutres en sont exclus). */
export const INDICATEURS_ALERTES = [
  "taux_abandon", "taux_absenteisme", "taux_reussite_examen", "taux_presence_examen", "moyenne_generale", "taux_seuil_moyenne",
  "dispersion_moyennes", "taux_surage", "ratio_apprenants_enseignant", "part_enseignants_qualifies", "taux_occupation",
  "ratio_apprenants_salle", "taux_scolarisation_brut", "taux_depot_donnees", "fraicheur_donnees",
] as const;

const SEUIL_ECART = 2.5;
const SEUIL_RUPTURE = 3;
const SEUIL_CRITIQUE = 4;

const mediane = (xs: number[]) => {
  const t = [...xs].sort((a, b) => a - b), m = Math.floor(t.length / 2);
  return t.length ? (t.length % 2 ? t[m]! : (t[m - 1]! + t[m]!) / 2) : NaN;
};
/** Scores robustes (0,6745 · (x − médiane) / MAD) ; MAD nulle → aucun score (toutes les valeurs sont égales). */
function scores(valeurs: number[]): { med: number; z: (x: number) => number | null } {
  const med = mediane(valeurs);
  const mad = mediane(valeurs.map((x) => Math.abs(x - med)));
  return { med, z: (x) => (mad > 0 ? (0.6745 * (x - med)) / mad : null) };
}
/**
 * Ampleur minimale d'un écart pour être une alerte, par unité : un score statistique seul signale aussi des
 * différences insignifiantes quand les communes se ressemblent (dispersion minuscule). Un décideur ne doit
 * voir que ce qui a une portée concrète.
 */
const AMPLEUR_MIN: Record<string, { ecart: number; rupture: number }> = {
  pourcentage: { ecart: 2, rupture: 1.5 }, note: { ecart: 1, rupture: 0.5 }, ratio: { ecart: 5, rupture: 2 },
  jours: { ecart: 7, rupture: 5 }, indice: { ecart: 0.05, rupture: 0.03 }, nombre: { ecart: Infinity, rupture: Infinity },
};
const ecartLisible = (a: number, b: number, unite: string) => {
  const d = Math.abs(a - b);
  const x = d.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  return unite === "pourcentage" || unite === "note" ? `${x} point${d >= 2 ? "s" : ""}` : unite === "jours" ? `${x} jour${d >= 2 ? "s" : ""}` : unite === "ratio" ? `${x} élève${d >= 2 ? "s" : ""}` : x;
};

export function detecterAlertes(couches: CouchesNationales, perimetre: Perimetre): ReponseAlertes {
  const alertes: AlerteTerritoriale[] = [];
  const communesVues = new Set<string>();
  let examines = 0;
  const [an1, an2] = [ANNEES[ANNEES.length - 2]!, ANNEES[ANNEES.length - 1]!];

  for (const code of INDICATEURS_ALERTES) {
    const requete = (ventilation: RequeteSemantique["ventilation"]): RequeteSemantique => ({ indicateur: code as RequeteSemantique["indicateur"], filtres: {}, ventilation });
    let r;
    try { r = calculer(couches, requete(["commune"]), null); } catch { continue; }
    const def = r.definition;
    if (!def.dimensions.includes("commune")) continue;
    const sens = sensDe(def);
    if (sens === 0) continue;
    const lignes = r.lignes.filter((l) => !l.masquee && l.valeur != null) as (typeof r.lignes[number] & { valeur: number })[];
    if (lignes.length < 5) continue;
    examines++;
    const unite = def.unite as string;
    const f = (v: number) => formater(v, unite as never);
    const nomCourt = def.nom.charAt(0).toLowerCase() + def.nom.slice(1);
    const min = AMPLEUR_MIN[unite] ?? { ecart: Infinity, rupture: Infinity };

    // 1. Écart aux pairs : la commune est nettement du mauvais côté de la médiane.
    const s = scores(lignes.map((l) => l.valeur));
    for (const l of lignes) {
      communesVues.add(l.cle);
      const z = s.z(l.valeur);
      // Du mauvais côté de la médiane, nettement (score) et concrètement (ampleur).
      if (z == null || z * sens > -SEUIL_ECART || Math.abs(l.valeur - s.med) < min.ecart) continue;
      const c = communeById.get(l.cle);
      alertes.push({
        id: `${code}|${l.cle}|ecart`, code, indicateur: def.nom, unite, type: "ecart",
        communeId: l.cle, commune: c?.nom ?? l.libelle, departementId: c?.departementId ?? "", departement: departementById.get(c?.departementId ?? "")?.nom ?? "",
        valeur: l.valeur, reference: s.med, libelleReference: "médiane nationale des communes", score: Math.abs(z),
        gravite: Math.abs(z) >= SEUIL_CRITIQUE ? "critique" : "attention",
        texte: `${def.nom} : ${f(l.valeur)}, contre ${f(s.med)} pour la commune médiane du pays (${ecartLisible(l.valeur, s.med, unite)} d'écart).`,
        question: `Évolution depuis 2021 : ${nomCourt} — ${c?.nom ?? l.libelle}`,
      });
    }

    // 2. Rupture d'une année sur l'autre, rapportée à la variation typique des communes.
    if (!def.dimensions.includes("annee")) continue;
    let r2;
    try { r2 = calculer(couches, requete(["commune", "annee"]), null); } catch { continue; }
    const par = new Map<string, { a?: number; b?: number; libelle: string }>();
    for (const l of r2.lignes) {
      if (l.masquee || l.valeur == null) continue;
      const [cid, an] = l.cle.split("¦") as [string, string];
      const e = par.get(cid) ?? { libelle: l.libelle.split(" · ")[0] ?? cid };
      if (an === an1) e.a = l.valeur;
      if (an === an2) e.b = l.valeur;
      par.set(cid, e);
    }
    const deltas = [...par.entries()].filter(([, e]) => e.a != null && e.b != null).map(([cid, e]) => ({ cid, a: e.a!, b: e.b!, d: e.b! - e.a!, libelle: e.libelle }));
    if (deltas.length < 5) continue;
    const sd = scores(deltas.map((x) => x.d));
    for (const x of deltas) {
      const z = sd.z(x.d);
      // Une vraie dégradation (la valeur a empiré, d'une ampleur concrète), hors norme par rapport aux autres communes.
      if (z == null || z * sens > -SEUIL_RUPTURE || x.d * sens >= 0 || Math.abs(x.d) < min.rupture) continue;
      const c = communeById.get(x.cid);
      alertes.push({
        id: `${code}|${x.cid}|rupture`, code, indicateur: def.nom, unite, type: "rupture",
        communeId: x.cid, commune: c?.nom ?? x.libelle, departementId: c?.departementId ?? "", departement: departementById.get(c?.departementId ?? "")?.nom ?? "",
        valeur: x.b, reference: x.a, libelleReference: an1, score: Math.abs(z),
        gravite: Math.abs(z) >= SEUIL_CRITIQUE + 1 ? "critique" : "attention",
        texte: `${def.nom} : ${f(x.a)} → ${f(x.b)} en un an (${an1} → ${an2}) : une dégradation de ${ecartLisible(x.b, x.a, unite)}, hors norme.`,
        question: `Évolution depuis 2021 : ${nomCourt} — ${c?.nom ?? x.libelle}`,
      });
    }
  }

  alertes.sort((a, b) => (a.gravite === b.gravite ? b.score - a.score : a.gravite === "critique" ? -1 : 1));
  const autorisees = communesDuPerimetre(perimetre);
  const restituees = autorisees ? alertes.filter((a) => autorisees.has(a.communeId)) : alertes;
  return {
    perimetre: perimetre.niveau === "departement" ? (departementById.get(perimetre.departementId)?.nom ?? "Département") : perimetre.niveau === "circonscription" ? perimetre.circonscription : "Bénin",
    indicateursExamines: examines,
    communesExaminees: autorisees ? autorisees.size : communesVues.size,
    alertes: restituees,
  };
}
