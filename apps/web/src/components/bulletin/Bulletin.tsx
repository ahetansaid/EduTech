"use client";

import { Printer, X } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Button, Segmente } from "@/components/ui/primitives";
import type { BulletinView } from "@/lib/bulletin";
import { cn } from "@/lib/cn";
import { date, nombre } from "@/lib/format";

/**
 * Bulletin trimestriel imprimable. Rendu dans <body> (attribut `data-impression`) : à l'impression,
 * la feuille de style globale masque tout le reste de l'application et ne conserve que ce document.
 * Aucune dépendance : c'est le navigateur qui produit le PDF via « Enregistrer en PDF ».
 */
export function Bulletin({ view, trimestres, trimestre, onTrimestre, onFermer }: {
  view: BulletinView;
  trimestres?: number[];
  trimestre?: number;
  onTrimestre?: (t: number) => void;
  onFermer: () => void;
}) {
  const monte = useSyncExternalStore(() => () => {}, () => true, () => false);

  useEffect(() => {
    const echap = (e: KeyboardEvent) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", echap);
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", echap); document.body.style.overflow = avant; };
  }, [onFermer]);

  if (!monte) return null;
  const choix = (trimestres ?? [view.trimestre]).filter((t, i, a) => a.indexOf(t) === i);
  const libelleTrimestre = (t: number) => (t === 1 ? "1er trimestre" : `${t}e trimestre`);

  return createPortal(
    <div data-impression className="fixed inset-0 z-[80] overflow-y-auto bg-navy-deep/50 backdrop-blur-sm print:static print:overflow-visible print:bg-white print:backdrop-blur-none">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-3 p-0 sm:p-6 print:block print:max-w-none print:gap-0 print:p-0">
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 bg-surface/95 px-4 py-3 shadow-soft backdrop-blur sm:rounded-t-xl print:hidden">
          <div className="flex items-center gap-2">
            {choix.length > 1 && onTrimestre && trimestre != null ? (
              <Segmente label="Trimestre" valeur={String(trimestre)} onChange={(v) => onTrimestre(Number(v))} options={choix.map((t) => ({ valeur: String(t), libelle: `T${t}` }))} />
            ) : (
              <span className="text-sm font-semibold text-ink">{libelleTrimestre(view.trimestre)}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variante="secondaire" taille="sm" icone={Printer} onClick={() => window.print()}>Imprimer / PDF</Button>
            <Button variante="fantome" taille="sm" icone={X} onClick={onFermer} aria-label="Fermer le bulletin" />
          </div>
        </div>

        <Document view={view} libelleTrimestre={libelleTrimestre} />
      </div>
    </div>,
    document.body,
  );
}

/** Le document lui-même : couleurs claires explicites pour rester lisible même en thème sombre. */
function Document({ view, libelleTrimestre }: { view: BulletinView; libelleTrimestre: (t: number) => string }) {
  const a = view.apprenant;
  return (
    <article data-impression-doc className="mx-auto w-full bg-white px-6 py-7 text-slate-900 shadow-pop sm:rounded-xl print:mx-0 print:w-full print:px-0 print:py-0 print:shadow-none sm:print:rounded-none">
      <header className="border-b-2 border-slate-900 pb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Plateforme éducative BEILE</p>
        <h1 className="mt-1 font-display text-[22px] font-bold leading-tight text-slate-900">Bulletin de notes — {libelleTrimestre(view.trimestre)}</h1>
        <p className="mt-0.5 text-[13px] text-slate-600">
          {a.etablissement ?? "Établissement"}{a.classe ? ` · classe ${a.classe}` : ""}{a.anneeScolaire ? ` · année scolaire ${a.anneeScolaire}` : ""}
        </p>
      </header>

      <section className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-3">
        <Champ libelle="Apprenant·e" valeur={`${a.prenoms} ${a.nom}`} />
        <Champ libelle="Identifiant" valeur={a.id} mono />
        <Champ libelle="Classe" valeur={a.classe ?? "—"} />
      </section>

      <section className="mt-5">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-slate-500">Résultats par matière</h2>
        {view.matieres.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 px-3 py-6 text-center text-[13px] text-slate-500">
            Aucune évaluation enregistrée pour ce trimestre.
          </p>
        ) : (
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr className="border-b border-slate-300 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="py-1.5 font-semibold">Matière</th>
                <th className="py-1.5 text-right font-semibold">Moyenne</th>
                <th className="py-1.5 text-right font-semibold">Évaluations</th>
                <th className="hidden py-1.5 pl-4 font-semibold sm:table-cell">Repère</th>
              </tr>
            </thead>
            <tbody>
              {view.matieres.map((m) => (
                <tr key={m.matiere} className="border-b border-slate-100">
                  <td className="py-2 pr-2 text-slate-800">{m.matiere}</td>
                  <td className={cn("py-2 text-right font-semibold tabular-nums", m.moyenne < 10 ? "text-red-700" : "text-slate-900")}>{nombre(m.moyenne, 2)}</td>
                  <td className="py-2 text-right tabular-nums text-slate-500">{m.nb}</td>
                  <td className="hidden py-2 pl-4 sm:table-cell">
                    <span className="block h-2 w-full max-w-[120px] overflow-hidden rounded-full bg-slate-100">
                      <span className={cn("block h-2 rounded-full", m.moyenne < 10 ? "bg-red-500" : "bg-emerald-600")} style={{ width: `${(m.moyenne / 20) * 100}%` }} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-5 grid grid-cols-2 gap-3">
        <Synthese libelle="Moyenne générale" valeur={view.moyenneGenerale != null ? `${nombre(view.moyenneGenerale, 2)}/20` : "—"} accent={view.moyenneGenerale != null && view.moyenneGenerale < 10} />
        <Synthese libelle="Absences enregistrées" valeur={`${view.absences.total} jour${view.absences.total > 1 ? "s" : ""}`} indice={view.absences.justifiees ? `dont ${view.absences.justifiees} justifiée(s)` : undefined} />
      </section>

      <footer className="mt-6 border-t border-slate-200 pt-3 text-[11px] leading-relaxed text-slate-500">
        <p>
          Document généré le {date(view.genereLe)} à partir des évaluations inscrites au registre national (corrections comprises).
          Moyennes non pondérées : la plateforme ne transmet ni coefficient ni appréciation, ce bulletin reflète exactement les notes saisies par les enseignants.
        </p>
        <p className="mt-2 text-slate-400">BEILE · document de suivi — la valeur officielle reste le dossier tenu par l'établissement.</p>
      </footer>
    </article>
  );
}

function Champ({ libelle, valeur, mono }: { libelle: string; valeur: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">{libelle}</p>
      <p className={cn("truncate text-slate-800", mono && "font-mono text-[12px]")}>{valeur}</p>
    </div>
  );
}

function Synthese({ libelle, valeur, indice, accent }: { libelle: string; valeur: string; indice?: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-lg border px-3.5 py-2.5", accent ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50")}>
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{libelle}</p>
      <p className={cn("mt-0.5 text-[19px] font-bold tabular-nums", accent ? "text-red-700" : "text-slate-900")}>{valeur}</p>
      {indice && <p className="text-[11px] text-slate-500">{indice}</p>}
    </div>
  );
}
