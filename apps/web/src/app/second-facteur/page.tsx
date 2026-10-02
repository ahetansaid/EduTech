"use client";

import { Fingerprint, KeyRound, LogOut, ShieldCheck, Smartphone, TriangleAlert } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useQueryClient } from "@tanstack/react-query";
import { GardeSession } from "@/components/shell/GardeSession";
import { AnimatePresence, EASE, motion } from "@/components/motion";
import { CodesSecours } from "@/components/securite/CodesSecours";
import { BandeNationale, Button, Logo } from "@/components/ui/primitives";
import { enregistrerCle, presenterCle, useEtatMfa } from "@/lib/api/securite";
import { cn } from "@/lib/cn";
import { retourSur } from "@/lib/retour";
import { ErreurApi, ecrire } from "@/lib/http";
import { accueilDeSession, CLE_SESSION, useDeconnexion, useSession } from "@/lib/session";

/**
 * Second facteur des administrateurs de niveau 0 à 2 : présentation après le mot de passe, ou premier
 * enregistrement (application d'authentification TOTP, ou clé de sécurité FIDO2), suivi des codes de secours.
 */
export default function PageSecondFacteur() {
  return <Suspense><GardeSession><SecondFacteur /></GardeSession></Suspense>;
}

function SecondFacteur() {
  const session = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const client = useQueryClient();
  const deconnexion = useDeconnexion();
  const etat = useEtatMfa();
  const [codes, setCodes] = useState<string[] | null>(null);
  const actif = session.compte.mfaActive ?? etat.data?.actif ?? false;
  const retour = params.get("retour");

  const terminer = async () => {
    await client.invalidateQueries({ queryKey: CLE_SESSION });
    const s = await client.fetchQuery({ queryKey: CLE_SESSION }) as typeof session | null;
    router.replace(retourSur(retour) ?? (s ? accueilDeSession(s) : "/"));
  };

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <BandeNationale className="h-[4px]" />
      <div className="flex items-center justify-between px-6 py-5">
        <Logo />
        <button type="button" onClick={() => deconnexion.mutate()} className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium text-ink-2 hover:bg-surface-2"><LogOut size={15} aria-hidden /> Se déconnecter</button>
      </div>
      <div className="flex flex-1 items-start justify-center px-6 pb-16 pt-6 sm:items-center">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="w-full max-w-[460px] rounded-xl border border-line/70 bg-surface p-7 shadow-float">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-soft text-accent-ink"><ShieldCheck size={20} aria-hidden /></span>
          {codes ? (
            <div className="mt-4"><CodesSecours codes={codes} onTermine={terminer} /></div>
          ) : actif ? (
            <Presenter onReussi={terminer} cles={(etat.data?.cles.length ?? 0) > 0} />
          ) : (
            <Enroler nom={session.profil.nomAffiche} onCodes={setCodes} />
          )}
        </motion.div>
      </div>
    </div>
  );
}

