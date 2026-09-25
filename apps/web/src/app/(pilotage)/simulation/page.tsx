"use client";

import {
  ArrowRight, Building2, Check, GraduationCap, Info, LineChart, RotateCcw, Scale, School, SlidersHorizontal, TrendingUp, TriangleAlert, type LucideIcon,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Courbes, TableauDonnees } from "@/components/charts/Graphiques";
import { AnimatePresence, Cascade, EASE, Element, motion } from "@/components/motion";
import { BadgeConfiance } from "@/components/ui/donnees";
import { Badge, Button, Card, CardHeader, PageHeader, Squelette } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { compact, entier, nombre, pourcent } from "@/lib/format";
import { useContexteCommune, useCouche, usePlanification, type Planification } from "@/lib/api/pilotage";
import { COMMUNES, DEPARTEMENTS } from "@beile/simulation/territoire";
import { EtatEchec, libellePerimetre, nomCommune, pluriel, SqueletteTuiles, useHabilitationPilotage } from "../_commun";

/**
 * Simulation « et si ? » (processus P2). Les données de base viennent de l'API (GET /pilotage/planification/:id,
 * sous le périmètre) ; le calcul du scénario est volontairement simple, fait ici, et entièrement exposé :
 * chaque résultat est accompagné de sa formule et de ses hypothèses.
 */

const CAPACITE_ETABLISSEMENT = 600;
/** Seuils d'alerte de la carte « Où agir ? » (couche sémantique, facteurs de priorité). */
const SEUIL_OCCUPATION = 112;
const SEUIL_RATIO = 54;
const ANNEES_PROJECTION = ["2026-2027", "2027-2028", "2028-2029", "2029-2030"];
const ANNEE_CIBLE = ANNEES_PROJECTION.at(-1)!;

export default function Page() {
  return (
    <Suspense fallback={<div className="space-y-6"><Squelette className="h-10 w-80 max-w-full" /><Squelette className="h-[420px] rounded-xl" /></div>}>
      <Simulation />
    </Suspense>
  );
}

function Simulation() {
  const params = useSearchParams();
  const hab = useHabilitationPilotage();
  const occupation = useCouche("occupation");

  const communesPossibles = useMemo(() => {
    const v = occupation.data?.valeurs ?? {};
    return COMMUNES.filter((c) => v[c.id] != null).map((c) => ({ ...c, occupation: v[c.id]! }));
  }, [occupation.data]);
  const plusSaturees = useMemo(() => [...communesPossibles].sort((a, b) => b.occupation - a.occupation).slice(0, 4), [communesPossibles]);

  const [choix, setChoix] = useState<string | null>(null);
  const demandee = params.get("commune");
  const communeId = choix
    ?? (demandee && communesPossibles.some((c) => c.id === demandee) ? demandee
      : communesPossibles.some((c) => c.id === "abomey-calavi") ? "abomey-calavi" : plusSaturees[0]?.id ?? null);

  const plan = usePlanification(communeId);
  const contexte = useContexteCommune(communeId);

  if (occupation.isError) {
    return (
      <div className="space-y-6">
        <PageHeader surtitre="Planification et allocation · P2" titre="Simulation « et si ? »" />
        <EtatEchec erreur={occupation.error} onReessayer={() => occupation.refetch()} titreRefus="Simulation réservée aux habilitations de pilotage" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        surtitre={`Planification et allocation · P2 · périmètre ${libellePerimetre(hab?.perimetre)}`}
        titre="Simulation « et si ? »"
        sousTitre="Mesurez l'effet d'une décision avant de la prendre : construire des établissements, affecter des enseignants, face à la croissance attendue des effectifs d'ici 2030."
      />
      {!communeId || occupation.isPending ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Squelette className="h-[560px] rounded-xl" />
          <div className="min-w-0 space-y-6 lg:col-span-2"><SqueletteTuiles n={4} className="lg:grid-cols-2" /><Squelette className="h-72 rounded-xl" /></div>
        </div>
      ) : (
        <Scenario
          key={communeId}
          communeId={communeId}
          onCommune={setChoix}
          communesPossibles={communesPossibles}
          plusSaturees={plusSaturees}
          restreint={hab?.perimetre.niveau !== "national"}
          plan={plan}
          contexte={contexte}
        />
      )}
    </div>
  );
}

type Communes = (typeof COMMUNES[number] & { occupation: number })[];

