"use client";

import {
  ArrowRight, Building2, Check, GraduationCap, Info, RotateCcw, Route, Scale, School, SlidersHorizontal, TrendingUp, TriangleAlert, type LucideIcon,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { TableauDonnees } from "@/components/charts/Graphiques";
import { BadgeConfiance } from "@/components/ui/donnees";
import { Badge, Button, Card, CardHeader, PageHeader, Squelette } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { nomCommune, useCouches } from "@/lib/donnees";
import { entier, nombre, pourcent } from "@/lib/format";
import { ANNEE_COURANTE, ANNEES, type CommuneStats } from "@beile/simulation/macro";
import { calculer, communesDuPerimetre } from "@beile/simulation/semantique";
import { COMMUNES, DEPARTEMENTS } from "@beile/simulation/territoire";
import { useProfil } from "@/lib/store";

/**
 * Simulation « et si ? » (processus P2). Le calcul est volontairement simple et entièrement
 * exposé : chaque résultat est accompagné de sa formule et de ses hypothèses.
 */

const CAPACITE_ETABLISSEMENT = 600;
/** Seuils d'alerte de la carte « Où agir ? » (couche sémantique, `priorites`). */
const SEUIL_OCCUPATION = 112;
const SEUIL_RATIO = 54;
const ANNEE_CIBLE = "2029-2030";

const effectifDe = (c: CommuneStats, annee: (typeof ANNEES)[number]) =>
  Object.values(c.annees[annee].niveaux).reduce((s, n) => s + n.effectifF + n.effectifM, 0);

export default function Page() {
  return (
    <Suspense fallback={<div className="space-y-4"><Squelette className="h-10 w-80" /><Squelette className="h-[420px]" /></div>}>
      <Simulation />
    </Suspense>
  );
}

function Simulation() {
  const couches = useCouches();
  const profil = useProfil();
  const params = useSearchParams();

  const perimetre = profil.habilitations.find((h) => h.role === "administration_centrale" || h.role === "direction_departementale")?.perimetre ?? null;
  const autorisees = useMemo(() => communesDuPerimetre(perimetre), [perimetre]);
  const communesPossibles = useMemo(() => COMMUNES.filter((c) => !autorisees || autorisees.has(c.id)), [autorisees]);

  const occupationDe = (id: string) => {
    const c = couches.communes.get(id)!;
    return effectifDe(c, ANNEE_COURANTE) / c.annees[ANNEE_COURANTE].capacite;
  };
  const plusSaturees = useMemo(
    () => [...communesPossibles].sort((a, b) => occupationDe(b.id) - occupationDe(a.id)).slice(0, 4).map((c) => c.id),
    [communesPossibles], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const parDefaut = (() => {
    const demandee = params.get("commune");
    if (demandee && communesPossibles.some((c) => c.id === demandee)) return demandee;
    if (communesPossibles.some((c) => c.id === "abomey-calavi")) return "abomey-calavi";
    return plusSaturees[0] ?? communesPossibles[0]!.id;
  })();

  const [communeId, setCommuneId] = useState(parDefaut);
  const [constructions, setConstructions] = useState(3);
  const [affectations, setAffectations] = useState(20);
  const [croissance, setCroissance] = useState(10);

  const stats = couches.communes.get(communeId)!;
  const a = stats.annees[ANNEE_COURANTE];
  const etabs = couches.etablissementsParCommune.get(communeId) ?? [];
  const base = useMemo(() => calculer(couches, { indicateur: "effectif_apprenants", filtres: { communeId }, ventilation: [] }), [couches, communeId]);

  // Tendance observée 2021-2022 → 2025-2026, prolongée sur 4 ans jusqu'en 2029-2030.
  const tauxAnnuel = Math.pow(effectifDe(stats, ANNEE_COURANTE) / effectifDe(stats, ANNEES[0]), 1 / (ANNEES.length - 1)) - 1;
  const tendance2030 = Math.min(30, Math.max(0, Math.round((Math.pow(1 + tauxAnnuel, 4) - 1) * 100)));

  // --- Modèle -------------------------------------------------------------------------------
  const E0 = effectifDe(stats, ANNEE_COURANTE);
  const C0 = a.capacite, T0 = a.enseignants, N0 = Math.max(1, etabs.length), D0 = stats.distanceMoyenneKm;
  const E1 = E0 * (1 + croissance / 100);
  const C1 = C0 + constructions * CAPACITE_ETABLISSEMENT;
  const T1 = T0 + affectations;
  const N1 = N0 + constructions;
  const D1 = D0 * Math.sqrt(N0 / N1);

  const avant = { capacite: C0, occupation: (E0 / C0) * 100, ratio: E0 / T0, distance: D0, effectif: E0 };
  const sansMesure = { capacite: C0, occupation: (E1 / C0) * 100, ratio: E1 / T0, distance: D0, effectif: E1 };
  const apres = { capacite: C1, occupation: (E1 / C1) * 100, ratio: E1 / T1, distance: D1, effectif: E1 };

  const etabsPour100 = Math.max(0, Math.ceil((E1 - C0) / CAPACITE_ETABLISSEMENT));
  const ensPourSeuil = Math.max(0, Math.ceil(E1 / SEUIL_RATIO - T0));

  const reinitialiser = () => { setConstructions(3); setAffectations(20); setCroissance(10); };

  return (
    <div className="space-y-6">
      <PageHeader
        surtitre="Planification et allocation · P2"
        titre="Simulation « et si ? »"
        sousTitre="Mesurez l'effet d'une décision avant de la prendre : construire des établissements, affecter des enseignants, face à la croissance attendue des effectifs d'ici 2030."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {/* ---------------------------------------------------------------- Paramètres */}
        <Card className="h-fit lg:sticky lg:top-24">
          <CardHeader icon={SlidersHorizontal} title="Scénario" action={<Button variante="fantome" taille="sm" icone={RotateCcw} onClick={reinitialiser}>Réinitialiser</Button>} />

          <label htmlFor="commune" className="block text-[13px] font-semibold text-ink">Commune</label>
          <select
            id="commune"
            value={communeId}
            onChange={(e) => setCommuneId(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-md border border-line bg-surface px-3 text-[14px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-blue"
          >
            {DEPARTEMENTS.filter((d) => communesPossibles.some((c) => c.departementId === d.id)).map((d) => (
              <optgroup key={d.id} label={d.nom}>
                {communesPossibles.filter((c) => c.departementId === d.id).map((c) => (
                  <option key={c.id} value={c.id}>{c.nom} — occupation {nombre(occupationDe(c.id) * 100, 0)} %</option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className="mt-2 text-[12px] text-ink-muted">Les plus saturées{autorisees ? " de votre périmètre" : ""} :</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {plusSaturees.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setCommuneId(id)}
                aria-pressed={communeId === id}
                className={cn("rounded-sm px-2.5 py-1 text-[12px] font-medium transition-colors", communeId === id ? "bg-navy text-white dark:bg-blue dark:text-navy-deep" : "bg-surface-2 text-ink-2 hover:text-ink")}
              >
                {nomCommune(id)} · {nombre(occupationDe(id) * 100, 0)} %
              </button>
            ))}
          </div>

          <div className="mt-6 space-y-6">
            <Curseur id="constructions" libelle="Établissements à construire" aide={`Capacité : ${entier(CAPACITE_ETABLISSEMENT)} places chacun`} valeur={constructions} min={0} max={10} onChange={setConstructions} format={(v) => `${v}`} />
            <Curseur id="affectations" libelle="Enseignants à affecter" aide={`${entier(T0)} en poste aujourd'hui`} valeur={affectations} min={0} max={200} pas={5} onChange={setAffectations} format={(v) => `+${v}`} />
            <Curseur id="croissance" libelle="Croissance des effectifs d'ici 2030" aide={`Tendance observée prolongée : +${tendance2030} %`} valeur={croissance} min={0} max={30} onChange={setCroissance} format={(v) => `+${v} %`} />
            <Button variante="secondaire" taille="sm" icone={TrendingUp} onClick={() => setCroissance(tendance2030)} className="w-full">
              Appliquer la tendance observée (+{tendance2030} %)
            </Button>
          </div>

          <div className="mt-6 border-t border-line/60 pt-4 text-[12px] text-ink-muted">
            <p className="flex flex-wrap items-center gap-2"><span>Données de base : {nomCommune(communeId)}, {ANNEE_COURANTE}</span><BadgeConfiance confiance={base.confiance} /></p>
            <p className="mt-1.5">{entier(base.couverture.etablissementsAyantTransmis)} établissements sur {entier(base.couverture.etablissementsAttendus)} ont transmis. Source : {base.definition.source}.</p>
          </div>
        </Card>

        {/* ---------------------------------------------------------------- Résultats */}
        <div className="min-w-0 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Comparaison icone={School} libelle="Capacité d'accueil" avant={avant.capacite} apres={apres.capacite} format={(v) => entier(v)} unite="places" plusEstMieux formule={`${entier(C0)} + ${constructions} × ${CAPACITE_ETABLISSEMENT}`} />
            <Comparaison icone={Building2} libelle="Taux d'occupation" avant={avant.occupation} apres={apres.occupation} sans={sansMesure.occupation} format={(v) => nombre(v, 1)} unite="%" seuil={{ valeur: SEUIL_OCCUPATION, libelle: `seuil d'alerte ${SEUIL_OCCUPATION} %` }} formule={`${entier(E1)} apprenants ÷ ${entier(C1)} places`} />
            <Comparaison icone={GraduationCap} libelle="Apprenants par enseignant" avant={avant.ratio} apres={apres.ratio} sans={sansMesure.ratio} format={(v) => nombre(v, 1)} seuil={{ valeur: SEUIL_RATIO, libelle: `seuil d'alerte ${SEUIL_RATIO}` }} formule={`${entier(E1)} ÷ (${entier(T0)} + ${affectations})`} />
            <Comparaison icone={Route} libelle="Distance moyenne estimée" avant={avant.distance} apres={apres.distance} format={(v) => nombre(v, 2)} unite="km" formule={`${nombre(D0, 1)} × √(${N0} ÷ ${N1})`} />
          </div>

          <Card>
            <CardHeader icon={Scale} title="Avant / après, en toute transparence" subtitle={`${nomCommune(communeId)} · situation ${ANNEE_COURANTE} et projection ${ANNEE_CIBLE}`} />
            <TableauDonnees
              colonnes={["Grandeur", `Aujourd'hui (${ANNEE_COURANTE})`, `${ANNEE_CIBLE} sans mesure`, `${ANNEE_CIBLE} avec les mesures`]}
              lignes={[
                ["Apprenants", entier(avant.effectif), entier(sansMesure.effectif), entier(apres.effectif)],
                ["Établissements", entier(N0), entier(N0), entier(N1)],
                ["Capacité d'accueil", entier(avant.capacite), entier(sansMesure.capacite), entier(apres.capacite)],
                ["Taux d'occupation", pourcent(avant.occupation), pourcent(sansMesure.occupation), pourcent(apres.occupation)],
                ["Enseignants", entier(T0), entier(T0), entier(T1)],
                ["Apprenants par enseignant", nombre(avant.ratio, 1), nombre(sansMesure.ratio, 1), nombre(apres.ratio, 1)],
                ["Distance moyenne (km)", nombre(avant.distance, 2), nombre(sansMesure.distance, 2), nombre(apres.distance, 2)],
              ]}
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Besoin
                atteint={apres.occupation <= 100}
                titre="Ramener l'occupation à 100 %"
                texte={etabsPour100 === 0 ? "La capacité actuelle suffit pour l'effectif projeté." : `Il faudrait ${etabsPour100} établissement${etabsPour100 > 1 ? "s" : ""} de ${CAPACITE_ETABLISSEMENT} places (scénario : ${constructions}).`}
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
              <li><span className="font-semibold text-ink">Capacité :</span> chaque établissement construit ajoute {CAPACITE_ETABLISSEMENT} places et est ouvert en {ANNEE_CIBLE} ; aucun établissement existant ne ferme.</li>
              <li><span className="font-semibold text-ink">Effectifs :</span> la croissance choisie s'applique uniformément à tous les niveaux et à tous les établissements de la commune.</li>
              <li><span className="font-semibold text-ink">Enseignants :</span> les affectations s'ajoutent aux {entier(T0)} postes actuels ; départs à la retraite, mutations et abandons de poste ne sont pas modélisés.</li>
              <li><span className="font-semibold text-ink">Distance :</span> distance ∝ 1/√(nombre d'établissements), ce qui suppose des établissements et une population répartis uniformément sur le territoire communal.</li>
              <li><span className="font-semibold text-ink">Périmètre :</span> primaire et secondaire confondus ; un établissement construit sert indifféremment les deux cycles.</li>
              <li><span className="font-semibold text-ink">Non modélisé :</span> coût, foncier, délais de construction, qualification des enseignants, effets sur les résultats scolaires.</li>
              <li className="md:col-span-2"><span className="font-semibold text-ink">Données :</span> situation {ANNEE_COURANTE} provisoire (indice de confiance {base.confiance.score} %) ; données entièrement fictives, générées pour la démonstration.</li>
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
        <label htmlFor={id} className="text-[13px] font-semibold text-ink">{libelle}</label>
        <output htmlFor={id} className="shrink-0 whitespace-nowrap font-display text-[18px] font-bold text-ink tabular">{format(valeur)}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={pas}
        value={valeur}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={format(valeur)}
        className="mt-2 h-6 w-full cursor-pointer accent-[var(--blue)]"
      />
      <div className="flex justify-between text-[11px] text-ink-muted tabular" aria-hidden><span>{format(min)}</span><span>{format(max)}</span></div>
      {aide && <p className="mt-0.5 text-[12px] text-ink-muted">{aide}</p>}
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
    <div className="flex flex-col rounded-lg border border-line/70 bg-surface px-4 py-3.5 shadow-float">
      <span className="flex items-center justify-between gap-3">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{libelle}</span>
        <Icone size={16} className="text-blue" aria-hidden />
      </span>
      <span className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[15px] text-ink-muted tabular line-through decoration-ink-muted/40" aria-label={`Avant : ${format(avant)}`}>{format(avant)}</span>
        <ArrowRight size={14} className="text-ink-muted" aria-hidden />
        <span className="font-display text-[26px] font-bold leading-none text-ink tabular">{format(apres)}</span>
        {unite && <span className="text-[14px] font-semibold text-ink-muted">{unite}</span>}
      </span>
      <span className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
        {neutre ? (
          <Badge>Inchangé</Badge>
        ) : (
          <Badge ton={favorable ? "succes" : "critique"}>{delta > 0 ? "+" : "−"}{format(Math.abs(delta))} · {favorable ? "amélioration" : "dégradation"}</Badge>
        )}
        {seuil && (
          <Badge ton={auDessus ? "avertissement" : "neutre"} icone={auDessus ? TriangleAlert : Check}>{auDessus ? "au-dessus du" : "sous le"} {seuil.libelle}</Badge>
        )}
      </span>
      {sans != null && <span className="mt-2 text-[12px] text-ink-muted">Sans mesure en {ANNEE_CIBLE} : <span className="font-semibold text-ink-2 tabular">{format(sans)}{unite ? ` ${unite}` : ""}</span></span>}
      <span className="mt-1 font-mono text-[11px] text-ink-muted">= {formule}</span>
    </div>
  );
}

function Besoin({ atteint, titre, texte }: { atteint: boolean; titre: string; texte: string }) {
  return (
    <div className={cn("rounded-md px-3 py-2.5 text-[12.5px]", atteint ? "bg-success-bg" : "bg-surface-2")}>
      <p className={cn("flex items-center gap-1.5 font-semibold", atteint ? "text-success" : "text-ink")}>
        {atteint ? <Check size={14} aria-hidden /> : <TriangleAlert size={14} className="text-warning" aria-hidden />}
        {titre} · {atteint ? "atteint par le scénario" : "non atteint"}
      </p>
      <p className="mt-0.5 text-ink-2">{texte}</p>
    </div>
  );
}

