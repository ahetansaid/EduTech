"use client";

import { ArrowRightLeft } from "lucide-react";
import { EntreePage } from "@/components/motion";
import { CarteTransfert } from "@/components/transferts/CarteTransfert";
import { Card, CardHeader, EtatVide, PageHeader, Squelette } from "@/components/ui/primitives";
import { EtatErreur } from "@/app/(gestion)/etablissement/_composants";
import { useTransfertsInspection } from "@/lib/api/etablissement";

/**
 * Inspection : transferts vers les écoles de la circonscription depuis 90 jours. Une demande refusée ou restée sans
 * réponse peut être décidée par l'inspection (affectation par l'autorité), motif obligatoire ; places contrôlées.
 */
export default function Page() {
  const t = useTransfertsInspection();
  const lignes = t.data?.transferts ?? [];
  const aArbitrer = lignes.filter((x) => x.peutImposer && x.etat !== "en_attente");
  const autres = lignes.filter((x) => !aArbitrer.includes(x));
  return (
    <EntreePage>
      <div className="space-y-5">
        <PageHeader surtitre="Pilotage" titre="Transferts d'élèves"
          sousTitre="Demandes vers les écoles de votre circonscription. Quand une école refuse ou ne répond pas, vous pouvez décider le transfert, en motivant : la décision est inscrite au registre." />
        {t.isPending ? (
          <div className="space-y-2">{Array.from({ length: 3 }, (_, i) => <Squelette key={i} className="h-24" />)}</div>
        ) : t.isError ? (
          <Card><EtatErreur erreur={t.error} reessayer={() => t.refetch()} /></Card>
        ) : (
          <>
            <Card className="min-w-0">
              <CardHeader icon={ArrowRightLeft} title="À arbitrer" subtitle="Refusées par l'école d'accueil ou expirées sans réponse" />
              {aArbitrer.length ? <ul className="space-y-3">{aArbitrer.map((x) => <CarteTransfert key={x.id} t={x} sens="inspection" />)}</ul>
                : <EtatVide icone={ArrowRightLeft} titre="Rien à arbitrer" texte="Aucune demande refusée ou restée sans réponse." />}
            </Card>
            <Card className="min-w-0">
              <CardHeader icon={ArrowRightLeft} title="En cours et récents" subtitle="En attente de la réponse des écoles, ou acceptés depuis 90 jours" />
              {autres.length ? <ul className="space-y-3">{autres.map((x) => <CarteTransfert key={x.id} t={x} sens="inspection" />)}</ul>
                : <EtatVide icone={ArrowRightLeft} titre="Aucun transfert" />}
            </Card>
            {t.data?.tronque && <p className="text-xs text-ink-muted">Liste limitée aux 1 000 demandes les plus récentes.</p>}
          </>
        )}
      </div>
    </EntreePage>
  );
}
