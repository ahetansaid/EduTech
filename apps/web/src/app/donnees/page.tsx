"use client";

import { ChartColumn, Info } from "lucide-react";
import { useState } from "react";
import { PagePublique } from "@/components/public/CadrePublic";
import { Compteur, EASE, motion } from "@/components/motion";
import { BarresClassees } from "@/components/charts/Graphiques";
import { EtatVide, Squelette } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { useChiffres, type IndicateurPublic } from "@/lib/api/public";

const formater = (i: IndicateurPublic) => (v: number) =>
  i.unite === "pourcentage" ? `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`
    : i.unite === "ratio" ? v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })
      : v >= 10_000 ? `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} k` : v.toLocaleString("fr-FR");

const COURT: Record<string, string> = { effectif: "Élèves", ratio: "Élèves par enseignant", occupation: "Occupation des places", bepc: "Réussite au BEPC" };

export default function PageDonnees() {
  const { data, isPending, isError, refetch } = useChiffres();
  const [choix, setChoix] = useState("effectif");
  const courant = data?.indicateurs.find((i) => i.cle === choix) ?? data?.indicateurs[0];

  return (
    <PagePublique large surtitre="Données ouvertes" titre="L'éducation en chiffres" intro="Quelques indicateurs clés, par département. Chaque chiffre porte sa définition officielle, sa source et son indice de confiance ; aucune donnée personnelle.">
      {isError ? (
        <EtatVide icone={ChartColumn} titre="Les chiffres n'ont pas pu être chargés" action={<button onClick={() => refetch()} className="rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white">Réessayer</button>} />
      ) : isPending || !data || !courant ? (
        <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Squelette key={i} className="h-28 rounded-2xl" />)}</div><Squelette className="h-96 rounded-2xl" /></div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="tablist" aria-label="Indicateur">
            {data.indicateurs.map((i, k) => {
              const actif = i.cle === courant.cle;
              return (
                <motion.button key={i.cle} role="tab" aria-selected={actif} onClick={() => setChoix(i.cle)}
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: k * 0.06, duration: 0.45, ease: EASE }}
                  className={cn("rounded-2xl border p-4 text-left shadow-float transition", actif ? "border-blue/40 bg-blue-soft/60 ring-2 ring-blue/25" : "border-line/70 bg-surface hover:-translate-y-0.5 hover:shadow-pop")}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{COURT[i.cle] ?? i.nom}</p>
                  <p className="mt-2 font-display text-[28px] font-bold leading-none text-ink">{i.valeur == null ? "—" : <Compteur valeur={i.valeur} format={formater(i)} />}</p>
                  <p className="mt-2 text-[12px] text-ink-muted">National · {i.periode}</p>
                </motion.button>
              );
            })}
          </div>
          <motion.section key={courant.cle} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
            className="mt-5 grid gap-5 rounded-2xl border border-line/70 bg-surface p-5 shadow-float sm:p-6 lg:grid-cols-[1fr_320px]">
            <div className="min-w-0">
              <h2 className="font-display text-[18px] font-bold text-ink">{courant.nom}, par département</h2>
              <BarresClassees className="mt-3" formater={formater(courant)}
                barres={[...courant.departements].sort((a, b) => (b.valeur ?? 0) - (a.valeur ?? 0)).map((d) => ({ cle: d.id, libelle: d.nom, valeur: d.valeur }))}
                reference={courant.valeur != null ? { valeur: courant.valeur, libelle: "National" } : undefined} />
            </div>
            <aside className="space-y-4 rounded-xl bg-surface-2/70 p-4 text-[13.5px]">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Définition</p>
                <p className="mt-1 leading-relaxed text-ink-2">{courant.definition}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Source</p>
                <p className="mt-1 text-ink-2">{courant.source}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Indice de confiance</p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-line"><motion.div className="h-full rounded-full bg-success" initial={{ width: 0 }} animate={{ width: `${courant.confiance}%` }} transition={{ duration: 0.8, ease: EASE }} /></div>
                  <span className="font-semibold tabular-nums text-ink">{courant.confiance} %</span>
                </div>
              </div>
              <p className="flex gap-2 text-[12.5px] leading-relaxed text-ink-muted"><Info size={15} className="mt-0.5 shrink-0" aria-hidden /> Période {courant.periode}. Les données de l'année en cours sont provisoires jusqu'à leur validation.</p>
            </aside>
          </motion.section>
        </>
      )}
    </PagePublique>
  );
}
