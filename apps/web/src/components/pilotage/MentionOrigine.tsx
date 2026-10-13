"use client";

import { useQuery } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { lire } from "@/lib/http";

interface Origine { indicateurs: "simulation" | "registre"; periode: string; lusAuRegistre: string[] }

/**
 * D'où viennent les chiffres du pilotage, dit une fois en tête de chaque écran. La déclaration vient de l'API
 * (ORIGINE_DES_CHIFFRES) : le jour où le cube est agrégé depuis le registre, la mention disparaît d'elle-même.
 */
export function MentionOrigine() {
  const q = useQuery({ queryKey: ["pilotage", "origine"], queryFn: ({ signal }) => lire<Origine>("/pilotage/origine", signal), staleTime: 60 * 60_000, retry: false });
  if (!q.data || q.data.indicateurs !== "simulation") return null;
  return (
    <p className="mb-4 flex items-start gap-2 rounded-lg border border-line bg-surface-2/60 px-3.5 py-2 text-[12.5px] leading-relaxed text-ink-2">
      <FlaskConical size={15} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
      <span>
        <strong className="font-semibold text-ink">Indicateurs de démonstration</strong> : la couche statistique ({q.data.periode}) est simulée pour la présentation.
        Lus en direct dans le registre réel : {q.data.lusAuRegistre.join(", ")}.
      </span>
    </p>
  );
}
