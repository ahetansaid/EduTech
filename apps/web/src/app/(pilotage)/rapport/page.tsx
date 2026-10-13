"use client";

import type { Perimetre } from "@beile/contracts";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Printer } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { EntreePage } from "@/components/motion";
import { Button, Card, EtatVide, PageHeader, Squelette } from "@/components/ui/primitives";
import { date, entier } from "@/lib/format";
import { lire } from "@/lib/http";
import { EtatEchec, libellePerimetre } from "../_commun";

interface RapportMensuel {
  mois: string; du: string; au: string; genereLe: string; perimetre: Perimetre; source: "registre";
  etablissements: { attendus: number; transmis: number };
  visites: { consignees: number; ecolesVisitees: number; jamaisVisitees: number };
  appel: { absencesEnregistrees: number; ecolesAyantFaitLAppel: number; joursDAppel: number };
  evaluations: { notesSaisies: number; ecolesAyantNote: number };
  relances: { envoyees: number; abouties: number; echuesSansReponse: number };
  alertes: { prisesEnCharge: number; traitees: number; closesSansSuite: number; enRetard: number };
}

const moisCourant = () => new Date().toISOString().slice(0, 7);
const libelleMois = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

/**
 * Rapport mensuel de la tutelle : le compte rendu d'activité qu'une direction remonte, tiré du registre réel
 * (visites, appel, notes, relances, suivi des alertes). Imprimable tel quel ; aucune donnée nominative.
 */
export default function PageRapport() {
  const [mois, setMois] = useState(moisCourant);
  const q = useQuery({ queryKey: ["rapport", "mensuel", mois], queryFn: ({ signal }) => lire<RapportMensuel>(`/rapports/mensuel?mois=${mois}`, signal) });
  const r = q.data;
  const monte = useSyncExternalStore(() => () => {}, () => true, () => false);
  return (
    <EntreePage>
      <div className="space-y-5">
        <div className="print:hidden">
          <PageHeader surtitre="Pilotage" titre="Rapport mensuel"
            sousTitre="L'activité de la tutelle sur le mois, tirée du registre réel — pas du cube statistique de démonstration."
            actions={<div className="flex flex-wrap items-center gap-2">
              <input type="month" value={mois} max={moisCourant()} onChange={(e) => e.target.value && setMois(e.target.value)} aria-label="Mois du rapport"
                className="h-10 rounded-lg border border-line bg-surface px-3 text-[14px] text-ink" />
              <Button variante="secondaire" icone={Printer} disabled={!r} onClick={() => window.print()}>Imprimer / PDF</Button>
            </div>} />
        </div>
        {q.isPending ? <Squelette className="h-96 rounded-2xl" /> : q.isError ? <EtatEchec erreur={q.error} onReessayer={() => q.refetch()} /> : !r ? (
          <Card><EtatVide icone={ClipboardList} titre="Aucun rapport" texte="Choisissez un mois." /></Card>
        ) : (
          <>
            <RapportDoc r={r} />
            {monte && createPortal(<div data-impression className="hidden"><RapportDoc r={r} /></div>, document.body)}
          </>
        )}
      </div>
    </EntreePage>
  );
}

/** Le document lui-même : rendu à l’écran, et copié dans <body> pour l’impression (seul ce qui porte data-impression s’imprime). */
function RapportDoc({ r }: { r: RapportMensuel }) {
  return (
    <article data-impression-doc className="rounded-2xl border border-line bg-white px-6 py-7 text-slate-900 shadow-float print:border-0 print:px-0 print:py-0 print:shadow-none">
      <header className="border-b-2 border-slate-900 pb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Plateforme éducative BEILE · rapport d&apos;activité de la tutelle</p>
        <h1 className="mt-1 font-display text-[22px] font-bold capitalize text-slate-900">{libelleMois(r.mois)}</h1>
        <p className="mt-0.5 text-[13px] text-slate-600">{libellePerimetre(r.perimetre)} · du {date(r.du)} au {date(new Date(Date.parse(`${r.au}T12:00:00Z`) - 86_400_000).toISOString())}</p>
      </header>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Bloc titre="Visites d'inspection" lignes={[
          ["Visites consignées", r.visites.consignees], ["Écoles visitées", r.visites.ecolesVisitees], ["Écoles jamais visitées (à fin de mois)", r.visites.jamaisVisitees],
        ]} />
        <Bloc titre="Suivi des alertes" lignes={[
          ["Prises en charge ce mois", r.alertes.prisesEnCharge], ["Traitées (cumul)", r.alertes.traitees], ["Closes sans suite (cumul)", r.alertes.closesSansSuite], ["En retard aujourd'hui", r.alertes.enRetard],
        ]} />
        <Bloc titre="Appel (absences enregistrées)" lignes={[
          ["Absences enregistrées", r.appel.absencesEnregistrees], ["Écoles ayant fait l'appel", r.appel.ecolesAyantFaitLAppel], ["Jours d'appel", r.appel.joursDAppel],
        ]} />
        <Bloc titre="Évaluations" lignes={[["Notes saisies", r.evaluations.notesSaisies], ["Écoles ayant saisi des notes", r.evaluations.ecolesAyantNote]]} />
        <Bloc titre="Relances de transmission" lignes={[
          ["Envoyées ce mois", r.relances.envoyees], ["Abouties (cumul)", r.relances.abouties], ["Échues sans réponse", r.relances.echuesSansReponse],
        ]} />
        <Bloc titre="Transmission des données" lignes={[["Établissements du périmètre", r.etablissements.attendus], ["Ayant transmis", r.etablissements.transmis]]} />
      </div>
      <footer className="mt-6 border-t border-slate-200 pt-3 text-[11px] leading-relaxed text-slate-500">
        Généré le {date(r.genereLe)} à partir du registre national et des circuits de la plateforme. Aucune donnée nominative.
        Les compteurs « cumul » portent sur tout l&apos;historique du périmètre à la date de génération.
      </footer>
    </article>
  );
}

function Bloc({ titre, lignes }: { titre: string; lignes: [string, number][] }) {
  return (
    <section className="rounded-lg border border-slate-200 px-4 py-3">
      <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-500">{titre}</h2>
      <dl className="space-y-1 text-[13.5px]">
        {lignes.map(([l, v]) => <div key={l} className="flex justify-between gap-3"><dt className="text-slate-700">{l}</dt><dd className="font-semibold tabular-nums text-slate-900">{entier(v)}</dd></div>)}
      </dl>
    </section>
  );
}
