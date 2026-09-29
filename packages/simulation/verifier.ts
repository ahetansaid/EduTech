import { genererCoucheNationale } from "./src/macro";
import { genererMicroMonde } from "./src/micro";
import { calculer, couvertureRegistre, priorites } from "./src/semantique";
import type { CodeIndicateur } from "@beile/contracts";
import type { EntreeRegistre, Filtres } from "./src/registre";
import { CODES, REGISTRE, serviceRendant } from "./src/registre";
import { sha256 } from "./src/empreinte";
import { decider } from "./src/abac";
import { elevesEnBaisse, situationApprenant } from "./src/projections";
import { repondre, QUESTIONS_EXEMPLES } from "./src/ask";

// Vérification de cohérence du moteur de simulation : npm run verifier --workspace=@beile/simulation
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
/* ------------------------------------------------------------------ Cohérence du registre des calculateurs.
 * Le typage garantit déjà qu'un code publié a une entrée ; ce bloc vérifie ce qu'il ne peut pas garantir :
 * qu'un indicateur rende réellement une valeur avec ses paramètres par défaut, que deux indicateurs ne se
 * disputent pas le même mot du lexique, qu'une ventilation déclarée rende des lignes, et que le seuil de
 * publication soit honoré dans le résultat et pas seulement à l'affichage. Une promesse du dictionnaire non
 * tenue est un incident de donnée publique : elle fait échouer la vérification, elle ne se signale pas.
 */
const echecs: string[] = [];
const exiger = (cond: boolean, dit: string) => { if (!cond) echecs.push(dit); };

const filtresParDefaut = (e: EntreeRegistre): Filtres => {
  const f: Filtres = {};
  for (const p of e.parametres) {
    if (p === "seuil") f.seuil = 10;
    if (p === "matiere") f.matiere = "Mathématiques";
    if (p === "infrastructure") f.infrastructure = "eau";
  }
  return f;
};

const couverture = couvertureRegistre();
exiger(couverture.calculables + couverture.renduesParUnService === couverture.publiees, `${couverture.publiees} définitions publiées mais ${couverture.calculables + couverture.renduesParUnService} rendues : le dictionnaire promet un calcul absent`);

const motAppartient = new Map<string, CodeIndicateur>();
for (const code of CODES) {
  const e = REGISTRE[code];
  exiger(e.definition.code === code, `${code} : la définition portée par l'entrée n'est pas la sienne`);
  exiger(e.evocateurs.length > 0, `${code} : aucun évocateur, donc interrogeable par personne`);
  const paliers = e.definition.illustration.paliers;
  exiger(paliers.length > 0 && paliers[paliers.length - 1]!.max === null, `${code} : l'illustration ne couvre pas le haut de son échelle`);
  for (const mot of e.evocateurs) {
    const proprietaire = motAppartient.get(mot);
    // Deux calculateurs peuvent nommer le même mot (« moyenne » sert au seuil comme à la note moyenne)
    // seulement si l'un des deux porte une garde : sinon c'est l'ordre du tableau qui répondrait, et
    // deux questions identiques selon la position de l'entrée dans le registre rendraient deux chiffres.
    exiger(!proprietaire || proprietaire === code || !!REGISTRE[proprietaire].garde || !!e.garde, `${code} et ${proprietaire} se disputent l'évocateur « ${mot} » sans garde pour les départager`);
    motAppartient.set(mot, code);
  }
  if (e.rend.sorte === "service-metier") {
    exiger(!!serviceRendant(code), `${code} : rendu par un service qui n'est pas nommé — un refus silencieux n'est pas une définition`);
    continue;
  }
  const national = calculer(c, { indicateur: code, filtres: filtresParDefaut(e), ventilation: [] });
  exiger(national.valeur !== null && Number.isFinite(national.valeur), `${code} : aucune valeur rendue au niveau national avec ses paramètres par défaut`);
  if (e.definition.libelleDenominateur !== null && e.definition.unite !== "nombre") {
    exiger(national.denominateur > 0, `${code} : une valeur sort d'un dénominateur nul`);
  }
  for (const dim of e.definition.dimensions) {
    const lignes = calculer(c, { indicateur: code, filtres: filtresParDefaut(e), ventilation: [dim] }).lignes;
    exiger(lignes.length > 0, `${code} : la dimension publiée « ${dim} » ne rend aucune ligne`);
    exiger(lignes.every((l) => !l.masquee || l.valeur === null), `${code} : une cellule masquée rend pourtant une valeur`);
  }
}

const codesTouches = new Set<CodeIndicateur>();
for (const question of QUESTIONS_EXEMPLES) {
  const r = repondre(c, question, { niveau: "national" });
  if (r.statut === "repondu") { codesTouches.add(r.requete.indicateur); continue; }
  // Un refus est une réponse ; le refus générique, non : il dirait que le lexique a un trou non documenté.
  exiger(!r.explication.startsWith("Aucun indicateur du dictionnaire"), `question type sans calculateur désigné : ${question}`);
}
console.log(`registre ${couverture.publiees} définitions, ${codesTouches.size} indicateurs touchés par les ${QUESTIONS_EXEMPLES.length} questions types`);
exiger(codesTouches.size >= 20, `les questions types ne couvrent que ${codesTouches.size} calculateurs sur ${couverture.calculables} : le guide n'illustre plus le registre`);
console.log(echecs.length ? `ÉCHECS (${echecs.length}):\n- ${echecs.join("\n- ")}` : "registre coherent");
if (echecs.length) throw new Error(`${echecs.length} promesse(s) du registre des calculateurs non tenues`);

const qs = [...QUESTIONS_EXEMPLES, "Combien d'élèves de 12 à 15 ans ont abandonné dans les communes rurales de l'Atacora ?", "Quel est le taux de réussite au BEPC par département ?", "Quelle est la météo à Cotonou ?", "Taux d'occupation à Parakou", "Compare les filles et les garçons en français, moyenne ≥ 12/20 dans le Borgou"];
for (const q of qs) {
  for (const p of [{ niveau: "national" as const }, { niveau: "departement" as const, departementId: "borgou" }]) {
    const r = repondre(c, q, p);
    console.log(`[${p.niveau}] ${q.slice(0, 70)}\n   → ${r.statut === "repondu" ? `${r.resultat.valeur} (${r.resultat.definition.unite}) | ${r.interpretation} | ${r.resultat.lignes.slice(0, 4).map(l => l.libelle + "=" + l.valeur).join(", ")}` : `REFUS ${r.motif}: ${r.explication.slice(0, 110)}`}`);
  }
}
