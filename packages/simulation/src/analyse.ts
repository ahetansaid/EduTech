import type {
  ConstatAnalyse, DefinitionIndicateur, Dimension, FamilleQuestion, FigureAnalyse, Perimetre, ReponseAnalyse, RequeteSemantique, ResultatIndicateur, SuggestionAnalyse, TonConstat,
} from "@beile/contracts";
import { FAMILLE_LIBELLE } from "@beile/contracts";
import { traduire } from "./ask";
import type { CouchesNationales } from "./macro";
import { ANNEE_COURANTE, ANNEES } from "./macro";
import { calculer, communesDuPerimetre } from "./semantique";
import { COMMUNES, DEPARTEMENTS, communeById, departementById } from "./territoire";

/**
 * Moteur d'analyse déterministe : la question est rangée dans une famille (niveau, comparaison,
 * classement, évolution, répartition, écart, carte, anomalies, projection) ; chaque famille enchaîne
 * des appels à `calculer()` — seule source de chiffres —, choisit ses figures et rédige ses constats par
 * gabarits. Aucun modèle de langage : même question, mêmes données, même réponse, au caractère près.
 *
 * Les critères (indicateur, filtres, âge, matière, période) sont lus par `traduire()` ; ce module n'ajoute
 * que ce que la traduction ne sait pas porter : plusieurs territoires, un sens de classement, un nombre
 * d'éléments, une famille d'algorithme.
 */

/* ------------------------------------------------------------------ Outils */

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, " ");
const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const nf = (d: number) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
const ordinal = (n: number) => (n === 1 ? "1er" : `${n}e`);
const pluriel = (n: number, mot: string, motPluriel = `${mot}s`) => `${nf0.format(n)} ${n > 1 ? motPluriel : mot}`;

type Unite = DefinitionIndicateur["unite"] | "indice" | "jours";

/** Valeur lisible selon l'unité publiée de l'indicateur. */
export function formater(v: number | null | undefined, unite: Unite): string {
  if (v == null || !Number.isFinite(v)) return "—";
  switch (unite) {
    case "pourcentage": return `${nf(1).format(v)} %`;
    case "note": return `${nf(2).format(v)}/20`;
    case "ratio": return nf(1).format(v);
    case "indice": return nf(2).format(v);
    case "jours": return `${nf0.format(v)} j`;
    default: return nf0.format(v);
  }
}

/** Écart entre deux valeurs, dans la langue de l'unité : points pour un taux ou une note, pourcentage relatif pour un volume. */
function ecartLisible(a: number, b: number, unite: Unite): string {
  const d = Math.abs(a - b);
  if (unite === "pourcentage") return `${nf(1).format(d)} point${d >= 2 ? "s" : ""}`;
  if (unite === "note") return `${nf(2).format(d)} point${d >= 2 ? "s" : ""}`;
  if (unite === "nombre") return b ? `${nf(1).format((d / Math.abs(b)) * 100)} %` : nf0.format(d);
  if (unite === "indice") return nf(2).format(d);
  return nf(1).format(d);
}

/** Un écart est-il significatif ? En dessous de ce seuil, on dit « stable » ou « comparable », jamais « hausse ». */
function negligeable(a: number, b: number, unite: Unite): boolean {
  const d = Math.abs(a - b);
  if (unite === "pourcentage") return d < 0.3;
  if (unite === "note") return d < 0.1;
  if (unite === "indice") return d < 0.01;
  return b ? d / Math.abs(b) < 0.005 : d === 0;
}

/**
 * Sens de lecture : +1 si une hausse est favorable, −1 si une baisse l'est, 0 si la valeur n'est ni bonne
 * ni mauvaise en soi. Lu dans la définition quand elle le publie, sinon dans cette table de repli.
 */
const SENS_REPLI: Record<string, 1 | -1 | 0> = {
  effectif_apprenants: 0, taux_seuil_moyenne: 1, moyenne_generale: 1, taux_absenteisme: -1, ratio_apprenants_enseignant: -1,
  taux_occupation: -1, taux_abandon: -1, taux_reussite_examen: 1, taux_presence_examen: 1, part_enseignants_qualifies: 1,
  taux_surage: -1, dispersion_moyennes: -1, places_disponibles: 1, ratio_apprenants_salle: -1, taux_acces_infrastructure: 1,
  taux_scolarisation_brut: 1, taux_depot_donnees: 1, fraicheur_donnees: -1, croissance_effectifs: 0, indice_parite: 0,
};
export function sensDe(def: DefinitionIndicateur): 1 | -1 | 0 {
  const s = (def as { illustration?: { sens?: string } }).illustration?.sens;
  if (s === "hausse_favorable") return 1;
  if (s === "baisse_favorable") return -1;
  if (s === "neutre") return 0;
  return SENS_REPLI[def.code] ?? 0;
}
const tonDe = (delta: number, sens: 1 | -1 | 0): TonConstat => (sens === 0 || delta === 0 ? "neutre" : delta * sens > 0 ? "favorable" : "defavorable");

const mediane = (xs: number[]) => {
  const t = [...xs].sort((a, b) => a - b), m = Math.floor(t.length / 2);
  return t.length ? (t.length % 2 ? t[m]! : (t[m - 1]! + t[m]!) / 2) : NaN;
};

/** Droite des moindres carrés sur x = 0..n−1 ; intervalle de prévision à 95 % pour un x donné. */
function tendance(ys: number[]) {
  const n = ys.length, xs = ys.map((_, i) => i);
  const mx = (n - 1) / 2, my = ys.reduce((s, y) => s + y, 0) / n;
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const pente = sxx ? xs.reduce((s, x, i) => s + (x - mx) * (ys[i]! - my), 0) / sxx : 0;
  const ordonnee = my - pente * mx;
  const residus = ys.map((y, i) => y - (ordonnee + pente * i));
  const sce = residus.reduce((s, r) => s + r * r, 0), sct = ys.reduce((s, y) => s + (y - my) ** 2, 0);
  const r2 = sct ? 1 - sce / sct : 1;
  const s = n > 2 ? Math.sqrt(sce / (n - 2)) : 0;
  const T = [12.71, 4.30, 3.18, 2.78, 2.57, 2.45, 2.36][Math.max(0, n - 3)] ?? 1.96; // Student, n − 2 degrés de liberté
  return { pente, ordonnee, r2, predire: (x: number) => ordonnee + pente * x, marge: (x: number) => T * s * Math.sqrt(1 + 1 / n + (sxx ? (x - mx) ** 2 / sxx : 0)) };
}

/* ------------------------------------------------------------------ Lecture de la question (ce que traduire() ne porte pas) */

interface Territoire { type: "departement" | "commune"; id: string; nom: string }

/** Tous les territoires cités, dans l'ordre de la question (un département l'emporte sur une commune homonyme). */
function territoiresCites(q: string): Territoire[] {
  const trouves: (Territoire & { pos: number })[] = [];
  for (const d of DEPARTEMENTS) {
    const m = new RegExp(`\\b${norm(d.nom)}\\b`).exec(q);
    if (m) trouves.push({ type: "departement", id: d.id, nom: d.nom, pos: m.index });
  }
  for (const c of COMMUNES) {
    const m = new RegExp(`\\b${norm(c.nom)}\\b`).exec(q);
    if (m && !trouves.some((t) => t.pos === m.index)) trouves.push({ type: "commune", id: c.id, nom: c.nom, pos: m.index });
  }
  return trouves.sort((a, b) => a.pos - b.pos).map(({ pos: _pos, ...t }) => t);
}

