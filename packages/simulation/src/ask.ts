import type {
  CodeIndicateur,
  Dimension,
  ExamenNationalK12,
  Infrastructure,
  Niveau,
  Perimetre,
  ReponseAsk,
  RequeteSemantique,
} from "@beile/contracts";
import { DIMENSION_LIBELLE, INFRASTRUCTURES, INFRASTRUCTURE_LIBELLE, NIVEAUX, PERIMETRE_LIBELLE, RequeteSemantique as SchemaRequete } from "@beile/contracts";
import type { CouchesNationales } from "./macro";
import { MATIERES_SUIVIES } from "./macro";
import { PRENOMS_F, PRENOMS_M } from "./noms";
import {
  CODES,
  calculer,
  codesDuMoteur,
  communesDuPerimetre,
  DICTIONNAIRE,
  ECARTS_PERIMETRE,
  estCalculeParLeRegistre,
  examenDuNiveau,
  evoque,
  evocateurEcarte,
  indicatorReconnu,
  REGISTRE,
  serviceRendant,
} from "./semantique";
import { COMMUNES, DEPARTEMENTS, departementById } from "./territoire";

/**
 * Ask Education — traduction d'une question en requête sémantique.
 *
 * Le traducteur ne connaît plus aucun indicateur : il parcourt le registre des calculateurs. Ajouter un
 * indicateur au registre le rend interrogeable sans toucher à ce fichier, et un indicateur que le registre
 * ne sait pas rendre ne peut pas être promis ici — la liste d'indicateurs du message de refus est dérivée
 * du registre, pas recopiée.
 *
 * Le reste du contrat tient : l'analyseur est déterministe (règles du français administratif), il ne produit
 * JAMAIS un chiffre, le schéma est validé par zod, les droits sont vérifiés, le moteur calcule. En
 * production le même schéma JSON est la sortie autorisée d'un modèle de langage ; les garde-fous en aval
 * sont identiques.
 */

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, " ");

const PRENOMS = new Set([...PRENOMS_F, ...PRENOMS_M].map(norm));

export interface Traduction {
  requete: RequeteSemantique | null;
  interpretation: string[];
  refus?: { motif: "indicateur_inconnu" | "question_ambigue" | "donnee_individuelle"; explication: string };
}

/**
 * Mot par lequel une matière est demandée, et ce que le registre sait en rendre. Les matières à `null`
 * sont reconnues mais non calculables : les notes n'existent que pour deux matières dans la couche
 * statistique, et répondre « mathématiques » à une question d'anglais serait un chiffre vrai à côté d'une
 * autre question.
 */
const MATIERE_EVOQUEE: [string, (typeof MATIERES_SUIVIES)[number] | null][] = [
  ["mathematique", "Mathématiques"],
  ["maths", "Mathématiques"],
  ["francais", "Français"],
  ["anglais", null],
  ["sciences physiques", null],
  ["physique", null],
  ["svt", null],
  ["histoire", null],
  ["geographie", null],
  ["education civique", null],
];

/** Synonymes d'un équipement, du plus explicite au plus courant. `norm()` est déjà appliqué. */
const INFRA_SYNONYMES: [string, Infrastructure][] = [
  ["point d eau", "eau"],
  ["eau potable", "eau"],
  ["acces a l eau", "eau"],
  ["adduction", "eau"],
  ["forage", "eau"],
  ["electricite", "electricite"],
  ["courant electrique", "electricite"],
  ["raccordement electrique", "electricite"],
  ["panneau solaire", "electricite"],
  ["internet", "internet"],
  ["connexion internet", "internet"],
  ["wifi", "internet"],
  ["outil numerique", "internet"],
  ["latrine", "latrines"],
  ["toilette", "latrines"],
  ["bloc sanitaire", "latrines"],
  ["bibliotheque", "bibliotheque"],
  ["livres", "bibliotheque"],
  ["cdi", "bibliotheque"],
];

