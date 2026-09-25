"use client";

import {
  ArrowDown, ArrowUp, ArrowUpDown, BellRing, Check, ChevronRight, Clock, Droplet, GitMerge, GraduationCap, Map as IconeCarte,
  School, TrendingUp, UserX, Users, Wifi, X, Zap, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Courbes } from "@/components/charts/Graphiques";
import { AnimatePresence, Cascade, Compteur, EASE, Element, motion } from "@/components/motion";
import { CarteBenin, COULEUR_ALERTE, LegendeSequentielle, type PointCarte } from "@/components/map/CarteBenin";
import { notifier } from "@/components/ui/Notifications";
import { BadgeConfiance, TuileIndicateur } from "@/components/ui/donnees";
import { Badge, Button, Card, CardHeader, EtatVide, PageHeader, Segmente, Squelette } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { compact, entier, nombre, pourcent } from "@/lib/format";
import { ErreurApi } from "@/lib/http";
import {
  useCouche, useFicheCommune, useIndicateurPilotage, usePrioritesPilotage, useRelanceMutation,
  type CouchePilotage, type EtablissementCommune, type FicheCommune, type NiveauAlerte, type Priorite,
} from "@/lib/api/pilotage";
import { COMMUNES, communeById, DEPARTEMENTS } from "@beile/simulation/territoire";
import {
  ALERTE, BandeauRefus, EtatEchec, Feuille, LegendeAlertes, libellePerimetre, NIVEAUX_ALERTE, niveauDuScore, nomCommune, nomDepartement,
  PastilleNiveau, pluriel, SqueletteLignes, SqueletteTuiles, useHabilitationPilotage,
} from "../../_commun";

/**
 * « Où agir ? » (processus P3) — descente Bénin → département → commune → établissements.
 * Niveaux d'alerte, couches et fiche commune viennent de l'API, sous le périmètre de l'habilitation ;
 * une commune hors périmètre est refusée PAR LE SERVEUR (403 journalisé), pas masquée par l'interface.
 */

type Couche = "priorites" | CouchePilotage;
const COUCHES: { valeur: Couche; libelle: string }[] = [
  { valeur: "priorites", libelle: "Priorités" },
  { valeur: "maths", libelle: "Maths ≥ 15" },
  { valeur: "ratio", libelle: "Élèves / ens." },
  { valeur: "occupation", libelle: "Occupation" },
  { valeur: "absenteisme", libelle: "Absentéisme" },
  { valeur: "abandon", libelle: "Abandon" },
];

export default function Page() {
  return (
    <Suspense fallback={<div className="space-y-6"><Squelette className="h-10 w-80 max-w-full" /><Squelette className="h-[480px] rounded-xl" /></div>}>
      <OuAgir />
    </Suspense>
  );
}