const GROUPES: Record<"sexe" | "milieu" | "statut", { a: string; b: string; libelleA: string; libelleB: string; faveurA: string; faveurB: string; motif: RegExp }> = {
  sexe: { a: "F", b: "M", libelleA: "Filles", libelleB: "Garçons", faveurA: "des filles", faveurB: "des garçons", motif: /fille|garcon|genre|sexe|parite/ },
  milieu: { a: "urbain", b: "rural", libelleA: "Urbain", libelleB: "Rural", faveurA: "du milieu urbain", faveurB: "du milieu rural", motif: /urbain|rural|milieu/ },
  statut: { a: "public", b: "prive", libelleA: "Public", libelleB: "Privé", faveurA: "du public", faveurB: "du privé", motif: /public|prive|statut/ },
};

interface Intention {
  famille: FamilleQuestion;
  territoires: Territoire[];
  croissant: boolean | null;
  nombre: number | null;
  groupe: "sexe" | "milieu" | "statut" | null;
  dimension: Dimension | null;
  horizon: number;
}

/** Famille d'algorithme : des indices lexicaux explicites, puis la ventilation déjà lue par traduire(). */
function lireIntention(q: string, base: RequeteSemantique): Intention {
  const territoires = territoiresCites(q);
  const mNombre = q.match(/\b(?:top|les)\s+(\d{1,2})\b|\b(\d{1,2})\s+(?:premier|dernier|meilleur|moins|plus|commune|departement)/);
  const nombre = mNombre ? Math.min(30, Number(mNombre[1] ?? mNombre[2])) : null;
  const croissant = /plus faible|plus bas|moins (bon|eleve|fort|performant)|pire|dernier|en queue|le moins|la moins|les moins|plus en retard/.test(q) ? true
    : /plus eleve|plus haut|plus fort|meilleur|premier|en tete|le plus|la plus|les plus/.test(q) ? false : null;
  const mHorizon = q.match(/\b20(2[7-9]|3\d)\b/);
  const horizon = mHorizon ? 2000 + Number(mHorizon[1]) : 2030;
  const groupe = (Object.keys(GROUPES) as (keyof typeof GROUPES)[]).find((g) => base.ventilation.includes(g) || (/ecart|disparit|inegal|equite|parite|entre (les )?(filles|garcons|urbain|rural|public|prive)|versus|compar/.test(q) && GROUPES[g].motif.test(q))) ?? null;
  const dimension = base.ventilation.find((d) => d !== "annee" && d !== "departement" && d !== "commune") ?? null;

  const famille: FamilleQuestion =
    /projection|prevision|prevoir|projet|horizon|d ici|a l avenir|dans (\d+|cinq|dix) ans|20(2[7-9]|3\d)/.test(q) ? "projection"
    : /anomal|atypique|aberran|hors norme|decroch|inhabituel|singulier|signaux|a surveiller|inquiet|alerte/.test(q) ? "anomalies"
    : territoires.length >= 2 ? "comparaison"
    : groupe && /ecart|disparit|inegal|equite|parite|entre|versus|compar|et les? (filles|garcons)|urbain et rural|rural et urbain|public et prive|prive et public/.test(q) ? "ecart"
    : base.ventilation.includes("annee") || /evolu|depuis|tendance|progress|dernieres annees|au fil|historique|augment|diminu|a baisse|a progresse|a recule/.test(q) ? "evolution"
    : /\bcarte\b|cartograph|localis|\bou (se situ|sont|trouv|agir)|\bou (le|la|les) .* (plus|moins)|geograph/.test(q) ? "carte"
    : base.ventilation.includes("departement") || base.ventilation.includes("commune") || (nombre != null && /commune|departement/.test(q)) || /(communes|departements) (avec|ou|qui|dont|ayant)|classement|classe[rz]?\b|top\b|palmares|quels departements|quelles communes|les plus|les moins|en tete|en queue/.test(q) ? "classement"
    : dimension || /repartition|ventil|selon (le|la|les)/.test(q) ? "repartition"
    : "niveau";
  return { famille, territoires, croissant, nombre, groupe, dimension, horizon };
}

/* ------------------------------------------------------------------ Contexte d'exécution */

class Contexte {
  readonly def: DefinitionIndicateur;
  readonly unite: Unite;
  readonly sens: 1 | -1 | 0;
  readonly resultats: ResultatIndicateur[] = [];
  readonly avertissements: string[] = [];
  constructor(readonly couches: CouchesNationales, readonly perimetre: Perimetre, readonly base: RequeteSemantique, readonly question: string) {
    this.def = calculer(couches, { ...base, ventilation: [] }, perimetre).definition;
    this.unite = this.def.unite as Unite;
    this.sens = sensDe(this.def);
  }
  permet = (d: Dimension) => this.def.dimensions.includes(d);
  /** Seul point de calcul : chaque résultat est conservé pour la provenance. */
  calc(filtres: RequeteSemantique["filtres"], ventilation: Dimension[] = []): ResultatIndicateur {
    const r = calculer(this.couches, { indicateur: this.base.indicateur, filtres, ventilation }, this.perimetre);
    this.resultats.push(r);
    return r;
  }
  f = (v: number | null | undefined) => formater(v, this.unite);
  /** Filtres de la question sans territoire ni année (pour les ventilations territoriales ou temporelles). */
  get sansTerritoire() { const { departementId: _d, communeId: _c, ...f } = this.base.filtres; return f; }
  get sansAnnee() { const { anneeScolaire: _a, ...f } = this.base.filtres; return f; }
  get periode() { return this.base.filtres.anneeScolaire ?? ANNEE_COURANTE; }
  /** Nom du territoire interrogé, ou du périmètre de l'utilisateur. */
  lieu(f: RequeteSemantique["filtres"] = this.base.filtres): string {
    if (f.communeId) return communeById.get(f.communeId)?.nom ?? f.communeId;
    if (f.departementId) return departementById.get(f.departementId)?.nom ?? f.departementId;
    return this.nomPerimetre;
  }
  get nomPerimetre() {
    return this.perimetre.niveau === "departement" ? (departementById.get(this.perimetre.departementId)?.nom ?? "Département")
      : this.perimetre.niveau === "circonscription" ? this.perimetre.circonscription : "Bénin";
  }
  /** Niveau territorial le plus fin utile sous le périmètre (un département n'a pas de rang parmi lui-même). */
  get echelle(): "departement" | "commune" { return this.perimetre.niveau === "national" ? "departement" : "commune"; }
}

const valeursDe = (r: ResultatIndicateur) => r.lignes.filter((l) => !l.masquee && l.valeur != null) as (ResultatIndicateur["lignes"][number] & { valeur: number })[];
const figureCarte = (titre: string, r: ResultatIndicateur, niveau: "communes" | "departements", focus?: string | null): FigureAnalyse =>
  ({ type: "carte", titre, niveau, valeurs: Object.fromEntries(r.lignes.map((l) => [l.cle, l.masquee ? null : l.valeur])), focusDepartement: focus ?? null });
