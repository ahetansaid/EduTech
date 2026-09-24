"use client";

import type { Evenement, Perimetre, RequeteSemantique } from "@beile/contracts";
import { useMemo } from "react";
import { getCouches } from "./sim/monde";
import { calculer } from "./sim/semantique";
import { communeById } from "./sim/territoire";

export function useCouches() {
  return useMemo(() => getCouches(), []);
}

/** Calcul mémoïsé d'un indicateur via la couche sémantique. */
export function useIndicateur(requete: RequeteSemantique, perimetre: Perimetre | null = null) {
  const couches = useCouches();
  const cle = JSON.stringify([requete, perimetre]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => calculer(couches, requete, perimetre), [couches, cle]);
}

const LIBELLES: Record<Evenement["type"], string> = {
  INSCRIPTION: "Inscription",
  EVALUATION: "Évaluation",
  CORRECTION_EVALUATION: "Correction de note",
  ABSENCE: "Absence",
  PASSAGE: "Passage",
  TRANSFERT: "Transfert",
  ABANDON: "Abandon",
  REPRISE: "Reprise",
  RESULTAT_EXAMEN: "Résultat d'examen",
  CERTIFICATION: "Certification",
  REGULARISATION_IDENTITE_DEMANDEE: "Régularisation d'identité",
  AFFECTATION_ENSEIGNANT: "Affectation",
  FORMATION_ENSEIGNANT: "Formation",
};
export const libelleEvenement = (t: Evenement["type"]) => LIBELLES[t];

export const nomCommune = (id: string) => communeById.get(id)?.nom ?? id;
