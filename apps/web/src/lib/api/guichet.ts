"use client";

import type {
  AllocationEtudiante, AttestationScolarite, AutoriteDelivrance, DecisionGuichet, DelaisConstates, DemandeActe,
  DossierAllocation, EcheanceDepot, ModeRetrait, PieceIdentite, StatutCompte, StatutDemande, TypeActe, TypeDecisionAllocation,
} from "@beile/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Ton } from "@/components/ui/primitives";
import { ecrire, lire } from "@/lib/http";

/**
 * Client du guichet de l'étudiant (`apps/api/src/guichet.ts`). Les formes de réponse reproduisent
 * exactement celles de l'API : un écran qui devinerait un champ en inventerait un.
 */

/* ================================================================== Vocabulaires d'affichage */

export const LIBELLE_STATUT_ACTE: Record<StatutDemande, string> = {
  demandee: "Déposée",
  en_instruction: "En cours de préparation",
  disponible: "Prête à retirer",
  remise: "Remise",
  refusee: "Refusée",
  retiree: "Retirée par vous",
};

export const TON_STATUT_ACTE: Record<StatutDemande, Ton> = {
  demandee: "info",
  en_instruction: "avertissement",
  disponible: "succes",
  remise: "neutre",
  refusee: "critique",
  retiree: "neutre",
};

export const LIBELLE_MODE_RETRAIT: Record<ModeRetrait, string> = {
  titulaire: "Au titulaire",
  geniteur: "À un géniteur",
  mandataire: "À un mandataire",
  autorite_academique: "À l'autorité académique",
  dematerialise: "Dématérialisé",
};

export const LIBELLE_PIECE: Record<PieceIdentite, string> = {
  carte_nationale_identite: "Carte nationale d'identité",
  passeport: "Passeport",
  acte_naissance: "Acte de naissance",
  procuration_notariee: "Procuration notariée",
  procuration_tribunal: "Procuration établie au tribunal",
};

export const LIBELLE_TYPE_DECISION: Record<TypeDecisionAllocation, string> = {
  attribution: "Attribution",
  renouvellement: "Renouvellement",
  retablissement: "Rétablissement",
  secours: "Secours universitaire",
};

/** Les trois autorités d'une allocation : `mesrs` n'est pas une autorité de délivrance d'acte. */
export const LIBELLE_AUTORITE_ALLOCATION: Record<AllocationEtudiante["autorite"], string> = {
  dbau: "Direction des Bourses et Aides Universitaires (DBAU)",
  mesrs: "MESRS (ministère)",
  etablissement: "établissement",
};

export const LIBELLE_STATUT_DOSSIER: Record<DossierAllocation["statut"], string> = {
  complet: "Dossier complet",
  incomplet: "Pièces à produire",
  hors_delai: "Dépôt hors délai",
  sans_echeance: "Aucune échéance déclarée",
};

export const TON_STATUT_DOSSIER: Record<DossierAllocation["statut"], Ton> = {
  complet: "succes",
  incomplet: "avertissement",
  hors_delai: "critique",
  sans_echeance: "neutre",
};

export const LIBELLE_PASSAGE: Record<AttestationScolarite["passage"], string> = {
  admis: "Admis·e",
  admis_sous_reserve: "Admis·e sous réserve",
  ajourne: "Ajourne·e",
  refuse: "Refusé·e par le jury",
  non_delibere: "Aucune délibération enregistrée",
};

/* ================================================================== Types de réponse */

/** Ligne de la file du guichet : l'acte et la personne qui l'a demandé (le nom se lit, pas un identifiant nu). */
export type DemandeGuichet = DemandeActe & { apprenant: { id: string; nom: string; prenoms: string } };

export interface DepotActe {
  demandeId: string | null;
  evenementId: string | null;
  statut?: string;
  autorite?: AutoriteDelivrance;
  delaiContractuelJours?: number;
  delaiSource?: string;
  /** Date à laquelle le guichet doit avoir préparé l'acte, calculée par le serveur sur le barème publié. */
  attenduLe?: string;
  deja?: boolean;
}

export interface EffetDecision { acte: DemandeActe; evenementId: string | null }

export interface EffectifsAllocations {
  parStatut: { anneeUniversitaire: string; statut: StatutCompte; effectif: number }[];
  parDecision: { anneeUniversitaire: string; typeDecision: TypeDecisionAllocation; effectif: number }[];
  parAutorite: { autorite: "dbau" | "mesrs" | "etablissement"; effectif: number }[];
}

/* ================================================================== L'étudiant */

const CLE_DEMARCHES = ["moi", "actes"] as const;

export function useMesActes() {
  return useQuery({ queryKey: CLE_DEMARCHES, queryFn: ({ signal }) => lire<DemandeActe[]>("/moi/actes", signal), refetchInterval: 60_000 });
}

export function useDeposerActeMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { typeActe: TypeActe; anneeUniversitaire?: string | null; periodeId?: string | null; motifDemande?: string | null }) => ecrire<DepotActe>("/moi/actes/demande", v),
    onSuccess: () => { client.invalidateQueries({ queryKey: CLE_DEMARCHES }); client.invalidateQueries({ queryKey: ["moi", "dossier"] }); },
  });
}

