"use client";

import type { DefinitionIndicateur } from "@beile/contracts";
import { DIMENSION_LIBELLE } from "@beile/contracts";
import { BookMarked, Database, FileClock, History, Lock, Search, ShieldCheck, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Card, CardHeader, EtatVide, Etiquette, PageHeader, Segmente } from "@/components/ui/primitives";
import { TuileIndicateur } from "@/components/ui/donnees";
import { cn } from "@/lib/cn";
import { useCouches } from "@/lib/donnees";
import { date, entier, pourcent } from "@/lib/format";
import { ANNEE_COURANTE } from "@/lib/sim/macro";
import { DICTIONNAIRE } from "@/lib/sim/semantique";

/* ------------------------------------------------------------------ Référentiels d'affichage */

const UNITE_LIBELLE: Record<DefinitionIndicateur["unite"], string> = {
  nombre: "Nombre",
  pourcentage: "Pourcentage",
  note: "Note sur 20",
  ratio: "Ratio",
};

type FiltreUnite = "toutes" | DefinitionIndicateur["unite"];
const FILTRES_UNITE: { valeur: FiltreUnite; libelle: string }[] = [
  { valeur: "toutes", libelle: "Toutes" },
  { valeur: "pourcentage", libelle: "Taux" },
  { valeur: "nombre", libelle: "Effectifs" },
  { valeur: "ratio", libelle: "Ratios" },
  { valeur: "note", libelle: "Notes" },
];

/** Historique de versions de l'indicateur « taux_reussite_examen » (simulé, à des fins de démonstration). */
interface VersionIndicateur {
  version: string;
  statut: "en_vigueur" | "remplacee";
  publieeLe: string;
  remplaceeLe?: string;
  formule: string;
  motif: string;
  validePar: string;
}

const HISTORIQUE_REUSSITE: VersionIndicateur[] = [
  {
    version: "3.1",
    statut: "en_vigueur",
    publieeLe: "2025-10-06",
    formule: "candidats admis ÷ candidats présents × 100",
    motif: "Précision de la notion de « présent » : un candidat absent à au moins une épreuve obligatoire n'est pas compté comme présent (alignement sur le règlement des examens). La formule ne change pas.",
    validePar: "Comité du dictionnaire national · séance du 30/09/2025",
  },
  {
    version: "3.0",
    statut: "remplacee",
    publieeLe: "2024-09-02",
    remplaceeLe: "2025-10-06",
    formule: "candidats admis ÷ candidats présents × 100",
    motif: "Dénominateur passé des inscrits aux présents. Un candidat absent n'a pas été évalué : le compter faisait baisser artificiellement la réussite des départements où l'absentéisme aux examens est plus fort.",
    validePar: "Comité du dictionnaire national · séance du 26/08/2024",
  },
  {
    version: "2.1",
    statut: "remplacee",
    publieeLe: "2022-10-03",
    remplaceeLe: "2024-09-02",
    formule: "candidats admis ÷ candidats inscrits × 100",
    motif: "Ajout de la ventilation par milieu (urbain, rural). Définition et formule inchangées.",
    validePar: "Comité du dictionnaire national · séance du 27/09/2022",
  },
  {
    version: "2.0",
    statut: "remplacee",
    publieeLe: "2021-09-06",
    remplaceeLe: "2022-10-03",
    formule: "candidats admis ÷ candidats inscrits × 100",
    motif: "Première définition commune aux trois examens (CEP, BEPC, baccalauréat). Remplace les définitions propres à chaque direction.",
    validePar: "Comité du dictionnaire national · séance du 31/08/2021",
  },
];

/* ------------------------------------------------------------------ Page */

