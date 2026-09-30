"use client";

import { Award, Compass, FileClock, FileText, Route, ShieldCheck } from "lucide-react";
import { EspacePersonnel } from "@/components/shell/EspacePersonnel";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <EspacePersonnel
      espace="apprenant"
      roles={["apprenant"]}
      onglets={[
        { href: "/apprenant", libelle: "Mon parcours", icone: Route },
        { href: "/apprenant/bulletins", libelle: "Mes bulletins", icone: FileText, scolaire: true },
        { href: "/apprenant/demarches", libelle: "Mes démarches", icone: FileClock, etudiantSuperieur: true },
        { href: "/apprenant/preuves", libelle: "Mes diplômes", icone: Award },
        { href: "/apprenant/orientation", libelle: "Orientation", icone: Compass },
        { href: "/apprenant/droits", libelle: "Mes données", icone: ShieldCheck },
      ]}
    >
      {children}
    </EspacePersonnel>
  );
}
