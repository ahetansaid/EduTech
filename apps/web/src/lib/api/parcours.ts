"use client";

import type { Apprenant, Certificat, Classe, Evenement, Matiere, ResultatVerification, SourceDonnee } from "@beile/contracts";
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

/** Fait ajouté par un responsable légal (POST /famille/absences/justification) : référence les absences d'origine. */
export interface JustificationAbsence {
  type: "JUSTIFICATION_ABSENCE";
  id: string; survenuLe: string; enregistreLe: string; auteurId: string; source: SourceDonnee; etablissementId: string | null;
  apprenantId: string; absenceIds: string[]; dates: string[]; classeId: string | null; motif: string;
}
export type EvenementDossier = Evenement | JustificationAbsence;

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
  statut: "justifiee" | "transmise" | "a_justifier";
  motif: string | null; transmiseLe: string | null;
}

/** Absences regroupées par jour, avec leur état : justifiée par l'établissement, justificatif transmis par la famille, ou à justifier. */
export function absencesParJour(evts: EvenementDossier[]): JourAbsence[] {
  const justifs = new Map<string, JustificationAbsence>();
  for (const e of evts) if (e.type === "JUSTIFICATION_ABSENCE") for (const id of e.absenceIds ?? []) justifs.set(id, e);
  const jours = new Map<string, JourAbsence>();
  for (const e of evts) {
    if (e.type !== "ABSENCE") continue;
    const j = jours.get(e.date) ?? { date: e.date, ids: [], classeId: e.classeId, statut: "justifiee" as const, motif: null, transmiseLe: null };
    j.ids.push(e.id);
    const justif = justifs.get(e.id);
    const statut: JourAbsence["statut"] = e.justifiee ? "justifiee" : justif ? "transmise" : "a_justifier";
    const rang = { a_justifier: 0, transmise: 1, justifiee: 2 } as const;
    if (j.ids.length === 1 || rang[statut] < rang[j.statut]) j.statut = statut;
    if (justif) { j.motif = justif.motif; j.transmiseLe = justif.survenuLe; }
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
 * transparente des moyennes réelles, avec des pondérations affichées. Une matière non évaluée n'est jamais
 * remplacée par une valeur arbitraire : elle réduit la « couverture » de la piste, affichée à côté du score.
 */
export const FILIERES = [
  { code: "C", nom: "Série C — mathématiques et sciences physiques", poids: { Mathématiques: 0.5, "Sciences physiques": 0.5 } },
  { code: "D", nom: "Série D — sciences de la vie et de la Terre", poids: { SVT: 0.5, Mathématiques: 0.25, "Sciences physiques": 0.25 } },
  { code: "A", nom: "Série A — lettres et langues", poids: { Français: 0.5, Anglais: 0.3, "Histoire-Géographie": 0.2 } },
  { code: "T", nom: "Enseignement technique et professionnel", poids: { Mathématiques: 0.4, "Sciences physiques": 0.3, Français: 0.3 } },
] as const;

export interface PisteOrientation {
  code: string; nom: string; score: number | null; couverture: number;
  criteres: { matiere: string; poids: number; moyenne: number | null; nb: number }[];
}

export function pistesOrientation(notes: NoteEffective[], annee: string | null): PisteOrientation[] {
  const moyennes = new Map(moyennesParMatiere(notes, annee).map((m) => [m.matiere as string, m]));
  return FILIERES.map((f) => {
    const criteres = Object.entries(f.poids).map(([matiere, poids]) => ({ matiere, poids, moyenne: moyennes.get(matiere)?.moyenne ?? null, nb: moyennes.get(matiere)?.nb ?? 0 }));
    const evalues = criteres.filter((c) => c.moyenne != null);
    const couverture = evalues.reduce((s, c) => s + c.poids, 0);
    const score = couverture > 0 ? evalues.reduce((s, c) => s + c.moyenne! * c.poids, 0) / couverture : null;
    return { code: f.code, nom: f.nom, score, couverture, criteres };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}