const figureBarres = (titre: string, r: ResultatIndicateur, reference: number | null, libelleRef: string, accent?: string, limite?: number, croissant = false): FigureAnalyse => ({
  type: "barres", titre, limite,
  barres: [...r.lignes].sort((a, b) => (croissant ? 1 : -1) * ((a.valeur ?? -Infinity) - (b.valeur ?? -Infinity)))
    .map((l) => ({ cle: l.cle, libelle: l.libelle, valeur: l.masquee ? null : l.valeur, masquee: l.masquee, effectif: l.effectif, accent: l.cle === accent })),
  reference: reference != null ? { libelle: libelleRef, valeur: reference } : null,
});

/* ------------------------------------------------------------------ Familles */

interface Sortie { titre: string; constats: ConstatAnalyse[]; figures: FigureAnalyse[]; famille?: FamilleQuestion }

/** Position d'une valeur : écart à la référence du périmètre, rang parmi ses pairs, tendance récente. */
function niveau(cx: Contexte): Sortie {
  const r = cx.calc(cx.base.filtres);
  const f = cx.base.filtres;
  const lieu = cx.lieu();
  const constats: ConstatAnalyse[] = [{ texte: `${cx.def.nom} — ${lieu}, ${cx.periode} : ${cx.f(r.valeur)}.`, ton: "neutre" }];
  const figures: FigureAnalyse[] = [];
  let reference: number | null = null;
  let rang: { position: number; sur: number; libelle: string } | null = null;

  if (f.communeId || f.departementId) {
    const ref = cx.calc(cx.sansTerritoire);
    reference = ref.valeur;
    if (r.valeur != null && ref.valeur != null) {
      const d = r.valeur - ref.valeur;
      constats.push(negligeable(r.valeur, ref.valeur, cx.unite)
        ? { texte: `Comparable à l'ensemble (${cx.nomPerimetre} : ${cx.f(ref.valeur)}).`, ton: "neutre" }
        : { texte: `Soit ${ecartLisible(r.valeur, ref.valeur, cx.unite)} ${d > 0 ? "au-dessus" : "en dessous"} de l'ensemble (${cx.nomPerimetre} : ${cx.f(ref.valeur)}).`, ton: tonDe(d, cx.sens) });
    }
    // Rang parmi les pairs : départements du pays, ou communes du même département.
    const echelle = f.communeId ? "commune" : "departement";
    if (cx.permet(echelle)) {
      const depDeLaCommune = f.communeId ? communeById.get(f.communeId)?.departementId : undefined;
      const pairs = cx.calc(depDeLaCommune ? { ...cx.sansTerritoire, departementId: depDeLaCommune } : cx.sansTerritoire, [echelle]);
      const ordre = [...valeursDe(pairs)].sort((a, b) => (cx.sens === -1 ? a.valeur - b.valeur : b.valeur - a.valeur));
      const position = ordre.findIndex((l) => l.cle === (f.communeId ?? f.departementId)) + 1;
      if (position > 0 && ordre.length > 1) {
        const lecture = cx.sens === 0 ? "valeur la plus élevée" : "position la plus favorable";
        const groupe = depDeLaCommune ? `communes du ${departementById.get(depDeLaCommune)?.nom}` : "départements";
        rang = { position, sur: ordre.length, libelle: groupe };
        constats.push({ texte: `${ordinal(position)} sur ${ordre.length} ${groupe} (1er = ${lecture}).`, ton: cx.sens === 0 ? "neutre" : position <= Math.ceil(ordre.length / 3) ? "favorable" : position > Math.floor((2 * ordre.length) / 3) ? "defavorable" : "neutre" });
        figures.push(figureBarres(`${cx.def.nom} : ${groupe}`, pairs, ref.valeur, cx.nomPerimetre, f.communeId ?? f.departementId, 12, cx.sens === -1));
      }
    }
  } else if (cx.permet(cx.echelle)) {
    const pairs = cx.calc(cx.base.filtres, [cx.echelle]);
    const v = valeursDe(pairs);
    if (v.length > 1) {
      const t = [...v].sort((a, b) => b.valeur - a.valeur);
      constats.push({ texte: `De ${cx.f(t[t.length - 1]!.valeur)} (${t[t.length - 1]!.libelle}) à ${cx.f(t[0]!.valeur)} (${t[0]!.libelle}) selon ${cx.echelle === "departement" ? "le département" : "la commune"}.`, ton: "neutre" });
      figures.push(figureBarres(`${cx.def.nom} par ${cx.echelle === "departement" ? "département" : "commune"}`, pairs, r.valeur, cx.nomPerimetre, undefined, 12, cx.sens === -1));
    }
  }

  // Tendance récente, si la série existe et que l'année n'est pas imposée.
  if (!f.anneeScolaire && cx.permet("annee")) {
    const serie = valeursDe(cx.calc(cx.base.filtres, ["annee"]));
    if (serie.length >= 2) {
      const [avant, apres] = [serie[serie.length - 2]!, serie[serie.length - 1]!];
      const premier = serie[0]!;
      const phrase = (a: number, b: number, depuis: string) => negligeable(b, a, cx.unite) ? `stable ${depuis}` : `${b > a ? "en hausse" : "en baisse"} de ${ecartLisible(b, a, cx.unite)} ${depuis}`;
      constats.push({ texte: `${phrase(avant.valeur, apres.valeur, "sur un an").replace(/^./, (x) => x.toUpperCase())} ; ${phrase(premier.valeur, apres.valeur, `depuis ${premier.cle}`)}.`, ton: tonDe(apres.valeur - avant.valeur, cx.sens) });
      if (!figures.length) figures.push({ type: "courbes", titre: `${cx.def.nom} — ${lieu}`, series: [{ nom: lieu, points: serie.map((l) => ({ x: l.cle, y: l.valeur })) }] });
    }
  }
  figures.unshift({ type: "chiffre", titre: `${cx.def.nom} — ${lieu}`, valeur: r.valeur, reference: reference != null ? { libelle: cx.nomPerimetre, valeur: reference } : null, rang });
  return { titre: `${cx.def.nom} — ${lieu}`, constats, figures, famille: "niveau" };
}

