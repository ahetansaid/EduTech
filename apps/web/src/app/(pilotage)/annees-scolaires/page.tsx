"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarX2, LockOpen } from "lucide-react";
import { useState } from "react";
import { EntreePage } from "@/components/motion";
import { Modale } from "@/components/ui/Modale";
import { notifier } from "@/components/ui/Notifications";
import { Badge, Button, Card, EtatVide, PageHeader, Squelette, type Ton } from "@/components/ui/primitives";
import { ecrire, lire } from "@/lib/http";
import { EtatEchec } from "../_commun";

type Statut = "en_cours" | "ouverte" | "close" | "rouverte" | "inconnue";
interface AnneeEcole { etablissementId: string; etablissement: string; anneeScolaire: string; statut: Statut; raison: string; scolarises: number; rentreeSuivante: string; jusquAu?: string }

const LIBELLE: Record<Statut, [string, Ton]> = {
  close: ["Close", "neutre"], rouverte: ["Rouverte", "avertissement"], ouverte: ["Ouverte (bascule à faire)", "info"], en_cours: ["En cours", "succes"], inconnue: ["Inconnue", "neutre"],
};

/**
 * Années scolaires des établissements du département dont la rentrée suivante est passée. Une année se ferme
 * d'elle-même quand l'école a basculé (plus aucun élève) ou un an après ; la direction départementale peut la rouvrir
 * au plus 30 jours, avec un motif inscrit au registre.
 */
export default function PageAnneesScolaires() {
  const client = useQueryClient();
  const q = useQuery({ queryKey: ["annees-scolaires", "a-suivre"], queryFn: ({ signal }) => lire<{ total: number; tronque: boolean; annees: AnneeEcole[] }>("/annees-scolaires/a-suivre", signal) });
  const [cible, setCible] = useState<AnneeEcole | null>(null);
  const [motif, setMotif] = useState("");
  const [jours, setJours] = useState(7);
  const rouvrir = useMutation({
    mutationFn: () => ecrire<AnneeEcole>(`/etablissements/${encodeURIComponent(cible!.etablissementId)}/annees/${encodeURIComponent(cible!.anneeScolaire)}/reouverture`, { motif: motif.trim(), jours }),
    onSuccess: (r) => {
      notifier({ ton: "succes", titre: "Année rouverte", texte: `${cible!.etablissement} · ${cible!.anneeScolaire} : ${r.raison}` });
      setCible(null); setMotif(""); setJours(7);
      void client.invalidateQueries({ queryKey: ["annees-scolaires"] });
    },
  });
  return (
    <EntreePage>
      <div className="space-y-5">
        <PageHeader surtitre="Pilotage" titre="Années scolaires"
          sousTitre="Une année se ferme quand l'école a basculé sur l'année suivante (ou un an après la rentrée). Close, elle n'accepte plus d'inscription, de service ni d'emploi du temps — sauf réouverture motivée par la direction départementale." />
        {q.isPending ? <Squelette className="h-56 rounded-xl" /> : q.isError ? <EtatEchec erreur={q.error} onReessayer={() => void q.refetch()} /> : !q.data.annees.length ? (
          <EtatVide icone={CalendarX2} titre="Aucune année à suivre" texte="Aucun établissement de votre département n'a d'année dont la rentrée suivante est passée." />
        ) : (
          <Card className="min-w-0">
            {q.data.tronque && <p role="status" className="mb-3 rounded-md bg-warning-bg px-3 py-2 text-[13px] text-ink-2">{q.data.annees.length} années affichées sur {q.data.total} : les années closes à rouvrir sont en tête de liste.</p>}
            <div className="overflow-auto">
              <table className="w-full min-w-[720px] text-left text-[13px]">
                <thead className="text-[11.5px] uppercase tracking-wide text-ink-muted">
                  <tr><th className="px-3 py-2">Établissement</th><th className="px-3 py-2">Année</th><th className="px-3 py-2">État</th><th className="px-3 py-2">Pourquoi</th><th className="px-3 py-2" /></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {q.data.annees.map((a) => (
                    <tr key={`${a.etablissementId}-${a.anneeScolaire}`}>
                      <td className="px-3 py-2 text-ink">{a.etablissement}</td>
                      <td className="px-3 py-2 tabular-nums">{a.anneeScolaire}</td>
                      <td className="px-3 py-2"><Badge ton={LIBELLE[a.statut][1]}>{LIBELLE[a.statut][0]}</Badge></td>
                      <td className="px-3 py-2 text-ink-2">{a.raison}</td>
                      <td className="px-3 py-2 text-right">{a.statut === "close" && <Button taille="sm" variante="secondaire" icone={LockOpen} onClick={() => setCible(a)}>Rouvrir</Button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
      <Modale ouvert={!!cible} onFermer={() => { setCible(null); rouvrir.reset(); }} icone={LockOpen} titre="Rouvrir une année close" sousTitre={cible ? `${cible.etablissement} · ${cible.anneeScolaire}` : undefined}
        pied={<div className="flex justify-end gap-2"><Button variante="fantome" onClick={() => setCible(null)}>Annuler</Button><Button variante="primaire" chargement={rouvrir.isPending} disabled={motif.trim().length < 10} onClick={() => rouvrir.mutate()}>Rouvrir</Button></div>}>
        <div className="space-y-3">
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">Motif (inscrit au registre)</span>
            <textarea value={motif} maxLength={200} rows={3} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. correction des services oubliés avant archivage" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink" aria-label="Motif" /></label>
          <label className="block max-w-[12rem]"><span className="mb-1.5 block text-sm font-medium text-ink">Durée (jours, 30 au plus)</span>
            <input type="number" min={1} max={30} value={jours} onChange={(e) => setJours(Math.min(30, Math.max(1, Number(e.target.value) || 1)))} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink" aria-label="Durée en jours" /></label>
          {rouvrir.error && <p role="alert" className="rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">{rouvrir.error.message}</p>}
        </div>
      </Modale>
    </EntreePage>
  );
}
