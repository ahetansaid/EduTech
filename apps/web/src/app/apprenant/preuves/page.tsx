"use client";

import { ShieldCheck } from "lucide-react";
import { CartePreuve } from "@/components/ui/Preuve";
import { Card } from "@/components/ui/primitives";
import { useMonde, useProfil } from "@/lib/store";

export default function Preuves() {
  const monde = useMonde();
  const profil = useProfil();
  const h = profil.habilitations.find((x) => x.role === "apprenant");
  const id = h?.perimetre.niveau === "personnel" ? h.perimetre.apprenantId : "";
  const a = monde.apprenants.find((x) => x.id === id);
  if (!a) return null;
  const certs = monde.certificats.filter((c) => c.apprenantId === a.id);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-bold text-ink">Mes diplômes</h1>
        <p className="mt-1 text-[14px] text-ink-2">Vos preuves vous appartiennent : partagez-les avec une école, une université ou un employeur. Ils les vérifient eux-mêmes, en quelques secondes.</p>
      </div>
      {certs.map((c) => <CartePreuve key={c.id} certificat={c} titulaire={`${a.prenoms} ${a.nom}`} />)}
      <Card className="flex items-start gap-3">
        <ShieldCheck size={20} className="mt-0.5 shrink-0" style={{ color: "var(--acc)" }} aria-hidden />
        <p className="text-[13.5px] text-ink-2">Le QR code ne contient aucune donnée personnelle en clair : seulement l'identifiant du diplôme et son empreinte. Toute modification du document (mention, note, nom) est détectée à la vérification.</p>
      </Card>
    </div>
  );
}
