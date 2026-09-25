"use client";

import type { Critere, DecisionAcces, Finalite } from "@beile/contracts";
import { FINALITE_LIBELLE } from "@beile/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, FileLock2, Fingerprint, Lock, Radio, RefreshCw, ScrollText, Search, ShieldCheck, ShieldX, UserRoundX, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, Cascade, Compteur, EASE, Element, EntreePage, motion } from "@/components/motion";
import { DecisionAccesCarte, TuileIndicateur } from "@/components/ui/donnees";
import { notifier } from "@/components/ui/Notifications";
import { Badge, Button, Card, CardHeader, EtatVide, PageHeader, Segmente, Squelette, type Ton } from "@/components/ui/primitives";
import { useJournalAudit, useStatistiquesAudit, type FiltreDecision, type LigneJournal, type StatistiquesAudit } from "@/lib/api/gouvernance";
import { cn } from "@/lib/cn";
import { entier, nombre } from "@/lib/format";
import { ErreurApi, lire } from "@/lib/http";

/* ------------------------------------------------------------------ Libellés et formats */

const TZ = "Africa/Porto-Novo";
const heureSec = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: TZ });
const jourCourt = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", timeZone: TZ });

const CRITERE_LIBELLE: Record<Critere | "inconnu", string> = { role: "Rôle", perimetre: "Périmètre", relation: "Relation", finalite: "Finalité", inconnu: "Non précisé" };
const CRITERE_AIDE: Record<Critere | "inconnu", string> = {
  role: "Le rôle ne donne pas accès à ce type de donnée",
  perimetre: "Donnée hors du territoire ou de l'établissement de l'habilitation",
  relation: "Aucun lien pédagogique, familial ou administratif avec la personne",
  finalite: "Motif déclaré non admis pour ce rôle",
  inconnu: "Refus sans critère renseigné",
};
const FINALITES = Object.keys(FINALITE_LIBELLE) as Finalite[];

/* ------------------------------------------------------------------ Page */

