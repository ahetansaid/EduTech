"use client";

import type { Matiere } from "@beile/contracts";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { notifier } from "@/components/ui/Notifications";
import { ecrire, ErreurApi, lire } from "@/lib/http";
import { declarerVerification, estErreurReseau, lireFile, mettreEnFile, synchroniser, type SaisieEnAttente } from "@/lib/fileHorsConnexion";

/* ================================================================== Types (reflet exact des réponses de l'API) */

export interface EnseignantResume { id: string; nom: string; prenoms: string; grade: string; matieres: Matiere[]; etablissementId: string }

/** GET /moi/classes */
export interface ClasseEnseignant {
  id: string; libelle: string; niveau: string; capacite: number; etablissement: string | null;
  matieres: Matiere[]; principal: boolean; effectif: number; absentsDuJour: number; moyenne: number | null;
}
export interface MesClasses { enseignant: EnseignantResume; trimestre?: number; date?: string; classes: ClasseEnseignant[] }

/** GET /classes/:id */
export interface NoteCarnet { id: string; matiere: Matiere; trimestre: number; note: number; corrigee: boolean; le: string }
export interface EleveCarnet {
  id: string; nom: string; prenoms: string; sexe: "M" | "F"; besoinsParticuliers: boolean;
  notes: NoteCarnet[]; absences: number; absentAujourdhui: boolean; moyenneTrimestre: number | null;
}
export interface Carnet {
  classe: { id: string; libelle: string; niveau: string; capacite: number; etablissementId: string; anneeScolaire: string };
  matieres: Matiere[]; lecture: boolean; trimestre: number; date: string; eleves: EleveCarnet[];
}

/** GET /classes/:id/historique (complément enseignant) */
export interface AppelHistorique { date: string; saisiLe: string; absents: { id: string; apprenantId: string; justifiee: boolean }[] }
export interface CorrectionHistorique {
  id: string; le: string; evenementCorrigeId: string; apprenantId: string; matiere: Matiere; trimestre: number;
  noteInitiale: number; notePrecedente: number; nouvelleNote: number; motif: string;
}
export interface HistoriqueClasse { classeId: string; appels: AppelHistorique[]; corrections: CorrectionHistorique[] }

/** GET /moi/carriere */
export interface Carriere {
  enseignant: EnseignantResume & { npi: string; sexe: "M" | "F"; dateRecrutement: string };
  affectations: { id: string; enseignantId: string; etablissementId: string; fonction: string; valideDu: string; valideAu: string | null; etablissement: string }[];
  formations: { id: string; le: string; formation: string; statut: string }[];
  catalogue: { code: string; intitule: string; obligatoire: boolean; duree: string; modalite: string; statut: string | null }[];
  charge: { classes: number; enseignements: number };
}

/* ================================================================== Clés */

export const CLES = {
  racine: ["enseignant"] as const,
  classes: ["enseignant", "classes"] as const,
  carnet: (id: string) => ["enseignant", "classe", id, "carnet"] as const,
  historique: (id: string) => ["enseignant", "classe", id, "historique"] as const,
  carriere: ["enseignant", "carriere"] as const,
};

/** Horodatage PostgreSQL (« 2026-02-13 15:00:00+00 ») → ISO 8601 lisible partout. */
export const versIso = (s: string) => {
  if (s.includes("T")) return s;
  const t = s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
};

/** Date de l'appel (AAAA-MM-JJ), même règle que le serveur. */
export const dateDuJour = () => new Date().toISOString().slice(0, 10);

/* ================================================================== Lectures */

export function useMesClasses(actif = true) {
  return useQuery({ queryKey: CLES.classes, queryFn: ({ signal }) => lire<MesClasses>("/moi/classes", signal), enabled: actif, refetchInterval: 30_000 });
}

export function useCarnet(classeId: string) {
  return useQuery({
    queryKey: CLES.carnet(classeId),
    queryFn: async ({ signal }) => {
      const c = await lire<Carnet>(`/classes/${encodeURIComponent(classeId)}`, signal);
      return { ...c, eleves: c.eleves.map((e) => ({ ...e, notes: e.notes.map((n) => ({ ...n, le: versIso(n.le) })) })) };
    },
    refetchInterval: 30_000,
  });
}

export function useHistorique(classeId: string, actif = true) {
  return useQuery({
    queryKey: CLES.historique(classeId),
    queryFn: ({ signal }) => lire<HistoriqueClasse>(`/classes/${encodeURIComponent(classeId)}/historique`, signal),
    enabled: actif,
  });
}

export function useCarriere(actif = true) {
  return useQuery({ queryKey: CLES.carriere, queryFn: ({ signal }) => lire<Carriere>("/moi/carriere", signal), enabled: actif });
}

