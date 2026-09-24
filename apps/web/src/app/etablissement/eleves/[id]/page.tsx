"use client";

import { ArrowLeft, ArrowRightLeft, History, UserMinus } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { DecisionAccesCarte } from "@/components/ui/donnees";
import { Badge, Button, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { libelleEvenement } from "@/lib/donnees";
import { date, nombre } from "@/lib/format";
import { absences, ageAu, moyennesParMatiere } from "@/lib/scolarite";
import { ANNEE, ETAB_COCOTIERS } from "@/lib/sim/micro";
import { evenementsApprenant, situationApprenant } from "@/lib/sim/projections";
import { maintenant, useAcces, useDemo, useMonde } from "@/lib/store";
import type { DecisionAcces } from "@beile/contracts";

function Dossier({ id }: { id: string }) {
  const monde = useMonde();
  const acces = useAcces();
  const enregistrer = useDemo((s) => s.enregistrer);
  const [confirmer, setConfirmer] = useState<"transfert" | "abandon" | null>(null);
  const a = monde.apprenants.find((x) => x.id === id);

  const decision: DecisionAcces | null = useMemo(() => (a ? acces.evaluer({ ressource: { type: "dossier_apprenant", apprenantId: a.id }, finalite: "gestion" }) : null), [a, acces]);
  // Chaque ouverture de dossier est journalisée, une fois par dossier affiché.
  useEffect(() => {
    if (a) acces.demander({ ressource: { type: "dossier_apprenant", apprenantId: a.id }, finalite: "gestion" }, "Ouverture d'un dossier apprenant", `${a.prenoms} ${a.nom} (${a.id})`);
  }, [a?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const situation = a ? situationApprenant(monde, monde.evenements, a.id) : null;
  const evts = useMemo(() => (a ? evenementsApprenant(monde.evenements, a.id).filter((e) => e.type !== "EVALUATION").reverse() : []), [monde, a]);
  if (!a || !situation) return <Card>Dossier introuvable.</Card>;
  if (!decision) return null;
  if (!decision.autorise) return <DecisionAccesCarte decision={decision} />;

  const agir = (type: "transfert" | "abandon") => {
    const base = { apprenantId: a.id, anneeScolaire: ANNEE, survenuLe: maintenant(), auteurId: "p-directeur", source: "beile" as const, etablissementId: situation.etablissementId };
    if (type === "transfert") enregistrer([{ type: "TRANSFERT", deEtablissementId: situation.etablissementId!, versEtablissementId: ETAB_COCOTIERS, versClasseId: monde.classes.find((c) => c.etablissementId === ETAB_COCOTIERS)!.id, ...base }]);
    else enregistrer([{ type: "ABANDON", ...base }]);
    setConfirmer(null);
  };

  return (
    <div className="space-y-6">
      <Link href="/etablissement/eleves" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-muted hover:text-ink"><ArrowLeft size={15} /> Apprenants</Link>
      <PageHeader
        surtitre={`Dossier ${a.id}`}
        titre={`${a.prenoms} ${a.nom}`}
        sousTitre={`${ageAu(a.dateNaissance)} ans · ${situation.statut === "scolarise" ? `${situation.classe?.libelle} · ${monde.etablissements.find((e) => e.id === situation.etablissementId)?.nom}` : situation.statut === "abandon" ? "Sorti du système (abandon déclaré)" : "Non inscrit"}`}
        actions={a.statutIdentite === "verifiee" ? <Badge ton="succes">Identité vérifiée</Badge> : <Badge ton="avertissement">Régularisation en cours</Badge>}
      />
      <DecisionAccesCarte decision={decision} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Moyennes du 2e trimestre" />
          <ul className="grid gap-1.5 text-[13.5px]">
            {moyennesParMatiere(monde.evenements, a.id, 2).map((m) => (
              <li key={m.matiere} className="flex justify-between border-b border-line/50 pb-1.5"><span className="text-ink-2">{m.matiere}</span><span className="font-semibold tabular text-ink">{nombre(m.moyenne, 2)}/20</span></li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] text-ink-muted">{absences(monde.evenements, a.id).length} absence(s) cette année.</p>
        </Card>
        <Card>
          <CardHeader icon={History} title="Historique du parcours" subtitle="Événements du registre, du plus récent au plus ancien" />
          <ul className="space-y-2 text-[13px]">
            {evts.slice(0, 10).map((e) => (
              <li key={e.id} className="flex items-center gap-3"><span className="w-20 shrink-0 tabular text-ink-muted">{date(e.survenuLe)}</span><Badge>{libelleEvenement(e.type)}</Badge><span className="truncate text-ink-2">{e.source}</span></li>
            ))}
          </ul>
        </Card>
      </div>
      {situation.statut === "scolarise" && (
        <Card>
          <CardHeader title="Transitions" subtitle="Le parcours suit l'apprenant : un transfert ne demande aucune ressaisie dans l'établissement d'accueil." />
          {confirmer ? (
            <div className="rounded-lg border border-critical/30 bg-critical-bg/60 p-4">
              <p className="text-[14px] font-semibold text-ink">{confirmer === "transfert" ? "Confirmer le transfert vers le CEG Les Cocotiers (Cotonou) ?" : "Confirmer la déclaration d'abandon ?"}</p>
              <p className="mt-1 text-[13px] text-ink-2">{confirmer === "transfert" ? "Le dossier et le passeport éducatif seront immédiatement accessibles à l'établissement d'accueil ; votre accès prendra fin." : "L'apprenant sortira des effectifs et sera compté dans le taux d'abandon. Une reprise ultérieure reste possible et conservera ses acquis."}</p>
              <div className="mt-3 flex gap-2"><Button variante="danger" taille="sm" onClick={() => agir(confirmer)}>Confirmer</Button><Button variante="fantome" taille="sm" onClick={() => setConfirmer(null)}>Annuler</Button></div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variante="secondaire" icone={ArrowRightLeft} onClick={() => setConfirmer("transfert")}>Transférer</Button>
              <Button variante="secondaire" icone={UserMinus} onClick={() => setConfirmer("abandon")}>Déclarer un abandon</Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Dossier id={id} />;
}
