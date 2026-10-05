import type {
  CodeIndicateur,
  Dimension,
  IndiceConfiance,
  LigneResultat,
  Niveau,
  Perimetre,
  RequeteSemantique,
  ResultatIndicateur,
} from "@beile/contracts";
import { NIVEAUX } from "@beile/contracts";
import {
  ANNEE_COURANTE,
  ANNEES,
  cycleDuNiveau,
  type Annee,
  type CommuneStats,
  type CouchesNationales,
  type MatiereSuivie,
  type StatCommuneAnnee,
} from "./macro";
import { DATE_SIMULEE } from "./micro";
import {
  type Contribution,
  EXAMENS_RENDES,
  examenDuNiveau,
  type Filtres,
  type Observation,
  partAge,
  REGISTRE,
} from "./registre";
import { COMMUNES, communeById, departementById } from "./territoire";

const fr = (v: number, d = 1) => v.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * Couche sémantique : le dictionnaire national publie les définitions, `registre.ts` en porte les
 * calculateurs, ce fichier n'est que le driver. Il ne connaît aucune formule — il construit les
 * observations que l'assiette déclarée autorise, appelle la contribution de l'indicateur, accumule
 * numérateur et dénominateur par groupe de ventilation, puis applique le seuil de publication.
 *
 * Deux questions qui interrogent le même indicateur obtiennent donc le même chiffre, et un indicateur
 * sans calculateur ne peut pas être déclaré : `Record<CodeIndicateur, EntreeRegistre>` est vérifié à la
 * compilation, pas à l'usage.
 */

export {
  CODES,
  DICTIONNAIRE,
  ECARTS_PERIMETRE,
  REGISTRE,
  codesDuMoteur,
  codesInterrogeables,
  estCalculeParLeRegistre,
  examenDuNiveau,
  evoque,
  evocateurEcarte,
  indicatorReconnu,
  partAge,
  serviceRendant,
  tauxDeCapitalisation,
} from "./registre";
export type { Contribution, EcartPerimetre, EntreeRegistre, Observation } from "./registre";

function libelleCle(dim: Dimension, cle: string) {
  switch (dim) {
    case "sexe": return cle === "F" ? "Filles" : "Garçons";
    case "departement": return departementById.get(cle)?.nom ?? cle;
    case "commune": return communeById.get(cle)?.nom ?? cle;
    case "milieu": return cle === "urbain" ? "Urbain" : "Rural";
    case "statut": return cle === "public" ? "Public" : cle === "prive" ? "Privé" : "Confessionnel";
    case "cycle": return cle === "primaire" ? "Primaire" : "Secondaire";
    default: return cle;
  }
}

/** Parts d'effectif par statut d'établissement et par cycle, dans chaque commune. */
function partsStatut(couches: CouchesNationales) {
  const res = new Map<string, Record<"primaire" | "secondaire", Record<"public" | "prive" | "confessionnel", number>>>();
  for (const [communeId, etabs] of couches.etablissementsParCommune) {
    const acc = { primaire: { public: 0, prive: 0, confessionnel: 0 }, secondaire: { public: 0, prive: 0, confessionnel: 0 } };
    for (const e of etabs) acc[e.cycle][e.statut] += e.effectif;
    for (const cyc of ["primaire", "secondaire"] as const) {
      const t = acc[cyc].public + acc[cyc].prive + acc[cyc].confessionnel || 1;
      acc[cyc] = { public: acc[cyc].public / t, prive: acc[cyc].prive / t, confessionnel: acc[cyc].confessionnel / t };
    }
    res.set(communeId, acc);
  }
  return res;
}

const cacheStatut = new WeakMap<CouchesNationales, ReturnType<typeof partsStatut>>();

export function communesDuPerimetre(perimetre: Perimetre | null): Set<string> | null {
  if (!perimetre || perimetre.niveau === "national") return null;
  if (perimetre.niveau === "departement") return new Set(COMMUNES.filter((c) => c.departementId === perimetre.departementId).map((c) => c.id));
  if (perimetre.niveau === "circonscription") return new Set(COMMUNES.filter((c) => `CS ${c.nom}` === perimetre.circonscription).map((c) => c.id));
  return new Set();
}

