"use client";

import type { DefinitionIndicateur, IndiceConfiance, Perimetre, ReponseAsk, RequeteSemantique, ResultatIndicateur } from "@beile/contracts";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ecrire, lire } from "@/lib/http";

/**
 * Espace « pilotage » : types des réponses de l'API (apps/api/src/pilotage.ts, complements-pilotage.ts,
 * app.ts pour /indicateurs et /ask) et hooks TanStack Query. Tout est calculé côté serveur, sous le
 * périmètre de l'habilitation ; le navigateur n'agrège rien.
 */

/* ================================================================== Types */

export type NiveauAlerte = "favorable" | "surveillance" | "attention" | "critique";
export interface Facteur { libelle: string; valeur: string; grave: boolean }
export interface Priorite { niveau: NiveauAlerte; score: number; facteurs: Facteur[] }
export type PerimetreLibelle = Perimetre & { libelle: string };

export interface FaitFlux {
  id: string;
  type: string;
  etablissementId: string | null;
  etablissement: string | null;
  source?: string;
  enregistreLe: string;
}

/** GET /pilotage/synthese */
export interface SynthesePilotage {
  perimetre: PerimetreLibelle;
  date: string;
  anneeScolaire: string;
  effectif: ResultatIndicateur;
  etablissements: { total: number; transmis: number };
  enseignants: number;
  ratio: ResultatIndicateur;
  bepc: ResultatIndicateur;
  maths: ResultatIndicateur;
  mathsSexe: ResultatIndicateur;
  mathsTerritoire: ResultatIndicateur;
  abandon: ResultatIndicateur;
  priorites: Record<string, Priorite>;
  flux: { total: number; derniers: FaitFlux[] };
}

/** GET /pilotage/flux */
export interface FluxPilotage {
  date: string;
  horodatage: string;
  total: number;
  parType: { type: string; n: number }[];
  derniers: FaitFlux[];
}

/** GET /pilotage/priorites */
export interface PrioritesPerimetre { perimetre: Perimetre; communes: Record<string, Priorite> }

export type CouchePilotage = "maths" | "ratio" | "occupation" | "absenteisme" | "abandon";
/** GET /pilotage/carte?couche= */
export interface CarteCouche {
  couche: CouchePilotage;
  definition: DefinitionIndicateur;
  confiance: IndiceConfiance;
  valeurs: Record<string, number | null>;
}

export interface Infrastructures { eau: boolean; electricite: boolean; internet: boolean; latrines: boolean; bibliotheque: boolean }

/** GET /pilotage/communes/:id */
export interface FicheCommune {
  commune: { id: string; nom: string; departementId: string; departement?: string; milieu: "urbain" | "rural" };
  indicateurs: {
    effectif: number; capacite: number; occupation: number; enseignants: number; ratio: number; enseignantsQualifies: number;
    absenteisme: number; abandon: number; populationScolarisable: number; couverture: number;
  };
  effectifs: { annee: string; effectif: number; capacite: number }[];
  priorite: Priorite | null;
  etablissements: {
    id: string; nom: string; cycle: "primaire" | "secondaire"; statut: string; lat: number; lng: number; capacite: number;
    effectif: number; enseignants: number; infrastructures: Infrastructures; transmis: boolean; pilote: boolean;
  }[];
}
export type EtablissementCommune = FicheCommune["etablissements"][number];

/** GET /pilotage/communes/:id/contexte */
export interface ContexteCommune {
  communeId: string;
  annee: string;
  populationScolarisable: number;
  enseignantsQualifies: number;
  confiance: IndiceConfiance;
  couverture: { etablissementsAyantTransmis: number; etablissementsAttendus: number };
  source: string;
}

/** GET /pilotage/territoire */
export interface ConsoleTerritoriale {
  perimetre: PerimetreLibelle;
  departementId: string | null;
  indicateurs: Record<"effectif" | "occupation" | "ratio" | "maths" | "absenteisme" | "abandon", ResultatIndicateur>;
  communes: { id: string; nom?: string; priorite: NiveauAlerte }[];
  etablissements: {
    id: string; nom: string; communeId: string; cycle: "primaire" | "secondaire"; statut: string; effectif: number; capacite: number;
    enseignants: number; transmis: boolean; pilote: boolean;
  }[];
  absencesDuJour: AbsenceEtablissement[];
  date: string;
}
export type EtablissementTerritoire = ConsoleTerritoriale["etablissements"][number];

export interface AbsenceEtablissement {
  etablissementId: string | null;
  etablissement: string;
  suivis: number;
  absents: number;
  taux: number;
  derniereSaisie: string | null;
}

/** GET /pilotage/territoire/absences */
export interface AbsencesDuJour { date: string; horodatage: string; etablissements: AbsenceEtablissement[] }

/** GET /pilotage/territoire/complements */
export interface ComplementsTerritoire {
  references: { maths: number | null; ratio: number | null; occupation: number | null; absenteisme: number | null };
  etablissements: { id: string; infrastructures: Infrastructures }[];
}