/**
 * L'examen national nommé dans la question. Les sigles seuls ne suffisent pas : une question écrite
 * « baccalauréat » n'est pas une question écrite « bac », et la laisser sans examen désigné faisait
 * répondre le BEPC à une demande explicite sur le BAC.
 */
function examenCite(q: string): ExamenNationalK12 | null {
  if (/baccalaureat|\bbac\b/.test(q)) return "BAC";
  if (/certificat d etude primaire|\bcep\b/.test(q)) return "CEP";
  if (/brevet d etude|\bbepc\b/.test(q)) return "BEPC";
  return null;
}

/** L'article que le nom d'un département appelle : « de l'Atlantique », « des Collines », « du Borgou ». */
const articleDepartement = (nom: string) => (/^[aàáâeéèêiîoôuùy]/i.test(nom) ? "de l'" : /s$/i.test(nom) ? "des " : "du ");

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

  // 2. Indicateur du registre : le mot suffit à le désigner, et rien d'autre ne doit le remplacer.
  // Sans cette étape, « combien de crédits ECTS » retomberait sur `effectif_apprenants` et répondrait un
  // nombre d'inscrits à une question de crédits. Le service qui rend la valeur est nommé, jamais un silence.
  for (const code of CODES) {
    if (!estCalculeParLeRegistre(code)) continue;
    if (!evoque(q, REGISTRE[code].evocateurs)) continue;
    const def = DICTIONNAIRE[code];
    return {
      requete: null, interpretation,
      refus: {
        motif: "indicateur_inconnu",
        explication: `« ${def.nom} » (v${def.version}, ${PERIMETRE_LIBELLE[def.perimetre]}) n'est pas rendu par la couche statistique nationale : aucune de ses assiettes ne porte la mesure. Ce chiffre est calculé par ${serviceRendant(code)}. Sa définition est publiée au dictionnaire, avec le seuil de publication qui s'y applique.`,
      },
    };
  }

  // 3. Paramètres lus avant la reconnaissance : une garde a besoin du seuil pour départager deux indicateurs.
  const mSeuil = q.match(/(?:>=|≥|superieure? ou egale? a|superieure? a|au moins|plus de|d au moins)\s*(\d{1,2}(?:[.,]\d+)?)|(\d{1,2}(?:[.,]\d+)?)\s*\/\s*20/);
  const seuil = mSeuil ? Number((mSeuil[1] ?? mSeuil[2])!.replace(",", ".")) : undefined;

  // 4. Indicateur, tel que le registre le nomme.
  const indicateur: CodeIndicateur | null = indicatorReconnu(q, { seuil });
  if (!indicateur) {
    // Un périmètre sans registre d'événements n'est pas une lacune à combler par une approximation :
    // la réponse dit quelle écriture manque et ce que la couche sait déjà rendre.
    const lacune = ECARTS_PERIMETRE.find((e) => evoque(q, e.motifs));
    if (lacune) {
      return {
        requete: null, interpretation,
        refus: {
          motif: "indicateur_inconnu",
          explication: `Périmètre « ${PERIMETRE_LIBELLE[lacune.perimetre]} » : ${lacune.ceQuiManque} ${lacune.ceQueNousSavons}`,
        },
      };
    }
    // Le lexique a désigné un indicateur que sa propre garde refuse : c'est lui qu'il faut nommer, et
    // dire ce que le registre sait rendre à la place — pas recopier la liste des indicateurs calculables.
    const ecart = evocateurEcarte(q, { seuil });
    if (ecart) return { requete: null, interpretation, refus: { motif: "indicateur_inconnu", explication: ecart } };
    const rendus = codesDuMoteur("simulation").map((code) => DICTIONNAIRE[code].nom.toLowerCase());
    return {
      requete: null, interpretation,
      refus: { motif: "indicateur_inconnu", explication: "Aucun indicateur du dictionnaire national ne correspond à cette question. Indicateurs calculés par cette couche : " + rendus.join(", ") + ". Ceux du registre du supérieur y sont aussi publiés, mais c'est le service de scolarité du supérieur qui les rend." },
    };
  }
  const entree = REGISTRE[indicateur];
  const def = entree.definition;
  const autorisees = def.dimensions;
  const filtres: RequeteSemantique["filtres"] = {};
  interpretation.push(`Indicateur : ${def.nom} (v${def.version})`);

  // 5. Paramètres exigés par le calculateur. Un paramètre manquant se dit, il ne s'invente pas.
  if (entree.parametres.includes("seuil")) {
    filtres.seuil = seuil ?? 10;
    interpretation.push(`Seuil : moyenne ≥ ${filtres.seuil}/20`);
    if (seuil === undefined) interpretation.push("Seuil non précisé : 10/20 retenu (la moyenne acquise)");
  }
  if (entree.parametres.includes("matiere")) {
    const demandee = MATIERE_EVOQUEE.find(([mot]) => q.includes(mot));
    if (demandee && demandee[1] === null) {
      return {
        requete: null, interpretation,
        refus: { motif: "question_ambigue", explication: `La couche statistique ne porte des notes que pour ${MATIERES_SUIVIES.join(" et ")}. Aucune note de ${norm(demandee[0])} n'est enregistrée : rendre une autre matière sous ce nom serait un chiffre vrai à côté d'une autre question.` },
      };
    }
    filtres.matiere = demandee?.[1] ?? "Mathématiques";
    interpretation.push(demandee ? `Matière : ${filtres.matiere}` : "Matière non précisée : mathématiques retenues par défaut");
  }
  if (entree.parametres.includes("infrastructure")) {
    const demandee = INFRA_SYNONYMES.find(([mot]) => q.includes(mot))?.[1];
    if (!demandee) {
      return {
        requete: null, interpretation,
        refus: { motif: "question_ambigue", explication: `« Sont-ils équipés » n'a pas de réponse : la couche statistique observe ${INFRASTRUCTURES.map((i) => INFRASTRUCTURE_LIBELLE[i].toLowerCase()).join(", ")}, et aucune moyenne n'est faite entre eux. Précisez l'équipement demandé.` },
      };
    }
    filtres.infrastructure = demandee;
    interpretation.push(`Équipement : ${INFRASTRUCTURE_LIBELLE[demandee]}`);
  }

  // 6. Âge.
  const mAge = q.match(/(\d{1,2})\s*(?:a|et|-)\s*(\d{1,2})\s*ans/) ?? q.match(/entre\s*(\d{1,2})\s*et\s*(\d{1,2})\s*ans/);
  if (mAge) {
    filtres.ageMin = Number(mAge[1]);
    filtres.ageMax = Number(mAge[2]);
    interpretation.push(`Âge : ${filtres.ageMin} à ${filtres.ageMax} ans (âge révolu au 31 décembre)`);
  } else {
    const mMoins = q.match(/moins de\s*(\d{1,2})\s*ans/);
    if (mMoins) { filtres.ageMax = Number(mMoins[1]) - 1; interpretation.push(`Âge : moins de ${mMoins[1]} ans`); }
  }

  // 7. Niveau, cycle, examen.
  const niveauTrouve = NIVEAUX.find((n) => new RegExp(`\\b(en |de |du |des |classe de )${norm(n).replace(/[+]/g, "")}\\b`).test(q) || (n.length > 2 && new RegExp(`\\b${norm(n)}\\b`).test(q)));
  // Un indicateur d'examen ne se filtre pas par classe : la fin de cycle observée est l'objet mesuré.
  // Ailleurs, le critère est relevé même si l'indicateur ne le porte pas : l'étape 11 doit pouvoir dire
  // « non appliqué », plutôt que de laisser croire que « dans le primaire » a restreint le calcul.
  if (def.assiette === "examen") {
    const nomme = examenCite(q);
    if (niveauTrouve || nomme) {
      filtres.examen = nomme ?? examenDuNiveau(niveauTrouve as Niveau | undefined);
      interpretation.push(`Examen : ${filtres.examen}`);
    } else if (!/par examen|les trois examens|chaque examen/.test(q)) {
      interpretation.push("Examen non précisé : BEPC retenu par défaut (fin du premier cycle du secondaire)");
    }
  } else if (niveauTrouve) {
    filtres.niveau = niveauTrouve as Niveau;
    interpretation.push(`Niveau : ${filtres.niveau}`);
  } else {
    const cycle = /\bsecondaire\b|college|lycee/.test(q) && !/\bprimaire\b|ecole primaire/.test(q) ? "secondaire"
      : /\bprimaire\b|ecole primaire/.test(q) && !/\bsecondaire\b|college|lycee/.test(q) ? "primaire" : undefined;
    if (cycle) { filtres.cycle = cycle; interpretation.push(`Cycle : ${cycle}`); }
  }

  // 8. Période.
  const mAnnee = q.match(/(20\d\d)\s*[-/]\s*(20\d\d)/);
  const ventilation: Dimension[] = [];
  const serieTemporelle = /evolu|tendance|progress|par annee|ces dernieres annees|au fil des|d une annee a lautre/.test(q);
  const mSeule = q.match(/\ben (20\d\d)\b/);
  const horizon = mSeule && Number(mSeule[1]) > 2026 ? Number(mSeule[1]) : null;
  if (mAnnee) filtres.anneeScolaire = `${mAnnee[1]}-${mAnnee[2]}`;
  else if (!serieTemporelle && mSeule && !horizon) filtres.anneeScolaire = `${Number(mSeule[1]) - 1}-${mSeule[1]}`;
  // Une année hors de la série observée n'est pas une année vide : elle n'a pas de calcul, sauf pour le
  // le seul indicateur du registre qui projette au-delà. Refuser vaut mieux qu'un blanc qui ressemble à zéro.
  if (horizon && indicateur !== "effectif_projete_2030") {
    return {
      requete: null, interpretation,
      refus: { motif: "question_ambigue", explication: `Aucune projection n'est publiée à l'horizon ${horizon} pour « ${def.nom} » : la couche statistique observe 2021-2022 à 2025-2026. Le seul horizon projeté du registre est l'effectif scolarisable à 2030.` },
    };
  }
  if (filtres.anneeScolaire && !/^20(2[1-5])-20(2[2-6])$/.test(filtres.anneeScolaire)) {
    return { requete: null, interpretation, refus: { motif: "question_ambigue", explication: `L'année scolaire ${filtres.anneeScolaire} n'est pas couverte : les séries disponibles vont de 2021-2022 à 2025-2026.` } };
  }
  if (serieTemporelle) { ventilation.push("annee"); interpretation.push("Période : évolution 2021-2022 à 2025-2026"); }
  else interpretation.push(`Période : ${filtres.anneeScolaire ?? "2025-2026 (année en cours)"}`);

  // 9. Territoire et milieu.
  const dep = DEPARTEMENTS.find((d) => new RegExp(`\\b${norm(d.nom)}\\b`).test(q));
  const commune = COMMUNES.filter((c) => c.id !== "cotonou" || !/littoral/.test(q)).find((c) => new RegExp(`\\b${norm(c.nom)}\\b`).test(q) && !(dep && norm(dep.nom) === norm(c.nom)));
  // Une commune nommée est un territoire ; « les communes » n'en est pas un. Sans cette distinction,
  // « la commune de Natitingou » retombait sur le département et répondait une question à côté.
  const designee = commune ? new RegExp(`communes? de ${norm(commune.nom)}`).test(q) : false;
  const enumerees = /(?:par|chaque|toutes|les|dans les|quelles)\s+communes?\b/.test(q);
  if (commune && (designee || !enumerees)) { filtres.communeId = commune.id; interpretation.push(`Territoire : commune de ${commune.nom}`); }
  else if (dep) { filtres.departementId = dep.id; interpretation.push(`Territoire : département ${articleDepartement(dep.nom)}${dep.nom}`); }
  if (/\brurale?s?\b/.test(q) && !/urbain/.test(q)) { filtres.milieu = "rural"; interpretation.push("Milieu : rural"); }
  else if (/\burbaine?s?\b/.test(q) && !/rural/.test(q)) { filtres.milieu = "urbain"; interpretation.push("Milieu : urbain"); }
  if (/\bpublics?\b/.test(q) && !/prive/.test(q)) filtres.statut = "public";
  else if (/\bprives?\b/.test(q) && !/public/.test(q)) filtres.statut = "prive";

  // 10. Ventilation.
  const compareSexe = /par sexe|filles et (les )?garcons|garcons et (les )?filles|filles\s*[-/]\s*garcons|compar\w* (les )?filles|genre/.test(q);
  const citeLesDeux = /\bfilles?\b/.test(q) && /\bgarcons?\b/.test(q);
  // Les deux sexes nommés alors que l'indicateur ne se décline pas par sexe : c'est le nom de la mesure
  // (l'indice de parité compare les deux par construction), pas un critère à appliquer ni à retirer.
  if (citeLesDeux && !autorisees.includes("sexe")) { /* rien : ni filtre, ni ventilation, ni note */ }
  else if (compareSexe) ventilation.push("sexe");
  else if (/\bfilles\b/.test(q)) { filtres.sexe = "F"; interpretation.push("Population : filles"); }
  else if (/\bgarcons\b/.test(q)) { filtres.sexe = "M"; interpretation.push("Population : garçons"); }
  if (/par departement|quels departements|chaque departement|selon (le )?departement/.test(q)) ventilation.push("departement");
  if (/par commune|quelles communes|chaque commune/.test(q)) ventilation.push("commune");
  if (/urbain et rural|rural et urbain|urbain\s*\/\s*rural|par milieu/.test(q)) ventilation.push("milieu");
  if (/par niveau|par classe|chaque niveau/.test(q)) ventilation.push("niveau");
  if (/par cycle|les deux cycle|chaque cycle/.test(q)) ventilation.push("cycle");
  if (/par examen|les trois examens|cep bepc bac|chaque examen/.test(q)) ventilation.push("examen");
  if (/public et prive|prive et public|par statut|par type d etablissement/.test(q)) ventilation.push("statut");

  // 11. Honnêteté de la définition : un critère que l'indicateur ne porte pas est retiré et dit, jamais appliqué de travers.
  const nonApplicables: string[] = [];
  const retirer = (libelle: string, motif: string) => {
    nonApplicables.push(motif);
    const i = interpretation.findIndex((l) => l.startsWith(libelle));
    if (i >= 0) interpretation.splice(i, 1);
  };
  if (!autorisees.includes("sexe") && filtres.sexe) { delete filtres.sexe; retirer("Population", "sexe"); }
  if (!autorisees.includes("niveau") && filtres.niveau) { delete filtres.niveau; retirer("Niveau", "niveau"); }
  if (!autorisees.includes("cycle") && filtres.cycle) { delete filtres.cycle; retirer("Cycle", "cycle d'enseignement"); }
  if (!entree.filtreAge && (filtres.ageMin !== undefined || filtres.ageMax !== undefined)) {
    delete filtres.ageMin; delete filtres.ageMax; retirer("Âge", "âge");
  }
  if (!autorisees.includes("statut") && filtres.statut) { delete filtres.statut; nonApplicables.push("statut de l'établissement"); }
  if (nonApplicables.length) interpretation.push(`Attention : l'indicateur n'est pas défini par ${nonApplicables.join(", ")} ; ce critère n'a pas été appliqué`);
  const refusees = ventilation.filter((d) => !autorisees.includes(d));
  if (refusees.length) {
    return { requete: null, interpretation, refus: { motif: "question_ambigue", explication: `L'indicateur « ${def.nom} » n'est pas défini selon : ${refusees.map((d) => DIMENSION_LIBELLE[d].toLowerCase()).join(", ")}. Dimensions publiées : ${autorisees.join(", ")}.` } };
  }
  const ventil = ventilation.slice(0, 2);
  if (ventil.length) interpretation.push(`Ventilation : ${ventil.map((d) => DIMENSION_LIBELLE[d].toLowerCase()).join(" × ")}`);

  // Un taux « net » et un taux « brut » se ressemblent sur un tableau et ne mesurent pas la même chose :
  // si le registre ne publie que le brut, la lectrice doit le savoir avant de comparer avec une autre source.
  if (/\bnet(te)?\b/.test(q) && /brut/.test(def.nom)) {
    interpretation.push(`Le dictionnaire ne publie que la version brute de ce taux : le taux net (${def.formule.split("÷")[0]?.trim() ?? "population scolarisée"} ÷ population de l'âge officiel) exigerait l'âge enregistré de chaque apprenant`);
  }

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
      const nom = perimetre.niveau === "departement" ? departementById.get(perimetre.departementId)?.nom ?? "" : "";
      const nomPerimetre = perimetre.niveau === "departement" ? `département ${articleDepartement(nom)}${nom}` : perimetre.niveau === "circonscription" ? perimetre.circonscription : "établissement";
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

