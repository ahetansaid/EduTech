"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { lire } from "@/lib/http";

/** Services publics (sans compte) : annuaire des établissements et chiffres agrégés. */

export type NiveauPublic = "maternelle" | "primaire" | "secondaire" | "technique" | "superieur" | "alphabetisation";
export type StatutEtablissement = "public" | "prive" | "confessionnel" | "communautaire";

export interface EtablissementPublic {
  id: string; nom: string; type: string; typeLibelle: string; statut: StatutEtablissement; cycle: string;
  communeId: string; commune: string; departementId: string | null; departement: string | null;
  lat: number | null; lng: number | null; distanceKm: number | null;
}
export interface Annuaire { total: number; page: number; parPage: number; etablissements: EtablissementPublic[] }
export interface FicheEtablissement extends Omit<EtablissementPublic, "distanceKm"> {
  gestionnaire: string | null; circonscription: string; capacite: number; salles: number;
  infrastructures: { eau: boolean; electricite: boolean; internet: boolean; latrines: boolean; bibliotheque: boolean };
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
  { valeur: "alphabetisation", libelle: "Alphabétisation" },
];
export const STATUTS: Record<StatutEtablissement, string> = { public: "Public", prive: "Privé", confessionnel: "Confessionnel", communautaire: "Communautaire" };

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
