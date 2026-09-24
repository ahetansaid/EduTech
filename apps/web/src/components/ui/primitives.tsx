"use client";

import type { LucideIcon } from "lucide-react";
import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { EASE, IndicateurActif, motion } from "@/components/motion";
import type { HTMLMotionProps } from "motion/react";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ Carte */

/** Carte flottante : se révèle à son entrée à l'écran ; s'élève au survol si elle est cliquable. */
export function Card({ className, interactive, ...props }: HTMLMotionProps<"div"> & { interactive?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.45, ease: EASE }}
      whileHover={interactive ? { y: -4 } : undefined}
      whileTap={interactive ? { scale: 0.99 } : undefined}
      className={cn(
        "rounded-xl border border-line/70 bg-surface p-5 shadow-float",
        interactive && "cursor-pointer transition-shadow duration-200 hover:shadow-pop",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ title, subtitle, action, icon: Icon, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: LucideIcon; className?: string }) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-3", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-blue-soft text-accent-ink">
            <Icon size={16} aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[13px] text-ink-muted">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ Bouton */

type Variante = "primaire" | "valider" | "secondaire" | "fantome" | "danger";
const VARIANTES: Record<Variante, string> = {
  primaire: "bg-navy text-white shadow-sm hover:bg-navy-deep dark:bg-blue dark:text-navy-deep dark:hover:bg-blue/85",
  valider: "bg-teal text-white shadow-sm hover:bg-teal/90",
  secondaire: "bg-surface text-ink ring-1 ring-inset ring-line hover:bg-surface-2",
  fantome: "bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger: "bg-critical text-white shadow-sm hover:bg-critical/90",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; taille?: "sm" | "md" | "lg"; icone?: LucideIcon; chargement?: boolean }>(
  function Button({ className, variante = "primaire", taille = "md", icone: Icone, chargement, disabled, children, ...props }, ref) {
    return (
      <button
        ref={ref}
        disabled={disabled || chargement}
        className={cn(
          "inline-flex select-none items-center justify-center gap-2 rounded-md font-medium transition-all duration-150 active:scale-[0.97]",
          "disabled:pointer-events-none disabled:opacity-50",
          taille === "sm" ? "h-8 px-3 text-[13px]" : taille === "lg" ? "h-12 px-5 text-[15px]" : "h-10 px-4 text-sm",
          VARIANTES[variante],
          className,
        )}
        {...props}
      >
        {chargement ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : Icone ? <Icone size={taille === "sm" ? 14 : 16} aria-hidden /> : null}
        {children}
      </button>
    );
  },
);

/* ------------------------------------------------------------------ Badge */

export type Ton = "neutre" | "info" | "succes" | "avertissement" | "critique" | "marque";
const TONS: Record<Ton, string> = {
  neutre: "bg-surface-2 text-ink-2",
  info: "bg-info-bg text-info",
  succes: "bg-success-bg text-success",
  avertissement: "bg-warning-bg text-warning",
  critique: "bg-critical-bg text-critical",
  marque: "bg-blue-soft text-accent-ink",
};

export function Badge({ ton = "neutre", icone: Icone, className, children }: { ton?: Ton; icone?: LucideIcon; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-2 py-0.5 text-[12px] font-medium", TONS[ton], className)}>
      {Icone && <Icone size={12} aria-hidden />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ En-tête de page */

export function PageHeader({ titre, sousTitre, actions, surtitre, className }: { titre: ReactNode; sousTitre?: ReactNode; actions?: ReactNode; surtitre?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {surtitre && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{surtitre}</p>}
        <h1 className="text-[26px] font-bold leading-tight text-ink sm:text-[28px]">{titre}</h1>
        {sousTitre && <p className="mt-1 max-w-3xl text-[15px] text-ink-2">{sousTitre}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/* ------------------------------------------------------------------ Micro-libellé */

export function Etiquette({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted", className)}>{children}</span>;
}

/* ------------------------------------------------------------------ États */

export function EtatVide({ icone: Icone, titre, texte, action }: { icone: LucideIcon; titre: string; texte?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-surface-2 text-ink-muted">
        <Icone size={22} aria-hidden />
      </span>
      <p className="font-semibold text-ink">{titre}</p>
      {texte && <p className="mt-1 max-w-sm text-sm text-ink-muted">{texte}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Squelette({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-2", className)} />;
}

/* ------------------------------------------------------------------ Contrôle segmenté */

export function Segmente<T extends string>({ options, valeur, onChange, label }: { options: { valeur: T; libelle: string }[]; valeur: T; onChange: (v: T) => void; label: string }) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line/70 bg-surface-2/60 p-0.5">
      {options.map((o) => (
        <button
          key={o.valeur}
          role="radio"
          aria-checked={valeur === o.valeur}
          onClick={() => onChange(o.valeur)}
          className={cn(
            "relative rounded-[10px] px-3 py-1.5 text-[13px] font-medium transition-colors duration-200",
            valeur === o.valeur ? "text-ink" : "text-ink-muted hover:text-ink",
          )}
        >
          {valeur === o.valeur && <IndicateurActif id={`segmente-${id}`} className="absolute inset-0 rounded-[10px] bg-surface shadow-soft" />}
          <span className="relative">{o.libelle}</span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Bande nationale */

export function BandeNationale({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("grid h-1 grid-cols-3", className)}>
      <span className="bg-flag-green" />
      <span className="bg-flag-yellow" />
      <span className="bg-flag-red" />
    </div>
  );
}

/* ------------------------------------------------------------------ Logotype */

export function Logo({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-navy text-white shadow-sm dark:bg-blue dark:text-navy-deep">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9.5 12 5l9 4.5-9 4.5L3 9.5Z" />
          <path d="M7 11.5V16c0 1.2 2.2 2.5 5 2.5s5-1.3 5-2.5v-4.5" />
          <path d="M21 9.5V14" />
        </svg>
        <span className="absolute inset-x-0 bottom-0 grid h-[3px] grid-cols-3">
          <span className="bg-flag-green" />
          <span className="bg-flag-yellow" />
          <span className="bg-flag-red" />
        </span>
      </span>
      {!compact && (
        <span className="leading-none">
          <span className="block font-display text-[17px] font-bold tracking-tight text-ink">BEILE</span>
          <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">Éducation · Bénin</span>
        </span>
      )}
    </span>
  );
}
