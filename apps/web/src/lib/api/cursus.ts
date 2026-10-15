"use client";

import type { ContratPedagogique, Stage, StatutStage, Voeu } from "@beile/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Ton } from "@/components/ui/primitives";
import { ecrire, lire } from "@/lib/http";

/**
 * Le cursus de l'étudiant et l'orientation de l'élève, sur les routes « /moi » : l'identité vient toujours de
 * la session, jamais du client. Vœux (élève qui candidate), contrat pédagogique et stages (étudiant inscrit).
 */

/* ------------------------------------------------------------------ Vœux d'orientation */

export const LIBELLE_STATUT_VOEU: Record<Voeu["statut"], string> = {
  brouillon: "Brouillon", soumis: "Soumis", admissible: "Admissible", admis: "Admis", refuse: "Refusé", desiste: "Désisté",
};
export const TON_STATUT_VOEU: Record<Voeu["statut"], Ton> = {
  brouillon: "neutre", soumis: "info", admissible: "avertissement", admis: "succes", refuse: "critique", desiste: "neutre",
};

const CLE_VOEUX = ["moi", "voeux"] as const;
export function useMesVoeux() {
  return useQuery({ queryKey: CLE_VOEUX, queryFn: ({ signal }) => lire<Voeu[]>("/moi/voeux", signal) });
}
export function usePoserVoeuMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { filiereId: string; rang: number; statut: "brouillon" | "soumis"; anneeScolaire: string; concoursId?: string | null }) => ecrire<Voeu>("/moi/voeux", v),
    onSuccess: () => client.invalidateQueries({ queryKey: CLE_VOEUX }),
  });
}

/* ------------------------------------------------------------------ Contrat pédagogique */

export interface OffreContrat {
  offreUeId: string;
  periode: { id: string; intitule: string; numero: number };
  session: string;
  ue: { id: string; code: string; intitule: string; type: string; creditsEcts: number };
  auChoix: boolean;
  acquise: boolean;
  prerequisManquants: string[];
  placesRestantes: number | null;
  monContrat: "proposee" | "signee" | "abandonnee" | "validee" | "non_validee" | null;
}
export interface OffresContrat { inscription: { id: string; etablissementId: string; filiereId: string; anneeUniversitaire: string } | null; offres: OffreContrat[] }

const CLE_CONTRAT = ["moi", "contrat"] as const;
export function useMonContrat() {
  return useQuery({ queryKey: CLE_CONTRAT, queryFn: ({ signal }) => lire<ContratPedagogique>("/moi/contrat", signal), retry: false });
}
export function useOffresContrat() {
  return useQuery({ queryKey: [...CLE_CONTRAT, "offres"], queryFn: ({ signal }) => lire<OffresContrat>("/moi/contrat/offres", signal) });
}
export function useProposerUeMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { offreUeId: string; groupeId?: string | null }) => ecrire<{ inscriptionUeId: string; statut: string }>("/moi/contrat/ue", v),
    onSuccess: () => client.invalidateQueries({ queryKey: CLE_CONTRAT }),
  });
}

/* ------------------------------------------------------------------ Stages */

export const LIBELLE_STATUT_STAGE: Record<StatutStage, string> = {
  recherche: "En recherche", piste: "Piste identifiée", convention_en_cours: "Convention en cours", signe: "Convention signée",
  en_cours: "En cours", termine: "Terminé", interrompu: "Interrompu",
};

const CLE_STAGES = ["moi", "stages"] as const;
export function useMesStages() {
  return useQuery({ queryKey: CLE_STAGES, queryFn: ({ signal }) => lire<Stage[]>("/moi/stages", signal) });
}
export function useDeclarerStageMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { entreprise: string; tuteurPro: string | null; du: string | null; au: string | null }) => ecrire<Stage>("/moi/stages", v),
    onSuccess: () => client.invalidateQueries({ queryKey: CLE_STAGES }),
  });
}
export function useStatutStageMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; statut: StatutStage }) => ecrire<{ id: string; statut: StatutStage }>(`/moi/stages/${encodeURIComponent(v.id)}/statut`, { statut: v.statut }),
    onSuccess: () => client.invalidateQueries({ queryKey: CLE_STAGES }),
  });
}
