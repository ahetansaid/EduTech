"use client";

import { CloudOff } from "lucide-react";
import { useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "@/components/motion";

/** État réel du réseau (navigator.onLine) : visible seulement quand la connexion est perdue. */
const abonner = (f: () => void) => {
  window.addEventListener("online", f);
  window.addEventListener("offline", f);
  return () => { window.removeEventListener("online", f); window.removeEventListener("offline", f); };
};

export function useEnLigne() {
  return useSyncExternalStore(abonner, () => navigator.onLine, () => true);
}

export function EtatReseau() {
  const enLigne = useEnLigne();
  return (
    <AnimatePresence>
      {!enLigne && (
        <motion.span
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
          className="flex h-9 items-center gap-1.5 rounded-md bg-warning-bg px-2.5 text-[12.5px] font-medium text-warning"
          role="status"
        >
          <CloudOff size={16} aria-hidden /> <span className="hidden sm:inline">Hors connexion</span>
        </motion.span>
      )}
    </AnimatePresence>
  );
}
