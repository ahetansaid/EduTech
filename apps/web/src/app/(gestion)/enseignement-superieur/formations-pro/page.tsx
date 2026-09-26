"use client";

import { ArrowRight, Download, Info, Layers } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { TableauDonnees } from "@/components/charts/Graphiques";
import { Badge, Button, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { LIBELLE_DIPLOME, LIBELLE_TYPE_PARCOURS, filieresEFTP, libelleCycle, stageMois, type FiliereCatalogue } from "@/lib/enseignement-superieur";
import { exporterCsv, type Colonne } from "@/lib/export";
import type { Diplome } from "@beile/contracts";
import { OngletsESup } from "../_Onglets";

/** Échelle des qualifications EFTP (MESTFP + Emploi/PME), puis la passerelle vers la licence professionnelle. */
const ECHELLE: Diplome[] = ["CAP", "BEP", "BAC_TECHNIQUE", "BT", "BTS", "CQP"];

/** Formations professionnelles : la voie EFTP et ses passerelles vers le supérieur LMD. */
export default function FormationsProPage() {
  const eftp = useMemo(() => filieresEFTP(), []);
  const represente = useMemo(() => new Set(eftp.map((f) => f.diplomeVise)), [eftp]);

  const stats = useMemo(() => ({
    total: eftp.length,
    horsLmd: eftp.filter((f) => f.cycle == null).length,
    avecStage: eftp.filter((f) => stageMois(f.id) > 0).length,
  }), [eftp]);

  const COLONNES: Colonne<FiliereCatalogue>[] = [
    { entete: "Filière", valeur: (f) => f.nom },
    { entete: "Établissement", valeur: (f) => f.etablissement },
    { entete: "Voie", valeur: (f) => LIBELLE_TYPE_PARCOURS[f.voie] },
    { entete: "Diplôme visé", valeur: (f) => LIBELLE_DIPLOME[f.diplomeVise] },
    { entete: "Cursus", valeur: (f) => libelleCycle(f) },
    { entete: "Stage (mois)", valeur: (f) => stageMois(f.id) },
  ];

  const entetes: string[] = ["Filière", "Établissement", "Voie", "Diplôme visé", "Stage"];
  const lignes: ReactNode[][] = eftp.map((f) => [
    f.nom,
    f.etablissement,
    LIBELLE_TYPE_PARCOURS[f.voie],
    <span key={f.id} className="flex items-center gap-2">{LIBELLE_DIPLOME[f.diplomeVise]}{f.cycle == null && <Badge ton="neutre">Hors LMD</Badge>}</span>,
    <span key={`${f.id}-s`} className="text-xs text-ink-muted">{stageMois(f.id) > 0 ? `${stageMois(f.id)} mois` : "aucun"}</span>,
  ]);

  return (
    <div className="space-y-5">
      <PageHeader titre="Formations professionnelles" sousTitre="La voie EFTP (technologique et professionnelle) : du CAP au BTS/CQP, et la passerelle qui mène à la licence professionnelle." surtitre="Enseignement supérieur"
        actions={<Button variante="secondaire" taille="sm" icone={Download} onClick={() => exporterCsv("formations_professionnelles", eftp, COLONNES, `BEILE — ${eftp.length} filières EFTP — ${new Date().toISOString().slice(0, 10)}`)}>Exporter (CSV)</Button>} />

      <OngletsESup />

      <div className="flex items-start gap-3 rounded-lg bg-info-bg px-4 py-3 text-[13px] text-info">
        <Info size={17} className="mt-0.5 shrink-0" aria-hidden />
        <p><strong>Une seule échelle.</strong> Le Bénin suit le LMD pour l&apos;université (Licence-Master-Doctorat) ; les diplômes professionnels (CAP, BEP, BT, BTS, CQP) vivent sur l&apos;échelle EFTP en amont. Le <em>BTS n&apos;est pas dans le LMD</em> — c&apos;est une voie parallèle qui ouvre, par passerelle, une <strong>licence professionnelle</strong>.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[[stats.total, "filières EFTP"], [stats.horsLmd, "hors LMD (diplômes pro)"], [stats.avecStage, "avec stage obligatoire"]].map(([v, l]) => (
          <Card key={String(l)} className="p-3.5">
            <p className="text-2xl font-semibold tabular-nums text-ink">{v}</p>
            <p className="text-xs text-ink-muted">{l}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader icon={Layers} title="Échelle des qualifications" subtitle="Les maillons du professionnel, puis la passerelle (carrefour 2) vers un cycle LMD court." />
        <div className="flex flex-wrap items-center gap-2">
          {ECHELLE.map((d, i) => (
            <span key={d} className="flex items-center gap-2">
              <span className={`rounded-md px-2.5 py-1 text-[13px] font-medium ${represente.has(d) ? "bg-blue-soft text-accent-ink" : "bg-surface-2 text-ink-2"}`}>{LIBELLE_DIPLOME[d]}</span>
              {i < ECHELLE.length - 1 && <ArrowRight size={14} className="text-ink-muted" aria-hidden />}
            </span>
          ))}
          <ArrowRight size={14} className="text-ink-muted" aria-hidden />
          <span className="rounded-md px-2.5 py-1 text-[13px] font-medium text-white" style={{ background: "var(--series-2)" }}>Passerelle → {LIBELLE_DIPLOME.LICENCE_PRO}</span>
        </div>
        <p className="mt-3 text-xs text-ink-muted">Un BTS ou un CQP validé donne accès, sur dossier, à une licence professionnelle : la suite logique du parcours, pas une reprise à zéro.</p>
      </Card>

      <Card>
        <CardHeader icon={Layers} title="Filières professionnelles" subtitle={`${stats.total} filières de la voie technologique / professionnelle du catalogue.`} />
        <TableauDonnees colonnes={entetes} lignes={lignes} />
      </Card>
    </div>
  );
}
