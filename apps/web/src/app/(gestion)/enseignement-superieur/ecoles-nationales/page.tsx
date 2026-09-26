"use client";

import { Building2, Download, Info } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { TableauDonnees } from "@/components/charts/Graphiques";
import { Badge, Button, Card, CardHeader, PageHeader, type Ton } from "@/components/ui/primitives";
import { CATALOGUE_ETABLISSEMENTS, LIBELLE_TYPE_ETAB, LIBELLE_TUTELLE } from "@/lib/enseignement-superieur";
import { exporterCsv, type Colonne } from "@/lib/export";
import type { EtablissementSup, TypeEtablissementSup } from "@beile/contracts";
import { OngletsESup } from "../_Onglets";

const LIBELLE_STATUT: Record<string, string> = { public: "Public", prive: "Privé", confessionnel: "Confessionnel" };
const TON_STATUT: Record<string, Ton> = { public: "info", prive: "neutre", confessionnel: "neutre" };

type Filtre = "tous" | TypeEtablissementSup;

/** Écoles & établissements : l'offre d'enseignement supérieur, ses tutelles et ses rattachements. */
export default function EtablissementsPage() {
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const types = useMemo(() => [...new Set(CATALOGUE_ETABLISSEMENTS.map((e) => e.type))], []);
  const nomParId = useMemo(() => new Map(CATALOGUE_ETABLISSEMENTS.map((e) => [e.id, e.nom])), []);
  const visibles = useMemo(() => CATALOGUE_ETABLISSEMENTS.filter((e) => filtre === "tous" || e.type === filtre), [filtre]);

  const stats = useMemo(() => ({
    total: CATALOGUE_ETABLISSEMENTS.length,
    publics: CATALOGUE_ETABLISSEMENTS.filter((e) => e.statut === "public").length,
    ecolesNat: CATALOGUE_ETABLISSEMENTS.filter((e) => e.type === "ecole_nationale").length,
    rattachees: CATALOGUE_ETABLISSEMENTS.filter((e) => e.rattachementId != null).length,
  }), []);

  const COLONNES: Colonne<EtablissementSup>[] = [
    { entete: "Établissement", valeur: (e) => e.nom },
    { entete: "Sigle", valeur: (e) => e.sigle ?? "" },
    { entete: "Type", valeur: (e) => LIBELLE_TYPE_ETAB[e.type] ?? e.type },
    { entete: "Statut", valeur: (e) => LIBELLE_STATUT[e.statut] ?? e.statut },
    { entete: "Tutelle(s)", valeur: (e) => e.tuts.map((t) => LIBELLE_TUTELLE[t] ?? t).join(" + ") },
    { entete: "Rattaché à", valeur: (e) => (e.rattachementId ? nomParId.get(e.rattachementId) ?? e.rattachementId : "") },
  ];

  const entetes: string[] = ["Établissement", "Type", "Statut", "Tutelle(s)", "Rattachement"];
  const lignes: ReactNode[][] = visibles.map((e) => [
    <span key={e.id} className="flex items-baseline gap-2"><span className="text-ink">{e.nom}</span>{e.sigle && <span className="text-xs text-ink-muted">{e.sigle}</span>}</span>,
    LIBELLE_TYPE_ETAB[e.type] ?? e.type,
    <Badge key={`${e.id}-s`} ton={TON_STATUT[e.statut] ?? "neutre"}>{LIBELLE_STATUT[e.statut] ?? e.statut}</Badge>,
    <span key={`${e.id}-t`} className="flex flex-wrap gap-1">{e.tuts.map((t) => <Badge key={t} ton="marque">{LIBELLE_TUTELLE[t] ?? t}</Badge>)}</span>,
    e.rattachementId ? <span key={`${e.id}-r`} className="text-xs text-ink-2">rattachée à {nomParId.get(e.rattachementId) ?? e.rattachementId}</span> : <span key={`${e.id}-nr`} className="text-xs text-ink-muted">autonome</span>,
  ]);

  return (
    <div className="space-y-5">
      <PageHeader titre="Écoles & établissements" sousTitre="Le réseau du supérieur : universités, écoles nationales rattachées, instituts et centres EFTP — avec leur tutelle et leur statut." surtitre="Enseignement supérieur"
        actions={<Button variante="secondaire" taille="sm" icone={Download} onClick={() => exporterCsv("etablissements_enseignement_superieur", visibles, COLONNES, `BEILE — ${visibles.length} établissements (type ${filtre === "tous" ? "tous" : LIBELLE_TYPE_ETAB[filtre]}) — ${new Date().toISOString().slice(0, 10)}`)}>Exporter (CSV)</Button>} />

      <OngletsESup />

      <div className="flex items-start gap-3 rounded-lg bg-info-bg px-4 py-3 text-[13px] text-info">
        <Info size={17} className="mt-0.5 shrink-0" aria-hidden />
        <p><strong>Réseau indicatif.</strong> Cette liste montre les <em>types</em> d&apos;établissements et leurs tutelles (une école nationale se rattache à une université, le EFTP est sous double tutelle). La liste officielle complète — écoles privées agréées comprises — est une donnée à sertir à l&apos;étape de migration, pas une vérité en dur ici.</p>
      </div>

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
            {types.map((t) => <option key={t} value={t}>{LIBELLE_TYPE_ETAB[t] ?? t}</option>)}
          </select>} />
        <TableauDonnees colonnes={entetes} lignes={lignes} />
      </Card>
    </div>
  );
}
