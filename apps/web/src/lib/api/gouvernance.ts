"use client";

import type { Critere, DefinitionIndicateur, Finalite, Perimetre, SourceDonnee } from "@beile/contracts";
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ecrire, lire } from "@/lib/http";

/**
 * Gouvernance, données et administration : journal d'audit (DPO), dictionnaire national, qualité des remontées
 * et relances, interopérabilité, état du service, comptes et accès.
 * Les types reflètent exactement les réponses de l'API : apps/api/src/app.ts (dictionnaire), plateforme.ts,
 * auth.ts (administration des comptes) et complements-gouvernance.ts (journal filtré, statistiques, relances).
 */

/* ================================================================== Types de réponse */

/** Ligne du journal d'audit (table audit.journal, en ajout seul). */
export interface LigneJournal {
  id: string;
  horodatage: string;
  profilId: string;
  profilNom: string;
  action: string;
  ressource: string;
  finalite: Finalite;
  autorise: boolean;
  critereManquant: Critere | null;
}

export interface PageJournal { lignes: LigneJournal[]; total: number; suivant: string | null }

export type FiltreDecision = "tous" | "accordes" | "refuses";
export interface FiltresJournal { decision: FiltreDecision; finalite: Finalite | null; q: string }

export interface StatistiquesAudit {
  horodatage: string;
  totaux: { total: number; refus: number; jour: number; refusJour: number; derniere: string | null };
  refusParCritere: { critere: Critere | "inconnu"; n: number }[];
  parFinalite: { finalite: Finalite; total: number; refus: number }[];
  activite24h: { heure: string; accordes: number; refus: number }[];
  acteursLesPlusRefuses: { profilId: string; profilNom: string; refus: number }[];
}

export interface ImpactVersion {
  code: string; examen: "CEP" | "BEPC" | "BAC"; annee: string;
  inscrits: number; presents: number; admis: number; selonV2: number | null; selonV3: number | null;
}

export interface EtatService {
  horodatage: string;
  service: { version: string; instanceDepuis: string; region: string; memoireMo: number };
  base: { latenceMs: number; postgres?: string; taille?: string };
  registre: { total: number; jour: number; heure: number };
  activite24h: { heure: string; n: number }[];
  securite24h: { consultations: number; refus: number; connexions: number; echecs: number };
  comptes: { comptes: number; actifs: number; sessions: number; verrouilles: number };
}

export interface QualiteCommune {
  communeId: string; commune: string; departementId: string | null;
  attendus: number; transmis: number; completude: number; fraicheurJours: number | null; confiance: number;
}
export interface QualiteDepartement {
  id: string; nom: string; communes: number; attendus: number; transmis: number; completude: number; fraicheurJours: number | null; confiance: number | null;
}
export interface Qualite {
  perimetre: Perimetre;
  annee: string;
  seuilAlerte: number;
  departements: QualiteDepartement[];
  communes: QualiteCommune[];
  relancesOuvertes: number;
}
export interface EtablissementManquant {
  id: string; nom: string; cycle: "primaire" | "secondaire"; statut: "public" | "prive" | "confessionnel" | "communautaire"; circonscription: string; relanceLe: string | null;
}
export interface ResultatRelance { relances: number; dejaOuvertes: number; dejaTransmis: number }
export interface Relance {
  id: string; etablissementId: string; nom: string; communeId: string; commune: string; cycle: "primaire" | "secondaire";
  statut: "ouverte" | "en_cours" | "acceptee" | "refusee" | "close"; etape: string; creeeLe: string; echeance: string | null; transmis: boolean;
}

export type MailleRecoupement = "departement" | "commune";
/** Pourquoi une ligne n'est pas contrôlée, ou l'est : `non_additif` = un ratio ne se somme pas ;
 * `mailles_masquees` = une maille sous le seuil de publication, donc la somme n'est pas reconstituée. */
