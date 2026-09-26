"use client";

import { BadgeCheck, ChevronDown, Download, ShieldQuestion } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { BarresClassees, SERIES, TableauDonnees, type Barre } from "@/components/charts/Graphiques";
import { BadgeConfiance } from "@/components/ui/donnees";
import { Button, Card } from "@/components/ui/primitives";
import type { SynthesePilotage } from "@/lib/api/pilotage";
import { cn } from "@/lib/cn";
import { exporterStats, type LigneStat } from "@/lib/export";
import { compact, entier, nombre, pourcent } from "@/lib/format";
import { ecartType, mediane, moyenne, quantile, repartir, type Bande } from "@/lib/statistiques";

/**
 * Lecture statistique du cockpit national, calculée sur la synthèse *déjà chargée* par le rôle — aucun
 * nouvel appel, aucun accès ajouté. Deux angles qu'un chiffre unique ne dit pas :
 *
 * 1. Fiabilité : chaque tuile porte son indice de confiance et sa couverture ; les réunir révèle le
 *    chiffre le plus fragile, celui qu'il ne faut pas citer seul.
 * 2. Dispersion territoriale : le classement « Maths ≥ 15/20 » est coloré sur la carte, mais une carte
 *    ne dit pas l'étendue. On calcule médiane, écart-type et quartiles — sur les seules communes NON
 *    masquées : le seuil de confidentialité est respecté dans la statistique, pas seulement à l'affichage.
 *
 * Grain national = commune / département : aucun individu derrière ces valeurs.
 */

const BANDES_MATHS: Bande[] = [
  { libelle: "moins de 20 %", max: 20 },
  { libelle: "20 à 39 %", max: 40 },
  { libelle: "40 à 59 %", max: 60 },
  { libelle: "60 à 79 %", max: 80 },
  { libelle: "80 % et plus" },
];

type CleIndicateur = "effectif" | "ratio" | "bepc" | "maths" | "abandon";
const INDICATEURS: { cle: CleIndicateur; libelle: string; format: (v: number | null) => string }[] = [
  { cle: "effectif", libelle: "Apprenants", format: (v) => (v == null ? "—" : compact(v)) },
  { cle: "ratio", libelle: "Élèves / enseignant", format: (v) => nombre(v, 1) },
  { cle: "bepc", libelle: "Réussite au BEPC", format: (v) => pourcent(v, 1) },
  { cle: "maths", libelle: "Maths ≥ 15/20", format: (v) => pourcent(v, 1) },
  { cle: "abandon", libelle: "Abandon", format: (v) => pourcent(v, 1) },
];