function Scenario({ communeId, onCommune, communesPossibles, plusSaturees, restreint, plan, contexte }: {
  communeId: string; onCommune: (id: string) => void; communesPossibles: Communes; plusSaturees: Communes; restreint: boolean;
  plan: ReturnType<typeof usePlanification>; contexte: ReturnType<typeof useContexteCommune>;
}) {
  const [constructions, setConstructions] = useState(3);
  const [affectations, setAffectations] = useState(20);
  const [croissance, setCroissance] = useState<number | null>(null);
  const p = plan.data?.commune.id === communeId ? plan.data : undefined;

  // Tendance observée 2021-2022 → 2025-2026 (taux annuel moyen calculé par le serveur), prolongée sur 4 ans.
  const tendance2030 = p ? Math.min(30, Math.max(0, Math.round((Math.pow(1 + p.croissanceAnnuelle, 4) - 1) * 100))) : 10;
  const c = croissance ?? tendance2030;
  const reinitialiser = () => { setConstructions(3); setAffectations(20); setCroissance(null); };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* ---------------------------------------------------------------- Paramètres */}
      <Card data-guide="simulation-scenario" className="h-fit min-w-0 lg:sticky lg:top-24">
        <CardHeader icon={SlidersHorizontal} title="Scénario" action={<Button variante="fantome" taille="sm" icone={RotateCcw} onClick={reinitialiser}>Réinitialiser</Button>} />

        <label htmlFor="commune" className="block text-sm font-medium text-ink">Commune</label>
        <select
          id="commune"
          value={communeId}
          onChange={(e) => onCommune(e.target.value)}
          className="mt-1.5 h-10 w-full rounded-md border border-line bg-surface px-3.5 text-sm text-ink focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/15"
        >
          {DEPARTEMENTS.filter((d) => communesPossibles.some((x) => x.departementId === d.id)).map((d) => (
            <optgroup key={d.id} label={d.nom}>
              {communesPossibles.filter((x) => x.departementId === d.id).map((x) => (
                <option key={x.id} value={x.id}>{x.nom} — occupation {nombre(x.occupation, 0)} %</option>
              ))}
            </optgroup>
          ))}
        </select>
        <p className="mt-2 text-xs text-ink-muted">Les plus saturées{restreint ? " de votre périmètre" : ""} :</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {plusSaturees.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => onCommune(x.id)}
              aria-pressed={communeId === x.id}
              className={cn("min-h-9 rounded-sm px-2.5 py-1 text-[12px] font-medium transition-colors active:scale-[0.97]", communeId === x.id ? "bg-navy text-white dark:bg-blue dark:text-navy-deep" : "bg-surface-2 text-ink-2 hover:text-ink")}
            >
              {x.nom} · {nombre(x.occupation, 0)} %
            </button>
          ))}
        </div>

        <div data-guide="simulation-curseurs" className="mt-6 space-y-6">
          <Curseur id="constructions" libelle="Établissements à construire" aide={`Capacité : ${entier(CAPACITE_ETABLISSEMENT)} places chacun`} valeur={constructions} min={0} max={10} onChange={setConstructions} format={(v) => `${v}`} />
          <Curseur id="affectations" libelle="Enseignants à affecter" aide={p ? `${entier(p.enseignants)} en poste aujourd'hui` : undefined} valeur={affectations} min={0} max={200} pas={5} onChange={setAffectations} format={(v) => `+${v}`} />
          <Curseur id="croissance" libelle="Croissance des effectifs d'ici 2030" aide={`Tendance observée prolongée : +${tendance2030} %`} valeur={c} min={0} max={30} onChange={setCroissance} format={(v) => `+${v} %`} />
          <Button variante="secondaire" taille="sm" icone={TrendingUp} onClick={() => setCroissance(tendance2030)} disabled={c === tendance2030} className="w-full">
            Appliquer la tendance observée (+{tendance2030} %)
          </Button>
        </div>

        <div className="mt-6 border-t border-line/60 pt-4 text-xs text-ink-muted">
          <p className="flex flex-wrap items-center gap-2"><span>Données de base : {nomCommune(communeId)}, {contexte.data?.annee ?? "année en cours"}</span>{contexte.data && <BadgeConfiance confiance={contexte.data.confiance} />}</p>
          {contexte.data && <p className="mt-1.5">{entier(contexte.data.couverture.etablissementsAyantTransmis)} établissements sur {entier(contexte.data.couverture.etablissementsAttendus)} ont transmis. Source : {contexte.data.source}.</p>}
        </div>
      </Card>

      {/* ---------------------------------------------------------------- Résultats */}
      <div data-guide="simulation-resultats" className="min-w-0 space-y-6 lg:col-span-2">
        {plan.isError ? (
          <EtatEchec erreur={plan.error} onReessayer={() => plan.refetch()} />
        ) : !p ? (
          <><SqueletteTuiles n={4} className="lg:grid-cols-2" /><Squelette className="h-72 rounded-xl" /></>
        ) : (
          <Resultats p={p} constructions={constructions} affectations={affectations} croissance={c} confiance={contexte.data?.confiance.score ?? null} enChargement={plan.isFetching} />
        )}
      </div>
    </div>
  );
}

