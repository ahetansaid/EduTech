"use client";

import { Download, Info, School } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { TableauDonnees } from "@/components/charts/Graphiques";
import { Badge, Button, Card, CardHeader, EtatVide, PageHeader } from "@/components/ui/primitives";
import { useFilieresSup, type FiliereSup } from "@/lib/api/superieur-public";
import { LIBELLE_DIPLOME, LIBELLE_DOMAINE, LIBELLE_TYPE_PARCOURS, estFiliereEFTP, libelleCycle } from "@/lib/enseignement-superieur";
import { exporterCsv, type Colonne } from "@/lib/export";
import { useRoles } from "@/lib/session";
import { EtatErreur } from "../etablissement/_composants";
import { OngletsESup } from "./_Onglets";
import { BadgeHabilitation, ChargementRegistre } from "./_Registre";

type FiltreVoie = "toutes" | "universitaire" | "technique" | "professionnel" | "apprentissage";

const LIBELLE_VOIE: Record<FiltreVoie, string> = {
  toutes: "Toutes", universitaire: "Universitaire", technique: "Technologique", professionnel: "Professionnelle", apprentissage: "Apprentissage",
};

/** Enseignement supérieur : console de gouvernance (MESRS) et de pilotage de l'offre de formation. */
export default function EnseignementSuperieur() {
  const roles = useRoles();
  const [voie, setVoie] = useState<FiltreVoie>("toutes");
  const q = useFilieresSup();
  const catalogue = useMemo(() => q.data ?? [], [q.data]);
  const filtres = useMemo(() => catalogue.filter((f) => voie === "toutes" || f.voie === voie), [catalogue, voie]);

  const cadre = roles.includes("administration_centrale")
    ? { sur: "Administration centrale — MESRS", sous: "Cohérence du catalogue national : trois voies (université, écoles nationales, EFTP), cycles LMD, tutelles et conditions d'accès." }
    : roles.includes("direction_departementale") || roles.includes("inspecteur")
      ? { sur: "Pilotage territorial", sous: "Lecture de l'offre de formation supérieure et de ses conditions d'accès sur le territoire." }
      : roles.includes("chef_etablissement")
        ? { sur: "Établissement", sous: "Repères pour la préparation post-bac : quelles filières du supérieur s'ouvrent aux profils formés ici." }
        : { sur: "Enseignement", sous: "Repères sur les filières du supérieur pour appuyer l'orientation des classes." };

  const stats = useMemo(() => {
    const nb = (p: (f: FiliereSup) => boolean) => catalogue.filter(p).length;
    return {
      total: catalogue.length,
      universitaire: nb((f) => f.voie === "universitaire"),
      eftp: nb(estFiliereEFTP),
      concours: nb((f) => f.accesConcours),
      nonHabilitees: nb((f) => !f.habilitee),
    };
  }, [catalogue]);

  const COLONNES: Colonne<FiliereSup>[] = [
    { entete: "Filière", valeur: (f) => f.nom },
    { entete: "Établissement", valeur: (f) => f.etablissement.nom },
    { entete: "Habilitation", valeur: (f) => (f.habilitee ? "habilitée" : "non habilitée") },
    { entete: "Voie", valeur: (f) => LIBELLE_TYPE_PARCOURS[f.voie] },
    { entete: "Cycle", valeur: (f) => (f.cycle ? libelleCycle(f) : "Hors LMD") },
    { entete: "Diplôme visé", valeur: (f) => LIBELLE_DIPLOME[f.diplomeVise] },
    { entete: "Accès concours", valeur: (f) => (f.accesConcours ? "oui" : "non") },
    { entete: "Séries d'accès", valeur: (f) => f.serieBacRequise.join("/") },
    { entete: "Stage (mois)", valeur: (f) => f.stageObligatoireMois },
    { entete: "Critères pondérés", valeur: (f) => f.criteresOrientation.map((c) => `${c.matiere} ${Math.round(c.poids * 100)}%`).join(", ") },
  ];

  const entetes: string[] = ["Filière", "Établissement", "Habilitation", "Voie", "Cycle / diplôme", "Domaine", "Accès"];
  const lignes: ReactNode[][] = filtres.map((f) => [
    f.nom,
    <span key={`${f.id}-e`} className="flex items-baseline gap-2"><span>{f.etablissement.nom}</span>{f.etablissement.sigle && <span className="text-xs text-ink-muted">{f.etablissement.sigle}</span>}</span>,
    <BadgeHabilitation key={`${f.id}-h`} habilitee={f.habilitee} />,
    LIBELLE_TYPE_PARCOURS[f.voie],
    libelleCycle(f),
    LIBELLE_DOMAINE[f.domaine],
    <span key={f.id} className="flex flex-wrap gap-1.5">
      {f.accesConcours && <Badge ton="critique">Concours</Badge>}
      {f.cycle == null && <Badge ton="neutre">Hors LMD</Badge>}
      {f.serieBacRequise.length > 0 && <span className="text-xs text-ink-muted">{f.serieBacRequise.join(" · ")}</span>}
    </span>,
  ]);

  return (
    <div className="space-y-5">
      <PageHeader titre="Enseignement supérieur" sousTitre={cadre.sous} surtitre={cadre.sur}
        actions={<Button variante="secondaire" disabled={!filtres.length} taille="sm" icone={Download} onClick={() => exporterCsv("catalogue_enseignement_superieur", filtres, COLONNES, `Catalogue BEILE — ${filtres.length} filières — voie ${LIBELLE_VOIE[voie]} — ${new Date().toISOString().slice(0, 10)}`, false)}>Exporter (CSV)</Button>} />

      <OngletsESup />

      <div className="flex items-start gap-3 rounded-lg bg-info-bg px-4 py-3 text-[13px] text-info">
        <Info size={17} className="mt-0.5 shrink-0" aria-hidden />
        <p><strong>Registre des filières.</strong> Chaque filière est lue telle qu&apos;enregistrée, avec son habilitation en cours de validité : un diplôme délivré par une filière <em>non habilitée</em> n&apos;est pas reconnu. L&apos;adéquation aux profils réels s&apos;appuie sur des notes vérifiées.</p>
      </div>

      {q.isPending ? <ChargementRegistre /> : q.isError ? <Card><EtatErreur erreur={q.error} reessayer={() => q.refetch()} /></Card> : (<>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[[stats.total, "filières référencées"], [stats.universitaire, "voie universitaire"], [stats.eftp, "voie EFTP"], [stats.concours, "accès par concours"]].map(([v, l]) => (
          <Card key={String(l)} className="p-3.5">
            <p className="text-2xl font-semibold tabular-nums text-ink">{v}</p>
            <p className="text-xs text-ink-muted">{l}</p>
          </Card>
        ))}
      </div>

      {stats.nonHabilitees > 0 && (
        <p className="text-xs text-critical">{stats.nonHabilitees} filière{stats.nonHabilitees > 1 ? "s" : ""} sans habilitation en cours de validité — signalée{stats.nonHabilitees > 1 ? "s" : ""} dans le tableau.</p>
      )}

      <Card>
        <CardHeader icon={School} title="Filières du registre"
          subtitle={`${filtres.length} sur ${stats.total} — filtre par voie, export du périmètre affiché.`}
          action={<select value={voie} onChange={(e) => setVoie(e.target.value as FiltreVoie)} className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink" aria-label="Filtrer par voie">
            {(Object.keys(LIBELLE_VOIE) as FiltreVoie[]).map((k) => <option key={k} value={k}>{LIBELLE_VOIE[k]}</option>)}
          </select>} />
        {filtres.length
          ? <TableauDonnees colonnes={entetes} lignes={lignes} />
          : <EtatVide icone={School} titre={stats.total ? "Aucune filière sur cette voie" : "Aucune filière enregistrée"} texte={stats.total ? "Changez de voie pour voir le reste du registre." : "Le registre du supérieur ne compte encore aucune filière."} />}
      </Card>
      </>)}
    </div>
  );
}
