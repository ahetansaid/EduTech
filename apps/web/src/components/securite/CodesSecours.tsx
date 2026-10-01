"use client";

import { Check, Copy, LifeBuoy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/primitives";

/** Codes de secours, montrés une seule fois : chacun remplace une fois le second facteur (téléphone perdu). */
export function CodesSecours({ codes, onTermine }: { codes: string[]; onTermine: () => void }) {
  const [copie, setCopie] = useState(false);
  const [garde, setGarde] = useState(false);
  return (
    <div>
      <p className="flex items-center gap-2 font-semibold text-ink"><LifeBuoy size={17} className="text-accent-ink" aria-hidden /> Vos codes de secours</p>
      <p className="mt-1 text-[13.5px] text-ink-2">Chaque code sert une seule fois, si vous perdez votre téléphone ou votre clé. Ils ne seront plus jamais affichés : gardez-les hors ligne, en lieu sûr.</p>
      <ul className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-surface-2/70 p-4 font-mono text-[14.5px] tracking-wide text-ink">
        {codes.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variante="secondaire" taille="sm" icone={copie ? Check : Copy} onClick={() => { void navigator.clipboard?.writeText(codes.join("\n")); setCopie(true); }}>{copie ? "Copiés" : "Copier"}</Button>
      </div>
      <label className="mt-4 flex items-center gap-2 text-[13.5px] text-ink-2">
        <input type="checkbox" checked={garde} onChange={(e) => setGarde(e.target.checked)} className="h-4 w-4 rounded border-line" /> J'ai mis ces codes en lieu sûr
      </label>
      <Button className="mt-4 w-full" disabled={!garde} onClick={onTermine}>Continuer</Button>
    </div>
  );
}
