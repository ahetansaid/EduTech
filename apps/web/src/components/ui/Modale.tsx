"use client";

import { X, type LucideIcon } from "lucide-react";
import { useEffect, useId, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "@/components/motion";
import { cn } from "@/lib/cn";

/**
 * Modale BEILE : feuille basse sur mobile, centrée à partir de sm. Voile flouté, entrée en ressort,
 * Échap et clic sur le voile ferment (sauf si `fermable` est faux), corps défilant, pied séparé.
 * Rendue dans <body> : l'animation d'entrée de page (transform) deviendrait sinon le repère des éléments « fixed ».
 */
export function Modale({ ouvert, onFermer, fermable = true, titre, sousTitre, icone: Icone, ton = "info", large, children, pied }: {
  ouvert: boolean; onFermer: () => void; fermable?: boolean; titre: ReactNode; sousTitre?: ReactNode; icone: LucideIcon;
  ton?: "info" | "critique" | "avertissement" | "succes"; large?: boolean; children: ReactNode; pied?: ReactNode;
}) {
  const idTitre = useId();
  useEffect(() => {
    if (!ouvert || !fermable) return;
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [ouvert, fermable, onFermer]);
  // Pas de défilement de la page sous la modale.
  useEffect(() => {
    if (!ouvert) return;
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = avant; };
  }, [ouvert]);
  const monte = useSyncExternalStore(() => () => {}, () => true, () => false);
  if (!monte) return null;
  return createPortal(
    <AnimatePresence>
      {ouvert && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
          <motion.div className="absolute inset-0 bg-navy-deep/40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={fermable ? onFermer : undefined} aria-hidden />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={idTitre}
            className={cn("relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line/70 bg-surface shadow-pop sm:max-h-[88dvh] sm:rounded-2xl", large ? "sm:max-w-2xl" : "sm:max-w-lg")}
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
          >
            <div className="flex shrink-0 items-start gap-3 border-b border-line/60 px-5 py-4">
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", ton === "critique" ? "bg-critical-bg text-critical" : ton === "avertissement" ? "bg-warning-bg text-warning" : ton === "succes" ? "bg-success-bg text-success" : "bg-blue-soft text-accent-ink")}><Icone size={17} aria-hidden /></span>
              <div className="min-w-0 flex-1 pt-1">
                <h2 id={idTitre} className="text-[16px] font-semibold leading-snug text-ink">{titre}</h2>
                {sousTitre && <p className="mt-0.5 truncate text-xs text-ink-muted">{sousTitre}</p>}
              </div>
              {fermable && <button type="button" onClick={onFermer} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2" aria-label="Fermer"><X size={17} /></button>}
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-4 text-sm text-ink-2">{children}</div>
            {pied && <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-line/60 bg-surface-2/40 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">{pied}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
