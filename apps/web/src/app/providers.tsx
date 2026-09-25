"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { MotionProvider } from "@/components/motion";
import { ErreurApi } from "@/lib/http";
import { Notifications, notifier } from "@/components/ui/Notifications";

/**
 * Cache de requêtes partagé : données fraîches 15 s, rafraîchies au retour sur l'onglet et à la reconnexion,
 * jamais de nouvelle tentative sur un refus (401/403/404/422) — un refus est une réponse, pas une panne.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: (n, e) => !(e instanceof ErreurApi && e.statut >= 400 && e.statut < 500) && n < 2,
      },
    },
    queryCache: new QueryCache(),
    mutationCache: new MutationCache({
      onError: (e) => { if (!(e instanceof ErreurApi && e.statut === 401)) notifier({ ton: "critique", titre: "Action non enregistrée", texte: e.message }); },
    }),
  }));
  return (
    <QueryClientProvider client={client}>
      <MotionProvider>
        {children}
        <Notifications />
      </MotionProvider>
    </QueryClientProvider>
  );
}