function Resultats({ p, constructions, affectations, croissance, confiance, enChargement }: { p: Planification; constructions: number; affectations: number; croissance: number; confiance: number | null; enChargement: boolean }) {
  // --- Modèle (explicite, calculé dans le navigateur) -----------------------------------------
  const E0 = p.effectif, C0 = p.capacite, T0 = p.enseignants, N0 = Math.max(1, p.etablissements);
  const E1 = E0 * (1 + croissance / 100);
  const C1 = C0 + constructions * CAPACITE_ETABLISSEMENT;
  const T1 = T0 + affectations;
  const N1 = N0 + constructions;

  const avant = { capacite: C0, occupation: (E0 / C0) * 100, ratio: E0 / T0, deficit: Math.max(0, E0 - C0), effectif: E0 };
  const sansMesure = { capacite: C0, occupation: (E1 / C0) * 100, ratio: E1 / T0, deficit: Math.max(0, E1 - C0), effectif: E1 };
  const apres = { capacite: C1, occupation: (E1 / C1) * 100, ratio: E1 / T1, deficit: Math.max(0, E1 - C1), effectif: E1 };

  const etabsPour100 = Math.max(0, Math.ceil((E1 - C0) / CAPACITE_ETABLISSEMENT));
  const ensPourSeuil = Math.max(0, Math.ceil(E1 / SEUIL_RATIO - T0));
  const annee = p.serie.at(-1)?.annee ?? "";

  // Trajectoire : série observée, puis croissance géométrique répartie sur 4 ans ; places avec mesures ouvertes en 2029-2030.
  const facteur = (k: number) => Math.pow(1 + croissance / 100, k / ANNEES_PROJECTION.length);
  const xs = [...p.serie.map((s) => s.annee), ...ANNEES_PROJECTION].map((a) => a.replace("-20", "-"));
  const series = [
    { nom: "Apprenants", points: xs.map((x, i) => ({ x, y: i < p.serie.length ? p.serie[i]!.effectif : Math.round(E0 * facteur(i - p.serie.length + 1)) })) },
    { nom: "Places sans mesure", points: xs.map((x, i) => ({ x, y: i >= p.serie.length - 1 ? C0 : null })) },
    { nom: "Places avec les mesures", points: xs.map((x, i) => ({ x, y: i < p.serie.length - 1 ? null : i === xs.length - 1 ? C1 : C0 })) },
  ];

  return (
    <div className={cn("space-y-6 transition-opacity", enChargement && "opacity-70")}>
      <Cascade className="grid gap-3 sm:grid-cols-2">
        <Element><Comparaison icone={School} libelle="Capacité d'accueil" avant={avant.capacite} apres={apres.capacite} format={(v) => entier(v)} unite="places" plusEstMieux formule={`${entier(C0)} + ${constructions} × ${CAPACITE_ETABLISSEMENT}`} /></Element>
        <Element><Comparaison icone={Building2} libelle="Taux d'occupation" avant={avant.occupation} apres={apres.occupation} sans={sansMesure.occupation} format={(v) => nombre(v, 1)} unite="%" seuil={{ valeur: SEUIL_OCCUPATION, libelle: `seuil d'alerte ${SEUIL_OCCUPATION} %` }} formule={`${entier(E1)} apprenants ÷ ${entier(C1)} places`} /></Element>
        <Element><Comparaison icone={GraduationCap} libelle="Apprenants par enseignant" avant={avant.ratio} apres={apres.ratio} sans={sansMesure.ratio} format={(v) => nombre(v, 1)} seuil={{ valeur: SEUIL_RATIO, libelle: `seuil d'alerte ${SEUIL_RATIO}` }} formule={`${entier(E1)} ÷ (${entier(T0)} + ${affectations})`} /></Element>
        <Element><Comparaison icone={TriangleAlert} libelle="Places manquantes" avant={avant.deficit} apres={apres.deficit} sans={sansMesure.deficit} format={(v) => entier(v)} unite="places" formule={`max(0 ; ${entier(E1)} − ${entier(C1)})`} /></Element>
      </Cascade>

      <Card className="min-w-0">
        <CardHeader icon={LineChart} title="Trajectoire des effectifs et des places" subtitle={`${nomCommune(p.commune.id)} · observé jusqu'en ${annee}, projeté jusqu'en ${ANNEE_CIBLE} (+${croissance} %)`} />
        <Courbes series={series} formater={(v) => compact(v)} hauteur={230} />
      </Card>

      <Card className="min-w-0">
        <CardHeader icon={Scale} title="Avant / après, en toute transparence" subtitle={`${nomCommune(p.commune.id)} · situation ${annee} et projection ${ANNEE_CIBLE}`} />
        <TableauDonnees
          colonnes={["Grandeur", `Aujourd'hui (${annee})`, `${ANNEE_CIBLE} sans mesure`, `${ANNEE_CIBLE} avec les mesures`]}
          lignes={[
            ["Apprenants", entier(avant.effectif), entier(sansMesure.effectif), entier(apres.effectif)],
            ["Établissements", entier(N0), entier(N0), entier(N1)],
            ["Capacité d'accueil", entier(avant.capacite), entier(sansMesure.capacite), entier(apres.capacite)],
            ["Taux d'occupation", pourcent(avant.occupation), pourcent(sansMesure.occupation), pourcent(apres.occupation)],
            ["Enseignants", entier(T0), entier(T0), entier(T1)],
            ["Apprenants par enseignant", nombre(avant.ratio, 1), nombre(sansMesure.ratio, 1), nombre(apres.ratio, 1)],
            ["Places manquantes", entier(avant.deficit), entier(sansMesure.deficit), entier(apres.deficit)],
          ]}
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Besoin
            atteint={apres.occupation <= 100}
            titre="Ramener l'occupation à 100 %"
            texte={etabsPour100 === 0 ? "La capacité actuelle suffit pour l'effectif projeté." : `Il faudrait ${pluriel(etabsPour100, "établissement")} de ${CAPACITE_ETABLISSEMENT} places (scénario : ${constructions}).`}
          />
          <Besoin
            atteint={apres.ratio <= SEUIL_RATIO}
            titre={`Passer sous ${SEUIL_RATIO} apprenants par enseignant`}
            texte={ensPourSeuil === 0 ? "L'effectif enseignant actuel suffit." : `Il faudrait ${entier(ensPourSeuil)} enseignants supplémentaires (scénario : ${affectations}).`}
          />
        </div>
      </Card>

      <section aria-labelledby="hypotheses" className="rounded-xl border border-warning/40 bg-warning-bg/50 p-5">
        <h2 id="hypotheses" className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <TriangleAlert size={16} className="text-warning" aria-hidden /> Hypothèses et limites du modèle
        </h2>
        <p className="mt-1 text-[13px] text-ink-2">Une projection sans hypothèses est une opinion chiffrée. Celles-ci conditionnent chaque chiffre ci-dessus.</p>
        <ul className="mt-3 grid gap-x-6 gap-y-2 text-[13px] text-ink-2 md:grid-cols-2">
          <li><span className="font-semibold text-ink">Capacité :</span> chaque établissement construit ajoute {CAPACITE_ETABLISSEMENT} places et ouvre en {ANNEE_CIBLE} ; aucun établissement existant ne ferme.</li>
          <li><span className="font-semibold text-ink">Effectifs :</span> la croissance choisie s'applique uniformément à tous les niveaux et à tous les établissements de la commune, répartie géométriquement sur quatre ans.</li>
          <li><span className="font-semibold text-ink">Enseignants :</span> les affectations s'ajoutent aux {entier(T0)} postes actuels ; départs à la retraite, mutations et abandons de poste ne sont pas modélisés.</li>
          <li><span className="font-semibold text-ink">Tendance :</span> taux annuel moyen observé de {pourcent(p.croissanceAnnuelle * 100)} sur {p.serie[0]?.annee} → {annee}, calculé par le serveur sur le registre.</li>
          <li><span className="font-semibold text-ink">Périmètre :</span> primaire et secondaire confondus ; un établissement construit sert indifféremment les deux cycles.</li>
          <li><span className="font-semibold text-ink">Non modélisé :</span> coût, foncier, délais de construction, distance domicile-établissement, qualification des enseignants, effets sur les résultats.</li>
          <li className="md:col-span-2"><span className="font-semibold text-ink">Données :</span> situation {annee} lue sur la plateforme{confiance != null ? ` (indice de confiance ${confiance} %)` : ""} ; le calcul du scénario, lui, est fait dans votre navigateur et n'est ni enregistré ni transmis.</li>
        </ul>
      </section>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line/70 bg-surface px-5 py-4 shadow-float">
        <Info size={18} className="shrink-0 text-blue" aria-hidden />
        <p className="min-w-0 flex-1 text-[14px] text-ink">
          <span className="font-semibold">Le système recommande ; l'autorité décide.</span>{" "}
          <span className="text-ink-2">Cette simulation éclaire un arbitrage, elle ne le remplace pas.</span>
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Curseur accessible */

function Curseur({ id, libelle, aide, valeur, min, max, pas = 1, onChange, format }: {
  id: string; libelle: string; aide?: string; valeur: number; min: number; max: number; pas?: number; onChange: (v: number) => void; format: (v: number) => string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-ink">{libelle}</label>
        <output htmlFor={id} className="shrink-0 whitespace-nowrap font-display text-[18px] font-bold text-ink tabular">{format(valeur)}</output>
      </div>
      <input
        id={id} type="range" min={min} max={max} step={pas} value={valeur}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={format(valeur)}
        className="mt-2 h-6 w-full cursor-pointer accent-[var(--blue)]"
      />
      <div className="flex justify-between text-[11px] text-ink-muted tabular" aria-hidden><span>{format(min)}</span><span>{format(max)}</span></div>
      {aide && <p className="mt-0.5 text-xs text-ink-muted">{aide}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ Comparaison avant / après */

function Comparaison({ icone: Icone, libelle, avant, apres, sans, format, unite, plusEstMieux, seuil, formule }: {
  icone: LucideIcon; libelle: string; avant: number; apres: number; sans?: number; format: (v: number) => string; unite?: string;
  plusEstMieux?: boolean; seuil?: { valeur: number; libelle: string }; formule: string;
}) {
  const delta = apres - avant;
  const neutre = Math.abs(delta) < 1e-9;
  const favorable = plusEstMieux ? delta > 0 : delta < 0;
  const auDessus = seuil ? apres > seuil.valeur : false;
  return (
    <div className="flex h-full flex-col rounded-lg border border-line/70 bg-surface px-4 py-3.5 shadow-float">
      <span className="flex items-center justify-between gap-3">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{libelle}</span>
        <Icone size={16} className="text-blue" aria-hidden />
      </span>
      <span className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[15px] text-ink-muted tabular line-through decoration-ink-muted/40" aria-label={`Avant : ${format(avant)}`}>{format(avant)}</span>
        <ArrowRight size={14} className="text-ink-muted" aria-hidden />
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={format(apres)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22, ease: EASE }} className="font-display text-2xl font-semibold leading-none text-ink tabular">
            {format(apres)}
          </motion.span>
        </AnimatePresence>
        {unite && <span className="text-[14px] font-semibold text-ink-muted">{unite}</span>}
      </span>
      <span className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
        {neutre ? <Badge>Inchangé</Badge> : <Badge ton={favorable ? "succes" : "critique"}>{delta > 0 ? "+" : "−"}{format(Math.abs(delta))} · {favorable ? "amélioration" : "dégradation"}</Badge>}
        {seuil && <Badge ton={auDessus ? "avertissement" : "neutre"} icone={auDessus ? TriangleAlert : Check}>{auDessus ? "au-dessus du" : "sous le"} {seuil.libelle}</Badge>}
      </span>
      {sans != null && <span className="mt-2 text-xs text-ink-muted">Sans mesure en {ANNEE_CIBLE} : <span className="font-semibold text-ink-2 tabular">{format(sans)}{unite ? ` ${unite}` : ""}</span></span>}
      <span className="mt-1 font-mono text-[11px] text-ink-muted">= {formule}</span>
    </div>
  );
}

function Besoin({ atteint, titre, texte }: { atteint: boolean; titre: string; texte: string }) {
  return (
    <motion.div layout className={cn("rounded-md px-3 py-2.5 text-[12.5px] transition-colors", atteint ? "bg-success-bg" : "bg-surface-2")}>
      <p className={cn("flex items-center gap-1.5 font-semibold", atteint ? "text-success" : "text-ink")}>
        {atteint ? <Check size={14} aria-hidden /> : <TriangleAlert size={14} className="text-warning" aria-hidden />}
        {titre} · {atteint ? "atteint par le scénario" : "non atteint"}
      </p>
      <p className="mt-0.5 text-ink-2">{texte}</p>
    </motion.div>
  );
}
