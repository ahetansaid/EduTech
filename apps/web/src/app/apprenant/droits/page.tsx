"use client";

import { MesDroits } from "@/components/droits/MesDroits";
import { EntreePage } from "@/components/motion";
import { usePasseport } from "@/lib/api/parcours";

/** Mes données (apprenant) : mon dossier scolaire, ou mon compte. */
export default function DroitsApprenant() {
  const q = usePasseport();
  const sujets = [
    ...(q.data ? [{ valeur: q.data.apprenant.id, libelle: "Mon dossier scolaire" }] : []),
    { valeur: "compte", libelle: "Mon compte" },
  ];
  return <EntreePage><MesDroits key={sujets.length} sujets={sujets} /></EntreePage>;
}
