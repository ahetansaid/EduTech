"use client";

import { useQuery } from "@tanstack/react-query";
import { Briefcase, Download, Info, ShieldCheck } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { TableauDonnees } from "@/components/charts/Graphiques";
import { Badge, Button, Card, CardHeader, EtatVide, PageHeader } from "@/components/ui/primitives";
import { useFilieresSup, type FiliereSup } from "@/lib/api/superieur-public";
import { LIBELLE_TYPE_PARCOURS, libelleCycle } from "@/lib/enseignement-superieur";
import { exporterCsv, type Colonne } from "@/lib/export";
import { lire } from "@/lib/http";
import { nombre } from "@/lib/format";
import { EtatErreur } from "../../etablissement/_composants";
import { OngletsESup } from "../_Onglets";
import { BadgeHabilitation, ChargementRegistre } from "../_Registre";

/** Cycle de vie d'un stage, du repérage de l'offre à la validation (statuts du registre des stages). */
const ETAPES: [string, string][] = [
  ["recherche", "L'offre est cherchée par l'apprenant."],
  ["piste", "Une entreprise est pressentie."],
  ["convention_en_cours", "La convention est en cours de signature."],
  ["signe", "Convention signée (école · entreprise · apprenant)."],
  ["en_cours", "Stage en cours, suivi par un tuteur académique."],
  ["termine", "Stage validé par l'établissement."],
];

/** Stages : obligations par filière (registre des filières) et effectifs de stages déclarés, par étape. */
export default function StagesPage() {
  const q = useFilieresSup();
  // Agrégat seulement : le stage est nominatif et reste sous la porte de l'établissement.
  const effectifs = useQuery({
    queryKey: ["superieur", "stages", "effectifs"],
    queryFn: ({ signal }) => lire<{ statut: string; effectif: number }[]>("/enseignement-superieur/stages/effectifs", signal),
    staleTime: 60_000,
  });
  const parStatut = new Map((effectifs.data ?? []).map((e) => [e.statut, Number(e.effectif)]));
  const avecStage = useMemo(() => (q.data ?? []).filter((f) => f.stageObligatoireMois > 0), [q.data]);
  const totalFilieres = q.data?.length ?? 0;

  const stats = useMemo(() => {
    const mois = avecStage.map((f) => f.stageObligatoireMois);
    const moyenne = mois.length ? mois.reduce((s, m) => s + m, 0) / mois.length : 0;
    return { nb: avecStage.length, moyenne, max: Math.max(0, ...mois) };
  }, [avecStage]);

  const COLONNES: Colonne<FiliereSup>[] = [
    { entete: "Filière", valeur: (f) => f.nom },
    { entete: "Établissement", valeur: (f) => f.etablissement.nom },
    { entete: "Habilitation", valeur: (f) => (f.habilitee ? "habilitée" : "non habilitée") },
    { entete: "Voie", valeur: (f) => LIBELLE_TYPE_PARCOURS[f.voie] },
    { entete: "Cycle / diplôme", valeur: (f) => libelleCycle(f) },
    { entete: "Stage obligatoire (mois)", valeur: (f) => f.stageObligatoireMois },
  ];

  const entetes: string[] = ["Filière", "Établissement", "Habilitation", "Voie", "Cycle / diplôme", "Durée de stage"];
  const lignes: ReactNode[][] = avecStage.map((f) => [
    f.nom,
    f.etablissement.sigle ?? f.etablissement.nom,
    <BadgeHabilitation key={`${f.id}-h`} habilitee={f.habilitee} />,
    LIBELLE_TYPE_PARCOURS[f.voie],
    libelleCycle(f),
    <span key={f.id} className="flex items-center gap-2"><span className="tabular-nums font-medium text-ink">{f.stageObligatoireMois} mois</span>{f.stageObligatoireMois >= stats.max && <Badge ton="marque">Le plus long</Badge>}</span>,
  ]);

  return (
    <div className="space-y-5">
      <PageHeader titre="Stages" sousTitre="Obligations de stage des filières du supérieur et cycle de vie d'une convention — le fil rouge entre l'école et l'entreprise." surtitre="Enseignement supérieur"
        actions={<Button variante="secondaire" disabled={!avecStage.length} taille="sm" icone={Download} onClick={() => exporterCsv("stages_obligatoires", avecStage, COLONNES, `BEILE — ${avecStage.length} filières à stage obligatoire — ${new Date().toISOString().slice(0, 10)}`)}>Exporter (CSV)</Button>} />

      <OngletsESup />

      <div className="flex items-start gap-3 rounded-lg bg-info-bg px-4 py-3 text-[13px] text-info">
        <ShieldCheck size={17} className="mt-0.5 shrink-0" aria-hidden />
        <p><strong>Registre et confidentialité.</strong> Les obligations viennent du registre des filières. Chaque stage déclaré (entreprise, tuteurs, dates) est enregistré en base mais reste nominatif : seuls l&apos;étudiant, son tuteur académique et la direction de l&apos;établissement le voient. Le pilotage n&apos;en lit que les effectifs.</p>
      </div>

      {q.isPending ? <ChargementRegistre tuiles={3} /> : q.isError ? <Card><EtatErreur erreur={q.error} reessayer={() => q.refetch()} /></Card> : (<>
      <div className="grid grid-cols-3 gap-3">
        {[[`${stats.nb} / ${totalFilieres}`, "filières à stage obligatoire"], [stats.nb ? `${nombre(stats.moyenne, 1)} mois` : "—", "durée moyenne"], [stats.nb ? `${stats.max} mois` : "—", "stage le plus long"]].map(([v, l]) => (
          <Card key={String(l)} className="p-3.5">
            <p className="text-2xl font-semibold tabular-nums text-ink">{v}</p>
            <p className="text-xs text-ink-muted">{l}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader icon={Briefcase} title="Obligations par filière" subtitle={`${avecStage.length} filières du registre imposent un stage (les ${totalFilieres - avecStage.length} autres n'en prévoient pas).`} />
        {avecStage.length
          ? <TableauDonnees colonnes={entetes} lignes={lignes} />
          : <EtatVide icone={Briefcase} titre="Aucune filière à stage obligatoire" texte={totalFilieres ? "Aucune filière enregistrée n'impose de stage." : "Le registre du supérieur ne compte encore aucune filière."} />}
      </Card>
      </>)}

      <Card>
        <CardHeader icon={Info} title="Cycle de vie d'une convention" subtitle="De la recherche de l'offre à la validation par l'établissement — effectifs de stages déclarés à chaque étape." />
        <ol className="space-y-2">
          {ETAPES.map(([code, texte], i) => (
            <li key={code} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-soft text-[12px] font-semibold text-accent-ink">{i + 1}</span>
              <p className="min-w-0 flex-1 text-[13.5px] text-ink-2"><span className="font-medium text-ink">{texte}</span></p>
              <span className="shrink-0 text-[13px] font-semibold tabular-nums text-ink">{effectifs.isPending ? "…" : effectifs.isError ? "—" : (parStatut.get(code) ?? 0)}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-ink-muted">Hors parcours normal : un stage peut être marqué « interrompu ». La validation finale revient à l&apos;établissement, via son tuteur académique.</p>
      </Card>
    </div>
  );
}
