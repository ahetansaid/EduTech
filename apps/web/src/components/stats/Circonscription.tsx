"use client";

import { BarChart3, ChevronDown, Download } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { BarresClassees, SERIES, type Barre } from "@/components/charts/Graphiques";
import { Button, Card, Segmente } from "@/components/ui/primitives";
import type { EtablissementTerritoire, Infrastructures } from "@/lib/api/pilotage";
import { cn } from "@/lib/cn";
import { exporterStats, type LigneStat } from "@/lib/export";
import { entier, nombre, pourcent } from "@/lib/format";
import { ecartType, mediane, moyenne, quantile, repartir, type Bande } from "@/lib/statistiques";

/**
 * Statistiques descriptives d'un territoire de pilotage (circonscription pour l'inspecteur, département
 * pour la direction), calculées sur les établissements *déjà chargés* par la console — aucun appel
 * serveur, aucun nouvel accès.
 *
 * Grain = établissement : les valeurs portées ici (occupation, élèves/enseignant, infrastructures) sont
 * des ratios de locaux et d'encadrement, déjà affichés ligne par ligne dans le tableau de la console.
 * Elles ne révèlent donc aucune donnée d'élève ; aucun masquage n'est nécessaire à ce grain. Le
 * masquement des petits effectifs relève d'un agrégat qui descendrait sous l'établissement (classe, école
 * isolée), ce que cette console n'expose pas.
 *
 * Une moyenne territoriale masque des écarts entre établissements : d'où la médiane, l'écart-type, les
 * quartiles et les bandes, montrés côte à côte — le repère qui sert à l'arbitrage est la dispersion.
 */

const occupationDe = (e: EtablissementTerritoire) => (e.effectif / Math.max(1, e.capacite)) * 100;
const ratioDe = (e: EtablissementTerritoire) => e.effectif / Math.max(1, e.enseignants);
const SEUIL_SATURE = 110;
const SEUIL_SURCHARGE = 54;

const BANDES_OCCUPATION: Bande[] = [
  { libelle: "moins de 70 %", max: 70 },
  { libelle: "70 à 89 %", max: 90 },
  { libelle: "90 à 109 %", max: 110 },
  { libelle: "110 à 129 %", max: 130 },
  { libelle: "130 % et plus" },
];
const BANDES_RATIO: Bande[] = [
  { libelle: "moins de 30", max: 30 },
  { libelle: "30 à 39", max: 40 },
  { libelle: "40 à 53", max: 54 },
  { libelle: "54 à 69", max: 70 },
  { libelle: "70 et plus" },
];

const EQUIPEMENTS: { cle: keyof Infrastructures; libelle: string }[] = [
  { cle: "eau", libelle: "Point d'eau" },
  { cle: "electricite", libelle: "Électricité" },
  { cle: "internet", libelle: "Internet" },
  { cle: "latrines", libelle: "Latrines" },
  { cle: "bibliotheque", libelle: "Bibliothèque" },
];

type Comparateur = "occupation" | "ratio";