/**
 * Des questions types, une par famille de calculateur. Elles servent de vérification : si l'une d'elles
 * tombe sur un refus ou sur un indicateur de côté, c'est le lexique du registre qui est faux, pas la chance.
 */
export const QUESTIONS_EXEMPLES = [
  "Pour les élèves âgés de 11 à 13 ans en 2025-2026, quelle est la proportion ayant obtenu une moyenne ≥ 15/20 en mathématiques, par sexe ?",
  "Dans quels départements la proportion d'élèves ayant au moins 15/20 en mathématiques est-elle la plus faible ?",
  "Comment a évolué la proportion d'élèves ayant au moins 15/20 en mathématiques depuis 2022 ?",
  "Quel est le taux d'abandon dans les communes rurales de l'Atacora ?",
  "Quelles communes ont le ratio d'apprenants par enseignant le plus élevé ?",
  "Montre-moi les notes de Aïcha ZANNOU",
  "Quelle est la proportion d'élèves en retard de deux ans ou plus en 6e ?",
  "Quel est l'indice de parité filles-garçons dans le secondaire, par département ?",
  "Quelle est la dispersion des moyennes en français au CE2 ?",
  "Combien de places d'accueil restent-il à Parakou ?",
  "Quel est le taux d'accès à l'eau potable dans les écoles rurales du Borgou ?",
  "Quels établissements n'ont pas encore transmis leurs données cette année ?",
  "Depuis quand les données de la commune de Natitingou sont-elles à jour ?",
  "Quelle est la croissance des effectifs scolarisés par département ?",
  "Combien d'élèves scolarisables en 2030 dans l'Alibori ?",
  "Quel est le taux de présence aux épreuves du BEPC ?",
  "Quelle est la part d'enseignants qualifiés dans le primaire ?",
  "Quelle est la densité d'élèves par salle de classe, par statut d'établissement ?",
  "Les écoles sont-elles saturées à Cotonou ?",
  "Quel est le taux d'absentéisme des élèves du secondaire ?",
  "Combien d'élèves sont scolarisés dans le primaire ?",
  "Quel est le taux net de scolarisation dans le Zou ?",
  "Quelle est la population scolarisable de l'Atlantique ?",
  "Quelle est la moyenne générale en mathématiques au CE2 ?",
  "Quel est le taux de réussite au baccalauréat ?",
  "Combien de crédits ECTS ont été capitalisés en 2025-2026 ?",
  "Quel est le taux d'insertion professionnelle des diplômés du BTS ?",
];
