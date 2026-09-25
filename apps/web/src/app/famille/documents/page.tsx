"use client";

import { FileCheck2, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { Cascade, Element, EntreePage } from "@/components/motion";
import { CartePreuve } from "@/components/ui/Preuve";
import { Button, Card, EtatVide, PageHeader, Squelette } from "@/components/ui/primitives";
import { initiales, nomComplet, useEnfants } from "@/lib/api/parcours";
import { ErreurApi } from "@/lib/http";

export default function Documents() {
  const q = useEnfants();
  const enfants = q.data ?? [];
  const total = enfants.reduce((s, e) => s + e.certificats.length, 0);

  return (
    <EntreePage>
      <div className="space-y-5">
        <PageHeader
          titre="Documents"
          sousTitre="Diplômes et attestations de vos enfants. Chacun porte un QR code : une école, un employeur ou une administration le vérifie en quelques secondes, sans compte."
        />

        {q.isPending ? (
          <div className="space-y-3" aria-busy>{[0, 1].map((i) => <Squelette key={i} className="h-44 rounded-xl" />)}</div>
        ) : q.isError ? (
          <Card>
            {q.error instanceof ErreurApi && q.error.refus
              ? <EtatVide icone={ShieldAlert} titre="Accès refusé" texte={`${q.error.message}. Ce refus a été enregistré au journal d'audit.`} />
              : <EtatVide icone={RefreshCw} titre="Documents momentanément indisponibles" texte={`${q.error.message}. Réessayez dans un instant.`} action={<Button variante="secondaire" icone={RefreshCw} onClick={() => q.refetch()}>Réessayer</Button>} />}
          </Card>
        ) : enfants.length === 0 ? (
          <Card><EtatVide icone={FileCheck2} titre="Aucun enfant rattaché" texte="Aucun lien de filiation vérifié n'est associé à votre identité." /></Card>
        ) : (
          <>
            <Cascade data-guide="documents-liste" className="space-y-6">
              {enfants.map((d) => (
                <Element key={d.apprenant.id} className="space-y-3">
                  <h2 className="flex items-center gap-2.5 text-[15px] font-semibold text-ink">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ background: "var(--acc)" }}>{initiales(d.apprenant)}</span>
                    {nomComplet(d.apprenant)}
                    <span className="text-xs font-normal text-ink-muted">· {d.certificats.length} document{d.certificats.length > 1 ? "s" : ""}</span>
                  </h2>
                  {d.certificats.length ? d.certificats.map((c) => (
                    <div key={c.id} className="relative">
                      <CartePreuve certificat={c} titulaire={nomComplet(d.apprenant)} />
                      {c.revoque && <span className="absolute right-3 top-3 rounded-sm bg-critical-bg px-2 py-0.5 text-xs font-semibold text-critical">Révoqué</span>}
                    </div>
                  )) : (
                    <Card><EtatVide icone={FileCheck2} titre="Aucun diplôme pour l'instant" texte="Les diplômes apparaîtront ici automatiquement après délibération, sans démarche de votre part." /></Card>
                  )}
                </Element>
              ))}
            </Cascade>
            {total > 0 && (
              <Card className="flex items-start gap-3">
                <ShieldCheck size={20} className="mt-0.5 shrink-0" style={{ color: "var(--acc)" }} aria-hidden />
                <p className="text-[13.5px] text-ink-2">Le QR code ne contient aucune donnée personnelle en clair : seulement l&apos;identifiant du diplôme et une empreinte. Toute modification du document (nom, mention, note) est détectée à la vérification.</p>
              </Card>
            )}
          </>
        )}
      </div>
    </EntreePage>
  );
}