export default function AuditPage() {
  const [recherche, setRecherche] = useState("");
  const [q, setQ] = useState("");
  const [decision, setDecision] = useState<FiltreDecision>("tous");
  const [finalite, setFinalite] = useState<Finalite | null>(null);

  // Recherche envoyée au serveur après une courte pause de frappe.
  useEffect(() => {
    const t = setTimeout(() => setQ(recherche.trim()), 350);
    return () => clearTimeout(t);
  }, [recherche]);

  const filtres = useMemo(() => ({ decision, finalite, q }), [decision, finalite, q]);
  const journal = useJournalAudit(filtres);
  const stats = useStatistiquesAudit();
  const lignes = useMemo(() => journal.data?.pages.flatMap((p) => p.lignes) ?? [], [journal.data]);
  const total = journal.data?.pages[0]?.total ?? 0;
  const filtresActifs = decision !== "tous" || finalite !== null || recherche !== "";
  const effacer = () => { setRecherche(""); setQ(""); setDecision("tous"); setFinalite(null); };

  const refus = [journal.error, stats.error].some((e) => e instanceof ErreurApi && e.refus);
  if (refus) {
    return (
      <EntreePage>
        <div className="space-y-5">
          <PageHeader surtitre="Conformité · P11 · P14" titre="Journal d'audit" />
          <Card>
            <EtatVide icone={ShieldX} titre="Journal réservé au délégué à la protection des données" texte="Votre tentative de consultation vient elle-même d'être inscrite au journal, avec le critère manquant « rôle »." />
          </Card>
        </div>
      </EntreePage>
    );
  }

  const t = stats.data?.totaux;
  const exporter = () => exporterCsv(lignes);

  return (
    <EntreePage>
      <div className="space-y-6">
        <PageHeader
          surtitre="Conformité · P11 · P14"
          titre="Journal d'audit"
          sousTitre="Qui a demandé quelle donnée, pour quelle finalité, avec quelle décision. Le journal est en ajout seul : aucune entrée ne peut être modifiée ni supprimée, pas même par un administrateur."
          actions={
            <>
              <EnDirect misAJour={journal.dataUpdatedAt} actif={journal.isFetching} />
              <Button variante="secondaire" taille="sm" icone={Download} onClick={exporter} disabled={!lignes.length}>Exporter (CSV)</Button>
            </>
          }
        />

        <Cascade className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Element>
            <TuileIndicateur libelle="Décisions journalisées" icone={ScrollText} accent="bleu" valeur={t ? <Compteur valeur={t.total} format={entier} /> : <Squelette className="h-7 w-24" />} indice={t ? `${entier(t.jour)} sur les dernières 24 h` : "…"} />
          </Element>
          <Element>
            <TuileIndicateur libelle="Accès refusés" icone={ShieldX} accent="critique" valeur={t ? <Compteur valeur={t.refus} format={entier} /> : <Squelette className="h-7 w-16" />} indice={t ? `${entier(t.refusJour)} sur les dernières 24 h` : "…"} />
          </Element>
          <Element>
            <TuileIndicateur libelle="Part de refus" icone={FileLock2} accent="ambre" valeur={t ? nombre(t.total ? (t.refus / t.total) * 100 : 0, 2) : <Squelette className="h-7 w-16" />} unite={t ? "%" : undefined} indice="de toutes les demandes" />
          </Element>
          <Element>
            <TuileIndicateur libelle="Dernière décision" icone={ShieldCheck} accent="sarcelle" valeur={t?.derniere ? heureSec(t.derniere) : t ? "—" : <Squelette className="h-7 w-24" />} indice={t?.derniere ? jourCourt(t.derniere) : "aucune"} />
          </Element>
        </Cascade>

        <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
          <Card className="min-w-0 lg:col-span-2">
            <CardHeader icon={Radio} title="Décisions des dernières 24 heures" subtitle="Par heure : accès accordés et refusés. Chaque barre est lue dans le journal, pas estimée." />
            {stats.isPending ? <Squelette className="h-44 w-full" /> : stats.isError ? (
              <EtatVide icone={RefreshCw} titre="Statistiques indisponibles" texte={stats.error.message} action={<Button variante="secondaire" taille="sm" icone={RefreshCw} onClick={() => stats.refetch()}>Réessayer</Button>} />
            ) : <ActiviteHoraire points={stats.data.activite24h} reference={stats.data.horodatage} />}
          </Card>
          <PreuveTracabilite />
        </div>

        <Card className="min-w-0 p-3">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
            <label className="relative block min-w-0">
              <span className="sr-only">Rechercher dans le journal</span>
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
              <input
                type="search"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Personne, action, ressource (APP-…, CLS-…)"
                className="h-10 w-full rounded-md border border-line bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/15"
              />
            </label>
            <div className="max-w-full overflow-x-auto">
              <Segmente
                label="Décision"
                options={[{ valeur: "tous", libelle: "Toutes" }, { valeur: "accordes", libelle: "Accordées" }, { valeur: "refuses", libelle: `Refusées${t ? ` (${entier(t.refus)})` : ""}` }]}
                valeur={decision}
                onChange={setDecision}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Finalité</span>
                <select value={finalite ?? ""} onChange={(e) => setFinalite((e.target.value || null) as Finalite | null)} className="h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/15 md:w-56">
                  <option value="">Toutes les finalités</option>
                  {FINALITES.map((f) => <option key={f} value={f}>{FINALITE_LIBELLE[f]}</option>)}
                </select>
              </label>
              {filtresActifs && (
                <button onClick={effacer} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink" aria-label="Effacer les filtres" title="Effacer les filtres"><X size={16} /></button>
              )}
            </div>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="min-w-0 overflow-hidden p-0 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 px-5 py-3">
              <h2 className="text-[15px] font-semibold text-ink">Journal détaillé</h2>
              <p className="text-xs text-ink-muted" aria-live="polite">
                {journal.isPending ? "Chargement…" : `${entier(lignes.length)} affichée${lignes.length > 1 ? "s" : ""} sur ${entier(total)}`}
              </p>
            </div>
            {journal.isPending ? (
              <LignesSquelette />
            ) : journal.isError ? (
              <EtatVide icone={RefreshCw} titre="Journal indisponible" texte={journal.error.message} action={<Button variante="secondaire" taille="sm" icone={RefreshCw} onClick={() => journal.refetch()}>Réessayer</Button>} />
            ) : lignes.length === 0 ? (
              <EtatVide
                icone={ScrollText}
                titre={filtresActifs ? "Aucune entrée ne correspond" : "Journal vide"}
                texte={filtresActifs ? "Aucune décision ne correspond à ces critères. Élargissez la recherche." : "Aucune décision n'a encore été inscrite."}
                action={filtresActifs ? <Button variante="secondaire" taille="sm" icone={X} onClick={effacer}>Effacer les filtres</Button> : undefined}
              />
            ) : (
              <ListeJournal key={JSON.stringify(filtres)} lignes={lignes} />
            )}
            {journal.hasNextPage && (
              <div className="border-t border-line/60 p-3 text-center">
                <Button variante="secondaire" taille="sm" chargement={journal.isFetchingNextPage} onClick={() => journal.fetchNextPage()}>Afficher les décisions plus anciennes</Button>
              </div>
            )}
          </Card>

          <div className="min-w-0 space-y-6">
            <RefusParCritere stats={stats.data} />
            <ParFinalite stats={stats.data} />
            <ActeursRefuses stats={stats.data} />
          </div>
        </div>
      </div>
    </EntreePage>
  );
}

