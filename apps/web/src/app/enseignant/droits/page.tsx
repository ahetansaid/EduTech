"use client";

import { MesDroits } from "@/components/droits/MesDroits";
import { EntreePage } from "@/components/motion";

/** Mes données (enseignant) : mon compte et mon dossier professionnel. */
export default function DroitsEnseignant() {
  return <EntreePage><MesDroits sujets={[{ valeur: "compte", libelle: "Mon compte" }]} /></EntreePage>;
}