export function confiance(stats: CommuneStats[], annee: Annee): IndiceConfiance {
  const couverture = stats.length ? stats.reduce((s, c) => s + c.annees[annee].couverture, 0) / stats.length : 0;
  const fraicheur = stats.length ? stats.reduce((s, c) => s + Math.max(0, 1 - c.annees[annee].fraicheurJours / 30), 0) / stats.length : 0;
  const officielle = annee !== ANNEE_COURANTE;
  const coherence = officielle ? 0.99 : 0.96;
  const validation = officielle ? 1 : 0.86;
  const score = 0.35 * couverture + 0.25 * fraicheur + 0.2 * coherence + 0.2 * validation;
  const r = (x: number) => Math.round(x * 100);
  return { completude: r(couverture), fraicheur: r(fraicheur), coherence: r(coherence), validation: r(validation), score: r(score) };
}

const STATUTS = ["public", "prive", "confessionnel"] as const;
const effectifAnnee = (a: StatCommuneAnnee) =>
  NIVEAUX.reduce((s, n) => s + a.niveaux[n].effectifF + a.niveaux[n].effectifM, 0);

/**
 * Le calcul : une boucle, quatre assiettes — cellule (niveau × sexe × statut), commune-année, parc
 * d'établissements, examen national. Une contribution qui ne peut pas observer sa cellule rend `null`
 * et n'entre dans aucun cumul : un dénominateur nul se rend `null`, jamais 0.
 */
