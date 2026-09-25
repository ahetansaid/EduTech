"use client";

import type { Certificat, DecisionAcces, Evenement, StatutIdentite } from "@beile/contracts";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ecrire, ErreurApi, lire } from "@/lib/http";

/**
 * Espace établissement (chef d'établissement) — types exacts des réponses de l'API et hooks TanStack Query.
 * Routes : apps/api/src/etablissement.ts, parcours.ts, app.ts et complements-etablissement.ts.
 */

/* ------------------------------------------------------------------ Types de réponse */

export interface ClasseTableau {
  id: string; libelle: string; niveau: string; capacite: number; effectif: number;
  moyenne: number | null; absentsDuJour: number; professeurPrincipal: string | null;
}

export interface EleveEnBaisse { apprenantId: string; nom?: string; notes: number[]; baisse: number | null }

export interface Tableau {
  etablissement: { id: string; nom: string; communeId: string; circonscription: string; capacite: number; cycle: "primaire" | "secondaire" };
  date: string;
  trimestre: number;
  chiffres: { apprenants: number; capacite: number; enseignants: number; moyenne: number | null; absentsDuJour: number };
  classes: ClasseTableau[];
  alertes: {
    baisse: EleveEnBaisse[];
    regularisations: { id: string; nom?: string }[];
    enseignantsSansFormation: number;
    formationObligatoire: string;
    surcharges: { classe: string; effectif: number; capacite: number }[];
  };
  absencesDuJour: { id: string; apprenantId: string | null; nom?: string | null; classe?: string; enregistreLe: string }[];
}

export interface EleveLigne {
  id: string; nom: string; prenoms: string; sexe: "F" | "M"; dateNaissance: string; statutIdentite: StatutIdentite;
  classeId: string; classe: string; moyenne: number | null; absences: number; baisseMaths: number[] | null;
}

export type Absence = Extract<Evenement, { type: "ABSENCE" }>;

export interface Demande {
  id: string; modele: string; objet: string; demandeurId: string; ressource: string | null; etapeCourante: string;
  statut: "ouverte" | "en_cours" | "acceptee" | "refusee" | "close"; creeeLe: string; echeance: string | null;
}

export interface Examens {
  session: string;
  classes: string[];
  candidats: { id: string; nom: string; classe: string; moyenne: number | null }[];
  deliberee: boolean;
  certificats: (Certificat & { titulaire: string })[];
}

export interface DossierGestion {
  decision: DecisionAcces;
  apprenant: { id: string; nom: string; prenoms: string; sexe: "F" | "M"; dateNaissance: string; statutIdentite: StatutIdentite; besoinsParticuliers: boolean };
  situation: { statut: "scolarise" | "abandon" | "non_inscrit"; etablissementId: string | null; etablissement: string | null; classeId: string | null; classe: string | null; niveau: string | null };
  trimestre: number;
  moyennes: { matiere: string; moyenne: number; nombre: number }[];
  absences: number;
  evenements: Evenement[];
  certificats: Certificat[];
  etablissements: Record<string, string>;
  classes: Record<string, string>;
  actions: { transfert: boolean; abandon: boolean };
}

export interface ClasseAccueil {
  id: string; libelle: string; capacite: number; effectif: number; places: number;
  etablissementId: string; etablissement: string; communeId: string;
}

export interface PersonneRegistre {
  npi: string; nom: string; prenoms: string; dateNaissance: string; sexe: "F" | "M";
  parents: { nom: string; prenoms: string; sexe: "F" | "M" }[];
  dejaInscrit: boolean;
}

export interface ResultatInscription { apprenantId: string; statutIdentite: StatutIdentite; evenements: string[] }

export type CorpsInscription =
  | { classeId: string; npi: string }
  | { classeId: string; sansActe: { nom: string; prenoms: string; sexe: "F" | "M"; dateNaissance: string; responsable: string } };

/* ------------------------------------------------------------------ Clés */

export const cles = {
  tout: ["etablissement"] as const,
  tableau: (id: string) => ["etablissement", id, "tableau"] as const,
  eleves: (id: string) => ["etablissement", id, "eleves"] as const,
  absences: (id: string, date: string) => ["etablissement", id, "absences", date] as const,
  demandes: (id: string) => ["etablissement", id, "demandes"] as const,
  examens: (id: string) => ["etablissement", id, "examens"] as const,
  dossier: (apprenantId: string) => ["etablissement", "dossier", apprenantId] as const,
  accueil: (apprenantId: string, q: string) => ["etablissement", "classes-accueil", apprenantId, q] as const,
  registre: (nom: string, prenoms: string) => ["etablissement", "registre", nom, prenoms] as const,
};

const e = encodeURIComponent;

/** Date du jour au sens du serveur (UTC, comme `aujourdhui()` côté API). */
export const jourCourant = () => new Date().toISOString().slice(0, 10);

