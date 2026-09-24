"use client";

import type { DecisionAcces, IndiceConfiance, ResultatIndicateur } from "@beile/contracts";
import { Check, Info, ShieldCheck, ShieldX, X, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { dateLongue, entier, heure } from "@/lib/format";
import { Etiquette } from "./primitives";

/* ------------------------------------------------------------------ Sparkline */

export function Sparkline({ points, className }: { points: number[]; className?: string }) {
  if (points.length < 2) return null;
  const w = 76, h = 28, pad = 3;
  const min = Math.min(...points), max = Math.max(...points), span = max - min || 1;
  const step = (w - pad * 2) / (points.length - 1);
  const xy = points.map((v, i) => [pad + i * step, pad + (1 - (v - min) / span) * (h - pad * 2)] as const);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = xy[xy.length - 1]!;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("h-7 w-[76px] shrink-0", className)} aria-hidden preserveAspectRatio="none">
      <polygon points={`${pad},${h - pad} ${line} ${lx},${h - pad}`} fill="currentColor" opacity={0.12} />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={2.4} fill="currentColor" />
    </svg>
  );
}

/* ------------------------------------------------------------------ Indice de confiance */

export function tonConfiance(score: number) {
  return score >= 90 ? "succes" : score >= 70 ? "avertissement" : "critique";
}

