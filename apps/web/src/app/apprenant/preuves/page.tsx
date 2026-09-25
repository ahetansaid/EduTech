"use client";

import type { Certificat } from "@beile/contracts";
import { Award, Check, Copy, Maximize2, RefreshCw, Share2, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence, Cascade, Element, EntreePage, motion } from "@/components/motion";
import { notifier } from "@/components/ui/Notifications";
import { CartePreuve, cheminVerification } from "@/components/ui/Preuve";
import { Badge, Button, Card, EtatVide, PageHeader, Squelette } from "@/components/ui/primitives";
import { NOM_EXAMEN, nomComplet, usePasseport } from "@/lib/api/parcours";
import { nombre } from "@/lib/format";
import { ErreurApi } from "@/lib/http";

const useOrigine = () => useSyncExternalStore(() => () => {}, () => window.location.origin, () => "");

export default function Preuves() {
  const q = usePasseport();
  const [agrandi, setAgrandi] = useState<Certificat | null>(null);
  const d = q.data;

  return (
    <EntreePage>
      <div className="space-y-5">
        <PageHeader titre="Mes diplômes" sousTitre="Vos preuves vous appartiennent : partagez-les avec une école, une université ou un employeur. Ils les vérifient eux-mêmes, en quelques secondes, sans compte." />

        {q.isPending ? (
          <div className="space-y-3" aria-busy>{[0, 1].map((i) => <Squelette key={i} className="h-48 rounded-xl" />)}</div>
        ) : q.isError ? (
          <Card>
            {q.error instanceof ErreurApi && q.error.refus
              ? <EtatVide icone={ShieldAlert} titre="Accès refusé" texte="Le contrôle d'accès n'autorise pas la consultation de ces diplômes. Ce refus a été enregistré au journal d'audit." />
              : <EtatVide icone={RefreshCw} titre="Diplômes momentanément indisponibles" texte={`${q.error.message}. Réessayez dans un instant.`} action={<Button variante="secondaire" icone={RefreshCw} onClick={() => q.refetch()}>Réessayer</Button>} />}
          </Card>
        ) : !d || d.certificats.length === 0 ? (
          <Card><EtatVide icone={Award} titre="Aucun diplôme pour l'instant" texte="Vos diplômes apparaîtront ici automatiquement après délibération du jury, sans aucune démarche." /></Card>
        ) : (
          <Cascade data-guide="preuves-liste" className="space-y-5">
            {d.certificats.map((c) => (
              <Element key={c.id} className="space-y-2.5">
                <CartePreuve certificat={c} titulaire={nomComplet(d.apprenant)} />
                {c.revoque ? <Badge ton="critique">Diplôme révoqué : il ne doit plus être présenté</Badge> : <Actions c={c} onAgrandir={() => setAgrandi(c)} />}
              </Element>
            ))}
          </Cascade>
        )}

        <Card className="flex items-start gap-3">
          <ShieldCheck size={20} className="mt-0.5 shrink-0" style={{ color: "var(--acc)" }} aria-hidden />
          <p className="text-[13.5px] text-ink-2">Le QR code ne contient aucune donnée personnelle en clair : seulement l&apos;identifiant du diplôme et son empreinte. Toute modification du document (mention, note, nom) est détectée à la vérification.</p>
        </Card>
      </div>
      <QrPleinEcran certificat={agrandi} titulaire={d ? nomComplet(d.apprenant) : ""} onFermer={() => setAgrandi(null)} />
    </EntreePage>
  );
}

function Actions({ c, onAgrandir }: { c: Certificat; onAgrandir: () => void }) {
  const origine = useOrigine();
  const [copie, setCopie] = useState(false);
  const lien = `${origine}${cheminVerification(c)}`;
  const partageable = useSyncExternalStore(() => () => {}, () => "share" in navigator, () => false);

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(lien);
      setCopie(true);
      notifier({ ton: "succes", titre: "Lien copié", texte: "Collez-le dans un message ou un courriel : le destinataire vérifie sans compte." });
      setTimeout(() => setCopie(false), 2000);
    } catch {
      notifier({ ton: "avertissement", titre: "Copie impossible", texte: "Sélectionnez et copiez le lien manuellement." });
    }
  };
  const partager = async () => {
    try { await navigator.share({ title: `${NOM_EXAMEN[c.examen] ?? c.examen} — vérification`, text: "Vérifiez l'authenticité de mon diplôme sur le service public BEILE :", url: lien }); } catch { /* partage annulé */ }
  };

  return (
    <div data-guide="preuves-actions" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      {partageable && <Button variante="primaire" icone={Share2} onClick={partager} className="col-span-2 sm:col-span-1">Partager</Button>}
      <Button variante="secondaire" icone={copie ? Check : Copy} onClick={copier}>{copie ? "Copié" : "Copier le lien"}</Button>
      <Button variante="secondaire" icone={Maximize2} onClick={onAgrandir}>QR en grand</Button>
    </div>
  );
}

/** QR plein écran pour le présenter au guichet : feuille basse sur téléphone, centrée à partir de sm. */
function QrPleinEcran({ certificat, titulaire, onFermer }: { certificat: Certificat | null; titulaire: string; onFermer: () => void }) {
  const origine = useOrigine();
  useEffect(() => {
    if (!certificat) return;
    const echap = (e: KeyboardEvent) => { if (e.key === "Escape") onFermer(); };
    document.addEventListener("keydown", echap);
    return () => document.removeEventListener("keydown", echap);
  }, [certificat, onFermer]);
  return (
    <AnimatePresence>
      {certificat && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-deep/40 backdrop-blur-sm sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onFermer}>
          <motion.div role="dialog" aria-modal="true" aria-label="QR code de vérification" onClick={(e) => e.stopPropagation()}
            initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ type: "spring", stiffness: 360, damping: 30 }}
            className="w-full rounded-t-2xl border border-line bg-surface shadow-pop sm:max-w-lg sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-ink">{NOM_EXAMEN[certificat.examen] ?? certificat.examen}</p>
                <p className="mt-0.5 text-[13px] text-ink-muted">{titulaire} · session {certificat.session} · {certificat.mention} ({nombre(certificat.moyenne, 2)}/20)</p>
              </div>
              <button onClick={onFermer} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2" aria-label="Fermer"><X size={18} aria-hidden /></button>
            </div>
            <div className="flex flex-col items-center gap-3 px-5 py-6">
              <motion.div initial={{ scale: 0.85, rotate: -2 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 300, damping: 22, delay: 0.08 }} className="rounded-xl bg-white p-4 ring-1 ring-line">
                {origine && <QRCodeSVG value={`${origine}${cheminVerification(certificat)}`} size={240} level="M" className="h-auto w-[min(240px,70vw)]" aria-label="QR code de vérification" />}
              </motion.div>
              <p className="font-mono text-xs text-ink-muted">{certificat.id}</p>
              <p className="max-w-xs text-center text-[13px] text-ink-2">Faites scanner ce code avec l&apos;appareil photo d&apos;un téléphone : la vérification s&apos;ouvre sur le service public, sans compte.</p>
            </div>
            <div className="flex justify-end gap-3 border-t border-line px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
              <Button variante="secondaire" onClick={onFermer}>Fermer</Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
