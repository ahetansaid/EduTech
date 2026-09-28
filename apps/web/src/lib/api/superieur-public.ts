"use client";

import type { CycleLMD, Diplome, Domaine, StatutConcours, TypeParcours } from "@beile/contracts";
import { useQuery } from "@tanstack/react-query";
import { lire } from "@/lib/http";

/**
 * Registre public du supérieur (sans compte) : filières habilitées ou non, établissements et
 * sessions de concours, tels que servis par l'API. Aucune valeur n'est complétée côté front.
 */

export type TutelleSup = "MESRS" | "MESTFP" | "EMPLOI_PME";

export interface EtablissementDeFiliere {
  id: string; nom: string; sigle: string | null; communeId: string; statut: string; rattachementId: string | null;
  commune: string | null; departementId: string | null; departement: string | null;
}

export interface FiliereSup {
  id: string; etablissementId: string; nom: string; domaine: Domaine; voie: TypeParcours; cycle: CycleLMD | null;
  diplomeVise: Diplome; composantes: string[]; creditsEcts: number | null; capaciteAnnuelle: number | null;
  capaciteParComposante: { composante: string; places: number }[];
  serieBacRequise: string[]; accesConcours: boolean; stageObligatoireMois: number;
  criteresOrientation: { matiere: string; poids: number }[];
  valideDu: string | null; valideAu: string | null;
  etablissement: EtablissementDeFiliere;
  /** Habilitation en cours de validité : un diplôme d'une filière non habilitée n'est pas reconnu. */
  habilitee: boolean;
}

export interface EtablissementSupPublic {
  id: string; nom: string; sigle: string | null; type: string; libelleType: string | null; statut: string;
  tutelles: TutelleSup[]; rattachementId: string | null; communeId: string; commune: string | null;
  departementId?: string | null; departement: string | null; lat: number | null; lng: number | null; filieres: number;
}

export interface ConcoursSup {
  id: string; nom: string; filiereId: string; session: string; statut: StatutConcours;
  diplomeRequis: Diplome; serieRequise: string[]; places: number | null;
  epreuves: { matiere: string; coef: number }[];
  ouvertureLe: string | null; clotureLe: string | null; epreuvesLe: string | null;
  filiere: { id: string; nom: string };
  etablissement: { id: string; nom: string; sigle: string | null };
}

export interface FiltresFilieresSup { voie?: TypeParcours; domaine?: Domaine; etablissementId?: string }

const CINQ_MINUTES = 300_000;

export function useFilieresSup(f: FiltresFilieresSup = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, String(v));
  const qs = p.toString();
  return useQuery({
    queryKey: ["public", "superieur", "filieres", f],
    queryFn: ({ signal }) => lire<FiliereSup[]>(`/public/superieur/filieres${qs ? `?${qs}` : ""}`, signal),
    staleTime: CINQ_MINUTES,
  });
}

export function useEtablissementsSup() {
  return useQuery({
    queryKey: ["public", "superieur", "etablissements"],
    queryFn: ({ signal }) => lire<EtablissementSupPublic[]>("/public/superieur/etablissements", signal),
    staleTime: CINQ_MINUTES,
  });
}

export function useConcoursSup() {
  return useQuery({
    queryKey: ["public", "superieur", "concours"],
    queryFn: ({ signal }) => lire<ConcoursSup[]>("/public/superieur/concours", signal),
    staleTime: CINQ_MINUTES,
  });
}
