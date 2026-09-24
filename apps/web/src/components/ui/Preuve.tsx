"use client";

import type { Certificat } from "@beile/contracts";
import { BadgeCheck, ExternalLink } from "lucide-react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { date, nombre } from "@/lib/format";
import { cn } from "@/lib/cn";

/** Lien de vérification porté par le QR code : identifiant + empreinte (32 premiers caractères). */
export const cheminVerification = (c: Certificat) => `/verifier/${encodeURIComponent(c.id)}?e=${c.empreinte.slice(0, 32)}`;

/** Attestation numérique vérifiable : la preuve se contrôle en quelques secondes, sans compte. */
export function CartePreuve({ certificat, titulaire, className }: { certificat: Certificat; titulaire: string; className?: string }) {
  const [origine, setOrigine] = useState("");
  useEffect(() => setOrigine(window.location.origin), []);
  const lien = cheminVerification(certificat);
  return (
    <div className={cn("overflow-hidden rounded-xl border border-line/70 bg-surface shadow-float", className)}>
      <div className="grid h-1 grid-cols-3" aria-hidden><span className="bg-flag-green" /><span className="bg-flag-yellow" /><span className="bg-flag-red" /></div>
      <div className="flex gap-4 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-muted">République du Bénin · attestation numérique</p>
          <p className="mt-1 font-display text-[19px] font-bold text-ink">{certificat.examen === "CEP" ? "Certificat d'études primaires" : certificat.examen === "BEPC" ? "Brevet d'études du premier cycle" : "Baccalauréat"}</p>
          <p className="mt-0.5 text-[13.5px] text-ink-2">{titulaire} · session {certificat.session}</p>
          <p className="mt-2 text-[13px] text-ink"><span className="text-ink-muted">Mention :</span> <strong>{certificat.mention}</strong> · <span className="tabular">{nombre(certificat.moyenne, 2)}/20</span></p>
          <p className="mt-2 font-mono text-[10.5px] text-ink-muted">{certificat.id} · délivré le {date(certificat.delivreLe)}</p>
          <p className="mt-1 break-all font-mono text-[10px] text-ink-muted">Empreinte {certificat.empreinte.slice(0, 32)}…</p>
          <Link href={lien} className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-blue hover:underline"><BadgeCheck size={14} aria-hidden /> Vérifier comme un tiers <ExternalLink size={12} aria-hidden /></Link>
        </div>
        <div className="shrink-0 self-center rounded-lg bg-white p-2 ring-1 ring-line">
          {origine ? <QRCodeSVG value={`${origine}${lien}`} size={104} level="M" aria-label="QR code de vérification" /> : <div className="h-[104px] w-[104px]" />}
        </div>
      </div>
    </div>
  );
}
