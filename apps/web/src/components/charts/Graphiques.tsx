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

/** `pointille` : série estimée (projection) ; `discret` : repère secondaire (fourchette), sans point ni étiquette. */
export interface Serie { nom: string; points: { x: string; y: number | null }[]; pointille?: boolean; discret?: boolean }

export function Courbes({ series, formater = (v) => String(v), hauteur = 240, min: minForce, className }: { series: Serie[]; formater?: (v: number) => string; hauteur?: number; min?: number; className?: string }) {
  const [survol, setSurvol] = useState<number | null>(null);
  const [tableau, setTableau] = useState(false);
  // Abscisses : union ordonnée des séries (une projection prolonge l'axe au-delà des années observées).
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))];
  const yDe = (s: Serie, i: number) => s.points.find((p) => p.x === xs[i])?.y ?? null;
  const couleurDe = (s: Serie, i: number) => (s.discret ? SERIES[Math.max(0, series.findIndex((t) => t.pointille && !t.discret))] ?? SERIES[i] : SERIES[i]);
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
        {series.length > 1 && series.filter((s) => !s.discret).map((s) => (
          <span key={s.nom} className="inline-flex items-center gap-1.5 text-[12px] text-ink-2">
            {s.pointille ? <span className="w-3 border-t-2 border-dashed" style={{ borderColor: SERIES[series.indexOf(s)] }} aria-hidden /> : <span className="h-2 w-2 rounded-full" style={{ background: SERIES[series.indexOf(s)] }} aria-hidden />} {s.nom}
          </span>
        ))}
        <button onClick={() => setTableau((t) => !t)} className="ml-auto inline-flex items-center gap-1 text-[12px] font-medium text-blue hover:underline">
          <Table2 size={13} aria-hidden /> {tableau ? "Graphique" : "Tableau"}
        </button>
      </div>
      {tableau ? (
        <TableauDonnees colonnes={["Période", ...series.map((s) => s.nom)]} lignes={xs.map((xv, i) => [xv, ...series.map((s) => { const v = yDe(s, i); return v != null ? formater(v) : "—"; })])} />
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
            const valeurs = xs.map((_, k) => yDe(s, k));
            const pts = valeurs.map((v, k) => (v != null ? `${x(k)},${y(v)}` : null)).filter(Boolean).join(" ");
            const k = valeurs.findLastIndex((v) => v != null);
            const dernier = k >= 0 ? valeurs[k]! : null;
            const couleur = couleurDe(s, i);
            return (
              <g key={s.nom}>
                <motion.polyline key={pts} points={pts} fill="none" stroke={couleur} strokeWidth={s.discret ? 1.25 : 2} strokeOpacity={s.discret ? 0.55 : 1} strokeDasharray={s.pointille ? "6 5" : undefined} strokeLinejoin="round" strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0.4 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 1.1, ease: EASE, delay: i * 0.12 }} />
                {!s.discret && valeurs.map((v, j) => v != null && (
                  <motion.circle key={j} cx={x(j)} cy={y(v)} fill={s.pointille ? "var(--surface)" : couleur} stroke={s.pointille ? couleur : "var(--surface)"} strokeWidth={2}
                    initial={{ r: 0 }} animate={{ r: survol === j ? 5.5 : 3.5 }} transition={{ type: "spring", stiffness: 500, damping: 26, delay: survol === null ? 0.25 + j * 0.08 + i * 0.12 : 0 }} />
                ))}
                {dernier != null && !s.discret && <motion.text initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.9 + i * 0.12 }} x={x(k) + 10} y={y(dernier) + 4} className="fill-[var(--text)] text-[12px] font-semibold tabular">{formater(dernier)}</motion.text>}
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
          {series.map((s, i) => { const v = yDe(s, survol); return v == null ? null : (
            <p key={s.nom} className="flex items-center gap-1.5 tabular text-ink-2">
              <span className="h-2 w-2 rounded-full" style={{ background: couleurDe(s, i) }} /> {s.nom} : <span className="font-semibold text-ink">{formater(v)}</span>
            </p>
          ); })}
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

