import { AppShell } from "@/components/shell/AppShell";

/** Espaces de gestion (établissement, conformité, plateforme de données) : une enveloppe persistante. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppShell variante="gestion">{children}</AppShell>;
}
