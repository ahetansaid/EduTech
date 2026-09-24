"use client";

import type { ResultatVerification } from "@beile/contracts";
import { ArrowLeft, CircleAlert, CircleCheckBig, FileWarning, Ban, FlaskConical } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, use, useState } from "react";
import { Card } from "@/components/ui/primitives";
import { useThemeEspace } from "@/lib/useSombre";
import { cn } from "@/lib/cn";
import { date } from "@/lib/format";
import { empreinteCertificat } from "@/lib/sim/micro";
import { maintenant, useHydratation, useMonde } from "@/lib/store";

const MENTIONS = ["Passable", "Assez bien", "Bien", "Très bien"];

function Verification({ id }: { id: string }) {
  const params = useSearchParams();
  const monde = useMonde();
  useHydratation();
  useThemeEspace(false);
  const presente = (params.get("e") ?? "").toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 64);
  const cert = monde.certificats.find((c) => c.id === id);
  const titulaire = cert ? monde.apprenants.find((a) => a.id === cert.apprenantId) : undefined;
  const nom = titulaire ? `${titulaire.prenoms} ${titulaire.nom}` : "";
  const [falsification, setFalsification] = useState<string | null>(null);

  let resultat: ResultatVerification;
  if (!cert || !titulaire) resultat = { statut: "introuvable", explication: "Aucun diplôme ne porte cet identifiant dans le registre des certifications." };
  else {
    // Empreinte du document présenté : celle du QR code, ou recalculée si l'on simule une modification du document.
    const empreintePresentee = falsification ? empreinteCertificat({ ...cert, mention: falsification }, nom) : presente || cert.empreinte;
    if (cert.revoque) resultat = { statut: "revoque", certificatId: cert.id, explication: "Ce diplôme a été révoqué par l'autorité de certification. Il ne doit pas être accepté." };
    else if (!cert.empreinte.startsWith(empreintePresentee.slice(0, 32))) resultat = { statut: "altere", certificatId: cert.id, explication: "Le document présenté ne correspond pas au diplôme délivré : au moins une information (nom, mention, note, session) a été modifiée." };
    else resultat = { statut: "authentique", certificatId: cert.id, titulaire: nom, examen: cert.examen, session: cert.session, mention: cert.mention, delivreLe: cert.delivreLe };
  }

  const style = {
    authentique: { icone: CircleCheckBig, titre: "Diplôme authentique", couleur: "text-success", fond: "bg-success-bg", bord: "border-success/30" },
    altere: { icone: FileWarning, titre: "Document altéré", couleur: "text-critical", fond: "bg-critical-bg", bord: "border-critical/30" },
    revoque: { icone: Ban, titre: "Diplôme révoqué", couleur: "text-critical", fond: "bg-critical-bg", bord: "border-critical/30" },
    introuvable: { icone: CircleAlert, titre: "Diplôme introuvable", couleur: "text-warning", fond: "bg-warning-bg", bord: "border-warning/30" },
  }[resultat.statut];

  return (
    <div className="space-y-6">
      <Link href="/verifier" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-muted hover:text-ink"><ArrowLeft size={15} /> Nouvelle vérification</Link>
      <Card className={cn("animate-slide-up border-2 text-center", style.bord)}>
        <span className={cn("mx-auto flex h-16 w-16 items-center justify-center rounded-full", style.fond, style.couleur)}><style.icone size={32} aria-hidden /></span>
        <h1 className={cn("mt-4 text-[26px] font-bold", style.couleur)}>{style.titre}</h1>
        {resultat.statut === "authentique" ? (
          <dl className="mx-auto mt-6 grid max-w-md gap-3 text-left text-[14px]">
            {[["Titulaire", resultat.titulaire], ["Diplôme", resultat.examen === "CEP" ? "Certificat d'études primaires (CEP)" : resultat.examen], ["Session", resultat.session], ["Mention", resultat.mention], ["Délivré le", date(resultat.delivreLe)], ["Identifiant", resultat.certificatId]].map(([l, v]) => (
              <div key={l} className="flex justify-between gap-4 border-b border-line/60 pb-2"><dt className="text-ink-muted">{l}</dt><dd className={cn("text-right font-semibold text-ink", l === "Identifiant" && "font-mono text-[12.5px]")}>{v}</dd></div>
            ))}
          </dl>
        ) : (
          <p className="mx-auto mt-3 max-w-md text-ink-2">{resultat.explication}</p>
        )}
        <p className="mt-6 text-[12px] text-ink-muted">Vérifié le {date(maintenant())} auprès du registre national des certifications (démonstration).</p>
      </Card>

      {cert && !cert.revoque && (
        <Card>
          <div className="flex items-start gap-3">
            <FlaskConical size={20} className="mt-0.5 shrink-0 text-amber" aria-hidden />
            <div className="flex-1">
              <p className="text-[14px] font-semibold text-ink">Tester la détection de fraude</p>
              <p className="mt-1 text-[13px] text-ink-2">Simulez un document dont la mention aurait été modifiée à la main. Son empreinte ne correspond plus à celle du diplôme délivré.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {MENTIONS.filter((m) => m !== cert.mention).map((m) => (
                  <button key={m} onClick={() => setFalsification(m)} className={cn("rounded-md px-3 py-1.5 text-[12.5px] font-medium ring-1 ring-inset", falsification === m ? "bg-critical text-white ring-critical" : "ring-line hover:bg-surface-2")}>
                    Mention falsifiée : « {m} »
                  </button>
                ))}
                {falsification && <button onClick={() => setFalsification(null)} className="rounded-md px-3 py-1.5 text-[12.5px] font-medium text-blue hover:underline">Revenir au document original</button>}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Suspense><Verification id={decodeURIComponent(id)} /></Suspense>;
}