export function StatsNational({ s }: { s: SynthesePilotage }) {
  const [ouvert, setOuvert] = useState(false);

  const lignes = INDICATEURS.map((i) => {
    const r = s[i.cle];
    return { ...i, valeur: r.valeur, confiance: r.confiance, couverture: r.couverture };
  });
  const moinsFiable = lignes.reduce((a, b) => (b.confiance.score < a.confiance.score ? b : a));
  const tauxTransmission = (s.etablissements.transmis / Math.max(1, s.etablissements.total)) * 100;

  const d = useMemo(() => {
    const lignes = s.mathsTerritoire.lignes;
    const masquées = lignes.filter((l) => l.masquee).length;
    const valeurs = lignes.filter((l) => !l.masquee && l.valeur != null).map((l) => l.valeur!);
    const tri = [...valeurs].sort((a, b) => a - b);
    const nat = s.maths.valeur;
    return {
      n: valeurs.length, masquées,
      moy: moyenne(valeurs), med: mediane(valeurs), ecart: ecartType(valeurs),
      min: tri[0] ?? null, q1: quantile(tri, 0.25), q3: quantile(tri, 0.75), max: tri.at(-1) ?? null,
      auDessus: nat == null ? null : valeurs.filter((v) => v > nat).length,
      bandes: bandes(BANDES_MATHS, repartir(valeurs, BANDES_MATHS)),
    };
  }, [s.mathsTerritoire, s.maths]);

  // On n'ajoute aucune donnée : le fichier reprend la synthèse chargée et, pour la dispersion, uniquement
  // les zones NON masquées. Une commune masquée (effectif sous le seuil) ne figure ni dans les stats ni dans le CSV.
  function exporter() {
    const l: LigneStat[] = [];
    for (const l2 of lignes) {
      l.push({
        section: "Fiabilité",
        indicateur: l2.libelle + (l2.cle === moinsFiable.cle ? " (le plus fragile)" : ""),
        valeur: `${l2.format(l2.valeur)} — confiance ${entier(l2.confiance.score)} %, couverture ${entier(l2.couverture.etablissementsAyantTransmis)}/${entier(l2.couverture.etablissementsAttendus)}`,
      });
    }
    l.push({ section: "Transmission", indicateur: "Établissements ayant transmis", valeur: `${entier(s.etablissements.transmis)} / ${entier(s.etablissements.total)} (${pourcent(tauxTransmission, 0)})` });
    l.push(
      { section: "Dispersion territoriale (Maths ≥ 15/20)", indicateur: "Zones affichables", valeur: entier(d.n) },
      { section: "Dispersion territoriale (Maths ≥ 15/20)", indicateur: "Communes masquées (exclues du calcul)", valeur: entier(d.masquées) },
      { section: "Dispersion territoriale (Maths ≥ 15/20)", indicateur: "Médiane", valeur: pourcent(d.med, 0) },
      { section: "Dispersion territoriale (Maths ≥ 15/20)", indicateur: "Moyenne", valeur: pourcent(d.moy, 0) },
      { section: "Dispersion territoriale (Maths ≥ 15/20)", indicateur: "Écart-type", valeur: `${nombre(d.ecart, 0)} pt` },
      { section: "Dispersion territoriale (Maths ≥ 15/20)", indicateur: "Étendue", valeur: `${pourcent(d.min, 0)} – ${pourcent(d.max, 0)}` },
      { section: "Dispersion territoriale (Maths ≥ 15/20)", indicateur: "1er quartile", valeur: pourcent(d.q1, 0) },
      { section: "Dispersion territoriale (Maths ≥ 15/20)", indicateur: "3e quartile", valeur: pourcent(d.q3, 0) },
      { section: "Dispersion territoriale (Maths ≥ 15/20)", indicateur: "Communes au-dessus du repère national", valeur: d.auDessus != null ? `${entier(d.auDessus)} / ${entier(d.n)}` : "—" },
    );
    for (const b of d.bandes) l.push({ section: "Bandes de réussite (Maths ≥ 15/20)", indicateur: b.libelle, valeur: entier(b.valeur ?? 0) });
    for (const z of s.mathsTerritoire.lignes.filter((x) => !x.masquee && x.valeur != null).sort((a, b) => b.valeur! - a.valeur!)) {
      l.push({ section: "Zones classées", indicateur: z.libelle, valeur: pourcent(z.valeur, 0) });
    }
    exporterStats(
      "Fiabilité et dispersion nationale",
      l,
      `Export BEILE du ${new Date().toLocaleDateString("fr-FR")} — synthèse nationale de pilotage (grain commune/département, aucun individu). Les ${entier(d.masquées)} commune(s) sous le seuil de confidentialité sont exclues de ce fichier comme du calcul. À citer avec l'indice de confiance qui accompagne chaque chiffre.`,
    );
  }

  return (
    <Card data-guide="cockpit-stats" className="min-w-0 overflow-hidden p-0">
      <button onClick={() => setOuvert((v) => !v)} aria-expanded={ouvert} className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-soft text-accent-ink"><ShieldQuestion size={16} aria-hidden /></span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-ink">Fiabilité et dispersion des chiffres</span>
            <span className="block text-xs text-ink-muted">
              {d.n
                ? `Maths ≥ 15 : médiane ${pourcent(d.med, 0)}, écart-type ${nombre(d.ecart, 0)} pt · ${entier(d.masquées)} commune(s) masquée(s) · repère le plus fragile : ${moinsFiable.libelle} (${moinsFiable.confiance.score} %)`
                : `Confiance la plus basse : ${moinsFiable.libelle} (${moinsFiable.confiance.score} %)`}
            </span>
          </span>
        </span>
        <ChevronDown size={18} className={cn("shrink-0 text-ink-muted transition-transform duration-200", ouvert && "rotate-180")} aria-hidden />
      </button>

      {ouvert && (
        <div className="space-y-6 border-t border-line/60 px-5 py-5">
          <section>
            <SousTitre>Fiable à quel point ?</SousTitre>
            <TableauDonnees
              className="mt-2"
              colonnes={["Indicateur", "Valeur", "Indice de confiance", "Couverture"]}
              lignes={lignes.map((l) => [
                l.libelle,
                l.format(l.valeur),
                <span key="confiance" className="inline-flex items-center gap-1.5"><BadgeConfiance confiance={l.confiance} compact />{l.cle === moinsFiable.cle && <span className="text-[11px] font-semibold text-warning">le plus fragile</span>}</span>,
                `${entier(l.couverture.etablissementsAyantTransmis)} / ${entier(l.couverture.etablissementsAttendus)} (${pourcent((l.couverture.etablissementsAyantTransmis / Math.max(1, l.couverture.etablissementsAttendus)) * 100, 0)})`,
              ])}
            />
            <p className="mt-1.5 text-[12px] text-ink-muted">
              <BadgeCheck size={12} className="mr-1 inline align-[-2px] text-success" aria-hidden />
              {entier(s.etablissements.transmis)} établissements sur {entier(s.etablissements.total)} ({pourcent(tauxTransmission, 0)}) ont transmis cette année ; {entier(s.etablissements.total - s.etablissements.transmis)} restant muets abaissent la couverture de ces chiffres.
            </p>
          </section>

          <section>
            <SousTitre>Dispersion territoriale — Maths ≥ 15/20</SousTitre>
            {d.n === 0 ? (
              <p className="mt-1 text-[13px] text-ink-muted">Aucune zone classée affichable : toutes les valeurs sont masquées (effectifs sous le seuil de confidentialité) ou absentes.</p>
            ) : (
              <>
                <div className="mt-2 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  <Puce libelle="Médiane" valeur={pourcent(d.med, 0)} aide={`moyenne ${pourcent(d.moy, 0)} · écart-type ${nombre(d.ecart, 0)} pt`} />
                  <Puce libelle="Étendue" valeur={`${pourcent(d.min, 0)} – ${pourcent(d.max, 0)}`} aide={`moitié entre ${pourcent(d.q1, 0)} et ${pourcent(d.q3, 0)}`} />
                  <Puce libelle="Communes au-dessus du repère" valeur={d.auDessus != null ? `${entier(d.auDessus)} / ${entier(d.n)}` : "—"} aide={`repère national ${pourcent(s.maths.valeur, 0)}`} accent={d.auDessus != null && d.auDessus * 2 < d.n} />
                  <Puce libelle="Masquées" valeur={entier(d.masquées)} aide="effectif sous le seuil de confidentialité" />
                </div>
                <div className="mt-4">
                  <BarresClassees barres={d.bandes} formater={entier} couleur={SERIES[3]} />
                  <p className="mt-1.5 text-[12px] text-ink-muted">
                    Réparties sur {entier(d.n)} zone(s) affichable(s). Les {entier(d.masquées)} commune(s) masquée(s) sont exclues du calcul, pas seulement de l'affichage : un chiffre qui permettrait d'identifier des élèves ne contribue à aucune statistique.
                  </p>
                </div>
              </>
            )}
          </section>

          <div className="flex items-center justify-between gap-3 border-t border-line/60 pt-4">
            <p className="min-w-0 text-[11.5px] text-ink-muted">
              Deux lectures d'une même synthèse, sans donnée nouvelle : la fiabilité rappelle ce qu'on peut citer, la dispersion rappelle qu'une moyenne nationale cache des situations opposées. Croisez-les avant tout arbitrage.
            </p>
            <Button variante="secondaire" taille="sm" icone={Download} onClick={exporter} className="shrink-0">
              Exporter (CSV)
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function bandes(bandes: Bande[], effectifs: number[]): Barre[] {
  return bandes.map((b, i) => ({ cle: b.libelle, libelle: b.libelle, valeur: effectifs[i] ?? 0 }));
}

function Puce({ libelle, valeur, aide, accent }: { libelle: string; valeur: string; aide?: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-lg border px-3.5 py-2.5", accent ? "border-critical/30 bg-critical-bg/50" : "border-line/70 bg-surface-2/50")}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{libelle}</p>
      <p className={cn("mt-0.5 text-[18px] font-bold tabular", accent ? "text-critical" : "text-ink")}>{valeur}</p>
      {aide && <p className="text-[11px] text-ink-muted">{aide}</p>}
    </div>
  );
}

function SousTitre({ children }: { children: ReactNode }) {
  return <h3 className="text-[13.5px] font-semibold text-ink">{children}</h3>;
}
