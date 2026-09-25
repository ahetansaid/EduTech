"use client";

import { Camera, CircleCheckBig, Fingerprint, QrCode, ScanLine, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, Cascade, EASE, Element, EntreePage, motion } from "@/components/motion";
import { Button, Card } from "@/components/ui/primitives";
import { lireSaisieVerification } from "@/lib/api/parcours";
import { useThemeEspace } from "@/lib/useSombre";

/** Lecteur de QR natif du navigateur (Chrome Android, Edge…) ; absent ailleurs : l'appareil photo du téléphone suffit. */
interface Detecteur { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> }
type ConstructeurDetecteur = new (o: { formats: string[] }) => Detecteur;
const constructeurDetecteur = () => (window as unknown as { BarcodeDetector?: ConstructeurDetecteur }).BarcodeDetector;

const cible = (id: string, empreinte: string) => `/verifier/${encodeURIComponent(id)}${empreinte ? `?e=${empreinte}` : ""}`;

export default function Verifier() {
  const router = useRouter();
  const [saisie, setSaisie] = useState("");
  const [scan, setScan] = useState(false);
  useThemeEspace(false);
  const scanPossible = useSyncExternalStore(() => () => {}, () => !!constructeurDetecteur() && !!navigator.mediaDevices?.getUserMedia, () => false);
  const lu = lireSaisieVerification(saisie);
  const erreur = saisie.trim().length >= 6 && !lu;

  return (
    <EntreePage>
      <div className="space-y-6">
        <div className="text-center">
          <motion.span initial={{ scale: 0.6, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }}
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-navy text-white shadow-float dark:bg-blue dark:text-navy-deep">
            <ScanLine size={30} aria-hidden />
          </motion.span>
          <h1 className="mt-4 text-[26px] font-bold leading-tight text-ink sm:text-[30px]">Vérifier un diplôme</h1>
          <p className="mx-auto mt-2 max-w-lg text-[15px] text-ink-2">Scannez le QR code du document ou saisissez son identifiant. La vérification est immédiate, gratuite et ne demande aucun compte.</p>
        </div>

        <Card className="space-y-4">
          <form onSubmit={(e) => { e.preventDefault(); if (lu) router.push(cible(lu.id, lu.empreinte)); }} className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Identifiant du diplôme ou lien de vérification</span>
              <span className="relative block">
                <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
                <input value={saisie} onChange={(e) => setSaisie(e.target.value.slice(0, 300))} placeholder="CERT-CEP-2024-000001" autoComplete="off" autoCapitalize="characters" spellCheck={false} inputMode="text"
                  aria-invalid={erreur} aria-describedby="aide-saisie"
                  className="h-12 w-full rounded-md border border-line bg-surface pl-10 pr-3.5 font-mono text-[15px] text-ink outline-none focus:border-blue focus:ring-4 focus:ring-blue/15" />
              </span>
              <span id="aide-saisie" className={erreur ? "mt-1 block text-xs text-critical" : "mt-1 block text-xs text-ink-muted"}>
                {erreur ? "Format attendu : CERT-EXAMEN-ANNÉE-NUMÉRO (ex. CERT-BEPC-2025-000123)" : lu?.empreinte ? "Lien complet reconnu : l'intégrité du document sera aussi contrôlée." : "Le lien complet (issu du QR code) permet aussi de contrôler l'intégrité du document."}
              </span>
            </label>
            <div className="grid gap-2 sm:flex sm:justify-end">
              {scanPossible && <Button type="button" variante="secondaire" taille="lg" icone={Camera} onClick={() => setScan(true)}>Scanner le QR code</Button>}
              <Button type="submit" taille="lg" icone={CircleCheckBig} disabled={!lu}>Vérifier</Button>
            </div>
          </form>
          {!scanPossible && (
            <p className="flex items-start gap-2 rounded-md bg-surface-2 px-3 py-2.5 text-[13px] text-ink-2"><QrCode size={16} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden /> Sur téléphone, ouvrez simplement l&apos;appareil photo et visez le QR code : la vérification s&apos;ouvre directement ici.</p>
          )}
        </Card>

        <Cascade className="grid gap-3 sm:grid-cols-3">
          {[
            { icone: QrCode, titre: "1. Présentez", texte: "Le QR code porte l'identifiant du diplôme et une empreinte, rien d'autre." },
            { icone: Fingerprint, titre: "2. Contrôle", texte: "Le registre national compare l'empreinte à celle du diplôme délivré." },
            { icone: CircleCheckBig, titre: "3. Verdict", texte: "Authentique, altéré, révoqué ou introuvable — en une seconde." },
          ].map((e) => (
            <Element key={e.titre}>
              <div className="rounded-lg border border-line/70 bg-surface p-4 shadow-soft">
                <e.icone size={18} className="text-accent-ink" aria-hidden />
                <p className="mt-2 text-sm font-semibold text-ink">{e.titre}</p>
                <p className="mt-0.5 text-[13px] text-ink-2">{e.texte}</p>
              </div>
            </Element>
          ))}
        </Cascade>
      </div>
      <AnimatePresence>{scan && <Scanner onFermer={() => setScan(false)} onLu={(id, e) => { setScan(false); router.push(cible(id, e)); }} />}</AnimatePresence>
    </EntreePage>
  );
}

