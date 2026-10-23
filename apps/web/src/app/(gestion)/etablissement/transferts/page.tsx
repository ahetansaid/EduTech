"use client";

import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { useState } from "react";
import { EntreePage } from "@/components/motion";
import { CarteTransfert } from "@/components/transferts/CarteTransfert";
import { Badge, Card, CardHeader, EtatVide, PageHeader, Squelette } from "@/components/ui/primitives";
import { useTransferts, type Transfert } from "@/lib/api/etablissement";
import { cn } from "@/lib/cn";
import { useEtablissementCourant } from "@/lib/session";
import { EtatErreur, HorsPerimetre } from "../_composants";

export default function Page() {
  const id = useEtablissementCourant();
  return <EntreePage>{id ? <Transferts id={id} /> : <HorsPerimetre />}</EntreePage>;
}

/**
 * Transferts de l'établissement : les demandes reçues (accepter en choisissant la classe, ou refuser en motivant) et
 * celles envoyées (suivi, retrait). Les actions affichées sont celles que l'API autorise pour ce compte.
 */
function Transferts({ id }: { id: string }) {
  const t = useTransferts(id);
  const [onglet, setOnglet] = useState<"entrants" | "sortants">("entrants");
  const entrants = t.data?.entrants ?? [];
  const sortants = t.data?.sortants ?? [];
  const aTraiter = entrants.filter((x) => x.peutDecider).length;
  const liste: Transfert[] = onglet === "entrants" ? entrants : sortants;
  return (
    <div className="space-y-5">
      <PageHeader surtitre="Établissement" titre="Transferts"
        sousTitre="Un élève ne change d'école qu'avec l'accord de l'école d'accueil, qui a 15 jours pour répondre. Le dossier suit l'élève, sans ressaisie ; la famille est prévenue à chaque étape." />
      <div role="tablist" aria-label="Sens des transferts" className="flex gap-2">
        {([["entrants", "Demandes reçues", ArrowDownToLine, aTraiter], ["sortants", "Demandes envoyées", ArrowUpFromLine, sortants.filter((x) => x.etat === "en_attente").length]] as const).map(([cle, libelle, Icone, n]) => (
          <button key={cle} type="button" role="tab" aria-selected={onglet === cle} onClick={() => setOnglet(cle)}
            className={cn("inline-flex min-h-10 items-center gap-2 rounded-md border px-3.5 text-sm font-medium transition-colors", onglet === cle ? "border-blue bg-blue-soft/40 text-ink" : "border-line text-ink-2 hover:bg-surface-2")}>
            <Icone size={15} aria-hidden /> {libelle} {n > 0 && <Badge ton="info">{n}</Badge>}
          </button>
        ))}
      </div>
      <Card className="min-w-0">
        <CardHeader icon={onglet === "entrants" ? ArrowDownToLine : ArrowUpFromLine} title={onglet === "entrants" ? "Élèves que d'autres écoles vous adressent" : "Élèves que vous avez adressés à d'autres écoles"}
          subtitle={onglet === "entrants" ? "Acceptez en choisissant la classe (les places restantes sont contrôlées), ou refusez en motivant." : "Une demande se retire tant que l'école d'accueil n'a pas répondu."} />
        {t.isPending ? (
          <div className="space-y-2">{Array.from({ length: 3 }, (_, i) => <Squelette key={i} className="h-24" />)}</div>
        ) : t.isError ? (
          <EtatErreur erreur={t.error} reessayer={() => t.refetch()} />
        ) : !liste.length ? (
          <EtatVide icone={onglet === "entrants" ? ArrowDownToLine : ArrowUpFromLine} titre="Aucune demande" texte={onglet === "entrants" ? "Aucune école ne vous a adressé d'élève." : "Pour transférer un élève, ouvrez son dossier dans « Apprenants »."} />
        ) : (
          <ul className="space-y-3">{liste.map((x) => <CarteTransfert key={x.id} t={x} sens={onglet === "entrants" ? "entrant" : "sortant"} />)}</ul>
        )}
        {t.data?.tronque && <p className="mt-3 text-xs text-ink-muted">Seules les 200 demandes les plus récentes sont affichées.</p>}
      </Card>
    </div>
  );
}
