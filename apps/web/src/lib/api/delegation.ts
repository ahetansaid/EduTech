"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ecrire, lire } from "@/lib/http";

/** Administration déléguée en cascade : toutes les règles sont décidées par l'API ; ici, lecture et envoi. */
export interface Organisation { id: string; type: string; nom: string; ministere?: string | null; enfants?: number }
export interface MaDelegation { id: string; niveau: number; organisationId: string; organisation: Organisation | null; rolesDelegables: string[]; peutNommer: boolean; au: string }
export interface CompteDelegue {
  id: string; nomAffiche: string; fonction: string; compteId: string | null; identifiant: string | null; actif: boolean | null; cumul: boolean;
  attributions: { id: string; role: string; organisationId: string; organisation: string; au: string; garant: string | null; gerable: boolean }[];
  delegations: { id: string; niveau: number; statut: string; organisationId: string; organisation: string; au: string }[];
}
export interface NominationEnAttente { id: string; niveau: number; organisation: string; beneficiaire: string; demandeur: string | null; motif: string | null; rolesDelegables: string[] }

const CLE = ["delegation"] as const;
export const useMaDelegation = () => useQuery({ queryKey: [...CLE, "moi"], queryFn: ({ signal }) => lire<{ delegations: MaDelegation[]; aValider: number }>("/delegation/moi", signal) });
export const useSousOrganisations = (parent: string | null, q: string) => useQuery({
  queryKey: [...CLE, "orgs", parent, q], enabled: !!parent, placeholderData: keepPreviousData,
  queryFn: ({ signal }) => lire<{ parent: Organisation; enfants: Organisation[] }>(`/delegation/organisations?parent=${encodeURIComponent(parent!)}${q ? `&q=${encodeURIComponent(q)}` : ""}`, signal),
});
export const useComptesDelegues = (organisation: string | null, q: string) => useQuery({
  queryKey: [...CLE, "comptes", organisation, q], enabled: !!organisation, placeholderData: keepPreviousData,
  queryFn: ({ signal }) => lire<CompteDelegue[]>(`/delegation/comptes?organisation=${encodeURIComponent(organisation!)}${q ? `&q=${encodeURIComponent(q)}` : ""}`, signal),
});
export const useNominationsAValider = () => useQuery({ queryKey: [...CLE, "a-valider"], queryFn: ({ signal }) => lire<NominationEnAttente[]>("/delegation/a-valider", signal) });

/** Toute écriture rafraîchit l'ensemble de la console (comptes, nominations, compteurs). */
export function useActionDelegation<T = unknown>() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ chemin, corps }: { chemin: string; corps?: unknown }) => ecrire<T>(chemin, corps ?? {}),
    onSuccess: () => client.invalidateQueries({ queryKey: CLE }),
  });
}

export const LIBELLE_ROLE: Record<string, string> = {
  administration_centrale: "Administration centrale", direction_departementale: "Direction départementale", inspecteur: "Inspecteur",
  chef_etablissement: "Chef d'établissement", enseignant: "Enseignant", apprenant: "Apprenant", parent: "Responsable légal",
  chercheur: "Chercheur", dpo: "Délégué à la protection des données",
};
export const LIBELLE_NIVEAU = ["Autorité (niveau 0)", "Ministère ou organisme (niveau 1)", "Département ou université (niveau 2)", "Établissement ou circonscription (niveau 3)", "Référent de proximité (niveau 4)"];
/** Type d'organisation sur lequel chaque rôle se pose (miroir de la règle serveur, pour ne proposer que le possible). */
export const TYPES_DU_ROLE: Record<string, string[]> = {
  administration_centrale: ["ministere", "organisme", "autorite"], dpo: ["autorite"], chercheur: ["autorite"],
  direction_departementale: ["departement"], inspecteur: ["circonscription"],
  chef_etablissement: ["etablissement", "universite"], enseignant: ["etablissement", "universite"], apprenant: ["etablissement", "universite"], parent: ["etablissement", "universite"],
};