function OuAgir() {
  const params = useSearchParams();
  const router = useRouter();
  const hab = useHabilitationPilotage();
  const prio = usePrioritesPilotage();
  const [couche, setCouche] = useState<Couche>("priorites");
  const donneesCouche = useCouche(couche === "priorites" ? null : couche);

  const communeDemandee = params.get("commune");
  const communeConnue = communeDemandee && communeById.has(communeDemandee) ? communeDemandee : null;
  const fiche = useFicheCommune(communeConnue);
  const refus = fiche.error instanceof ErreurApi && fiche.error.refus;
  const commune = communeConnue && !refus ? communeConnue : null;

  // Périmètre : la direction départementale (et l'inspecteur) reste dans son département.
  const communesPrio = useMemo(() => prio.data?.communes ?? {}, [prio.data]);
  const depsPerimetre = new Set(Object.keys(communesPrio).map((id) => communeById.get(id)?.departementId).filter(Boolean) as string[]);
  const depRestreint = hab?.perimetre.niveau === "departement" ? hab.perimetre.departementId
    : hab?.perimetre.niveau === "circonscription" && depsPerimetre.size === 1 ? [...depsPerimetre][0]! : null;
  const depDemande = params.get("departement");
  const dep = depRestreint ?? (commune ? communeById.get(commune)!.departementId : depDemande && DEPARTEMENTS.some((d) => d.id === depDemande) ? depDemande : null);

  const naviguer = (q: string | null) => router.replace(q ? `/cockpit/carte?${q}` : "/cockpit/carte", { scroll: false });
  const allerCommune = (id: string | null) => naviguer(id ? `commune=${id}` : dep && !depRestreint ? `departement=${dep}` : null);
  const allerDepartement = (id: string | null) => naviguer(id ? `departement=${id}` : null);

  const couleurs = useMemo(() => (couche === "priorites" ? new Map(Object.entries(communesPrio).map(([id, p]) => [id, COULEUR_ALERTE[p.niveau]])) : undefined), [couche, communesPrio]);
  const scores = useMemo(() => new Map(Object.entries(communesPrio).map(([id, p]) => [id, p.score])), [communesPrio]);
  const valeurs = useMemo(() => (couche !== "priorites" && donneesCouche.data ? new Map(Object.entries(donneesCouche.data.valeurs)) : scores), [couche, donneesCouche.data, scores]);
  const bornes = couche !== "priorites" ? [...valeurs.values()].filter((v): v is number => v != null) : [];
  const formaterCouche = couche === "ratio" ? (v: number) => nombre(v, 0) : (v: number) => pourcent(v);
  const libelleCouche = COUCHES.find((c) => c.valeur === couche)!.libelle;

  const onCarte = (id: string) => {
    if (!communesPrio[id]) return; // hors périmètre : rien à ouvrir
    if (!dep) { allerDepartement(communeById.get(id)?.departementId ?? null); return; }
    allerCommune(commune === id ? null : id);
  };

  const points: PointCarte[] | undefined = commune && fiche.data
    ? fiche.data.etablissements.map((e) => ({ id: e.id, lng: e.lng, lat: e.lat, libelle: e.nom, mis: e.pilote }))
    : undefined;
  const niveauVue = commune ? "commune" : dep ? "departement" : "national";

  if (prio.isError) {
    return (
      <div className="space-y-6">
        <PageHeader surtitre="Pilotage territorial · P3" titre="Où agir ?" />
        <EtatEchec erreur={prio.error} onReessayer={() => prio.refetch()} titreRefus="Carte réservée aux habilitations de pilotage" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        surtitre={`Pilotage territorial · P3 · périmètre ${libellePerimetre(hab?.perimetre)}`}
        titre="Où agir ?"
        sousTitre="Zones prioritaires selon cinq facteurs objectivés : croissance des effectifs, occupation, encadrement, absentéisme et résultats. Descendez du pays jusqu'aux établissements."
        actions={commune ? <Link href={`/simulation?commune=${commune}`}><Button data-guide="carte-simuler" icone={GitMerge}>Simuler une mesure</Button></Link> : undefined}
      />

      <nav data-guide="carte-fil" aria-label="Fil de descente" className="flex flex-wrap items-center gap-1 text-[13px]">
        <FilEtape actif={niveauVue === "national"} desactive={!!depRestreint} onClick={() => allerDepartement(null)}>Bénin</FilEtape>
        {dep && (<><ChevronRight size={14} className="text-ink-muted" aria-hidden /><FilEtape actif={niveauVue === "departement"} onClick={() => allerDepartement(dep)}>{nomDepartement(dep)}</FilEtape></>)}
        {commune && (<><ChevronRight size={14} className="text-ink-muted" aria-hidden /><FilEtape actif>{nomCommune(commune)}</FilEtape></>)}
        {depRestreint && <Badge ton="info" className="ml-2">Périmètre : {libellePerimetre(hab?.perimetre)}</Badge>}
      </nav>

      {refus && communeConnue && (
        <BandeauRefus titre="Commune hors périmètre." texte={<>{nomCommune(communeConnue)} ne relève pas de votre habilitation : le serveur a refusé l'accès et journalisé la tentative (critère manquant : périmètre).</>} />
      )}
      {fiche.error instanceof ErreurApi && fiche.error.introuvable && <BandeauRefus titre="Commune inconnue." texte="Cet identifiant ne figure pas au référentiel national." />}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card data-guide="carte-carte" className="min-w-0 overflow-hidden p-0 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line/60 px-5 py-4">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-ink">
                {commune ? `${nomCommune(commune)} et ses établissements` : dep ? `Communes · ${nomDepartement(dep)}` : `Les ${COMMUNES.length} communes`}
              </h2>
              <p className="text-[12.5px] text-ink-muted">
                {niveauVue === "national" ? "Cliquez sur une zone pour descendre dans son département." : "Cliquez sur une commune pour afficher ses facteurs et ses établissements."}
              </p>
            </div>
          </div>
          <div className="border-b border-line/60 px-5 py-3">
            <div className="max-w-full overflow-x-auto"><div className="w-max"><Segmente label="Couche affichée" options={COUCHES} valeur={couche} onChange={setCouche} /></div></div>
          </div>
          <div className={cn("p-5 transition-opacity", donneesCouche.isFetching && couche !== "priorites" && "opacity-60")}>
            {prio.isPending ? (
              <Squelette className="mx-auto aspect-[3/5] w-full max-w-[380px] rounded-xl" />
            ) : donneesCouche.isError && couche !== "priorites" ? (
              <EtatEchec erreur={donneesCouche.error} onReessayer={() => donneesCouche.refetch()} className="shadow-none" />
            ) : (
              <CarteBenin
                couleurs={couleurs}
                valeurs={valeurs}
                formater={couche === "priorites" ? (v) => `${ALERTE[niveauDuScore(v)].symbole} ${ALERTE[niveauDuScore(v)].libelle} · ${pluriel(v, "facteur")}` : formaterCouche}
                libelleValeur={couche === "priorites" ? "Niveau" : libelleCouche}
                focusDepartement={dep ?? undefined}
                selection={commune}
                onSelect={onCarte}
                points={points}
                hauteur={dep ? 460 : 600}
                className="mx-auto w-full max-w-[420px]"
                legende={couche === "priorites" ? <LegendeAlertes avecPoints={!!points} /> : bornes.length ? (
                  <LegendeSequentielle min={Math.min(...bornes)} max={Math.max(...bornes)} libelle={`${donneesCouche.data?.definition.nom ?? libelleCouche} · hachures : hors périmètre ou masquée`} formater={formaterCouche} />
                ) : null}
              />
            )}
            {couche !== "priorites" && donneesCouche.data && (
              <p className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-muted">{donneesCouche.data.definition.definition} <BadgeConfiance confiance={donneesCouche.data.confiance} compact /></p>
            )}
          </div>
        </Card>

        <div data-guide="carte-panneau" className="min-w-0 space-y-6 lg:col-span-3">
          <AnimatePresence mode="wait">
            <motion.div key={niveauVue + (commune ?? dep ?? "")} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3, ease: EASE }} className="min-w-0 space-y-6">
              {commune ? (
                fiche.isPending ? <ChargementCommune /> : fiche.isError ? <EtatEchec erreur={fiche.error} onReessayer={() => fiche.refetch()} /> : <PanneauCommune fiche={fiche.data} />
              ) : prio.isPending ? (
                <><SqueletteTuiles n={4} /><Card className="min-w-0"><SqueletteLignes n={8} /></Card></>
              ) : dep ? (
                <PanneauDepartement depId={dep} prio={communesPrio} onCommune={(id) => allerCommune(id)} />
              ) : (
                <PanneauNational prio={communesPrio} onDepartement={(id) => allerDepartement(id)} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {commune && fiche.data && <SectionEtablissements fiche={fiche.data} peutRelancer={hab?.role !== "chercheur"} />}
    </div>
  );
}

/* ------------------------------------------------------------------ Navigation */

function FilEtape({ actif, desactive, onClick, children }: { actif?: boolean; desactive?: boolean; onClick?: () => void; children: React.ReactNode }) {
  if (actif || !onClick || desactive) {
    return <span aria-current={actif ? "page" : undefined} className={cn("rounded-sm px-2 py-1", actif ? "font-semibold text-ink" : "text-ink-muted")}>{children}</span>;
  }
  return <button type="button" onClick={onClick} className="min-h-9 rounded-sm px-2 py-1 font-medium text-blue hover:bg-surface-2 hover:underline">{children}</button>;
}

/* ------------------------------------------------------------------ Niveau national */

function PanneauNational({ prio, onDepartement }: { prio: Record<string, Priorite>; onDepartement: (id: string) => void }) {
  const valeursPrio = Object.values(prio);
  const compte = (n: NiveauAlerte) => valeursPrio.filter((p) => p.niveau === n).length;
  const parDep = DEPARTEMENTS.map((d) => {
    const ids = COMMUNES.filter((c) => c.departementId === d.id && prio[c.id]).map((c) => c.id);
    const graves = ids.filter((id) => ["critique", "attention"].includes(prio[id]!.niveau)).length;
    const critiques = ids.filter((id) => prio[id]!.niveau === "critique").length;
    return { ...d, total: ids.length, graves, critiques };
  }).filter((d) => d.total > 0).sort((a, b) => b.critiques - a.critiques || b.graves - a.graves || a.nom.localeCompare(b.nom, "fr"));
  const maxGraves = Math.max(1, ...parDep.map((d) => d.graves));

  return (
    <>
      <Cascade className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {NIVEAUX_ALERTE.map((n) => (
          <Element key={n.niveau}>
            <div className="rounded-lg border border-line/70 bg-surface px-4 py-3.5 shadow-float">
              <span className="flex items-center justify-between gap-2">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{n.court}</span>
                <span className="text-[15px] leading-none" style={{ color: COULEUR_ALERTE[n.niveau] }} aria-hidden>{n.symbole}</span>
              </span>
              <span className="mt-2 block font-display text-2xl font-semibold leading-none text-ink"><Compteur valeur={compte(n.niveau)} format={entier} /></span>
              <span className="mt-1 block text-xs text-ink-muted">communes</span>
            </div>
          </Element>
        ))}
      </Cascade>
      <Card className="min-w-0">
        <CardHeader icon={IconeCarte} title="Départements à examiner en priorité" subtitle="Communes en « Attention » ou « Critique », par département" />
        <ul className="space-y-0.5">
          {parDep.map((d, i) => (
            <motion.li key={d.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 12) * 0.035, duration: 0.3, ease: EASE }}>
              <button type="button" onClick={() => onDepartement(d.id)} className="grid min-h-11 w-full grid-cols-[minmax(6.5rem,9rem)_1fr_auto] items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-surface-2">
                <span className="truncate text-[13px] font-medium text-ink">{d.nom}</span>
                <span className="relative h-2.5 rounded-full bg-surface-2" aria-hidden>
                  <motion.span className="absolute inset-y-0 left-0 rounded-full" style={{ background: "var(--alert-attention)" }} initial={{ width: 0 }} animate={{ width: `${(d.graves / maxGraves) * 100}%` }} transition={{ duration: 0.8, ease: EASE, delay: i * 0.03 }} />
                  <motion.span className="absolute inset-y-0 left-0 rounded-full" style={{ background: "var(--alert-critique)" }} initial={{ width: 0 }} animate={{ width: `${(d.critiques / maxGraves) * 100}%` }} transition={{ duration: 0.8, ease: EASE, delay: 0.1 + i * 0.03 }} />
                </span>
                <span className="text-right text-[12px] text-ink-2 tabular">
                  <span className="font-semibold text-ink">{d.graves}</span> / {d.total}
                  {d.critiques > 0 && <span className="ml-1.5 text-critical">({d.critiques} ◆)</span>}
                </span>
              </button>
            </motion.li>
          ))}
        </ul>
        <p className="mt-3 text-[11.5px] leading-snug text-ink-muted">Lecture : communes en attention ou en situation critique sur le total du département ; ◆ = critiques. Un niveau résulte du nombre de facteurs dépassant leur seuil, jamais d'un score opaque.</p>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ Niveau département */

function PanneauDepartement({ depId, prio, onCommune }: { depId: string; prio: Record<string, Priorite>; onCommune: (id: string) => void }) {
  const effectif = useIndicateurPilotage({ indicateur: "effectif_apprenants", filtres: { departementId: depId }, ventilation: [] });
  const occupation = useIndicateurPilotage({ indicateur: "taux_occupation", filtres: { departementId: depId }, ventilation: [] });
  const ratio = useIndicateurPilotage({ indicateur: "ratio_apprenants_enseignant", filtres: { departementId: depId }, ventilation: [] });
  const absenteisme = useIndicateurPilotage({ indicateur: "taux_absenteisme", filtres: { departementId: depId }, ventilation: [] });
  const communes = COMMUNES.filter((c) => c.departementId === depId && prio[c.id])
    .map((c) => ({ ...c, p: prio[c.id]! }))
    .sort((a, b) => b.p.score - a.p.score || a.nom.localeCompare(b.nom, "fr"));
  const indicateurs = [effectif, occupation, ratio, absenteisme];
  const enEchec = indicateurs.find((q) => q.isError);

  return (
    <>
      {enEchec ? (
        <EtatEchec erreur={enEchec.error} onReessayer={() => indicateurs.forEach((q) => q.refetch())} />
      ) : indicateurs.some((q) => !q.data) ? (
        <SqueletteTuiles n={4} />
      ) : (
        <Cascade className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Element><TuileIndicateur libelle="Apprenants" icone={Users} accent="bleu" valeur={<Compteur valeur={effectif.data!.valeur ?? 0} format={compact} />} confiance={effectif.data!.confiance} /></Element>
          <Element><TuileIndicateur libelle="Occupation" icone={School} accent={(occupation.data!.valeur ?? 0) > 112 ? "critique" : "ambre"} valeur={nombre(occupation.data!.valeur, 1)} unite="%" confiance={occupation.data!.confiance} /></Element>
          <Element><TuileIndicateur libelle="Élèves / enseignant" icone={GraduationCap} accent="sarcelle" valeur={nombre(ratio.data!.valeur, 1)} confiance={ratio.data!.confiance} /></Element>
          <Element><TuileIndicateur libelle="Absentéisme" icone={UserX} accent="ambre" valeur={nombre(absenteisme.data!.valeur, 1)} unite="%" confiance={absenteisme.data!.confiance} /></Element>
        </Cascade>
      )}
      <Card className="min-w-0">
        <CardHeader icon={IconeCarte} title={`${pluriel(communes.length, "commune")} · ${nomDepartement(depId)}`} subtitle="Classées par nombre de facteurs dépassant leur seuil" />
        {communes.length ? (
          <ul className="divide-y divide-line/60">
            {communes.map((c, i) => (
              <motion.li key={c.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.035, duration: 0.3, ease: EASE }}>
                <button type="button" onClick={() => onCommune(c.id)} className="flex min-h-11 w-full items-center gap-3 rounded-md px-2 py-2.5 text-left hover:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{c.nom}</span>
                    <span className="block text-xs leading-snug text-ink-muted">{c.p.facteurs.filter((f) => f.grave).map((f) => f.libelle.split(" (")[0]).join(" · ") || "Aucun facteur au-dessus du seuil"}</span>
                  </span>
                  <PastilleNiveau niveau={c.p.niveau} className="shrink-0" />
                </button>
              </motion.li>
            ))}
          </ul>
        ) : (
          <EtatVide icone={IconeCarte} titre="Aucune commune accessible" texte="Ce département est hors de votre périmètre." />
        )}
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ Niveau commune */

function ChargementCommune() {
  return (
    <>
      <Card className="min-w-0 space-y-3"><Squelette className="h-3 w-40" /><Squelette className="h-7 w-56" /><div className="grid gap-2 sm:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Squelette key={i} className="h-14" />)}</div></Card>
      <SqueletteTuiles n={4} />
    </>
  );
}

function PanneauCommune({ fiche }: { fiche: FicheCommune }) {
  const { commune: c, indicateurs: ind, priorite } = fiche;
  return (
    <>
      <Card className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{c.departement ?? nomDepartement(c.departementId)} · milieu {c.milieu}</p>
            <p className="font-display text-[22px] font-bold text-ink">{c.nom}</p>
          </div>
          {priorite && <PastilleNiveau niveau={priorite.niveau} className="mt-1" />}
        </div>
        {priorite && (
          <>
            <p className="mt-4 text-[12px] font-semibold text-ink-2">Pourquoi ce niveau ? {pluriel(priorite.score, "facteur")} au-dessus du seuil</p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {priorite.facteurs.map((f, i) => (
                <motion.li key={f.libelle} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.3, ease: EASE }}
                  className={cn("flex items-start gap-2 rounded-md px-3 py-2 text-[12.5px]", f.grave ? "bg-critical-bg" : "bg-surface-2")}>
                  <span className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white", f.grave ? "bg-critical" : "bg-success")} aria-hidden>
                    {f.grave ? <X size={11} /> : <Check size={11} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-ink-2">{f.libelle}</span>
                    <span className={cn("font-semibold tabular", f.grave ? "text-critical" : "text-ink")}>{f.valeur}</span>
                    <span className="sr-only">{f.grave ? " — au-dessus du seuil d'alerte" : " — sous le seuil d'alerte"}</span>
                    {f.grave && <span className="ml-1.5 text-[11px] font-medium text-critical">seuil dépassé</span>}
                  </span>
                </motion.li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Cascade className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Element><TuileIndicateur libelle="Apprenants" icone={Users} accent="bleu" valeur={<Compteur valeur={ind.effectif} format={entier} />} tendance={fiche.effectifs.map((e) => e.effectif)} /></Element>
        <Element><TuileIndicateur libelle="Capacité d'accueil" icone={School} accent="neutre" valeur={entier(ind.capacite)} indice={<span>places déclarées</span>} /></Element>
        <Element><TuileIndicateur libelle="Occupation" icone={School} accent={ind.occupation > 112 ? "critique" : "ambre"} valeur={nombre(ind.occupation, 1)} unite="%" indice={<span>seuil d'alerte : 112 %</span>} /></Element>
        <Element><TuileIndicateur libelle="Élèves / enseignant" icone={GraduationCap} accent="sarcelle" valeur={nombre(ind.ratio, 1)} indice={<span>{entier(ind.enseignants)} enseignants, dont {pourcent((ind.enseignantsQualifies / Math.max(1, ind.enseignants)) * 100, 0)} qualifiés</span>} /></Element>
        <Element><TuileIndicateur libelle="Absentéisme" icone={UserX} accent="ambre" valeur={nombre(ind.absenteisme, 1)} unite="%" indice={<span>abandon : {pourcent(ind.abandon)}</span>} /></Element>
        <Element><TuileIndicateur libelle="Population scolarisable" icone={TrendingUp} accent="neutre" valeur={compact(ind.populationScolarisable)} indice={<span>couverture des remontées : {pourcent(ind.couverture, 0)}</span>} /></Element>
      </Cascade>

      <Card className="min-w-0">
        <CardHeader icon={TrendingUp} title="Effectifs et capacité d'accueil" subtitle="Quand la courbe des apprenants passe au-dessus de celle des places, la commune sature." />
        <Courbes
          formater={(v) => compact(v)}
          hauteur={200}
          series={[
            { nom: "Apprenants", points: fiche.effectifs.map((e) => ({ x: e.annee.replace("-20", "-"), y: e.effectif })) },
            { nom: "Places", points: fiche.effectifs.map((e) => ({ x: e.annee.replace("-20", "-"), y: e.capacite })) },
          ]}
        />
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ Établissements de la commune */

type CleTri = "nom" | "effectif" | "capacite" | "occupation" | "enseignants" | "ratio" | "transmis";
const COLONNES: { cle: CleTri; libelle: string; numerique?: boolean; secondaire?: boolean }[] = [
  { cle: "nom", libelle: "Établissement" },
  { cle: "effectif", libelle: "Effectif", numerique: true },
  { cle: "capacite", libelle: "Capacité", numerique: true, secondaire: true },
  { cle: "occupation", libelle: "Occupation", numerique: true },
  { cle: "enseignants", libelle: "Enseignants", numerique: true, secondaire: true },
  { cle: "ratio", libelle: "Élèves / ens.", numerique: true },
];
const PAGE = 20;
const occupationDe = (e: EtablissementCommune) => (e.effectif / Math.max(1, e.capacite)) * 100;
const STATUT: Record<string, string> = { public: "Public", prive: "Privé", confessionnel: "Confessionnel", communautaire: "Communautaire" };

function SectionEtablissements({ fiche, peutRelancer }: { fiche: FicheCommune; peutRelancer: boolean }) {
  const etablissements = fiche.etablissements;
  const [tri, setTri] = useState<{ cle: CleTri; sens: 1 | -1 }>({ cle: "occupation", sens: -1 });
  const [limite, setLimite] = useState(PAGE);
  const [confirmer, setConfirmer] = useState(false);
  const [relances, setRelances] = useState<Set<string>>(new Set());
  const relance = useRelanceMutation();

  const valeur = (e: EtablissementCommune, cle: CleTri): number | string => {
    switch (cle) {
      case "nom": return e.nom;
      case "occupation": return occupationDe(e);
      case "ratio": return e.effectif / Math.max(1, e.enseignants);
      case "transmis": return e.transmis ? 1 : 0;
      default: return e[cle];
    }
  };
  const lignes = [...etablissements].sort((a, b) => {
    const va = valeur(a, tri.cle), vb = valeur(b, tri.cle);
    return (typeof va === "string" ? va.localeCompare(vb as string, "fr") : va - (vb as number)) * tri.sens;
  });
  const enAttente = etablissements.filter((e) => !e.transmis && !relances.has(e.id));
  const nonTransmis = etablissements.filter((e) => !e.transmis).length;
  const satures = etablissements.filter((e) => occupationDe(e) > 110).length;
  const trier = (cle: CleTri) => setTri((t) => (t.cle === cle ? { cle, sens: t.sens === 1 ? -1 : 1 } : { cle, sens: cle === "nom" ? 1 : -1 }));

  const lancer = () => {
    const ids = enAttente.map((e) => e.id).slice(0, 200);
    relance.mutate(ids, {
      onSuccess: (r) => {
        setRelances((s) => new Set([...s, ...ids]));
        setConfirmer(false);
        notifier({ ton: "succes", titre: `${pluriel(r.relances, "relance envoyée", "relances envoyées")}`, texte: r.dejaOuvertes ? `${pluriel(r.dejaOuvertes, "établissement avait", "établissements avaient")} déjà une relance en cours.` : "Chaque direction d'établissement la voit dans ses demandes." });
      },
    });
  };

  if (!etablissements.length) return <Card><EtatVide icone={School} titre="Aucun établissement référencé" texte="Cette commune n'a pas encore d'établissement au référentiel national." /></Card>;

  return (
    <Card className="min-w-0 overflow-hidden p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line/60 px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">{pluriel(etablissements.length, "établissement")} · {fiche.commune.nom}</h2>
          <p className="text-[12.5px] text-ink-muted">Référentiel national des établissements. Cliquez sur un en-tête pour trier.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge ton={satures ? "critique" : "succes"}>{satures} au-delà de 110 %</Badge>
          <Badge ton={nonTransmis ? "avertissement" : "succes"} icone={nonTransmis ? Clock : Check}>{nonTransmis} sans transmission</Badge>
          {peutRelancer && enAttente.length > 0 && (
            <Button taille="sm" variante="secondaire" icone={BellRing} onClick={() => setConfirmer(true)}>Relancer ({enAttente.length})</Button>
          )}
        </div>
      </div>

      {/* Mobile : cartes */}
      <ul className="grid gap-3 p-4 sm:grid-cols-2 md:hidden">
        {lignes.slice(0, limite).map((e) => <CarteEtablissement key={e.id} e={e} relance={relances.has(e.id)} />)}
      </ul>

      {/* À partir de md : tableau */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">Établissements de {fiche.commune.nom}, triés par {COLONNES.find((c) => c.cle === tri.cle)?.libelle ?? "transmission"}</caption>
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              {COLONNES.map((c) => <EnteteTri key={c.cle} libelle={c.libelle} cle={c.cle} tri={tri} onTri={trier} numerique={c.numerique} className={c.secondaire ? "hidden lg:table-cell" : undefined} />)}
              <th scope="col" className="px-5 py-3 font-semibold">Infrastructures</th>
              <EnteteTri libelle="Transmission" cle="transmis" tri={tri} onTri={trier} />
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {lignes.slice(0, limite).map((e, i) => {
                const occ = occupationDe(e);
                return (
                  <motion.tr key={e.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ delay: Math.min(i, 12) * 0.035, duration: 0.3 }}
                    className={cn("border-t border-line/60", e.pilote && "bg-blue-soft/50")}>
                    <td className="min-w-[13rem] px-5 py-3">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-ink">{e.nom}</span>
                        {e.pilote && <Badge ton="marque">Pilote</Badge>}
                      </span>
                      <span className="block text-xs text-ink-muted">{e.cycle === "primaire" ? "Primaire" : "Secondaire"} · {STATUT[e.statut] ?? e.statut} · <span className="font-mono">{e.id}</span></span>
                    </td>
                    <td className="px-5 py-3 text-right">{entier(e.effectif)}</td>
                    <td className="hidden px-5 py-3 text-right lg:table-cell">{entier(e.capacite)}</td>
                    <td className="px-5 py-3">
                      <span className="flex items-center justify-end gap-2">
                        <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-surface-2 xl:block" aria-hidden>
                          <span className={cn("block h-full rounded-full", occ > 110 ? "bg-critical" : occ > 100 ? "bg-warning" : "bg-success")} style={{ width: `${Math.min(100, occ / 1.5)}%` }} />
                        </span>
                        <span className={occ > 110 ? "font-semibold text-critical" : "text-ink"}>{pourcent(occ, 0)}</span>
                      </span>
                    </td>
                    <td className="hidden px-5 py-3 text-right lg:table-cell">{entier(e.enseignants)}</td>
                    <td className="px-5 py-3 text-right">{nombre(e.effectif / Math.max(1, e.enseignants), 0)}</td>
                    <td className="px-5 py-3"><Infras e={e} /></td>
                    <td className="px-5 py-3"><StatutTransmission transmis={e.transmis} relance={relances.has(e.id)} /></td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
      {lignes.length > PAGE && (
        <div className="border-t border-line/60 px-5 py-3">
          <button type="button" onClick={() => setLimite((l) => (l >= lignes.length ? PAGE : lignes.length))} className="min-h-10 text-[13px] font-medium text-blue hover:underline">
            {limite >= lignes.length ? "Réduire la liste" : `Afficher les ${lignes.length} établissements`}
          </button>
        </div>
      )}

      <Feuille
        ouvert={confirmer}
        onFermer={() => setConfirmer(false)}
        icone={BellRing}
        titre={`Relancer ${pluriel(enAttente.length, "établissement")} ?`}
        description={`Une demande « Transmettre la remontée » (échéance 7 jours) sera ouverte pour chaque établissement de ${fiche.commune.nom} qui n'a pas transmis. L'action est journalisée.`}
        pied={
          <>
            <Button variante="secondaire" onClick={() => setConfirmer(false)}>Annuler</Button>
            <Button icone={BellRing} chargement={relance.isPending} onClick={lancer}>Envoyer les relances</Button>
          </>
        }
      >
        <ul className="divide-y divide-line/60 text-sm">
          {enAttente.slice(0, 12).map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-2"><span className="truncate text-ink">{e.nom}</span><span className="shrink-0 font-mono text-xs text-ink-muted">{e.id}</span></li>
          ))}
          {enAttente.length > 12 && <li className="py-2 text-xs text-ink-muted">… et {enAttente.length - 12} autres</li>}
        </ul>
      </Feuille>
    </Card>
  );
}

function CarteEtablissement({ e, relance }: { e: EtablissementCommune; relance: boolean }) {
  const occ = occupationDe(e);
  return (
    <li className={cn("rounded-lg border border-line/70 bg-surface p-3.5", e.pilote && "bg-blue-soft/40")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-ink">{e.nom}</p>
          <p className="text-xs text-ink-muted">{e.cycle === "primaire" ? "Primaire" : "Secondaire"} · {STATUT[e.statut] ?? e.statut}</p>
        </div>
        {e.pilote && <Badge ton="marque">Pilote</Badge>}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-md bg-surface-2/70 py-1.5"><dt className="text-ink-muted">Effectif</dt><dd className="font-semibold text-ink tabular">{entier(e.effectif)}</dd></div>
        <div className="rounded-md bg-surface-2/70 py-1.5"><dt className="text-ink-muted">Occupation</dt><dd className={cn("font-semibold tabular", occ > 110 ? "text-critical" : "text-ink")}>{pourcent(occ, 0)}</dd></div>
        <div className="rounded-md bg-surface-2/70 py-1.5"><dt className="text-ink-muted">Élèves/ens.</dt><dd className="font-semibold text-ink tabular">{nombre(e.effectif / Math.max(1, e.enseignants), 0)}</dd></div>
      </dl>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Infras e={e} />
        <StatutTransmission transmis={e.transmis} relance={relance} />
      </div>
    </li>
  );
}

function StatutTransmission({ transmis, relance }: { transmis: boolean; relance: boolean }) {
  if (transmis) return <Badge ton="succes" icone={Check}>Transmis</Badge>;
  return relance ? <Badge ton="info" icone={BellRing}>Relancé</Badge> : <Badge ton="avertissement" icone={Clock}>En attente</Badge>;
}

function EnteteTri({ libelle, cle, tri, onTri, numerique, className }: { libelle: string; cle: CleTri; tri: { cle: CleTri; sens: 1 | -1 }; onTri: (c: CleTri) => void; numerique?: boolean; className?: string }) {
  const actif = tri.cle === cle;
  const Icone = actif ? (tri.sens === 1 ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th scope="col" aria-sort={actif ? (tri.sens === 1 ? "ascending" : "descending") : "none"} className={cn("px-5 py-3 font-semibold", numerique && "text-right", className)}>
      <button type="button" onClick={() => onTri(cle)} className={cn("inline-flex items-center gap-1 rounded-sm uppercase hover:text-ink", actif && "text-ink")}>
        {libelle}<Icone size={12} aria-hidden />
      </button>
    </th>
  );
}

function Infras({ e }: { e: EtablissementCommune }) {
  return (
    <span className="flex gap-1">
      <Infra present={e.infrastructures.eau} icone={Droplet} libelle="Eau" />
      <Infra present={e.infrastructures.electricite} icone={Zap} libelle="Électricité" />
      <Infra present={e.infrastructures.internet} icone={Wifi} libelle="Internet" />
    </span>
  );
}

function Infra({ present, icone: Icone, libelle }: { present: boolean; icone: LucideIcon; libelle: string }) {
  return (
    <span title={`${libelle} : ${present ? "disponible" : "absent"}`} className={cn("relative inline-flex h-6 w-6 items-center justify-center rounded-full", present ? "bg-success-bg text-success" : "bg-surface-2 text-ink-muted")}>
      <Icone size={12} aria-hidden />
      {!present && <span className="absolute h-px w-4 rotate-45 bg-current" aria-hidden />}
      <span className="sr-only">{libelle} : {present ? "disponible" : "absent"}</span>
    </span>
  );
}
