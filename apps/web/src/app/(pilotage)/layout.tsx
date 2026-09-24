import { AppShell } from "@/components/shell/AppShell";

/** Espaces de pilotage (cockpit, console territoriale, Ask Education, simulation) : une enveloppe persistante. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppShell variante="pilotage">{children}</AppShell>;
}
