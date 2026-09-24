"use client";

import { Table2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { EASE, motion } from "@/components/motion";
import { cn } from "@/lib/cn";

/**
 * Graphiques BEILE — règles de la charte §3 : couleurs catégorielles dans un ordre fixe,
 * un seul axe, traits fins, étiquettes directes, infobulle au survol, vue tableau disponible.
 */

export const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];

/* ------------------------------------------------------------------ Courbe temporelle */

export interface Serie { nom: string; points: { x: string; y: number | null }[] }

export function Courbes({ series, formater = (v) => String(v), hauteur = 240, min: minForce, className }: { series: Serie[]; formater?: (v: number) => string; hauteur?: number; min?: number; className?: string }) {
  const [survol, setSurvol] = useState<number | null>(null);
  const [tableau, setTableau] = useState(false);
  const xs = series[0]?.points.map((p) => p.x) ?? [];
  const toutes = series.flatMap((s) => s.points.map((p) => p.y)).filter((v): v is number => v != null);
  if (!xs.length || !toutes.length) return null;
  const vmin = minForce ?? Math.min(...toutes) * 0.9, vmax = Math.max(...toutes) * 1.06;
  const W = 640, H = hauteur, g = 44, d = 72, h = 14, b = 28;
  const x = (i: number) => g + (i * (W - g - d)) / Math.max(1, xs.length - 1);
  const y = (v: number) => h + (1 - (v - vmin) / (vmax - vmin || 1)) * (H - h - b);
  const graduations = [0, 0.25, 0.5, 0.75, 1].map((t) => vmin + t * (vmax - vmin));

  return (
    <div className={cn("relative", className)}>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {series.length > 1 && series.map((s, i) => (
          <span key={s.nom} className="inline-flex items-center gap-1.5 text-[12px] text-ink-2">
            <span className="h-2 w-2 rounded-full" style={{ background: SERIES[i] }} aria-hidden /> {s.nom}
          </span>
        ))}
        <button onClick={() => setTableau((t) => !t)} className="ml-auto inline-flex items-center gap-1 text-[12px] font-medium text-blue hover:underline">
          <Table2 size={13} aria-hidden /> {tableau ? "Graphique" : "Tableau"}
        </button>
      </div>
      {tableau ? (
        <TableauDonnees colonnes={["Période", ...series.map((s) => s.nom)]} lignes={xs.map((xv, i) => [xv, ...series.map((s) => (s.points[i]?.y != null ? formater(s.points[i]!.y!) : "—"))])} />
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label={`Évolution : ${series.map((s) => s.nom).join(", ")}`} onMouseLeave={() => setSurvol(null)}>
          {graduations.map((v) => (
            <g key={v}>
              <line x1={g} x2={W - d} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeWidth={1} />
              <text x={g - 8} y={y(v) + 4} textAnchor="end" className="fill-[var(--text-muted)] text-[11px] tabular">{formater(v)}</text>
            </g>
          ))}
          {xs.map((xv, i) => (
            <text key={xv} x={x(i)} y={H - 8} textAnchor="middle" className="fill-[var(--text-muted)] text-[11px]">{xv}</text>
          ))}
          {survol != null && <line x1={x(survol)} x2={x(survol)} y1={h} y2={H - b} stroke="var(--text-muted)" strokeDasharray="3 3" />}
          {series.map((s, i) => {
            const pts = s.points.map((p, k) => (p.y != null ? `${x(k)},${y(p.y)}` : null)).filter(Boolean).join(" ");
            const dernier = [...s.points].reverse().find((p) => p.y != null);
            const k = s.points.lastIndexOf(dernier!);
            return (
              <g key={s.nom}>
                <motion.polyline key={pts} points={pts} fill="none" stroke={SERIES[i]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0.4 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 1.1, ease: EASE, delay: i * 0.12 }} />
                {s.points.map((p, j) => p.y != null && (
                  <motion.circle key={j} cx={x(j)} cy={y(p.y)} fill={SERIES[i]} stroke="var(--surface)" strokeWidth={2}
                    initial={{ r: 0 }} animate={{ r: survol === j ? 5.5 : 3.5 }} transition={{ type: "spring", stiffness: 500, damping: 26, delay: survol === null ? 0.25 + j * 0.08 + i * 0.12 : 0 }} />
                ))}
                {dernier?.y != null && <motion.text initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.9 + i * 0.12 }} x={x(k) + 10} y={y(dernier.y) + 4} className="fill-[var(--text)] text-[12px] font-semibold tabular">{formater(dernier.y)}</motion.text>}
              </g>
            );
          })}
          {xs.map((_, i) => (
            <rect key={i} x={x(i) - (W - g - d) / Math.max(1, xs.length - 1) / 2} y={0} width={(W - g - d) / Math.max(1, xs.length - 1)} height={H} fill="transparent" onMouseEnter={() => setSurvol(i)} />
          ))}
        </svg>
      )}
      {!tableau && survol != null && (
        <div className="pointer-events-none absolute top-8 z-10 rounded-md border border-line/70 bg-surface px-3 py-2 text-[12px] shadow-pop" style={{ left: `calc(${(x(survol) / W) * 100}% + ${survol > xs.length / 2 ? -150 : 12}px)` }}>
          <p className="font-semibold text-ink">{xs[survol]}</p>
          {series.map((s, i) => (
            <p key={s.nom} className="flex items-center gap-1.5 tabular text-ink-2">
              <span className="h-2 w-2 rounded-full" style={{ background: SERIES[i] }} /> {s.nom} : <span className="font-semibold text-ink">{s.points[survol]?.y != null ? formater(s.points[survol]!.y!) : "—"}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Barres horizontales classées */

export interface Barre { cle: string; libelle: string; valeur: number | null; masquee?: boolean; effectif?: number; accent?: boolean }

export function BarresClassees({ barres, formater = (v) => String(v), max: maxForce, onSelect, reference, couleur = SERIES[0], limite, className }: {
  barres: Barre[]; formater?: (v: number) => string; max?: number; onSelect?: (cle: string) => void; reference?: { valeur: number; libelle: string };
  couleur?: string; limite?: number; className?: string;
}) {
  const [tout, setTout] = useState(false);
  const [tableau, setTableau] = useState(false);
  const max = maxForce ?? Math.max(...barres.map((b) => b.valeur ?? 0), reference?.valeur ?? 0) * 1.05;
  const visibles = limite && !tout ? barres.slice(0, limite) : barres;
  return (
    <div className={className}>
      <div className="mb-2 flex justify-end">
        <button onClick={() => setTableau((t) => !t)} className="inline-flex items-center gap-1 text-[12px] font-medium text-blue hover:underline">
          <Table2 size={13} aria-hidden /> {tableau ? "Graphique" : "Tableau"}
        </button>
      </div>
      {tableau ? (
        <TableauDonnees colonnes={["Libellé", "Valeur", "Effectif"]} lignes={barres.map((b) => [b.libelle, b.masquee ? "masqué" : b.valeur != null ? formater(b.valeur) : "—", b.effectif != null ? b.effectif.toLocaleString("fr-FR") : "—"])} />
      ) : (
        <ul className="space-y-1.5">
          {visibles.map((b, i) => (
            <li key={b.cle} className="animate-row" style={{ animationDelay: `${Math.min(i, 20) * 25}ms` }}>
              <button
                disabled={!onSelect}
                onClick={() => onSelect?.(b.cle)}
                className={cn("group grid w-full grid-cols-[minmax(7rem,11rem)_1fr_4.5rem] items-center gap-3 rounded-md px-1.5 py-1 text-left", onSelect && "hover:bg-surface-2")}
                title={b.effectif != null ? `Effectif concerné : ${b.effectif.toLocaleString("fr-FR")}` : undefined}
              >
                <span className={cn("truncate text-[13px]", b.accent ? "font-semibold text-ink" : "text-ink-2")}>{b.libelle}</span>
                <span className="relative h-2.5 rounded-full bg-surface-2">
                  {b.masquee ? (
                    <span className="absolute inset-0 rounded-full bg-[repeating-linear-gradient(45deg,var(--border)_0_3px,transparent_3px_6px)]" />
                  ) : (
                    <motion.span className="absolute inset-y-0 left-0 rounded-full" style={{ background: couleur, opacity: b.accent ? 1 : 0.85 }}
                      initial={{ width: "0%" }} animate={{ width: `${Math.max(1.5, ((b.valeur ?? 0) / (max || 1)) * 100)}%` }} transition={{ duration: 0.8, ease: EASE, delay: Math.min(i, 20) * 0.035 }} />
                  )}
                  {reference && <span className="absolute -top-1 bottom-[-4px] w-px bg-ink" style={{ left: `${(reference.valeur / (max || 1)) * 100}%` }} title={reference.libelle} />}
                </span>
                <span className="text-right text-[13px] font-semibold tabular text-ink">{b.masquee ? <span className="text-[11px] font-medium text-ink-muted">masqué</span> : b.valeur != null ? formater(b.valeur) : "—"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!tableau && limite && barres.length > limite && (
        <button onClick={() => setTout((t) => !t)} className="mt-2 text-[12.5px] font-medium text-blue hover:underline">{tout ? "Réduire" : `Afficher les ${barres.length} lignes`}</button>
      )}
      {reference && !tableau && <p className="mt-2 flex items-center gap-2 text-[11.5px] text-ink-muted"><span className="inline-block h-3 w-px bg-ink" aria-hidden /> {reference.libelle} : {formater(reference.valeur)}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ Tableau de données */

export function TableauDonnees({ colonnes, lignes, className }: { colonnes: string[]; lignes: ReactNode[][]; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-md border border-line/70", className)}>
      <table className="w-full text-[13px]">
        <thead className="bg-surface-2 text-left text-[11.5px] uppercase tracking-wide text-ink-muted">
          <tr>{colonnes.map((c) => <th key={c} className="px-3 py-2 font-semibold">{c}</th>)}</tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => (
            <tr key={i} className="border-t border-line/60">
              {l.map((c, j) => <td key={j} className={cn("px-3 py-2", j > 0 && "tabular")}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
