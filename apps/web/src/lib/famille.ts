"use client";

import { useMemo } from "react";
import { situationApprenant } from "./sim/projections";
import { useMonde, useProfil } from "./store";

/** Enfants rattachés au responsable connecté : lien de filiation vérifié au registre national, jamais déclaré librement. */
export function useEnfants() {
  const monde = useMonde();
  const profil = useProfil();
  return useMemo(() => {
    const ids = monde.liens.filter((l) => l.responsableNpi === profil.npi && l.verifie).map((l) => l.apprenantId);
    return monde.apprenants
      .filter((a) => ids.includes(a.id))
      .map((a) => {
        const s = situationApprenant(monde, monde.evenements, a.id);
        return { apprenant: a, classe: s.classe, etablissement: monde.etablissements.find((e) => e.id === s.etablissementId) ?? null };
      });
  }, [monde, profil.npi]);
}
