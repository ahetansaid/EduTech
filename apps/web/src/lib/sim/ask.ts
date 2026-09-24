import type { CodeIndicateur, Dimension, Niveau, Perimetre, ReponseAsk, RequeteSemantique } from "@beile/contracts";
import { DIMENSION_LIBELLE, NIVEAUX, RequeteSemantique as SchemaRequete } from "@beile/contracts";
import type { CouchesNationales } from "./macro";
import { PRENOMS_F, PRENOMS_M } from "./noms";
import { calculer, communesDuPerimetre, DICTIONNAIRE } from "./semantique";
import { COMMUNES, DEPARTEMENTS, departementById } from "./territoire";

/**
 * Ask Education — traduction d'une question en requête sémantique.
 *
 * Dans le prototype, la traduction est faite par un analyseur déterministe (règles du français
 * administratif). En production, la même interface est implémentée par un modèle de langage
 * contraint à produire ce schéma JSON. Dans les deux cas : le traducteur ne produit JAMAIS un
 * chiffre, seulement une requête ; le schéma est validé ; les droits sont vérifiés ; le moteur calcule.
 */

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, " ");

const PRENOMS = new Set([...PRENOMS_F, ...PRENOMS_M].map(norm));

export interface Traduction {
  requete: RequeteSemantique | null;
  interpretation: string[];
  refus?: { motif: "indicateur_inconnu" | "question_ambigue" | "donnee_individuelle"; explication: string };
}