export type CasRecoupement = "controle" | "non_additif" | "mailles_masquees" | "rendu_par_un_service";
export type VerdictRecoupement = "coherent" | "coherent_arondi" | "ecart_a_verifier";
export interface ControleRecoupement {
  indicateur: string; nom: string; unite: string; cas: CasRecoupement;
  national: number | null; somme: number | null; ecart: number | null;
  /** Borne de l'écart imputable seul à l'arrondi des mailles publiées (0,5 par maille). */
  toleranceArrondi: number; mailles: number; maillesMasquees: number;
  verdict: VerdictRecoupement | null; motif: string;
}
export interface Recoupement { perimetre: Perimetre; maille: MailleRecoupement; controles: ControleRecoupement[] }

export interface Interoperabilite {
  /** `derniere` est l'horodatage PostgreSQL brut (« 2026-09-25 11:04:54.528+00 »). */
  sources: { source: SourceDonnee; total: number; jour: number; derniere: string | null; types: string[] }[];
  registreNational: { personnes: number; apprenants: number; lies: number };
  verificationsDiplomes: { jour: string; n: number }[];
  /** Connecteurs partenaires : ouverts (secret provisionné) ou fermés, et volume réellement reçu. */
  partenaires: {
    id: string; nom: string; source: SourceDonnee; messages: string[]; ouvert: boolean; recus: number; dernier: string | null;
    /** Lots tracés dans core.lots_interop — un lot authentifié et conforme, par type de message. `dernier` est un horodatage PostgreSQL brut. */
    lots: number;
    parMessage: { partenaire: string; message: string; lots: number; jour: number; dernier: string | null }[];
  }[];
}

export interface CompteAdmin {
  id: string; identifiant: string; actif: boolean; derniereConnexion: string | null; verrouilleJusquA: string | null;
  doitChangerMotDePasse: boolean; echecs: number; profilId: string; nomAffiche: string; fonction: string; sessionsActives: number;
}

/* ================================================================== Clés */

export const CLES = {
  journal: (f: FiltresJournal) => ["gouvernance", "audit", "journal", f] as const,
  statsAudit: ["gouvernance", "audit", "statistiques"] as const,
  dictionnaire: ["gouvernance", "dictionnaire"] as const,
  impact: (examen: string) => ["gouvernance", "dictionnaire", "impact", examen] as const,
  etat: ["gouvernance", "plateforme", "etat"] as const,
  qualite: ["gouvernance", "plateforme", "qualite"] as const,
  manquants: (communeId: string) => ["gouvernance", "plateforme", "qualite", "commune", communeId] as const,
  recoupement: (maille: string) => ["gouvernance", "plateforme", "recoupement", maille] as const,
  relances: ["gouvernance", "plateforme", "relances"] as const,
  interop: ["gouvernance", "plateforme", "interoperabilite"] as const,
  comptes: ["gouvernance", "admin", "comptes"] as const,
};

/** Convertit un horodatage PostgreSQL brut (« AAAA-MM-JJ HH:MM:SS+00 ») en ISO 8601 lisible par Date. */
export function isoDepuisPg(v: string | null): string | null {
  if (!v) return null;
  const iso = v.includes("T") ? v : v.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  return Number.isNaN(Date.parse(iso)) ? null : new Date(iso).toISOString();
}

/* ================================================================== Journal d'audit (DPO) */

/** Journal filtré, paginé par curseur ; rafraîchi toutes les 15 s (les nouvelles décisions apparaissent en tête). */
export function useJournalAudit(filtres: FiltresJournal) {
  return useInfiniteQuery({
    queryKey: CLES.journal(filtres),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const p = new URLSearchParams({ limite: "40", decision: filtres.decision });
      if (filtres.finalite) p.set("finalite", filtres.finalite);
      if (filtres.q.trim()) p.set("q", filtres.q.trim());
      if (pageParam) p.set("curseur", pageParam);
      return lire<PageJournal>(`/audit/journal?${p}`, signal);
    },
    getNextPageParam: (derniere) => derniere.suivant,
    refetchInterval: 15_000,
  });
}

export function useStatistiquesAudit() {
  return useQuery({ queryKey: CLES.statsAudit, queryFn: ({ signal }) => lire<StatistiquesAudit>("/audit/statistiques", signal), refetchInterval: 15_000 });
}

/* ================================================================== Dictionnaire national */

export function useDictionnaire() {
  return useQuery({ queryKey: CLES.dictionnaire, queryFn: ({ signal }) => lire<DefinitionIndicateur[]>("/dictionnaire", signal), staleTime: 10 * 60_000 });
}

