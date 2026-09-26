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

export interface EtapeCircuit { ordre: number; code: string; role: string; delaiJours: number }
export interface DecisionCircuit { id: string; demandeId: string; etape: string; auteurId: string; decision: "valide" | "refuse" | "renvoye"; motif: string | null; horodatage: string }
export interface DemandeDetail {
  demande: Demande & { demandeur: string | null; etablissement: string | null };
  modele: { code: string; libelle: string; etapes: EtapeCircuit[] };
  etapeCourante: EtapeCircuit | null;
  peutStatuer: boolean;
  decisions: DecisionCircuit[];
}

export type ExamenCertifiable = "CEP" | "BEPC" | "BAC";

export interface Examens {
  examen: ExamenCertifiable;
  session: string;
  niveau: string;
  classes: string[];
  candidats: { id: string; nom: string; classe: string; moyenne: number | null }[];
  deliberee: boolean;
  certificats: (Certificat & { titulaire: string })[];
}

export interface DossierGestion {
  decision: DecisionAcces;
  apprenant: { id: string; nom: string; prenoms: string; sexe: "F" | "M"; dateNaissance: string; statutIdentite: StatutIdentite; besoinsParticuliers: boolean };
  situation: { statut: "scolarise" | "abandon" | "non_inscrit"; etablissementId: string | null; etablissement: string | null; classeId: string | null; classe: string | null; niveau: string | null; anneeScolaire: string | null };
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

export interface JustificatifAbsence {
  id: string; apprenantId: string | null; nom: string | null; dates: string[]; absenceIds: string[];
  motif: string; classeId: string | null; declarantNpi: string | null; transmisLe: string;
  statut: "en_attente" | "validee" | "refusee"; decisionMotif: string | null; decideLe: string | null;
}

export interface Justificatifs { enAttente: number; peutStatuer: boolean; justificatifs: JustificatifAbsence[] }

/** Enseignant rattaché à l'établissement (désignation du professeur principal). */
export interface EnseignantEtablissement { id: string; nom: string; matieres: string[] }

/** Décision individuelle rendue par le conseil de passage. */
export interface DecisionPassage { apprenantId: string; decision: "admis" | "redouble" }

/** Une demande en attente de décision dans la file transversale de l'utilisateur (rôle de l'étape + périmètre). */
export interface DemandeATraiter extends Demande {
  etablissement: string | null;
  modeleLibelle: string;
  etapeRole: string;
}

export type CorpsInscription =
  | { classeId: string; npi: string }
  | { classeId: string; sansActe: { nom: string; prenoms: string; sexe: "F" | "M"; dateNaissance: string; responsable: string } };

/* ------------------------------------------------------------------ Clés */

export const cles = {
  tout: ["etablissement"] as const,
  tableau: (id: string) => ["etablissement", id, "tableau"] as const,
  eleves: (id: string) => ["etablissement", id, "eleves"] as const,
  enseignants: (id: string) => ["etablissement", id, "enseignants"] as const,
  absences: (id: string, date: string) => ["etablissement", id, "absences", date] as const,
  demandes: (id: string) => ["etablissement", id, "demandes"] as const,
  demande: (demandeId: string) => ["etablissement", "demande", demandeId] as const,
  aTraiter: ["etablissement", "a-traiter"] as const,
  justificatifs: (id: string) => ["etablissement", id, "justificatifs"] as const,
  examens: (id: string, examen: ExamenCertifiable) => ["etablissement", id, "examens", examen] as const,
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

/** Enseignants de l'établissement : désignation du professeur principal d'une classe. */
export function useEnseignantsEtablissement(id: string | null) {
  return useQuery({
    queryKey: cles.enseignants(id ?? "-"),
    queryFn: ({ signal }) => lire<EnseignantEtablissement[]>(`/etablissements/${e(id!)}/enseignants`, signal),
    enabled: !!id,
    staleTime: 300_000,
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

export function useExamens(id: string | null, examen: ExamenCertifiable = "BEPC") {
  return useQuery({
    queryKey: cles.examens(id ?? "-", examen),
    queryFn: ({ signal }) => lire<Examens>(`/etablissements/${e(id!)}/examens?examen=${e(examen)}`, signal),
    enabled: !!id,
  });
}

/** Détail d'une demande en circuit : étapes, décisions rendues, et droit d'agir de l'utilisateur courant. */
export function useDemandeDetail(demandeId: string | null) {
  return useQuery({
    queryKey: cles.demande(demandeId ?? "-"),
    queryFn: ({ signal }) => lire<DemandeDetail>(`/demandes/${e(demandeId!)}`, signal),
    enabled: !!demandeId,
  });
}

/** File « demandes à traiter » : toutes les demandes dont l'étape courante relève de l'utilisateur (rôle + périmètre). */
export function useDemandesATraiter(actif: boolean) {
  return useQuery({
    queryKey: cles.aTraiter,
    queryFn: ({ signal }) => lire<DemandeATraiter[]>("/demandes/a-traiter", signal),
    enabled: actif,
    refetchInterval: 30_000,
  });
}

/** Justificatifs d'absence transmis par les familles, avec leur état. Rafraîchi toutes les 30 s. */
export function useJustificatifs(id: string | null) {
  return useQuery({
    queryKey: cles.justificatifs(id ?? "-"),
    queryFn: ({ signal }) => lire<Justificatifs>(`/etablissements/${e(id!)}/justificatifs`, signal),
    enabled: !!id,
    refetchInterval: 30_000,
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

export function useDecisionJustificatifMutation(id: string | null) {
  const invalider = useInvalider();
  return useMutation({
    mutationFn: (v: { justificationId: string; decision: "validee" | "refusee"; motif?: string }) =>
      ecrire<{ enregistre: string; decision: string }>(`/etablissements/${e(id!)}/justificatifs/${e(v.justificationId)}/decision`, { decision: v.decision, ...(v.motif ? { motif: v.motif } : {}) }),
    onSuccess: invalider,
  });
}

export function useDeliberationMutation(id: string | null) {
  const invalider = useInvalider();
  return useMutation({
    mutationFn: (v: { examen: ExamenCertifiable; session: string }) => ecrire<{ examen: string; session: string; candidats: number; nonJuges: number; diplomes: number }>(`/etablissements/${e(id!)}/examens/deliberation`, v),
    onSettled: invalider,
  });
}

/** Statuer sur l'étape courante d'une demande (valider / refuser / renvoyer). Invalide tout l'espace établissement. */
export function useDecisionDemandeMutation() {
  const invalider = useInvalider();
  return useMutation({
    mutationFn: (v: { demandeId: string; decision: "valide" | "refuse" | "renvoye"; motif?: string }) =>
      ecrire<{ demandeId: string; decision: string; etape: string; statut: string }>(`/demandes/${e(v.demandeId)}/decision`, { decision: v.decision, ...(v.motif ? { motif: v.motif } : {}) }),
    onSuccess: invalider,
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

/** Éditer une classe (capacité, professeur principal). Le tableau de bord est invalidé après succès. */
export function useModifierClasseMutation(id: string | null) {
  const invalider = useInvalider();
  return useMutation({
    mutationFn: (v: { classeId: string; capacite: number; enseignantPrincipalId: string | null }) =>
      ecrire<{ id: string; capacite: number }>(`/etablissements/${e(id!)}/classes/${e(v.classeId)}`, { capacite: v.capacite, enseignantPrincipalId: v.enseignantPrincipalId }),
    onSuccess: invalider,
  });
}

/** Conseil de passage : décisions prononcées pour la classe, réinscription dans l'année suivante. */
export function useConseilPassageMutation(id: string | null) {
  const invalider = useInvalider();
  return useMutation({
    mutationFn: (v: { classeId: string; anneeScolaire: string; decisions: DecisionPassage[] }) =>
      ecrire<{ classeId: string; admis: number; maintenus: number; divisionsCrees: string[] }>(`/etablissements/${e(id!)}/classes/${e(v.classeId)}/conseil-passage`, { anneeScolaire: v.anneeScolaire, decisions: v.decisions }),
    onSuccess: invalider,
  });
}