export function BadgeConfiance({ confiance, detaille = false }: { confiance: IndiceConfiance; detaille?: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const ton = tonConfiance(confiance.score);
  const couleur = ton === "succes" ? "text-success bg-success-bg" : ton === "avertissement" ? "text-warning bg-warning-bg" : "text-critical bg-critical-bg";
  const composantes: [string, number][] = [["Complétude", confiance.completude], ["Fraîcheur", confiance.fraicheur], ["Cohérence", confiance.coherence], ["Validation", confiance.validation]];
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        onBlur={() => setOuvert(false)}
        aria-expanded={ouvert}
        className={cn("inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[12px] font-semibold tabular", couleur)}
        title="Indice de confiance de la donnée"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
        Confiance {confiance.score} %
      </button>
      {(ouvert || detaille) && (
        <span className={cn(detaille ? "relative mt-2 block" : "absolute left-0 top-full z-30 mt-2 w-60 animate-fade-in", "rounded-lg border border-line/70 bg-surface p-3 text-left shadow-pop")}>
          <Etiquette>Indice de confiance</Etiquette>
          <span className="mt-2 block space-y-1.5">
            {composantes.map(([l, v]) => (
              <span key={l} className="flex items-center gap-2 text-[12px]">
                <span className="w-20 text-ink-2">{l}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <span className={cn("block h-full rounded-full", v >= 90 ? "bg-success" : v >= 70 ? "bg-warning" : "bg-critical")} style={{ width: `${v}%` }} />
                </span>
                <span className="w-9 text-right font-medium tabular text-ink">{v} %</span>
              </span>
            ))}
          </span>
          <span className="mt-2 block text-[11px] leading-snug text-ink-muted">Indicateur de qualité documentaire et technique, pas une vérité mathématique.</span>
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ Tuile d'indicateur */

export function TuileIndicateur({
  libelle, valeur, unite, icone: Icone, indice, tendance, variation, confiance, onClick, accent = "neutre", className,
}: {
  libelle: string; valeur: ReactNode; unite?: string; icone?: LucideIcon; indice?: ReactNode; tendance?: number[];
  variation?: { texte: string; favorable: boolean }; confiance?: IndiceConfiance; onClick?: () => void;
  accent?: "neutre" | "bleu" | "sarcelle" | "ambre" | "critique"; className?: string;
}) {
  const couleurAccent = { neutre: "text-ink-muted", bleu: "text-blue", sarcelle: "text-teal dark:text-success", ambre: "text-amber", critique: "text-critical" }[accent];
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "group flex flex-col rounded-lg border border-line/70 bg-surface px-4 py-3.5 text-left shadow-float",
        onClick && "cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-pop",
        className,
      )}
    >
      <span className="flex items-center justify-between gap-3">
        <Etiquette>{libelle}</Etiquette>
        {Icone && <Icone size={16} className={couleurAccent} aria-hidden />}
      </span>
      <span className="mt-2 flex items-end justify-between gap-3">
        <span className="font-display text-[26px] font-bold leading-none tracking-tight text-ink tabular">
          {valeur}
          {unite && <span className="ml-1 text-[15px] font-semibold text-ink-muted">{unite}</span>}
        </span>
        {tendance && <Sparkline points={tendance} className={couleurAccent} />}
      </span>
      {(variation || indice || confiance) && (
        <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-muted">
          {variation && <span className={cn("font-semibold", variation.favorable ? "text-success" : "text-critical")}>{variation.texte}</span>}
          {indice}
          {confiance && <BadgeConfiance confiance={confiance} />}
        </span>
      )}
    </Comp>
  );
}

/* ------------------------------------------------------------------ Provenance d'un chiffre */

export function Provenance({ resultat, className }: { resultat: ResultatIndicateur; className?: string }) {
  const d = resultat.definition;
  const c = resultat.couverture;
  return (
    <dl className={cn("grid gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2", className)}>
      <div><dt className="text-ink-muted">Définition (v{d.version})</dt><dd className="mt-0.5 text-ink">{d.definition}</dd></div>
      <div><dt className="text-ink-muted">Formule</dt><dd className="mt-0.5 font-mono text-[12px] text-ink">{d.formule}</dd></div>
      <div><dt className="text-ink-muted">Source</dt><dd className="mt-0.5 text-ink">{d.source}</dd></div>
      <div><dt className="text-ink-muted">Période · fréquence</dt><dd className="mt-0.5 text-ink">{resultat.periode} · {d.frequence}</dd></div>
      <div>
        <dt className="text-ink-muted">Couverture</dt>
        <dd className="mt-0.5 text-ink">
          {entier(c.etablissementsAyantTransmis)} établissements sur {entier(c.etablissementsAttendus)} ont transmis ({Math.round((c.etablissementsAyantTransmis / Math.max(1, c.etablissementsAttendus)) * 100)} %)
        </dd>
      </div>
      <div><dt className="text-ink-muted">Dernière mise à jour</dt><dd className="mt-0.5 text-ink">{dateLongue(resultat.misAJourLe)} à {heure(resultat.misAJourLe)}</dd></div>
      <div className="sm:col-span-2"><dt className="text-ink-muted">Propriétaire de l'indicateur</dt><dd className="mt-0.5 text-ink">{d.proprietaire}</dd></div>
    </dl>
  );
}

/* ------------------------------------------------------------------ Décision d'accès */

const LIBELLE_CRITERE = { role: "Rôle", perimetre: "Périmètre", relation: "Relation", finalite: "Finalité" } as const;

export function DecisionAccesCarte({ decision, className }: { decision: DecisionAcces; className?: string }) {
  return (
    <div className={cn("rounded-lg border p-4", decision.autorise ? "border-success/30 bg-success-bg/60" : "border-critical/30 bg-critical-bg/60", className)} role="status">
      <div className="flex items-center gap-2">
        {decision.autorise ? <ShieldCheck size={18} className="text-success" aria-hidden /> : <ShieldX size={18} className="text-critical" aria-hidden />}
        <p className={cn("text-sm font-semibold", decision.autorise ? "text-success" : "text-critical")}>{decision.autorise ? "Accès accordé" : "Accès refusé"}</p>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-ink-muted"><Info size={12} aria-hidden /> Décision journalisée</span>
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {decision.criteres.map((c) => (
          <li key={c.critere} className="flex items-start gap-2 rounded-md bg-surface/80 px-3 py-2 text-[12.5px]">
            <span className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full", c.satisfait ? "bg-success text-white" : "bg-critical text-white")}>
              {c.satisfait ? <Check size={11} aria-hidden /> : <X size={11} aria-hidden />}
            </span>
            <span>
              <span className="font-semibold text-ink">{LIBELLE_CRITERE[c.critere]}</span>
              <span className="block text-ink-2">{c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
