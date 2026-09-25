"use client";

import { Compass, Info, NotebookPen, RefreshCw, ShieldAlert, UserCheck } from "lucide-react";
import { useMemo } from "react";
import { Cascade, EASE, Element, EntreePage, motion } from "@/components/motion";
import { Badge, Button, Card, CardHeader, EtatVide, PageHeader, Squelette } from "@/components/ui/primitives";
import { anneeCourante, notesEffectives, pistesOrientation, usePasseport, type Dossier } from "@/lib/api/parcours";
import { cn } from "@/lib/cn";
import { nombre } from "@/lib/format";
import { ErreurApi } from "@/lib/http";

/** Orientation : le système éclaire et documente ses critères ; la décision reste humaine. */
export default function Orientation() {
  const q = usePasseport();
  return (
    <EntreePage>
      <div className="space-y-5">
        <PageHeader titre="Orientation" sousTitre="Des pistes lues dans vos résultats réels, avec leurs critères visibles. Elles éclairent votre choix, elles ne le font pas." />
        <div className="flex items-start gap-3 rounded-lg bg-info-bg px-4 py-3 text-[13px] text-info">
          <Info size={17} className="mt-0.5 shrink-0" aria-hidden />
          <p><strong>Indicatif.</strong> Aucun modèle d&apos;orientation n&apos;est appliqué : c&apos;est une simple pondération, affichée, de vos moyennes de l&apos;année. Le système propose et explique ; vous, votre famille et le conseil de classe décidez.</p>
        </div>
        {q.isPending ? (
          <div className="space-y-3" aria-busy>{[0, 1, 2].map((i) => <Squelette key={i} className="h-40 rounded-xl" />)}</div>
        ) : q.isError ? (
          <Card>
            {q.error instanceof ErreurApi && q.error.refus
              ? <EtatVide icone={ShieldAlert} titre="Accès refusé" texte="Le contrôle d'accès n'autorise pas la lecture de ces résultats. Ce refus a été enregistré au journal d'audit." />
              : <EtatVide icone={RefreshCw} titre="Résultats momentanément indisponibles" texte={`${q.error.message}. Réessayez dans un instant.`} action={<Button variante="secondaire" icone={RefreshCw} onClick={() => q.refetch()}>Réessayer</Button>} />}
          </Card>
        ) : <Pistes d={q.data} />}
      </div>
    </EntreePage>
  );
}

function Pistes({ d }: { d: Dossier }) {
  const { notes, annee, pistes } = useMemo(() => {
    const notes = notesEffectives(d.evenements);
    const annee = anneeCourante(d, notes);
    return { notes: notes.filter((n) => n.anneeScolaire === annee), annee, pistes: pistesOrientation(notes, annee) };
  }, [d]);

  if (!notes.length) {
    return <Card><EtatVide icone={NotebookPen} titre="Pas encore assez de résultats" texte="Les pistes apparaîtront dès que des notes auront été saisies cette année. Rien n'est calculé sans données." /></Card>;
  }
  const meilleure = pistes.find((p) => p.score != null && p.couverture >= 0.99);

  return (
    <>
      <p className="text-xs text-ink-muted">Base de calcul : {notes.length} note{notes.length > 1 ? "s" : ""} de l&apos;année {annee}{d.situation.classe ? `, en ${d.situation.classe.libelle}` : ""}. Les séries du second cycle se choisissent en fin de 3e : ces pistes évolueront avec vos résultats.</p>
      <Cascade data-guide="orientation-pistes" className="space-y-4">
        {pistes.map((p) => (
          <Element key={p.code}>
            <Card className={cn("min-w-0", p === meilleure && "ring-2 ring-[color:var(--acc)]")}>
              <CardHeader icon={Compass} title={p.nom}
                subtitle={p.score != null ? `Indice de compatibilité : ${nombre(p.score, 1)}/20` : "Aucune des matières de référence n'est encore évaluée"}
                action={p === meilleure ? <Badge ton="succes">La plus compatible</Badge> : p.couverture < 0.99 && p.score != null ? <Badge ton="avertissement">Partielle</Badge> : undefined} />
              <ul className="space-y-2.5">
                {p.criteres.map((c, i) => (
                  <li key={c.matiere} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-[13px] sm:grid-cols-[10rem_minmax(0,1fr)_7rem]">
                    <span className="truncate text-ink-2">{c.matiere}</span>
                    <span className="text-right tabular-nums text-ink sm:order-last">{c.moyenne != null ? `${nombre(c.moyenne, 1)} × ${Math.round(c.poids * 100)} %` : <span className="text-ink-muted">non évaluée</span>}</span>
                    <span className="col-span-2 h-2 overflow-hidden rounded-full bg-surface-2 sm:col-span-1">
                      <motion.span className="block h-full rounded-full" initial={{ width: 0 }} whileInView={{ width: `${((c.moyenne ?? 0) / 20) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.06 * i, ease: EASE }} style={{ background: "var(--acc)" }} />
                    </span>
                  </li>
                ))}
              </ul>
              {p.couverture < 0.99 && p.score != null && <p className="mt-3 text-xs text-warning">Seuls {Math.round(p.couverture * 100)} % des critères sont évalués : l&apos;indice est calculé sur ces seules matières, sans valeur de remplacement.</p>}
            </Card>
          </Element>
        ))}
      </Cascade>
      <Card className="flex items-start gap-3">
        <UserCheck size={20} className="mt-0.5 shrink-0" style={{ color: "var(--acc)" }} aria-hidden />
        <p className="text-[13.5px] text-ink-2">Prochaine étape : un entretien avec le conseiller d&apos;orientation, qui voit exactement les mêmes critères que vous.</p>
      </Card>
    </>
  );
}