export function useRetirerActeMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (demandeId: string) => ecrire<{ statut: string }>(`/moi/actes/${encodeURIComponent(demandeId)}/retirer`, {}),
    onSuccess: () => client.invalidateQueries({ queryKey: CLE_DEMARCHES }),
  });
}

export function useMonAttestation(annee: string | null) {
  return useQuery({
    queryKey: ["moi", "attestation", annee],
    queryFn: ({ signal }) => lire<AttestationScolarite>(`/moi/attestation-scolarite${annee ? `?annee=${annee}` : ""}`, signal),
  });
}

export function useMesAllocations() {
  return useQuery({ queryKey: ["moi", "allocations"], queryFn: ({ signal }) => lire<AllocationEtudiante[]>("/moi/allocations", signal) });
}

/** Couche C : le dossier au regard du calendrier de dépôt, avec les pièces déjà remises. */
export function useMonDossier(annee: string | null, typeDecision: TypeDecisionAllocation | null) {
  const params = new URLSearchParams();
  if (annee) params.set("annee", annee);
  if (typeDecision) params.set("typeDecision", typeDecision);
  const query = params.toString();
  return useQuery({
    queryKey: ["moi", "dossier", annee, typeDecision],
    queryFn: ({ signal }) => lire<DossierAllocation>(`/moi/dossier-allocation${query ? `?${query}` : ""}`, signal),
  });
}

/* ================================================================== Le guichet d'un établissement */

export function useFileGuichet(etablissementId: string, options: { retard?: boolean } = {}) {
  const retard = options.retard ? "1" : "";
  return useQuery({
    queryKey: ["guichet", etablissementId, "file", retard],
    queryFn: ({ signal }) => lire<DemandeGuichet[]>(`/etablissements/${etablissementId}/actes${retard ? "?retard=1" : ""}`, signal),
    refetchInterval: 60_000,
  });
}

export function useDelaisGuichet(etablissementId: string) {
  return useQuery({ queryKey: ["guichet", etablissementId, "delais"], queryFn: ({ signal }) => lire<DelaisConstates[]>(`/etablissements/${etablissementId}/actes/delais`, signal) });
}

export function useDecisionGuichetMutation(etablissementId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { demandeId: string } & DecisionGuichet) => {
      const { demandeId, ...corps } = v;
      return ecrire<EffetDecision>(`/etablissements/${etablissementId}/actes/${encodeURIComponent(demandeId)}/decision`, corps);
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["guichet", etablissementId, "file"] });
      client.invalidateQueries({ queryKey: ["guichet", etablissementId, "delais"] });
    },
  });
}

/* ================================================================== L'État et le pilotage national */

/** Comparateur des délais sous le périmètre de l'agent : des médianes par établissement, jamais une ligne nominative. */
export function useDelaisNationaux(actif = true) {
  return useQuery({ queryKey: ["guichet", "national", "delais"], queryFn: ({ signal }) => lire<DelaisConstates[]>("/enseignement-superieur/actes/delais", signal), enabled: actif });
}

/** L'État scelle un acte dont la signature ne relève pas de l'établissement (diplôme : DEC, duplicata
 *  national : DGES) **par sa référence**, celle que l'étudiant lit sur son espace. Volontairement :
 *  aucune liste nominative nationale ne se parcourt ici — le national ne voit que des effectifs. */
export function useDecisionEtatMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { demandeId: string } & DecisionGuichet) => {
      const { demandeId, ...corps } = v;
      return ecrire<EffetDecision>(`/enseignement-superieur/actes/${encodeURIComponent(demandeId)}/decision`, corps);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["guichet", "national", "delais"] }),
  });
}

/** Le calendrier complet : l'écran filtre l'année côté lecture, sinon le sélecteur perd ses propres options. */
export function useEcheances(actif = true) {
  return useQuery({
    queryKey: ["guichet", "echeances"],
    queryFn: ({ signal }) => lire<EcheanceDepot[]>("/enseignement-superieur/echeances", signal),
    enabled: actif,
  });
}

export function useDeclencheurEcheanceMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { anneeUniversitaire: string; typeDecision: TypeDecisionAllocation; dateLimite: string; actesExiges: TypeActe[]; autorite: "dbau" | "mesrs"; intitule: string }) =>
      ecrire<{ echeanceId: string }>(`/enseignement-superieur/echeances`, v),
    onSuccess: () => client.invalidateQueries({ queryKey: ["guichet", "echeances"] }),
  });
}

export function useEffectifsAllocations(annee: string | null, actif = true) {
  return useQuery({
    queryKey: ["guichet", "allocations", "effectifs", annee],
    queryFn: ({ signal }) => lire<EffectifsAllocations>(`/enseignement-superieur/allocations/effectifs${annee ? `?annee=${annee}` : ""}`, signal),
    enabled: actif,
  });
}

export function useStaterAllocationMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { apprenantId: string; anneeUniversitaire: string; typeDecision: TypeDecisionAllocation; statutCompte: StatutCompte; autorite: "dbau" | "mesrs" | "etablissement"; referenceActe?: string | null; motif?: string | null; decideLe?: string | null; echeanceId?: string | null }) =>
      ecrire<{ allocationId: string }>("/enseignement-superieur/allocations", v),
    onSuccess: () => client.invalidateQueries({ queryKey: ["guichet", "allocations"] }),
  });
}
