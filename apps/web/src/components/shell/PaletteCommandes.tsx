"use client";

import { ArrowRight, CornerDownLeft, Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { motion } from "@/components/motion";
import { cn } from "@/lib/cn";
import { navigationPour } from "@/lib/navigation";
import { useProfil } from "@/lib/session";

interface Commande { id: string; libelle: string; detail?: string; icone: typeof Search; action: () => void }

/** Palette ⌘K : naviguer dans ses espaces, poser une question à Ask Education. */
export function PaletteCommandes({ onFermer }: { onFermer: () => void }) {
  const router = useRouter();
  const profil = useProfil();
  const [saisie, setSaisie] = useState("");
  const [index, setIndex] = useState(0);

  const commandes = useMemo<Commande[]>(() => {
    const roles = profil.habilitations.map((h) => h.role);
    const q = saisie.trim().toLowerCase();
    const liste: Commande[] = [];
    const peutDemander = roles.some((r) => ["administration_centrale", "direction_departementale", "inspecteur", "chercheur"].includes(r));
    if (q.length > 3 && peutDemander) {
      liste.push({ id: "ask", libelle: `Demander à Ask Education : « ${saisie.trim()} »`, detail: "Requête contrôlée, aucun chiffre inventé", icone: Sparkles, action: () => router.push(`/ask?q=${encodeURIComponent(saisie.trim())}`) });
    }
    for (const n of navigationPour(roles)) {
      if (!q || n.libelle.toLowerCase().includes(q)) liste.push({ id: n.href, libelle: n.libelle, detail: n.processus ? `Processus ${n.processus}` : undefined, icone: n.icone, action: () => router.push(n.href) });
    }
    return liste.slice(0, 12);
  }, [saisie, profil, router]);

  const executer = (c?: Commande) => { if (c) { c.action(); onFermer(); } };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Palette de commandes">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="absolute inset-0 bg-navy-deep/40 backdrop-blur-sm" onClick={onFermer} />
      <motion.div initial={{ opacity: 0, y: -12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }} transition={{ type: "spring", stiffness: 480, damping: 34 }} className="relative w-full max-w-xl overflow-hidden rounded-xl border border-line/70 bg-surface shadow-pop">
        <div className="flex items-center gap-3 border-b border-line/60 px-4">
          <Search size={18} className="text-ink-muted" aria-hidden />
          <input
            autoFocus
            value={saisie}
            onChange={(e) => { setSaisie(e.target.value.slice(0, 300)); setIndex(0); }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onFermer();
              else if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, commandes.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
              else if (e.key === "Enter") executer(commandes[index]);
            }}
            placeholder="Aller à un espace, changer de profil, poser une question…"
            className="h-14 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-muted"
            aria-label="Commande"
          />
          <kbd className="rounded-[6px] border border-line px-1.5 py-0.5 text-[10px] text-ink-muted">Échap</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-1.5">
          {commandes.map((c, i) => (
            <li key={c.id}>
              <button
                onMouseEnter={() => setIndex(i)}
                onClick={() => executer(c)}
                className="relative flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left"
              >
                {i === index && <motion.span layoutId="palette-survol" className="absolute inset-0 rounded-md bg-surface-2" transition={{ type: "spring", stiffness: 520, damping: 40 }} aria-hidden />}
                <c.icone size={17} className={cn("relative", c.id === "ask" ? "text-amber" : "text-ink-muted")} aria-hidden />
                <span className="relative min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{c.libelle}</span>
                  {c.detail && <span className="block truncate text-[12px] text-ink-muted">{c.detail}</span>}
                </span>
                {i === index ? <CornerDownLeft size={14} className="text-ink-muted" aria-hidden /> : <ArrowRight size={14} className="text-transparent" aria-hidden />}
              </button>
            </li>
          ))}
          {commandes.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-muted">Aucun résultat</li>}
        </ul>
      </motion.div>
    </div>
  );
}
