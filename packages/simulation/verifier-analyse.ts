import type { FamilleQuestion, FigureAnalyse, Perimetre, ReponseAnalyse } from "@beile/contracts";
import { analyser } from "./src/analyse";
import { genererCoucheNationale } from "./src/macro";
import { calculer } from "./src/semantique";

/**
 * Vérification du moteur d'analyse : npm run verifier:analyse --workspace=@beile/simulation
 * Assertions, pas d'affichage seul : une famille mal reconnue, un chiffre non fini, une suggestion qui
 * échouerait, une réponse non déterministe ou un refus manqué font échouer le script (code 1).
 */
const c = genererCoucheNationale();
const NATIONAL: Perimetre = { niveau: "national" };
const BORGOU: Perimetre = { niveau: "departement", departementId: "borgou" };
let echecs = 0, controles = 0;
const verifier = (libelle: string, ok: boolean, detail = "") => { controles++; if (!ok) { echecs++; console.error(`✘ ${libelle}${detail ? ` — ${detail}` : ""}`); } };

const nombres = (f: FigureAnalyse): (number | null)[] =>
  f.type === "chiffre" ? [f.valeur, f.reference?.valeur ?? null]
  : f.type === "barres" ? [...f.barres.map((b) => b.valeur), f.reference?.valeur ?? null]
  : f.type === "courbes" ? f.series.flatMap((s) => s.points.map((p) => p.y))
  : f.type === "carte" ? Object.values(f.valeurs)
  : f.lignes.flatMap((l) => [l.a, l.b]);

const CAS: [string, FamilleQuestion, Perimetre][] = [
  ["Quel est le taux d'abandon dans le Zou ?", "niveau", NATIONAL],
  ["Taux de réussite au BEPC à Parakou", "niveau", NATIONAL],
  ["Comparer le taux d'abandon du Zou et des Collines", "comparaison", NATIONAL],
  ["Ratio d'apprenants par enseignant : Cotonou, Parakou et Natitingou", "comparaison", NATIONAL],
  ["Quels départements ont le taux d'abandon le plus élevé ?", "classement", NATIONAL],
  ["Les 5 communes avec le ratio d'apprenants par enseignant le plus faible", "classement", NATIONAL],
  ["Comment a évolué le taux de réussite au BEPC depuis 2021 ?", "evolution", NATIONAL],
  ["Évolution du taux d'absentéisme dans l'Alibori", "evolution", NATIONAL],
  ["Répartition des effectifs par niveau", "repartition", NATIONAL],
  ["Écart entre filles et garçons pour la proportion d'élèves ayant au moins 10/20 en mathématiques", "ecart", NATIONAL],
  ["Écart entre urbain et rural pour le taux d'abandon", "ecart", NATIONAL],
  ["Carte du taux d'occupation des salles par commune", "carte", NATIONAL],
  ["Quelles communes sont atypiques pour le taux d'abandon ?", "anomalies", NATIONAL],
  ["Projection des effectifs à l'horizon 2030", "projection", NATIONAL],
  ["Projection du taux de réussite au BEPC dans le Borgou en 2028", "projection", NATIONAL],
  ["Quelles communes ont le taux d'abandon le plus élevé ?", "classement", BORGOU],
  ["Taux d'abandon à Parakou", "niveau", BORGOU],
  ["Anomalies du taux d'absentéisme", "anomalies", BORGOU],
];

for (const [question, attendue, perimetre] of CAS) {
  const t0 = performance.now();
  const r = analyser(c, question, perimetre);
  const ms = performance.now() - t0;
  const etiquette = `« ${question} » (${perimetre.niveau})`;
  verifier(`${etiquette} : répondu`, r.statut === "repondu", r.statut === "refuse" ? r.explication : "");
  if (r.statut !== "repondu") continue;
  verifier(`${etiquette} : famille`, r.famille === attendue, `obtenu ${r.famille}, attendu ${attendue}`);
  verifier(`${etiquette} : constats`, r.constats.length > 0 && r.constats.every((x) => x.texte.length > 10 && !/NaN|undefined|Infinity/.test(x.texte)), JSON.stringify(r.constats));
  verifier(`${etiquette} : figures`, r.figures.length > 0);
  verifier(`${etiquette} : chiffres finis`, r.figures.every((f) => nombres(f).every((v) => v == null || Number.isFinite(v))));
  verifier(`${etiquette} : provenance`, r.resultats.length > 0 && r.resultats.every((x) => x.definition.code === r.resultats[0]!.definition.code));
  verifier(`${etiquette} : moins d'une seconde`, ms < 1000, `${Math.round(ms)} ms`);
  const bis = analyser(c, question, perimetre);
  verifier(`${etiquette} : déterministe`, JSON.stringify(bis) === JSON.stringify(r));
  // Chaque suggestion proposée doit elle-même aboutir.
  for (const s of r.suggestions) {
    const rs = analyser(c, s.question, perimetre);
    verifier(`${etiquette} : suggestion « ${s.question} »`, rs.statut === "repondu", rs.statut === "refuse" ? rs.explication : "");
  }
  console.log(`✔ ${r.famille.padEnd(12)} ${String(Math.round(ms)).padStart(4)} ms · ${r.titre}\n    ${r.constats.map((x) => `[${x.ton}] ${x.texte}`).join("\n    ")}`);
}

// Cohérence : la valeur affichée est celle du calculateur, au chiffre près.
const zou = analyser(c, "Quel est le taux d'abandon dans le Zou ?", NATIONAL);
const direct = calculer(c, { indicateur: "taux_abandon", filtres: { departementId: "zou" }, ventilation: [] }, NATIONAL).valeur;
verifier("Valeur affichée = calculateur", zou.statut === "repondu" && zou.figures[0]?.type === "chiffre" && zou.figures[0].valeur === direct);

// Classement : les barres suivent le sens demandé.
const cl = analyser(c, "Quels départements ont le taux d'abandon le plus faible ?", NATIONAL);
const barres = cl.statut === "repondu" ? cl.figures.find((f) => f.type === "barres") : undefined;
const vals = barres?.type === "barres" ? barres.barres.map((b) => b.valeur ?? Infinity) : [];
verifier("Classement croissant quand « le plus faible »", vals.length === 12 && vals.every((v, i) => i === 0 || v >= vals[i - 1]!), vals.join(","));

// Contrôles négatifs : ce qui doit être refusé l'est.
const refus: [string, Perimetre, string][] = [
  ["Montre-moi les notes de Aïcha ZANNOU", NATIONAL, "donnee_individuelle"],
  ["Quel est le taux d'abandon dans le Zou ?", BORGOU, "hors_perimetre"],
  ["Comparer le taux d'abandon de Parakou et de Cotonou", BORGOU, "hors_perimetre"],
  ["Quel est le prix du riz à Cotonou ?", NATIONAL, "indicateur_inconnu"],
  ["Taux d'abandon", { niveau: "etablissement", etablissementId: "X" }, "hors_perimetre"],
];
for (const [question, perimetre, motif] of refus) {
  const r = analyser(c, question, perimetre);
  verifier(`Refus attendu (${motif}) : « ${question} »`, r.statut === "refuse" && (r.motif === motif || (motif === "indicateur_inconnu" && r.motif === "question_ambigue")), r.statut === "refuse" ? r.motif : `répondu (${r.famille})`);
}

console.log(`\n${controles - echecs}/${controles} contrôles réussis`);
process.exit(echecs ? 1 : 0);