export default function DictionnairePage() {
  const couches = useCouches();
  const [recherche, setRecherche] = useState("");
  const [unite, setUnite] = useState<FiltreUnite>("toutes");
  const [proprietaire, setProprietaire] = useState("tous");

  const indicateurs = useMemo(() => Object.values(DICTIONNAIRE), []);
  const proprietaires = useMemo(() => [...new Set(indicateurs.map((d) => d.proprietaire))].sort((a, b) => a.localeCompare(b, "fr")), [indicateurs]);

  const filtres = useMemo(() => {
    const q = normaliser(recherche.trim());
    return indicateurs.filter((d) =>
      (unite === "toutes" || d.unite === unite) &&
      (proprietaire === "tous" || d.proprietaire === proprietaire) &&
      (!q || [d.nom, d.code, d.definition, d.formule, d.proprietaire].some((t) => normaliser(t).includes(q))),
    );
  }, [indicateurs, recherche, unite, proprietaire]);

  // Effet réel d'un changement de définition : BEPC 2025-2026, calculé selon la v2.x puis selon la v3.x.
  const impact = useMemo(() => {
    let inscrits = 0, presents = 0, admis = 0;
    for (const c of couches.communes.values()) {
      const e = c.examens[ANNEE_COURANTE].BEPC;
      inscrits += e.inscrits; presents += e.presents; admis += e.admis;
    }
    return { inscrits, presents, admis, v2: (admis / inscrits) * 100, v3: (admis / presents) * 100 };
  }, [couches]);

  const seuilMax = Math.max(...indicateurs.map((d) => d.effectifMinimalPublication));

  return (
    <div className="space-y-6">
      <PageHeader
        surtitre="Données · P1 · P13"
        titre="Dictionnaire national des données"
        sousTitre="La définition officielle de chaque indicateur : ce qu'il mesure, comment il se calcule, d'où viennent les données et qui en répond. Tous les écrans et Ask Education calculent à partir de ces définitions."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TuileIndicateur libelle="Indicateurs publiés" icone={Database} accent="bleu" valeur={entier(indicateurs.length)} indice="Aucun autre indicateur n'est calculable" />
        <TuileIndicateur libelle="Directions propriétaires" icone={Users} accent="sarcelle" valeur={entier(proprietaires.length)} indice="Chaque indicateur a un responsable" />
        <TuileIndicateur libelle="Versions en vigueur" icone={FileClock} accent="ambre" valeur={entier(indicateurs.length)} indice="Une seule version active par indicateur" />
        <TuileIndicateur libelle="Seuil de publication" icone={Lock} accent="neutre" valeur={`1 à ${seuilMax}`} unite="apprenants" indice="En dessous : cellule masquée" />
      </div>

      <Card className="border-blue/25 bg-blue-soft/50">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface text-accent-ink shadow-soft">
            <ShieldCheck size={19} aria-hidden />
          </span>
          <div className="min-w-0 space-y-2">
            <p className="font-display text-[16px] font-bold text-ink">La règle du dictionnaire</p>
            <ul className="space-y-1.5 text-[14px] text-ink-2">
              <li><strong className="text-ink">Aucun indicateur n'est publié avant d'avoir été défini.</strong> Un chiffre sans définition au dictionnaire ne peut être ni affiché, ni demandé à Ask Education.</li>
              <li><strong className="text-ink">Une version publiée n'est jamais modifiée : elle est remplacée.</strong> Chaque chiffre affiché renvoie à la version exacte de sa définition, et les chiffres anciens restent reproductibles.</li>
              <li><strong className="text-ink">Les petites cellules sont masquées.</strong> Sous le seuil de publication, la valeur n'est pas affichée, pour éviter qu'on reconnaisse une personne.</li>
            </ul>
          </div>
        </div>
      </Card>

      <Card className="p-0">
        <div className="flex flex-col gap-3 border-b border-line/60 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <label htmlFor="recherche-dico" className="text-[12px] font-semibold text-ink-2">Rechercher un indicateur</label>
            <div className="relative mt-1.5 max-w-md">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
              <input
                id="recherche-dico"
                type="search"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Nom, code, formule, direction…"
                className="h-10 w-full rounded-sm border border-line bg-surface pl-9 pr-3 text-[14px] text-ink placeholder:text-ink-muted"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <p className="mb-1.5 text-[12px] font-semibold text-ink-2" id="lib-unite">Unité</p>
              <div className="max-w-full overflow-x-auto"><Segmente label="Filtrer par unité" options={FILTRES_UNITE} valeur={unite} onChange={setUnite} /></div>
            </div>
            <div className="min-w-0">
              <label htmlFor="filtre-proprio" className="mb-1.5 block text-[12px] font-semibold text-ink-2">Direction propriétaire</label>
              <select
                id="filtre-proprio"
                value={proprietaire}
                onChange={(e) => setProprietaire(e.target.value)}
                className="h-10 w-full max-w-[20rem] rounded-sm border border-line bg-surface px-3 text-[13.5px] text-ink"
              >
                <option value="tous">Toutes les directions</option>
                {proprietaires.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
        </div>
        <p className="px-5 pt-3 text-[12.5px] text-ink-muted" aria-live="polite">
          {filtres.length} indicateur{filtres.length > 1 ? "s" : ""} sur {indicateurs.length}
        </p>
        {filtres.length ? (
          <ul className="grid grid-cols-1 gap-4 p-5 xl:grid-cols-2">
            {filtres.map((d, i) => (
              <li key={d.code} className="animate-row" style={{ animationDelay: `${i * 30}ms` }}>
                <FicheIndicateur d={d} />
              </li>
            ))}
          </ul>
        ) : (
          <EtatVide
            icone={Search}
            titre="Aucun indicateur ne correspond"
            texte="Le dictionnaire ne contient que les indicateurs officiellement définis. Modifiez la recherche ou les filtres."
            action={<button onClick={() => { setRecherche(""); setUnite("toutes"); setProprietaire("tous"); }} className="inline-flex items-center gap-1 text-[13px] font-semibold text-blue hover:underline"><X size={14} aria-hidden /> Effacer les filtres</button>}
          />
        )}
      </Card>

      <Card id="historique" className="scroll-mt-24">
        <CardHeader
          icon={History}
          title={<>Historique des versions · <span className="font-mono text-[14px]">taux_reussite_examen</span></>}
          subtitle="Chaque version reste consultable : un chiffre publié en 2023 se recalcule avec la définition de 2023."
          action={<Badge ton="avertissement">Historique simulé</Badge>}
        />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <ol className="relative space-y-4 border-l-2 border-line/70 pl-5">
            {HISTORIQUE_REUSSITE.map((v) => (
              <li key={v.version} className="relative">
                <span
                  aria-hidden
                  className={cn("absolute -left-[27px] top-1.5 h-3 w-3 rounded-full ring-4 ring-surface", v.statut === "en_vigueur" ? "bg-success" : "bg-line")}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[13px] font-semibold text-ink">v{v.version}</span>
                  {v.statut === "en_vigueur" ? <Badge ton="succes" icone={ShieldCheck}>En vigueur</Badge> : <Badge ton="neutre">Remplacée</Badge>}
                  <span className="text-[12px] text-ink-muted tabular">
                    publiée le {date(v.publieeLe)}{v.remplaceeLe ? ` · remplacée le ${date(v.remplaceeLe)}` : ""}
                  </span>
                </div>
                <p className="mt-1.5 rounded-sm bg-surface-2 px-3 py-1.5 font-mono text-[12px] text-ink">{v.formule}</p>
                <p className="mt-1.5 text-[13.5px] text-ink-2"><span className="font-semibold text-ink">Motif : </span>{v.motif}</p>
                <p className="mt-1 text-[12px] text-ink-muted">{v.validePar}</p>
              </li>
            ))}
          </ol>

          <div className="rounded-lg border border-line/70 bg-surface-2/50 p-4">
            <Etiquette>Pourquoi versionner ?</Etiquette>
            <p className="mt-2 text-[13.5px] text-ink-2">Réussite au BEPC {ANNEE_COURANTE}, même données, deux définitions (calcul réel du moteur) :</p>
            <dl className="mt-3 space-y-2">
              <div className="flex items-baseline justify-between gap-3 rounded-md bg-surface px-3 py-2">
                <dt className="text-[13px] text-ink-2">Selon la v2.x <span className="block text-[11.5px] text-ink-muted">admis ÷ inscrits</span></dt>
                <dd className="font-display text-[20px] font-bold tabular text-ink">{pourcent(impact.v2)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 rounded-md bg-surface px-3 py-2 ring-1 ring-success/30">
                <dt className="text-[13px] text-ink-2">Selon la v3.1 (en vigueur) <span className="block text-[11.5px] text-ink-muted">admis ÷ présents</span></dt>
                <dd className="font-display text-[20px] font-bold tabular text-ink">{pourcent(impact.v3)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-[12.5px] text-ink-muted">
              {entier(impact.admis)} admis, {entier(impact.presents)} présents, {entier(impact.inscrits)} inscrits. Sans version,
              ces deux chiffres circuleraient sous le même nom. Avec le dictionnaire, chacun porte sa définition.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ Fiche d'un indicateur */

function FicheIndicateur({ d }: { d: DefinitionIndicateur }) {
  const aHistorique = d.code === "taux_reussite_examen";
  return (
    <article className="flex h-full flex-col rounded-lg border border-line/70 bg-surface p-4 shadow-soft">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[15.5px] font-semibold text-ink">{d.nom}</h3>
          <p className="mt-0.5 break-all font-mono text-[12px] text-ink-muted">{d.code}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5">
          <Badge ton="marque" icone={BookMarked}>v{d.version}</Badge>
          <Badge ton="succes">Publiée</Badge>
        </span>
      </header>

      <p className="mt-3 text-[13.5px] text-ink-2">{d.definition}</p>
      <div className="mt-3">
        <Etiquette>Formule</Etiquette>
        <p className="mt-1 rounded-sm bg-surface-2 px-3 py-2 font-mono text-[12px] leading-relaxed text-ink">{d.formule}</p>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2.5 text-[13px] sm:grid-cols-2">
        <Champ libelle="Unité" valeur={UNITE_LIBELLE[d.unite]} />
        <Champ libelle="Fréquence" valeur={d.frequence} />
        <Champ libelle="Propriétaire" valeur={d.proprietaire} />
        <Champ
          libelle="Seuil de publication"
          valeur={<span className="inline-flex items-center gap-1.5"><Lock size={12} className="text-ink-muted" aria-hidden />Cellule masquée sous {d.effectifMinimalPublication} apprenant{d.effectifMinimalPublication > 1 ? "s" : ""}</span>}
        />
        <div className="sm:col-span-2"><Champ libelle="Source" valeur={d.source} /></div>
      </dl>

      <div className="mt-3">
        <Etiquette>Dimensions autorisées</Etiquette>
        <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Dimensions autorisées">
          {d.dimensions.map((dim) => <li key={dim}><Badge ton="neutre">{DIMENSION_LIBELLE[dim]}</Badge></li>)}
        </ul>
      </div>

      {aHistorique && (
        <a href="#historique" className="mt-3 inline-flex items-center gap-1 self-start text-[12.5px] font-semibold text-blue hover:underline">
          <History size={13} aria-hidden /> Voir les 4 versions de cet indicateur
        </a>
      )}
    </article>
  );
}

function Champ({ libelle, valeur }: { libelle: string; valeur: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-ink-muted">{libelle}</dt>
      <dd className="mt-0.5 text-ink">{valeur}</dd>
    </div>
  );
}

function normaliser(t: string) {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
