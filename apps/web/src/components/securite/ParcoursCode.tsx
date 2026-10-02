"use client";

import { ArrowLeft, Check, KeyRound, MailCheck, MessageSquareText, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AnimatePresence, EASE, motion } from "@/components/motion";
import { BandeNationale, Logo } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { ErreurApi, requete } from "@/lib/http";
import { useCanaux } from "@/lib/api/securite";

/**
 * Activation d'un compte (premier accès) ou récupération (mot de passe oublié), sans administrateur :
 * un code à 6 chiffres est envoyé par SMS ou courriel à la coordonnée enregistrée, puis la personne
 * choisit son mot de passe. Les réponses ne disent jamais si un compte existe.
 */
const REGLES = [
  { libelle: "12 caractères au moins", test: (v: string) => v.length >= 12 },
  { libelle: "Une minuscule", test: (v: string) => /[a-z]/.test(v) },
  { libelle: "Une majuscule", test: (v: string) => /[A-Z]/.test(v) },
  { libelle: "Un chiffre", test: (v: string) => /\d/.test(v) },
];

export function ParcoursCode({ objet }: { objet: "activation" | "recuperation" }) {
  const router = useRouter();
  const canaux = useCanaux();
  const [etape, setEtape] = useState<"identifiant" | "code">("identifiant");
  const [identifiant, setIdentifiant] = useState("");
  const [canal, setCanal] = useState<"sms" | "courriel">("sms");
  const [code, setCode] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const ferme = canaux.data && !canaux.data.sms && !canaux.data.courriel;
  const conforme = REGLES.every((r) => r.test(nouveau)) && nouveau === confirmation && /^\d{6}$/.test(code);
  const titre = objet === "activation" ? "Activer mon compte" : "Mot de passe oublié";

  const demander = async (e?: FormEvent) => {
    e?.preventDefault();
    if (identifiant.trim().length < 3) return;
    setEnvoi(true); setErreur(null);
    try {
      const r = await requete<{ message: string }>("POST", "/auth/code/demande", { identifiant: identifiant.trim().toLowerCase(), objet, canal }, { silencieux401: true });
      setInfo(r.message);
      setEtape("code");
    } catch (x) {
      setErreur(x instanceof ErreurApi && x.statut === 429 ? "Trop de demandes depuis ce réseau : patientez quelques minutes." : (x as Error).message);
    } finally { setEnvoi(false); }
  };

  const confirmer = async (e: FormEvent) => {
    e.preventDefault();
    if (!conforme) return;
    setEnvoi(true); setErreur(null);
    try {
      await requete("POST", "/auth/code/confirmer", { identifiant: identifiant.trim().toLowerCase(), code, nouveau }, { silencieux401: true });
      router.replace(`/connexion?motif=${objet === "activation" ? "active" : "recupere"}`);
    } catch (x) {
      setErreur(x instanceof ErreurApi && x.statut === 422 ? "Code invalide ou expiré. Vérifiez-le, ou demandez-en un nouveau." : (x as Error).message);
      setEnvoi(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <BandeNationale className="h-[4px]" />
      <div className="flex items-center justify-between px-6 py-5">
        <Link href="/"><Logo /></Link>
        <Link href="/connexion" className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium text-ink-2 hover:bg-surface-2"><ArrowLeft size={15} aria-hidden /> Connexion</Link>
      </div>
      <div className="flex flex-1 items-start justify-center px-6 pb-16 pt-6 sm:items-center">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="w-full max-w-[440px] rounded-xl border border-line/70 bg-surface p-7 shadow-float">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-soft text-accent-ink"><KeyRound size={20} aria-hidden /></span>
          <h1 className="mt-4 font-display text-[24px] font-bold text-ink">{titre}</h1>
          <p className="mt-1.5 text-[14px] text-ink-2">
            {objet === "activation" ? "Recevez un code sur le téléphone ou l'adresse indiqués à l'ouverture de votre compte, puis choisissez votre mot de passe." : "Recevez un code sur votre téléphone ou votre adresse vérifiés, puis choisissez un nouveau mot de passe."}
          </p>

          {ferme ? (
            <p className="mt-6 flex items-start gap-2 rounded-md bg-warning-bg px-3.5 py-3 text-[13.5px] text-warning" role="status">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
              L'envoi de codes n'est pas encore ouvert sur la plateforme. Adressez-vous à l'administrateur de votre établissement ou de votre direction.
            </p>
          ) : (
            <AnimatePresence mode="wait">
              {etape === "identifiant" ? (
                <motion.form key="id" method="post" onSubmit={demander} exit={{ opacity: 0, x: -12 }} className="mt-6 space-y-4">
                  <Champ id="identifiant" libelle="Identifiant" valeur={identifiant} onChange={setIdentifiant} placeholder="prenom.nom" autoComplete="username" />
                  <fieldset>
                    <legend className="mb-1.5 text-[13px] font-medium text-ink-2">Recevoir le code par</legend>
                    <div className="grid grid-cols-2 gap-2">
                      {([["sms", "SMS", MessageSquareText], ["courriel", "Courriel", MailCheck]] as const).map(([v, l, I]) => (
                        <label key={v} className={cn("flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2.5 text-[14px] transition", canal === v ? "border-blue bg-blue-soft/60 text-ink" : "border-line text-ink-2 hover:bg-surface-2", canaux.data && !canaux.data[v] && "pointer-events-none opacity-40")}>
                          <input type="radio" name="canal" value={v} checked={canal === v} onChange={() => setCanal(v)} className="sr-only" disabled={!!canaux.data && !canaux.data[v]} />
                          <I size={16} aria-hidden /> {l}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <Erreur texte={erreur} />
                  <Envoyer envoi={envoi} desactive={identifiant.trim().length < 3}>Recevoir un code</Envoyer>
                </motion.form>
              ) : (
                <motion.form key="code" method="post" onSubmit={confirmer} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="mt-6 space-y-4">
                  {info && <p className="rounded-md bg-info-bg px-3.5 py-2.5 text-[13px] text-info" role="status">{info}</p>}
                  <Champ id="code" libelle="Code reçu (6 chiffres)" valeur={code} onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" autoComplete="one-time-code" inputMode="numeric" />
                  <Champ id="nouveau" libelle="Nouveau mot de passe" valeur={nouveau} onChange={setNouveau} type="password" autoComplete="new-password" />
                  <ul className="grid grid-cols-2 gap-1.5">
                    {REGLES.map((r) => (
                      <li key={r.libelle} className={cn("flex items-center gap-1.5 text-[12.5px]", r.test(nouveau) ? "text-success" : "text-ink-muted")}>
                        <span className={cn("flex h-4 w-4 items-center justify-center rounded-full", r.test(nouveau) ? "bg-success text-white" : "bg-surface-2")}>{r.test(nouveau) && <Check size={11} strokeWidth={3} aria-hidden />}</span>{r.libelle}
                      </li>
                    ))}
                  </ul>
                  <Champ id="confirmation" libelle="Confirmer le mot de passe" valeur={confirmation} onChange={setConfirmation} type="password" autoComplete="new-password" />
                  {confirmation && nouveau !== confirmation && <p className="text-[12.5px] text-critical">Les deux saisies ne correspondent pas.</p>}
                  <Erreur texte={erreur} />
                  <Envoyer envoi={envoi} desactive={!conforme}>{objet === "activation" ? "Activer mon compte" : "Enregistrer le mot de passe"}</Envoyer>
                  <button type="button" onClick={() => { setEtape("identifiant"); setCode(""); setErreur(null); }} className="w-full text-center text-[13px] font-medium text-blue hover:underline">Demander un nouveau code</button>
                </motion.form>
              )}
            </AnimatePresence>
          )}
          <p className="mt-6 text-[12px] leading-relaxed text-ink-muted">Aucun agent de la plateforme ne vous demandera jamais ce code. Il expire au bout de 10 minutes.</p>
        </motion.div>
      </div>
    </div>
  );
}

function Champ({ id, libelle, valeur, onChange, type = "text", ...reste }: { id: string; libelle: string; valeur: string; onChange: (v: string) => void; type?: string; placeholder?: string; autoComplete?: string; inputMode?: "numeric" }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-ink-2">{libelle}</label>
      <input id={id} type={type} value={valeur} onChange={(e) => onChange(e.target.value)} autoCapitalize="none" spellCheck={false} {...reste}
        className="h-11 w-full rounded-md border border-line bg-surface px-3 text-[15px] text-ink outline-none transition focus:border-blue focus:ring-4 focus:ring-blue/15" />
    </div>
  );
}

function Erreur({ texte }: { texte: string | null }) {
  if (!texte) return null;
  return <p className="flex items-start gap-2 rounded-md bg-critical-bg px-3.5 py-2.5 text-[13px] text-critical" role="alert"><TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden /> {texte}</p>;
}

function Envoyer({ envoi, desactive, children }: { envoi: boolean; desactive: boolean; children: React.ReactNode }) {
  return (
    <button type="submit" disabled={desactive || envoi} className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-navy text-[15px] font-semibold text-white transition hover:bg-navy-deep disabled:opacity-50">
      {envoi ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : children}
    </button>
  );
}
