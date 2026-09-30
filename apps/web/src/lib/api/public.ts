"use client";

import type { Examen, ResultatExamenPublic, SessionPubliee } from "@beile/contracts";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { lire, requete } from "@/lib/http";

/** Services publics (sans compte) : annuaire des établissements et chiffres agrégés. */

export type NiveauPublic = "maternelle" | "primaire" | "secondaire" | "technique" | "superieur" | "alphabetisation";
export type StatutEtablissement = "public" | "prive" | "confessionnel" | "communautaire";

/** Niveau de preuve d'une ligne du référentiel réel. */
export type PreuveReferentiel = "officielle" | "recoupee" | "cartographie_collaborative";
export interface EtablissementPublic {
  id: string; nom: string; sigle: string | null; type: string; typeLibelle: string; niveaux: string[];
  statut: StatutEtablissement | "non_indique"; cycle: string | null; preuve: PreuveReferentiel;
  communeId: string | null; commune: string | null; departementId: string | null; departement: string | null;
  lat: number | null; lng: number | null; distanceKm: number | null;
}
export interface Annuaire { total: number; page: number; parPage: number; etablissements: EtablissementPublic[] }
export interface FicheEtablissement extends Omit<EtablissementPublic, "distanceKm"> {
  rattachement: string | null; source: string; remarque: string | null;
}
export interface Filtres { q?: string; departement?: string; commune?: string; niveau?: NiveauPublic; statut?: StatutEtablissement; lat?: number; lng?: number; page?: number }

export interface IndicateurPublic {
  cle: string; nom: string; definition: string; unite: "nombre" | "pourcentage" | "note" | "ratio";
  periode: string; source: string; confiance: number; valeur: number | null;
  departements: { id: string; nom: string; valeur: number | null }[];
}

const parametres = (f: Filtres) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== "" && v !== null) p.set(k, String(v));
  return p.toString();
};

export function useAnnuaire(f: Filtres) {
  return useQuery({
    queryKey: ["public", "annuaire", f],
    queryFn: ({ signal }) => lire<Annuaire>(`/public/etablissements?${parametres(f)}`, signal),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export function useFiche(id: string) {
  return useQuery({ queryKey: ["public", "fiche", id], queryFn: () => lire<FicheEtablissement>(`/public/etablissements/${encodeURIComponent(id)}`), staleTime: 300_000 });
}

export function useChiffres() {
  return useQuery({ queryKey: ["public", "chiffres"], queryFn: () => lire<{ indicateurs: IndicateurPublic[] }>("/public/chiffres"), staleTime: 300_000 });
}

export const NIVEAUX_PUBLICS: { valeur: NiveauPublic; libelle: string }[] = [
  { valeur: "maternelle", libelle: "Maternelle" },
  { valeur: "primaire", libelle: "Primaire" },
  { valeur: "secondaire", libelle: "Secondaire" },
  { valeur: "technique", libelle: "Technique et professionnel" },
  { valeur: "superieur", libelle: "Supérieur" },
];
export const STATUTS: Record<StatutEtablissement, string> = { public: "Public", prive: "Privé", confessionnel: "Confessionnel", communautaire: "Communautaire" };
/** Statut lisible ; « non indiqué » n'est pas un statut, il n'est donc pas affiché comme tel. */
export const libelleStatut = (s: StatutEtablissement | "non_indique") => (s === "non_indique" ? null : STATUTS[s]);
export const LIBELLE_PREUVE: Record<PreuveReferentiel, string> = { officielle: "Source officielle", recoupee: "Sources recoupées", cartographie_collaborative: "OpenStreetMap" };

export type CategorieEcheance = "rentree" | "trimestre" | "conges" | "ferie" | "examen" | "evaluation" | "fin" | "autre";
export interface Echeance { id: string; annee: string; titre: string; categorie: CategorieEcheance; debut: string; fin: string; statut: "officiel" | "provisoire"; note: string | null; majLe: string }
export interface CalendrierPublic { aujourdhui: string; annees: string[]; annee: string | null; evenements: Echeance[] }

export function useCalendrier(annee?: string) {
  return useQuery({
    queryKey: ["public", "calendrier", annee ?? "courante"],
    queryFn: () => lire<CalendrierPublic>(`/public/calendrier${annee ? `?annee=${encodeURIComponent(annee)}` : ""}`),
    placeholderData: keepPreviousData,
    staleTime: 120_000,
  });
}

/* ------------------------------------------------------------------ Résultats d'examens (recherche publique par numéro de table) */

/**
 * Consultation publique e-résultat : sans session ni compte. L'API ne renvoie un verdict que si la
 * session est publiée ; la requête n'est émise qu'une fois les trois critères renseignés.
 */
export function useResultatExamen(examen: Examen, session: string, table: string, naissance = "") {
  return useQuery({
    queryKey: ["public", "resultats", examen, session, table, naissance],
    queryFn: ({ signal }) => requete<ResultatExamenPublic>(
      "GET",
      `/public/resultats?examen=${encodeURIComponent(examen)}&session=${encodeURIComponent(session)}&table=${encodeURIComponent(table)}${naissance ? `&naissance=${encodeURIComponent(naissance)}` : ""}`,
      undefined,
      { silencieux401: true, signal },
    ),
    enabled: !!table.trim() && !!session.trim(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

/** Sessions publiées, proposées au choix (plus de saisie libre qu'un parent devrait deviner). */
export function useSessionsPubliees() {
  return useQuery({
    queryKey: ["public", "resultats", "sessions"],
    queryFn: ({ signal }) => lire<SessionPubliee[]>("/public/resultats/sessions", signal),
    staleTime: 5 * 60_000,
  });
}
