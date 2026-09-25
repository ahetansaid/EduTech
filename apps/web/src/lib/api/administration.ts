"use client";

import type { Habilitation, Role } from "@beile/contracts";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Ton } from "@/components/ui/primitives";
import { ecrire, lire } from "@/lib/http";
import { CLES as CLES_GOUVERNANCE } from "./gouvernance";

/**
 * Administration des utilisateurs et assistance. Les types reflètent exactement les réponses de
 * apps/api/src/administration.ts. Les mots de passe temporaires ne sont jamais mis en cache.
 */

/* ================================================================== Types — utilisateurs */

export interface EtablissementRef { id: string; nom: string; typeInstitution: string; circonscription: string; commune: string; departementId: string }
export interface DepartementRef { id: string; nom: string }
export interface CirconscriptionRef { circonscription: string; departementId: string; departement: string; etablissements: number }
export interface FicheNpi {
  npi: string;
  personne: { nom: string; prenoms: string } | null;
  apprenant: { id: string; nom: string; prenoms: string } | null;
  enseignant: { id: string; etablissementId: string; etablissement: string } | null;
  enfantsLies: number;
  profilExistant: { id: string; nomAffiche: string } | null;
}

export interface NouvelUtilisateur { nomAffiche: string; fonction: string; npi: string | null; identifiant?: string; habilitations: Habilitation[] }
export interface UtilisateurCree {
  compte: { id: string; identifiant: string };
  profil: { id: string; nomAffiche: string; fonction: string; npi: string | null; habilitations: Habilitation[] };
  motDePasseTemporaire: string;
}

export interface DetailCompte {
  compte: { id: string; identifiant: string; actif: boolean; doitChangerMotDePasse: boolean; echecs: number; verrouilleJusquA: string | null; derniereConnexion: string | null; creeLe: string };
  profil: { id: string; nomAffiche: string; fonction: string; npi: string | null; habilitations: Habilitation[] };
  sessions: { creeLe: string; derniereActivite: string; agent: string | null }[];
  libelles: Record<string, string>;
}
export interface ModificationProfil { nomAffiche?: string; fonction?: string; npi?: string | null; habilitations?: Habilitation[] }

/* ================================================================== Types — assistance */

export type Categorie = "connexion" | "donnees" | "acces" | "bug" | "autre";
export type Priorite = "basse" | "normale" | "haute" | "critique";
export type StatutTicket = "ouvert" | "en_cours" | "resolu" | "clos";

export interface Ticket {
  id: string; categorie: Categorie; priorite: Priorite; sujet: string; description: string; statut: StatutTicket;
  creeLe: string; majLe: string; resoluLe: string | null;
  auteurCompteId: string; auteurNom: string; auteurIdentifiant: string; auteurFonction: string;
  assigneCompteId: string | null; assigneNom: string | null; assigneAMoi: boolean;
  messages: number; reponseAdministration: boolean;
}
export interface MessageTicket { id: string; auteurNom: string; deLAdministration: boolean; contenu: string; creeLe: string; deMoi: boolean }
export interface DetailTicket { ticket: Ticket; messages: MessageTicket[] }
export interface FiltresTickets { statut: StatutTicket | "actifs" | null; categorie: Categorie | null; priorite: Priorite | null; assigne: "moi" | "personne" | null; q: string }
export interface FileTickets { tickets: Ticket[]; compteurs: Record<StatutTicket, number> }
export interface NouveauTicket { categorie: Categorie; priorite: Priorite; sujet: string; description: string }

/* ================================================================== Libellés partagés */

export const LIBELLE_ROLE: Record<Role, string> = {
  apprenant: "Apprenant",
  parent: "Parent ou tuteur",
  enseignant: "Enseignant",
  chef_etablissement: "Chef d'établissement",
  inspecteur: "Inspecteur",
  direction_departementale: "Direction départementale",
  administration_centrale: "Administration centrale",
  chercheur: "Chercheur",
  dpo: "Délégué à la protection des données",
  administrateur: "Administrateur de la plateforme",
};
/** Périmètre attendu par rôle (miroir de la règle serveur NIVEAU_DU_ROLE). */
export const NIVEAU_DU_ROLE: Record<Role, Habilitation["perimetre"]["niveau"]> = {
  apprenant: "personnel", parent: "famille", enseignant: "etablissement", chef_etablissement: "etablissement", inspecteur: "circonscription",
  direction_departementale: "departement", administration_centrale: "national", chercheur: "national", dpo: "national", administrateur: "national",
};
export const ROLES_AVEC_NPI: Role[] = ["apprenant", "parent", "enseignant"];

