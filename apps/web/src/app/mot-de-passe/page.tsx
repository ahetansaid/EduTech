"use client";

import { ArrowLeft, Check, Eye, EyeOff, KeyRound, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { GardeSession } from "@/components/shell/GardeSession";
import { AnimatePresence, EASE, motion } from "@/components/motion";
import { BandeNationale, Logo } from "@/components/ui/primitives";
import { notifier } from "@/components/ui/Notifications";
import { cn } from "@/lib/cn";
import { ErreurApi, ecrire } from "@/lib/http";
import { accueilPour, CLE_SESSION, useSession } from "@/lib/session";

const REGLES = [
  { id: "longueur", libelle: "12 caractères au moins", test: (v: string) => v.length >= 12 },
  { id: "minuscule", libelle: "Une minuscule", test: (v: string) => /[a-z]/.test(v) },
  { id: "majuscule", libelle: "Une majuscule", test: (v: string) => /[A-Z]/.test(v) },
  { id: "chiffre", libelle: "Un chiffre", test: (v: string) => /\d/.test(v) },
];

export default function PageMotDePasse() {
  return <Suspense><GardeSession><ChangerMotDePasse /></GardeSession></Suspense>;
}

function ChangerMotDePasse() {
  const { profil, compte } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const client = useQueryClient();
  const impose = compte.doitChangerMotDePasse;
  const [actuel, setActuel] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const respectees = REGLES.filter((r) => r.test(nouveau)).length;
  const conforme = respectees === REGLES.length && nouveau === confirmation && nouveau !== actuel;
  const accueil = accueilPour(profil.habilitations.map((h) => h.role));
  const retour = params.get("retour");

  const soumettre = async (e: FormEvent) => {
    e.preventDefault();
    if (!conforme) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await ecrire("/auth/mot-de-passe", { actuel, nouveau });
      client.setQueryData(CLE_SESSION, { profil, compte: { ...compte, doitChangerMotDePasse: false } });
      notifier({ ton: "succes", titre: "Mot de passe modifié", texte: "Vos autres sessions ont été fermées." });
      router.replace(retour && retour.startsWith("/") && !retour.startsWith("//") ? retour : accueil);
    } catch (x) {
      setErreur(x instanceof ErreurApi && x.statut === 401 ? "Le mot de passe actuel est incorrect." : (x as Error).message);
      setEnvoi(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <BandeNationale className="h-[4px]" />
      <div className="flex items-center justify-between px-6 py-5">
        <Logo />
        {!impose && <Link href={accueil} className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium text-ink-2 hover:bg-surface-2"><ArrowLeft size={15} aria-hidden /> Retour à mon espace</Link>}
      </div>
      <div className="flex flex-1 items-start justify-center px-6 pb-16 pt-6 sm:items-center">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="w-full max-w-[440px] rounded-xl border border-line/70 bg-surface p-7 shadow-float">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-soft text-accent-ink"><KeyRound size={20} aria-hidden /></span>
          <h1 className="mt-4 font-display text-[24px] font-bold text-ink">{impose ? "Choisissez votre mot de passe" : "Changer mon mot de passe"}</h1>
          <p className="mt-1.5 text-[14px] text-ink-2">
            {impose ? `Bienvenue ${profil.nomAffiche.split(" ")[0]}. Le mot de passe qui vous a été remis est temporaire : remplacez-le par un mot de passe personnel.` : "Toutes vos autres sessions seront fermées après le changement."}
          </p>

          <form onSubmit={soumettre} className="mt-6 space-y-4">
            <ChampMdp id="actuel" libelle={impose ? "Mot de passe temporaire" : "Mot de passe actuel"} valeur={actuel} onChange={setActuel} visible={visible} autoComplete="current-password" />
            <ChampMdp id="nouveau" libelle="Nouveau mot de passe" valeur={nouveau} onChange={setNouveau} visible={visible} autoComplete="new-password" />

            <div>
              <div className="flex h-1.5 gap-1" aria-hidden>
                {REGLES.map((_, i) => (
                  <span key={i} className={cn("flex-1 rounded-full transition-colors duration-300", i < respectees ? (respectees === 4 ? "bg-success" : "bg-warning") : "bg-surface-2")} />
                ))}
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-1.5">
                {REGLES.map((r) => {
                  const ok = r.test(nouveau);
                  return (
                    <li key={r.id} className={cn("flex items-center gap-1.5 text-[12.5px] transition-colors", ok ? "text-success" : "text-ink-muted")}>
                      <motion.span animate={{ scale: ok ? [1, 1.3, 1] : 1 }} className={cn("flex h-4 w-4 items-center justify-center rounded-full", ok ? "bg-success text-white" : "bg-surface-2")}>
                        {ok && <Check size={11} strokeWidth={3} aria-hidden />}
                      </motion.span>
                      {r.libelle}
                    </li>
                  );
                })}
              </ul>
            </div>

            <ChampMdp id="confirmation" libelle="Confirmer le nouveau mot de passe" valeur={confirmation} onChange={setConfirmation} visible={visible} autoComplete="new-password" />
            {confirmation && nouveau !== confirmation && <p className="text-[12.5px] text-critical">Les deux saisies ne correspondent pas.</p>}
            {nouveau && actuel && nouveau === actuel && <p className="text-[12.5px] text-critical">Le nouveau mot de passe doit être différent de l'actuel.</p>}

            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="h-4 w-4 rounded border-line" />
              {visible ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />} Afficher les mots de passe
            </label>

            <AnimatePresence>
              {erreur && (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-start gap-2 rounded-md bg-critical-bg px-3.5 py-2.5 text-[13px] text-critical" role="alert">
                  <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden /> {erreur}
                </motion.p>
              )}
            </AnimatePresence>

            <button type="submit" disabled={!conforme || envoi} className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-navy text-[15px] font-semibold text-white transition hover:bg-navy-deep disabled:opacity-50">
              {envoi ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : "Enregistrer le mot de passe"}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}

function ChampMdp({ id, libelle, valeur, onChange, visible, autoComplete }: { id: string; libelle: string; valeur: string; onChange: (v: string) => void; visible: boolean; autoComplete: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-ink-2">{libelle}</label>
      <input id={id} type={visible ? "text" : "password"} autoComplete={autoComplete} value={valeur} onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-md border border-line bg-surface px-3 text-[15px] text-ink outline-none transition focus:border-blue focus:ring-4 focus:ring-blue/15" />
    </div>
  );
}