/** Plusieurs territoires face à face, et face à l'ensemble ; trajectoires comparées si la série existe. */
function comparaison(cx: Contexte, territoires: Territoire[]): Sortie {
  const ts = territoires.slice(0, 8);
  const filtresDe = (t: Territoire) => ({ ...cx.sansTerritoire, ...(t.type === "commune" ? { communeId: t.id } : { departementId: t.id }) });
  const valeurs = ts.map((t) => ({ t, r: cx.calc(filtresDe(t)) }));
  const ref = cx.calc(cx.sansTerritoire);
  const connus = valeurs.filter((x) => x.r.valeur != null) as { t: Territoire; r: ResultatIndicateur & { valeur: number } }[];
  const constats: ConstatAnalyse[] = [];
  if (connus.length >= 2) {
    const tri = [...connus].sort((a, b) => (cx.sens === -1 ? a.r.valeur - b.r.valeur : b.r.valeur - a.r.valeur));
    const [haut, bas] = [tri[0]!, tri[tri.length - 1]!];
    constats.push({ texte: tri.map((x) => `${x.t.nom} : ${cx.f(x.r.valeur)}`).join(" ; ") + ".", ton: "neutre" });
    constats.push(negligeable(haut.r.valeur, bas.r.valeur, cx.unite)
      ? { texte: `Situations comparables (écart de ${ecartLisible(haut.r.valeur, bas.r.valeur, cx.unite)}).`, ton: "neutre" }
      : { texte: cx.sens === 0
          ? `Écart de ${ecartLisible(haut.r.valeur, bas.r.valeur, cx.unite)} entre ${haut.t.nom} et ${bas.t.nom}.`
          : `${haut.t.nom} fait mieux que ${bas.t.nom}, de ${ecartLisible(haut.r.valeur, bas.r.valeur, cx.unite)}.`, ton: "neutre" });
    if (ref.valeur != null) {
      const sous = connus.filter((x) => !negligeable(x.r.valeur, ref.valeur!, cx.unite) && (x.r.valeur - ref.valeur!) * (cx.sens || 1) < 0).map((x) => x.t.nom);
      if (cx.sens !== 0) constats.push({ texte: sous.length ? `${sous.join(", ")} ${sous.length > 1 ? "sont" : "est"} en deçà de l'ensemble (${cx.nomPerimetre} : ${cx.f(ref.valeur)}).` : `Tous font au moins aussi bien que l'ensemble (${cx.nomPerimetre} : ${cx.f(ref.valeur)}).`, ton: sous.length ? "defavorable" : "favorable" });
    }
  }
  const figures: FigureAnalyse[] = [{
    type: "barres", titre: `${cx.def.nom} — comparaison`,
    barres: valeurs.map((x) => ({ cle: x.t.id, libelle: x.t.nom, valeur: x.r.valeur, accent: true })),
    reference: ref.valeur != null ? { libelle: cx.nomPerimetre, valeur: ref.valeur } : null,
  }];
  if (!cx.base.filtres.anneeScolaire && cx.permet("annee")) {
    const series = [...ts.map((t) => ({ nom: t.nom, filtres: filtresDe(t) })), { nom: cx.nomPerimetre, filtres: cx.sansTerritoire }]
      .map((s) => ({ nom: s.nom, points: cx.calc(s.filtres, ["annee"]).lignes.map((l) => ({ x: l.cle, y: l.masquee ? null : l.valeur })) }));
    figures.push({ type: "courbes", titre: "Trajectoires comparées", series });
    const variations = series.slice(0, -1).map((s) => ({ nom: s.nom, d: (s.points.at(-1)?.y ?? NaN) - (s.points[0]?.y ?? NaN) })).filter((x) => Number.isFinite(x.d));
    if (variations.length >= 2 && cx.sens !== 0) {
      const mieux = [...variations].sort((a, b) => cx.sens * (b.d - a.d))[0]!;
      constats.push({ texte: `Depuis ${ANNEES[0]}, la plus nette amélioration est celle de ${mieux.nom} (${mieux.d >= 0 ? "+" : "−"}${ecartLisible(mieux.d, 0, cx.unite === "nombre" ? "ratio" : cx.unite)}).`, ton: mieux.d * cx.sens > 0 ? "favorable" : "defavorable" });
    }
  }
  return { titre: `${cx.def.nom} : ${ts.map((t) => t.nom).join(" · ")}`, constats, figures };
}

/** Classement des territoires : tête, queue, dispersion, part sous la référence. */
function classement(cx: Contexte, it: Intention): Sortie {
  const echelle: "departement" | "commune" = /commune/.test(norm(cx.question)) || cx.base.ventilation.includes("commune") || cx.base.filtres.departementId || cx.echelle === "commune" ? "commune" : "departement";
  if (!cx.permet(echelle)) { cx.avertissements.push(`L'indicateur n'est pas publié par ${echelle} : valeur d'ensemble seulement.`); return niveau(cx); }
  const filtres = cx.base.filtres.communeId ? { ...cx.base.filtres, communeId: undefined } : cx.base.filtres;
  const r = cx.calc(filtres, [echelle]);
  const v = valeursDe(r);
  // Sens du classement : celui de la question, sinon « du plus favorable au moins favorable ».
  const croissant = it.croissant ?? (cx.sens === -1);
  const tri = [...v].sort((a, b) => (croissant ? a.valeur - b.valeur : b.valeur - a.valeur));
  const n = it.nombre ?? (echelle === "departement" ? tri.length : 10);
  const groupe = echelle === "departement" ? "départements" : "communes";
  const constats: ConstatAnalyse[] = [];
  if (tri.length) {
    const tete = tri.slice(0, Math.min(n, 5));
    constats.push({ texte: `${croissant ? "Valeurs les plus basses" : "Valeurs les plus élevées"} : ${tete.map((l) => `${l.libelle} (${cx.f(l.valeur)})`).join(", ")}.`, ton: cx.sens === 0 ? "neutre" : (croissant ? -1 : 1) * cx.sens > 0 ? "favorable" : "defavorable" });
    const [min, max] = [Math.min(...v.map((l) => l.valeur)), Math.max(...v.map((l) => l.valeur))];
    const med = mediane(v.map((l) => l.valeur));
    constats.push({ texte: `Sur ${pluriel(v.length, groupe.slice(0, -1), groupe)} : de ${cx.f(min)} à ${cx.f(max)}, médiane ${cx.f(med)}${min > 0 && cx.unite !== "pourcentage" ? ` — un rapport de 1 à ${nf(1).format(max / min)}` : ""}.`, ton: "neutre" });
    if (r.valeur != null && cx.sens !== 0) {
      const sous = v.filter((l) => !negligeable(l.valeur, r.valeur!, cx.unite) && (l.valeur - r.valeur!) * cx.sens < 0).length;
      constats.push({ texte: `${pluriel(sous, groupe.slice(0, -1), groupe)} sur ${v.length} ${sous > 1 ? "font" : "fait"} moins bien que l'ensemble (${cx.f(r.valeur)}).`, ton: sous > v.length / 2 ? "defavorable" : "neutre" });
    }
  }
  const masquees = r.lignes.filter((l) => l.masquee).length;
  if (masquees) cx.avertissements.push(`${pluriel(masquees, "territoire masqué", "territoires masqués")} (effectif inférieur au seuil de publication).`);
  const lieu = cx.base.filtres.departementId ? ` — ${cx.lieu({ departementId: cx.base.filtres.departementId })}` : "";
  return {
    famille: "classement",
    titre: `Classement des ${groupe} : ${cx.def.nom}${lieu}`,
    constats,
    figures: [
      figureBarres(`${cx.def.nom} par ${echelle === "departement" ? "département" : "commune"}${n < tri.length ? ` (${n} ${croissant ? "plus basses" : "plus élevées"})` : ""}`, r, r.valeur, cx.nomPerimetre, undefined, n, croissant),
      figureCarte(`Carte : ${cx.def.nom}`, r, echelle === "departement" ? "departements" : "communes", cx.base.filtres.departementId ?? (cx.perimetre.niveau === "departement" ? cx.perimetre.departementId : null)),
    ],
  };
}

