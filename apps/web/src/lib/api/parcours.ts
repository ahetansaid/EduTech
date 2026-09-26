"use client";

import type { Apprenant, Certificat, Classe, Evenement, Matiere, ResultatVerification } from "@beile/contracts";
import { MATIERES } from "@beile/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ecrire, lire, requete } from "@/lib/http";

/**
 * Parcours individuels : espace famille, passeport de l'apprenant, vérification publique de diplôme.
 * Les types reflètent exactement les réponses de l'API (apps/api/src/parcours.ts, complements-famille.ts, app.ts).
 * Les calculs ci-dessous sont PUREMENT d'affichage, à partir des événements du dossier renvoyé :
 * aucune donnée n'est inventée, une matière sans note reste « non évaluée ».
 */

/* ================================================================== Types de réponse */

/** Les faits du dossier — dont le justificatif d'absence et la décision de l'établissement — sont typés par le contrat partagé. */
export type EvenementDossier = Evenement;

export interface Dossier {
  apprenant: Apprenant;
  situation: { classe: Classe | null; etablissementId: string | null; statut: "scolarise" | "abandon" | "non_inscrit" };
  evenements: EvenementDossier[];
  certificats: Certificat[];
  etablissements: Record<string, string>;
}

/* ================================================================== Hooks */

export const CLE_ENFANTS = ["famille", "enfants"] as const;
export const CLE_PASSEPORT = ["apprenant", "passeport"] as const;

/** Enfants rattachés par un lien de filiation vérifié. Rafraîchi toutes les 30 s : une absence saisie en classe apparaît. */
export function useEnfants() {
  return useQuery({ queryKey: CLE_ENFANTS, queryFn: ({ signal }) => lire<Dossier[]>("/famille/enfants", signal), refetchInterval: 30_000 });
}

/** Passeport éducatif de l'apprenant connecté. */
export function usePasseport() {
  return useQuery({ queryKey: CLE_PASSEPORT, queryFn: ({ signal }) => lire<Dossier>("/moi/passeport", signal), refetchInterval: 60_000 });
}

export function useJustifierAbsenceMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { absenceIds: string[]; motif: string }) => ecrire<{ enregistre: string; absenceIds: string[] }>("/famille/absences/justification", v),
    onSuccess: () => client.invalidateQueries({ queryKey: CLE_ENFANTS }),
  });
}

