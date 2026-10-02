"use client";

import { Check, Copy, FlaskConical } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { lire } from "@/lib/http";

/**
 * Comptes de démonstration (jury) : le code courant du second facteur, prêt à copier. Le serveur ne le rend
 * qu'aux comptes marqués « démonstration », après un mot de passe juste ; pour tout autre compte, rien ne s'affiche.
 */
export function CodeDemonstration({ onUtiliser }: { onUtiliser?: (code: string) => void }) {
  const [copie, setCopie] = useState(false);
  const q = useQuery({
    queryKey: ["securite", "code-demonstration"],
    queryFn: ({ signal }) => lire<{ code: string; resteSecondes: number; valableDans: number }>("/auth/mfa/demonstration", signal),
    retry: false, refetchInterval: 5_000, refetchOnWindowFocus: true, staleTime: 0, gcTime: 0,
  });
  if (!q.data) return null;
  const { code } = q.data;
  const copier = () => {
    void navigator.clipboard?.writeText(code);
    onUtiliser?.(code);
    setCopie(true);
    setTimeout(() => setCopie(false), 1500);
  };
  return (
    <div className="rounded-lg border border-dashed border-warning/60 bg-warning-bg px-4 py-3">
      <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-warning"><FlaskConical size={14} aria-hidden /> Compte de démonstration</p>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <span className="font-mono text-[26px] font-bold tracking-[0.2em] text-ink" aria-label={`Code ${code}`}>{code.slice(0, 3)} {code.slice(3)}</span>
        <button type="button" onClick={copier} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-surface px-3 text-[13px] font-semibold text-ink ring-1 ring-inset ring-line hover:bg-surface-2">
          {copie ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />} {copie ? "Copié" : "Copier"}
        </button>
      </div>
      <p className="mt-1 text-[12px] text-ink-2">
        {q.data.valableDans > 0 ? `Ce code devient valable dans ${q.data.valableDans} s (le précédent vient d'être utilisé).` : `Code valable environ ${q.data.resteSecondes} s, à usage unique.`} Les comptes réels n'affichent jamais leur code.
      </p>
    </div>
  );
}