/** Décision d'accès renvoyée par l'API avec un 403 (dossier individuel refusé). */
export function decisionDuRefus(err: unknown): DecisionAcces | null {
  if (!(err instanceof ErreurApi) || !err.refus) return null;
  const d = (err.details as { decision?: DecisionAcces } | null)?.decision;
  return d ?? null;
}

/* ------------------------------------------------------------------ Lectures */

export function useTableau(id: string | null) {
  return useQuery({
    queryKey: cles.tableau(id ?? "-"),
    queryFn: ({ signal }) => lire<Tableau>(`/etablissements/${e(id!)}/tableau`, signal),
    enabled: !!id,
    refetchInterval: 60_000,
  });
}

export function useEleves(id: string | null) {
  return useQuery({
    queryKey: cles.eleves(id ?? "-"),
    queryFn: ({ signal }) => lire<EleveLigne[]>(`/etablissements/${e(id!)}/eleves`, signal),
    enabled: !!id,
    staleTime: 60_000,
  });
}

/** Absences du jour : rafraîchies toutes les 15 s — l'appel d'un enseignant apparaît ici sans rechargement. */
export function useAbsencesDuJour(id: string | null, date = jourCourant()) {
  return useQuery({
    queryKey: cles.absences(id ?? "-", date),
    queryFn: ({ signal }) => lire<Absence[]>(`/etablissements/${e(id!)}/absences?date=${e(date)}`, signal),
    enabled: !!id,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
}

export function useDemandes(id: string | null) {
  return useQuery({
    queryKey: cles.demandes(id ?? "-"),
    queryFn: ({ signal }) => lire<Demande[]>(`/etablissements/${e(id!)}/demandes`, signal),
    enabled: !!id,
    refetchInterval: 30_000,
    select: (l) => [...l].sort((a, b) => b.creeeLe.localeCompare(a.creeeLe)),
  });
}

export function useExamens(id: string | null) {
  return useQuery({
    queryKey: cles.examens(id ?? "-"),
    queryFn: ({ signal }) => lire<Examens>(`/etablissements/${e(id!)}/examens`, signal),
    enabled: !!id,
  });
}

export function useDossier(apprenantId: string) {
  return useQuery({
    queryKey: cles.dossier(apprenantId),
    queryFn: ({ signal }) => lire<DossierGestion>(`/apprenants/${e(apprenantId)}/dossier-gestion`, signal),
    enabled: /^APP-\d{6}$/.test(apprenantId),
    staleTime: 60_000,
  });
}

export function useClassesAccueil(apprenantId: string, q: string, actif: boolean) {
  return useQuery({
    queryKey: cles.accueil(apprenantId, q),
    queryFn: ({ signal }) => lire<{ niveau: string; classes: ClasseAccueil[] }>(`/apprenants/${e(apprenantId)}/classes-accueil${q ? `?q=${e(q)}` : ""}`, signal),
    enabled: actif,
    placeholderData: keepPreviousData,
  });
}

export function useRechercheRegistre(nom: string, prenoms: string, actif: boolean) {
  return useQuery({
    queryKey: cles.registre(nom, prenoms),
    queryFn: ({ signal }) => lire<PersonneRegistre[]>(`/registre/personnes?nom=${e(nom)}&prenoms=${e(prenoms)}`, signal),
    enabled: actif && nom.length + prenoms.length >= 2,
    staleTime: 30_000,
  });
}

/* ------------------------------------------------------------------ Écritures (toutes invalident l'espace) */

function useInvalider() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: cles.tout });
}

export function useAccompagnementMutation(id: string | null) {
  const invalider = useInvalider();
  return useMutation({
    mutationFn: (v: { apprenantIds: string[]; objet: string }) => ecrire<{ demandeId: string; etape: string }>(`/etablissements/${e(id!)}/accompagnement`, v),
    onSuccess: invalider,
  });
}

export function useDeliberationMutation(id: string | null) {
  const invalider = useInvalider();
  return useMutation({
    mutationFn: () => ecrire<{ candidats: number; diplomes: number }>(`/etablissements/${e(id!)}/examens/deliberation`),
    onSettled: invalider,
  });
}

export function useTransfertMutation(apprenantId: string) {
  const invalider = useInvalider();
  return useMutation({
    mutationFn: (versClasseId: string) => ecrire<{ enregistre: string }>(`/apprenants/${e(apprenantId)}/transfert`, { versClasseId }),
    onSuccess: invalider,
  });
}

export function useAbandonMutation(apprenantId: string) {
  const invalider = useInvalider();
  return useMutation({
    mutationFn: (motif: string) => ecrire<{ enregistre: string }>(`/apprenants/${e(apprenantId)}/abandon`, { motif }),
    onSuccess: invalider,
  });
}

export function useInscriptionMutation() {
  const invalider = useInvalider();
  return useMutation({
    mutationFn: (corps: CorpsInscription) => ecrire<ResultatInscription>("/inscriptions", corps),
    onSuccess: invalider,
  });
}
