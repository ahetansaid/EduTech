"use client";

import { ClipboardCheck, History, PenLine, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "@/components/motion";
import { Button, Card, EtatVide, Segmente, Squelette } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { date, heure, nombre } from "@/lib/format";
import { useHistorique, type Carnet } from "@/lib/api/enseignant";
import { Erreur, nomComplet } from "../../communs";

type Filtre = "tout" | "appel" | "evaluation" | "correction";
interface Ligne { cle: string; type: Exclude<Filtre, "tout">; le: string; titre: string; detail: string; noms?: string[] }

const POINT: Record<Ligne["type"], string> = { appel: "bg-critical", evaluation: "bg-blue", correction: "bg-info" };
const ICONE = { appel: ClipboardCheck, evaluation: PenLine, correction: History };
const fmt = (n: number) => nombre(n, Number.isInteger(n) ? 0 : 2);

/** Historique de la classe : appels, évaluations et corrections, du plus récent au plus ancien. */
export function Historique({ carnet }: { carnet: Carnet }) {
  const { data, isPending, error, refetch, isRefetching } = useHistorique(carnet.classe.id);
  const [filtre, setFiltre] = useState<Filtre>("tout");
  const [limite, setLimite] = useState(25);
  const [ouverte, setOuverte] = useState<string | null>(null);

  const noms = useMemo(() => new Map(carnet.eleves.map((e) => [e.id, nomComplet(e)])), [carnet.eleves]);

  const lignes = useMemo<Ligne[]>(() => {
    if (!data) return [];
    const l: Ligne[] = [];
    for (const a of data.appels) {
      const ids = [...new Set(a.absents.map((x) => x.apprenantId))];
      const justifiees = new Set(a.absents.filter((x) => x.justifiee).map((x) => x.apprenantId)).size;
      l.push({
        cle: `a-${a.date}`, type: "appel", le: `${a.date}T12:00:00.000Z`,
        titre: `Appel du ${date(a.date)} · ${ids.length} absent${ids.length > 1 ? "s" : ""}`,
        detail: `${justifiees ? `${justifiees} justifiée${justifiees > 1 ? "s" : ""} · ` : ""}saisi le ${date(a.saisiLe)} à ${heure(a.saisiLe)}`,
        noms: ids.map((id) => noms.get(id) ?? id),
      });
    }
    const evals = new Map<string, { matiere: string; trimestre: number; le: string; notes: number[] }>();
    for (const e of carnet.eleves) for (const n of e.notes) {
      const k = `${n.matiere}|${n.trimestre}|${n.le}`;
      const g = evals.get(k) ?? { matiere: n.matiere, trimestre: n.trimestre, le: n.le, notes: [] };
      g.notes.push(n.note); evals.set(k, g);
    }
    for (const [k, g] of evals) {
      const moy = g.notes.reduce((s, x) => s + x, 0) / g.notes.length;
      l.push({ cle: `e-${k}`, type: "evaluation", le: g.le, titre: `Évaluation · ${g.matiere} · T${g.trimestre}`, detail: `${g.notes.length} copie${g.notes.length > 1 ? "s" : ""} · moyenne ${nombre(moy, 2)}/20 · min ${fmt(Math.min(...g.notes))} · max ${fmt(Math.max(...g.notes))}` });
    }
    for (const c of data.corrections) {
      l.push({
        cle: `c-${c.id}`, type: "correction", le: c.le,
        titre: `Correction · ${noms.get(c.apprenantId) ?? c.apprenantId}`,
        detail: `${c.matiere} T${c.trimestre} : ${fmt(c.notePrecedente)} → ${fmt(c.nouvelleNote)}${c.notePrecedente !== c.noteInitiale ? ` (origine ${fmt(c.noteInitiale)})` : ""} · « ${c.motif} »`,
      });
    }
    return l.sort((a, b) => b.le.localeCompare(a.le));
  }, [data, carnet.eleves, noms]);

  if (isPending) {
    return <Card className="space-y-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="flex gap-3"><Squelette className="h-9 w-9 rounded-full" /><div className="flex-1 space-y-1.5"><Squelette className="h-4 w-2/3" /><Squelette className="h-3 w-1/2" /></div></div>)}</Card>;
  }
  if (!data) return <Erreur erreur={error!} relancer={() => refetch()} enCours={isRefetching} titre="Impossible de charger l'historique" />;

  const filtrees = filtre === "tout" ? lignes : lignes.filter((l) => l.type === filtre);
  const compte = (t: Ligne["type"]) => lignes.filter((l) => l.type === t).length;

  return (
    <Card className="min-w-0 p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 p-3 sm:p-4">
        <Segmente label="Type d'événement" valeur={filtre} onChange={(f) => { setFiltre(f); setLimite(25); }} options={[
          { valeur: "tout", libelle: "Tout" },
          { valeur: "appel", libelle: `Appels ${compte("appel")}` },
          { valeur: "evaluation", libelle: `Notes ${compte("evaluation")}` },
          { valeur: "correction", libelle: `Corr. ${compte("correction")}` },
        ]} />
        <Button taille="sm" variante="fantome" icone={RefreshCw} chargement={isRefetching} onClick={() => refetch()}>Actualiser</Button>
      </div>
      {filtrees.length === 0 ? (
        <EtatVide icone={History} titre="Rien à afficher" texte="Aucun événement de ce type n'a encore été enregistré pour cette classe." />
      ) : (
        <ul className="divide-y divide-line px-4 sm:px-5">
          <AnimatePresence initial={false}>
            {filtrees.slice(0, limite).map((l, i) => {
              const I = ICONE[l.type];
              const deplie = ouverte === l.cle;
              return (
                <motion.li key={l.cle} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: Math.min(i, 12) * 0.035 }} className="flex items-start gap-3 py-3">
                  <span className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2">
                    <I size={16} aria-hidden />
                    <span className={cn("absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface", POINT[l.type])} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{l.titre}</p>
                    <p className="text-xs text-ink-muted">{l.detail}</p>
                    {l.noms && l.noms.length > 0 && (
                      <>
                        <button onClick={() => setOuverte(deplie ? null : l.cle)} className="mt-1 text-xs font-medium text-accent-ink hover:underline" aria-expanded={deplie}>{deplie ? "Masquer les élèves" : "Voir les élèves"}</button>
                        <AnimatePresence initial={false}>
                          {deplie && (
                            <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden text-[13px] text-ink-2">{l.noms.join(" · ")}</motion.p>
                          )}
                        </AnimatePresence>
                      </>
                    )}
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-ink-muted">{date(l.le)}</span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
      {filtrees.length > limite && (
        <div className="border-t border-line/60 p-3"><Button variante="fantome" taille="sm" className="w-full" onClick={() => setLimite((n) => n + 25)}>Afficher plus ({filtrees.length - limite} restants)</Button></div>
      )}
    </Card>
  );
}
