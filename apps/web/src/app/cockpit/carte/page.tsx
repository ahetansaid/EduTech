"use client";

import type { ResultatIndicateur } from "@beile/contracts";
import {
  ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronRight, Clock, Droplet, GitMerge, GraduationCap, Map as IconeCarte,
  Route, School, TrendingUp, Users, Wifi, X, Zap, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { CarteBenin, COULEUR_ALERTE, type PointCarte } from "@/components/map/CarteBenin";
import { TuileIndicateur } from "@/components/ui/donnees";
import { Badge, Button, Card, CardHeader, EtatVide, PageHeader, Squelette } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { nomCommune, useCouches } from "@/lib/donnees";
import { compact, dateLongue, entier, nombre, pourcent } from "@/lib/format";
import { ANNEE_COURANTE, type EtablissementGenere } from "@beile/simulation/macro";
import { DATE_SIMULEE } from "@beile/simulation/micro";
import { calculer, priorites, type NiveauAlerte } from "@beile/simulation/semantique";
import { COMMUNES, communeById, DEPARTEMENTS, departementById } from "@beile/simulation/territoire";
import { useProfil } from "@/lib/store";

/**
 * « Où agir ? » (processus P3) — descente Bénin → département → commune → établissements.
 * Chaque couleur de la carte est explicable : le niveau d'alerte résulte du nombre de facteurs
 * dépassant leur seuil (couche sémantique, `priorites`).
 */

const NIVEAUX_ALERTE: { niveau: NiveauAlerte; libelle: string; symbole: string }[] = [
  { niveau: "critique", libelle: "Critique", symbole: "◆" },
  { niveau: "attention", libelle: "Attention", symbole: "▲" },
  { niveau: "surveillance", libelle: "Surveillance", symbole: "◐" },
  { niveau: "favorable", libelle: "Situation favorable", symbole: "●" },
];
const ALERTE = Object.fromEntries(NIVEAUX_ALERTE.map((n) => [n.niveau, n])) as Record<NiveauAlerte, (typeof NIVEAUX_ALERTE)[number]>;
const niveauDuScore = (s: number): NiveauAlerte => (s >= 3 ? "critique" : s === 2 ? "attention" : s === 1 ? "surveillance" : "favorable");
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

export default function Page() {
  return (
    <Suspense fallback={<div className="space-y-4"><Squelette className="h-10 w-80" /><Squelette className="h-[480px]" /></div>}>
      <OuAgir />
    </Suspense>
  );
}

function OuAgir() {
  const params = useSearchParams();
  const router = useRouter();
  const couches = useCouches();
  const profil = useProfil();

  // Périmètre de l'habilitation : la direction départementale ne voit que son département.
  const perimetre = profil.habilitations.find((h) => h.role === "administration_centrale" || h.role === "direction_departementale")?.perimetre;
  const depRestreint = perimetre?.niveau === "departement" ? perimetre.departementId : null;

  const communeDemandee = params.get("commune");
  const communeConnue = communeDemandee && communeById.has(communeDemandee) ? communeDemandee : null;
  const horsPerimetre = !!communeConnue && !!depRestreint && communeById.get(communeConnue)!.departementId !== depRestreint;
  const commune = horsPerimetre ? null : communeConnue;

  const [depChoisi, setDepChoisi] = useState<string | null>(null);
  const dep = depRestreint ?? (commune ? communeById.get(commune)!.departementId : depChoisi);

  const prio = useMemo(() => priorites(couches), [couches]);
  const couleurs = useMemo(() => new Map([...prio].map(([id, p]) => [id, COULEUR_ALERTE[p.niveau]])), [prio]);
  const scores = useMemo(() => new Map([...prio].map(([id, p]) => [id, p.score])), [prio]);

  const allerCommune = (id: string | null) => router.replace(id ? `/cockpit/carte?commune=${id}` : "/cockpit/carte", { scroll: false });
  const allerDepartement = (id: string | null) => { setDepChoisi(id); if (commune) allerCommune(null); };

  const onCarte = (id: string) => {
    if (!dep) { allerDepartement(communeById.get(id)?.departementId ?? null); return; }
    allerCommune(commune === id ? null : id);
  };

  const etabs = commune ? couches.etablissementsParCommune.get(commune) ?? [] : [];
  const points: PointCarte[] | undefined = commune
    ? etabs.map((e) => ({ id: e.id, lng: e.lng, lat: e.lat, libelle: e.nom, mis: e.id.includes("-PILOTE-") }))
    : undefined;

  const niveauVue = commune ? "commune" : dep ? "departement" : "national";

  return (
    <div className="space-y-6">
      <PageHeader
        surtitre={`Pilotage territorial · P3 · ${dateLongue(DATE_SIMULEE)}`}
        titre="Où agir ?"
        sousTitre="Zones prioritaires selon cinq facteurs objectivés : croissance des effectifs, occupation, encadrement, absentéisme et résultats. Descendez du pays jusqu'aux établissements."
        actions={commune ? <Link href={`/simulation?commune=${commune}`}><Button variante="secondaire" icone={GitMerge}>Simuler une mesure</Button></Link> : undefined}
      />

      <nav aria-label="Fil de descente" className="flex flex-wrap items-center gap-1 text-[13px]">
        <FilEtape actif={niveauVue === "national"} desactive={!!depRestreint} onClick={() => allerDepartement(null)}>Bénin</FilEtape>
        {dep && (<><ChevronRight size={14} className="text-ink-muted" aria-hidden /><FilEtape actif={niveauVue === "departement"} onClick={() => allerDepartement(dep)}>{departementById.get(dep)?.nom}</FilEtape></>)}
        {commune && (<><ChevronRight size={14} className="text-ink-muted" aria-hidden /><FilEtape actif>{nomCommune(commune)}</FilEtape></>)}
        {depRestreint && <Badge ton="info" className="ml-2">Périmètre : département {departementById.get(depRestreint)?.nom}</Badge>}
      </nav>

      {horsPerimetre && (
        <div role="status" className="rounded-lg border border-critical/30 bg-critical-bg/60 px-4 py-3 text-[13px] text-critical">
          <span className="font-semibold">Commune hors périmètre.</span> {nomCommune(communeConnue!)} ne relève pas du département de votre habilitation : l'accès est refusé. Critère manquant : périmètre.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card className="p-0">
          <div className="border-b border-line/60 px-5 py-4">
            <h2 className="text-[15px] font-semibold text-ink">
              {commune ? `${nomCommune(commune)} et ses établissements` : dep ? `Communes · ${departementById.get(dep)?.nom}` : "Les 77 communes"}
            </h2>
            <p className="text-[12.5px] text-ink-muted">
              {niveauVue === "national" ? "Cliquez sur une zone pour descendre dans son département." : "Cliquez sur une commune pour afficher ses facteurs et ses établissements."}
            </p>
          </div>
          <div className="p-5">
            <CarteBenin
              couleurs={couleurs}
              valeurs={scores}
              formater={(v) => `${ALERTE[niveauDuScore(v)].symbole} ${ALERTE[niveauDuScore(v)].libelle} · ${pluriel(v, "facteur")}`}
              libelleValeur="Niveau"
              focusDepartement={dep ?? undefined}
              selection={commune}
              onSelect={onCarte}
              points={points}
              hauteur={dep ? 460 : 600}
              className="mx-auto w-full max-w-[420px]"
              legende={<LegendeAlertes avecPoints={!!commune} />}
            />
          </div>
        </Card>

        <div className="min-w-0 space-y-6">
          {commune ? (
            <PanneauCommune communeId={commune} prio={prio.get(commune)!} />
          ) : dep ? (
            <PanneauDepartement depId={dep} prio={prio} onCommune={(id) => allerCommune(id)} />
          ) : (
            <PanneauNational prio={prio} onDepartement={(id) => allerDepartement(id)} />
          )}
        </div>
      </div>

      {commune && <SectionEtablissements communeId={commune} etablissements={etabs} />}
    </div>
  );
}

/* ------------------------------------------------------------------ Éléments de navigation */

function FilEtape({ actif, desactive, onClick, children }: { actif?: boolean; desactive?: boolean; onClick?: () => void; children: React.ReactNode }) {
  if (actif || !onClick || desactive) {
    return <span aria-current={actif ? "page" : undefined} className={cn("rounded-sm px-2 py-1", actif ? "font-semibold text-ink" : "text-ink-muted")}>{children}</span>;
  }
  return <button type="button" onClick={onClick} className="rounded-sm px-2 py-1 font-medium text-blue hover:bg-surface-2 hover:underline">{children}</button>;
}

function LegendeAlertes({ avecPoints }: { avecPoints: boolean }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] text-ink-2">
      {NIVEAUX_ALERTE.map((n) => (
        <span key={n.niveau} className="inline-flex items-center gap-1.5">
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[4px] text-[9px] leading-none text-white" style={{ background: COULEUR_ALERTE[n.niveau] }} aria-hidden>{n.symbole}</span>
          {n.libelle}
        </span>
      ))}
      {avecPoints && (
        <>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-ink/40" aria-hidden />Établissement</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-surface bg-amber" aria-hidden />Établissement pilote</span>
        </>
      )}
    </div>
  );
}

function PastilleNiveau({ niveau, className }: { niveau: NiveauAlerte; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-0.5 text-[12px] font-semibold text-white", className)} style={{ background: COULEUR_ALERTE[niveau] }}>
      <span aria-hidden>{ALERTE[niveau].symbole}</span>{ALERTE[niveau].libelle}
    </span>
  );
}

type Priorites = ReturnType<typeof priorites>;

/* ------------------------------------------------------------------ Niveau national */

function PanneauNational({ prio, onDepartement }: { prio: Priorites; onDepartement: (id: string) => void }) {
  const compte = (n: NiveauAlerte) => [...prio.values()].filter((p) => p.niveau === n).length;
  const parDep = DEPARTEMENTS.map((d) => {
    const ids = COMMUNES.filter((c) => c.departementId === d.id).map((c) => c.id);
    const graves = ids.filter((id) => ["critique", "attention"].includes(prio.get(id)!.niveau)).length;
    const critiques = ids.filter((id) => prio.get(id)!.niveau === "critique").length;
    return { ...d, total: ids.length, graves, critiques };
  }).sort((a, b) => b.critiques - a.critiques || b.graves - a.graves || a.nom.localeCompare(b.nom, "fr"));
  const maxGraves = Math.max(1, ...parDep.map((d) => d.graves));

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {NIVEAUX_ALERTE.map((n) => (
          <div key={n.niveau} className="rounded-lg border border-line/70 bg-surface px-4 py-3.5 shadow-float">
            <span className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              <span style={{ color: COULEUR_ALERTE[n.niveau] }} aria-hidden>{n.symbole}</span>{n.niveau === "favorable" ? "Favorable" : n.libelle}
            </span>
            <span className="mt-2 block font-display text-[26px] font-bold leading-none text-ink tabular">{compte(n.niveau)}</span>
            <span className="mt-1 block text-[12px] text-ink-muted">communes</span>
          </div>
        ))}
      </div>
      <Card>
        <CardHeader icon={IconeCarte} title="Départements à examiner en priorité" subtitle="Communes en « Attention » ou « Critique », par département" />
        <ul className="space-y-1">
          {parDep.map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => onDepartement(d.id)} className="grid w-full grid-cols-[minmax(6.5rem,9rem)_1fr_auto] items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-surface-2">
                <span className="truncate text-[13px] font-medium text-ink">{d.nom}</span>
                <span className="relative h-2.5 rounded-full bg-surface-2" aria-hidden>
                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(d.graves / maxGraves) * 100}%`, background: "var(--alert-attention)" }} />
                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(d.critiques / maxGraves) * 100}%`, background: "var(--alert-critique)" }} />
                </span>
                <span className="text-right text-[12px] text-ink-2 tabular">
                  <span className="font-semibold text-ink">{d.graves}</span> / {d.total}
                  {d.critiques > 0 && <span className="ml-1.5 text-critical">({d.critiques} ◆)</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11.5px] leading-snug text-ink-muted">Lecture : communes en attention ou en situation critique sur le total du département ; ◆ = critiques. Un niveau résulte du nombre de facteurs dépassant leur seuil, jamais d'un score opaque.</p>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ Niveau département */