/* ------------------------------------------------------------------ Indicateur « en direct » */

function EnDirect({ misAJour, actif }: { misAJour: number; actif: boolean }) {
  return (
    <span className="inline-flex h-8 items-center gap-2 rounded-md border border-line/70 bg-surface px-3 text-xs text-ink-2" title="Le journal est relu toutes les 15 secondes">
      <span className="relative flex h-2 w-2" aria-hidden>
        <span className={cn("absolute inline-flex h-full w-full rounded-full bg-success opacity-60", actif && "animate-ping")} />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
      </span>
      En direct · {misAJour ? heureSec(new Date(misAJour).toISOString()) : "…"}
    </span>
  );
}

/* ------------------------------------------------------------------ Liste du journal */

function ListeJournal({ lignes }: { lignes: LigneJournal[] }) {
  // Repère fixé au montage : toute ligne plus récente est arrivée pendant la consultation et est signalée.
  const [repere] = useState(() => lignes[0]?.horodatage ?? "");
  return (
    <ul className="divide-y divide-line/60">
      <AnimatePresence initial={false}>
        {lignes.map((e, i) => (
          <LigneAudit key={e.id} e={e} nouvelle={e.horodatage > repere} rang={i % 40} />
        ))}
      </AnimatePresence>
    </ul>
  );
}

function LigneAudit({ e, nouvelle, rang }: { e: LigneJournal; nouvelle: boolean; rang: number }) {
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: EASE, delay: nouvelle ? 0 : Math.min(rang, 12) * 0.035 }}
      className={cn("relative grid gap-x-4 gap-y-1.5 px-5 py-3 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto]", !e.autorise && "bg-critical-bg/30")}
    >
      {nouvelle && <motion.span aria-hidden className="pointer-events-none absolute inset-0 bg-blue-soft" initial={{ opacity: 0.9 }} animate={{ opacity: 0 }} transition={{ duration: 2.4, ease: "easeOut" }} />}
      <div className="relative flex items-center gap-2 sm:block">
        <p className="font-mono text-[12.5px] tabular text-ink">{heureSec(e.horodatage)}</p>
        <p className="text-[11.5px] tabular text-ink-muted">{jourCourt(e.horodatage)}</p>
      </div>
      <div className="relative min-w-0">
        <p className="text-sm text-ink">
          <span className="font-medium">{e.profilNom}</span> <span className="text-ink-2">· {e.action}</span>
          {nouvelle && <Badge ton="info" className="ml-2 align-middle">Nouvelle</Badge>}
        </p>
        <p className="mt-0.5 truncate font-mono text-xs text-ink-muted"><span className="sr-only">Ressource : </span>{e.ressource}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge ton="neutre">{FINALITE_LIBELLE[e.finalite] ?? e.finalite}</Badge>
          {e.critereManquant && <Badge ton="critique">Critère manquant : {CRITERE_LIBELLE[e.critereManquant]}</Badge>}
        </div>
      </div>
      <div className="relative sm:text-right">
        <Statut ton={e.autorise ? "succes" : "critique"}>{e.autorise ? "Accordé" : "Refusé"}</Statut>
        <p className="mt-1 hidden font-mono text-[10.5px] text-ink-muted sm:block" title={e.id}>{e.id.slice(4, 12)}</p>
      </div>
    </motion.li>
  );
}

function Statut({ ton, children }: { ton: Ton; children: React.ReactNode }) {
  return <Badge ton={ton}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />{children}</Badge>;
}

