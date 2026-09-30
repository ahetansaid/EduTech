"use client";

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
