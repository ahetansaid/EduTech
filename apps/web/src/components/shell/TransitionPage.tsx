/** Transition de page : le contenu apparaît en douceur, l'enveloppe (navigation) ne bouge pas. */
export function TransitionPage({ children }: { children: React.ReactNode }) {
  return <div className="animate-page">{children}</div>;
}
