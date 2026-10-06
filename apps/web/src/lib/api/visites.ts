"use client";

import type { Perimetre } from "@beile/contracts";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ecrire, lire } from "@/lib/http";

/**
 * Visites d'inspection : faits du registre portés par un établissement, lus et consignés par les agents de
 * tutelle (inspecteur, direction départementale, administration centrale). La source est
 * apps/api/src/visites.ts — aucune table nouvelle, l'écran relit `ledger.evenements`.
 */

export type CycleEtablissement = "primaire" | "secondaire" | "superieur";
export type FiltreCycle = "tous" | CycleEtablissement;

export interface Visite {
  id: string;
  enregistreLe: string;
  agent: string;
  etablissementId: string;
  etablissement: string;
  communeId: string;
  cycle: CycleEtablissement;
  statut: string;
  dateVisite: string;
  objet: string;
  constats: string;
  recommandations: string | null;
  referenceRapport: string | null;
  prochaineVisiteLe: string | null;
}

export interface EtablissementCouvert {
  id: string;
  nom: string;
  commune: string | null;
  communeId: string;
  circonscription: string;
  cycle: CycleEtablissement;
  statut: string;
  visites: number;
  /** Date de dernière visite (YYYY-MM-DD) ; null = jamais visité depuis l'ouverture du registre. */
  derniereLe: string | null;
  prochaineVisiteLe: string | null;
}

export interface CouvertureVisites {
  perimetre: Perimetre;
  attendus: number;
  couverts: number;
  visites: number;
  parDepartement: { id: string; departement: string; attendus: number; couverts: number }[];
  tronque: boolean;
  etablissements: EtablissementCouvert[];
}

export interface FiltresVisites { etablissementId: string | null; depuis: string | null; miennes: boolean }

const CLES = {
  liste: (f: FiltresVisites) => ["visites", "liste", f] as const,
  couverture: (cycle: FiltreCycle) => ["visites", "couverture", cycle] as const,
};

export function useVisites(filtres: FiltresVisites) {
  return useQuery({
    queryKey: CLES.liste(filtres),
    queryFn: ({ signal }) => {
      const p = new URLSearchParams();
      if (filtres.etablissementId) p.set("etablissementId", filtres.etablissementId);
      if (filtres.depuis) p.set("depuis", filtres.depuis);
      if (filtres.miennes) p.set("miennes", "1");
      const q = p.size ? `?${p}` : "";
      return lire<{ perimetre: Perimetre; lignes: Visite[] }>(`/visites${q}`, signal);
    },
    staleTime: 30_000,
  });
}

/** Couverture du périmètre : le tri part des écoles les moins visitées, parce que c'est la question posée. */
export function useCouvertureVisites(cycle: FiltreCycle, limite = 500) {
  return useQuery({
    queryKey: [...CLES.couverture(cycle), limite] as const,
    queryFn: ({ signal }) => lire<CouvertureVisites>(`/visites/couverture?cycle=${cycle}&limite=${limite}`, signal),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

export interface NouvelleVisite {
  etablissementId: string;
  dateVisite: string;
  objet: string;
  constats: string;
  recommandations: string | null;
  referenceRapport: string | null;
  prochaineVisiteLe: string | null;
  cle: string;
}

/** Consigner une visite : la clé d'idempotence est fixée à l'ouverture du formulaire, un renvoi ne double pas le fait. */
export function useConsignerVisite() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: NouvelleVisite) => ecrire<{ id: string; etablissement: string; deja: boolean }>("/visites", v),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["visites"] });
    },
  });
}