export function calculer(couches: CouchesNationales, requete: RequeteSemantique, perimetre: Perimetre | null = null): ResultatIndicateur {
  const entree = REGISTRE[requete.indicateur];
  const def = entree.definition;
  const f: Filtres = requete.filtres;
  const annees: Annee[] = f.anneeScolaire ? [f.anneeScolaire as Annee] : requete.ventilation.includes("annee") ? [...ANNEES] : [ANNEE_COURANTE];
  const restreintes = communesDuPerimetre(perimetre);
  const parts = cacheStatut.get(couches) ?? partsStatut(couches);
  cacheStatut.set(couches, parts);
  const matiere: MatiereSuivie = f.matiere === "Français" ? "Français" : "Mathématiques";

  const communes = [...couches.communes.values()].filter((c) =>
    (!restreintes || restreintes.has(c.communeId)) &&
    (!f.departementId || c.departementId === f.departementId) &&
    (!f.communeId || c.communeId === f.communeId) &&
    (!f.milieu || c.milieu === f.milieu),
  );

  const groupes = new Map<string, Contribution>();
  const cle = (o: Observation) =>
    requete.ventilation
      .map((d) =>
        d === "sexe" ? o.sexe ?? "?"
          : d === "departement" ? o.departementId
          : d === "commune" ? o.communeId
          : d === "milieu" ? o.milieu
          : d === "statut" ? o.statut ?? "?"
          : d === "niveau" ? o.niveau ?? "?"
          : d === "cycle" ? (o.niveau ? cycleDuNiveau(o.niveau) : "?")
          : d === "examen" ? o.examen?.nom ?? "?"
          : o.annee,
      )
      .join("¦");
  const ajouter = (k: string, c: Contribution | null) => {
    if (!c) return;
    const g = groupes.get(k) ?? { num: 0, den: 0, effectif: 0 };
    g.num += c.num; g.den += c.den; g.effectif += c.effectif;
    groupes.set(k, g);
  };

  // Un indicateur rendu par un service métier n'a pas d'assiette ici : le driver s'arrête au lieu
  // d'approximer, sur une couche qui ne porte ni UE, ni période, ni crédit.
  const rendre = entree.rend.sorte === "couche-statistique" ? entree.rend.contribution : null;
  // Une assiette communale pondère elle-même ses statuts — la parité a besoin des deux sexes ; les
  // assiettes à granulométrie fine se découpent vraiment, parce qu'elles portent des établissements distincts.
  const decoupeStatut = def.assiette === "cellule" || def.assiette === "etablissement";
  const statutsObserves = decoupeStatut
    ? requete.ventilation.includes("statut") ? STATUTS : f.statut ? [f.statut] : [null]
    : [null];

  if (rendre) {
    for (const c of communes) {
      for (const annee of annees) {
        const a = c.annees[annee];
        const tronc: Observation = {
          communeId: c.communeId,
          departementId: c.departementId,
          milieu: c.milieu,
          annee,
          niveau: null,
          sexe: null,
          statut: null,
          effectif: 0,
          poidsAge: 1,
          stats: a,
          annees: c.annees,
          projection2030: c.projection2030,
          etabs: [],
          examen: null,
          notes: null,
          matiere,
          partsStatut: parts.get(c.communeId) ?? null,
        };

        if (def.assiette === "cellule") {
          for (const niveau of NIVEAUX) {
            if (f.niveau && niveau !== f.niveau) continue;
            if (f.cycle && cycleDuNiveau(niveau) !== f.cycle) continue;
            const pAge = partAge(niveau, f.ageMin, f.ageMax);
            if (pAge === 0) continue;
            const cell = a.niveaux[niveau];
            for (const sexe of ["F", "M"] as const) {
              if (f.sexe && sexe !== f.sexe) continue;
              for (const statut of statutsObserves) {
                const pStatut = statut ? parts.get(c.communeId)?.[cycleDuNiveau(niveau)][statut] ?? 0 : 1;
                const effectif = (sexe === "F" ? cell.effectifF : cell.effectifM) * pAge * pStatut;
                if (effectif <= 0) continue;
                const o: Observation = { ...tronc, niveau, sexe, statut, effectif, poidsAge: pAge, notes: cell.notes[matiere][sexe] };
                ajouter(cle(o), rendre(o, f));
              }
            }
          }
        } else if (def.assiette === "commune") {
          const o: Observation = { ...tronc, effectif: effectifAnnee(a) };
          ajouter(cle(o), rendre(o, f));
        } else if (def.assiette === "etablissement") {
          const tous = couches.etablissementsParCommune.get(c.communeId) ?? [];
          for (const statut of statutsObserves) {
            const etabs = statut ? tous.filter((e) => e.statut === statut) : tous;
            if (!etabs.length) continue;
            const o: Observation = { ...tronc, statut, etabs, effectif: etabs.reduce((s, e) => s + e.effectif, 0) };
            ajouter(cle(o), rendre(o, f));
          }
        } else {
          const noms = f.examen ? [f.examen] : requete.ventilation.includes("examen") ? EXAMENS_RENDES : [examenDuNiveau(f.niveau)];
          for (const nom of noms) {
            const ex = c.examens[annee][nom];
            const o: Observation = { ...tronc, effectif: ex.presents, examen: { nom, inscrits: ex.inscrits, presents: ex.presents, admis: ex.admis } };
            ajouter(cle(o), rendre(o, f));
          }
        }
      }
    }
  }

  const valeurDe = (num: number, den: number) => {
    if (def.unite === "nombre") return Math.round(num);
    if (den === 0) return null;
    const v = num / den;
    if (def.unite === "pourcentage") return Math.round(v * 1000) / 10;
    if (def.unite === "ratio" || def.unite === "jours") return Math.round(v * 10) / 10;
    return Math.round(v * 100) / 100;
  };

  let totalNum = 0, totalDen = 0;
  for (const g of groupes.values()) { totalNum += g.num; totalDen += g.den; }

  const lignes: LigneResultat[] = requete.ventilation.length
    ? [...groupes.entries()].map(([k, g]) => {
        const parties = k.split("¦");
        const masquee = g.effectif < def.effectifMinimalPublication;
        return {
          cle: k,
          libelle: parties.map((p, i) => libelleCle(requete.ventilation[i]!, p)).join(" · "),
          valeur: masquee ? null : valeurDe(g.num, g.den),
          effectif: Math.round(g.effectif),
          masquee,
        };
      }).sort((a, b) => (["annee", "niveau", "cycle", "examen"].includes(requete.ventilation[0] ?? "") ? 0 : (b.valeur ?? -1) - (a.valeur ?? -1)))
    : [];
  if (requete.ventilation[0] === "niveau") lignes.sort((a, b) => NIVEAUX.indexOf(a.cle.split("¦")[0] as Niveau) - NIVEAUX.indexOf(b.cle.split("¦")[0] as Niveau));
  if (requete.ventilation[0] === "cycle") lignes.sort((a, b) => Number(a.cle !== "primaire") - Number(b.cle !== "primaire"));
  if (requete.ventilation[0] === "examen") {
    const rang = (c: string) => EXAMENS_RENDES.indexOf(c as (typeof EXAMENS_RENDES)[number]);
    lignes.sort((a, b) => rang(a.cle) - rang(b.cle));
  }
  if (requete.ventilation[0] === "annee") lignes.sort((a, b) => a.cle.localeCompare(b.cle));

  // Série temporelle : le chiffre principal est celui de la dernière année, pas un cumul.
  const derniereAnnee = requete.ventilation.length === 1 && requete.ventilation[0] === "annee" ? lignes[lignes.length - 1] : undefined;
  const anneeConf = annees[annees.length - 1] ?? ANNEE_COURANTE;
  const etabs = communes.flatMap((c) => couches.etablissementsParCommune.get(c.communeId) ?? []);
  return {
    requete,
    definition: def,
    valeur: derniereAnnee ? derniereAnnee.valeur : valeurDe(totalNum, totalDen),
    numerateur: def.libelleNumerateur && def.unite !== "nombre" ? Math.round(totalNum) : null,
    denominateur: Math.round(def.libelleDenominateur === null ? totalNum : totalDen),
    lignes,
    periode: annees.length > 1 ? `${annees[0]} à ${annees[annees.length - 1]}` : anneeConf,
    couverture: {
      etablissementsAyantTransmis: anneeConf === ANNEE_COURANTE ? etabs.filter((e) => e.transmis).length : etabs.length,
      etablissementsAttendus: etabs.length,
    },
    confiance: confiance(communes, anneeConf),
    misAJourLe: DATE_SIMULEE,
  };
}

