"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, BellRing, CheckCircle2, ChevronRight, Clock, Gauge, School, Send, TriangleAlert, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BadgeConfiance, TuileIndicateur, tonConfiance } from "@/components/ui/donnees";
import { Badge, Button, Card, CardHeader, Etiquette, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { nomCommune, useCouches } from "@/lib/donnees";
import { dateLongue, entier, nombre, pourcent } from "@/lib/format";
import { ANNEE_COURANTE, type CommuneStats, type EtablissementGenere } from "@beile/simulation/macro";
import { DATE_SIMULEE } from "@beile/simulation/micro";
import { confiance } from "@beile/simulation/semantique";
import { DEPARTEMENTS } from "@beile/simulation/territoire";

/** Seuil sous lequel la complétude d'un territoire déclenche un avertissement. */
const SEUIL_ALERTE = 80;

interface LigneQualite {
  id: string;
  nom: string;
  attendus: number;
  transmis: number;
  completude: number;
  fraicheur: number;
  confiance: ReturnType<typeof confiance>;
  manquants: EtablissementGenere[];
}

type Colonne = "nom" | "completude" | "fraicheur" | "confiance" | "manquants";
type Tri = { colonne: Colonne; sens: "asc" | "desc" };

function ligne(id: string, nom: string, stats: CommuneStats[], etabs: EtablissementGenere[]): LigneQualite {
  const transmis = etabs.filter((e) => e.transmis).length;
  return {
    id, nom,
    attendus: etabs.length,
    transmis,
    completude: etabs.length ? (transmis / etabs.length) * 100 : 0,
    fraicheur: stats.length ? stats.reduce((s, c) => s + c.annees[ANNEE_COURANTE].fraicheurJours, 0) / stats.length : 0,
    confiance: confiance(stats, ANNEE_COURANTE),
    manquants: etabs.filter((e) => !e.transmis),
  };
}

function trier(lignes: LigneQualite[], tri: Tri) {
  const v = (l: LigneQualite) =>
    tri.colonne === "nom" ? l.nom : tri.colonne === "completude" ? l.completude : tri.colonne === "fraicheur" ? l.fraicheur : tri.colonne === "confiance" ? l.confiance.score : l.manquants.length;
  return [...lignes].sort((a, b) => {
    const x = v(a), y = v(b);
    const r = typeof x === "string" ? x.localeCompare(y as string, "fr") : x - (y as number);
    return tri.sens === "asc" ? r : -r;
  });
}

export default function QualitePage() {
  const couches = useCouches();
  const [triDep, setTriDep] = useState<Tri>({ colonne: "completude", sens: "asc" });
  const [triCom, setTriCom] = useState<Tri>({ colonne: "completude", sens: "asc" });
  const [depSel, setDepSel] = useState<string>("alibori");
  const [relances, setRelances] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  const { departements, communesParDep, national } = useMemo(() => {
    const stats = [...couches.communes.values()];
    const deps = DEPARTEMENTS.map((d) => {
      const s = stats.filter((c) => c.departementId === d.id);
      return ligne(d.id, d.nom, s, s.flatMap((c) => couches.etablissementsParCommune.get(c.communeId) ?? []));
    });
    const parDep = new Map<string, LigneQualite[]>();
    for (const d of DEPARTEMENTS) {
      parDep.set(d.id, stats.filter((c) => c.departementId === d.id).map((c) => ligne(c.communeId, nomCommune(c.communeId), [c], couches.etablissementsParCommune.get(c.communeId) ?? [])));
    }
    return { departements: deps, communesParDep: parDep, national: ligne("national", "National", stats, couches.etablissements) };
  }, [couches]);

  const alertes = departements.filter((d) => d.completude < SEUIL_ALERTE).sort((a, b) => a.completude - b.completude);
  const dep = departements.find((d) => d.id === depSel) ?? departements[0]!;
  const communes = trier(communesParDep.get(dep.id) ?? [], triCom);
  const manquantsDep = dep.manquants;
  const restantsDep = manquantsDep.filter((e) => !relances.has(e.id));

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const relancer = (etabs: EtablissementGenere[], territoire: string) => {
    const nouveaux = etabs.filter((e) => !relances.has(e.id));
    if (!nouveaux.length) return;
    setRelances((r) => new Set([...r, ...nouveaux.map((e) => e.id)]));
    setToast(`${nouveaux.length} établissement${nouveaux.length > 1 ? "s" : ""} relancé${nouveaux.length > 1 ? "s" : ""} (${territoire}). Rappel envoyé au chef d'établissement et à l'inspection — envoi simulé.`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        surtitre={`Données · P13 · année ${ANNEE_COURANTE}`}
        titre="Qualité des données"
        sousTitre="Qui a transmis, depuis quand, et avec quel degré de confiance. Un indicateur calculé sur des données incomplètes est publié avec un indice de confiance réduit, jamais présenté comme complet."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TuileIndicateur libelle="Complétude nationale" icone={School} accent="bleu" valeur={nombre(national.completude, 1)} unite="%" indice={`${entier(national.transmis)} établissements sur ${entier(national.attendus)}`} />
        <TuileIndicateur libelle="N'ont pas transmis" icone={TriangleAlert} accent="critique" valeur={entier(national.manquants.length)} indice={`${relances.size ? `${entier(relances.size)} relancés pendant la séance` : "établissements à relancer"}`} />
        <TuileIndicateur libelle="Fraîcheur moyenne" icone={Clock} accent="ambre" valeur={nombre(national.fraicheur, 1)} unite="jours" indice="depuis la dernière transmission" />
        <TuileIndicateur libelle="Indice de confiance" icone={Gauge} accent="sarcelle" valeur={national.confiance.score} unite="%" confiance={national.confiance} />
      </div>

      {alertes.map((a) => (
        <div key={a.id} role="alert" className="flex flex-col gap-4 rounded-xl border border-warning/30 bg-warning-bg p-5 shadow-float sm:flex-row sm:items-center">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface text-warning shadow-soft">
            <TriangleAlert size={19} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[16px] font-bold text-ink">
              Attention, seulement {nombre(a.completude, 0)} % des établissements ont transmis · {a.nom}
            </p>
            <p className="mt-1 text-[13.5px] text-ink-2">
              {entier(a.manquants.length)} établissements sur {entier(a.attendus)} n'ont pas envoyé leurs données {ANNEE_COURANTE}, et les dernières
              transmissions datent en moyenne de {nombre(a.fraicheur, 0)} jours. Les chiffres de ce département sont publiés avec un indice de confiance de {a.confiance.score} %.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variante="secondaire" taille="sm" onClick={() => setDepSel(a.id)} icone={ChevronRight}>Voir les communes</Button>
            <Button taille="sm" icone={BellRing} disabled={a.manquants.every((e) => relances.has(e.id))} onClick={() => relancer(a.manquants, a.nom)}>
              {a.manquants.every((e) => relances.has(e.id)) ? "Relance envoyée" : "Relancer les établissements"}
            </Button>
          </div>
        </div>
      ))}

      <Card className="p-0">
        <div className="border-b border-line/60 px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">Par département</h2>
          <p className="text-[12.5px] text-ink-muted">Cliquez sur un département pour descendre à la commune. Colonnes triables.</p>
        </div>
        <TableQualite lignes={trier(departements, triDep)} tri={triDep} onTri={setTriDep} selection={dep.id} onSelect={setDepSel} premiereColonne="Département" />
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 px-5 py-4">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-ink">Communes · {dep.nom}</h2>
              <p className="text-[12.5px] text-ink-muted">{communes.length} communes · complétude {pourcent(dep.completude, 0)}</p>
            </div>
            <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
              <span className="font-semibold">Département</span>
              <select value={dep.id} onChange={(e) => setDepSel(e.target.value)} className="h-9 rounded-sm border border-line bg-surface px-2.5 text-[13px] text-ink">
                {departements.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
              </select>
            </label>
          </div>
          <TableQualite lignes={communes} tri={triCom} onTri={setTriCom} premiereColonne="Commune" />
        </Card>

        <Card>
          <CardHeader
            icon={Send}
            title="Établissements n'ayant pas transmis"
            subtitle={`${dep.nom} · ${entier(manquantsDep.length)} établissement${manquantsDep.length > 1 ? "s" : ""}`}
            action={restantsDep.length ? <Button taille="sm" icone={BellRing} onClick={() => relancer(restantsDep, dep.nom)}>Tout relancer</Button> : undefined}
          />
          {manquantsDep.length ? (
            <ul className="max-h-[440px] space-y-1.5 overflow-y-auto pr-1">
              {manquantsDep.map((e) => {
                const fait = relances.has(e.id);
                return (
                  <li key={e.id} className="flex items-center gap-3 rounded-md bg-surface-2/70 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">{e.nom}</span>
                      <span className="block truncate text-[11.5px] text-ink-muted"><span className="font-mono">{e.id}</span> · {nomCommune(e.communeId)} · {e.cycle}</span>
                    </span>
                    {fait ? (
                      <Badge ton="succes" icone={CheckCircle2}>Relancé</Badge>
                    ) : (
                      <button onClick={() => relancer([e], e.nom)} className="shrink-0 rounded-sm px-2 py-1 text-[12px] font-semibold text-blue hover:bg-blue-soft">Relancer</button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-md bg-success-bg px-3 py-4 text-center text-[13px] text-success">Tous les établissements de ce département ont transmis.</p>
          )}
          <p className="mt-3 text-[11.5px] text-ink-muted">Relance simulée : aucun message réel n'est envoyé. L'indice remontera à la prochaine transmission.</p>
        </Card>
      </div>

      <Card>
        <CardHeader icon={Gauge} title="Comment se calcule l'indice de confiance" subtitle="Indicateur de qualité documentaire et technique, pas une vérité mathématique." />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
        <p className="mt-3 text-[12px] text-ink-muted">Situation au {dateLongue(DATE_SIMULEE)}. Données entièrement simulées.</p>
      </Card>

      {toast && (
        <div role="status" aria-live="polite" className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md animate-slide-up items-start gap-3 rounded-lg border border-line/70 bg-surface p-4 shadow-pop sm:inset-x-auto sm:right-6">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" aria-hidden />
          <p className="flex-1 text-[13px] text-ink">{toast}</p>
          <button onClick={() => setToast(null)} aria-label="Fermer la notification" className="rounded-sm p-1 text-ink-muted hover:bg-surface-2"><X size={14} /></button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Tableau triable */

function TableQualite({ lignes, tri, onTri, selection, onSelect, premiereColonne }: {
  lignes: LigneQualite[]; tri: Tri; onTri: (t: Tri) => void; selection?: string; onSelect?: (id: string) => void; premiereColonne: string;
}) {
  const entetes: { col: Colonne; libelle: string; className?: string }[] = [
    { col: "nom", libelle: premiereColonne },
    { col: "completude", libelle: "Complétude" },
    { col: "fraicheur", libelle: "Fraîcheur", className: "hidden sm:table-cell" },
    { col: "confiance", libelle: "Confiance" },
    { col: "manquants", libelle: "Non transmis", className: "hidden md:table-cell" },
  ];
  const basculer = (col: Colonne) => onTri({ colonne: col, sens: tri.colonne === col && tri.sens === "asc" ? "desc" : "asc" });
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead className="bg-surface-2 text-left text-[11px] uppercase tracking-wide text-ink-muted">
          <tr>
            {entetes.map((e) => {
              const actif = tri.colonne === e.col;
              const Icone = actif ? (tri.sens === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
              return (
                <th key={e.col} scope="col" aria-sort={actif ? (tri.sens === "asc" ? "ascending" : "descending") : "none"} className={cn("whitespace-nowrap px-4 py-2 font-semibold", e.className)}>
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
            const alerte = l.completude < SEUIL_ALERTE;
            const choisi = selection === l.id;
            return (
              <tr
                key={l.id}
                className={cn("animate-row border-t border-line/60", onSelect && "cursor-pointer hover:bg-surface-2/60", choisi && "bg-blue-soft/60")}
                style={{ animationDelay: `${Math.min(i, 20) * 20}ms` }}
                onClick={onSelect ? () => onSelect(l.id) : undefined}
              >
                <td className="px-4 py-2.5">
                  {onSelect ? (
                    <button onClick={(ev) => { ev.stopPropagation(); onSelect(l.id); }} aria-pressed={choisi} className="text-left font-medium text-ink hover:underline">{l.nom}</button>
                  ) : <span className="font-medium text-ink">{l.nom}</span>}
                  {alerte && <span className="ml-2 inline-flex align-middle"><Badge ton="avertissement" icone={TriangleAlert}>Incomplet</Badge></span>}
                </td>
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-2.5">
                    <span className="hidden h-2 w-20 overflow-hidden rounded-full bg-surface-2 sm:block" aria-hidden>
                      <span className={cn("block h-full rounded-full", tonConfiance(l.completude) === "succes" ? "bg-success" : tonConfiance(l.completude) === "avertissement" ? "bg-warning" : "bg-critical")} style={{ width: `${l.completude}%` }} />
                    </span>
                    <span className="whitespace-nowrap font-semibold tabular text-ink">{pourcent(l.completude, 0)}</span>
                    <span className={cn("hidden whitespace-nowrap text-[11.5px] tabular text-ink-muted", selection !== undefined ? "lg:inline" : "2xl:inline")}>{entier(l.transmis)}/{entier(l.attendus)}</span>
                  </span>
                </td>
                <td className="hidden whitespace-nowrap px-4 py-2.5 tabular text-ink-2 sm:table-cell">
                  {l.fraicheur < 1 ? "moins d'un jour" : `${nombre(l.fraicheur, l.fraicheur < 10 ? 1 : 0)} j`}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5" onClick={(ev) => ev.stopPropagation()}><BadgeConfiance confiance={l.confiance} /></td>
                <td className="hidden px-4 py-2.5 tabular md:table-cell">
                  <span className={cn(l.manquants.length ? "font-semibold text-ink" : "text-ink-muted")}>{entier(l.manquants.length)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
