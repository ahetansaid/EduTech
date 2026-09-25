"use client";

import { CheckCircle2, Info, TriangleAlert, X, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "@/components/motion";
import { cn } from "@/lib/cn";

/** Notifications éphémères (toasts) : confirmation d'une action, refus, erreur réseau. */
type Ton = "succes" | "info" | "avertissement" | "critique";
interface Toast { id: number; ton: Ton; titre: string; texte?: string }

let suivant = 0;
const abonnes = new Set<(t: Toast) => void>();

export function notifier(t: Omit<Toast, "id">) {
  const complet = { ...t, id: ++suivant };
  abonnes.forEach((f) => f(complet));
}

const ICONES = { succes: CheckCircle2, info: Info, avertissement: TriangleAlert, critique: XCircle };
const COULEURS: Record<Ton, string> = { succes: "text-success", info: "text-info", avertissement: "text-warning", critique: "text-critical" };

export function Notifications() {
  const [liste, setListe] = useState<Toast[]>([]);
  useEffect(() => {
    const f = (t: Toast) => {
      setListe((l) => [...l.slice(-3), t]);
      setTimeout(() => setListe((l) => l.filter((x) => x.id !== t.id)), t.ton === "critique" ? 7000 : 4500);
    };
    abonnes.add(f);
    return () => { abonnes.delete(f); };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-20 z-[60] flex flex-col items-center gap-2 md:bottom-6 md:right-6 md:left-auto md:items-end" aria-live="polite">
      <AnimatePresence initial={false}>
        {liste.map((t) => {
          const I = ICONES[t.ton];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-line/70 bg-surface/95 p-3.5 shadow-pop backdrop-blur-xl"
              role={t.ton === "critique" ? "alert" : "status"}
            >
              <I size={18} className={cn("mt-0.5 shrink-0", COULEURS[t.ton])} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-ink">{t.titre}</p>
                {t.texte && <p className="mt-0.5 text-[12.5px] text-ink-2">{t.texte}</p>}
              </div>
              <button onClick={() => setListe((l) => l.filter((x) => x.id !== t.id))} className="text-ink-muted hover:text-ink" aria-label="Fermer"><X size={15} /></button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