export function traduire(question: string): Traduction {
  const q = ` ${norm(question)} `;
  const interpretation: string[] = [];

  // 1. Garde-fou : aucune donnée individuelle par la requête statistique.
  const mots = question.split(/[\s,?.!;:]+/);
  const nomPropre = mots.find((m, i) => i > 0 && PRENOMS.has(norm(m)) && /^[A-ZÀ-Ý]/.test(m));
  if (nomPropre || /\b(notes?|dossier|bulletin|absences?) (de|du|d) (l eleve|l apprenant|[a-z]+ [a-z]+)\b/.test(q) && /\b(de|d) [A-ZÀ-Ý]/.test(question)) {
    return {
      requete: null, interpretation,
      refus: { motif: "donnee_individuelle", explication: `La question vise une personne${nomPropre ? ` (« ${nomPropre} »)` : ""}. Ask Education ne restitue que des données agrégées. Un dossier individuel ne s'ouvre que dans l'espace métier, par un utilisateur ayant une relation avec l'apprenant, et l'accès est journalisé.` },
    };
  }

  // 2. Indicateur.
  let indicateur: CodeIndicateur | null = null;
  let seuil: number | undefined;
  const mSeuil = q.match(/(?:>=|≥|superieure? ou egale? a|superieure? a|au moins|plus de|d au moins)\s*(\d{1,2}(?:[.,]\d+)?)|(\d{1,2}(?:[.,]\d+)?)\s*\/\s*20/);
  if (mSeuil) seuil = Number((mSeuil[1] ?? mSeuil[2])!.replace(",", "."));
  if (/abandon|decroch/.test(q)) indicateur = "taux_abandon";
  else if (/absent/.test(q)) indicateur = "taux_absenteisme";
  else if (/par enseignant|ratio|encadrement/.test(q)) indicateur = "ratio_apprenants_enseignant";
  else if (/occupation|capacite|surcharg|sature|places/.test(q)) indicateur = "taux_occupation";
  else if (/reussite|admis|\bcep\b|\bbepc\b|\bbac\b/.test(q)) indicateur = "taux_reussite_examen";
  else if (seuil !== undefined && /moyenne|note|\/\s*20/.test(q)) indicateur = "taux_seuil_moyenne";
  else if (/moyenne/.test(q)) indicateur = "moyenne_generale";
  else if (/combien|nombre|effectif|inscrit|scolarise|apprenants|eleves/.test(q)) indicateur = "effectif_apprenants";

  if (!indicateur) {
    return {
      requete: null, interpretation,
      refus: { motif: "indicateur_inconnu", explication: "Aucun indicateur du dictionnaire national ne correspond à cette question. Indicateurs disponibles : " + Object.values(DICTIONNAIRE).map((d) => d.nom.toLowerCase()).join(", ") + "." },
    };
  }
  interpretation.push(`Indicateur : ${DICTIONNAIRE[indicateur].nom} (v${DICTIONNAIRE[indicateur].version})`);

  const filtres: RequeteSemantique["filtres"] = {};
  if (indicateur === "taux_seuil_moyenne") {
    filtres.seuil = seuil;
    interpretation.push(`Seuil : moyenne ≥ ${seuil}/20`);
  }
  if (indicateur === "taux_seuil_moyenne" || indicateur === "moyenne_generale") {
    filtres.matiere = /francais/.test(q) ? "Français" : "Mathématiques";
    if (!/math|francais/.test(q)) interpretation.push("Matière non précisée : mathématiques retenues par défaut");
    else interpretation.push(`Matière : ${filtres.matiere}`);
  }

  // 3. Âge.
  const mAge = q.match(/(\d{1,2})\s*(?:a|et|-)\s*(\d{1,2})\s*ans/) ?? q.match(/entre\s*(\d{1,2})\s*et\s*(\d{1,2})\s*ans/);
  if (mAge) {
    filtres.ageMin = Number(mAge[1]);
    filtres.ageMax = Number(mAge[2]);
    interpretation.push(`Âge : ${filtres.ageMin} à ${filtres.ageMax} ans (âge révolu au 31 décembre)`);
  } else {
    const mMoins = q.match(/moins de\s*(\d{1,2})\s*ans/);
    if (mMoins) { filtres.ageMax = Number(mMoins[1]) - 1; interpretation.push(`Âge : moins de ${mMoins[1]} ans`); }
  }

  // 4. Niveau.
  const niveauTrouve = NIVEAUX.find((n) => new RegExp(`\\b(en |de |du |des |classe de )${norm(n).replace(/[+]/g, "")}\\b`).test(q) || (n.length > 2 && new RegExp(`\\b${norm(n)}\\b`).test(q)));
  if (/\bcep\b/.test(q)) filtres.niveau = "CM2";
  else if (/\bbepc\b/.test(q)) filtres.niveau = "3e";
  else if (/\bbac\b/.test(q)) filtres.niveau = "Tle";
  else if (niveauTrouve) filtres.niveau = niveauTrouve as Niveau;
  if (filtres.niveau) interpretation.push(indicateur === "taux_reussite_examen" ? `Examen : ${filtres.niveau === "CM2" ? "CEP" : filtres.niveau === "Tle" ? "BAC" : "BEPC"}` : `Niveau : ${filtres.niveau}`);
  else if (indicateur === "taux_reussite_examen") interpretation.push("Examen non précisé : BEPC retenu par défaut");

  // 5. Période.
  const mAnnee = q.match(/(20\d\d)\s*[-/]\s*(20\d\d)/);
  const ventilation: Dimension[] = [];
  const evolution = /evolu|depuis|tendance|par annee|progress|ces dernieres annees/.test(q);
  if (mAnnee) filtres.anneeScolaire = `${mAnnee[1]}-${mAnnee[2]}`;
  else if (!evolution) {
    const mSeule = q.match(/\ben (20\d\d)\b/);
    if (mSeule) filtres.anneeScolaire = `${Number(mSeule[1]) - 1}-${mSeule[1]}`;
  }
  if (filtres.anneeScolaire && !/^20(2[1-5])-20(2[2-6])$/.test(filtres.anneeScolaire)) {
    return { requete: null, interpretation, refus: { motif: "question_ambigue", explication: `L'année scolaire ${filtres.anneeScolaire} n'est pas couverte : les séries disponibles vont de 2021-2022 à 2025-2026.` } };
  }
  if (evolution) { ventilation.push("annee"); interpretation.push("Période : évolution 2021-2022 à 2025-2026"); }
  else interpretation.push(`Période : ${filtres.anneeScolaire ?? "2025-2026 (année en cours)"}`);

  // 6. Territoire et milieu.
  const dep = DEPARTEMENTS.find((d) => new RegExp(`\\b${norm(d.nom)}\\b`).test(q));
  const commune = COMMUNES.filter((c) => c.id !== "cotonou" || !/littoral/.test(q)).find((c) => new RegExp(`\\b${norm(c.nom)}\\b`).test(q) && !(dep && norm(dep.nom) === norm(c.nom)));
  if (commune && !/communes?/.test(q.replace(norm(commune.nom), ""))) { filtres.communeId = commune.id; interpretation.push(`Territoire : commune de ${commune.nom}`); }
  else if (dep) { filtres.departementId = dep.id; interpretation.push(`Territoire : département ${dep.nom === "Atacora" || dep.nom === "Alibori" ? "de l'" : "du "}${dep.nom}`); }
  if (/\brurale?s?\b/.test(q) && !/urbain/.test(q)) { filtres.milieu = "rural"; interpretation.push("Milieu : rural"); }
  else if (/\burbaine?s?\b/.test(q) && !/rural/.test(q)) { filtres.milieu = "urbain"; interpretation.push("Milieu : urbain"); }
  if (/\bpublics?\b/.test(q) && !/prive/.test(q)) filtres.statut = "public";
  else if (/\bprives?\b/.test(q) && !/public/.test(q)) filtres.statut = "prive";

  // 7. Ventilation.
  const compareSexe = /par sexe|filles et (les )?garcons|garcons et (les )?filles|filles\s*\/\s*garcons|compar\w* (les )?filles|genre/.test(q);
  if (compareSexe) ventilation.push("sexe");
  else if (/\bfilles\b/.test(q)) { filtres.sexe = "F"; interpretation.push("Population : filles"); }
  else if (/\bgarcons\b/.test(q)) { filtres.sexe = "M"; interpretation.push("Population : garçons"); }
  if (/par departement|quels departements|chaque departement|selon (le )?departement/.test(q)) ventilation.push("departement");
  if (/par commune|quelles communes|chaque commune/.test(q)) ventilation.push("commune");
  if (/urbain et rural|rural et urbain|urbain\s*\/\s*rural|par milieu/.test(q)) ventilation.push("milieu");
  if (/par niveau|par classe|chaque niveau/.test(q)) ventilation.push("niveau");
  if (/public et prive|prive et public|par statut|par type d etablissement/.test(q)) ventilation.push("statut");

  const autorisees = DICTIONNAIRE[indicateur].dimensions;
  // Filtres sans objet pour un indicateur défini à l'échelle de l'établissement : on le dit, on n'approxime pas.
  const nonApplicables: string[] = [];
  if (!autorisees.includes("sexe") && filtres.sexe) { delete filtres.sexe; nonApplicables.push("sexe"); }
  if (!autorisees.includes("niveau") && filtres.niveau && indicateur !== "taux_reussite_examen") { delete filtres.niveau; nonApplicables.push("niveau"); }
  if (!["effectif_apprenants", "taux_seuil_moyenne", "moyenne_generale"].includes(indicateur) && (filtres.ageMin !== undefined || filtres.ageMax !== undefined)) {
    delete filtres.ageMin; delete filtres.ageMax; nonApplicables.push("âge");
    const i = interpretation.findIndex((l) => l.startsWith("Âge"));
    if (i >= 0) interpretation.splice(i, 1);
  }
  if (!autorisees.includes("statut") && filtres.statut) { delete filtres.statut; nonApplicables.push("statut de l'établissement"); }
  if (nonApplicables.length) interpretation.push(`Attention : l'indicateur n'est pas défini par ${nonApplicables.join(", ")} ; ce critère n'a pas été appliqué`);
  const refusees = ventilation.filter((d) => !autorisees.includes(d));
  if (refusees.length) {
    return { requete: null, interpretation, refus: { motif: "question_ambigue", explication: `L'indicateur « ${DICTIONNAIRE[indicateur].nom} » n'est pas défini selon : ${refusees.join(", ")}. Dimensions publiées : ${autorisees.join(", ")}.` } };
  }
  const ventil = ventilation.slice(0, 2);
  if (ventil.length) interpretation.push(`Ventilation : ${ventil.map((d) => DIMENSION_LIBELLE[d].toLowerCase()).join(" × ")}`);

  const valide = SchemaRequete.safeParse({ indicateur, filtres, ventilation: ventil });
  if (!valide.success) {
    return { requete: null, interpretation, refus: { motif: "question_ambigue", explication: "La requête produite ne respecte pas le schéma de la couche sémantique ; elle est rejetée plutôt qu'approximée." } };
  }
  return { requete: valide.data, interpretation };
}

