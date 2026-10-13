"use client";

import type { AlerteTerritoriale } from "@beile/contracts";
import { AlarmClock, ArrowRight, CheckCircle2, Hand, Siren, TrendingDown, TriangleAlert, UserCheck, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Cascade, Element, EntreePage } from "@/components/motion";
import { CarteBenin, COULEUR_ALERTE } from "@/components/map/CarteBenin";
import { Modale } from "@/components/ui/Modale";
import { notifier } from "@/components/ui/Notifications";
import { Badge, Button, Card, EtatVide, PageHeader, Segmente, Squelette } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { useAlertesPilotage, useCloreSuiviMutation, usePrendreEnChargeMutation, type SuiviAlerte as SuiviAlerteServeur } from "@/lib/api/pilotage";
import { EtatEchec, useHabilitationPilotage } from "../_commun";

/**
 * Alertes : ce que le moteur a repéré sans qu'on le lui demande — communes nettement du mauvais côté de
 * leurs pairs, ou qui décrochent d'une année sur l'autre. Chaque alerte renvoie à son analyse détaillée.
 */

type Filtre = "toutes" | "critique" | "rupture" | "a_suivre";

const ouvert = (s: SuiviAlerteServeur | undefined) => !!s && (s.statut === "ouverte" || s.statut === "en_cours");

/**
 * Le geste qui manquait : une alerte se prend en charge (note d'intention, échéance), puis se clôt avec le constat
 * de ce qui a été fait. Sans cela, l'écran montrait des problèmes sans que personne n'en réponde.
 */
function SuiviAlerte({ alerte, suivi, peutSuivre }: { alerte: AlerteTerritoriale; suivi?: SuiviAlerteServeur; peutSuivre: boolean }) {
  const [mode, setMode] = useState<"prendre" | "clore" | null>(null);
  const [texte, setTexte] = useState("");
  const [jours, setJours] = useState(30);
  const [issue, setIssue] = useState<"traitee" | "sans_suite">("traitee");
  const prendre = usePrendreEnChargeMutation();
  const clore = useCloreSuiviMutation();
  const fermer = () => { setMode(null); setTexte(""); prendre.reset(); clore.reset(); };
  const erreur = (mode === "prendre" ? prendre.error : clore.error)?.message;

  const etat = !suivi ? null : ouvert(suivi)
    ? <Badge ton={suivi.enRetard ? "critique" : "info"} icone={suivi.enRetard ? AlarmClock : UserCheck}>{suivi.enRetard ? "Échéance dépassée" : "Prise en charge"}{suivi.priseEnChargePar ? ` · ${suivi.priseEnChargePar}` : ""}</Badge>
    : <Badge ton={suivi.statut === "acceptee" ? "succes" : "neutre"} icone={CheckCircle2}>{suivi.statut === "acceptee" ? "Traitée" : "Close sans suite"}</Badge>;

  return (
    <>
      {etat}
      {peutSuivre && !ouvert(suivi) && <Button taille="sm" variante="secondaire" icone={Hand} onClick={() => setMode("prendre")}>Prendre en charge</Button>}
      {peutSuivre && ouvert(suivi) && <Button taille="sm" variante="secondaire" icone={CheckCircle2} onClick={() => setMode("clore")}>Clore</Button>}
      <Modale ouvert={mode !== null} onFermer={fermer} icone={mode === "clore" ? CheckCircle2 : Hand} ton={mode === "clore" ? "succes" : "info"}
        titre={mode === "clore" ? "Clore le suivi" : "Prendre l'alerte en charge"} sousTitre={`${alerte.commune} · ${alerte.indicateur}`}
        pied={<div className="flex justify-end gap-2">
          <Button variante="fantome" onClick={fermer}>Annuler</Button>
          {mode === "prendre"
            ? <Button variante="primaire" icone={Hand} chargement={prendre.isPending} disabled={texte.trim().length < 5}
                onClick={() => prendre.mutate({ alerteId: alerte.id, note: texte.trim(), echeanceJours: jours }, { onSuccess: () => { notifier({ ton: "succes", titre: "Alerte prise en charge", texte: `Échéance dans ${jours} jours.` }); fermer(); } })}>Prendre en charge</Button>
            : <Button variante="primaire" icone={CheckCircle2} chargement={clore.isPending} disabled={texte.trim().length < 10 || !suivi}
                onClick={() => suivi && clore.mutate({ demandeId: suivi.demandeId, issue, constat: texte.trim() }, { onSuccess: () => { notifier({ ton: "succes", titre: "Suivi clos", texte: issue === "traitee" ? "L'alerte est marquée traitée." : "Close sans suite, motif conservé." }); fermer(); } })}>Clore</Button>}
        </div>}>
        <div className="space-y-3.5">
          {mode === "clore" && suivi?.note && <p className="rounded-md bg-surface-2 px-3 py-2 text-[13px] text-ink-2"><span className="text-ink-muted">Intention notée : </span>{suivi.note}</p>}
          {mode === "clore" && (
            <Segmente label="Issue" valeur={issue} onChange={(v) => setIssue(v as typeof issue)} options={[{ valeur: "traitee", libelle: "Traitée" }, { valeur: "sans_suite", libelle: "Sans suite" }]} />
          )}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{mode === "clore" ? "Constat : ce qui a été fait, ce qui a été vu" : "Ce que vous allez faire"}</span>
            <textarea value={texte} onChange={(e) => setTexte(e.target.value.slice(0, mode === "clore" ? 1000 : 500))} rows={3} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink outline-none focus:border-blue/50 focus:ring-2 focus:ring-blue/20" />
          </label>
          {mode === "prendre" && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Échéance</span>
              <select value={jours} onChange={(e) => setJours(Number(e.target.value))} aria-label="Échéance" className="h-10 rounded-lg border border-line bg-surface px-3 text-[14px] text-ink">
                {[7, 15, 30, 60, 90].map((j) => <option key={j} value={j}>{j} jours</option>)}
              </select>
            </label>
          )}
          {erreur && <p role="alert" className="rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">{erreur}</p>}
        </div>
      </Modale>
    </>
  );
}