export function useImpactVersion(examen: "CEP" | "BEPC" | "BAC") {
  return useQuery({
    queryKey: CLES.impact(examen),
    queryFn: ({ signal }) => lire<ImpactVersion>(`/dictionnaire/taux_reussite_examen/impact?examen=${examen}`, signal),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}

/* ================================================================== Plateforme */

/** État du service : mesures prises à chaque appel côté serveur ; rafraîchi toutes les 30 s. */
export function useEtatService() {
  return useQuery({ queryKey: CLES.etat, queryFn: ({ signal }) => lire<EtatService>("/plateforme/etat", signal), refetchInterval: 30_000 });
}

export function useQualite() {
  return useQuery({ queryKey: CLES.qualite, queryFn: ({ signal }) => lire<Qualite>("/plateforme/qualite", signal), refetchInterval: 60_000 });
}

export function useEtablissementsManquants(communeId: string | null) {
  return useQuery({
    queryKey: CLES.manquants(communeId ?? ""),
    queryFn: ({ signal }) => lire<EtablissementManquant[]>(`/plateforme/qualite/communes/${encodeURIComponent(communeId!)}`, signal),
    enabled: !!communeId,
  });
}

/** Recoupement national ↔ mailles : le calcul est mémoïsé côté serveur par cube, périmètre et maille. */
export function useRecoupement(maille: MailleRecoupement) {
  return useQuery({
    queryKey: CLES.recoupement(maille),
    queryFn: ({ signal }) => lire<Recoupement>(`/plateforme/recoupement?maille=${maille}`, signal),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useRelances() {
  return useQuery({ queryKey: CLES.relances, queryFn: ({ signal }) => lire<Relance[]>("/plateforme/relances", signal), refetchInterval: 30_000 });
}

/** Relance de transmission : une demande suivie par établissement ; invalide la qualité, les manquants et le suivi. */
export function useRelancerMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (etablissementIds: string[]) => ecrire<ResultatRelance>("/plateforme/relances", { etablissementIds }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["gouvernance", "plateforme", "qualite"] });
      void client.invalidateQueries({ queryKey: CLES.relances });
    },
  });
}

export function useInteroperabilite() {
  return useQuery({ queryKey: CLES.interop, queryFn: ({ signal }) => lire<Interoperabilite>("/plateforme/interoperabilite", signal), refetchInterval: 60_000 });
}

/* ================================================================== Administration des comptes */

export function useComptes() {
  return useQuery({ queryKey: CLES.comptes, queryFn: ({ signal }) => lire<CompteAdmin[]>("/admin/comptes", signal), refetchInterval: 30_000 });
}

/**
 * Réinitialisation : l'API renvoie le mot de passe temporaire UNE seule fois. Il n'est ni mis en cache
 * (pas de setQueryData), ni journalisé côté client ; seul l'appelant le détient, le temps de l'afficher.
 */
export function useReinitialiserMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ecrire<{ motDePasseTemporaire: string }>(`/admin/comptes/${encodeURIComponent(id)}/reinitialiser`),
    // Le cache des mutations conserve `data` : durée de vie nulle, et l'appelant appelle reset() dès réception.
    gcTime: 0,
    onSuccess: () => { void client.invalidateQueries({ queryKey: CLES.comptes }); },
  });
}

export function useActivationMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, actif }: { id: string; actif: boolean }) => ecrire<{ ok: true }>(`/admin/comptes/${encodeURIComponent(id)}/activation`, { actif }),
    onMutate: async ({ id, actif }) => {
      await client.cancelQueries({ queryKey: CLES.comptes });
      const avant = client.getQueryData<CompteAdmin[]>(CLES.comptes);
      client.setQueryData<CompteAdmin[]>(CLES.comptes, (l) => l?.map((c) => (c.id === id ? { ...c, actif, sessionsActives: actif ? c.sessionsActives : 0 } : c)));
      return { avant };
    },
    onError: (_e, _v, ctx) => { if (ctx?.avant) client.setQueryData(CLES.comptes, ctx.avant); },
    onSettled: () => { void client.invalidateQueries({ queryKey: CLES.comptes }); },
  });
}
