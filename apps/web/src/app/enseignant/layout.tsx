"use client";

import { BookUser, CalendarCheck, GraduationCap, ShieldCheck } from "lucide-react";
import { EspacePersonnel } from "@/components/shell/EspacePersonnel";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <EspacePersonnel
      espace="enseignant"
      roles={["enseignant"]}
      largeur="large"
      onglets={[
        { href: "/enseignant", libelle: "Mes classes", icone: CalendarCheck },
        { href: "/enseignant/carriere", libelle: "Parcours pro", icone: GraduationCap },
        { href: "/famille", libelle: "Mon enfant", icone: BookUser, roles: ["parent"] },
        { href: "/enseignant/droits", libelle: "Mes données", icone: ShieldCheck },
      ]}
    >
      {children}
    </EspacePersonnel>
  );
}