/** Vérification publique : sans session (aucune redirection vers la connexion), réponse minimale de l'API. */
export function useVerification(id: string, empreinte: string) {
  return useQuery({
    queryKey: ["verifier", id, empreinte],
    queryFn: ({ signal }) => requete<ResultatVerification>("GET", `/certificats/${encodeURIComponent(id)}/verification${empreinte ? `?e=${empreinte}` : ""}`, undefined, { silencieux401: true, signal }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: FORMAT_CERTIFICAT.test(id),
  });
}

export const FORMAT_CERTIFICAT = /^CERT-[A-Z]+-\d{4}-\d{6}$/;

/** Lit un identifiant (et une empreinte) dans une saisie libre : identifiant seul, ou lien complet issu d'un QR code. */
export function lireSaisieVerification(brut: string): { id: string; empreinte: string } | null {
  const texte = brut.trim();
  const m = texte.match(/CERT-[A-Za-z]+-\d{4}-\d{6}/);
  if (!m) return null;
  const id = m[0].toUpperCase();
  const e = texte.match(/[?&]e=([0-9a-fA-F]{8,64})/)?.[1]?.toLowerCase() ?? "";
  return { id, empreinte: e };
}

/* ================================================================== Libellés */

export const NOM_EXAMEN: Record<string, string> = { CEP: "Certificat d'études primaires", BEPC: "Brevet d'études du premier cycle", BAC: "Baccalauréat" };
export const NOM_SOURCE: Record<string, string> = { beile: "BEILE", educmaster: "EducMaster", examens: "Office du Bac et des examens", registre_national: "Registre national" };
export const nomComplet = (a: Pick<Apprenant, "prenoms" | "nom">) => `${a.prenoms} ${a.nom}`;
export const initiales = (a: Pick<Apprenant, "prenoms" | "nom">) => `${a.prenoms[0] ?? ""}${a.nom[0] ?? ""}`.toUpperCase();
export const libelleTrimestre = (t: number) => (t === 1 ? "1er trimestre" : `${t}e trimestre`);
export const ageAu = (naissance: string, ref = new Date()) => {
  const n = new Date(naissance);
  let age = ref.getUTCFullYear() - n.getUTCFullYear();
  if (ref.getUTCMonth() < n.getUTCMonth() || (ref.getUTCMonth() === n.getUTCMonth() && ref.getUTCDate() < n.getUTCDate())) age--;
  return age;
};

/* ================================================================== Notes effectives */

export interface NoteEffective {
  id: string; matiere: Matiere; note: number; noteInitiale: number; corrigee: boolean; motif: string | null;
  trimestre: number; anneeScolaire: string; survenuLe: string; classeId: string; etablissementId: string | null;
}

/** Une correction remplace la note d'origine sans l'effacer du registre (la plus récente l'emporte). */
export function notesEffectives(evts: EvenementDossier[]): NoteEffective[] {
  const corrections = new Map<string, { note: number; motif: string; le: string }>();
  for (const e of evts) {
    if (e.type !== "CORRECTION_EVALUATION") continue;
    const avant = corrections.get(e.evenementCorrigeId);
    if (!avant || avant.le <= e.survenuLe) corrections.set(e.evenementCorrigeId, { note: e.nouvelleNote, motif: e.motif, le: e.survenuLe });
  }
  return evts.flatMap((e) => {
    if (e.type !== "EVALUATION") return [];
    const c = corrections.get(e.id);
    return [{ id: e.id, matiere: e.matiere, note: c?.note ?? e.note, noteInitiale: e.note, corrigee: !!c, motif: c?.motif ?? null, trimestre: e.trimestre, anneeScolaire: e.anneeScolaire, survenuLe: e.survenuLe, classeId: e.classeId, etablissementId: e.etablissementId }];
  });
}

const moyenne = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);
const ordreMatiere = (m: string) => { const i = (MATIERES as readonly string[]).indexOf(m); return i < 0 ? 99 : i; };

/** Année scolaire de référence : celle de la classe courante, sinon celle de la note la plus récente. */
export function anneeCourante(d: Dossier, notes = notesEffectives(d.evenements)): string | null {
  return d.situation.classe?.anneeScolaire ?? [...notes].sort((a, b) => a.survenuLe.localeCompare(b.survenuLe)).at(-1)?.anneeScolaire ?? null;
}

export function trimestresNotes(notes: NoteEffective[], annee: string | null) {
  return [...new Set(notes.filter((n) => n.anneeScolaire === annee).map((n) => n.trimestre))].sort((a, b) => a - b);
}

export interface MoyenneMatiere { matiere: Matiere; moyenne: number; nb: number }

export function moyennesParMatiere(notes: NoteEffective[], annee: string | null, trimestre?: number): MoyenneMatiere[] {
  const par = new Map<Matiere, number[]>();
  for (const n of notes) {
    if (n.anneeScolaire !== annee || (trimestre != null && n.trimestre !== trimestre)) continue;
    par.set(n.matiere, [...(par.get(n.matiere) ?? []), n.note]);
  }
  return [...par].map(([matiere, v]) => ({ matiere, moyenne: moyenne(v)!, nb: v.length })).sort((a, b) => ordreMatiere(a.matiere) - ordreMatiere(b.matiere));
}

/** Moyenne générale : moyenne NON pondérée des moyennes de matière (l'API ne transmet pas de coefficients). */
export function moyenneGenerale(notes: NoteEffective[], annee: string | null, trimestre?: number) {
  return moyenne(moyennesParMatiere(notes, annee, trimestre).map((m) => m.moyenne));
}