function Presenter({ onReussi, cles }: { onReussi: () => void; cles: boolean }) {
  const [code, setCode] = useState("");
  const [secours, setSecours] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const valide = secours ? code.replace(/[\s-]/g, "").length === 10 : /^\d{6}$/.test(code);

  const soumettre = async (e: FormEvent) => {
    e.preventDefault();
    setEnvoi(true); setErreur(null);
    try { await ecrire("/auth/mfa/verifier", { code }); onReussi(); }
    catch (x) { setErreur(x instanceof ErreurApi ? (x.statut === 422 ? "Code incorrect ou déjà utilisé." : x.message) : "Vérification impossible."); setEnvoi(false); setCode(""); }
  };
  const parCle = async () => {
    setEnvoi(true); setErreur(null);
    try { await presenterCle(false); onReussi(); } catch (x) { setErreur(x instanceof ErreurApi ? x.message : "Clé non reconnue ou opération annulée."); setEnvoi(false); }
  };

  return (
    <>
      <h1 className="mt-4 font-display text-[24px] font-bold text-ink">Second facteur</h1>
      <p className="mt-1.5 text-[14px] text-ink-2">Votre fonction d'administration exige une seconde preuve d'identité à chaque connexion.</p>
      <form method="post" onSubmit={soumettre} className="mt-6 space-y-4">
        <label className="block text-[13px] font-medium text-ink-2">
          {secours ? "Code de secours (10 caractères)" : "Code de votre application d'authentification"}
          <input autoFocus value={code} inputMode={secours ? undefined : "numeric"} autoComplete="one-time-code"
            onChange={(e) => setCode(secours ? e.target.value.slice(0, 11) : e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="mt-1.5 h-12 w-full rounded-md border border-line bg-surface px-3 text-center font-mono text-[20px] tracking-[0.3em] text-ink outline-none focus:border-blue focus:ring-4 focus:ring-blue/15" />
        </label>
        {erreur && <p role="alert" className="flex items-start gap-2 rounded-md bg-critical-bg px-3.5 py-2.5 text-[13px] text-critical"><TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden /> {erreur}</p>}
        <Button type="submit" className="h-12 w-full" chargement={envoi} disabled={!valide}>Vérifier</Button>
        {cles && <Button type="button" variante="secondaire" icone={Fingerprint} className="w-full" onClick={parCle} disabled={envoi}>Utiliser ma clé de sécurité</Button>}
        <button type="button" onClick={() => { setSecours((v) => !v); setCode(""); setErreur(null); }} className="w-full text-center text-[13px] font-medium text-blue hover:underline">
          {secours ? "Utiliser mon application" : "Téléphone perdu ? Utiliser un code de secours"}
        </button>
      </form>
    </>
  );
}

function Enroler({ nom, onCodes }: { nom: string; onCodes: (c: string[]) => void }) {
  const [mode, setMode] = useState<"choix" | "application" | "cle">("choix");
  const [totp, setTotp] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [nomCle, setNomCle] = useState("Clé de sécurité");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const commencerApplication = async () => {
    setEnvoi(true); setErreur(null);
    try { setTotp(await ecrire<{ secret: string; uri: string }>("/auth/mfa/totp/debut")); setMode("application"); } catch (x) { setErreur((x as Error).message); } finally { setEnvoi(false); }
  };
  const confirmerApplication = async (e: FormEvent) => {
    e.preventDefault();
    setEnvoi(true); setErreur(null);
    try { onCodes((await ecrire<{ codesSecours: string[] }>("/auth/mfa/totp/confirmer", { code })).codesSecours); }
    catch (x) { setErreur(x instanceof ErreurApi ? x.message : "Enregistrement impossible."); setEnvoi(false); setCode(""); }
  };
  const enregistrer = async () => {
    setEnvoi(true); setErreur(null);
    try { const r = await enregistrerCle(nomCle.trim() || "Clé de sécurité"); onCodes(r.codesSecours ?? []); }
    catch (x) { setErreur(x instanceof ErreurApi ? x.message : "Clé non enregistrée (opération annulée ou non prise en charge par cet appareil)."); setEnvoi(false); }
  };

  return (
    <>
      <h1 className="mt-4 font-display text-[24px] font-bold text-ink">Protégez votre compte</h1>
      <p className="mt-1.5 text-[14px] text-ink-2">Bonjour {nom.split(" ")[0]}. Votre fonction d'administration exige un second facteur : enregistrez-en un pour continuer.</p>
      <AnimatePresence mode="wait">
        {mode === "choix" && (
          <motion.div key="choix" exit={{ opacity: 0 }} className="mt-6 grid gap-3">
            <Choix icone={Smartphone} titre="Application d'authentification" texte="Google Authenticator, Microsoft Authenticator, FreeOTP… Un code change toutes les 30 secondes." onClick={commencerApplication} desactive={envoi} />
            <Choix icone={KeyRound} titre="Clé de sécurité" texte="Clé USB/NFC FIDO2, empreinte digitale ou Windows Hello. La protection la plus forte." onClick={() => setMode("cle")} desactive={envoi} />
          </motion.div>
        )}
        {mode === "application" && totp && (
          <motion.form key="app" method="post" onSubmit={confirmerApplication} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="mt-6 space-y-4">
            <ol className="space-y-1 text-[13.5px] text-ink-2"><li>1. Scannez ce code avec votre application.</li><li>2. Saisissez le code à 6 chiffres qu'elle affiche.</li></ol>
            <div className="flex justify-center rounded-lg bg-white p-4"><QRCodeSVG value={totp.uri} size={176} level="M" /></div>
            <details className="text-[12.5px] text-ink-muted"><summary className="cursor-pointer">Saisie manuelle de la clé</summary><p className="mt-2 break-all font-mono text-[13px] text-ink">{totp.secret.match(/.{1,4}/g)?.join(" ")}</p></details>
            <input autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" aria-label="Code à 6 chiffres"
              className="h-12 w-full rounded-md border border-line bg-surface px-3 text-center font-mono text-[20px] tracking-[0.3em] text-ink outline-none focus:border-blue focus:ring-4 focus:ring-blue/15" placeholder="••••••" />
            {erreur && <p role="alert" className="rounded-md bg-critical-bg px-3.5 py-2.5 text-[13px] text-critical">{erreur}</p>}
            <Button type="submit" className="h-12 w-full" chargement={envoi} disabled={!/^\d{6}$/.test(code)}>Activer</Button>
            <button type="button" onClick={() => setMode("choix")} className="w-full text-center text-[13px] font-medium text-blue hover:underline">Choisir une autre méthode</button>
          </motion.form>
        )}
        {mode === "cle" && (
          <motion.div key="cle" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="mt-6 space-y-4">
            <label className="block text-[13px] font-medium text-ink-2">Nom de la clé
              <input value={nomCle} onChange={(e) => setNomCle(e.target.value.slice(0, 40))} className="mt-1.5 h-11 w-full rounded-md border border-line bg-surface px-3 text-[15px] text-ink outline-none focus:border-blue focus:ring-4 focus:ring-blue/15" />
            </label>
            {erreur && <p role="alert" className="rounded-md bg-critical-bg px-3.5 py-2.5 text-[13px] text-critical">{erreur}</p>}
            <Button className="h-12 w-full" icone={Fingerprint} chargement={envoi} onClick={enregistrer}>Enregistrer ma clé</Button>
            <button type="button" onClick={() => setMode("choix")} className="w-full text-center text-[13px] font-medium text-blue hover:underline">Choisir une autre méthode</button>
          </motion.div>
        )}
      </AnimatePresence>
      {mode === "choix" && erreur && <p role="alert" className="mt-4 rounded-md bg-critical-bg px-3.5 py-2.5 text-[13px] text-critical">{erreur}</p>}
    </>
  );
}

function Choix({ icone: Icone, titre, texte, onClick, desactive }: { icone: typeof KeyRound; titre: string; texte: string; onClick: () => void; desactive: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={desactive} className={cn("flex items-start gap-3 rounded-lg border border-line p-4 text-left transition hover:border-blue hover:bg-blue-soft/40 disabled:opacity-60")}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-accent-ink"><Icone size={19} aria-hidden /></span>
      <span><span className="block font-semibold text-ink">{titre}</span><span className="mt-0.5 block text-[13px] text-ink-2">{texte}</span></span>
    </button>
  );
}