/* ------------------------------------------------------------------ Nuage de points */

export interface Point { x: number; y: number; label?: string; accent?: boolean }

/**
 * Nuage de points (dispersion x → y) avec droite d'ajustement optionnelle. Comme les autres graphiques :
 * un seul jeu de données par couleur, traits fins, survol, vue tableau. Sert à rendre visible une liaison
 * (ex. absences × moyenne) plutôt qu'un simple coefficient.
 */
export function Nuage({ points, xLabel, yLabel, ajustement, formaterX = (v) => String(v), formaterY = (v) => String(v), couleur = SERIES[0], hauteur = 300, className }: {
  points: Point[]; xLabel: string; yLabel: string; ajustement?: { pente: number; ordonnee: number } | null;
  formaterX?: (v: number) => string; formaterY?: (v: number) => string; couleur?: string; hauteur?: number; className?: string;
}) {
  const [survol, setSurvol] = useState<number | null>(null);
  const [tableau, setTableau] = useState(false);
  if (!points.length) return null;

  const W = 640, H = hauteur, g = 52, d = 24, h = 16, b = 44;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  let xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
  if (xmin === xmax) { xmin -= 0.5; xmax += 0.5; }
  if (ymin === ymax) { ymin -= 0.5; ymax += 0.5; }
  const padY = (ymax - ymin) * 0.08; ymin -= padY; ymax += padY;
  const X = (v: number) => g + ((v - xmin) / (xmax - xmin || 1)) * (W - g - d);
  const Y = (v: number) => h + (1 - (v - ymin) / (ymax - ymin || 1)) * (H - h - b);
  const gx = [0, 0.25, 0.5, 0.75, 1].map((t) => xmin + t * (xmax - xmin));
  const gy = [0, 0.25, 0.5, 0.75, 1].map((t) => ymin + t * (ymax - ymin));

  return (
    <div className={cn("relative", className)}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[12px] text-ink-muted"><span className="font-medium text-ink-2">{yLabel}</span> en fonction de <span className="font-medium text-ink-2">{xLabel}</span></span>
        <button onClick={() => setTableau((t) => !t)} className="inline-flex items-center gap-1 text-[12px] font-medium text-blue hover:underline">
          <Table2 size={13} aria-hidden /> {tableau ? "Graphique" : "Tableau"}
        </button>
      </div>
      {tableau ? (
        <TableauDonnees colonnes={[xLabel, yLabel]} lignes={points.map((p) => [formaterX(p.x), formaterY(p.y)])} />
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label={`Nuage de ${points.length} points : ${yLabel} en fonction de ${xLabel}`} onMouseLeave={() => setSurvol(null)}>
          {gy.map((v, i) => (
            <g key={`y${i}`}>
              <line x1={g} x2={W - d} y1={Y(v)} y2={Y(v)} stroke="var(--grid)" strokeWidth={1} />
              <text x={g - 8} y={Y(v) + 4} textAnchor="end" className="fill-[var(--text-muted)] text-[11px] tabular">{formaterY(v)}</text>
            </g>
          ))}
          {gx.map((v, i) => (
            <text key={`x${i}`} x={X(v)} y={H - b + 16} textAnchor="middle" className="fill-[var(--text-muted)] text-[11px] tabular">{formaterX(v)}</text>
          ))}
          <line x1={g} x2={W - d} y1={H - b} y2={H - b} stroke="var(--border)" strokeWidth={1} />
          <line x1={g} x2={g} y1={h} y2={H - b} stroke="var(--border)" strokeWidth={1} />
          {ajustement && (
            <line x1={X(xmin)} y1={Y(ajustement.ordonnee + ajustement.pente * xmin)} x2={X(xmax)} y2={Y(ajustement.ordonnee + ajustement.pente * xmax)}
              stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="5 4" opacity={0.7} />
          )}
          {points.map((p, i) => (
            <motion.circle key={i} cx={X(p.x)} cy={Y(p.y)} fill={p.accent ? "var(--critical)" : couleur} stroke="var(--surface)" strokeWidth={1}
              initial={{ r: 0, opacity: 0 }} animate={{ r: survol === i ? 6 : 4, opacity: survol == null || survol === i ? 0.9 : 0.35 }}
              transition={{ type: "spring", stiffness: 500, damping: 26, delay: survol == null ? Math.min(i, 30) * 0.012 : 0 }}
              onMouseEnter={() => setSurvol(i)} />
          ))}
        </svg>
      )}
      {!tableau && survol != null && points[survol] && (
        <div className="pointer-events-none absolute top-2 z-10 rounded-md border border-line/70 bg-surface px-3 py-1.5 text-[12px] shadow-pop" style={{ left: `calc(${(X(points[survol]!.x) / W) * 100}% + ${X(points[survol]!.x) > W * 0.6 ? -140 : 12}px)` }}>
          {points[survol]!.label && <p className="font-semibold text-ink">{points[survol]!.label}</p>}
          <p className="tabular text-ink-2">{xLabel} : <span className="font-semibold text-ink">{formaterX(points[survol]!.x)}</span></p>
          <p className="tabular text-ink-2">{yLabel} : <span className="font-semibold text-ink">{formaterY(points[survol]!.y)}</span></p>
        </div>
      )}
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

/* ------------------------------------------------------------------ Haltères (écart entre deux groupes) */

/**
 * Deux groupes par ligne (filles/garçons, urbain/rural, public/privé), reliés par leur écart : l'œil lit
 * d'abord la longueur du trait, c'est-à-dire l'inégalité, puis sa position.
 */
export function Halteres({ lignes, libelleA, libelleB, formater = (v) => String(v), className }: {
  lignes: { cle: string; libelle: string; a: number | null; b: number | null }[]; libelleA: string; libelleB: string; formater?: (v: number) => string; className?: string;
}) {
  const [tableau, setTableau] = useState(false);
  const toutes = lignes.flatMap((l) => [l.a, l.b]).filter((v): v is number => v != null);
  if (!toutes.length) return null;
  const vmin = Math.min(...toutes), vmax = Math.max(...toutes), marge = (vmax - vmin) * 0.08 || 1;
  const pos = (v: number) => ((v - (vmin - marge)) / (vmax - vmin + 2 * marge)) * 100;
  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES[0] }} aria-hidden /> {libelleA}</span>
        <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES[1] }} aria-hidden /> {libelleB}</span>
        <button onClick={() => setTableau((t) => !t)} className="ml-auto inline-flex items-center gap-1 text-[12px] font-medium text-blue hover:underline">
          <Table2 size={13} aria-hidden /> {tableau ? "Graphique" : "Tableau"}
        </button>
      </div>
      {tableau ? (
        <TableauDonnees colonnes={["Territoire", libelleA, libelleB]} lignes={lignes.map((l) => [l.libelle, l.a != null ? formater(l.a) : "—", l.b != null ? formater(l.b) : "—"])} />
      ) : (
        <ul className="space-y-2">
          {lignes.map((l, i) => (
            <li key={l.cle} className="grid grid-cols-[minmax(6rem,9rem)_1fr] items-center gap-3" title={`${l.libelle} — ${libelleA} : ${l.a != null ? formater(l.a) : "—"} · ${libelleB} : ${l.b != null ? formater(l.b) : "—"}`}>
              <span className="truncate text-[13px] text-ink-2">{l.libelle}</span>
              <span className="relative h-5">
                <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--grid)]" aria-hidden />
                {l.a != null && l.b != null && (
                  <motion.span className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-ink/25" style={{ left: `${Math.min(pos(l.a), pos(l.b))}%` }}
                    initial={{ width: 0 }} animate={{ width: `${Math.abs(pos(l.a) - pos(l.b))}%` }} transition={{ duration: 0.7, ease: EASE, delay: Math.min(i, 15) * 0.04 }} />
                )}
                {([[l.a, SERIES[0]], [l.b, SERIES[1]]] as const).map(([v, c], k) => v != null && (
                  <motion.span key={k} className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--surface)]" style={{ left: `${pos(v)}%`, background: c }}
                    initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 22, delay: 0.2 + Math.min(i, 15) * 0.04 }} />
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
