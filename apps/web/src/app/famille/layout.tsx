"use client";

import { Bell, FileText, House } from "lucide-react";
import { EspacePersonnel } from "@/components/shell/EspacePersonnel";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <EspacePersonnel
      espace="famille"
      roles={["parent"]}
      onglets={[
        { href: "/famille", libelle: "Mes enfants", icone: House },
        { href: "/famille/notifications", libelle: "Notifications", icone: Bell },
        { href: "/famille/documents", libelle: "Documents", icone: FileText },
      ]}
    >
      {children}
    </EspacePersonnel>
  );
}
