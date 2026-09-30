"use client";

import { ArrowDownRight, ArrowUpRight, FileText, Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { Bulletin } from "@/components/bulletin/Bulletin";
import { Cascade, Element, EntreePage } from "@/components/motion";
import { Card, EtatVide, PageHeader, Squelette } from "@/components/ui/primitives";
import { libelleTrimestre, usePasseport, type Dossier } from "@/lib/api/parcours";
import { bulletinDepuisDossier, periodesBulletin } from "@/lib/bulletin";
import { cn } from "@/lib/cn";
import { nombre } from "@/lib/format";

/** Tous les bulletins du parcours, année par année ; chacun s'ouvre et s'imprime. */
export default function MesBulletins() {
  const q = usePasseport();
  return (
    <EntreePage>
      <div className="space-y-5">
        <PageHeader surtitre="Passeport éducatif" titre="Mes bulletins" />
        {q.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <Squelette key={i} className="h-32 rounded-2xl" />)}</div>
        ) : q.isError ? (
          <Card><EtatVide icone={FileText} titre="Bulletins indisponibles" texte="Le service ne répond pas pour le moment. Réessayez dans un instant." /></Card>
        ) : <Liste d={q.data} />}
      </div>
    </EntreePage>
  );
}

const ton = (m: number | null) => (m == null ? "text-ink-muted" : m < 10 ? "text-critical" : m < 12 ? "text-warning" : "text-success");

function Liste({ d }: { d: Dossier }) {
  const periodes = useMemo(() => periodesBulletin(d), [d]);
  const [ouvert, setOuvert] = useState<{ annee: string; trimestre: number } | null>(null);
  const annees = [...new Set(periodes.map((p) => p.annee))];
  if (!periodes.length) return <Card><EtatVide icone={FileText} titre="Aucun bulletin pour l'instant" texte="Votre premier bulletin apparaîtra dès les premières notes du trimestre." /></Card>;
  return (
    <>
      {annees.map((annee) => (
        <section key={annee} aria-labelledby={`annee-${annee}`}>
          <h2 id={`annee-${annee}`} className="mb-3 text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Année {annee}</h2>
          <Cascade className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {periodes.filter((p) => p.annee === annee).map((p) => {
              // Évolution par rapport au trimestre précédent de la même année.
              const avant = periodes.find((x) => x.annee === annee && x.trimestre === p.trimestre - 1);
              const delta = p.moyenne != null && avant?.moyenne != null ? p.moyenne - avant.moyenne : null;
              return (
                <Element key={`${annee}-${p.trimestre}`}>
                  <button type="button" onClick={() => setOuvert({ annee, trimestre: p.trimestre })}
                    className="group flex w-full flex-col rounded-2xl border border-line/70 bg-surface p-4 text-left shadow-float transition hover:-translate-y-0.5 hover:shadow-pop">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-ink-2">{libelleTrimestre(p.trimestre)}</span>
                      <Printer size={16} className="text-ink-muted transition group-hover:text-accent-ink" aria-hidden />
                    </span>
                    <span className="mt-2 flex items-baseline gap-1.5">
                      <span className={cn("font-display text-[30px] font-bold leading-none tabular-nums", ton(p.moyenne))}>{nombre(p.moyenne, 2)}</span>
                      <span className="text-[13px] text-ink-muted">/20</span>
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-muted">
                      <span>{p.matieres} matière{p.matieres > 1 ? "s" : ""}</span>
                      {delta != null && Math.abs(delta) >= 0.01 && (
                        <span className={cn("inline-flex items-center gap-0.5 font-semibold", delta > 0 ? "text-success" : "text-critical")}>
                          {delta > 0 ? <ArrowUpRight size={13} aria-hidden /> : <ArrowDownRight size={13} aria-hidden />}{delta > 0 ? "+" : ""}{nombre(delta, 2)}
                        </span>
                      )}
                    </span>
                  </button>
                </Element>
              );
            })}
          </Cascade>
        </section>
      ))}
      {ouvert && <Bulletin view={bulletinDepuisDossier(d, ouvert.trimestre, ouvert.annee)} onFermer={() => setOuvert(null)} />}
    </>
  );
}