/* ================================================================== Écritures (avec repli hors connexion) */

export type Resultat = { etat: "enregistre"; ids: string[] } | { etat: "en_attente"; saisie: SaisieEnAttente };

const horsLigne = () => typeof navigator !== "undefined" && !navigator.onLine;

/** Envoi direct si le réseau est là ; sinon (ou si l'envoi échoue faute de réseau) : mise en file persistée. */
async function envoyerOuMettreEnFile(s: Pick<SaisieEnAttente, "type" | "chemin" | "corps" | "libelle" | "classeId">): Promise<Resultat> {
  // Des saisies plus anciennes attendent : on respecte l'ordre de saisie en passant derrière elles.
  if (horsLigne() || lireFile().length > 0) {
    const saisie = mettreEnFile(s);
    if (!horsLigne()) void synchroniser();
    return { etat: "en_attente", saisie };
  }
  try {
    const r = await ecrire<{ enregistres?: string[]; enregistre?: string }>(s.chemin, s.corps);
    return { etat: "enregistre", ids: r.enregistres ?? (r.enregistre ? [r.enregistre] : []) };
  } catch (e) {
    if (estErreurReseau(e)) return { etat: "en_attente", saisie: mettreEnFile(s) };
    throw e;
  }
}

export interface CorpsAppel { classeId: string; date: string; apprenantIds: string[] }

/** Appel : mise à jour optimiste du carnet et des cartes « Mes classes ». La confirmation est animée par l'écran. */
export function useAppelMutation(classeId: string, libelleClasse: string) {
  const client = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: (corps: CorpsAppel) => envoyerOuMettreEnFile({
      type: "appel", chemin: "/evenements/absences", corps: { ...corps }, classeId,
      libelle: `Appel ${libelleClasse} · ${corps.apprenantIds.length} absent${corps.apprenantIds.length > 1 ? "s" : ""}`,
    }),
    onMutate: async (corps) => {
      await client.cancelQueries({ queryKey: CLES.carnet(classeId) });
      const avant = client.getQueryData<Carnet>(CLES.carnet(classeId));
      const avantClasses = client.getQueryData<MesClasses>(CLES.classes);
      const ids = new Set(corps.apprenantIds);
      if (avant && corps.date === avant.date) {
        client.setQueryData<Carnet>(CLES.carnet(classeId), {
          ...avant,
          eleves: avant.eleves.map((e) => (ids.has(e.id) && !e.absentAujourdhui ? { ...e, absentAujourdhui: true, absences: e.absences + 1 } : e)),
        });
      }
      if (avantClasses) {
        client.setQueryData<MesClasses>(CLES.classes, { ...avantClasses, classes: avantClasses.classes.map((c) => (c.id === classeId ? { ...c, absentsDuJour: c.absentsDuJour + ids.size } : c)) });
      }
      return { avant, avantClasses };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.avant) client.setQueryData(CLES.carnet(classeId), ctx.avant);
      if (ctx?.avantClasses) client.setQueryData(CLES.classes, ctx.avantClasses);
    },
    onSettled: (r) => {
      if (r?.etat === "en_attente") return; // l'état optimiste reste affiché ; la synchronisation invalidera
      void client.invalidateQueries({ queryKey: CLES.carnet(classeId) });
      void client.invalidateQueries({ queryKey: CLES.historique(classeId) });
      void client.invalidateQueries({ queryKey: CLES.classes });
    },
  });
}

export interface CorpsNotes { classeId: string; matiere: Matiere; trimestre: number; notes: { apprenantId: string; note: number }[] }

export function useNotesMutation(classeId: string, libelleClasse: string) {
  const client = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: (corps: CorpsNotes) => envoyerOuMettreEnFile({
      type: "notes", chemin: "/evenements/evaluations", corps: { ...corps }, classeId,
      libelle: `Notes ${corps.matiere} · ${libelleClasse} · ${corps.notes.length} copie${corps.notes.length > 1 ? "s" : ""}`,
    }),
    onSettled: (r) => {
      if (r?.etat === "en_attente") return;
      void client.invalidateQueries({ queryKey: CLES.carnet(classeId) });
      void client.invalidateQueries({ queryKey: CLES.classes });
    },
  });
}

export interface CorpsCorrection { evenementCorrigeId: string; nouvelleNote: number; motif: string }

