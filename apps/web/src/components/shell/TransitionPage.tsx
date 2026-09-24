import { EntreePage } from "@/components/motion";

/** Transition de page : le contenu apparaît en douceur, l'enveloppe (navigation) ne bouge pas. */
export function TransitionPage({ children }: { children: React.ReactNode }) {
  return <EntreePage>{children}</EntreePage>;
}
