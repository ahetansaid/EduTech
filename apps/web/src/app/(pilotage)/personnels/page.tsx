"use client";

import { BriefcaseBusiness, Download, UsersRound } from "lucide-react";
import { useState } from "react";
import { EntreePage } from "@/components/motion";
import { TuileIndicateur } from "@/components/ui/donnees";
import { Modale } from "@/components/ui/Modale";
import { notifier } from "@/components/ui/Notifications";
import { Badge, Button, Card, EtatVide, PageHeader, Squelette } from "@/components/ui/primitives";
import { COURT_STATUT_EMPLOI, LIBELLE_STATUT_EMPLOI, type StatutEmploi } from "@/lib/api/etablissement";
import { usePersonnelsEtablissement, usePersonnelsTutelle, useStatutEmploiMutation, type EnseignantTutelle, type PersonnelsTutelle } from "@/lib/api/personnels";
import { exporterCsv, type Colonne } from "@/lib/export";
import { entier } from "@/lib/format";
import { EtatEchec, Feuille, libellePerimetre } from "../_commun";

const STATUTS: StatutEmploi[] = ["ape", "ace", "ame", "vacataire"];
const COLONNES: Colonne<PersonnelsTutelle["etablissements"][number]>[] = [
  { entete: "etablissement", valeur: (e) => e.nom }, { entete: "id", valeur: (e) => e.id }, { entete: "enseignants", valeur: (e) => e.enseignants },
  { entete: "ape", valeur: (e) => e.ape }, { entete: "ace", valeur: (e) => e.ace }, { entete: "ame", valeur: (e) => e.ame },
  { entete: "vacataires", valeur: (e) => e.vacataire }, { entete: "non_renseigne", valeur: (e) => e.nonRenseigne },
];

/**
 * Les personnels enseignants vus par la tutelle : qui est titulaire, contractuel, aspirant ou vacataire, école par
 * école. Les écoles les moins renseignées d'abord : c'est le travail à faire. Le statut se tient par la gestion des
 * personnels, avec un motif ; l'établissement ne se le déclare pas.
 */