/** Série annuelle : variation totale, dernière année, pente, régularité ; comparée à l'ensemble si un territoire est choisi. */
function evolution(cx: Contexte): Sortie {
  if (!cx.permet("annee")) { cx.avertissements.push("L'indicateur n'a pas de série annuelle publiée : valeur de l'année seulement."); return niveau(cx); }
  const lieu = cx.lieu();
  const r = cx.calc(cx.sansAnnee, ["annee"]);
  const serie = valeursDe(r);
  const constats: ConstatAnalyse[] = [];
  if (serie.length >= 2) {
    const [premier, dernier, avant] = [serie[0]!, serie[serie.length - 1]!, serie[serie.length - 2]!];
    const total = dernier.valeur - premier.valeur;
    constats.push(negligeable(dernier.valeur, premier.valeur, cx.unite)
      ? { texte: `Stable de ${premier.cle} à ${dernier.cle} (${cx.f(premier.valeur)} → ${cx.f(dernier.valeur)}).`, ton: "neutre" }
      : { texte: `${total > 0 ? "Hausse" : "Baisse"} de ${ecartLisible(dernier.valeur, premier.valeur, cx.unite)} entre ${premier.cle} et ${dernier.cle} (${cx.f(premier.valeur)} → ${cx.f(dernier.valeur)}).`, ton: tonDe(total, cx.sens) });
    constats.push({ texte: negligeable(dernier.valeur, avant.valeur, cx.unite) ? `Stable sur la dernière année.` : `Sur la dernière année : ${dernier.valeur > avant.valeur ? "+" : "−"}${ecartLisible(dernier.valeur, avant.valeur, cx.unite)}.`, ton: tonDe(dernier.valeur - avant.valeur, cx.sens) });
    const pas = serie.slice(1).map((l, i) => Math.sign(l.valeur - serie[i]!.valeur));
    const memeSens = pas.every((s) => s === pas[0]) && pas[0] !== 0;
    const t = tendance(serie.map((l) => l.valeur));
    constats.push({
      texte: memeSens ? `Mouvement continu : ${pas.length} ${pas[0]! > 0 ? "hausses" : "baisses"} consécutives.` : `Trajectoire irrégulière (${([[pas.filter((x) => x > 0).length, "hausse", "hausses"], [pas.filter((x) => x < 0).length, "baisse", "baisses"], [pas.filter((x) => x === 0).length, "année stable", "années stables"]] as const).filter(([n]) => n > 0).map(([n, m, mp]) => pluriel(n, m, mp)).join(", ")}) ; tendance moyenne ${t.pente >= 0 ? "+" : "−"}${formater(Math.abs(t.pente), cx.unite === "pourcentage" ? "ratio" : cx.unite).replace(/ %$/, "")}${cx.unite === "pourcentage" ? " point" : ""} par an.`,
      ton: "neutre",
    });
  }
  const series = [{ nom: lieu, points: r.lignes.map((l) => ({ x: l.cle, y: l.masquee ? null : l.valeur })) }];
  if (cx.base.filtres.communeId || cx.base.filtres.departementId) {
    const { anneeScolaire: _a, ...sansAnnee } = cx.sansTerritoire;
    const ref = valeursDe(cx.calc(sansAnnee, ["annee"]));
    series.push({ nom: cx.nomPerimetre, points: ref.map((l) => ({ x: l.cle, y: l.valeur })) });
    if (serie.length >= 2 && ref.length >= 2) {
      const dLoc = serie[serie.length - 1]!.valeur - serie[0]!.valeur, dRef = ref[ref.length - 1]!.valeur - ref[0]!.valeur;
      if (cx.sens !== 0 && !negligeable(dLoc, dRef, cx.unite === "nombre" ? "ratio" : cx.unite)) {
        const mieux = (dLoc - dRef) * cx.sens > 0;
        constats.push({ texte: `${lieu} ${mieux ? "progresse plus favorablement" : "évolue moins favorablement"} que l'ensemble (${cx.nomPerimetre}) sur la période.`, ton: mieux ? "favorable" : "defavorable" });
      }
    }
  }
  return { titre: `Évolution : ${cx.def.nom} — ${lieu}`, famille: "evolution", constats, figures: [{ type: "courbes", titre: `${cx.def.nom}, ${ANNEES[0]} à ${ANNEE_COURANTE}`, series }] };
}

const LIBELLE_DIMENSION: Partial<Record<string, string>> = { sexe: "sexe", milieu: "milieu", statut: "statut", niveau: "niveau", cycle: "cycle", examen: "examen" };

/** Répartition selon une dimension : parts d'un volume, ou valeurs d'un taux par groupe. */
function repartition(cx: Contexte, it: Intention): Sortie {
  const d = it.dimension ?? (["sexe", "niveau", "milieu", "statut"] as Dimension[]).find((x) => cx.permet(x) && new RegExp(LIBELLE_DIMENSION[x]!).test(norm(cx.question))) ?? (["niveau", "sexe", "milieu"] as Dimension[]).find(cx.permet);
  if (!d) return niveau(cx);
  const r = cx.calc(cx.base.filtres, [d]);
  const v = valeursDe(r);
  const constats: ConstatAnalyse[] = [];
  if (v.length) {
    if (cx.unite === "nombre") {
      const total = v.reduce((s, l) => s + l.valeur, 0);
      const parts = [...v].sort((a, b) => b.valeur - a.valeur).map((l) => ({ ...l, part: total ? (l.valeur / total) * 100 : 0 }));
      constats.push({ texte: `${parts.slice(0, 4).map((p) => `${p.libelle} : ${nf(1).format(p.part)} %`).join(" ; ")}${parts.length > 4 ? " ; …" : "."}`, ton: "neutre" });
      if (d === "sexe" && parts.length === 2) {
        const f = v.find((l) => l.cle === "F"), m = v.find((l) => l.cle === "M");
        if (f && m && m.valeur) constats.push({ texte: `Indice de parité filles/garçons : ${nf(2).format(f.valeur / m.valeur)} (1,00 = parité).`, ton: Math.abs(f.valeur / m.valeur - 1) < 0.03 ? "favorable" : "defavorable" });
      }
    } else {
      const tri = [...v].sort((a, b) => b.valeur - a.valeur);
      constats.push({ texte: `De ${cx.f(tri[tri.length - 1]!.valeur)} (${tri[tri.length - 1]!.libelle}) à ${cx.f(tri[0]!.valeur)} (${tri[0]!.libelle}).`, ton: "neutre" });
    }
  }
  const lieu = cx.lieu();
  return { titre: `${cx.def.nom} selon ${LIBELLE_DIMENSION[d] ?? d} — ${lieu}`, constats, figures: [figureBarres(`${cx.def.nom} par ${LIBELLE_DIMENSION[d] ?? d}`, r, r.valeur, lieu)] };
}

