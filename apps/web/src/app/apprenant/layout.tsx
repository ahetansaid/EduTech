"use client";

import { Award, Compass, Route } from "lucide-react";
import { EspacePersonnel } from "@/components/shell/EspacePersonnel";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <EspacePersonnel
      espace="apprenant"
      roles={["apprenant"]}
      onglets={[
        { href: "/apprenant", libelle: "Mon parcours", icone: Route },
        { href: "/apprenant/preuves", libelle: "Mes diplômes", icone: Award },
        { href: "/apprenant/orientation", libelle: "Orientation", icone: Compass },
      ]}
    >
      {children}
    </EspacePersonnel>
  );
}
