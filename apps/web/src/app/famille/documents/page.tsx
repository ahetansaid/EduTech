"use client";

import { FileCheck2 } from "lucide-react";
import { CartePreuve } from "@/components/ui/Preuve";
import { Card, EtatVide } from "@/components/ui/primitives";
import { useEnfants } from "@/lib/famille";
import { useMonde } from "@/lib/store";

export default function Documents() {
  const monde = useMonde();
  const enfants = useEnfants();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-bold text-ink">Documents</h1>
        <p className="mt-1 text-[14px] text-ink-2">Diplômes et attestations de vos enfants. Chacun porte un QR code : un établissement, un employeur ou une administration le vérifie en quelques secondes, sans compte et sans écrire au ministère.</p>
      </div>
      {enfants.map(({ apprenant }) => {
        const certs = monde.certificats.filter((c) => c.apprenantId === apprenant.id);
        return (
          <section key={apprenant.id} className="space-y-3">
            <h2 className="text-[15px] font-semibold text-ink">{apprenant.prenoms} {apprenant.nom}</h2>
            {certs.length ? certs.map((c) => <CartePreuve key={c.id} certificat={c} titulaire={`${apprenant.prenoms} ${apprenant.nom}`} />) : (
              <Card><EtatVide icone={FileCheck2} titre="Aucun diplôme pour l'instant" texte="Les diplômes apparaîtront ici automatiquement après délibération, sans démarche." /></Card>
            )}
          </section>
        );
      })}
    </div>
  );
}
