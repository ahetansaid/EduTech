"use client";

import { ArrowRight, Download, Info, Layers } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { TableauDonnees } from "@/components/charts/Graphiques";
import { Badge, Button, Card, CardHeader, EtatVide, PageHeader } from "@/components/ui/primitives";
import { useFilieresSup, type FiliereSup } from "@/lib/api/superieur-public";
import { LIBELLE_DIPLOME, LIBELLE_TYPE_PARCOURS, estFiliereEFTP, libelleCycle } from "@/lib/enseignement-superieur";
import { exporterCsv, type Colonne } from "@/lib/export";
import type { Diplome } from "@beile/contracts";
import { EtatErreur } from "../../etablissement/_composants";
import { OngletsESup } from "../_Onglets";
import { BadgeHabilitation, ChargementRegistre } from "../_Registre";

/** Échelle des qualifications EFTP (MESTFP + Emploi/PME), puis la passerelle vers la licence professionnelle. */
const ECHELLE: Diplome[] = ["CAP", "BEP", "BAC_TECHNIQUE", "BT", "BTS", "CQP"];

/** Formations professionnelles : la voie EFTP et ses passerelles vers le supérieur LMD. */
export default function FormationsProPage() {
  const q = useFilieresSup();
  const eftp = useMemo(() => (q.data ?? []).filter(estFiliereEFTP), [q.data]);
  const represente = useMemo(() => new Set(eftp.map((f) => f.diplomeVise)), [eftp]);

  const stats = useMemo(() => ({
    total: eftp.length,
    horsLmd: eftp.filter((f) => f.cycle == null).length,
    avecStage: eftp.filter((f) => f.stageObligatoireMois > 0).length,
  }), [eftp]);

  const COLONNES: Colonne<FiliereSup>[] = [
    { entete: "Filière", valeur: (f) => f.nom },
    { entete: "Établissement", valeur: (f) => f.etablissement.nom },
    { entete: "Habilitation", valeur: (f) => (f.habilitee ? "habilitée" : "non habilitée") },
    { entete: "Voie", valeur: (f) => LIBELLE_TYPE_PARCOURS[f.voie] },
    { entete: "Diplôme visé", valeur: (f) => LIBELLE_DIPLOME[f.diplomeVise] },
    { entete: "Cursus", valeur: (f) => libelleCycle(f) },
    { entete: "Stage (mois)", valeur: (f) => f.stageObligatoireMois },
  ];

  const entetes: string[] = ["Filière", "Établissement", "Habilitation", "Voie", "Diplôme visé", "Stage"];
  const lignes: ReactNode[][] = eftp.map((f) => [
    f.nom,
    f.etablissement.sigle ?? f.etablissement.nom,
    <BadgeHabilitation key={`${f.id}-h`} habilitee={f.habilitee} />,
    LIBELLE_TYPE_PARCOURS[f.voie],
    <span key={f.id} className="flex items-center gap-2">{LIBELLE_DIPLOME[f.diplomeVise]}{f.cycle == null && <Badge ton="neutre">Hors LMD</Badge>}</span>,
    <span key={`${f.id}-s`} className="text-xs text-ink-muted">{f.stageObligatoireMois > 0 ? `${f.stageObligatoireMois} mois` : "aucun"}</span>,
  ]);

  return (
    <div className="space-y-5">
      <PageHeader titre="Formations professionnelles" sousTitre="La voie EFTP (technologique et professionnelle) : du CAP au BTS/CQP, et la passerelle qui mène à la licence professionnelle." surtitre="Enseignement supérieur"
        actions={<Button variante="secondaire" disabled={!eftp.length} taille="sm" icone={Download} onClick={() => exporterCsv("formations_professionnelles", eftp, COLONNES, `BEILE — ${eftp.length} filières EFTP — ${new Date().toISOString().slice(0, 10)}`, false)}>Exporter (CSV)</Button>} />

      <OngletsESup />

      <div className="flex items-start gap-3 rounded-lg bg-info-bg px-4 py-3 text-[13px] text-info">
        <Info size={17} className="mt-0.5 shrink-0" aria-hidden />
        <p><strong>Une seule échelle.</strong> Le Bénin suit le LMD pour l&apos;université (Licence-Master-Doctorat) ; les diplômes professionnels (CAP, BEP, BT, BTS, CQP) vivent sur l&apos;échelle EFTP en amont. Le <em>BTS n&apos;est pas dans le LMD</em> — c&apos;est une voie parallèle qui ouvre, par passerelle, une <strong>licence professionnelle</strong>.</p>
      </div>

      {q.isPending ? <ChargementRegistre tuiles={3} /> : q.isError ? <Card><EtatErreur erreur={q.error} reessayer={() => q.refetch()} /></Card> : (<>
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
        <CardHeader icon={Layers} title="Filières professionnelles" subtitle={`${stats.total} filières de la voie technologique / professionnelle du registre.`} />
        {eftp.length
          ? <TableauDonnees colonnes={entetes} lignes={lignes} />
          : <EtatVide icone={Layers} titre="Aucune filière EFTP enregistrée" texte="Le registre ne compte encore aucune filière technologique, professionnelle ou d'apprentissage." />}
      </Card>
      </>)}
    </div>
  );
}
