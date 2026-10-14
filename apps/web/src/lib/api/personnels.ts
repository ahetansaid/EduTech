"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Perimetre } from "@beile/contracts";
import { ecrire, lire } from "@/lib/http";
import type { StatutEmploi } from "@/lib/api/etablissement";

/** Statuts d'emploi des enseignants, vus par la tutelle (source : apps/api/src/personnels.ts). */
export interface Repartition { enseignants: number; ape: number; ace: number; ame: number; vacataire: number; nonRenseigne: number }
export interface PersonnelsTutelle { perimetre: Perimetre; total: Repartition; tronque: boolean; peutModifier: boolean; etablissements: (Repartition & { id: string; nom: string })[] }
export interface EnseignantTutelle { id: string; nom: string; prenoms: string; grade: string; matieres: string[]; statut: StatutEmploi | null }

const CLE = ["tutelle", "personnels"] as const;
export function usePersonnelsTutelle() {
  return useQuery({ queryKey: CLE, queryFn: ({ signal }) => lire<PersonnelsTutelle>("/tutelle/personnels", signal), staleTime: 60_000 });
}
export function usePersonnelsEtablissement(etablissementId: string | null) {
  return useQuery({
    queryKey: [...CLE, etablissementId ?? "-"],
    queryFn: ({ signal }) => lire<{ etablissement: { id: string; nom: string }; peutModifier: boolean; enseignants: EnseignantTutelle[] }>(`/tutelle/personnels/${encodeURIComponent(etablissementId!)}`, signal),
    enabled: !!etablissementId,
  });
}
export function useStatutEmploiMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { enseignantId: string; statut: StatutEmploi | null; motif: string }) => ecrire<{ id: string }>(`/enseignants/${encodeURIComponent(v.enseignantId)}/statut`, { statut: v.statut, motif: v.motif }),
    onSuccess: () => client.invalidateQueries({ queryKey: CLE }),
  });
}
