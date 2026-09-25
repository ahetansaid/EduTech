"use client";

import { ChevronsUpDown, KeyRound, LifeBuoy, LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "@/components/motion";
import { cn } from "@/lib/cn";
import { useDeconnexion, useSession } from "@/lib/session";

export const initiales = (nom: string) => nom.replace(/^Dr\s+/, "").split(/\s+/).map((m) => m[0]).slice(0, 2).join("").toUpperCase();

export function Avatar({ nom, className }: { nom: string; className?: string }) {
  return (
    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-soft text-[12px] font-bold text-accent-ink", className)} aria-hidden>
      {initiales(nom)}
    </span>
  );
}

/** Menu du compte connecté : identité, habilitations, mot de passe, déconnexion (révocation serveur). */
export function MenuUtilisateur({ compact = false, vers = "haut" }: { compact?: boolean; vers?: "haut" | "bas" }) {
  const { profil, compte } = useSession();
  const deconnexion = useDeconnexion();
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const clic = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOuvert(false); };
    const echap = (e: KeyboardEvent) => { if (e.key === "Escape") setOuvert(false); };
    document.addEventListener("mousedown", clic);
    document.addEventListener("keydown", echap);
    return () => { document.removeEventListener("mousedown", clic); document.removeEventListener("keydown", echap); };
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        aria-haspopup="menu"
        title={compact ? profil.nomAffiche : undefined}
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
      <AnimatePresence>
        {ouvert && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: vers === "haut" ? 8 : -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: vers === "haut" ? 8 : -8, scale: 0.97, transition: { duration: 0.15 } }}
            className={cn("absolute z-50 w-[18rem] rounded-lg border border-line/70 bg-surface p-1.5 shadow-pop", vers === "haut" ? "bottom-full left-0 mb-2" : "right-0 top-full mt-2")}
          >
            <div className="flex items-center gap-3 px-2.5 py-2.5">
              <Avatar nom={profil.nomAffiche} className="h-10 w-10" />
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold text-ink">{profil.nomAffiche}</p>
                <p className="truncate font-mono text-[11.5px] text-ink-muted">{compte.identifiant}</p>
              </div>
            </div>
            <div className="mx-2.5 mb-1.5 rounded-md bg-surface-2/70 px-2.5 py-2">
              <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted"><ShieldCheck size={12} aria-hidden /> Habilitations</p>
              <p className="mt-1 text-[12.5px] text-ink-2">{profil.fonction}</p>
            </div>
            <div className="my-1 h-px bg-line/60" />
            <Link role="menuitem" href="/mot-de-passe" onClick={() => setOuvert(false)} className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink">
              <KeyRound size={15} aria-hidden /> Changer mon mot de passe
            </Link>
            <Link role="menuitem" href="/assistance" onClick={() => setOuvert(false)} className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink">
              <LifeBuoy size={15} aria-hidden /> Assistance
            </Link>
            <button role="menuitem" onClick={() => deconnexion.mutate()} disabled={deconnexion.isPending} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-critical hover:bg-critical-bg">
              <LogOut size={15} aria-hidden /> {deconnexion.isPending ? "Déconnexion…" : "Se déconnecter"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