export const LIBELLE_CATEGORIE: Record<Categorie, string> = { connexion: "Connexion", donnees: "Données", acces: "Accès et droits", bug: "Anomalie", autre: "Autre" };
export const LIBELLE_PRIORITE: Record<Priorite, string> = { basse: "Basse", normale: "Normale", haute: "Haute", critique: "Critique" };
export const TON_PRIORITE: Record<Priorite, Ton> = { basse: "neutre", normale: "info", haute: "avertissement", critique: "critique" };
export const LIBELLE_STATUT: Record<StatutTicket, string> = { ouvert: "Ouverte", en_cours: "En cours", resolu: "Résolue", clos: "Close" };
export const TON_STATUT: Record<StatutTicket, Ton> = { ouvert: "info", en_cours: "avertissement", resolu: "succes", clos: "neutre" };

/* ================================================================== Clés */

export const CLES_ADMIN = {
  racine: ["administration"] as const,
  compte: (id: string) => ["administration", "compte", id] as const,
  etablissements: (q: string) => ["administration", "referentiels", "etablissements", q] as const,
  departements: ["administration", "referentiels", "departements"] as const,
  circonscriptions: ["administration", "referentiels", "circonscriptions"] as const,
  npi: (npi: string) => ["administration", "referentiels", "npi", npi] as const,
  identifiant: (nom: string) => ["administration", "identifiant", nom] as const,
  file: (f: FiltresTickets) => ["administration", "tickets", f] as const,
  fileRacine: ["administration", "tickets"] as const,
};
export const CLES_ASSISTANCE = {
  racine: ["assistance"] as const,
  mesDemandes: ["assistance", "mes-demandes"] as const,
  detail: (id: string) => ["assistance", "demande", id] as const,
};

/* ================================================================== Référentiels des formulaires */

export function useEtablissementsRef(q: string, actif = true) {
  return useQuery({
    queryKey: CLES_ADMIN.etablissements(q),
    queryFn: ({ signal }) => lire<EtablissementRef[]>(`/admin/referentiels/etablissements?q=${encodeURIComponent(q)}`, signal),
    enabled: actif,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}
export function useDepartementsRef(actif = true) {
  return useQuery({ queryKey: CLES_ADMIN.departements, queryFn: ({ signal }) => lire<DepartementRef[]>("/admin/referentiels/departements", signal), enabled: actif, staleTime: 30 * 60_000 });
}
export function useCirconscriptionsRef(actif = true) {
  return useQuery({ queryKey: CLES_ADMIN.circonscriptions, queryFn: ({ signal }) => lire<CirconscriptionRef[]>("/admin/referentiels/circonscriptions", signal), enabled: actif, staleTime: 30 * 60_000 });
}
/** Fiche d'un NPI (registre national, fichiers apprenants et enseignants) — seulement pour un NPI complet. */
export function useFicheNpi(npi: string) {
  const valide = /^\d{10}$/.test(npi);
  return useQuery({ queryKey: CLES_ADMIN.npi(npi), queryFn: ({ signal }) => lire<FicheNpi>(`/admin/referentiels/npi/${npi}`, signal), enabled: valide, staleTime: 60_000, retry: false });
}
export function useIdentifiantPropose(nom: string) {
  const n = nom.trim();
  return useQuery({
    queryKey: CLES_ADMIN.identifiant(n),
    queryFn: ({ signal }) => lire<{ identifiant: string | null }>(`/admin/identifiant?nom=${encodeURIComponent(n)}`, signal),
    enabled: n.length >= 3,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

/* ================================================================== Utilisateurs */

/** Création : le mot de passe temporaire n'existe que dans la valeur de retour, jamais en cache (gcTime 0 + reset). */
export function useCreerUtilisateurMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (u: NouvelUtilisateur) => ecrire<UtilisateurCree>("/admin/utilisateurs", { ...u, npi: u.npi || null }),
    gcTime: 0,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: CLES_GOUVERNANCE.comptes });
      void client.invalidateQueries({ queryKey: ["administration", "identifiant"] });
    },
  });
}

export function useDetailCompte(id: string | null) {
  return useQuery({ queryKey: CLES_ADMIN.compte(id ?? ""), queryFn: ({ signal }) => lire<DetailCompte>(`/admin/comptes/${encodeURIComponent(id!)}`, signal), enabled: !!id });
}

function useInvaliderCompte() {
  const client = useQueryClient();
  return (id: string) => {
    void client.invalidateQueries({ queryKey: CLES_GOUVERNANCE.comptes });
    void client.invalidateQueries({ queryKey: CLES_ADMIN.compte(id) });
  };
}

export function useModifierProfilMutation() {
  const invalider = useInvaliderCompte();
  return useMutation({
    mutationFn: ({ id, ...m }: ModificationProfil & { id: string }) => ecrire<{ ok: true; sessionsRevoquees: number }>(`/admin/comptes/${encodeURIComponent(id)}/profil`, m),
    onSuccess: (_r, v) => invalider(v.id),
  });
}
export function useRevoquerSessionsMutation() {
  const invalider = useInvaliderCompte();
  return useMutation({
    mutationFn: (id: string) => ecrire<{ sessionsRevoquees: number }>(`/admin/comptes/${encodeURIComponent(id)}/sessions/revoquer`),
    onSuccess: (_r, id) => invalider(id),
  });
}
export function useDeverrouillerMutation() {
  const invalider = useInvaliderCompte();
  return useMutation({
    mutationFn: (id: string) => ecrire<{ ok: true }>(`/admin/comptes/${encodeURIComponent(id)}/deverrouiller`),
    onSuccess: (_r, id) => invalider(id),
  });
}