export function StatsCirconscription({ etabs, infra, inspecteur }: {
  etabs: EtablissementTerritoire[];
  infra?: { id: string; infrastructures: Infrastructures }[];
  inspecteur: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [critere, setCritere] = useState<Comparateur>("occupation");

  const s = useMemo(() => {
    const occ = etabs.map(occupationDe);
    const rat = etabs.map(ratioDe);
    const trier = (xs: number[]) => [...xs].sort((a, b) => a - b);
    const tOcc = trier(occ);
    const infraDe = new Map(infra?.map((x) => [x.id, x.infrastructures]) ?? []);
    const equipes = [...infraDe.values()];
    return {
      n: etabs.length,
      occMoy: moyenne(occ), occMed: mediane(occ), occEcart: ecartType(occ),
      occMin: tOcc[0] ?? null, occQ1: quantile(tOcc, 0.25), occQ3: quantile(tOcc, 0.75), occMax: tOcc.at(-1) ?? null,
      ratMoy: moyenne(rat), ratMed: mediane(rat), ratEcart: ecartType(rat),
      saturés: occ.filter((v) => v > SEUIL_SATURE).length,
      surchargées: rat.filter((v) => v > SEUIL_SURCHARGE).length,
      bandesOcc: bandes(BANDES_OCCUPATION, repartir(occ, BANDES_OCCUPATION)),
      bandesRat: bandes(BANDES_RATIO, repartir(rat, BANDES_RATIO)),
      classées: [...etabs]
        .sort((a, b) => (critere === "occupation" ? occupationDe(b) - occupationDe(a) : ratioDe(b) - ratioDe(a)))
        .map((e) => ({
          cle: e.id, libelle: e.nom,
          valeur: critere === "occupation" ? occupationDe(e) : ratioDe(e),
          effectif: e.effectif,
          accent: critere === "occupation" ? occupationDe(e) > SEUIL_SATURE : ratioDe(e) > SEUIL_SURCHARGE,
        })),
      mediatrice: critere === "occupation" ? mediane(occ) : mediane(rat),
      infra: infra ? EQUIPEMENTS.map((q) => ({ ...q, taux: equipes.length ? (equipes.filter((i) => i[q.cle]).length / equipes.length) * 100 : null })) : null,
      infraN: equipes.length,
    };
  }, [etabs, infra, critere]);

  const titre = inspecteur ? "Statistiques de la circonscription" : "Statistiques du département";

  // Même principle : on n'invente aucune donnée. On sérialise le portrait déjà calculé au grain établissement.
  function exporter() {
    const l: LigneStat[] = [
      { section: "Résumé", indicateur: "Établissements dans le périmètre", valeur: entier(s.n) },
      { section: "Résumé", indicateur: "Occupation — médiane", valeur: pourcent(s.occMed, 0) },
      { section: "Résumé", indicateur: "Occupation — moyenne", valeur: pourcent(s.occMoy, 0) },
      { section: "Résumé", indicateur: "Occupation — écart-type", valeur: `${nombre(s.occEcart, 0)} pt` },
      { section: "Résumé", indicateur: "Occupation — minimum", valeur: pourcent(s.occMin, 0) },
      { section: "Résumé", indicateur: "Occupation — 1er quartile", valeur: pourcent(s.occQ1, 0) },
      { section: "Résumé", indicateur: "Occupation — 3e quartile", valeur: pourcent(s.occQ3, 0) },
      { section: "Résumé", indicateur: "Occupation — maximum", valeur: pourcent(s.occMax, 0) },
      { section: "Résumé", indicateur: "Élèves/enseignant — médian", valeur: nombre(s.ratMed, 0) },
      { section: "Résumé", indicateur: "Élèves/enseignant — moyenne", valeur: nombre(s.ratMoy, 0) },
      { section: "Résumé", indicateur: "Élèves/enseignant — écart-type", valeur: nombre(s.ratEcart, 0) },
      { section: "Résumé", indicateur: `Établissements saturés (> ${SEUIL_SATURE} %)`, valeur: `${entier(s.saturés)} / ${entier(s.n)}` },
      { section: "Résumé", indicateur: `Classes surchargées (> ${SEUIL_SURCHARGE} élèves/ens.)`, valeur: `${entier(s.surchargées)} / ${entier(s.n)}` },
    ];
    for (const b of s.bandesOcc) l.push({ section: "Bandes d'occupation", indicateur: b.libelle, valeur: entier(b.valeur ?? 0) });
    for (const b of s.bandesRat) l.push({ section: "Bandes d'élèves/enseignant", indicateur: b.libelle, valeur: entier(b.valeur ?? 0) });
    l.push({ section: "Comparateur", indicateur: "Critère", valeur: critere === "occupation" ? "Taux d'occupation" : "Élèves par enseignant" });
    for (const c of s.classées) l.push({ section: "Comparateur", indicateur: c.libelle, valeur: (critere === "occupation" ? pourcent(c.valeur, 0) : nombre(c.valeur, 0)) + (c.accent ? " (au-dessus du seuil)" : "") });
    if (s.infra) for (const q of s.infra) l.push({ section: "Infrastructures", indicateur: q.libelle, valeur: q.taux != null ? pourcent(q.taux, 0) : "—" });
    exporterStats(
      inspecteur ? "Statistiques circonscription" : "Statistiques département",
      l,
      `Export BEILE du ${new Date().toLocaleDateString("fr-FR")} — portrait descriptif de vos ${entier(s.n)} établissements (grain établissement : aucun chiffre d'élève). Périmètre limité à la console que votre habilitation autorise déjà à consulter.`,
    );
  }

  return (
    <Card data-guide="territoire-stats" className="min-w-0 overflow-hidden p-0">
      <button onClick={() => setOuvert((v) => !v)} aria-expanded={ouvert} className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-soft text-accent-ink"><BarChart3 size={16} aria-hidden /></span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-ink">{titre}</span>
            <span className="block text-xs text-ink-muted">
              {s.n ? `${entier(s.n)} établissements · occupation médiane ${pourcent(s.occMed, 0)} · ${entier(s.saturés)} saturé(s) · ${entier(s.surchargées)} classe(s) surchargée(s)` : "Aucun établissement dans le périmètre"}
            </span>
          </span>
        </span>
        <ChevronDown size={18} className={cn("shrink-0 text-ink-muted transition-transform duration-200", ouvert && "rotate-180")} aria-hidden />
      </button>

      {ouvert && s.n > 0 && (
        <div className="space-y-6 border-t border-line/60 px-5 py-5">
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <Puce libelle="Occupation médiane" valeur={pourcent(s.occMed, 0)} aide={`moyenne ${pourcent(s.occMoy, 0)} · écart-type ${nombre(s.occEcart, 0)} pt`} />
            <Puce libelle="Établissements saturés" valeur={`${entier(s.saturés)} / ${entier(s.n)}`} aide={`occupation > ${SEUIL_SATURE} %`} accent={s.saturés > 0} />
            <Puce libelle="Élèves / enseignant (médian)" valeur={nombre(s.ratMed, 0)} aide={`moyenne ${nombre(s.ratMoy, 0)} · écart-type ${nombre(s.ratEcart, 0)}`} />
            <Puce libelle="Classes surchargées" valeur={`${entier(s.surchargées)} / ${entier(s.n)}`} aide={`plus de ${SEUIL_SURCHARGE} élèves par enseignant`} accent={s.surchargées > 0} />
          </div>

          <section>
            <SousTitre>Étendue de l'occupation</SousTitre>
            <p className="mt-1 text-[13px] text-ink-2">
              De {pourcent(s.occMin, 0)} à {pourcent(s.occMax, 0)}, la moitié des établissements tenant entre {pourcent(s.occQ1, 0)} et {pourcent(s.occQ3, 0)}. {s.occEcart != null && s.occEcart > 20 ? "La dispersion est forte : la moyenne territoriale cache des situations opposées." : "La dispersion est modérée."}
            </p>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <SousTitre>Répartition par taux d'occupation</SousTitre>
              <BarresClassees barres={s.bandesOcc} formater={entier} couleur={SERIES[0]} className="mt-2" />
            </section>
            <section>
              <SousTitre>Répartition par élèves / enseignant</SousTitre>
              <BarresClassees barres={s.bandesRat} formater={entier} couleur={SERIES[1]} className="mt-2" />
            </section>
          </div>

          <section>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SousTitre>Comparateur d'établissements</SousTitre>
              <Segmente label="Critère de comparaison" valeur={critere} onChange={setCritere} options={[{ valeur: "occupation", libelle: "Occupation" }, { valeur: "ratio", libelle: "Élèves / ens." }]} />
            </div>
            <BarresClassees
              key={critere}
              barres={s.classées}
              formater={(v) => (critere === "occupation" ? pourcent(v, 0) : nombre(v, 0))}
              reference={s.mediatrice != null ? { valeur: s.mediatrice, libelle: "Médiane du territoire" } : undefined}
              limite={12}
              className="mt-2"
            />
          </section>

          <section>
            <SousTitre>Couverture en infrastructures</SousTitre>
            {s.infra == null ? (
              <p className="mt-1 text-[13px] text-ink-muted">Données d'infrastructure en cours de chargement.</p>
            ) : s.infraN === 0 ? (
              <p className="mt-1 text-[13px] text-ink-muted">Aucune infrastructure renseignée pour les établissements du périmètre.</p>
            ) : (
              <>
                <BarresClassees
                  barres={s.infra.map((q) => ({ cle: q.cle, libelle: q.libelle, valeur: q.taux }))}
                  formater={(v) => pourcent(v, 0)}
                  max={100}
                  couleur={SERIES[2]}
                  className="mt-2"
                />
                <p className="mt-1.5 text-[12px] text-ink-muted">Part des {entier(s.infraN)} établissements disposant de chaque équipement.</p>
              </>
            )}
          </section>

          <div className="flex items-center justify-between gap-3 border-t border-line/60 pt-4">
            <p className="min-w-0 text-[11.5px] text-ink-muted">
              Lecture descriptive de vos {entier(s.n)} établissements : occupation, encadrement et infrastructures, agrégés au grain de l'établissement — les mêmes valeurs que le tableau ci-dessous, résumées pour situer les écarts. Aucune donnée d'élève n'entre dans ces chiffres.
            </p>
            <Button variante="secondaire" taille="sm" icone={Download} onClick={exporter} className="shrink-0">
              Exporter (CSV)
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function bandes(bandes: Bande[], effectifs: number[]): Barre[] {
  return bandes.map((b, i) => ({ cle: b.libelle, libelle: b.libelle, valeur: effectifs[i] ?? 0 }));
}

function Puce({ libelle, valeur, aide, accent }: { libelle: string; valeur: string; aide?: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-lg border px-3.5 py-2.5", accent ? "border-critical/30 bg-critical-bg/50" : "border-line/70 bg-surface-2/50")}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{libelle}</p>
      <p className={cn("mt-0.5 text-[18px] font-bold tabular", accent ? "text-critical" : "text-ink")}>{valeur}</p>
      {aide && <p className="text-[11px] text-ink-muted">{aide}</p>}
    </div>
  );
}

function SousTitre({ children }: { children: ReactNode }) {
  return <h3 className="text-[13.5px] font-semibold text-ink">{children}</h3>;
}