/** Valeur d'un indicateur pour chaque commune (cartes choroplèthes). */
export function valeursParCommune(couches: CouchesNationales, requete: Omit<RequeteSemantique, "ventilation">, perimetre: Perimetre | null = null) {
  const r = calculer(couches, { ...requete, ventilation: ["commune"] }, perimetre);
  return new Map(r.lignes.map((l) => [l.cle, l.valeur]));
}

export interface Facteur { libelle: string; valeur: string; grave: boolean }
export type NiveauAlerte = "favorable" | "surveillance" | "attention" | "critique";

/** Zones prioritaires : chaque niveau d'alerte est explicable par ses facteurs. */
export function priorites(couches: CouchesNationales) {
  const courant = ANNEE_COURANTE;
  const precedent = ANNEES[ANNEES.length - 3]!;
  const effectif = (c: CommuneStats, a: Annee) => NIVEAUX.reduce((s, n) => s + c.annees[a].niveaux[n].effectifF + c.annees[a].niveaux[n].effectifM, 0);
  const nationalMaths = calculer(couches, { indicateur: "taux_seuil_moyenne", filtres: { matiere: "Mathématiques", seuil: 15 }, ventilation: [] }).valeur ?? 0;
  const mathsParCommune = valeursParCommune(couches, { indicateur: "taux_seuil_moyenne", filtres: { matiere: "Mathématiques", seuil: 15 } });
  const res = new Map<string, { niveau: NiveauAlerte; score: number; facteurs: Facteur[] }>();
  for (const c of couches.communes.values()) {
    const a = c.annees[courant];
    const eff = effectif(c, courant);
    const croissance = (eff / effectif(c, precedent) - 1) * 100;
    const occupation = (eff / a.capacite) * 100;
    const ratio = eff / a.enseignants;
    const maths = mathsParCommune.get(c.communeId) ?? 0;
    const facteurs: Facteur[] = [
      { libelle: "Croissance des effectifs sur 2 ans", valeur: `${croissance >= 0 ? "+" : ""}${fr(croissance)} %`, grave: croissance > 10 },
      { libelle: "Taux d'occupation des établissements", valeur: `${fr(occupation, 0)} %`, grave: occupation > 112 },
      { libelle: "Apprenants par enseignant", valeur: fr(ratio, 0), grave: ratio > 54 },
      { libelle: "Absentéisme", valeur: `${fr(a.tauxAbsenteisme * 100)} %`, grave: a.tauxAbsenteisme > 0.115 },
      { libelle: "Mathématiques ≥ 15/20 (écart au national)", valeur: `${maths - nationalMaths >= 0 ? "+" : ""}${fr(maths - nationalMaths)} pt`, grave: maths < nationalMaths - 6 },
    ];
    const score = facteurs.filter((x) => x.grave).length;
    const niveau: NiveauAlerte = score >= 3 ? "critique" : score === 2 ? "attention" : score === 1 ? "surveillance" : "favorable";
    res.set(c.communeId, { niveau, score, facteurs });
  }
  return res;
}

