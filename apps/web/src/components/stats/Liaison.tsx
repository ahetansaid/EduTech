"use client";

import { useState } from "react";
import { ChevronDown, Download, ScatterChart } from "lucide-react";
import { Nuage, type Point } from "@/components/charts/Graphiques";
import { Button, Card } from "@/components/ui/primitives";
import type { EleveLigne } from "@/lib/api/etablissement";
import { cn } from "@/lib/cn";
import { exporterStats, type LigneStat } from "@/lib/export";
import { entier, note } from "@/lib/format";
import { correlation, droiteAjustee, moyenne, type Bande } from "@/lib/statistiques";

/**
 * Liaison absentéisme ↔ réussite, calculée sur les apprenants *déjà chargés* pour la direction.
 * Aucun nouvel accès : on croise deux colonnes que l'écran affiche déjà (absences, moyenne).
 *
 * C'est un changement d'angle par rapport aux moyennes et bandes : ici on mesure un *lien*. Le coefficient
 * de Pearson dit à quel point « plus d'absences » va avec « moyenne plus basse ». Il ne dit surtout pas
 * que l'un *cause* l'autre — un absentéisme élevé et une moyenne faible partagent souvent une même cause
 * (décrochage, contexte familial). Le panneau l'affiche explicitement, et ne se lance qu'au grain élève :
 * refaire ce calcul sur des moyennes d'établissement ou de commune serait un sophisme écologique.
 */

const PALIERS_ABSENCE: Bande[] = [
  { libelle: "0 jour", max: 1 },
  { libelle: "1 à 3 jours", max: 4 },
  { libelle: "4 à 7 jours", max: 8 },
  { libelle: "8 à 11 jours", max: 12 },
  { libelle: "12 jours et plus" },
];

const formatR = (r: number) => r.toFixed(2).replace(".", ",");

/** Lecture prudente de |r| : conventions usuelles, jamais un verdict. */
function forceDuLien(r: number | null): string {
  if (r == null) return "non mesurable";
  const a = Math.abs(r);
  const f = a < 0.1 ? "quasi nul" : a < 0.3 ? "faible" : a < 0.5 ? "modéré" : "fort";
  return `${f}${r < -0.05 ? ", négatif" : r > 0.05 ? ", positif" : ""}`;
}