/** Écart entre deux groupes (filles/garçons, urbain/rural, public/privé), puis territoire par territoire. */
function ecart(cx: Contexte, it: Intention): Sortie | null {
  const g = it.groupe;
  if (!g || !cx.permet(g)) return null;
  const G = GROUPES[g];
  const global = cx.calc(cx.base.filtres, [g]);
  const a = global.lignes.find((l) => l.cle === G.a)?.valeur ?? null, b = global.lignes.find((l) => l.cle === G.b)?.valeur ?? null;
  const constats: ConstatAnalyse[] = [];
  const lieu = cx.lieu();
  const indice = cx.unite === "nombre";
  if (a != null && b != null) {
    constats.push({ texte: `${G.libelleA} : ${cx.f(a)} ; ${G.libelleB} : ${cx.f(b)}.`, ton: "neutre" });
    constats.push(indice
      ? { texte: `Rapport ${G.libelleA.toLowerCase()}/${G.libelleB.toLowerCase()} : ${nf(2).format(b ? a / b : NaN)} (1,00 = équilibre).`, ton: b && Math.abs(a / b - 1) < 0.03 ? "favorable" : "defavorable" }
      : negligeable(a, b, cx.unite) ? { texte: `Pas d'écart significatif entre ${G.libelleA.toLowerCase()} et ${G.libelleB.toLowerCase()}.`, ton: "favorable" }
      : { texte: `Écart de ${ecartLisible(a, b, cx.unite)} ${cx.sens === 0 ? "" : `en faveur ${(a - b) * cx.sens > 0 ? G.faveurA : G.faveurB}`}`.trim() + ".", ton: "alerte" });
  }
  const figures: FigureAnalyse[] = [];
  const echelle = cx.base.filtres.departementId || cx.echelle === "commune" ? "commune" : "departement";
  if (cx.permet(echelle) && !cx.base.filtres.communeId) {
    const r = cx.calc(cx.base.filtres, [g, echelle]);
    const parTerritoire = new Map<string, { libelle: string; a: number | null; b: number | null }>();
    for (const l of r.lignes) {
      const [cg, ct] = l.cle.split("¦") as [string, string];
      const e = parTerritoire.get(ct) ?? { libelle: l.libelle.split(" · ")[1] ?? ct, a: null, b: null };
      if (cg === G.a) e.a = l.masquee ? null : l.valeur;
      if (cg === G.b) e.b = l.masquee ? null : l.valeur;
      parTerritoire.set(ct, e);
    }
    const mesure = (x: { a: number | null; b: number | null }) => (x.a == null || x.b == null ? null : indice ? (x.b ? x.a / x.b - 1 : null) : x.a - x.b);
    const lignes = [...parTerritoire.entries()].map(([cle, x]) => ({ cle, ...x, m: mesure(x) })).sort((p, q) => Math.abs(q.m ?? 0) - Math.abs(p.m ?? 0));
    const connues = lignes.filter((l) => l.m != null);
    if (connues.length >= 2) {
      const [fort, faible] = [connues[0]!, connues[connues.length - 1]!];
      const lire = (l: typeof fort) => (indice ? `rapport ${nf(2).format(l.m! + 1)}` : ecartLisible(l.a!, l.b!, cx.unite));
      const nul = indice ? Math.abs(faible.m!) < 0.01 : negligeable(faible.a!, faible.b!, cx.unite);
      constats.push({ texte: `Écart le plus marqué : ${fort.libelle} (${lire(fort)}) ; ${nul ? `aucun écart notable : ${connues.filter((l) => (indice ? Math.abs(l.m!) < 0.01 : negligeable(l.a!, l.b!, cx.unite))).map((l) => l.libelle).join(", ")}` : `le plus faible : ${faible.libelle} (${lire(faible)})`}.`, ton: "neutre" });
      const inverses = connues.filter((l) => Math.sign(l.m!) !== Math.sign(connues.reduce((s, x) => s + x.m!, 0))).length;
      if (inverses) constats.push({ texte: `L'écart s'inverse dans ${pluriel(inverses, echelle === "commune" ? "commune" : "département")}.`, ton: "neutre" });
    }
    const seuls = lignes.filter((l) => l.a == null || l.b == null);
    if (seuls.length) cx.avertissements.push(`Comparaison impossible faute des deux groupes (${G.libelleA.toLowerCase()} et ${G.libelleB.toLowerCase()}) : ${seuls.map((l) => l.libelle).join(", ")}.`);
    figures.push({ type: "haltere", titre: `${G.libelleA} et ${G.libelleB} par ${echelle === "commune" ? "commune" : "département"}`, libelleA: G.libelleA, libelleB: G.libelleB, lignes: lignes.slice(0, 15).map(({ cle, libelle, a, b }) => ({ cle, libelle, a, b })) });
  }
  figures.unshift({ type: "barres", titre: `${cx.def.nom} — ${lieu}`, barres: [{ cle: G.a, libelle: G.libelleA, valeur: a, accent: true }, { cle: G.b, libelle: G.libelleB, valeur: b }], reference: global.valeur != null ? { libelle: "Ensemble", valeur: global.valeur } : null });
  return { titre: `Écart ${G.libelleA.toLowerCase()} / ${G.libelleB.toLowerCase()} : ${cx.def.nom} — ${lieu}`, constats, figures };
}

/** Lecture géographique : carte communale, extrêmes, et concentration des situations défavorables. */
function carte(cx: Contexte): Sortie {
  if (!cx.permet("commune")) return classement(cx, { famille: "classement", territoires: [], croissant: null, nombre: null, groupe: null, dimension: null, horizon: 2030 });
  const { communeId: _c, ...filtres } = cx.base.filtres;
  const r = cx.calc(filtres, ["commune"]);
  const v = valeursDe(r);
  const constats: ConstatAnalyse[] = [];
  if (v.length >= 5) {
    const tri = [...v].sort((a, b) => (cx.sens === -1 ? b.valeur - a.valeur : a.valeur - b.valeur)); // du moins favorable au plus favorable
    const quintile = tri.slice(0, Math.max(1, Math.round(tri.length / 5)));
    const parDep = new Map<string, number>();
    for (const l of quintile) { const dep = communeById.get(l.cle)?.departementId; if (dep) parDep.set(dep, (parDep.get(dep) ?? 0) + 1); }
    const conc = [...parDep.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d, n]) => `${departementById.get(d)?.nom} (${n})`);
    constats.push({ texte: `${cx.sens === 0 ? "Valeurs les plus basses" : "Situations les moins favorables"} : ${tri.slice(0, 3).map((l) => `${l.libelle} (${cx.f(l.valeur)})`).join(", ")}.`, ton: cx.sens === 0 ? "neutre" : "defavorable" });
    if (!cx.base.filtres.departementId && cx.perimetre.niveau === "national") constats.push({ texte: `Le cinquième ${cx.sens === 0 ? "le plus bas" : "le moins favorable"} des communes se concentre surtout dans : ${conc.join(", ")}.`, ton: "neutre" });
    constats.push({ texte: `${cx.sens === 0 ? "Valeurs les plus élevées" : "Situations les plus favorables"} : ${tri.slice(-3).reverse().map((l) => `${l.libelle} (${cx.f(l.valeur)})`).join(", ")}.`, ton: cx.sens === 0 ? "neutre" : "favorable" });
  }
  const lieu = cx.lieu(filtres);
  return {
    titre: `Carte : ${cx.def.nom} — ${lieu}`,
    constats,
    figures: [figureCarte(`${cx.def.nom} par commune`, r, "communes", filtres.departementId ?? (cx.perimetre.niveau === "departement" ? cx.perimetre.departementId : null)), figureBarres("Communes les moins favorables", r, r.valeur, lieu, undefined, 10, cx.sens !== -1)],
  };
}

/**
 * Anomalies : score robuste (médiane et écart absolu médian) sur les communes, puis ruptures d'une année
 * sur l'autre. Un score robuste ne se laisse pas masquer par les valeurs extrêmes qu'il doit trouver.
 */
