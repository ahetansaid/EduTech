"use client";

import { ScanLine, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card } from "@/components/ui/primitives";
import { useThemeEspace } from "@/lib/useSombre";
import { cheminVerification } from "@/components/ui/Preuve";
import { getMonde } from "@/lib/sim/monde";

export default function Verifier() {
  const router = useRouter();
  const [saisie, setSaisie] = useState("");
  useThemeEspace(false);
  const perimetre = getMonde().profils.find((p) => p.id === "p-apprenant")?.habilitations[0]?.perimetre;
  const exemple = perimetre?.niveau === "personnel" ? getMonde().certificats.find((c) => c.apprenantId === perimetre.apprenantId) : undefined;
  const valide = /^CERT-[A-Z]+-\d{4}-\d{6}$/.test(saisie.trim().toUpperCase());
  return (
    <div className="space-y-6">
      <div className="text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-navy text-white shadow-float dark:bg-blue dark:text-navy-deep"><ScanLine size={26} aria-hidden /></span>
        <h1 className="mt-4 text-[28px] font-bold text-ink">Vérifier un diplôme</h1>
        <p className="mx-auto mt-2 max-w-lg text-ink-2">Scannez le QR code du document ou saisissez son identifiant. La vérification est immédiate, gratuite et ne nécessite aucun compte.</p>
      </div>
      <Card>
        <form onSubmit={(e) => { e.preventDefault(); if (valide) router.push(`/verifier/${encodeURIComponent(saisie.trim().toUpperCase())}`); }} className="flex flex-col gap-3 sm:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">Identifiant du diplôme</span>
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
            <input value={saisie} onChange={(e) => setSaisie(e.target.value.slice(0, 40))} placeholder="CERT-CEP-2024-000001" className="h-12 w-full rounded-md border border-line bg-surface pl-9 pr-3 font-mono text-[14px] uppercase text-ink outline-none focus:ring-2 focus:ring-blue/40" aria-invalid={saisie !== "" && !valide} />
          </label>
          <Button taille="lg" type="submit" disabled={!valide}>Vérifier</Button>
        </form>
        {saisie !== "" && !valide && <p className="mt-2 text-[12.5px] text-critical">Format attendu : CERT-EXAMEN-ANNÉE-NUMÉRO</p>}
      </Card>
      {exemple && (
        <p className="text-center text-[13px] text-ink-muted">
          Pour la démonstration :{" "}
          <button onClick={() => router.push(cheminVerification(exemple))} className="font-semibold text-blue hover:underline">vérifier le CEP d'Aïcha ZANNOU</button>
        </p>
      )}
    </div>
  );
}
