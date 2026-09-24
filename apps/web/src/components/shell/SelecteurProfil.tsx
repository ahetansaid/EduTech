"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { ACCUEIL_PROFIL } from "@/lib/navigation";
import { getMonde } from "@/lib/sim/monde";
import { useDemo, useProfil } from "@/lib/store";

export const initiales = (nom: string) => nom.replace(/^Dr\s+/, "").split(/\s+/).map((m) => m[0]).slice(0, 2).join("").toUpperCase();

export function Avatar({ nom, className }: { nom: string; className?: string }) {
  return (
    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-soft text-[12px] font-bold text-accent-ink", className)} aria-hidden>
      {initiales(nom)}
    </span>
  );
}

/** Sélecteur de profil de démonstration : changer d'acteur en un clic pendant la présentation. */
export function SelecteurProfil({ ouvertParDefaut = false, compact = false, vers = "haut" }: { ouvertParDefaut?: boolean; compact?: boolean; vers?: "haut" | "bas" }) {
  const profil = useProfil();
  const changerProfil = useDemo((s) => s.changerProfil);
  const router = useRouter();
  const [ouvert, setOuvert] = useState(ouvertParDefaut);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const clic = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOuvert(false); };
    document.addEventListener("mousedown", clic);
    return () => document.removeEventListener("mousedown", clic);
  }, []);

  return (
    <div ref={ref} className="relative w-full">
      <button
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        aria-haspopup="listbox"
        title={compact ? `${profil.nomAffiche} — changer de profil` : undefined}
        className={cn("flex w-full items-center gap-3 rounded-md text-left transition-colors hover:bg-surface-2", compact ? "justify-center p-1.5" : "px-2 py-2")}
      >
        <Avatar nom={profil.nomAffiche} />
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-ink">{profil.nomAffiche}</span>
              <span className="block truncate text-[11.5px] text-ink-muted">{profil.fonction}</span>
            </span>
            <ChevronsUpDown size={15} className="text-ink-muted" aria-hidden />
          </>
        )}
      </button>
      {ouvert && (
        <div role="listbox" aria-label="Changer de profil" className={cn("absolute z-50 max-h-[70vh] w-[19rem] animate-slide-up overflow-y-auto rounded-lg border border-line/70 bg-surface p-1.5 shadow-pop", vers === "haut" ? "bottom-full left-0 mb-2" : "right-0 top-full mt-2")}>
          <p className="px-2.5 pb-1.5 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Profils de démonstration</p>
          {getMonde().profils.map((p) => (
            <button
              key={p.id}
              role="option"
              aria-selected={p.id === profil.id}
              onClick={() => { changerProfil(p.id); setOuvert(false); router.push(ACCUEIL_PROFIL[p.id] ?? "/"); }}
              className={cn("flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-surface-2", p.id === profil.id && "bg-surface-2")}
            >
              <Avatar nom={p.nomAffiche} className="h-8 w-8 text-[11px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink">{p.nomAffiche}</span>
                <span className="block truncate text-[11.5px] text-ink-muted">{p.fonction}</span>
              </span>
              {p.id === profil.id && <Check size={15} className="text-blue" aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
