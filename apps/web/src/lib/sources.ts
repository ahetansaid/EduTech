"use client";

import type { Apprenant, Certificat, Classe, Evenement } from "@beile/contracts";
import { situationApprenant } from "@beile/simulation/projections";
import { useMemo } from "react";
import { apiActive, useLectureApi } from "./api";
import { useEnfants } from "./famille";
import { useMonde, useProfil } from "./store";

/**
 * Source unifiée d'un dossier individuel : la base nationale (API, décision d'accès côté serveur)
 * quand elle est configurée, le registre de démonstration sinon. Les écrans ne voient qu'une forme.
 */
export interface DossierSource {
  apprenant: Apprenant;
  classe: Classe | null;
  etablissementNom: string | null;
  evenements: Evenement[];
  certificats: Certificat[];
  nomEtablissement: (id: string | null) => string | null;
}

interface DossierApi {
  apprenant: Apprenant;
  situation: { classe: Classe | null; etablissementId: string | null; statut: string };
  evenements: Evenement[];
  certificats: Certificat[];
  etablissements: Record<string, string>;
}

const depuisApi = (d: DossierApi): DossierSource => ({
  apprenant: d.apprenant,
  classe: d.situation.classe,
  etablissementNom: d.situation.etablissementId ? d.etablissements[d.situation.etablissementId] ?? null : null,
  evenements: d.evenements,
  certificats: d.certificats,
  nomEtablissement: (id) => (id ? d.etablissements[id] ?? null : null),
});

export function useFamille(): { enfants: DossierSource[]; chargement: boolean; base: boolean } {
  const profil = useProfil();
  const monde = useMonde();
  const locaux = useEnfants();
  const api = useLectureApi<DossierApi[]>(profil.id, "/famille/enfants");
  return useMemo(() => {
    if (apiActive && api.donnees) return { enfants: api.donnees.map(depuisApi), chargement: false, base: true };
    if (apiActive && api.chargement) return { enfants: [], chargement: true, base: true };
    const nom = (id: string | null) => monde.etablissements.find((e) => e.id === id)?.nom ?? null;
    return {
      enfants: locaux.map((e) => ({ apprenant: e.apprenant, classe: e.classe, etablissementNom: e.etablissement?.nom ?? null, evenements: monde.evenements, certificats: monde.certificats.filter((c) => c.apprenantId === e.apprenant.id), nomEtablissement: nom })),
      chargement: false,
      base: false,
    };
  }, [api.donnees, api.chargement, locaux, monde]);
}

export function usePasseport(): { dossier: DossierSource | null; chargement: boolean; base: boolean } {
  const profil = useProfil();
  const monde = useMonde();
  const api = useLectureApi<DossierApi>(profil.id, "/moi/passeport");
  return useMemo(() => {
    if (apiActive && api.donnees) return { dossier: depuisApi(api.donnees), chargement: false, base: true };
    if (apiActive && api.chargement) return { dossier: null, chargement: true, base: true };
    const h = profil.habilitations.find((x) => x.role === "apprenant");
    const id = h?.perimetre.niveau === "personnel" ? h.perimetre.apprenantId : "";
    const a = monde.apprenants.find((x) => x.id === id);
    if (!a) return { dossier: null, chargement: false, base: false };
    const s = situationApprenant(monde, monde.evenements, a.id);
    const nom = (eid: string | null) => monde.etablissements.find((e) => e.id === eid)?.nom ?? null;
    return { dossier: { apprenant: a, classe: s.classe, etablissementNom: nom(s.etablissementId), evenements: monde.evenements, certificats: monde.certificats.filter((c) => c.apprenantId === a.id), nomEtablissement: nom }, chargement: false, base: false };
  }, [api.donnees, api.chargement, profil, monde]);
}