/** Synthèse scolaire : trimestre le plus récent noté, moyenne, évolution par rapport au trimestre précédent. */
export function syntheseScolaire(d: Dossier) {
  const notes = notesEffectives(d.evenements);
  const annee = anneeCourante(d, notes);
  const trimestres = trimestresNotes(notes, annee);
  const courant = trimestres.at(-1) ?? null;
  const precedent = trimestres.length > 1 ? trimestres.at(-2)! : null;
  const moy = courant != null ? moyenneGenerale(notes, annee, courant) : null;
  const moyAvant = precedent != null ? moyenneGenerale(notes, annee, precedent) : null;
  const matieres = courant != null ? moyennesParMatiere(notes, annee, courant) : [];
  const matieresAvant = new Map((precedent != null ? moyennesParMatiere(notes, annee, precedent) : []).map((m) => [m.matiere, m.moyenne]));
  const recentes = [...notes].sort((a, b) => b.survenuLe.localeCompare(a.survenuLe));
  const parTrimestre = trimestres.map((t) => ({ trimestre: t, moyenne: moyenneGenerale(notes, annee, t) }));
  return { notes, annee, trimestres, courant, precedent, moyenne: moy, evolution: moy != null && moyAvant != null ? moy - moyAvant : null, matieres, matieresAvant, recentes, parTrimestre };
}

/* ================================================================== Absences */

export interface JourAbsence {
  date: string; ids: string[]; classeId: string;
  statut: "justifiee" | "transmise" | "refusee" | "a_justifier";
  motif: string | null; transmiseLe: string | null; decisionMotif: string | null;
}

/**
 * Absences regroupées par jour, avec leur état : justifiée (par l'établissement ou après validation d'un
 * justificatif), justificatif transmis en attente, justificatif refusé, ou à justifier.
 * Le registre est en ajout seul : une DECISION_JUSTIFICATION référence le justificatif d'origine.
 */
