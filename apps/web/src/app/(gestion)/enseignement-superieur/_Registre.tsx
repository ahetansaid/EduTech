"use client";

import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge, Squelette } from "@/components/ui/primitives";

/** Briques communes aux volets branchés sur le registre public du supérieur. */

/** Habilitation d'une filière : l'information anti-fraude à lire avant tout le reste. */
export function BadgeHabilitation({ habilitee }: { habilitee: boolean }) {
  return habilitee
    ? <Badge ton="succes" icone={ShieldCheck}>Habilitée</Badge>
    : <Badge ton="critique" icone={ShieldAlert}>Non habilitée</Badge>;
}

/** Squelette de page : tuiles de chiffres puis tableau. */
export function ChargementRegistre({ tuiles = 4 }: { tuiles?: number }) {
  return (
    <div className="space-y-5" aria-busy aria-live="polite">
      <div className={tuiles === 3 ? "grid grid-cols-3 gap-3" : "grid grid-cols-2 gap-3 sm:grid-cols-4"}>
        {Array.from({ length: tuiles }, (_, i) => <Squelette key={i} className="h-[74px] rounded-xl" />)}
      </div>
      <Squelette className="h-72 rounded-xl" />
    </div>
  );
}
