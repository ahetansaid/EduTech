import { MentionOrigine } from "@/components/pilotage/MentionOrigine";
import { AppShell } from "@/components/shell/AppShell";

/** Espaces de pilotage (cockpit, console territoriale, Ask Education) : une enveloppe persistante. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppShell variante="pilotage"><MentionOrigine />{children}</AppShell>;
}
