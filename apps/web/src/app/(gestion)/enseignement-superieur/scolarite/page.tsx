"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Squelette } from "@/components/ui/primitives";
import { useEtablissementCourant } from "@/lib/session";

/**
 * L'onglet « Scolarité » n'a pas d'écran d'accueil : deux portes, deux périmètres. Un chef entre dans
 * son référentiel (nominatif), un agent de pilotage entre aux agrégats. Rien ici ne choisit à la place
 * du serveur — la redirection ne fait que montrer la porte que l'habilitation permet d'ouvrir.
 */
export default function IndexScolarite() {
  const router = useRouter();
  const id = useEtablissementCourant();
  useEffect(() => {
    router.replace(id ? "/enseignement-superieur/scolarite/referentiel" : "/enseignement-superieur/scolarite/pilotage");
  }, [id, router]);
  return (
    <div className="space-y-5">
      <Squelette className="h-16" />
      <Squelette className="h-64" />
    </div>
  );
}
