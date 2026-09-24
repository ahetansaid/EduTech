import type {
  CodeIndicateur,
  DefinitionIndicateur,
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
  AGE_THEORIQUE,
  ANNEE_COURANTE,
  ANNEES,
  cycleDuNiveau,
  partAuDessus,
  RETARD,
  type Annee,
  type CommuneStats,
  type CouchesNationales,
  type MatiereSuivie,
} from "./macro";
import { DATE_SIMULEE } from "./micro";
import { COMMUNES, communeById, departementById } from "./territoire";

/**
 * Couche sémantique : le dictionnaire national porte la définition officielle de chaque indicateur,
 * et le moteur la compile en calcul. Deux directions qui interrogent le même indicateur obtiennent
 * nécessairement le même chiffre.
 */

const SOURCE = "Registre des événements BEILE, EducMaster, système d'examens (données simulées)";

export const DICTIONNAIRE: Record<CodeIndicateur, DefinitionIndicateur> = {
  effectif_apprenants: {
    code: "effectif_apprenants", nom: "Effectif des apprenants",
    definition: "Nombre d'apprenants inscrits et non sortis (abandon ou transfert hors système) à la date d'observation.",
    formule: "Σ inscriptions + reprises + transferts entrants − abandons − transferts sortants",
    unite: "nombre", source: SOURCE, frequence: "Quasi temps réel", proprietaire: "Direction de la programmation et de la prospective",
    version: "1.2", dimensions: ["sexe", "departement", "commune", "milieu", "statut", "niveau", "annee"], effectifMinimalPublication: 5,
  },
  taux_seuil_moyenne: {
    code: "taux_seuil_moyenne", nom: "Proportion d'apprenants atteignant un seuil de moyenne",
    definition: "Part des apprenants évalués dont la moyenne annuelle dans la matière est supérieure ou égale au seuil.",
    formule: "apprenants évalués avec moyenne ≥ seuil ÷ apprenants évalués × 100",
    unite: "pourcentage", source: SOURCE, frequence: "Périodique (trimestre)", proprietaire: "Direction des examens et concours",
    version: "2.0", dimensions: ["sexe", "departement", "commune", "milieu", "statut", "niveau", "annee"], effectifMinimalPublication: 10,
  },
  moyenne_generale: {
    code: "moyenne_generale", nom: "Moyenne des apprenants",
    definition: "Moyenne arithmétique des moyennes annuelles des apprenants évalués dans la matière.",
    formule: "Σ moyennes des apprenants évalués ÷ apprenants évalués",
    unite: "note", source: SOURCE, frequence: "Périodique (trimestre)", proprietaire: "Direction des examens et concours",
    version: "1.1", dimensions: ["sexe", "departement", "commune", "milieu", "statut", "niveau", "annee"], effectifMinimalPublication: 10,
  },
  taux_absenteisme: {
    code: "taux_absenteisme", nom: "Taux d'absentéisme",
    definition: "Part des demi-journées de classe manquées, justifiées ou non, sur les demi-journées dues.",
    formule: "demi-journées d'absence ÷ demi-journées dues × 100",
    unite: "pourcentage", source: SOURCE, frequence: "Quotidienne", proprietaire: "Direction de l'enseignement secondaire",
    version: "1.0", dimensions: ["departement", "commune", "milieu", "annee"], effectifMinimalPublication: 10,
  },
  ratio_apprenants_enseignant: {
    code: "ratio_apprenants_enseignant", nom: "Ratio apprenants par enseignant",
    definition: "Nombre d'apprenants pour un enseignant en poste, tous statuts confondus.",
    formule: "effectif des apprenants ÷ enseignants en poste",
    unite: "ratio", source: SOURCE, frequence: "Mensuelle", proprietaire: "Direction des ressources humaines",
    version: "1.1", dimensions: ["departement", "commune", "milieu", "annee"], effectifMinimalPublication: 1,
  },
  taux_occupation: {
    code: "taux_occupation", nom: "Taux d'occupation des établissements",
    definition: "Rapport entre l'effectif accueilli et la capacité d'accueil déclarée des établissements.",
    formule: "effectif ÷ capacité d'accueil × 100",
    unite: "pourcentage", source: SOURCE, frequence: "Mensuelle", proprietaire: "Direction de la programmation et de la prospective",
    version: "1.0", dimensions: ["departement", "commune", "milieu", "annee"], effectifMinimalPublication: 1,
  },
  taux_abandon: {
    code: "taux_abandon", nom: "Taux d'abandon",
    definition: "Part des apprenants inscrits en début d'année ayant quitté le système sans transfert au cours de l'année.",
    formule: "abandons de l'année ÷ inscrits en début d'année × 100",
    unite: "pourcentage", source: SOURCE, frequence: "Annuelle", proprietaire: "Direction de la programmation et de la prospective",
    version: "1.0", dimensions: ["departement", "commune", "milieu", "annee"], effectifMinimalPublication: 10,
  },
  taux_reussite_examen: {
    code: "taux_reussite_examen", nom: "Taux de réussite à l'examen",
    definition: "Nombre de candidats admis rapporté au nombre de candidats effectivement évalués (présents).",
    formule: "candidats admis ÷ candidats présents × 100",
    unite: "pourcentage", source: SOURCE, frequence: "Annuelle (après délibération)", proprietaire: "Direction des examens et concours",
    version: "3.1", dimensions: ["departement", "commune", "milieu", "annee"], effectifMinimalPublication: 10,
  },
};