/** GET /pilotage/planification/:id */
export interface Planification {
  commune: { id: string; nom?: string; milieu: "urbain" | "rural" };
  effectif: number;
  capacite: number;
  enseignants: number;
  etablissements: number;
  croissanceAnnuelle: number;
  serie: { annee: string; effectif: number }[];
  communesSaturees: { id: string; nom?: string; occupation: number }[];
}

/** POST /plateforme/relances */
export interface ResultatRelance { relances: number; dejaOuvertes: number; dejaTransmis: number }

/* ================================================================== Lectures */

const CINQ_MINUTES = 5 * 60_000;

/** Synthèse du cockpit : agrégats du cube (stables) — le flux vit dans sa propre requête. */
export function useSynthese() {
  return useQuery({ queryKey: ["pilotage", "synthese"], queryFn: ({ signal }) => lire<SynthesePilotage>("/pilotage/synthese", signal), staleTime: CINQ_MINUTES });
}

/** Faits du jour enregistrés dans le périmètre : rafraîchis toutes les 15 s (preuve visible du multi-utilisateurs). */
export function useFlux(limite = 12) {
  return useQuery({
    queryKey: ["pilotage", "flux", limite],
    queryFn: ({ signal }) => lire<FluxPilotage>(`/pilotage/flux?limite=${limite}`, signal),
    refetchInterval: 15_000,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
}

export function usePrioritesPilotage() {
  return useQuery({ queryKey: ["pilotage", "priorites"], queryFn: ({ signal }) => lire<PrioritesPerimetre>("/pilotage/priorites", signal), staleTime: CINQ_MINUTES });
}

export function useCouche(couche: CouchePilotage | null) {
  return useQuery({
    queryKey: ["pilotage", "carte", couche],
    queryFn: ({ signal }) => lire<CarteCouche>(`/pilotage/carte?couche=${couche}`, signal),
    enabled: !!couche,
    staleTime: CINQ_MINUTES,
    placeholderData: keepPreviousData,
  });
}

export function useFicheCommune(id: string | null) {
  return useQuery({
    queryKey: ["pilotage", "commune", id],
    queryFn: ({ signal }) => lire<FicheCommune>(`/pilotage/communes/${encodeURIComponent(id!)}`, signal),
    enabled: !!id,
    staleTime: CINQ_MINUTES,
  });
}

export function useContexteCommune(id: string | null) {
  return useQuery({
    queryKey: ["pilotage", "commune", id, "contexte"],
    queryFn: ({ signal }) => lire<ContexteCommune>(`/pilotage/communes/${encodeURIComponent(id!)}/contexte`, signal),
    enabled: !!id,
    staleTime: CINQ_MINUTES,
  });
}

/** Indicateur à la demande (POST /indicateurs) : même moteur et même périmètre que le reste du pilotage. */
export function useIndicateurPilotage(requete: RequeteSemantique, actif = true) {
  return useQuery({
    queryKey: ["pilotage", "indicateur", requete],
    queryFn: () => ecrire<ResultatIndicateur>("/indicateurs", requete),
    enabled: actif,
    staleTime: CINQ_MINUTES,
    placeholderData: keepPreviousData,
  });
}

export function useTerritoire() {
  return useQuery({ queryKey: ["pilotage", "territoire"], queryFn: ({ signal }) => lire<ConsoleTerritoriale>("/pilotage/territoire", signal), staleTime: CINQ_MINUTES });
}

/** Absences du jour par établissement du territoire : rafraîchies toutes les 30 s. */
export function useAbsencesTerritoire(actif = true) {
  return useQuery({
    queryKey: ["pilotage", "territoire", "absences"],
    queryFn: ({ signal }) => lire<AbsencesDuJour>("/pilotage/territoire/absences", signal),
    enabled: actif,
    refetchInterval: 30_000,
    staleTime: 20_000,
    placeholderData: keepPreviousData,
  });
}

export function useComplementsTerritoire(actif = true) {
  return useQuery({
    queryKey: ["pilotage", "territoire", "complements"],
    queryFn: ({ signal }) => lire<ComplementsTerritoire>("/pilotage/territoire/complements", signal),
    enabled: actif,
    staleTime: CINQ_MINUTES,
  });
}

export function usePlanification(id: string | null) {
  return useQuery({
    queryKey: ["pilotage", "planification", id],
    queryFn: ({ signal }) => lire<Planification>(`/pilotage/planification/${encodeURIComponent(id!)}`, signal),
    enabled: !!id,
    staleTime: CINQ_MINUTES,
    placeholderData: keepPreviousData,
  });
}

/* ================================================================== Écritures */

/** Ask Education : traduction, contrôle des droits, calcul et journalisation côté serveur. */
export function useAskMutation() {
  return useMutation({ mutationFn: (question: string) => ecrire<ReponseAsk>("/ask", { question }) });
}

/** Relance de transmission (circuit RELANCE_TRANSMISSION) pour des établissements du périmètre. */
export function useRelanceMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (etablissementIds: string[]) => ecrire<ResultatRelance>("/plateforme/relances", { etablissementIds }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["pilotage", "territoire"] });
      client.invalidateQueries({ queryKey: ["plateforme"] });
    },
  });
}
