"use client";

import { Download, Info, Inbox } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { BarresClassees, TableauDonnees } from "@/components/charts/Graphiques";
import { Badge, Button, Card, CardHeader, EtatVide, PageHeader, type Ton } from "@/components/ui/primitives";
import { CATALOGUE_CONCOURS, LIBELLE_DIPLOME, LIBELLE_STATUT_CONCOURS, nomFiliere } from "@/lib/enseignement-superieur";
import { exporterCsv, type Colonne } from "@/lib/export";
import { date, entier } from "@/lib/format";
import type { Concours, StatutConcours } from "@beile/contracts";
import { OngletsESup } from "../_Onglets";

const ORDRE: StatutConcours[] = ["annonce", "inscriptions", "admissibilite", "ecrits", "oraux", "resultats", "clos"];

const TON_STATUT: Record<StatutConcours, Ton> = {
  annonce: "neutre", inscriptions: "info", admissibilite: "avertissement", ecrits: "avertissement", oraux: "marque", resultats: "succes", clos: "neutre",
};

type Filtre = "tous" | StatutConcours;

/** Concours du supérieur : calendrier-type des sessions sélectives, épreuves pondérées comprises. */
export default function ConcoursPage() {
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const visibles = useMemo(() => CATALOGUE_CONCOURS.filter((c) => filtre === "tous" || c.statut === filtre), [filtre]);

  const stats = useMemo(() => ({
    total: CATALOGUE_CONCOURS.length,
    ouvertes: CATALOGUE_CONCOURS.filter((c) => c.statut !== "clos").length,
    places: CATALOGUE_CONCOURS.reduce((s, c) => s + (c.places ?? 0), 0),
  }), []);

  const COLONNES: Colonne<Concours>[] = [
    { entete: "Concours", valeur: (c) => c.nom },
    { entete: "Filière", valeur: (c) => nomFiliere(c.filiereId) },
    { entete: "Session", valeur: (c) => c.session },
    { entete: "Statut", valeur: (c) => LIBELLE_STATUT_CONCOURS[c.statut] ?? c.statut },
    { entete: "Diplôme requis", valeur: (c) => LIBELLE_DIPLOME[c.diplomeRequis] },
    { entete: "Séries", valeur: (c) => c.serieRequise.join("/") },
    { entete: "Places", valeur: (c) => c.places },
    { entete: "Épreuves", valeur: (c) => c.epreuves.map((e) => `${e.matiere} (${e.coef})`).join(", ") },
    { entete: "Inscriptions", valeur: (c) => (c.ouvertureLe && c.clotureLe ? `${c.ouvertureLe} → ${c.clotureLe}` : "à préciser") },
  ];

  const entetes: string[] = ["Concours", "Filière visée", "Session", "Statut", "Diplôme requis", "Séries", "Places"];
  const lignes: ReactNode[][] = visibles.map((c) => [
    c.nom,
    nomFiliere(c.filiereId),
    c.session,
    <Badge key={c.id} ton={TON_STATUT[c.statut]}>{LIBELLE_STATUT_CONCOURS[c.statut] ?? c.statut}</Badge>,
    LIBELLE_DIPLOME[c.diplomeRequis],
    c.serieRequise.join(" · "),
    <span key={`${c.id}-p`} className="tabular-nums">{entier(c.places)}</span>,
  ]);

  return (
    <div className="space-y-5">
      <PageHeader titre="Concours" sousTitre="Sessions sélectives du supérieur : diplôme requis, séries d'accès, places et épreuves pondérées, affichées telles quelles." surtitre="Enseignement supérieur"
        actions={<Button variante="secondaire" taille="sm" icone={Download} onClick={() => exporterCsv("concours_supérieur", visibles, COLONNES, `BEILE — ${visibles.length} sessions (statut ${filtre === "tous" ? "tous" : LIBELLE_STATUT_CONCOURS[filtre]}) — ${new Date().toISOString().slice(0, 10)}`)}>Exporter (CSV)</Button>} />

      <OngletsESup />

      <div className="flex items-start gap-3 rounded-lg bg-info-bg px-4 py-3 text-[13px] text-info">
        <Info size={17} className="mt-0.5 shrink-0" aria-hidden />
        <p><strong>Sessions indicatives.</strong> Ces concours illustrent la <em>forme</em> d&apos;une session (diplôme requis, épreuves et coefficients). Les chiffres — places ouvertes, dates — sont des calibrations types, pas des arrêtés : le registre officiel des sessions arrive avec l&apos;étape de migration.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[[stats.total, "sessions suivies"], [stats.ouvertes, "encore ouvertes"], [entier(stats.places), "places cumulées"]].map(([v, l]) => (
          <Card key={String(l)} className="p-3.5">
            <p className="text-2xl font-semibold tabular-nums text-ink">{v}</p>
            <p className="text-xs text-ink-muted">{l}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader icon={Inbox} title="Sessions" subtitle={`${visibles.length} sur ${stats.total} — filtrer par statut, exporter le périmètre affiché.`}
          action={<select value={filtre} onChange={(e) => setFiltre(e.target.value as Filtre)} className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink" aria-label="Filtrer par statut">
            <option value="tous">Tous les statuts</option>
            {ORDRE.map((s) => <option key={s} value={s}>{LIBELLE_STATUT_CONCOURS[s]}</option>)}
          </select>} />
        {visibles.length
          ? <TableauDonnees colonnes={entetes} lignes={lignes} />
          : <EtatVide icone={Inbox} titre="Aucune session à ce statut" texte="Changez de filtre pour voir les autres concours du catalogue." />}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {visibles.map((c) => (
          <Card key={c.id}>
            <CardHeader title={c.nom} subtitle={`${nomFiliere(c.filiereId)} · session ${c.session}`} action={<Badge ton={TON_STATUT[c.statut]}>{LIBELLE_STATUT_CONCOURS[c.statut] ?? c.statut}</Badge>} />
            <BarresClassees className="mb-3" barres={c.epreuves.map((e) => ({ cle: e.matiere, libelle: e.matiere, valeur: e.coef }))} formater={(v) => `coef ${v}`} />
            <p className="text-xs text-ink-muted">Requis : {LIBELLE_DIPLOME[c.diplomeRequis]} · séries {c.serieRequise.join(" · ")} · {entier(c.places)} places.
              {c.ouvertureLe ? ` Inscriptions du ${date(c.ouvertureLe)} au ${date(c.clotureLe!)}.` : " Dates d'inscription à préciser."}
              {c.epreuvesLe ? ` Épreuves le ${date(c.epreuvesLe)}.` : ""}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
