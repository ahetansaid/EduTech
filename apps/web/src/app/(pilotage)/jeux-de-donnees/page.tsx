"use client";

import type { DefinitionIndicateur, Dimension, ResultatIndicateur } from "@beile/contracts";
import { Database, Download, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Cascade, Element, EntreePage } from "@/components/motion";
import { notifier } from "@/components/ui/Notifications";
import { Badge, Button, Card, EtatVide, PageHeader, Squelette } from "@/components/ui/primitives";
import { useDictionnaire } from "@/lib/api/gouvernance";
import { exporterCsv } from "@/lib/export";
import { ecrire, ErreurApi } from "@/lib/http";
import { libellePerimetre, useHabilitationPilotage } from "../_commun";

/**
 * Jeux de données : chaque indicateur du dictionnaire national, extrait par territoire et par année,
 * avec sa définition, sa source et sa confiance. Le calcul passe par POST /indicateurs (périmètre de
 * l'habilitation, secret statistique appliqué, calcul journalisé) ; le fichier n'est produit qu'une fois
 * l'export déclaré au journal d'audit.
 */

const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

type Echelle = "ensemble" | "departement" | "commune";
type Periode = "courante" | "serie";

const ECHELLES: { valeur: Echelle; libelle: string }[] = [
  { valeur: "ensemble", libelle: "Ensemble" }, { valeur: "departement", libelle: "Département" }, { valeur: "commune", libelle: "Commune" },
];

export default function JeuxDeDonnees() {
  const hab = useHabilitationPilotage();
  const q = useDictionnaire();
  const [recherche, setRecherche] = useState("");
  const liste = useMemo(() => {
    const t = recherche.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return (q.data ?? []).filter((d) => d.moteur !== "registre")
      .filter((d) => !t || `${d.nom} ${d.definition}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(t))
      // Les indicateurs dont le nom correspond passent avant ceux qui ne le mentionnent que dans leur définition.
      .sort((a, b) => Number(!!t && !norm(b.nom).includes(t)) - Number(!!t && !norm(a.nom).includes(t)) || a.nom.localeCompare(b.nom, "fr"));
  }, [q.data, recherche]);

  return (
    <EntreePage>
      <div className="space-y-5">
        <PageHeader surtitre={`Données · ${libellePerimetre(hab?.perimetre)}`} titre="Jeux de données" />
        <label className="relative block max-w-md">
          <span className="sr-only">Rechercher un indicateur</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Abandon, réussite, encadrement…"
            className="h-11 w-full rounded-lg border border-line bg-surface pl-9 pr-9 text-[14px] text-ink outline-none focus:border-blue focus:ring-4 focus:ring-blue/15" />
          {recherche && <button type="button" onClick={() => setRecherche("")} className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2" aria-label="Effacer"><X size={14} /></button>}
        </label>
        {q.isPending ? (
          <div className="grid gap-3 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <Squelette key={i} className="h-44 rounded-2xl" />)}</div>
        ) : !liste.length ? (
          <Card><EtatVide icone={Database} titre="Aucun indicateur" texte="Aucun indicateur du dictionnaire ne correspond à cette recherche." /></Card>
        ) : (
          <Cascade className="grid gap-3 md:grid-cols-2">
            {liste.map((d) => <Element key={d.code}><CarteJeu d={d} /></Element>)}
          </Cascade>
        )}
      </div>
    </EntreePage>
  );
}

function CarteJeu({ d }: { d: DefinitionIndicateur }) {
  const echelles = ECHELLES.filter((e) => e.valeur === "ensemble" || d.dimensions.includes(e.valeur as Dimension));
  const serie = d.dimensions.includes("annee");
  const [echelle, setEchelle] = useState<Echelle>(echelles.at(-1)!.valeur);
  const [periode, setPeriode] = useState<Periode>(serie ? "serie" : "courante");
  const [enCours, setEnCours] = useState(false);

  const extraire = async () => {
    const ventilation = [...(echelle === "ensemble" ? [] : [echelle]), ...(periode === "serie" ? ["annee"] : [])] as Dimension[];
    setEnCours(true);
    try {
      const r = await ecrire<ResultatIndicateur>("/indicateurs", { indicateur: d.code, filtres: {}, ventilation });
      const lignes = r.lignes.length ? r.lignes : [{ cle: "ensemble", libelle: "Ensemble", valeur: r.valeur, effectif: r.denominateur, masquee: false }];
      const territoire = (l: (typeof lignes)[number]) => (echelle === "ensemble" ? "Ensemble" : l.libelle.split(" · ")[0] ?? l.libelle);
      const code = (l: (typeof lignes)[number]) => (echelle === "ensemble" ? "" : l.cle.split("¦")[0] ?? l.cle);
      const annee = (l: (typeof lignes)[number]) => (periode === "serie" ? l.cle.split("¦").at(-1) ?? "" : r.periode);
      await exporterCsv(`beile_${d.code}_${echelle}${periode === "serie" ? "_serie" : ""}`, lignes, [
        { entete: "code_territoire", valeur: code },
        { entete: "territoire", valeur: territoire },
        { entete: "annee_scolaire", valeur: annee },
        { entete: `valeur (${d.unite})`, valeur: (l) => (l.masquee || l.valeur == null ? null : Number(l.valeur.toFixed(3))) },
        { entete: "effectif", valeur: (l) => l.effectif },
        { entete: "masquee_secret_statistique", valeur: (l) => (l.masquee ? "oui" : "non") },
      ], `BEILE · ${d.nom} (v${d.version}) · ${d.source} · confiance ${Math.round(r.confiance.score)} % · cellules d'effectif < ${d.effectifMinimalPublication} masquées`, false);
    } catch (e) {
      notifier({ ton: "critique", titre: "Extraction impossible", texte: e instanceof ErreurApi ? e.message : "Le service ne répond pas ; réessayez." });
    } finally {
      setEnCours(false);
    }
  };

  return (
    <article className="flex h-full min-w-0 flex-col rounded-2xl border border-line/70 bg-surface p-4 shadow-float">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-semibold leading-snug text-ink">{d.nom}</h2>
        <Badge ton="neutre">v{d.version}</Badge>
      </div>
      <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-ink-2">{d.definition}</p>
      <p className="mt-2 text-[12px] text-ink-muted">{d.frequence} · {d.proprietaire}</p>
      <div className="mt-auto flex flex-wrap items-end gap-2 pt-4">
        <label className="min-w-0 flex-1">
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Territoire</span>
          <select value={echelle} onChange={(e) => setEchelle(e.target.value as Echelle)} className="mt-1 h-10 w-full rounded-lg border border-line bg-bg px-2.5 text-[13.5px] text-ink outline-none focus:border-blue">
            {echelles.map((e) => <option key={e.valeur} value={e.valeur}>{e.libelle}</option>)}
          </select>
        </label>
        <label className="min-w-0 flex-1">
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Période</span>
          <select value={periode} onChange={(e) => setPeriode(e.target.value as Periode)} className="mt-1 h-10 w-full rounded-lg border border-line bg-bg px-2.5 text-[13.5px] text-ink outline-none focus:border-blue">
            <option value="courante">Année en cours</option>
            {serie && <option value="serie">Série 2021-2026</option>}
          </select>
        </label>
        <Button icone={Download} onClick={extraire} disabled={enCours} className="shrink-0">{enCours ? "…" : "CSV"}</Button>
      </div>
    </article>
  );
}