/** Pipeline complet : traduction → validation → contrôle du périmètre → calcul. */
export function repondre(couches: CouchesNationales, question: string, perimetre: Perimetre): ReponseAsk {
  const t = traduire(question);
  if (!t.requete || t.refus) {
    return { statut: "refuse", question, motif: t.refus?.motif ?? "question_ambigue", explication: t.refus?.explication ?? "Question non comprise.", requete: null };
  }
  const autorisees = communesDuPerimetre(perimetre);
  if (autorisees) {
    const f = t.requete.filtres;
    const hors =
      (f.communeId && !autorisees.has(f.communeId)) ||
      (f.departementId && ![...autorisees].some((id) => COMMUNES.find((c) => c.id === id)?.departementId === f.departementId));
    if (hors) {
      const nomPerimetre = perimetre.niveau === "departement" ? `département ${departementById.get(perimetre.departementId)?.nom}` : perimetre.niveau === "circonscription" ? perimetre.circonscription : "établissement";
      return { statut: "refuse", question, motif: "hors_perimetre", explication: `Votre habilitation couvre le ${nomPerimetre}. Le territoire demandé en est exclu ; le refus est journalisé.`, requete: t.requete };
    }
  }
  if (perimetre.niveau === "etablissement" || perimetre.niveau === "personnel" || perimetre.niveau === "famille") {
    return { statut: "refuse", question, motif: "hors_perimetre", explication: "Ask Education est réservé aux rôles de pilotage (circonscription, département, national) et à la recherche.", requete: t.requete };
  }
  const resultat = calculer(couches, t.requete, perimetre);
  const interpretation = [...t.interpretation];
  if (autorisees) interpretation.push("Périmètre appliqué automatiquement selon votre habilitation");
  return { statut: "repondu", question, interpretation: interpretation.join(" · "), requete: t.requete, resultat };
}

export const QUESTIONS_EXEMPLES = [
  "Pour les élèves âgés de 11 à 13 ans en 2025-2026, quelle est la proportion ayant obtenu une moyenne ≥ 15/20 en mathématiques, par sexe ?",
  "Dans quels départements la proportion d'élèves ayant au moins 15/20 en mathématiques est-elle la plus faible ?",
  "Comment a évolué la proportion d'élèves ayant au moins 15/20 en mathématiques depuis 2022 ?",
  "Quel est le taux d'abandon dans les communes rurales de l'Atacora ?",
  "Quelles communes ont le ratio d'apprenants par enseignant le plus élevé ?",
  "Montre-moi les notes de Aïcha ZANNOU",
];