/** Part de l'effectif d'un niveau dont l'âge (au 31/12 de l'année d'observation) est dans l'intervalle. */
export function partAge(niveau: Niveau, ageMin?: number, ageMax?: number) {
  if (ageMin === undefined && ageMax === undefined) return 1;
  const base = AGE_THEORIQUE[niveau];
  return RETARD.reduce((s, p, k) => {
    const age = base + k;
    return s + ((ageMin === undefined || age >= ageMin) && (ageMax === undefined || age <= ageMax) ? p : 0);
  }, 0);
}

function libelleCle(dim: Dimension, cle: string) {
  switch (dim) {
    case "sexe": return cle === "F" ? "Filles" : "Garçons";
    case "departement": return departementById.get(cle)?.nom ?? cle;
    case "commune": return communeById.get(cle)?.nom ?? cle;
    case "milieu": return cle === "urbain" ? "Urbain" : "Rural";
    case "statut": return cle === "public" ? "Public" : cle === "prive" ? "Privé" : "Confessionnel";
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

export function calculer(couches: CouchesNationales, requete: RequeteSemantique, perimetre: Perimetre | null = null): ResultatIndicateur {
  const def = DICTIONNAIRE[requete.indicateur];
  const f = requete.filtres;
  const annees: Annee[] = f.anneeScolaire ? [f.anneeScolaire as Annee] : requete.ventilation.includes("annee") ? [...ANNEES] : [ANNEE_COURANTE];
  const restreintes = communesDuPerimetre(perimetre);
  const parts = cacheStatut.get(couches) ?? partsStatut(couches);
  cacheStatut.set(couches, parts);
  const matiere: MatiereSuivie = f.matiere === "Français" ? "Français" : "Mathématiques";
  const seuil = f.seuil ?? 10;

  const communes = [...couches.communes.values()].filter((c) =>
    (!restreintes || restreintes.has(c.communeId)) &&
    (!f.departementId || c.departementId === f.departementId) &&
    (!f.communeId || c.communeId === f.communeId) &&
    (!f.milieu || c.milieu === f.milieu),
  );

  const groupes = new Map<string, { num: number; den: number; effectif: number }>();
  const cle = (c: CommuneStats, annee: Annee, niveau?: Niveau, sexe?: "F" | "M", statut?: string) =>
    requete.ventilation.map((d) =>
      d === "sexe" ? sexe ?? "?" : d === "departement" ? c.departementId : d === "commune" ? c.communeId : d === "milieu" ? c.milieu
        : d === "statut" ? statut ?? "?" : d === "niveau" ? niveau ?? "?" : annee,
    ).join("¦");
  const ajouter = (k: string, num: number, den: number, effectif: number) => {
    const g = groupes.get(k) ?? { num: 0, den: 0, effectif: 0 };
    g.num += num; g.den += den; g.effectif += effectif;
    groupes.set(k, g);
  };

  const parCellule = ["effectif_apprenants", "taux_seuil_moyenne", "moyenne_generale"].includes(requete.indicateur);
  const statuts = requete.ventilation.includes("statut") ? (["public", "prive", "confessionnel"] as const) : f.statut ? [f.statut] : [null];

  for (const c of communes) {
    for (const annee of annees) {
      const a = c.annees[annee];
      if (parCellule) {
        for (const niveau of NIVEAUX) {
          if (f.niveau && niveau !== f.niveau) continue;
          const pAge = partAge(niveau, f.ageMin, f.ageMax);
          if (pAge === 0) continue;
          const cell = a.niveaux[niveau];
          for (const sexe of ["F", "M"] as const) {
            if (f.sexe && sexe !== f.sexe) continue;
            for (const statut of statuts) {
              const pStatut = statut ? parts.get(c.communeId)?.[cycleDuNiveau(niveau)][statut] ?? 0 : 1;
              const eff = (sexe === "F" ? cell.effectifF : cell.effectifM) * pAge * pStatut;
              if (eff <= 0) continue;
              const n = cell.notes[matiere][sexe];
              const k = cle(c, annee, niveau, sexe, statut ?? undefined);
              if (requete.indicateur === "effectif_apprenants") ajouter(k, eff, 1, eff);
              else if (requete.indicateur === "taux_seuil_moyenne") ajouter(k, eff * partAuDessus(seuil, n.moy, n.et), eff, eff);
              else ajouter(k, eff * n.moy, eff, eff);
            }
          }
        }
      } else {
        const eff = NIVEAUX.reduce((s, n) => s + a.niveaux[n].effectifF + a.niveaux[n].effectifM, 0);
        const k = cle(c, annee);
        switch (requete.indicateur) {
          case "taux_absenteisme": ajouter(k, eff * a.tauxAbsenteisme, eff, eff); break;
          case "taux_abandon": ajouter(k, eff * a.tauxAbandon, eff, eff); break;
          case "ratio_apprenants_enseignant": ajouter(k, eff, a.enseignants, eff); break;
          case "taux_occupation": ajouter(k, eff, a.capacite, eff); break;
          case "taux_reussite_examen": {
            const ex = c.examens[annee][f.niveau === "CM2" ? "CEP" : f.niveau === "Tle" ? "BAC" : "BEPC"];
            ajouter(k, ex.admis, ex.presents, ex.presents);
            break;
          }
        }
      }
    }
  }

  const valeurDe = (num: number, den: number) => {
    if (requete.indicateur === "effectif_apprenants") return Math.round(num);
    if (den === 0) return null;
    const v = num / den;
    if (def.unite === "pourcentage") return Math.round(v * 1000) / 10;
    if (def.unite === "ratio") return Math.round(v * 10) / 10;
    return Math.round(v * 100) / 100;
  };

  let totalNum = 0, totalDen = 0, totalEff = 0;
  for (const g of groupes.values()) { totalNum += g.num; totalDen += g.den; totalEff += g.effectif; }

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
      }).sort((a, b) => (requete.ventilation[0] === "annee" || requete.ventilation[0] === "niveau" ? 0 : (b.valeur ?? -1) - (a.valeur ?? -1)))
    : [];
  if (requete.ventilation[0] === "niveau") lignes.sort((a, b) => NIVEAUX.indexOf(a.cle.split("¦")[0] as Niveau) - NIVEAUX.indexOf(b.cle.split("¦")[0] as Niveau));
  if (requete.ventilation[0] === "annee") lignes.sort((a, b) => a.cle.localeCompare(b.cle));

  // Série temporelle : le chiffre principal est celui de la dernière année, pas un cumul.
  const derniereAnnee = requete.ventilation.length === 1 && requete.ventilation[0] === "annee" ? lignes[lignes.length - 1] : undefined;
  const anneeConf = annees[annees.length - 1] ?? ANNEE_COURANTE;
  const etabs = communes.flatMap((c) => couches.etablissementsParCommune.get(c.communeId) ?? []);
  return {
    requete,
    definition: def,
    valeur: derniereAnnee ? derniereAnnee.valeur : valeurDe(totalNum, totalDen),
    numerateur: requete.indicateur === "taux_seuil_moyenne" ? Math.round(totalNum) : null,
    denominateur: Math.round(requete.indicateur === "effectif_apprenants" ? totalNum : totalDen),
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
      { libelle: "Croissance des effectifs sur 2 ans", valeur: `${croissance >= 0 ? "+" : ""}${croissance.toFixed(1)} %`, grave: croissance > 10 },
      { libelle: "Taux d'occupation des établissements", valeur: `${occupation.toFixed(0)} %`, grave: occupation > 112 },
      { libelle: "Apprenants par enseignant", valeur: ratio.toFixed(0), grave: ratio > 54 },
      { libelle: "Absentéisme", valeur: `${(a.tauxAbsenteisme * 100).toFixed(1)} %`, grave: a.tauxAbsenteisme > 0.115 },
      { libelle: "Mathématiques ≥ 15/20 (écart au national)", valeur: `${(maths - nationalMaths >= 0 ? "+" : "")}${(maths - nationalMaths).toFixed(1)} pt`, grave: maths < nationalMaths - 6 },
    ];
    const score = facteurs.filter((x) => x.grave).length;
    const niveau: NiveauAlerte = score >= 3 ? "critique" : score === 2 ? "attention" : score === 1 ? "surveillance" : "favorable";
    res.set(c.communeId, { niveau, score, facteurs });
  }
  return res;
}