/* ================================================================== Assistance — utilisateur */

export function useMesDemandes() {
  return useQuery({ queryKey: CLES_ASSISTANCE.mesDemandes, queryFn: ({ signal }) => lire<Ticket[]>("/assistance/tickets", signal), refetchInterval: 30_000 });
}
/** Détail d'une demande et fil de messages ; rafraîchi toutes les 15 s tant qu'il est ouvert. */
export function useDemande(id: string | null) {
  return useQuery({
    queryKey: CLES_ASSISTANCE.detail(id ?? ""),
    queryFn: ({ signal }) => lire<DetailTicket>(`/assistance/tickets/${encodeURIComponent(id!)}`, signal),
    enabled: !!id,
    refetchInterval: 15_000,
  });
}

function useInvaliderTickets() {
  const client = useQueryClient();
  return (id?: string) => {
    void client.invalidateQueries({ queryKey: CLES_ASSISTANCE.mesDemandes });
    void client.invalidateQueries({ queryKey: CLES_ADMIN.fileRacine });
    if (id) void client.invalidateQueries({ queryKey: CLES_ASSISTANCE.detail(id) });
  };
}

export function useCreerDemandeMutation() {
  const invalider = useInvaliderTickets();
  return useMutation({ mutationFn: (t: NouveauTicket) => ecrire<Ticket>("/assistance/tickets", t), onSuccess: () => invalider() });
}

/** Réponse dans le fil : ajout optimiste du message (l'échange paraît instantané), puis relecture. */
export function useRepondreMutation(moi: string) {
  const client = useQueryClient();
  const invalider = useInvaliderTickets();
  return useMutation({
    mutationFn: ({ id, contenu }: { id: string; contenu: string }) => ecrire<{ ok: true; statut: StatutTicket }>(`/assistance/tickets/${encodeURIComponent(id)}/messages`, { contenu }),
    onMutate: async ({ id, contenu }) => {
      await client.cancelQueries({ queryKey: CLES_ASSISTANCE.detail(id) });
      const avant = client.getQueryData<DetailTicket>(CLES_ASSISTANCE.detail(id));
      if (avant) {
        client.setQueryData<DetailTicket>(CLES_ASSISTANCE.detail(id), {
          ...avant,
          messages: [...avant.messages, { id: `local-${Date.now()}`, auteurNom: moi, deLAdministration: false, contenu, creeLe: new Date().toISOString(), deMoi: true }],
        });
      }
      return { avant };
    },
    onError: (_e, v, ctx) => { if (ctx?.avant) client.setQueryData(CLES_ASSISTANCE.detail(v.id), ctx.avant); },
    onSettled: (_r, _e, v) => invalider(v.id),
  });
}

export function useClore() {
  const invalider = useInvaliderTickets();
  return useMutation({ mutationFn: (id: string) => ecrire<{ ok: true }>(`/assistance/tickets/${encodeURIComponent(id)}/clore`), onSuccess: (_r, id) => invalider(id) });
}

/* ================================================================== Assistance — file de l'administration */

export function useFileTickets(f: FiltresTickets) {
  return useQuery({
    queryKey: CLES_ADMIN.file(f),
    queryFn: ({ signal }) => {
      const p = new URLSearchParams();
      if (f.statut) p.set("statut", f.statut);
      if (f.categorie) p.set("categorie", f.categorie);
      if (f.priorite) p.set("priorite", f.priorite);
      if (f.assigne) p.set("assigne", f.assigne);
      if (f.q.trim()) p.set("q", f.q.trim());
      return lire<FileTickets>(`/admin/tickets?${p}`, signal);
    },
    refetchInterval: 20_000,
    placeholderData: keepPreviousData,
  });
}

export function useStatutTicketMutation() {
  const invalider = useInvaliderTickets();
  return useMutation({
    mutationFn: ({ id, statut }: { id: string; statut: StatutTicket }) => ecrire<{ ok: true; statut: StatutTicket }>(`/admin/tickets/${encodeURIComponent(id)}/statut`, { statut }),
    onSuccess: (_r, v) => invalider(v.id),
  });
}
export function useAssignationMutation() {
  const invalider = useInvaliderTickets();
  return useMutation({
    mutationFn: ({ id, assigner }: { id: string; assigner: boolean }) => ecrire<{ ok: true }>(`/admin/tickets/${encodeURIComponent(id)}/assignation`, { assigner }),
    onSuccess: (_r, v) => invalider(v.id),
  });
}