export default function PagePersonnels() {
  const q = usePersonnelsTutelle();
  const [ouverte, setOuverte] = useState<string | null>(null);
  const d = q.data;
  return (
    <EntreePage>
      <div className="space-y-5">
        <PageHeader surtitre={d ? `Personnels · ${libellePerimetre(d.perimetre)}` : "Personnels"} titre="Statuts des enseignants"
          sousTitre="Agents permanents, contractuels, aspirants et vacataires, école par école. Un statut non renseigné n'est jamais déduit du grade."
          actions={d ? <Button variante="secondaire" taille="sm" icone={Download} disabled={!d.etablissements.length}
            onClick={() => exporterCsv("statuts_enseignants", d.etablissements, COLONNES, `BEILE — statuts d'emploi des enseignants · ${libellePerimetre(d.perimetre)} — ${new Date().toISOString().slice(0, 10)}`, false)}>Exporter (CSV)</Button> : undefined} />
        {q.isPending ? <Squelette className="h-96 rounded-2xl" /> : q.isError ? <EtatEchec erreur={q.error} onReessayer={() => q.refetch()} /> : !d ? null : (
          <>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <TuileIndicateur libelle="Enseignants" icone={UsersRound} valeur={entier(d.total.enseignants)} />
              {STATUTS.map((s) => <TuileIndicateur key={s} libelle={COURT_STATUT_EMPLOI[s]} icone={BriefcaseBusiness} valeur={entier(d.total[s])} indice={LIBELLE_STATUT_EMPLOI[s]} />)}
              <TuileIndicateur libelle="Non renseignés" icone={BriefcaseBusiness} accent={d.total.nonRenseigne ? "ambre" : "neutre"} valeur={entier(d.total.nonRenseigne)} />
            </div>
            <Card className="min-w-0">
              {!d.etablissements.length ? <EtatVide icone={UsersRound} titre="Aucun enseignant dans le périmètre" texte="Aucun établissement du périmètre n'a d'enseignant enregistré." /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[13.5px]">
                    <thead><tr className="border-b border-line text-left text-[11.5px] uppercase tracking-wide text-ink-muted">
                      <th className="py-2 pr-3">Établissement</th><th className="py-2 text-right">Ens.</th>
                      {STATUTS.map((s) => <th key={s} className="py-2 text-right">{COURT_STATUT_EMPLOI[s]}</th>)}<th className="py-2 text-right">Non renseignés</th>
                    </tr></thead>
                    <tbody>
                      {d.etablissements.map((e) => (
                        <tr key={e.id} className="cursor-pointer border-b border-line/60 hover:bg-surface-2" onClick={() => setOuverte(e.id)}>
                          <td className="py-2 pr-3 text-ink">{e.nom}</td><td className="py-2 text-right tabular-nums">{entier(e.enseignants)}</td>
                          {STATUTS.map((s) => <td key={s} className="py-2 text-right tabular-nums">{entier(e[s])}</td>)}
                          <td className="py-2 text-right tabular-nums">{e.nonRenseigne ? <Badge ton="avertissement">{entier(e.nonRenseigne)}</Badge> : "0"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {d.tronque && <p className="mt-2 text-xs text-ink-muted">Liste limitée aux 300 premières écoles (les moins renseignées d&apos;abord).</p>}
                </div>
              )}
            </Card>
          </>
        )}
        <EnseignantsEcole etablissementId={ouverte} onFermer={() => setOuverte(null)} />
      </div>
    </EntreePage>
  );
}

function EnseignantsEcole({ etablissementId, onFermer }: { etablissementId: string | null; onFermer: () => void }) {
  const q = usePersonnelsEtablissement(etablissementId);
  return (
    <Feuille ouvert={!!etablissementId} onFermer={onFermer} titre={q.data?.etablissement.nom ?? "Établissement"} description="Statut d'emploi de chaque enseignant" icone={UsersRound}>
      {q.isPending ? <Squelette className="h-64 rounded-lg" /> : q.isError ? <EtatEchec erreur={q.error} /> : !q.data ? null : (
        <ul className="divide-y divide-line">
          {q.data.enseignants.map((e) => <LigneEnseignant key={e.id} e={e} peutModifier={q.data!.peutModifier} />)}
        </ul>
      )}
    </Feuille>
  );
}

function LigneEnseignant({ e, peutModifier }: { e: EnseignantTutelle; peutModifier: boolean }) {
  const maj = useStatutEmploiMutation();
  const [cible, setCible] = useState<{ statut: StatutEmploi | null } | null>(null);
  const [motif, setMotif] = useState("");
  const fermer = () => { setCible(null); setMotif(""); maj.reset(); };
  const enregistrer = () => cible && maj.mutate({ enseignantId: e.id, statut: cible.statut, motif: motif.trim() }, {
    onSuccess: () => { notifier({ ton: "succes", titre: "Statut enregistré", texte: `${e.prenoms} ${e.nom} : ${cible.statut ? LIBELLE_STATUT_EMPLOI[cible.statut] : "non renseigné"}.` }); fermer(); },
  });
  const changer = (valeur: string) => setCible({ statut: valeur === "" ? null : (valeur as StatutEmploi) });
  return (
    <>
    <Modale ouvert={!!cible} onFermer={fermer} icone={BriefcaseBusiness} titre="Changer le statut d'emploi"
      sousTitre={`${e.prenoms} ${e.nom} → ${cible?.statut ? LIBELLE_STATUT_EMPLOI[cible.statut] : "non renseigné"}`}
      pied={<div className="flex justify-end gap-2"><Button variante="fantome" onClick={fermer}>Annuler</Button><Button variante="primaire" chargement={maj.isPending} disabled={motif.trim().length < 5} onClick={enregistrer}>Enregistrer</Button></div>}>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">Motif (acte, arrêté, décision…)</span>
        <textarea value={motif} onChange={(x) => setMotif(x.target.value.slice(0, 300))} rows={3} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink outline-none focus:border-blue/50 focus:ring-2 focus:ring-blue/20" />
      </label>
      {maj.error && <p role="alert" className="mt-2 rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">{maj.error.message}</p>}
    </Modale>
    <li className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-medium text-ink">{e.prenoms} {e.nom}</span>
        <span className="text-xs text-ink-muted">{e.grade} · {e.matieres.join(", ")}</span>
      </span>
      {peutModifier ? (
        <select value={e.statut ?? ""} disabled={maj.isPending} onChange={(x) => changer(x.target.value)} aria-label={`Statut d'emploi de ${e.prenoms} ${e.nom}`}
          className="h-9 rounded-lg border border-line bg-surface px-2 text-[13px] text-ink">
          <option value="">Non renseigné</option>
          {STATUTS.map((s) => <option key={s} value={s}>{LIBELLE_STATUT_EMPLOI[s]}</option>)}
        </select>
      ) : <Badge ton={e.statut ? "info" : "avertissement"}>{e.statut ? COURT_STATUT_EMPLOI[e.statut] : "Non renseigné"}</Badge>}
    </li>
    </>
  );
}
