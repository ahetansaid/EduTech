"use client";

import { Briefcase, Download, Info, TriangleAlert } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { TableauDonnees } from "@/components/charts/Graphiques";
import { Badge, Button, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { CATALOGUE_FILIERES, LIBELLE_TYPE_PARCOURS, libelleCycle, stageMois, type FiliereCatalogue } from "@/lib/enseignement-superieur";
import { exporterCsv, type Colonne } from "@/lib/export";
import { nombre } from "@/lib/format";
import { OngletsESup } from "../_Onglets";

/** Cycle de vie d'un stage, du repérage de l'offre à la validation — le suivi individuel arrive avec la base. */
const ETAPES: [string, string][] = [
  ["recherche", "L'offre est cherchée par l'apprenant."],
  ["piste", "Une entreprise est pressentie."],
  ["convention_en_cours", "La convention est en cours de signature."],
  ["signe", "Convention signée (école · entreprise · apprenant)."],
  ["en_cours", "Stage en cours, suivi par un tuteur académique."],
  ["termine", "Stage validé par l'établissement."],
];

/** Stages : obligations de stage par filière et cycle de vie d'une convention — cadre, pas registre nominal. */
export default function StagesPage() {
  const avecStage = useMemo(() => CATALOGUE_FILIERES.filter((f) => stageMois(f.id) > 0), []);
  const totalFilieres = CATALOGUE_FILIERES.length;

  const stats = useMemo(() => {
    const mois = avecStage.map((f) => stageMois(f.id));
    const moyenne = mois.length ? mois.reduce((s, m) => s + m, 0) / mois.length : 0;
    return { nb: avecStage.length, moyenne, max: Math.max(0, ...mois) };
  }, [avecStage]);

  const COLONNES: Colonne<FiliereCatalogue>[] = [
    { entete: "Filière", valeur: (f) => f.nom },
    { entete: "Établissement", valeur: (f) => f.etablissement },
    { entete: "Voie", valeur: (f) => LIBELLE_TYPE_PARCOURS[f.voie] },
    { entete: "Cycle / diplôme", valeur: (f) => libelleCycle(f) },
    { entete: "Stage obligatoire (mois)", valeur: (f) => stageMois(f.id) },
  ];

  const entetes: string[] = ["Filière", "Voie", "Cycle / diplôme", "Durée de stage"];
  const lignes: ReactNode[][] = avecStage.map((f) => [
    f.nom,
    LIBELLE_TYPE_PARCOURS[f.voie],
    libelleCycle(f),
    <span key={f.id} className="flex items-center gap-2"><span className="tabular-nums font-medium text-ink">{stageMois(f.id)} mois</span>{stageMois(f.id) >= stats.max && <Badge ton="marque">Le plus long</Badge>}</span>,
  ]);

  return (
    <div className="space-y-5">
      <PageHeader titre="Stages" sousTitre="Obligations de stage des filières du supérieur et cycle de vie d'une convention — le fil rouge entre l'école et l'entreprise." surtitre="Enseignement supérieur"
        actions={<Button variante="secondaire" taille="sm" icone={Download} onClick={() => exporterCsv("stages_obligatoires", avecStage, COLONNES, `BEILE — ${avecStage.length} filères à stage obligatoire — ${new Date().toISOString().slice(0, 10)}`)}>Exporter (CSV)</Button>} />

      <OngletsESup />

      <div className="flex items-start gap-3 rounded-lg bg-warning-bg px-4 py-3 text-[13px] text-warning">
        <TriangleAlert size={17} className="mt-0.5 shrink-0" aria-hidden />
        <p><strong>Cadre, pas registre.</strong> Cette page pose les <em>règles</em> (quelle filière impose quel stage, comment avance une convention). Le suivi nominatif des stages — apprenant, entreprise, tuteurs, dates, validation — n&apos;est pas encore en base : il ouvrira à l&apos;étape de migration. Aucune donnée individuelle n&apos;est affichée ici.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[[`${stats.nb} / ${totalFilieres}`, "filères à stage obligatoire"], [`${nombre(stats.moyenne, 1)} mois`, "durée moyenne"], [`${stats.max} mois`, "stage le plus long"]].map(([v, l]) => (
          <Card key={String(l)} className="p-3.5">
            <p className="text-2xl font-semibold tabular-nums text-ink">{v}</p>
            <p className="text-xs text-ink-muted">{l}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader icon={Briefcase} title="Obligations par filière" subtitle={`${avecStage.length} filières du catalogue imposent un stage (les ${totalFilieres - avecStage.length} autres n'en prévoient pas).`} />
        <TableauDonnees colonnes={entetes} lignes={lignes} />
      </Card>

      <Card>
        <CardHeader icon={Info} title="Cycle de vie d'une convention" subtitle="De la recherche de l'offre à la validation par l'établissement — chaque étape sera horodatée et journalisée en base." />
        <ol className="space-y-2">
          {ETAPES.map(([code, texte], i) => (
            <li key={code} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-soft text-[12px] font-semibold text-accent-ink">{i + 1}</span>
              <p className="text-[13.5px] text-ink-2"><span className="font-medium text-ink">{texte}</span></p>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-ink-muted">Hors parcours normal : un stage peut être marqué « interrompu ». La validation finale revient à l&apos;établissement, via son tuteur académique.</p>
      </Card>
    </div>
  );
}