export default function PageAlertes() {
  const hab = useHabilitationPilotage();
  const q = useAlertesPilotage();
  const [filtre, setFiltre] = useState<Filtre>("toutes");
  const [indicateur, setIndicateur] = useState<string>("");
  const [commune, setCommune] = useState<string | null>(null);

  const alertes = useMemo(() => (q.data?.alertes ?? []).filter((a) =>
    (filtre === "toutes" || (filtre === "a_suivre" ? !ouvert(q.data?.suivis[a.id]) && q.data?.suivis[a.id]?.statut !== "acceptee" : filtre === "critique" ? a.gravite === "critique" : a.type === "rupture"))
    && (!indicateur || a.code === indicateur)), [q.data, filtre, indicateur]);
  const indicateurs = useMemo(() => [...new Map((q.data?.alertes ?? []).map((a) => [a.code, a.indicateur])).entries()].sort((a, b) => a[1].localeCompare(b[1], "fr")), [q.data]);
  // Couleur d'une commune : l'alerte la plus grave qui la concerne (dans le filtre courant).
  const couleurs = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of alertes) if (a.gravite === "critique" || !m.has(a.communeId)) m.set(a.communeId, COULEUR_ALERTE[a.gravite === "critique" ? "critique" : "attention"]);
    return m;
  }, [alertes]);
  const parCommune = useMemo(() => {
    const g = new Map<string, AlerteTerritoriale[]>();
    for (const a of alertes) if (!commune || a.communeId === commune) g.set(a.communeId, [...(g.get(a.communeId) ?? []), a]);
    return [...g.values()];
  }, [alertes, commune]);
  const focus = hab?.perimetre.niveau === "departement" ? hab.perimetre.departementId : undefined;

  return (
    <EntreePage>
      <div className="space-y-5">
        <PageHeader surtitre="Pilotage" titre="Alertes" />
        {q.isError ? <EtatEchec erreur={q.error} onReessayer={() => q.refetch()} /> : !q.data ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]"><Squelette className="h-96 rounded-2xl" /><div className="space-y-3">{[0, 1, 2].map((i) => <Squelette key={i} className="h-32 rounded-2xl" />)}</div></div>
        ) : (
          <>
            <p className="text-[14px] text-ink-2">
              <strong className="font-semibold text-ink">{q.data.alertes.length} alerte{q.data.alertes.length > 1 ? "s" : ""}</strong>
              {" "}({q.data.alertes.filter((a) => a.gravite === "critique").length} critiques) sur {q.data.communesExaminees} communes et {q.data.indicateursExamines} indicateurs · {q.data.perimetre}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Segmente label="Filtre" valeur={filtre} onChange={(v) => setFiltre(v as Filtre)}
                options={[{ valeur: "toutes", libelle: "Toutes" }, { valeur: "a_suivre", libelle: "Sans suivi" }, { valeur: "critique", libelle: "Critiques" }, { valeur: "rupture", libelle: "Décrochages" }]} />
              <select value={indicateur} onChange={(e) => setIndicateur(e.target.value)} aria-label="Indicateur"
                className="h-10 rounded-lg border border-line bg-surface px-3 text-[13.5px] text-ink outline-none focus:border-blue focus:ring-4 focus:ring-blue/15 sm:w-72">
                <option value="">Tous les indicateurs</option>
                {indicateurs.map(([code, nom]) => <option key={code} value={code}>{nom}</option>)}
              </select>
            </div>

            {q.data.alertes.length === 0 ? (
              <Card><EtatVide icone={Siren} titre="Aucune alerte" texte="Aucune commune ne s'écarte nettement de ses pairs ni ne décroche sur un an." /></Card>
            ) : (
              <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
                <Card className="min-w-0 lg:sticky lg:top-20">
                  <CarteBenin niveau="communes" couleurs={couleurs} focusDepartement={focus} selection={commune} hauteur={focus ? 360 : 460}
                    onSelect={(id) => setCommune((c) => (c === id ? null : id))} className="mx-auto w-full max-w-[280px]" />
                  <div className="mt-3 flex flex-wrap gap-3 text-[12px] text-ink-2">
                    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COULEUR_ALERTE.critique }} /> Critique</span>
                    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COULEUR_ALERTE.attention }} /> Attention</span>
                  </div>
                  {commune && (
                    <button type="button" onClick={() => setCommune(null)} className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-[12.5px] font-semibold text-blue hover:underline">
                      <X size={13} aria-hidden /> Toutes les communes
                    </button>
                  )}
                </Card>
                {parCommune.length === 0 ? (
                  <Card><EtatVide icone={Siren} titre="Aucune alerte pour ce filtre" texte="Changez de filtre ou d'indicateur." /></Card>
                ) : (
                  <Cascade className="space-y-3">
                    {parCommune.map((groupe) => (
                      <Element key={groupe[0]!.communeId}>
                        <Card className="min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <h2 className="font-display text-[17px] font-bold text-ink">{groupe[0]!.commune}</h2>
                            <span className="text-[12.5px] text-ink-muted">{groupe[0]!.departement}</span>
                          </div>
                          <ul className="mt-3 divide-y divide-line/60">
                            {groupe.map((a) => (
                              <li key={a.id} className="flex flex-col gap-2 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                                <div className="flex min-w-0 items-start gap-2.5">
                                  {a.type === "rupture"
                                    ? <TrendingDown size={17} className={cn("mt-0.5 shrink-0", a.gravite === "critique" ? "text-critical" : "text-warning")} aria-label="Décrochage" />
                                    : <TriangleAlert size={17} className={cn("mt-0.5 shrink-0", a.gravite === "critique" ? "text-critical" : "text-warning")} aria-label="Écart" />}
                                  <p className="min-w-0 text-[14px] leading-snug text-ink">{a.texte}</p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2 pl-7 sm:pl-0">
                                  <Badge ton={a.gravite === "critique" ? "critique" : "avertissement"}>{a.gravite === "critique" ? "Critique" : "Attention"}</Badge>
                                  <Link href={`/ask?q=${encodeURIComponent(a.question)}`} onClick={() => { try { sessionStorage.setItem("beile.ask.lancer", a.question); } catch { /* stockage indisponible */ } }} className="group inline-flex min-h-9 items-center gap-1 text-[12.5px] font-semibold text-blue hover:underline">
                                    Analyser <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
                                  </Link>
                                  <SuiviAlerte alerte={a} suivi={q.data!.suivis[a.id]} peutSuivre={q.data!.peutSuivre} />
                                </div>
                              </li>
                            ))}
                          </ul>
                        </Card>
                      </Element>
                    ))}
                  </Cascade>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </EntreePage>
  );
}