export function StatsLiaison({ eleves }: { eleves: EleveLigne[] }) {
  const [ouvert, setOuvert] = useState(false);

  const notes = eleves.filter((e): e is EleveLigne & { moyenne: number } => e.moyenne != null);
  const xs = notes.map((e) => e.absences);
  const ys = notes.map((e) => e.moyenne);
  const r = correlation(xs, ys);
  const ajustement = droiteAjustee(xs, ys);
  const points: Point[] = notes.map((e) => ({ x: e.absences, y: e.moyenne, label: `${e.nom} ${e.prenoms}`.trim(), accent: e.moyenne < 10 }));

  // Un palier couvre [max du précédent, max du courant[ — la borne basse évite de recompter les élèves déjà placés.
  const parPalier = PALIERS_ABSENCE.map((b, i) => {
    const lo = i === 0 ? 0 : PALIERS_ABSENCE[i - 1]!.max ?? 0;
    const groupe = notes.filter((e) => e.absences >= lo && (b.max == null || e.absences < b.max));
    return { libelle: b.libelle, effectif: groupe.length, moyenne: moyenne(groupe.map((e) => e.moyenne)) };
  });

  // En dessous d'un effectif suffisant, un coefficient n'a rien de stable : on s'abstient plutôt que d'afficher du bruit.
  const exploitable = notes.length >= 8 && r != null;

  function exporter() {
    if (r == null) return;
    const l: LigneStat[] = [
      { section: "Liaison", indicateur: "Coefficient de corrélation r (Pearson)", valeur: formatR(r) },
      { section: "Liaison", indicateur: "Lecture", valeur: forceDuLien(r) },
      { section: "Liaison", indicateur: "Élèves notés dans le calcul", valeur: entier(notes.length) },
    ];
    for (const p of parPalier) l.push({ section: "Moyenne par palier d'absence", indicateur: p.libelle, valeur: `${p.moyenne != null ? note(p.moyenne) : "—"} (${entier(p.effectif)} élève(s))` });
    exporterStats("Liaison absences-reussite", l, `Export BEILE du ${new Date().toLocaleDateString("fr-FR")} — corrélation descriptive calculée sur les élèves déjà affichés. Une association, jamais une causalité : à lire avec l'effectif.`);
  }

  return (
    <Card data-guide="eleves-liaison" className="min-w-0 overflow-hidden p-0">
      <button onClick={() => setOuvert((v) => !v)} aria-expanded={ouvert} className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-soft text-accent-ink"><ScatterChart size={16} aria-hidden /></span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-ink">Lien absences ↔ réussite</span>
            <span className="block text-xs text-ink-muted">
              {exploitable ? `Corrélation r = ${formatR(r)} (${forceDuLien(r)}) sur ${entier(notes.length)} élèves notés` : "Effectif insuffisant pour conclure (moins de 8 élèves notés)"}
            </span>
          </span>
        </span>
        <ChevronDown size={18} className={cn("shrink-0 text-ink-muted transition-transform duration-200", ouvert && "rotate-180")} aria-hidden />
      </button>

      {ouvert && (
        <div className="space-y-5 border-t border-line/60 px-5 py-5">
          {exploitable ? (
            <>
              <div className="rounded-lg border border-line/70 bg-surface-2/40 px-4 py-3">
                <p className="text-[13.5px] text-ink-2">
                  Le lien entre absences et moyenne est <span className="font-semibold text-ink">{forceDuLien(r)}</span> (r = <span className="tabular font-semibold text-ink">{formatR(r)}</span>) sur {entier(notes.length)} élèves notés.{" "}
                  {r < -0.3
                    ? "Les élèves les plus absents ont nettement les moyennes les plus basses : l'assiduité est ici un bon signal d'alerte."
                    : r > -0.15
                      ? "Dans cette promotion, les absences ne distinguent pas vraiment les bons des faibles : le décrochage se joue ailleurs qu'en simple présence en classe."
                      : "Les absences tirent les moyennes vers le bas, mais de façon modérée : à recouper avec d'autres signaux."}
                </p>
                <p className="mt-1.5 text-[11.5px] text-ink-muted">
                  Ce chiffre mesure une association, jamais un lien de cause à effet. Une même cause (décrochage, contexte familial) peut produire à la fois les absences et la baisse de moyenne.
                </p>
              </div>

              <Nuage points={points} xLabel="Jours d'absence" yLabel="Moyenne (/20)" ajustement={ajustement} formaterX={entier} formaterY={(v) => note(v)} />

              <section>
                <h3 className="text-[13.5px] font-semibold text-ink">Moyenne par palier d'absence</h3>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {parPalier.map((p) => (
                    <div key={p.libelle} className="rounded-lg border border-line/70 bg-surface-2/50 px-3 py-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{p.libelle}</p>
                      <p className="mt-0.5 text-[16px] font-bold tabular text-ink">{p.moyenne != null ? note(p.moyenne) : "—"}</p>
                      <p className="text-[11px] text-ink-muted">{entier(p.effectif)} élève(s)</p>
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 text-[11.5px] text-ink-muted">La fonte de la moyenne d'un palier à l'autre est la même information que r, lue autrement : elle montre où le décrochage s'aggrave.</p>
              </section>

              <div className="flex justify-end border-t border-line/60 pt-4">
                <Button variante="secondaire" taille="sm" icone={Download} onClick={exporter}>Exporter (CSV)</Button>
              </div>
            </>
          ) : (
            <p className="text-[13.5px] text-ink-muted">
              {entier(notes.length)} élève(s) noté(s) sur {entier(eleves.length)} : effectif trop faible pour estimer une liaison sans la rendre instable. Le panneau devient parlant au-delà de 8 élèves notés.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
