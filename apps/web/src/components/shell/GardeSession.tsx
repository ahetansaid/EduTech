"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { FournisseurSession, useSessionServeur } from "@/lib/session";
import { Logo } from "@/components/ui/primitives";
import { motion } from "@/components/motion";

/**
 * Garde d'espace authentifié : attend la session serveur, renvoie vers la connexion si elle manque,
 * impose le changement du mot de passe initial, puis fournit la session aux écrans.
 */
export function GardeSession({ children }: { children: ReactNode }) {
  const { data: session, isPending, isError } = useSessionServeur();
  const router = useRouter();
  const pathname = usePathname();

  // Étapes imposées, dans l'ordre : mot de passe personnel, puis second facteur (administrateurs de niveau 0 à 2).
  const etape = !session ? null
    : session.compte.doitChangerMotDePasse ? "/mot-de-passe"
    : session.compte.mfaExige && !session.compte.mfaVerifie ? "/second-facteur"
    : null;
  useEffect(() => {
    if (isPending) return;
    if (!session) router.replace(`/connexion?retour=${encodeURIComponent(pathname)}`);
    else if (etape && pathname !== etape) router.replace(`${etape}?retour=${encodeURIComponent(pathname)}`);
  }, [session, isPending, pathname, router, etape]);

  if (isError) return <Chargement message="Service momentanément indisponible. Nouvelle tentative…" />;
  if (isPending || !session || (etape && pathname !== etape)) return <Chargement />;
  return <FournisseurSession session={session}>{children}</FournisseurSession>;
}

function Chargement({ message }: { message?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-bg" aria-busy>
      <motion.div animate={{ scale: [1, 1.06, 1], opacity: [0.85, 1, 0.85] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}>
        <Logo />
      </motion.div>
      <div className="h-1 w-40 overflow-hidden rounded-full bg-surface-2">
        <motion.div className="h-full w-1/3 rounded-full bg-blue" animate={{ x: ["-100%", "300%"] }} transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }} />
      </div>
      {message && <p className="text-sm text-ink-muted">{message}</p>}
    </div>
  );
}
