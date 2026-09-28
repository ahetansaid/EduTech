"use client";

import { Building2, Download, Info } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { TableauDonnees } from "@/components/charts/Graphiques";
import { Badge, Button, Card, CardHeader, EtatVide, PageHeader, type Ton } from "@/components/ui/primitives";
import { useEtablissementsSup, type EtablissementSupPublic } from "@/lib/api/superieur-public";
import { LIBELLE_TYPE_ETAB, LIBELLE_TUTELLE } from "@/lib/enseignement-superieur";
import { exporterCsv, type Colonne } from "@/lib/export";
import { EtatErreur } from "../../etablissement/_composants";
import { OngletsESup } from "../_Onglets";
import { ChargementRegistre } from "../_Registre";

const LIBELLE_STATUT: Record<string, string> = { public: "Public", prive: "Privé", confessionnel: "Confessionnel" };
const TON_STATUT: Record<string, Ton> = { public: "info", prive: "neutre", confessionnel: "neutre" };

type Filtre = "tous" | string;

/** Écoles & établissements : l'offre d'enseignement supérieur, ses tutelles et ses rattachements. */
export default function EtablissementsPage() {
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const q = useEtablissementsSup();
  const reseau = useMemo(() => q.data ?? [], [q.data]);
  /** Libellé d'un type : celui du registre d'abord, la table locale sinon, le code brut en dernier. */
  const libelleType = useMemo(() => {
    const m = new Map(reseau.map((e) => [e.type, e.libelleType ?? LIBELLE_TYPE_ETAB[e.type] ?? e.type]));
    return (t: string) => m.get(t) ?? LIBELLE_TYPE_ETAB[t] ?? t;
  }, [reseau]);
  const types = useMemo(() => [...new Set(reseau.map((e) => e.type))], [reseau]);
  const nomParId = useMemo(() => new Map(reseau.map((e) => [e.id, e.nom])), [reseau]);
  const visibles = useMemo(() => reseau.filter((e) => filtre === "tous" || e.type === filtre), [reseau, filtre]);

  const stats = useMemo(() => ({
    total: reseau.length,
    publics: reseau.filter((e) => e.statut === "public").length,
    ecolesNat: reseau.filter((e) => e.type === "ecole_nationale").length,
    rattachees: reseau.filter((e) => e.rattachementId != null).length,
  }), [reseau]);

  const COLONNES: Colonne<EtablissementSupPublic>[] = [
    { entete: "Établissement", valeur: (e) => e.nom },
    { entete: "Sigle", valeur: (e) => e.sigle ?? "" },
    { entete: "Type", valeur: (e) => libelleType(e.type) },
    { entete: "Statut", valeur: (e) => LIBELLE_STATUT[e.statut] ?? e.statut },
    { entete: "Tutelle(s)", valeur: (e) => e.tutelles.map((t) => LIBELLE_TUTELLE[t] ?? t).join(" + ") },
    { entete: "Rattaché à", valeur: (e) => (e.rattachementId ? nomParId.get(e.rattachementId) ?? e.rattachementId : "") },
    { entete: "Commune", valeur: (e) => e.commune ?? "" },
    { entete: "Département", valeur: (e) => e.departement ?? "" },
  ];

  const entetes: string[] = ["Établissement", "Type", "Statut", "Tutelle(s)", "Rattachement", "Localisation"];
  const lignes: ReactNode[][] = visibles.map((e) => [
    <span key={e.id} className="flex items-baseline gap-2"><span className="text-ink">{e.nom}</span>{e.sigle && <span className="text-xs text-ink-muted">{e.sigle}</span>}</span>,
    libelleType(e.type),
    <Badge key={`${e.id}-s`} ton={TON_STATUT[e.statut] ?? "neutre"}>{LIBELLE_STATUT[e.statut] ?? e.statut}</Badge>,
    <span key={`${e.id}-t`} className="flex flex-wrap gap-1">{e.tutelles.map((t) => <Badge key={t} ton="marque">{LIBELLE_TUTELLE[t] ?? t}</Badge>)}</span>,
    e.rattachementId ? <span key={`${e.id}-r`} className="text-xs text-ink-2">rattachée à {nomParId.get(e.rattachementId) ?? e.rattachementId}</span> : <span key={`${e.id}-nr`} className="text-xs text-ink-muted">autonome</span>,
    <span key={`${e.id}-l`} className="text-xs text-ink-2">{[e.commune, e.departement].filter(Boolean).join(" · ") || "—"}</span>,
  ]);

  return (
    <div className="space-y-5">
      <PageHeader titre="Écoles & établissements" sousTitre="Le réseau du supérieur : universités, écoles nationales rattachées, instituts et centres EFTP — avec leur tutelle et leur statut." surtitre="Enseignement supérieur"
        actions={<Button variante="secondaire" disabled={!visibles.length} taille="sm" icone={Download} onClick={() => exporterCsv("etablissements_enseignement_superieur", visibles, COLONNES, `BEILE — ${visibles.length} établissements (type ${filtre === "tous" ? "tous" : libelleType(filtre)}) — ${new Date().toISOString().slice(0, 10)}`)}>Exporter (CSV)</Button>} />

      <OngletsESup />

      <div className="flex items-start gap-3 rounded-lg bg-info-bg px-4 py-3 text-[13px] text-info">
        <Info size={17} className="mt-0.5 shrink-0" aria-hidden />
        <p><strong>Registre des établissements.</strong> Chaque établissement est lu tel qu&apos;enregistré, avec son type, sa ou ses tutelles (une école nationale se rattache à une université, l&apos;EFTP est sous double tutelle) et son statut.</p>
      </div>

      {q.isPending ? <ChargementRegistre /> : q.isError ? <Card><EtatErreur erreur={q.error} reessayer={() => q.refetch()} /></Card> : (<>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[[stats.total, "établissements"], [stats.ecolesNat, "écoles nationales"], [stats.rattachees, "rattachées"], [stats.publics, "publics"]].map(([v, l]) => (
          <Card key={String(l)} className="p-3.5">
            <p className="text-2xl font-semibold tabular-nums text-ink">{v}</p>
            <p className="text-xs text-ink-muted">{l}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader icon={Building2} title="Annuaire" subtitle={`${visibles.length} sur ${stats.total} — filtrer par type, exporter le périmètre affiché.`}
          action={<select value={filtre} onChange={(e) => setFiltre(e.target.value as Filtre)} className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink" aria-label="Filtrer par type">
            <option value="tous">Tous les types</option>
            {types.map((t) => <option key={t} value={t}>{libelleType(t)}</option>)}
          </select>} />
        {visibles.length
          ? <TableauDonnees colonnes={entetes} lignes={lignes} />
          : <EtatVide icone={Building2} titre={stats.total ? "Aucun établissement de ce type" : "Aucun établissement enregistré"} texte={stats.total ? "Changez de filtre pour voir le reste du réseau." : "Le registre du supérieur ne compte encore aucun établissement."} />}
      </Card>
      </>)}
    </div>
  );
}