export function absencesParJour(evts: EvenementDossier[]): JourAbsence[] {
  const justifs = new Map<string, Extract<Evenement, { type: "JUSTIFICATION_ABSENCE" }>>();
  for (const e of evts) if (e.type === "JUSTIFICATION_ABSENCE") for (const id of e.absenceIds) justifs.set(id, e);
  const decisions = new Map<string, Extract<Evenement, { type: "DECISION_JUSTIFICATION" }>>();
  for (const e of evts) {
    if (e.type !== "DECISION_JUSTIFICATION") continue;
    const avant = decisions.get(e.justificationId);
    if (!avant || avant.survenuLe <= e.survenuLe) decisions.set(e.justificationId, e);
  }
  const jours = new Map<string, JourAbsence>();
  for (const e of evts) {
    if (e.type !== "ABSENCE") continue;
    const j = jours.get(e.date) ?? { date: e.date, ids: [], classeId: e.classeId, statut: "justifiee" as const, motif: null, transmiseLe: null, decisionMotif: null };
    j.ids.push(e.id);
    const justif = justifs.get(e.id);
    const dec = justif ? decisions.get(justif.id) : undefined;
    const statut: JourAbsence["statut"] = e.justifiee || dec?.decision === "validee" ? "justifiee"
      : dec?.decision === "refusee" ? "refusee"
      : justif ? "transmise"
      : "a_justifier";
    const rang = { a_justifier: 0, refusee: 1, transmise: 2, justifiee: 3 } as const;
    if (j.ids.length === 1 || rang[statut] < rang[j.statut]) j.statut = statut;
    if (justif) { j.motif = justif.motif; j.transmiseLe = justif.survenuLe; }
    if (dec?.motif) j.decisionMotif = dec.motif;
    jours.set(e.date, j);
  }
  return [...jours.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/* ================================================================== Parcours (jalons) */

export type TypeJalon = "inscription" | "transfert" | "passage" | "examen" | "diplome" | "bilan" | "abandon" | "reprise" | "justification";
export interface Jalon { id: string; date: string; type: TypeJalon; titre: string; detail: string; source: string; accent: boolean }

/** Parcours chronologique reconstitué à partir des faits du registre, quelle que soit l'école fréquentée. */
export function jalonsParcours(d: Dossier): Jalon[] {
  const etab = (id: string | null | undefined) => (id ? d.etablissements[id] ?? "établissement hors pilote" : "établissement hors pilote");
  const notes = notesEffectives(d.evenements);
  const res: Jalon[] = [];
  for (const e of d.evenements) {
    const source = NOM_SOURCE[e.source] ?? e.source;
    switch (e.type) {
      case "INSCRIPTION":
        res.push({ id: e.id, date: e.survenuLe, type: "inscription", titre: e.classeId === d.situation.classe?.id ? `Inscription en ${d.situation.classe.libelle}` : "Inscription", detail: `${etab(e.etablissementId)} · année ${e.anneeScolaire}`, source, accent: false });
        break;
      case "TRANSFERT":
        res.push({ id: e.id, date: e.survenuLe, type: "transfert", titre: "Transfert d'établissement", detail: `${etab(e.deEtablissementId)} → ${etab(e.versEtablissementId)} · le dossier a suivi, sans ressaisie`, source, accent: true });
        break;
      case "PASSAGE":
        res.push({ id: e.id, date: e.survenuLe, type: "passage", titre: e.decision === "admis" ? `Passage en ${e.versNiveau}` : `Redoublement en ${e.deNiveau}`, detail: `Décision du conseil de classe · année ${e.anneeScolaire}`, source, accent: false });
        break;
      case "RESULTAT_EXAMEN":
        res.push({ id: e.id, date: e.survenuLe, type: "examen", titre: `${e.examen} ${e.admis ? "obtenu" : "non obtenu"}`, detail: `Session ${e.session} · moyenne ${e.moyenne.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}/20`, source, accent: false });
        break;
      case "CERTIFICATION":
        res.push({ id: e.id, date: e.survenuLe, type: "diplome", titre: `Diplôme délivré : ${e.examen}`, detail: `Mention ${e.mention} · vérifiable en ligne par QR code`, source, accent: true });
        break;
      case "ABANDON":
        res.push({ id: e.id, date: e.survenuLe, type: "abandon", titre: "Interruption de scolarité", detail: `Année ${e.anneeScolaire}`, source, accent: false });
        break;
      case "REPRISE":
        res.push({ id: e.id, date: e.survenuLe, type: "reprise", titre: "Reprise de scolarité", detail: `${etab(e.etablissementId)} · année ${e.anneeScolaire}`, source, accent: true });
        break;
      default:
        break;
    }
  }
  // Un bilan par trimestre noté (plutôt qu'une ligne par note).
  const cles = new Map<string, NoteEffective[]>();
  for (const n of notes) { const k = `${n.anneeScolaire}|${n.trimestre}`; cles.set(k, [...(cles.get(k) ?? []), n]); }
  for (const [k, l] of cles) {
    const [annee, t] = k.split("|");
    const moy = moyenneGenerale(notes, annee!, Number(t));
    const derniere = l.map((x) => x.survenuLe).sort().at(-1)!;
    res.push({ id: `bilan-${k}`, date: derniere, type: "bilan", titre: `Bilan du ${libelleTrimestre(Number(t))}`, detail: `${l.length} évaluation${l.length > 1 ? "s" : ""} · moyenne ${moy == null ? "—" : moy.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/20 · année ${annee}`, source: "BEILE", accent: false });
  }
  return res.sort((a, b) => b.date.localeCompare(a.date));
}

/* ================================================================== Orientation (indicative) */

/**
 * Pistes d'orientation INDICATIVES : l'API ne fournit aucun modèle d'orientation. On se limite à une lecture
 * transparente des moyennes réelles, avec des pondérations affichées (chaque filière somme à 1, donc la
 * « couverture » est directement la part des critères réellement évalués). Une matière non évaluée n'est
 * jamais remplacée par une valeur arbitraire : elle réduit la couverture, affichée à côté du score.
 * Les matières référencées sont exactement celles du référentiel `MATIERES` — rien d'inventé.
 */
export const FILIERES = [
  { code: "C", nom: "Série C — mathématiques et sciences physiques", poids: { Mathématiques: 0.5, "Sciences physiques": 0.3, SVT: 0.2 } },
  { code: "D", nom: "Série D — sciences expérimentales", poids: { SVT: 0.4, Mathématiques: 0.3, "Sciences physiques": 0.3 } },
  { code: "A1", nom: "Série A1 — lettres et sciences humaines", poids: { Français: 0.5, "Histoire-Géographie": 0.3, "Éducation civique": 0.2 } },
  { code: "A2", nom: "Série A2 — langues étrangères", poids: { Anglais: 0.5, Français: 0.3, "Histoire-Géographie": 0.2 } },
  { code: "T1", nom: "Filière technique — tertiaire et gestion", poids: { Mathématiques: 0.35, Français: 0.3, "Histoire-Géographie": 0.35 } },
  { code: "T2", nom: "Filière technique — industriel et génie", poids: { Mathématiques: 0.4, "Sciences physiques": 0.4, SVT: 0.2 } },
] as const;

export interface PisteOrientation {
  code: string; nom: string; score: number | null; couverture: number;
  criteres: { matiere: string; poids: number; moyenne: number | null; nb: number }[];
  /** Part des critères qui jouent en faveur de cette piste (moyenne ≥ score de la piste), sur les matières évaluées. */
  solidite: number | null;
  /** Écart (en points /20) avec la piste de tête du classement ; null pour la piste de tête. */
  ecartTete: number | null;
  /** La tête est-elle robuste : même 1ʳᵉ piste avec une pondération égale (sans barème) et assez évaluée ? */
  teteRobuste: boolean;
  /** La piste gagne (+) ou perd (−) des places quand on retire le barème officiel (pondération égale). */
  deltaSansBareme: number | null;
}

/** Une piste « fiable » à montrer en tête : couverte à ≥ 0,6 et nettement devant (≥ 0,5 point). */
export function estTeteValide(p: PisteOrientation): boolean {
  return p.couverture >= 0.6 && (p.ecartTete == null || p.ecartTete >= 0.5);
}

/**
 * Calcule les pistes avec le barème officiel, puis une passe à pondération égale entre matières évaluées.
 * La comparaison des deux classements révèle si le barème *fabrique* la tête (deltaSansBareme / teteRobuste) :
 * une tête qui saute à une pondération neutre mérite d'être présentée avec prudence.
 */
export function pistesOrientation(notes: NoteEffective[], annee: string | null): PisteOrientation[] {
  const moyennes = new Map(moyennesParMatiere(notes, annee).map((m) => [m.matiere as string, m]));
  const unePiste = (f: (typeof FILIERES)[number], bareme: boolean): Omit<PisteOrientation, "ecartTete" | "teteRobuste" | "deltaSansBareme"> => {
    const criteres = Object.entries(f.poids).map(([matiere, poids]) => ({ matiere, poids, moyenne: moyennes.get(matiere)?.moyenne ?? null, nb: moyennes.get(matiere)?.nb ?? 0 }));
    const evalues = criteres.filter((c) => c.moyenne != null);
    const couverture = evalues.reduce((s, c) => s + c.poids, 0);
    const w = bareme ? (c: (typeof criteres)[number]) => c.poids : () => 1;
    const sommePoids = evalues.reduce((s, c) => s + w(c), 0);
    const score = sommePoids > 0 ? evalues.reduce((s, c) => s + c.moyenne! * w(c), 0) / sommePoids : null;
    const solidite = evalues.length ? evalues.filter((c) => score != null && c.moyenne! >= score).length / evalues.length : null;
    return { code: f.code, nom: f.nom, score, couverture, criteres, solidite };
  };

  const avecBarème = FILIERES.map((f) => unePiste(f, true)).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const sansBarème = FILIERES.map((f) => unePiste(f, false)).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const rangSans = new Map(sansBarème.map((p, i) => [p.code, i]));
  const tete = avecBarème[0];
  const teteCode = tete?.score != null ? tete.code : null;

  return avecBarème.map((p, i) => {
    const teteRobuste = i === 0 ? teteCode != null && sansBarème[0]?.code === teteCode && p.couverture >= 0.6 && p.score != null : false;
    const rang = rangSans.get(p.code);
    return {
      ...p,
      ecartTete: i === 0 ? null : (tete?.score ?? null) != null && p.score != null ? (tete!.score ?? 0) - p.score : null,
      teteRobuste,
      deltaSansBareme: rang != null ? rang - i : null,
    };
  });
}