function anomalies(cx: Contexte): Sortie {
  if (!cx.permet("commune")) return classement(cx, { famille: "classement", territoires: [], croissant: null, nombre: null, groupe: null, dimension: null, horizon: 2030 });
  const { communeId: _c, ...filtres } = cx.base.filtres;
  const r = cx.calc(filtres, ["commune"]);
  const v = valeursDe(r);
  const constats: ConstatAnalyse[] = [];
  const figures: FigureAnalyse[] = [];
  const med = mediane(v.map((l) => l.valeur));
  const mad = mediane(v.map((l) => Math.abs(l.valeur - med))) || 1e-9;
  const scores = v.map((l) => ({ ...l, z: (0.6745 * (l.valeur - med)) / mad }));
  const SEUIL = 2.5;
  const atypiques = scores.filter((s) => Math.abs(s.z) >= SEUIL).sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  const defavorables = atypiques.filter((s) => cx.sens === 0 || s.z * cx.sens < 0);
  if (atypiques.length) {
    constats.push({ texte: `${pluriel(atypiques.length, "commune s'écarte", "communes s'écartent")} nettement de la norme (médiane ${cx.f(med)}) : ${atypiques.slice(0, 6).map((s) => `${s.libelle} (${cx.f(s.valeur)})`).join(", ")}${atypiques.length > 6 ? "…" : ""}.`, ton: "alerte" });
    if (cx.sens !== 0) constats.push({ texte: defavorables.length ? `${pluriel(defavorables.length, "écart", "écarts")} dans le sens défavorable, à traiter en priorité.` : "Les écarts relevés sont tous dans le sens favorable.", ton: defavorables.length ? "defavorable" : "favorable" });
  } else {
    const extremes = [...scores].sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 3);
    constats.push({ texte: `Aucune commune ne sort franchement de la norme (médiane ${cx.f(med)}). Les plus éloignées : ${extremes.map((s) => `${s.libelle} (${cx.f(s.valeur)})`).join(", ")}.`, ton: "favorable" });
  }
  figures.push(figureCarte(`${cx.def.nom} par commune`, r, "communes", filtres.departementId ?? (cx.perimetre.niveau === "departement" ? cx.perimetre.departementId : null)));
  if (atypiques.length) figures.push({ type: "barres", titre: "Communes atypiques", barres: atypiques.slice(0, 12).map((s) => ({ cle: s.cle, libelle: s.libelle, valeur: s.valeur, accent: cx.sens !== 0 && s.z * cx.sens < 0 })), reference: { libelle: "Médiane", valeur: med } });

  // Ruptures : variation de la dernière année, rapportée à la variation typique des communes.
  if (!filtres.anneeScolaire && cx.permet("annee")) {
    const r2 = cx.calc(filtres, ["commune", "annee"]);
    const [an1, an2] = [ANNEES[ANNEES.length - 2]!, ANNEES[ANNEES.length - 1]!];
    const par = new Map<string, { libelle: string; a?: number; b?: number }>();
    for (const l of r2.lignes) {
      if (l.masquee || l.valeur == null) continue;
      const [c, an] = l.cle.split("¦") as [string, string];
      const e = par.get(c) ?? { libelle: l.libelle.split(" · ")[0] ?? c };
      if (an === an1) e.a = l.valeur; if (an === an2) e.b = l.valeur;
      par.set(c, e);
    }
    const deltas = [...par.values()].filter((e) => e.a != null && e.b != null).map((e) => ({ libelle: e.libelle, a: e.a!, b: e.b!, d: e.b! - e.a! }));
    if (deltas.length >= 5) {
      const md = mediane(deltas.map((x) => x.d)), madd = mediane(deltas.map((x) => Math.abs(x.d - md))) || 1e-9;
      const ruptures = deltas.map((x) => ({ ...x, z: (0.6745 * (x.d - md)) / madd })).filter((x) => Math.abs(x.z) >= 3 && (cx.sens === 0 || x.d * cx.sens < 0)).sort((p, q) => Math.abs(q.z) - Math.abs(p.z));
      constats.push(ruptures.length
        ? { texte: `Décrochages sur un an (${an1} → ${an2}) : ${ruptures.slice(0, 4).map((x) => `${x.libelle} (${cx.f(x.a)} → ${cx.f(x.b)})`).join(", ")}.`, ton: "alerte" }
        : { texte: `Aucun décrochage brutal entre ${an1} et ${an2}.`, ton: "favorable" });
    }
  }
  return { titre: `Anomalies : ${cx.def.nom} — ${cx.lieu(filtres)}`, constats, figures };
}

/**
 * Projection tendancielle : droite des moindres carrés sur la série publiée, prolongée jusqu'à l'horizon,
 * avec son intervalle de prévision. Une tendance n'est pas une prévision de politique : c'est dit.
 */
function projection(cx: Contexte, horizon: number): Sortie {
  if (!cx.permet("annee")) { cx.avertissements.push("L'indicateur n'a pas de série annuelle : aucune projection possible."); return niveau(cx); }
  const lieu = cx.lieu();
  const r = cx.calc(cx.sansAnnee, ["annee"]);
  const serie = valeursDe(r);
  if (serie.length < 3) { cx.avertissements.push("Série trop courte pour projeter."); return evolution(cx); }
  const t = tendance(serie.map((l) => l.valeur));
  const finDerniere = Number(serie[serie.length - 1]!.cle.slice(5));
  const pas = Math.max(1, Math.min(10, horizon - finDerniere));
  const borner = (v: number) => (cx.unite === "pourcentage" ? Math.min(100, Math.max(0, v)) : Math.max(0, v));
  const futur = Array.from({ length: pas }, (_, i) => {
    const x = serie.length - 1 + i + 1, fin = finDerniere + i + 1;
    return { x: `${fin - 1}-${fin}`, y: borner(t.predire(x)), bas: borner(t.predire(x) - t.marge(x)), haut: borner(t.predire(x) + t.marge(x)) };
  });
  const cible = futur[futur.length - 1]!;
  const dernier = serie[serie.length - 1]!;
  const constats: ConstatAnalyse[] = [
    { texte: `Si la tendance ${serie[0]!.cle} – ${dernier.cle} se prolonge : ${cx.f(cible.y)} en ${cible.x} (fourchette ${cx.f(cible.bas)} – ${cx.f(cible.haut)}), contre ${cx.f(dernier.valeur)} aujourd'hui.`, ton: tonDe(cible.y - dernier.valeur, cx.sens) },
    { texte: `Rythme retenu : ${t.pente >= 0 ? "+" : "−"}${formater(Math.abs(t.pente), cx.unite === "pourcentage" ? "ratio" : cx.unite).replace(/ %$/, "")}${cx.unite === "pourcentage" ? " point" : ""} par an.`, ton: "neutre" },
    { texte: t.r2 >= 0.7 ? `Tendance régulière (ajustement R² = ${nf(2).format(t.r2)}) : projection robuste à politique inchangée.` : `Tendance peu régulière (R² = ${nf(2).format(t.r2)}) : projection fragile, à lire comme un ordre de grandeur.`, ton: t.r2 >= 0.7 ? "neutre" : "alerte" },
  ];
  cx.avertissements.push("Projection tendancielle : elle ne tient compte ni des mesures nouvelles ni des chocs (démographie, crises).");
  return {
    titre: `Projection ${cible.x} : ${cx.def.nom} — ${lieu}`,
    constats,
    figures: [{
      type: "courbes", titre: `${cx.def.nom} : observé et projeté`,
      series: [
        { nom: "Observé", points: serie.map((l) => ({ x: l.cle, y: l.valeur })) },
        { nom: "Projection", pointille: true, points: [{ x: dernier.cle, y: dernier.valeur }, ...futur.map((p) => ({ x: p.x, y: p.y }))] },
        { nom: "Fourchette haute", pointille: true, discret: true, points: [{ x: dernier.cle, y: dernier.valeur }, ...futur.map((p) => ({ x: p.x, y: p.haut }))] },
        { nom: "Fourchette basse", pointille: true, discret: true, points: [{ x: dernier.cle, y: dernier.valeur }, ...futur.map((p) => ({ x: p.x, y: p.bas }))] },
      ],
    }],
  };
}