/**
 * La couverture du moteur en chiffres : ce que le dictionnaire publie contre ce que le registre sait
 * calculer. Servi par l'API pour qu'un auditeur vérifie l'absence de promesse non tenue sans lire le code.
 */
export const couvertureRegistre = () => {
  const entrees = Object.values(REGISTRE);
  return {
    publiees: entrees.length,
    calculables: entrees.filter((e) => e.rend.sorte === "couche-statistique").length,
    renduesParUnService: entrees.filter((e) => e.rend.sorte === "service-metier").length,
  };
};

/* ---------------------------------------------------------------------------- Recoupement de la ventilation. */

/**
 * Un national et une ventilation sont-ils le même chiffre ? Le contrôle existe parce que la statistique
 * officielle béninoise pose le problème en vrai : la ventilation départementale recoupe le national sur les
 * établissements (17 141) et les enseignants (63 314), rate de 178 apprenants, et une série somme à 4 094
 * pendant que son propre chiffre-titre affiche 4 287. Les deux chiffres sont officiels. Un outil qui ne
 * saurait pas le rendre visible légitimerait un écart au lieu de le montrer.
 *
 * Trois choses bornent le contrôle, et chacune est dite à l'écran plutôt que compensée en silence :
 * - une part, un ratio ou une moyenne ne se somment pas : `non_additif`, et la ligne n'est pas contrôlée ;
 * - une maille sous le seuil de publication ne livre pas sa valeur (règle des petits effectifs) : la somme
 *   est alors indigne d'être comparée, et le contrôle le déclare au lieu de la reconstituer — reconstituer
 *   ce que la règle cache serait défaire la protection ;
 * - chaque maille publie un entier arrondi : l'écart attendu n'est pas zéro mais ±0,5 par maille, borné et
 *   affiché. Un écart au-delà de la borne est le seul qu'un agent ait à vérifier.
 */
export type CasRecoupement = "controle" | "non_additif" | "mailles_masquees" | "rendu_par_un_service";
export type VerdictRecoupement = "coherent" | "coherent_arondi" | "ecart_a_verifier";

export interface ControleRecoupement {
  indicateur: CodeIndicateur;
  nom: string;
  unite: string;
  cas: CasRecoupement;
  national: number | null;
  somme: number | null;
  ecart: number | null;
  /** Borne de l'écart imputable seul à l'arrondi des mailles publiées : 0,5 par maille. */
  toleranceArrondi: number;
  mailles: number;
  maillesMasquees: number;
  verdict: VerdictRecoupement | null;
  motif: string;
}