/** Lecture du QR par la caméra arrière (feuille basse sur téléphone). Aucune image n'est conservée ni envoyée. */
function Scanner({ onFermer, onLu }: { onFermer: () => void; onLu: (id: string, empreinte: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [message, setMessage] = useState("Visez le QR code du diplôme");
  const rappel = useRef(onLu);
  const fermer = useRef(onFermer);
  useEffect(() => { rappel.current = onLu; fermer.current = onFermer; }, [onLu, onFermer]);

  useEffect(() => {
    const Detecteur = constructeurDetecteur();
    if (!Detecteur) return;
    const detecteur = new Detecteur({ formats: ["qr_code"] });
    let flux: MediaStream | null = null;
    let actif = true;
    let minuterie: ReturnType<typeof setTimeout> | undefined;
    const boucle = async () => {
      if (!actif || !video.current) return;
      try {
        const codes = video.current.readyState >= 2 ? await detecteur.detect(video.current) : [];
        const lu = codes.map((c) => lireSaisieVerification(c.rawValue)).find(Boolean);
        if (lu && actif) { actif = false; rappel.current(lu.id, lu.empreinte); return; }
        if (codes.length && actif) setMessage("Ce QR code n'est pas un diplôme BEILE");
      } catch { /* image non exploitable : on continue */ }
      minuterie = setTimeout(boucle, 250);
    };
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((f) => {
        flux = f;
        if (!actif) { f.getTracks().forEach((t) => t.stop()); return; }
        if (video.current) { video.current.srcObject = f; void video.current.play(); }
        void boucle();
      })
      .catch(() => setMessage("Caméra inaccessible : autorisez-la, ou saisissez l'identifiant."));
    const echap = (e: KeyboardEvent) => { if (e.key === "Escape") fermer.current(); };
    document.addEventListener("keydown", echap);
    return () => {
      actif = false;
      clearTimeout(minuterie);
      flux?.getTracks().forEach((t) => t.stop());
      document.removeEventListener("keydown", echap);
    };
  }, []);

  return (
    <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-deep/40 backdrop-blur-sm sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onFermer}>
      <motion.div role="dialog" aria-modal="true" aria-label="Scanner un QR code" onClick={(e) => e.stopPropagation()}
        initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ type: "spring", stiffness: 360, damping: 30 }}
        className="w-full overflow-hidden rounded-t-2xl border border-line bg-surface shadow-pop sm:max-w-lg sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <p className="text-[15px] font-semibold text-ink">Scanner le QR code</p>
          <button onClick={onFermer} className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2" aria-label="Fermer"><X size={18} aria-hidden /></button>
        </div>
        <div className="relative aspect-square w-full bg-navy-deep sm:aspect-[4/3]">
          <video ref={video} className="h-full w-full object-cover" playsInline muted />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
            <div className="relative h-3/5 w-3/5 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
              <motion.span className="absolute inset-x-3 h-0.5 rounded-full bg-flag-green shadow-[0_0_12px_2px] shadow-flag-green/60" animate={{ top: ["8%", "92%", "8%"] }} transition={{ duration: 2.4, repeat: Infinity, ease: EASE }} />
            </div>
          </div>
        </div>
        <p className="px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] text-center text-[13px] text-ink-2" aria-live="polite">{message}</p>
      </motion.div>
    </motion.div>
  );
}