function PanneauDepartement({ depId, prio, onCommune }: { depId: string; prio: Priorites; onCommune: (id: string) => void }) {
  const couches = useCouches();
  const r = useMemo(() => ({
    effectif: calculer(couches, { indicateur: "effectif_apprenants", filtres: { departementId: depId }, ventilation: [] }),
    occupation: calculer(couches, { indicateur: "taux_occupation", filtres: { departementId: depId }, ventilation: [] }),
    ratio: calculer(couches, { indicateur: "ratio_apprenants_enseignant", filtres: { departementId: depId }, ventilation: [] }),
  }), [couches, depId]);
  const communes = COMMUNES.filter((c) => c.departementId === depId)
    .map((c) => ({ ...c, p: prio.get(c.id)! }))
    .sort((a, b) => b.p.score - a.p.score || a.nom.localeCompare(b.nom, "fr"));

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <TuileIndicateur libelle="Apprenants" icone={Users} accent="bleu" valeur={compact(r.effectif.valeur ?? 0)} confiance={r.effectif.confiance} />
        <TuileIndicateur libelle="Occupation" icone={School} accent="ambre" valeur={nombre(r.occupation.valeur, 1)} unite="%" confiance={r.occupation.confiance} />
        <TuileIndicateur libelle="Élèves / enseignant" icone={GraduationCap} accent="sarcelle" valeur={nombre(r.ratio.valeur, 1)} confiance={r.ratio.confiance} />
      </div>
      <Card>
        <CardHeader icon={IconeCarte} title={`${communes.length} communes · ${departementById.get(depId)?.nom}`} subtitle="Classées par nombre de facteurs dépassant leur seuil" />
        <ul className="divide-y divide-line/60">
          {communes.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onCommune(c.id)} className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left hover:bg-surface-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink">{c.nom}</span>
                  <span className="block text-[12px] leading-snug text-ink-muted">{c.p.facteurs.filter((f) => f.grave).map((f) => f.libelle.split(" (")[0]).join(" · ") || "Aucun facteur au-dessus du seuil"}</span>
                </span>
                <PastilleNiveau niveau={c.p.niveau} className="shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ Niveau commune */

function PanneauCommune({ communeId, prio }: { communeId: string; prio: Priorites extends Map<string, infer V> ? V : never }) {
  const couches = useCouches();
  const stats = couches.communes.get(communeId)!;
  const a = stats.annees[ANNEE_COURANTE];
  const r = useMemo(() => {
    const req = (indicateur: "effectif_apprenants" | "taux_occupation" | "ratio_apprenants_enseignant"): ResultatIndicateur =>
      calculer(couches, { indicateur, filtres: { communeId }, ventilation: [] });
    return { effectif: req("effectif_apprenants"), occupation: req("taux_occupation"), ratio: req("ratio_apprenants_enseignant") };
  }, [couches, communeId]);
  const evolutionPop = (stats.projection2030 / a.populationScolarisable - 1) * 100;
  const c = communeById.get(communeId)!;

  return (
    <>
      <Card className="animate-fade-in">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{departementById.get(c.departementId)?.nom} · milieu {c.milieu}</p>
            <p className="font-display text-[22px] font-bold text-ink">{c.nom}</p>
          </div>
          <PastilleNiveau niveau={prio.niveau} className="mt-1" />
        </div>
        <p className="mt-4 text-[12px] font-semibold text-ink-2">Pourquoi ce niveau ? {pluriel(prio.score, "facteur")} au-dessus du seuil</p>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {prio.facteurs.map((f) => (
            <li key={f.libelle} className={cn("flex items-start gap-2 rounded-md px-3 py-2 text-[12.5px]", f.grave ? "bg-critical-bg" : "bg-surface-2")}>
              <span className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white", f.grave ? "bg-critical" : "bg-success")} aria-hidden>
                {f.grave ? <X size={11} /> : <Check size={11} />}
              </span>
              <span className="min-w-0">
                <span className="block text-ink-2">{f.libelle}</span>
                <span className={cn("font-semibold tabular", f.grave ? "text-critical" : "text-ink")}>{f.valeur}</span>
                <span className="sr-only">{f.grave ? " — au-dessus du seuil d'alerte" : " — sous le seuil d'alerte"}</span>
                {f.grave && <span className="ml-1.5 text-[11px] font-medium text-critical">seuil dépassé</span>}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        <TuileIndicateur libelle="Apprenants" icone={Users} accent="bleu" valeur={entier(r.effectif.valeur)} confiance={r.effectif.confiance} />
        <TuileIndicateur libelle="Capacité d'accueil" icone={School} accent="neutre" valeur={entier(a.capacite)} indice={<span>places déclarées, {ANNEE_COURANTE}</span>} />
        <TuileIndicateur libelle="Occupation" icone={School} accent={(r.occupation.valeur ?? 0) > 112 ? "critique" : "ambre"} valeur={nombre(r.occupation.valeur, 1)} unite="%" confiance={r.occupation.confiance} />
        <TuileIndicateur libelle="Élèves / enseignant" icone={GraduationCap} accent="sarcelle" valeur={nombre(r.ratio.valeur, 1)} indice={<span>{entier(a.enseignants)} enseignants</span>} confiance={r.ratio.confiance} />
        <TuileIndicateur libelle="Distance moyenne" icone={Route} accent="neutre" valeur={nombre(stats.distanceMoyenneKm, 1)} unite="km" indice={<span>domicile → établissement (estimation)</span>} />
        <TuileIndicateur libelle="Population scolarisable 2030" icone={TrendingUp} accent="ambre" valeur={compact(stats.projection2030)} indice={<span>{evolutionPop >= 0 ? "+" : ""}{nombre(evolutionPop, 1)} % par rapport à aujourd'hui (projection)</span>} />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ Tableau des établissements */

type CleTri = "nom" | "effectif" | "capacite" | "occupation" | "enseignants" | "ratio" | "transmis";
const COLONNES: { cle: CleTri; libelle: string; numerique?: boolean }[] = [
  { cle: "nom", libelle: "Établissement" },
  { cle: "effectif", libelle: "Effectif", numerique: true },
  { cle: "capacite", libelle: "Capacité", numerique: true },
  { cle: "occupation", libelle: "Occupation", numerique: true },
  { cle: "enseignants", libelle: "Enseignants", numerique: true },
  { cle: "ratio", libelle: "Élèves / ens.", numerique: true },
];
const PAGE = 20;

function SectionEtablissements({ communeId, etablissements }: { communeId: string; etablissements: EtablissementGenere[] }) {
  const [tri, setTri] = useState<{ cle: CleTri; sens: 1 | -1 }>({ cle: "occupation", sens: -1 });
  const [limite, setLimite] = useState(PAGE);
  const valeur = (e: EtablissementGenere, cle: CleTri): number | string => {
    switch (cle) {
      case "nom": return e.nom;
      case "occupation": return e.effectif / Math.max(1, e.capacite);
      case "ratio": return e.effectif / Math.max(1, e.enseignants);
      case "transmis": return e.transmis ? 1 : 0;
      default: return e[cle];
    }
  };
  const lignes = useMemo(() => [...etablissements].sort((a, b) => {
    const va = valeur(a, tri.cle), vb = valeur(b, tri.cle);
    return (typeof va === "string" ? va.localeCompare(vb as string, "fr") : va - (vb as number)) * tri.sens;
  }), [etablissements, tri]);
  const nonTransmis = etablissements.filter((e) => !e.transmis).length;
  const satures = etablissements.filter((e) => e.effectif / e.capacite > 1.1).length;
  const trier = (cle: CleTri) => setTri((t) => (t.cle === cle ? { cle, sens: t.sens === 1 ? -1 : 1 } : { cle, sens: cle === "nom" ? 1 : -1 }));

  if (!etablissements.length) return <Card><EtatVide icone={School} titre="Aucun établissement référencé" texte="Cette commune n'a pas encore d'établissement au référentiel national." /></Card>;

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line/60 px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">{pluriel(etablissements.length, "établissement")} · {nomCommune(communeId)}</h2>
          <p className="text-[12.5px] text-ink-muted">Référentiel national des établissements, année {ANNEE_COURANTE}. Cliquez sur un en-tête pour trier.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge ton={satures ? "critique" : "succes"}>{satures} au-delà de 110 % d'occupation</Badge>
          <Badge ton={nonTransmis ? "avertissement" : "succes"} icone={nonTransmis ? Clock : Check}>{nonTransmis} sans transmission</Badge>
        </div>
      </div>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[860px] text-[13px]">
          <caption className="sr-only">Établissements de {nomCommune(communeId)}, triés par {COLONNES.find((c) => c.cle === tri.cle)?.libelle ?? "transmission"}</caption>
          <thead className="bg-surface-2 text-left text-[11.5px] uppercase tracking-wide text-ink-muted">
            <tr>
              {COLONNES.map((c) => <EnteteTri key={c.cle} libelle={c.libelle} cle={c.cle} tri={tri} onTri={trier} numerique={c.numerique} />)}
              <th scope="col" className="px-3 py-2 font-semibold">Infrastructures</th>
              <EnteteTri libelle="Transmission" cle="transmis" tri={tri} onTri={trier} />
            </tr>
          </thead>
          <tbody>
            {lignes.slice(0, limite).map((e, i) => {
              const occ = (e.effectif / Math.max(1, e.capacite)) * 100;
              const pilote = e.id.includes("-PILOTE-");
              return (
                <tr key={e.id} className={cn("animate-row border-t border-line/60", pilote && "bg-blue-soft/50")} style={{ animationDelay: `${Math.min(i, 20) * 18}ms` }}>
                  <td className="min-w-[13rem] px-3 py-2.5">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-ink">{e.nom}</span>
                      {pilote && <Badge ton="marque">Pilote</Badge>}
                    </span>
                    <span className="block text-[11.5px] text-ink-muted">{e.cycle === "primaire" ? "Primaire" : "Secondaire"} · {e.statut === "public" ? "Public" : e.statut === "prive" ? "Privé" : "Confessionnel"} · <span className="font-mono">{e.id}</span></span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular">{entier(e.effectif)}</td>
                  <td className="px-3 py-2.5 text-right tabular">{entier(e.capacite)}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center justify-end gap-2">
                      <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-surface-2 sm:block" aria-hidden>
                        <span className={cn("block h-full rounded-full", occ > 110 ? "bg-critical" : occ > 100 ? "bg-warning" : "bg-success")} style={{ width: `${Math.min(100, occ / 1.5)}%` }} />
                      </span>
                      <span className={cn("tabular", occ > 110 ? "font-semibold text-critical" : "text-ink")}>{pourcent(occ, 0)}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular">{entier(e.enseignants)}</td>
                  <td className="px-3 py-2.5 text-right tabular">{nombre(e.effectif / Math.max(1, e.enseignants), 0)}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex gap-1">
                      <Infra present={e.infrastructures.eau} icone={Droplet} libelle="Eau" />
                      <Infra present={e.infrastructures.electricite} icone={Zap} libelle="Électricité" />
                      <Infra present={e.infrastructures.internet} icone={Wifi} libelle="Internet" />
                    </span>
                  </td>
                  <td className="px-3 py-2.5">{e.transmis ? <Badge ton="succes" icone={Check}>Transmis</Badge> : <Badge ton="avertissement" icone={Clock}>En attente</Badge>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {lignes.length > PAGE && (
        <div className="border-t border-line/60 px-5 py-3">
          <button type="button" onClick={() => setLimite((l) => (l >= lignes.length ? PAGE : lignes.length))} className="text-[13px] font-medium text-blue hover:underline">
            {limite >= lignes.length ? "Réduire la liste" : `Afficher les ${lignes.length} établissements`}
          </button>
        </div>
      )}
    </Card>
  );
}

function EnteteTri({ libelle, cle, tri, onTri, numerique }: { libelle: string; cle: CleTri; tri: { cle: CleTri; sens: 1 | -1 }; onTri: (c: CleTri) => void; numerique?: boolean }) {
  const actif = tri.cle === cle;
  const Icone = actif ? (tri.sens === 1 ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th scope="col" aria-sort={actif ? (tri.sens === 1 ? "ascending" : "descending") : "none"} className={cn("px-3 py-2 font-semibold", numerique && "text-right")}>
      <button type="button" onClick={() => onTri(cle)} className={cn("inline-flex items-center gap-1 rounded-sm uppercase hover:text-ink", actif && "text-ink")}>
        {libelle}<Icone size={12} aria-hidden />
      </button>
    </th>
  );
}

function Infra({ present, icone: Icone, libelle }: { present: boolean; icone: LucideIcon; libelle: string }) {
  return (
    <span
      title={`${libelle} : ${present ? "disponible" : "absent"}`}
      className={cn("relative inline-flex h-6 w-6 items-center justify-center rounded-full", present ? "bg-success-bg text-success" : "bg-surface-2 text-ink-muted")}
    >
      <Icone size={12} aria-hidden />
      {!present && <span className="absolute h-px w-4 rotate-45 bg-current" aria-hidden />}
      <span className="sr-only">{libelle} : {present ? "disponible" : "absent"}</span>
    </span>
  );
}

