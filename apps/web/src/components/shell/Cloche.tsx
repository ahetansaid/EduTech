"use client";

import { Bell, CheckCheck } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "@/components/motion";
import { ecrire, lire } from "@/lib/http";
import { useProfil } from "@/lib/session";

export interface NotificationServeur { id: string; titre: string; texte: string; lue: boolean; creeLe: string; evenementId: string | null }
export const CLE_NOTIFICATIONS = ["moi", "notifications"] as const;

/** Notifications serveur de l'utilisateur, rafraîchies toutes les 30 s (nouvelle absence, note, inscription…). */
export function useNotifications() {
  return useQuery({
    queryKey: CLE_NOTIFICATIONS,
    queryFn: () => lire<{ nonLues: number; notifications: NotificationServeur[] }>("/moi/notifications"),
    refetchInterval: 30_000,
  });
}

export function useMarquerLues() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => ecrire("/moi/notifications/lues", ids ? { ids } : {}),
    onSuccess: () => client.invalidateQueries({ queryKey: CLE_NOTIFICATIONS }),
  });
}

const depuis = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  return m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : new Date(iso).toLocaleDateString("fr-FR");
};

export function Cloche() {
  const profil = useProfil();
  const { data } = useNotifications();
  const marquer = useMarquerLues();
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const clic = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOuvert(false); };
    document.addEventListener("mousedown", clic);
    return () => document.removeEventListener("mousedown", clic);
  }, []);
  if (!profil.npi) return null;
  const nonLues = data?.nonLues ?? 0;

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOuvert((o) => !o)} className="relative flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2" aria-label={`${nonLues} notification(s) non lue(s)`} aria-expanded={ouvert}>
        <motion.span key={nonLues} animate={nonLues ? { rotate: [0, -14, 12, -8, 0] } : {}} transition={{ duration: 0.6 }}><Bell size={18} aria-hidden /></motion.span>
        <AnimatePresence>
          {nonLues > 0 && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[10px] font-bold text-white">
              {nonLues > 99 ? "99+" : nonLues}
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      <AnimatePresence>
        {ouvert && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.97, transition: { duration: 0.15 } }}
            className="absolute right-0 top-full z-50 mt-2 w-[22rem] max-w-[calc(100vw-1.5rem)] rounded-lg border border-line/70 bg-surface shadow-pop"
          >
            <div className="flex items-center justify-between border-b border-line/60 px-4 py-3">
              <p className="text-[13.5px] font-semibold text-ink">Notifications</p>
              {nonLues > 0 && (
                <button onClick={() => marquer.mutate(undefined)} className="flex items-center gap-1 text-[12px] font-medium text-accent-ink hover:underline">
                  <CheckCheck size={14} aria-hidden /> Tout marquer comme lu
                </button>
              )}
            </div>
            <ul className="max-h-[60vh] overflow-y-auto p-1.5">
              {(data?.notifications ?? []).length === 0 && <li className="px-3 py-8 text-center text-[13px] text-ink-muted">Aucune notification pour l'instant.</li>}
              {(data?.notifications ?? []).slice(0, 20).map((n) => (
                <li key={n.id} className="flex gap-3 rounded-md px-3 py-2.5 hover:bg-surface-2">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.lue ? "bg-transparent" : "bg-blue"}`} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-ink">{n.titre}</p>
                    <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{n.texte}</p>
                    <p className="mt-1 text-[11px] text-ink-muted">{depuis(n.creeLe)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
