import { genererCoucheNationale } from "../src/lib/sim/macro";
import { genererMicroMonde } from "../src/lib/sim/micro";
import { calculer, priorites } from "../src/lib/sim/semantique";
import { sha256 } from "../src/lib/sim/empreinte";
import { decider } from "../src/lib/sim/abac";
import { elevesEnBaisse, situationApprenant } from "../src/lib/sim/projections";
import { repondre, QUESTIONS_EXEMPLES } from "../src/lib/sim/ask";

// Vérification de cohérence du moteur de simulation : npm run verif:sim --workspace=@beile/web
const t0 = Date.now();
const c = genererCoucheNationale();
const t1 = Date.now();
const m = genererMicroMonde();
const t2 = Date.now();
console.log("gen macro ms", t1 - t0, "micro ms", t2 - t1, "etabs", c.etablissements.length, "evts", m.evenements.length, "apprenants", m.apprenants.length);
console.log("sha", sha256("abc") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
const eff = calculer(c, { indicateur: "effectif_apprenants", filtres: {}, ventilation: [] });
console.log("effectif", eff.valeur, "conf", eff.confiance, eff.couverture);
const q = calculer(c, { indicateur: "taux_seuil_moyenne", filtres: { ageMin: 11, ageMax: 13, matiere: "Mathématiques", seuil: 15 }, ventilation: ["sexe"] });
console.log("maths>=15 11-13", q.valeur, q.numerateur, q.denominateur, q.lignes.map(l => l.libelle + " " + l.valeur));
const serie = calculer(c, { indicateur: "taux_seuil_moyenne", filtres: { matiere: "Mathématiques", seuil: 15 }, ventilation: ["annee"] });
console.log(serie.lignes.map(l => l.libelle + " " + l.valeur).join(" | "));
const dep = calculer(c, { indicateur: "taux_seuil_moyenne", filtres: { matiere: "Mathématiques", seuil: 15 }, ventilation: ["departement"] });
console.log(dep.lignes.map(l => l.libelle + " " + l.valeur).join(" | "));
for (const ind of ["ratio_apprenants_enseignant","taux_occupation","taux_absenteisme","taux_abandon","taux_reussite_examen"] as const) console.log(ind, calculer(c, { indicateur: ind, filtres: {}, ventilation: [] }).valeur);
const p = priorites(c); const cnt: Record<string, number> = {}; for (const v of p.values()) cnt[v.niveau] = (cnt[v.niveau] ?? 0) + 1; console.log("priorites", cnt, [...p.entries()].filter(([, v]) => v.niveau === "critique").map(([k]) => k));
const ens = m.profils.find(x => x.id === "p-enseignant")!;
const aicha = m.apprenants.find(a => a.prenoms === "Aïcha")!;
const zoul = m.apprenants.find(a => a.prenoms === "Zoulfath")!;
const autre3e = m.apprenants.find(a => situationApprenant(m, m.evenements, a.id).classe?.niveau === "3e")!;
const ctx = { monde: m, evenements: m.evenements };
console.log("ens->aicha eval", decider(ens, { ressource: { type: "dossier_apprenant", apprenantId: aicha.id }, finalite: "evaluation" }, ctx).motif);
console.log("ens->zoul famille", decider(ens, { ressource: { type: "dossier_apprenant", apprenantId: zoul.id }, finalite: "suivi_familial" }, ctx).motif);
console.log("ens->zoul eval", decider(ens, { ressource: { type: "dossier_apprenant", apprenantId: zoul.id }, finalite: "evaluation" }, ctx).motif);
console.log("ens->3e", decider(ens, { ressource: { type: "dossier_apprenant", apprenantId: autre3e.id }, finalite: "evaluation" }, ctx).motif);
console.log("aicha situation", situationApprenant(m, m.evenements, aicha.id).classe?.libelle, situationApprenant(m, m.evenements, aicha.id).etablissementId);
const ron = new Set(m.apprenants.filter(a => situationApprenant(m, m.evenements, a.id).etablissementId === "ETB-PAR-PILOTE-CEG").map(a => a.id));
console.log("roniers", ron.size, "en baisse", elevesEnBaisse(m.evenements, ron).length, m.etablissements.map(e => e.nom + ":" + e.effectif));
console.log("certs", m.certificats.length, m.certificats.filter(x=>x.revoque).length);
const qs = [...QUESTIONS_EXEMPLES, "Combien d'élèves de 12 à 15 ans ont abandonné dans les communes rurales de l'Atacora ?", "Quel est le taux de réussite au BEPC par département ?", "Quelle est la météo à Cotonou ?", "Taux d'occupation à Parakou", "Compare les filles et les garçons en français, moyenne ≥ 12/20 dans le Borgou"];
for (const q of qs) {
  for (const p of [{ niveau: "national" as const }, { niveau: "departement" as const, departementId: "borgou" }]) {
    const r = repondre(c, q, p);
    console.log(`[${p.niveau}] ${q.slice(0, 70)}\n   → ${r.statut === "repondu" ? `${r.resultat.valeur} (${r.resultat.definition.unite}) | ${r.interpretation} | ${r.resultat.lignes.slice(0, 4).map(l => l.libelle + "=" + l.valeur).join(", ")}` : `REFUS ${r.motif}: ${r.explication.slice(0, 110)}`}`);
  }
}
