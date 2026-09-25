"use client";

import { AlertTriangle, Copy, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { motion } from "@/components/motion";
import { notifier } from "@/components/ui/Notifications";
import { Button } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

/** Briques partagées par les onglets de l'administration. */

export const TZ = "Africa/Porto-Novo";
const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });

export function ilYA(iso: string | null, maintenant: number, jamais = "Jamais connecté") {
  if (!iso) return jamais;
  const s = Math.round((Date.parse(iso) - maintenant) / 1000);
  const a = Math.abs(s);
  if (a < 60) return "à l'instant";
  if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (a < 30 * 86400) return rtf.format(Math.round(s / 86400), "day");
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", timeZone: TZ });
}
export const heure = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
export const dateHeure = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });

export function normaliser(t: string) {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Classes des champs de formulaire (conventions §9). */
export const CHAMP = "h-10 w-full rounded-md border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-ink-muted focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/15 disabled:bg-surface-2 disabled:text-ink-muted";
export const ZONE_TEXTE = "w-full rounded-md border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/15";

export function Champ({ id, libelle, aide, erreur, facultatif, children, className }: { id: string; libelle: string; aide?: string; erreur?: string | null; facultatif?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-medium text-ink">
        {libelle}
        {facultatif && <span className="text-xs font-normal text-ink-muted">facultatif</span>}
      </label>
      {children}
      {erreur ? <p className="mt-1 text-xs text-critical" role="alert">{erreur}</p> : aide ? <p className="mt-1 text-xs text-ink-muted">{aide}</p> : null}
    </div>
  );
}

export function Avatar({ nom, actif = true, className }: { nom: string; actif?: boolean; className?: string }) {
  const initiales = nom.replace(/^Dr\s+/, "").split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join("").toUpperCase();
  return (
    <span className={cn("relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold", actif ? "bg-blue-soft text-accent-ink" : "bg-surface-2 text-ink-muted", className)} aria-hidden>
      {initiales}
      <span className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface", actif ? "bg-success" : "bg-ink-muted")} />
    </span>
  );
}

/**
 * Affichage unique d'un mot de passe temporaire : masqué par défaut, copiable. Il ne vit que dans l'état
 * du composant appelant ; ni cache de requêtes, ni stockage du navigateur, ni journal de la console.
 */
export function SecretUnique({ nom, identifiant, motDePasse }: { nom: string; identifiant: string; motDePasse: string }) {
  const [visible, setVisible] = useState(false);
  const [copie, setCopie] = useState(false);
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(motDePasse);
      setCopie(true);
      notifier({ ton: "succes", titre: "Copié dans le presse-papiers" });
    } catch {
      notifier({ ton: "avertissement", titre: "Copie impossible", texte: "Affichez le mot de passe et recopiez-le." });
    }
  };
  return (
    <div className="space-y-3">
      <p>Pour <span className="font-semibold text-ink">{nom}</span> (<span className="font-mono">{identifiant}</span>). Transmettez-le par un canal sûr, en personne de préférence.</p>
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2/60 p-2 pl-3">
        <code className="min-w-0 flex-1 select-all break-all font-mono text-[17px] font-semibold tracking-wide text-ink" aria-label={visible ? "Mot de passe temporaire" : "Mot de passe masqué"}>
          {visible ? motDePasse : "•".repeat(Math.min(motDePasse.length, 20))}
        </code>
        <button type="button" onClick={() => setVisible((v) => !v)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface hover:text-ink" aria-label={visible ? "Masquer" : "Afficher"} title={visible ? "Masquer" : "Afficher"}>
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
        <Button type="button" variante={copie ? "valider" : "secondaire"} taille="sm" icone={Copy} className="h-10 shrink-0" onClick={copier}>{copie ? "Copié" : "Copier"}</Button>
      </div>
      <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-bg px-3 py-2 text-[13px] text-ink">
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" aria-hidden />
        Ce mot de passe ne sera plus jamais affiché : il n'est conservé ni sur le serveur (seule son empreinte l'est) ni dans ce navigateur. En cas de perte, il faudra le réinitialiser.
      </motion.p>
    </div>
  );
}