export function useCorrectionMutation(classeId: string, libelleClasse: string) {
  const client = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: (c: CorpsCorrection & { eleve: string }) => envoyerOuMettreEnFile({
      type: "correction", chemin: "/evenements/corrections", classeId,
      corps: { evenementCorrigeId: c.evenementCorrigeId, nouvelleNote: c.nouvelleNote, motif: c.motif },
      libelle: `Correction · ${c.eleve} · ${libelleClasse}`,
    }),
    onSuccess: (r) => {
      if (r.etat === "enregistre") notifier({ ton: "succes", titre: "Note corrigée", texte: "La note d'origine reste tracée au registre, avec votre motif." });
      else notifier({ ton: "avertissement", titre: "Correction conservée sur l'appareil", texte: "Elle sera envoyée au retour du réseau." });
    },
    onSettled: (r) => {
      if (r?.etat === "en_attente") return;
      void client.invalidateQueries({ queryKey: CLES.carnet(classeId) });
      void client.invalidateQueries({ queryKey: CLES.historique(classeId) });
      void client.invalidateQueries({ queryKey: CLES.classes });
    },
  });
}

/** Inscription à une formation : un 409 (« déjà inscrit ») est une réponse, pas une panne. */
export function useInscriptionFormation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (f: { code: string; intitule: string }) => {
      try {
        await ecrire<{ enregistre: string; statut: string }>("/moi/formations", { code: f.code });
        return { deja: false, ...f };
      } catch (e) {
        if (e instanceof ErreurApi && e.statut === 409) return { deja: true, ...f };
        throw e;
      }
    },
    onSuccess: (r) => notifier(r.deja
      ? { ton: "info", titre: "Déjà inscrit", texte: `Vous êtes déjà inscrit à « ${r.intitule} ».` }
      : { ton: "succes", titre: "Inscription enregistrée", texte: `« ${r.intitule} » figure désormais dans votre parcours.` }),
    onSettled: () => client.invalidateQueries({ queryKey: CLES.carriere }),
  });
}

/* ================================================================== Synchronisation de la file */

/**
 * Idempotence de l'appel : avant de rejouer, on relit l'historique serveur de la classe
 * et on retire les élèves déjà enregistrés absents à la date de l'appel.
 */
declarerVerification("appel", async (s) => {
  const corps = s.corps as unknown as CorpsAppel;
  const h = await lire<HistoriqueClasse>(`/classes/${encodeURIComponent(corps.classeId)}/historique`);
  const deja = new Set(h.appels.find((a) => a.date === corps.date)?.absents.map((a) => a.apprenantId) ?? []);
  const restants = corps.apprenantIds.filter((id) => !deja.has(id));
  return restants.length ? { ...corps, apprenantIds: restants } : null;
});

let vidageEnCours = false;
async function vider(client: QueryClient) {
  if (vidageEnCours || !lireFile().length || horsLigne()) return;
  vidageEnCours = true;
  try {
    const bilan = await synchroniser();
    if (bilan.envoyees.length) {
      notifier({ ton: "succes", titre: `${bilan.envoyees.length} saisie${bilan.envoyees.length > 1 ? "s" : ""} synchronisée${bilan.envoyees.length > 1 ? "s" : ""}`, texte: bilan.envoyees.map((s) => s.libelle).slice(0, 3).join(" · ") });
    }
    for (const r of bilan.rejetees) notifier({ ton: "critique", titre: "Saisie refusée par le serveur", texte: `${r.saisie.libelle} : ${r.motif}` });
    if (bilan.envoyees.length || bilan.rejetees.length) void client.invalidateQueries({ queryKey: CLES.racine });
  } finally {
    vidageEnCours = false;
  }
}

/** À monter sur chaque écran de l'espace : vide la file à l'ouverture, au retour du réseau et toutes les 30 s. */
export function useSynchronisationEnseignant() {
  const client = useQueryClient();
  useEffect(() => {
    void vider(client);
    const surRetour = () => void vider(client);
    window.addEventListener("online", surRetour);
    const minuterie = window.setInterval(surRetour, 30_000);
    return () => { window.removeEventListener("online", surRetour); window.clearInterval(minuterie); };
  }, [client]);
  return () => vider(client);
}

/* ================================================================== Validation des notes */

/** « 12,5 » → 12.5 ; null si vide ; message si invalide (0–20, au quart de point). */
export function analyserNote(brut: string): { valeur: number | null; erreur: string | null } {
  const t = brut.trim().replace(",", ".");
  if (!t) return { valeur: null, erreur: null };
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(t)) return { valeur: null, erreur: "Format : 12 ou 12,5" };
  const n = Number(t);
  if (n < 0 || n > 20) return { valeur: null, erreur: "Entre 0 et 20" };
  if (!Number.isInteger(n * 4)) return { valeur: null, erreur: "Au quart de point (,25 ,5 ,75)" };
  return { valeur: n, erreur: null };
}