/* ------------------------------------------------------------------ Suggestions (vérifiées par le traducteur) */

function suggestions(cx: Contexte, famille: FamilleQuestion): SuggestionAnalyse[] {
  const nom = cx.def.nom;
  const f = cx.base.filtres;
  const lieu = f.communeId || f.departementId ? ` — ${cx.lieu()}` : "";
  const autreDep = f.departementId && cx.perimetre.niveau === "national" ? DEPARTEMENTS.find((d) => d.id !== f.departementId)?.nom : undefined;
  const candidats: SuggestionAnalyse[] = [
    { libelle: "Évolution", question: `Évolution depuis 2021 : ${nom}${lieu}` },
    { libelle: "Classement", question: f.departementId ? `Classement des communes du ${cx.lieu({ departementId: f.departementId })} : ${nom}` : `Classement des départements : ${nom}` },
    { libelle: "Carte", question: `Carte par commune : ${nom}${lieu}` },
    { libelle: "Anomalies", question: `Communes atypiques : ${nom}${lieu}` },
    { libelle: "Filles et garçons", question: `Écart entre filles et garçons : ${nom}${lieu}` },
    { libelle: "Urbain et rural", question: `Écart entre urbain et rural : ${nom}${lieu}` },
    { libelle: "Projection 2030", question: `Projection à l'horizon 2030 : ${nom}${lieu}` },
    ...(autreDep ? [{ libelle: "Comparer", question: `Comparer ${cx.lieu()} et ${autreDep} : ${nom}` }] : []),
  ];
  const familleDe: Record<string, FamilleQuestion> = { "Évolution": "evolution", Classement: "classement", Carte: "carte", Anomalies: "anomalies", "Filles et garçons": "ecart", "Urbain et rural": "ecart", "Projection 2030": "projection", Comparer: "comparaison" };
  return candidats.filter((s) => {
    if (familleDe[s.libelle] === famille && famille !== "ecart") return false;
    const t = traduire(s.question.replace(/\b20(2[7-9]|3\d)\b/, ""));
    if (!t.requete || t.requete.indicateur !== cx.base.indicateur) return false;
    const g = s.libelle === "Filles et garçons" ? "sexe" : s.libelle === "Urbain et rural" ? "milieu" : null;
    return !g || cx.permet(g);
  }).slice(0, 4);
}

/* ------------------------------------------------------------------ Point d'entrée */

const EXEMPLES_REPLI: SuggestionAnalyse[] = [
  { libelle: "Classement", question: "Quels départements ont le taux d'abandon le plus élevé ?" },
  { libelle: "Évolution", question: "Comment a évolué le taux de réussite au BEPC depuis 2021 ?" },
  { libelle: "Comparaison", question: "Comparer le ratio d'apprenants par enseignant du Zou et des Collines" },
];

function horsPerimetre(perimetre: Perimetre, territoires: { communeId?: string; departementId?: string }[]): boolean {
  const autorisees = communesDuPerimetre(perimetre);
  if (!autorisees) return false;
  return territoires.some((f) => (f.communeId && !autorisees.has(f.communeId)) || (f.departementId && ![...autorisees].some((id) => communeById.get(id)?.departementId === f.departementId)));
}

export function analyser(couches: CouchesNationales, question: string, perimetre: Perimetre): ReponseAnalyse {
  if (perimetre.niveau === "etablissement" || perimetre.niveau === "personnel" || perimetre.niveau === "famille") {
    return { statut: "refuse", question, motif: "hors_perimetre", explication: "L'analyse porte sur des agrégats territoriaux ; votre habilitation n'ouvre pas ce niveau.", requete: null, suggestions: [] };
  }
  const q = ` ${norm(question)} `;
  // Une année d'horizon (2027 et au-delà) n'est pas une année de données : la traduction ne la voit pas.
  const t = traduire(question.replace(/\b(?:en |à l'horizon |a l'horizon |d'ici |horizon )?20(2[7-9]|3\d)\b/gi, " "));
  if (!t.requete || t.refus) {
    return { statut: "refuse", question, motif: t.refus?.motif ?? "question_ambigue", explication: t.refus?.explication ?? "Question non comprise.", requete: null, suggestions: EXEMPLES_REPLI };
  }
  const it = lireIntention(q, t.requete);
  // « Projection des effectifs » : on prolonge la série observée des effectifs, pas une valeur déjà projetée sans série.
  if (it.famille === "projection" && (t.requete.indicateur as string) === "effectif_projete_2030") {
    t.requete = { ...t.requete, indicateur: "effectif_apprenants" as RequeteSemantique["indicateur"] };
    t.interpretation.push("Indicateur : effectif des apprenants (série observée, prolongée)");
  }
  const territoires = it.famille === "comparaison" ? it.territoires.map((x) => (x.type === "commune" ? { communeId: x.id } : { departementId: x.id })) : [t.requete.filtres];
  if (horsPerimetre(perimetre, territoires)) {
    const nomPerimetre = perimetre.niveau === "departement" ? `département ${departementById.get(perimetre.departementId)?.nom}` : perimetre.niveau === "circonscription" ? perimetre.circonscription : "territoire";
    return { statut: "refuse", question, motif: "hors_perimetre", explication: `Votre habilitation couvre le ${nomPerimetre}. Le territoire demandé en est exclu ; le refus est journalisé.`, requete: t.requete, suggestions: [] };
  }

  const cx = new Contexte(couches, perimetre, t.requete, question);
  let famille = it.famille;
  let sortie: Sortie | null =
    famille === "comparaison" ? comparaison(cx, it.territoires)
    : famille === "classement" ? classement(cx, it)
    : famille === "evolution" ? evolution(cx)
    : famille === "repartition" ? repartition(cx, it)
    : famille === "ecart" ? ecart(cx, it)
    : famille === "carte" ? carte(cx)
    : famille === "anomalies" ? anomalies(cx)
    : famille === "projection" ? projection(cx, it.horizon)
    : niveau(cx);
  if (!sortie) {
    // Écart demandé sur une dimension que l'indicateur ne publie pas : on le dit, puis on situe la valeur.
    cx.avertissements.push(`L'indicateur « ${cx.def.nom} » n'est pas publié par ${it.groupe ?? "groupe"} : l'écart ne peut pas être calculé.`);
    famille = "niveau";
    sortie = niveau(cx);
  }
  return {
    statut: "repondu", question, famille: sortie.famille ?? famille, titre: sortie.titre,
    interpretation: [
      `Analyse : ${FAMILLE_LIBELLE[sortie.famille ?? famille]}`,
      // Une comparaison porte sur plusieurs territoires : la ligne « Territoire » de la traduction n'en retient qu'un.
      ...(famille === "comparaison" ? t.interpretation.filter((l) => !l.startsWith("Territoire")).concat(`Territoires : ${it.territoires.slice(0, 8).map((x) => x.nom).join(", ")}`) : t.interpretation),
    ],
    unite: cx.def.unite, constats: sortie.constats, figures: sortie.figures, resultats: cx.resultats,
    suggestions: suggestions(cx, famille), avertissements: [...new Set(cx.avertissements)],
  };
}