export function recoupement(
  couches: CouchesNationales,
  perimetre: Perimetre | null = null,
  maille: "departement" | "commune" = "departement",
): { maille: "departement" | "commune"; controles: ControleRecoupement[] } {
  const controles: ControleRecoupement[] = [];
  const nomMaille = maille === "departement" ? "département" : "commune";

  for (const [code, entree] of Object.entries(REGISTRE) as [CodeIndicateur, (typeof REGISTRE)[CodeIndicateur]][]) {
    const def = entree.definition;
    const ligne = { indicateur: code, nom: def.nom, unite: def.unite };

    if (entree.rend.sorte !== "couche-statistique") {
      controles.push({ ...ligne, cas: "rendu_par_un_service", national: null, somme: null, ecart: null, toleranceArrondi: 0, mailles: 0, maillesMasquees: 0, verdict: null,
        motif: "Rendu par le registre du supérieur, hors de la couche statistique : ce contrôle ne le concerne pas." });
      continue;
    }
    if (def.unite !== "nombre") {
      controles.push({ ...ligne, cas: "non_additif", national: null, somme: null, ecart: null, toleranceArrondi: 0, mailles: 0, maillesMasquees: 0, verdict: null,
        motif: `Un ${def.unite} ne se somme pas : additionner les ${nomMaille}s n'est pas un contrôle.` });
      continue;
    }

    const national = calculer(couches, { indicateur: code, filtres: {}, ventilation: [] }, perimetre).valeur;
    const ventile = calculer(couches, { indicateur: code, filtres: {}, ventilation: [maille] }, perimetre);
    const masquees = ventile.lignes.filter((l) => l.masquee);
    const publiees = ventile.lignes.filter((l) => !l.masquee && l.valeur !== null);

    // Pas de second terme : le contrôle est muet et le dit, au lieu de rendre un écart de principe.
    if (!ventile.lignes.length || national === null) {
      controles.push({ ...ligne, cas: "non_additif", national, somme: null, ecart: null, toleranceArrondi: 0, mailles: ventile.lignes.length, maillesMasquees: masquees.length, verdict: null,
        motif: "Pas de maille publiée sur ce périmètre : la comparaison n'a pas de second terme." });
      continue;
    }
    // La règle des petits effectifs prime : on ne reconstitue pas une valeur qu'elle cache pour faire un contrôle.
    if (masquees.length) {
      controles.push({ ...ligne, cas: "mailles_masquees", national, somme: null, ecart: null, toleranceArrondi: 0, mailles: ventile.lignes.length, maillesMasquees: masquees.length, verdict: null,
        motif: `${masquees.length} ${nomMaille} sous le seuil de publication : leur valeur n'est pas livrée, la somme ne peut donc pas être comparée au national.` });
      continue;
    }

    const somme = publiees.reduce((s, l) => s + (l.valeur ?? 0), 0);
    const ecart = national - somme;
    const toleranceArrondi = publiees.length / 2;
    const verdict: VerdictRecoupement = ecart === 0 ? "coherent" : Math.abs(ecart) <= toleranceArrondi ? "coherent_arondi" : "ecart_a_verifier";
    controles.push({
      ...ligne, cas: "controle", national, somme, ecart, toleranceArrondi, mailles: ventile.lignes.length, maillesMasquees: 0, verdict,
      motif: verdict === "coherent"
        ? "Le national et la somme des mailles sont le même nombre."
        : verdict === "coherent_arondi"
          ? `Écart explicable par l'arrondi des ${publiees.length} mailles (±${fr(toleranceArrondi)} au plus).`
          : `Écart de ${ecart > 0 ? "+" : ""}${fr(ecart, 0)} au-delà de l'arrondi possible : à vérifier dans les écritures.`,
    });
  }

  return { maille, controles };
}
