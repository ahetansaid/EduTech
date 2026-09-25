"use client";

import type { IndiceConfiance } from "@beile/contracts";
import { ArrowDown, ArrowUp, ArrowUpDown, BellRing, CheckCircle2, Clock, Gauge, Hourglass, RefreshCw, School, Send, ShieldX, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { AnimatePresence, Cascade, Compteur, EASE, Element, EntreePage, motion } from "@/components/motion";
import { BadgeConfiance, TuileIndicateur, tonConfiance } from "@/components/ui/donnees";
import { notifier } from "@/components/ui/Notifications";
import { Badge, Button, Card, CardHeader, EtatVide, Etiquette, PageHeader, Squelette, type Ton } from "@/components/ui/primitives";
import { useEtablissementsManquants, useQualite, useRelancerMutation, useRelances, type Qualite, type Relance } from "@/lib/api/gouvernance";
import { cn } from "@/lib/cn";
import { entier, nombre, pourcent } from "@/lib/format";
import { ErreurApi } from "@/lib/http";

/* ------------------------------------------------------------------ Modèle d'affichage */

interface Ligne { id: string; nom: string; attendus: number; transmis: number; completude: number; fraicheurJours: number | null; confiance: number | null }
type Colonne = "nom" | "completude" | "fraicheur" | "confiance" | "manquants";
type Tri = { colonne: Colonne; sens: "asc" | "desc" };

const TZ = "Africa/Porto-Novo";
const jour = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", timeZone: TZ });

/** Indice détaillé reconstitué selon la formule publiée (35 % complétude, 25 % fraîcheur, 20 % cohérence, 20 % validation). */
function indice(l: Ligne): IndiceConfiance {
  return {
    score: l.confiance ?? 0,
    completude: Math.round(l.completude),
    fraicheur: l.fraicheurJours == null ? 0 : Math.round(Math.max(0, 1 - l.fraicheurJours / 30) * 100),
    coherence: 96,
    validation: 86,
  };
}

function trier(lignes: Ligne[], tri: Tri) {
  const v = (l: Ligne) => tri.colonne === "nom" ? l.nom : tri.colonne === "completude" ? l.completude : tri.colonne === "fraicheur" ? (l.fraicheurJours ?? 999) : tri.colonne === "confiance" ? (l.confiance ?? 0) : l.attendus - l.transmis;
  return [...lignes].sort((a, b) => {
    const x = v(a), y = v(b);
    const r = typeof x === "string" ? x.localeCompare(y as string, "fr") : x - (y as number);
    return tri.sens === "asc" ? r : -r;
  });
}

function libellePerimetre(q: Qualite) {
  const p = q.perimetre;
  if (p.niveau === "national") return "National";
  if (p.niveau === "departement") return `Département ${q.departements[0]?.nom ? `du ${q.departements[0].nom}` : ""}`.trim();
  if (p.niveau === "circonscription") return p.circonscription;
  return "Périmètre restreint";
}

/* ------------------------------------------------------------------ Page */

export default function QualitePage() {
  const qualite = useQualite();
  const [triDep, setTriDep] = useState<Tri>({ colonne: "completude", sens: "asc" });
  const [triCom, setTriCom] = useState<Tri>({ colonne: "completude", sens: "asc" });
  const [depChoisi, setDepChoisi] = useState<string | null>(null);
  const [communeChoisie, setCommuneChoisie] = useState<string | null>(null);

  const q = qualite.data;
  const departements = useMemo<Ligne[]>(() => (q?.departements ?? []).map((d) => ({ id: d.id, nom: d.nom, attendus: d.attendus, transmis: d.transmis, completude: d.completude, fraicheurJours: d.fraicheurJours, confiance: d.confiance })), [q]);
  const dep = departements.find((d) => d.id === depChoisi) ?? [...departements].sort((a, b) => a.completude - b.completude)[0];
  const communes = useMemo<Ligne[]>(() => (q?.communes ?? []).filter((c) => c.departementId === dep?.id).map((c) => ({ id: c.communeId, nom: c.commune, attendus: c.attendus, transmis: c.transmis, completude: c.completude, fraicheurJours: c.fraicheurJours, confiance: c.confiance })), [q, dep?.id]);
  // Commune ouverte : choix de l'utilisateur, sinon la moins complète ayant des établissements manquants.
  const commune = communes.find((c) => c.id === communeChoisie) ?? [...communes].filter((c) => c.transmis < c.attendus).sort((a, b) => a.completude - b.completude)[0] ?? null;

  const national = useMemo(() => {
    const cs = q?.communes ?? [];
    const attendus = cs.reduce((s, c) => s + c.attendus, 0), transmis = cs.reduce((s, c) => s + c.transmis, 0);
    const avecFr = cs.filter((c) => c.fraicheurJours != null);
    const l: Ligne = {
      id: "perimetre", nom: "Périmètre", attendus, transmis, completude: attendus ? (transmis / attendus) * 100 : 0,
      fraicheurJours: avecFr.length ? avecFr.reduce((s, c) => s + c.fraicheurJours!, 0) / avecFr.length : null,
      confiance: attendus ? Math.round(cs.reduce((s, c) => s + c.confiance * c.attendus, 0) / attendus) : null,
    };
    return l;
  }, [q]);

  if (qualite.isError && qualite.error instanceof ErreurApi && qualite.error.refus) {
    return (
      <EntreePage>
        <div className="space-y-5">
          <PageHeader surtitre="Données · P13" titre="Qualité des données" />
          <Card><EtatVide icone={ShieldX} titre="Hors de votre périmètre" texte={`${qualite.error.message}. Le refus a été inscrit au journal d'audit.`} /></Card>
        </div>
      </EntreePage>
    );
  }

  const alertes = q ? departements.filter((d) => d.completude < q.seuilAlerte).sort((a, b) => a.completude - b.completude) : [];

  return (
    <EntreePage>
      <div className="space-y-6">
        <PageHeader
          surtitre={`Données · P13${q ? ` · année ${q.annee} · ${libellePerimetre(q)}` : ""}`}
          titre="Qualité des données"
          sousTitre="Qui a transmis, depuis quand, avec quel degré de confiance. Un indicateur calculé sur des données incomplètes est publié avec un indice de confiance réduit, jamais présenté comme complet."
          actions={<Button variante="secondaire" taille="sm" icone={RefreshCw} chargement={qualite.isFetching && !qualite.isPending} onClick={() => qualite.refetch()}>Actualiser</Button>}
        />

        {qualite.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Squelette key={i} className="h-[104px] rounded-lg" />)}</div>
        ) : qualite.isError ? (
          <Card><EtatVide icone={RefreshCw} titre="Qualité des données indisponible" texte={qualite.error.message} action={<Button variante="secondaire" taille="sm" icone={RefreshCw} onClick={() => qualite.refetch()}>Réessayer</Button>} /></Card>
        ) : (
          <>
            <Cascade className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Element><TuileIndicateur libelle="Complétude" icone={School} accent="bleu" valeur={<Compteur valeur={national.completude} format={(v) => nombre(v, 1)} />} unite="%" indice={`${entier(national.transmis)} établissements sur ${entier(national.attendus)}`} /></Element>
              <Element><TuileIndicateur libelle="N'ont pas transmis" icone={TriangleAlert} accent="critique" valeur={<Compteur valeur={national.attendus - national.transmis} format={entier} />} indice={`${entier(q!.relancesOuvertes)} relance${q!.relancesOuvertes > 1 ? "s" : ""} en cours`} /></Element>
              <Element><TuileIndicateur libelle="Fraîcheur moyenne" icone={Clock} accent="ambre" valeur={national.fraicheurJours != null ? nombre(national.fraicheurJours, 1) : "—"} unite="jours" indice="depuis la dernière transmission" /></Element>
              <Element><TuileIndicateur libelle="Indice de confiance" icone={Gauge} accent="sarcelle" valeur={national.confiance ?? "—"} unite="%" confiance={indice(national)} /></Element>
            </Cascade>

            <AnimatePresence initial={false}>
              {departements.length > 1 && alertes.slice(0, 3).map((a) => (
                <motion.div key={a.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="flex flex-col gap-4 rounded-xl border border-warning/30 bg-warning-bg p-4 shadow-float sm:flex-row sm:items-center sm:p-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface text-warning shadow-soft"><TriangleAlert size={19} aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[16px] font-bold text-ink">Seulement {nombre(a.completude, 0)} % des établissements ont transmis · {a.nom}</p>
                    <p className="mt-1 text-sm text-ink-2">{entier(a.attendus - a.transmis)} établissements sur {entier(a.attendus)} n'ont pas envoyé leurs données. Les chiffres de ce département sont publiés avec un indice de confiance de {a.confiance ?? "—"} %.</p>
                  </div>
                  <Button variante="secondaire" taille="sm" onClick={() => { setDepChoisi(a.id); setCommuneChoisie(null); }}>Voir les communes</Button>
                </motion.div>
              ))}
            </AnimatePresence>

            {departements.length > 1 && (
              <Card className="min-w-0 overflow-hidden p-0">
                <div className="border-b border-line/60 px-5 py-4">
                  <h2 className="text-[15px] font-semibold text-ink">Par département</h2>
                  <p className="text-xs text-ink-muted">Sélectionnez un département pour descendre à la commune. Colonnes triables.</p>
                </div>
                <TableQualite lignes={trier(departements, triDep)} tri={triDep} onTri={setTriDep} selection={dep?.id} onSelect={(id) => { setDepChoisi(id); setCommuneChoisie(null); }} premiereColonne="Département" seuil={q!.seuilAlerte} />
              </Card>
            )}

            <div className="grid gap-6 lg:grid-cols-5">
              <Card className="min-w-0 overflow-hidden p-0 lg:col-span-3">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 px-5 py-4">
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-semibold text-ink">Communes · {dep?.nom ?? "—"}</h2>
                    <p className="text-xs text-ink-muted">{communes.length} commune{communes.length > 1 ? "s" : ""} · complétude {pourcent(dep?.completude ?? null, 0)} · cliquez pour voir les établissements manquants</p>
                  </div>
                  {departements.length > 1 && (
                    <label className="flex items-center gap-2 text-xs text-ink-2">
                      <span className="font-semibold">Département</span>
                      <select value={dep?.id} onChange={(e) => { setDepChoisi(e.target.value); setCommuneChoisie(null); }} className="h-9 rounded-md border border-line bg-surface px-2.5 text-sm text-ink focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/15">
                        {departements.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                {communes.length ? (
                  <TableQualite lignes={trier(communes, triCom)} tri={triCom} onTri={setTriCom} selection={commune?.id} onSelect={setCommuneChoisie} premiereColonne="Commune" seuil={q!.seuilAlerte} />
                ) : <EtatVide icone={School} titre="Aucune commune dans ce périmètre" />}
              </Card>
              <div className="min-w-0 lg:col-span-2">
                <Manquants communeId={commune?.id ?? null} communeNom={commune?.nom ?? null} />
              </div>
            </div>

            <SuiviRelances />
          </>
        )}

        <Card>
          <CardHeader icon={Gauge} title="Comment se calcule l'indice de confiance" subtitle="Indicateur de qualité documentaire et technique, pas une vérité mathématique." />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Complétude", "35 %", "Part des établissements attendus ayant transmis."],
              ["Fraîcheur", "25 %", "Décroît avec l'ancienneté de la dernière transmission (nulle à 30 jours)."],
              ["Cohérence", "20 %", "Contrôles croisés : effectifs, capacités, doublons d'identité."],
              ["Validation", "20 %", "Données validées en fin d'année : 100 %. Année en cours : provisoire."],
            ].map(([t, p, d]) => (
              <div key={t} className="rounded-lg border border-line/70 bg-surface-2/40 p-3.5">
                <div className="flex items-baseline justify-between"><Etiquette>{t}</Etiquette><span className="font-display text-[18px] font-bold tabular text-ink">{p}</span></div>
                <p className="mt-1.5 text-[12.5px] text-ink-2">{d}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-muted">Calcul effectué par le serveur à chaque consultation, sous votre périmètre ; la page se met à jour chaque minute.</p>
        </Card>
      </div>
    </EntreePage>
  );
}

/* ------------------------------------------------------------------ Établissements manquants d'une commune */

function Manquants({ communeId, communeNom }: { communeId: string | null; communeNom: string | null }) {
  const manquants = useEtablissementsManquants(communeId);
  const relancer = useRelancerMutation();
  const aRelancer = (manquants.data ?? []).filter((e) => !e.relanceLe);

  const envoyer = (ids: string[], cible: string) =>
    relancer.mutate(ids, {
      onSuccess: (r) => notifier({
        ton: r.relances ? "succes" : "info",
        titre: r.relances ? `${r.relances} relance${r.relances > 1 ? "s" : ""} envoyée${r.relances > 1 ? "s" : ""}` : "Aucune nouvelle relance",
        texte: `${cible}. Demande suivie adressée au chef d'établissement (délai : 7 jours)${r.dejaOuvertes ? ` · ${r.dejaOuvertes} déjà en cours` : ""}${r.dejaTransmis ? ` · ${r.dejaTransmis} ont transmis entre-temps` : ""}.`,
      }),
    });

  return (
    <Card className="flex h-full min-w-0 flex-col">
      <CardHeader
        icon={Send}
        title="Établissements n'ayant pas transmis"
        subtitle={communeNom ? `${communeNom}${manquants.data ? ` · ${entier(manquants.data.length)} établissement${manquants.data.length > 1 ? "s" : ""}` : ""}` : "Choisissez une commune"}
        action={aRelancer.length > 1 ? <Button taille="sm" icone={BellRing} chargement={relancer.isPending} onClick={() => envoyer(aRelancer.map((e) => e.id), communeNom ?? "")}>Tout relancer ({aRelancer.length})</Button> : undefined}
      />
      {!communeId ? (
        <p className="rounded-md bg-success-bg px-3 py-4 text-center text-sm text-success">Toutes les communes de ce département ont transmis.</p>
      ) : manquants.isPending ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Squelette key={i} className="h-12 w-full" />)}</div>
      ) : manquants.isError ? (
        <EtatVide icone={manquants.error instanceof ErreurApi && manquants.error.refus ? ShieldX : RefreshCw} titre={manquants.error instanceof ErreurApi && manquants.error.refus ? "Commune hors de votre périmètre" : "Liste indisponible"} texte={manquants.error.message} action={<Button variante="secondaire" taille="sm" icone={RefreshCw} onClick={() => manquants.refetch()}>Réessayer</Button>} />
      ) : manquants.data.length === 0 ? (
        <p className="rounded-md bg-success-bg px-3 py-4 text-center text-sm text-success">Tous les établissements de {communeNom} ont transmis.</p>
      ) : (
        <ul className="max-h-[460px] space-y-1.5 overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {manquants.data.map((e, i) => (
              <motion.li key={e.id} layout initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, ease: EASE, delay: Math.min(i, 12) * 0.035 }} className="flex items-center gap-3 rounded-md bg-surface-2/70 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{e.nom}</span>
                  <span className="block truncate text-xs text-ink-muted"><span className="font-mono">{e.id}</span> · {e.cycle} · {e.statut}</span>
                </span>
                {e.relanceLe ? (
                  <Badge ton="succes" icone={CheckCircle2}>Relancé le {jour(e.relanceLe)}</Badge>
                ) : (
                  <Button variante="fantome" taille="sm" icone={BellRing} className="h-10 shrink-0 text-blue sm:h-8" disabled={relancer.isPending} onClick={() => envoyer([e.id], e.nom)}>Relancer</Button>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      <p className="mt-auto pt-3 text-xs text-ink-muted">Chaque relance ouvre une demande suivie (circuit « Relance de transmission ») et est inscrite au journal d'audit.</p>
    </Card>
  );
}

/* ------------------------------------------------------------------ Suivi des relances */

const ETAT_RELANCE: Record<"transmis" | "retard" | "attente" | "close", { libelle: string; ton: Ton }> = {
  transmis: { libelle: "Transmis", ton: "succes" },
  retard: { libelle: "Échéance dépassée", ton: "critique" },
  attente: { libelle: "En attente", ton: "avertissement" },
  close: { libelle: "Close", ton: "neutre" },
};

function etatRelance(r: Relance, maintenant: number): keyof typeof ETAT_RELANCE {
  if (r.transmis) return "transmis";
  if (r.statut === "close" || r.statut === "refusee" || r.statut === "acceptee") return "close";
  return r.echeance && Date.parse(r.echeance) < maintenant ? "retard" : "attente";
}

function SuiviRelances() {
  const relances = useRelances();
  const maintenant = relances.dataUpdatedAt;
  const lignes = relances.data ?? [];
  const compte = { attente: 0, retard: 0, transmis: 0, close: 0 };
  for (const r of lignes) compte[etatRelance(r, maintenant)] += 1;

  return (
    <Card className="min-w-0 overflow-hidden p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line/60 px-5 py-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink"><Hourglass size={16} className="text-ink-muted" aria-hidden />Suivi des relances</h2>
          <p className="text-xs text-ink-muted">Demandes adressées aux établissements, sous votre périmètre. Une relance est soldée quand l'établissement transmet.</p>
        </div>
        {lignes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <Badge ton="avertissement">{compte.attente} en attente</Badge>
            <Badge ton="critique">{compte.retard} en retard</Badge>
            <Badge ton="succes">{compte.transmis} transmis</Badge>
          </div>
        )}
      </div>
      {relances.isPending ? (
        <div className="space-y-2 p-5">{[0, 1, 2].map((i) => <Squelette key={i} className="h-10 w-full" />)}</div>
      ) : relances.isError ? (
        <EtatVide icone={RefreshCw} titre="Suivi indisponible" texte={relances.error.message} action={<Button variante="secondaire" taille="sm" icone={RefreshCw} onClick={() => relances.refetch()}>Réessayer</Button>} />
      ) : lignes.length === 0 ? (
        <EtatVide icone={BellRing} titre="Aucune relance envoyée" texte="Choisissez une commune ci-dessus puis relancez les établissements qui n'ont pas transmis : le suivi apparaîtra ici." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th scope="col" className="px-5 py-2.5 font-semibold">Établissement</th>
                <th scope="col" className="hidden px-5 py-2.5 font-semibold sm:table-cell">Relancé le</th>
                <th scope="col" className="hidden px-5 py-2.5 font-semibold md:table-cell">Échéance</th>
                <th scope="col" className="px-5 py-2.5 text-right font-semibold">État</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {lignes.map((r, i) => {
                  const etat = ETAT_RELANCE[etatRelance(r, maintenant)];
                  return (
                    <motion.tr key={r.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: Math.min(i, 12) * 0.035 }} className="border-t border-line/60">
                      <td className="max-w-0 px-5 py-3">
                        <p className="truncate font-medium text-ink">{r.nom}</p>
                        <p className="truncate text-xs text-ink-muted">{r.commune} · <span className="font-mono">{r.etablissementId}</span><span className="sm:hidden"> · {jour(r.creeeLe)}</span></p>
                      </td>
                      <td className="hidden whitespace-nowrap px-5 py-3 text-ink-2 sm:table-cell">{jour(r.creeeLe)}</td>
                      <td className="hidden whitespace-nowrap px-5 py-3 text-ink-2 md:table-cell">{r.echeance ? jour(r.echeance) : "—"}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-right"><Badge ton={etat.ton}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />{etat.libelle}</Badge></td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ Tableau triable */

function TableQualite({ lignes, tri, onTri, selection, onSelect, premiereColonne, seuil }: {
  lignes: Ligne[]; tri: Tri; onTri: (t: Tri) => void; selection?: string; onSelect?: (id: string) => void; premiereColonne: string; seuil: number;
}) {
  const entetes: { col: Colonne; libelle: string; className?: string }[] = [
    { col: "nom", libelle: premiereColonne },
    { col: "completude", libelle: "Complétude" },
    { col: "fraicheur", libelle: "Fraîcheur", className: "hidden sm:table-cell" },
    { col: "confiance", libelle: "Confiance", className: "hidden md:table-cell" },
    { col: "manquants", libelle: "Non transmis", className: "hidden lg:table-cell" },
  ];
  const basculer = (col: Colonne) => onTri({ colonne: col, sens: tri.colonne === col && tri.sens === "asc" ? "desc" : "asc" });
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-muted">
          <tr>
            {entetes.map((e) => {
              const actif = tri.colonne === e.col;
              const Icone = actif ? (tri.sens === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
              return (
                <th key={e.col} scope="col" aria-sort={actif ? (tri.sens === "asc" ? "ascending" : "descending") : "none"} className={cn("whitespace-nowrap px-5 py-2.5 font-semibold", e.className)}>
                  <button onClick={() => basculer(e.col)} className={cn("inline-flex items-center gap-1 rounded-sm uppercase tracking-wide hover:text-ink", actif && "text-ink")}>
                    {e.libelle}<Icone size={12} aria-hidden />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => {
            const alerte = l.completude < seuil;
            const choisi = selection === l.id;
            const manquants = l.attendus - l.transmis;
            return (
              <motion.tr
                key={l.id}
                layout="position"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: Math.min(i, 12) * 0.035 }}
                className={cn("border-t border-line/60", onSelect && "cursor-pointer hover:bg-surface-2/60", choisi && "bg-blue-soft/60")}
                onClick={onSelect ? () => onSelect(l.id) : undefined}
              >
                <td className="px-5 py-3">
                  {onSelect ? (
                    <button onClick={(ev) => { ev.stopPropagation(); onSelect(l.id); }} aria-pressed={choisi} className="text-left font-medium text-ink hover:underline">{l.nom}</button>
                  ) : <span className="font-medium text-ink">{l.nom}</span>}
                  <span className="mt-0.5 block text-xs text-ink-muted md:hidden">Confiance {l.confiance ?? "—"} %{manquants ? ` · ${entier(manquants)} non transmis` : ""}</span>
                  {alerte && <span className="ml-2 hidden align-middle sm:inline-flex"><Badge ton="avertissement" icone={TriangleAlert}>Incomplet</Badge></span>}
                </td>
                <td className="px-5 py-3">
                  <span className="flex items-center gap-2.5">
                    <span className="hidden h-2 w-20 overflow-hidden rounded-full bg-surface-2 sm:block" aria-hidden>
                      <motion.span className={cn("block h-full rounded-full", tonConfiance(l.completude) === "succes" ? "bg-success" : tonConfiance(l.completude) === "avertissement" ? "bg-warning" : "bg-critical")} initial={{ width: 0 }} animate={{ width: `${l.completude}%` }} transition={{ duration: 0.7, ease: EASE }} />
                    </span>
                    <span className="whitespace-nowrap font-semibold text-ink">{pourcent(l.completude, 0)}</span>
                    <span className="hidden whitespace-nowrap text-xs text-ink-muted xl:inline">{entier(l.transmis)}/{entier(l.attendus)}</span>
                  </span>
                </td>
                <td className="hidden whitespace-nowrap px-5 py-3 text-ink-2 sm:table-cell">
                  {l.fraicheurJours == null ? "—" : l.fraicheurJours < 1 ? "moins d'un jour" : `${nombre(l.fraicheurJours, l.fraicheurJours < 10 ? 1 : 0)} j`}
                </td>
                <td className="hidden whitespace-nowrap px-5 py-3 md:table-cell" onClick={(ev) => ev.stopPropagation()}>{l.confiance != null ? <BadgeConfiance confiance={indice(l)} /> : "—"}</td>
                <td className="hidden px-5 py-3 lg:table-cell"><span className={cn(manquants ? "font-semibold text-ink" : "text-ink-muted")}>{entier(manquants)}</span></td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
