"use client";

import { Download, Info, School } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { TableauDonnees } from "@/components/charts/Graphiques";
import { Badge, Button, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { CATALOGUE_FILIERES, LIBELLE_DIPLOME, LIBELLE_TYPE_PARCOURS, libelleCycle, type FiliereCatalogue } from "@/lib/enseignement-superieur";
import { exporterCsv, type Colonne } from "@/lib/export";
import { useRoles } from "@/lib/session";
import { OngletsESup } from "./_Onglets";

type FiltreVoie = "toutes" | "universitaire" | "technique" | "professionnel" | "apprentissage";

const LIBELLE_VOIE: Record<FiltreVoie, string> = {
  toutes: "Toutes", universitaire: "Universitaire", technique: "Technologique", professionnel: "Professionnelle", apprentissage: "Apprentissage",
};

/** Enseignement supérieur : console de gouvernance (MESRS) et de pilotage de l'offre de formation. */
export default function EnseignementSuperieur() {
  const roles = useRoles();
  const [voie, setVoie] = useState<FiltreVoie>("toutes");
  const filtres = useMemo(() => CATALOGUE_FILIERES.filter((f) => voie === "toutes" || f.voie === voie), [voie]);

  const cadre = roles.includes("administration_centrale")
    ? { sur: "Administration centrale — MESRS", sous: "Cohérence du catalogue national : trois voies (université, écoles nationales, EFTP), cycles LMD, tutelles et conditions d'accès." }
    : roles.includes("direction_departementale") || roles.includes("inspecteur")
      ? { sur: "Pilotage territorial", sous: "Lecture de l'offre de formation supérieure et de ses conditions d'accès sur le territoire." }
      : roles.includes("chef_etablissement")
        ? { sur: "Établissement", sous: "Repères pour la préparation post-bac : quelles filières du supérieur s'ouvrent aux profils formés ici." }
        : { sur: "Enseignement", sous: "Repères sur les filières du supérieur pour appuyer l'orientation des classes." };

  const stats = useMemo(() => {
    const nb = (p: (f: FiliereCatalogue) => boolean) => CATALOGUE_FILIERES.filter(p).length;
    return {
      total: CATALOGUE_FILIERES.length,
      universitaire: nb((f) => f.voie === "universitaire"),
      eftp: nb((f) => f.voie === "technique" || f.voie === "professionnel" || f.voie === "apprentissage"),
      concours: nb((f) => f.accesConcours),
    };
  }, []);

  const COLONNES: Colonne<FiliereCatalogue>[] = [
    { entete: "Filière", valeur: (f) => f.nom },
    { entete: "Établissement", valeur: (f) => f.etablissement },
    { entete: "Voie", valeur: (f) => LIBELLE_TYPE_PARCOURS[f.voie] },
    { entete: "Cycle", valeur: (f) => (f.cycle ? libelleCycle(f) : "Hors LMD") },
    { entete: "Diplôme visé", valeur: (f) => LIBELLE_DIPLOME[f.diplomeVise] },
    { entete: "Accès concours", valeur: (f) => (f.accesConcours ? "oui" : "non") },
    { entete: "Séries d'accès", valeur: (f) => f.seriesAcces.join("/") },
    { entete: "Critères pondérés", valeur: (f) => f.criteres.map((c) => `${c.matiere} ${Math.round(c.poids * 100)}%`).join(", ") },
  ];

  const entetes: string[] = ["Filière", "Établissement", "Voie", "Cycle / diplôme", "Domaine", "Accès"];
  const lignes: ReactNode[][] = filtres.map((f) => [
    f.nom,
    f.etablissement,
    LIBELLE_TYPE_PARCOURS[f.voie],
    libelleCycle(f),
    f.domaine.replaceAll("_", " "),
    <span key={f.id} className="flex flex-wrap gap-1.5">
      {f.accesConcours && <Badge ton="critique">Concours</Badge>}
      {f.cycle == null && <Badge ton="neutre">Hors LMD</Badge>}
      <span className="text-xs text-ink-muted">{f.seriesAcces.join(" · ")}</span>
    </span>,
  ]);

  return (
    <div className="space-y-5">
      <PageHeader titre="Enseignement supérieur" sousTitre={cadre.sous} surtitre={cadre.sur}
        actions={<Button variante="secondaire" taille="sm" icone={Download} onClick={() => exporterCsv("catalogue_enseignement_superieur", filtres, COLONNES, `Catalogue BEILE — ${filtres.length} filières — voie ${LIBELLE_VOIE[voie]} — ${new Date().toISOString().slice(0, 10)}`)}>Exporter (CSV)</Button>} />

      <OngletsESup />

      <div className="flex items-start gap-3 rounded-lg bg-info-bg px-4 py-3 text-[13px] text-info">
        <Info size={17} className="mt-0.5 shrink-0" aria-hidden />
        <p><strong>Catalogue indicatif.</strong> Ce référentiel est en cours de constitution en code, pas encore le registre national. Les listes officielles (écoles, capacités, sessions de concours, séries d'accès) seront serties en base à l'étape de migration ; l'adéquation aux profils réels, elle, s'appuie déjà sur des notes vérifiées.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[[stats.total, "filières référencées"], [stats.universitaire, "voie universitaire"], [stats.eftp, "voie EFTP"], [stats.concours, "accès par concours"]].map(([v, l]) => (
          <Card key={String(l)} className="p-3.5">
            <p className="text-2xl font-semibold tabular-nums text-ink">{v}</p>
            <p className="text-xs text-ink-muted">{l}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader icon={School} title="Filières du catalogue"
          subtitle={`${filtres.length} sur ${stats.total} — filtre par voie, export du périmètre affiché.`}
          action={<select value={voie} onChange={(e) => setVoie(e.target.value as FiltreVoie)} className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink" aria-label="Filtrer par voie">
            {(Object.keys(LIBELLE_VOIE) as FiltreVoie[]).map((k) => <option key={k} value={k}>{LIBELLE_VOIE[k]}</option>)}
          </select>} />
        <TableauDonnees colonnes={entetes} lignes={lignes} />
      </Card>
    </div>
  );
}
