"use client";

import { MesDroits } from "@/components/droits/MesDroits";
import { EntreePage } from "@/components/motion";
import { useEnfants } from "@/lib/api/parcours";

/** Mes données (famille) : mon compte, ou le dossier d'un enfant dont je suis responsable. */
export default function DroitsFamille() {
  const enfants = useEnfants();
  const sujets = [
    ...(enfants.data ?? []).map((d) => ({ valeur: d.apprenant.id, libelle: `Dossier de ${d.apprenant.prenoms}` })),
    { valeur: "compte", libelle: "Mon compte" },
  ];
  return <EntreePage><MesDroits key={sujets.length} sujets={sujets} /></EntreePage>;
}