function LignesSquelette() {
  return (
    <ul className="divide-y divide-line/60" aria-label="Chargement du journal">
      {Array.from({ length: 7 }, (_, i) => (
        <li key={i} className="grid gap-3 px-5 py-3 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto]">
          <Squelette className="h-4 w-16" />
          <div className="space-y-2"><Squelette className="h-4 w-3/4" /><Squelette className="h-3 w-1/3" /></div>
          <Squelette className="h-5 w-20" />
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ Activité horaire (24 barres empilées) */

function ActiviteHoraire({ points, reference }: { points: StatistiquesAudit["activite24h"]; reference: string }) {
  const parHeure = new Map(points.map((p) => [p.heure, p]));
  const fin = new Date(reference).getTime();
  const heures = Array.from({ length: 24 }, (_, k) => {
    const cle = new Date(fin - (23 - k) * 3600_000).toISOString().slice(0, 13) + ":00";
    const p = parHeure.get(cle);
    return { cle, accordes: p?.accordes ?? 0, refus: p?.refus ?? 0 };
  });
  const max = Math.max(1, ...heures.map((h) => h.accordes + h.refus));
  const libelle = (cle: string) => new Date(`${cle}:00Z`).toLocaleTimeString("fr-FR", { hour: "2-digit", timeZone: TZ }).replace(/\s?h$/, "") + " h";
  const totalRefus = heures.reduce((s, h) => s + h.refus, 0);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--series-1)]" aria-hidden />Accordés</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-critical" aria-hidden />Refusés ({entier(totalRefus)})</span>
      </div>
      <div className="flex h-44 items-end gap-[3px]" role="img" aria-label={`Décisions par heure sur 24 h : ${heures.map((h) => `${libelle(h.cle)} ${h.accordes} accordées, ${h.refus} refusées`).join(" ; ")}`}>
        {heures.map((h, i) => {
          const hauteur = ((h.accordes + h.refus) / max) * 100;
          const partRefus = h.accordes + h.refus ? (h.refus / (h.accordes + h.refus)) * 100 : 0;
          return (
            <div key={h.cle} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={`${libelle(h.cle)} · ${entier(h.accordes)} accordées · ${entier(h.refus)} refusées`}>
              <motion.div
                className="flex w-full flex-col overflow-hidden rounded-t-[3px] bg-[var(--series-1)] transition-[height] duration-500 group-hover:opacity-80"
                style={{ originY: 1, height: `${Math.max(h.accordes + h.refus ? 2 : 0, hauteur)}%` }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.7, ease: EASE, delay: i * 0.02 }}
              >
                {h.refus > 0 && <span className="block w-full bg-critical" style={{ height: `${Math.max(8, partRefus)}%` }} />}
              </motion.div>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] tabular text-ink-muted">
        {[0, 6, 12, 18, 23].map((k) => <span key={k}>{libelle(heures[k]!.cle)}</span>)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Preuve de traçabilité */

function PreuveTracabilite() {
  const client = useQueryClient();
  const essai = useMutation({
    mutationFn: async (): Promise<DecisionAcces | null> => {
      try {
        await lire("/apprenants/APP-000005?finalite=audit");
        return null;
      } catch (e) {
        if (e instanceof ErreurApi && e.refus) return (e.details as { decision?: DecisionAcces } | null)?.decision ?? null;
        throw e;
      }
    },
    onSuccess: (d) => {
      notifier({ ton: "info", titre: "Refus inscrit au journal", texte: "La ligne apparaît en tête du journal détaillé." });
      if (!d) notifier({ ton: "avertissement", titre: "Accès accordé", texte: "Décision inattendue pour ce rôle : vérifiez les habilitations." });
      void client.invalidateQueries({ queryKey: ["gouvernance", "audit"] });
    },
  });
  return (
    <Card className="min-w-0">
      <CardHeader icon={Fingerprint} title="Vérifier la traçabilité" subtitle="Le refus est journalisé au même titre que l'accord." />
      <p className="text-sm text-ink-2">
        Chaque demande est jugée sur quatre critères : <strong className="text-ink">rôle</strong>, <strong className="text-ink">périmètre</strong>, <strong className="text-ink">relation</strong> et <strong className="text-ink">finalité</strong>.
        Votre rôle contrôle les accès sans en posséder : tentez d'ouvrir un dossier d'apprenant, le serveur refusera et l'inscrira ici.
      </p>
      <Button className="mt-4 w-full sm:w-auto" variante="secondaire" icone={Lock} chargement={essai.isPending} onClick={() => essai.mutate()}>
        Tenter d'ouvrir un dossier
      </Button>
      <AnimatePresence>
        {essai.data && (
          <motion.div key="decision" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4">
            <DecisionAccesCarte decision={essai.data} className="[&_ul]:grid-cols-1" />
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

/* ------------------------------------------------------------------ Colonne de synthèse */

function RefusParCritere({ stats }: { stats?: StatistiquesAudit }) {
  const lignes = stats?.refusParCritere ?? [];
  const max = Math.max(1, ...lignes.map((l) => l.n));
  const total = lignes.reduce((s, l) => s + l.n, 0);
  return (
    <Card className="min-w-0">
      <CardHeader icon={ShieldX} title="Refus par critère manquant" subtitle={stats ? `${entier(total)} refus sur 30 jours` : "30 derniers jours"} />
      {!stats ? <div className="space-y-3">{[0, 1, 2].map((i) => <Squelette key={i} className="h-8 w-full" />)}</div> : lignes.length === 0 ? (
        <p className="rounded-md bg-success-bg px-3 py-3 text-sm text-success">Aucun refus sur la période.</p>
      ) : (
        <ul className="space-y-3">
          {lignes.map((l, i) => (
            <li key={l.critere}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-ink">{CRITERE_LIBELLE[l.critere]}</span>
                <span className="text-sm font-semibold tabular text-ink">{entier(l.n)}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <motion.div className="h-full rounded-full bg-critical/80" initial={{ width: 0 }} animate={{ width: `${(l.n / max) * 100}%` }} transition={{ duration: 0.7, ease: EASE, delay: i * 0.06 }} />
              </div>
              <p className="mt-1 text-xs text-ink-muted">{CRITERE_AIDE[l.critere]}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ParFinalite({ stats }: { stats?: StatistiquesAudit }) {
  const lignes = stats?.parFinalite ?? [];
  return (
    <Card className="min-w-0 overflow-hidden p-0">
      <div className="px-5 pt-5"><CardHeader icon={ScrollText} title="Par finalité déclarée" subtitle="30 derniers jours" className="mb-3" /></div>
      {!stats ? <div className="space-y-2 px-5 pb-5">{[0, 1, 2, 3].map((i) => <Squelette key={i} className="h-6 w-full" />)}</div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr><th scope="col" className="px-5 py-2 font-semibold">Finalité</th><th scope="col" className="px-3 py-2 text-right font-semibold">Total</th><th scope="col" className="px-5 py-2 text-right font-semibold">Refus</th></tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.finalite} className="border-t border-line/60">
                  <td className="px-5 py-2 text-ink-2">{FINALITE_LIBELLE[l.finalite] ?? l.finalite}</td>
                  <td className="px-3 py-2 text-right text-ink">{entier(l.total)}</td>
                  <td className={cn("px-5 py-2 text-right", l.refus ? "font-semibold text-critical" : "text-ink-muted")}>{entier(l.refus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ActeursRefuses({ stats }: { stats?: StatistiquesAudit }) {
  const lignes = stats?.acteursLesPlusRefuses ?? [];
  return (
    <Card className="min-w-0">
      <CardHeader icon={UserRoundX} title="Comptes les plus souvent refusés" subtitle="À examiner : habilitation mal calibrée ou tentative d'accès indue" />
      {!stats ? <Squelette className="h-24 w-full" /> : lignes.length === 0 ? <p className="text-sm text-ink-muted">Aucun refus sur 30 jours.</p> : (
        <ul className="divide-y divide-line/60">
          {lignes.map((a) => (
            <li key={a.profilId} className="flex items-center gap-3 py-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-critical" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{a.profilNom}</span>
              <span className="shrink-0 text-xs font-semibold tabular text-critical">{entier(a.refus)} refus</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ Export */

function exporterCsv(lignes: LigneJournal[]) {
  const champ = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const entete = ["horodatage", "identifiant", "profil", "action", "ressource", "finalite", "decision", "critere_manquant"];
  const corps = lignes.map((l) => [l.horodatage, l.id, l.profilNom, l.action, l.ressource, l.finalite, l.autorise ? "accorde" : "refuse", l.critereManquant ?? ""].map(champ).join(";"));
  const blob = new Blob(["﻿" + [entete.join(";"), ...corps].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `journal-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  notifier({ ton: "succes", titre: "Export prêt", texte: `${entier(lignes.length)} ligne(s) exportée(s).` });
}
