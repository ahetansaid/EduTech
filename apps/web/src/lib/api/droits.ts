"use client";

import type { Critere, Finalite } from "@beile/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ecrire, lire } from "@/lib/http";

/** Exercice des droits sur les données personnelles (circuit DROITS, instruit par le délégué). */
export type Droit = "acces" | "rectification" | "limitation" | "opposition";

export interface MaDemandeDroit {
  id: string;
  objet: string;
  droit: Droit | null;
  sujet: string | null;
  precision: string | null;
  statut: "ouverte" | "en_cours" | "acceptee" | "refusee" | "close";
  deposeeLe: string;
  echeance: string | null;
  reponse: { decision: "valide" | "refuse" | "renvoye"; texte: string | null; le: string } | null;
}

const CLE = ["droits", "mes-demandes"] as const;

export function useMesDemandesDroits() {
  return useQuery({ queryKey: CLE, queryFn: ({ signal }) => lire<MaDemandeDroit[]>("/droits/mes-demandes", signal), staleTime: 30_000 });
}

export function useDeposerDemandeDroit() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (d: { droit: Droit; sujet: string; precision: string }) => ecrire<{ id: string; echeance: string }>("/droits/demandes", d),
    onSuccess: () => client.invalidateQueries({ queryKey: CLE }),
  });
}

/** Une ligne du journal d'audit qui parle du sujet demandé : l'agent, la porte, la décision. */
export interface ConsultationSubie {
  horodatage: string;
  agent: string;
  action: string;
  finalite: Finalite;
  autorise: boolean;
  motifRefus: Critere | null;
}

export interface TraceDesConsultations {
  depuis: string;
  tronque: boolean;
  lignes: ConsultationSubie[];
}

/** « Qui a consulté ces données ? » — lecture bornée à douze mois, sur le seul sujet autorisé côté serveur. */
export function useMesConsultations(sujet: string) {
  return useQuery({
    queryKey: ["droits", "mes-consultations", sujet],
    queryFn: ({ signal }) => lire<TraceDesConsultations>(`/droits/mes-consultations?sujet=${encodeURIComponent(sujet)}`, signal),
    staleTime: 30_000,
  });
}
