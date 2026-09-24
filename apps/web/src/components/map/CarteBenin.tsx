"use client";

import { geoMercator, geoPath } from "d3-geo";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { useSombre } from "@/lib/useSombre";
import { COMMUNES_GEO, DEPARTEMENTS_GEO } from "@beile/simulation/territoire";

/**
 * Carte du Bénin en SVG (projection de Mercator, limites geoBoundaries).
 * Aucune tuile tierce : rendu instantané, hors connexion, conforme à la CSP stricte.
 */

export const RAMPE_CLAIRE = ["#e9f3ff", "#b7d3f6", "#86b6ef", "#4d97e9", "#1567c4", "#0a3764"];
export const RAMPE_SOMBRE = ["#15314f", "#1b4a7c", "#1f66ad", "#3a8be6", "#74aef0", "#c3dcfa"];
export const COULEUR_ALERTE = { favorable: "var(--alert-favorable)", surveillance: "var(--alert-surveillance)", attention: "var(--alert-attention)", critique: "var(--alert-critique)" } as const;

export interface PointCarte { id: string; lng: number; lat: number; libelle: string; mis?: boolean }

export function CarteBenin({
  valeurs, couleurs, niveau = "communes", selection, onSelect, formater = (v) => String(v), libelleValeur, points, focusDepartement, hauteur = 560, className, legende,
}: {
  valeurs?: Map<string, number | null>;
  /** Couleur explicite par zone (niveaux d'alerte) ; sinon rampe séquentielle sur `valeurs`. */
  couleurs?: Map<string, string>;
  niveau?: "communes" | "departements";
  selection?: string | null;
  onSelect?: (id: string) => void;
  formater?: (v: number) => string;
  libelleValeur?: string;
  points?: PointCarte[];
  focusDepartement?: string;
  hauteur?: number;
  className?: string;
  legende?: React.ReactNode;
}) {
  const [survol, setSurvol] = useState<{ id: string; x: number; y: number } | null>(null);
  const sombre = useSombre();
  const features = niveau === "communes"
    ? COMMUNES_GEO.features.filter((f) => !focusDepartement || f.properties.departementId === focusDepartement)
    : DEPARTEMENTS_GEO.features;

  // Recadrage sur la zone affichée : la hauteur suit les proportions réelles du territoire (pas de vide).
  const { chemin, projection, largeur, hauteurReelle } = useMemo(() => {
    const collection = { type: "FeatureCollection" as const, features: features as GeoJSON.Feature[] };
    const unite = geoMercator().fitWidth(1000, collection);
    const [[x0, y0], [x1, y1]] = geoPath(unite).bounds(collection);
    const ratio = (x1 - x0) / Math.max(1, y1 - y0);
    const larg = Math.round(Math.min(hauteur * ratio, hauteur * 1.4));
    const haut = Math.round(larg / ratio);
    const proj = geoMercator().fitExtent([[12, 12], [larg - 12, haut - 12]], collection);
    return { chemin: geoPath(proj), projection: proj, largeur: larg, hauteurReelle: haut };
  }, [features, hauteur]);

  const seuils = useMemo(() => {
    if (!valeurs) return [];
    const v = [...valeurs.values()].filter((x): x is number => x != null).sort((a, b) => a - b);
    if (!v.length) return [];
    return [1, 2, 3, 4, 5].map((k) => v[Math.min(v.length - 1, Math.floor((k / 6) * v.length))]!);
  }, [valeurs]);

  const couleurPour = (id: string, sombre: boolean) => {
    if (couleurs) return couleurs.get(id) ?? "var(--surface-2)";
    const v = valeurs?.get(id);
    if (v == null) return "url(#hachures)";
    const rampe = sombre ? RAMPE_SOMBRE : RAMPE_CLAIRE;
    const k = seuils.filter((s) => v >= s).length;
    return rampe[k]!;
  };

  const nomDe = (id: string) => features.find((f) => f.properties.id === id)?.properties.nom ?? id;

  return (
    <div className={cn("relative", className)}>
      <svg viewBox={`0 0 ${largeur} ${hauteurReelle}`} className="h-auto w-full" role="img" aria-label={`Carte du Bénin par ${niveau === "communes" ? "commune" : "département"}${libelleValeur ? ` : ${libelleValeur}` : ""}`}>
        <defs>
          <pattern id="hachures" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--surface-2)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--border)" strokeWidth="2" />
          </pattern>
        </defs>
        <g className="[&>path]:transition-[fill,opacity] [&>path]:duration-300">
          {features.map((f) => {
            const id = f.properties.id;
            const actif = selection === id;
            return (
              <path
                key={id}
                d={chemin(f as GeoJSON.Feature) ?? undefined}
                className="cursor-pointer outline-none"
                style={{ fill: couleurPour(id, sombre) }}
                stroke="var(--surface)"
                strokeWidth={actif ? 2.4 : 0.9}
                opacity={selection && !actif ? 0.55 : 1}
                tabIndex={onSelect ? 0 : -1}
                role={onSelect ? "button" : undefined}
                aria-label={`${nomDe(id)}${valeurs?.get(id) != null ? ` : ${formater(valeurs.get(id)!)}` : ""}`}
                onMouseMove={(e) => {
                  const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setSurvol({ id, x: e.clientX - r.left, y: e.clientY - r.top });
                }}
                onMouseLeave={() => setSurvol(null)}
                onClick={() => onSelect?.(id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(id); } }}
              />
            );
          })}
        </g>
        {niveau === "communes" && !focusDepartement && (
          <g pointerEvents="none">
            {DEPARTEMENTS_GEO.features.map((f) => (
              <path key={f.properties.id} d={chemin(f as GeoJSON.Feature) ?? undefined} fill="none" stroke="var(--text)" strokeOpacity={0.35} strokeWidth={1.1} />
            ))}
          </g>
        )}
        {points?.map((p) => {
          const xy = projection([p.lng, p.lat]);
          if (!xy) return null;
          return <circle key={p.id} cx={xy[0]} cy={xy[1]} r={p.mis ? 5.5 : 2.2} fill={p.mis ? "var(--amber)" : "var(--text)"} fillOpacity={p.mis ? 1 : 0.35} stroke="var(--surface)" strokeWidth={p.mis ? 2 : 0} pointerEvents="none" />;
        })}
      </svg>
      {survol && (
        <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[115%] rounded-md border border-line/70 bg-surface px-3 py-2 text-[12.5px] shadow-pop" style={{ left: survol.x, top: survol.y }}>
          <p className="font-semibold text-ink">{nomDe(survol.id)}</p>
          {valeurs && <p className="tabular text-ink-2">{libelleValeur ? `${libelleValeur} : ` : ""}{valeurs.get(survol.id) != null ? formater(valeurs.get(survol.id)!) : "donnée masquée ou absente"}</p>}
        </div>
      )}
      {legende}
    </div>
  );
}

export function LegendeSequentielle({ min, max, libelle, formater = (v) => String(v) }: { min: number; max: number; libelle: string; formater?: (v: number) => string }) {
  return (
    <div className="mt-2 text-[11.5px] text-ink-muted">
      <p className="mb-1 font-medium text-ink-2">{libelle}</p>
      <div className="flex h-2 overflow-hidden rounded-full">
        {RAMPE_CLAIRE.map((c) => <span key={c} className="flex-1 dark:hidden" style={{ background: c }} />)}
        {RAMPE_SOMBRE.map((c) => <span key={c} className="hidden flex-1 dark:block" style={{ background: c }} />)}
      </div>
      <div className="mt-1 flex justify-between tabular"><span>{formater(min)}</span><span>{formater(max)}</span></div>
    </div>
  );
}
