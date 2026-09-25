"use client";

import { ArrowRight, BadgeCheck, Eye, EyeOff, Fingerprint, Lock, LockKeyhole, ShieldCheck, TriangleAlert, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, EASE, motion } from "@/components/motion";
import { BandeNationale, Logo } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { ErreurApi, requete } from "@/lib/http";
import { accueilPour, CLE_SESSION, useSessionServeur, type Session } from "@/lib/session";
import { useThemeEspace } from "@/lib/useSombre";

const ENONCES = [
  { icone: Fingerprint, titre: "Identité ancrée au registre national", texte: "Chaque apprenant est rattaché à son NPI. Aucun identifiant maison." },
  { icone: LockKeyhole, titre: "Chaque accès est décidé et journalisé", texte: "Rôle, périmètre, relation, finalité : quatre critères, refus compris." },
  { icone: ShieldCheck, titre: "Un fait saisi une fois", texte: "Une absence devient notification, suivi, indicateur et carte — sans ressaisie." },
];

const MESSAGES_MOTIF: Record<string, { ton: "info" | "avertissement"; texte: string }> = {
  session: { ton: "avertissement", texte: "Votre session a expiré ou a été révoquée. Reconnectez-vous pour continuer." },
  deconnexion: { ton: "info", texte: "Vous êtes déconnecté. Votre session a été révoquée sur le serveur." },
  "mot-de-passe": { ton: "info", texte: "Mot de passe modifié. Vos autres sessions ont été fermées." },
};

export default function PageConnexion() {
  return <Suspense><Connexion /></Suspense>;
}

function Connexion() {
  useThemeEspace(false);
  const router = useRouter();
  const params = useSearchParams();
  const client = useQueryClient();
  const retour = params.get("retour");
  const motif = params.get("motif");
  const { data: sessionExistante } = useSessionServeur();

  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [visible, setVisible] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<{ texte: string; verrou?: boolean } | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enonce, setEnonce] = useState(0);

  const destination = (s: Session) => {
    const sur = retour && retour.startsWith("/") && !retour.startsWith("//") && !retour.startsWith("/connexion") ? retour : null;
    return s.compte.doitChangerMotDePasse ? `/mot-de-passe${sur ? `?retour=${encodeURIComponent(sur)}` : ""}` : sur ?? accueilPour(s.profil.habilitations.map((h) => h.role));
  };

  // Déjà connecté : on ouvre directement l'espace.
  useEffect(() => {
    if (sessionExistante && !succes && motif !== "deconnexion") router.replace(destination(sessionExistante));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionExistante]);

  useEffect(() => {
    const t = setInterval(() => setEnonce((i) => (i + 1) % ENONCES.length), 5200);
    return () => clearInterval(t);
  }, []);

  const soumettre = async (e: FormEvent) => {
    e.preventDefault();
    if (!identifiant.trim() || !motDePasse) { setErreur({ texte: "Renseignez votre identifiant et votre mot de passe." }); return; }
    setEnvoi(true);
    setErreur(null);
    try {
      const s = await requete<Session>("POST", "/auth/connexion", { identifiant: identifiant.trim().toLowerCase(), motDePasse }, { silencieux401: true });
      client.setQueryData(CLE_SESSION, s);
      setSucces(s.profil.nomAffiche);
      setTimeout(() => router.replace(destination(s)), 650);
    } catch (x) {
      const statut = x instanceof ErreurApi ? x.statut : 0;
      setErreur(
        statut === 401 ? { texte: "Identifiant ou mot de passe incorrect." }
        : statut === 423 ? { texte: (x as Error).message, verrou: true }
        : statut === 429 ? { texte: "Trop de tentatives depuis ce réseau. Patientez une minute avant de réessayer." }
        : statut === 0 ? { texte: "Service injoignable. Vérifiez votre connexion internet." }
        : { texte: "Connexion impossible pour le moment. Réessayez dans quelques instants." },
      );
      setMotDePasse("");
      setEnvoi(false);
    }
  };

  const m = motif ? MESSAGES_MOTIF[motif] : null;
  const E = ENONCES[enonce]!;

  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-[1.08fr_1fr]">
      {/* Volet visuel */}
      <aside className="relative hidden overflow-hidden lg:block">
        <motion.div className="absolute inset-0" initial={{ scale: 1.08 }} animate={{ scale: 1 }} transition={{ duration: 2.4, ease: EASE }}>
          <Image src="/images/accueil-eleves-secondaire.jpg" alt="" fill priority sizes="55vw" className="object-cover object-[center_35%]" />
        </motion.div>
        <div className="absolute inset-0 bg-[linear-gradient(160deg,rgb(7_39_71/0.92)_0%,rgb(10_55_100/0.78)_55%,rgb(14_98_88/0.55)_100%)]" aria-hidden />
        <div className="relative flex h-full flex-col justify-between p-10 text-white xl:p-14">
          <Link href="/" className="w-fit rounded-lg bg-white/95 px-3 py-2 shadow-float"><Logo /></Link>
          <div className="max-w-lg">
            <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6, ease: EASE }} className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
              République du Bénin · Plateforme nationale
            </motion.p>
            <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.7, ease: EASE }} className="mt-4 text-[40px] font-extrabold leading-[1.08] xl:text-[46px]">
              Chaque parcours suivi.<br />Chaque décision éclairée.
            </motion.h1>
            <div className="relative mt-10 h-28">
              <AnimatePresence mode="wait">
                <motion.div key={enonce} initial={{ opacity: 0, y: 14, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -10, filter: "blur(6px)" }} transition={{ duration: 0.5, ease: EASE }} className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/12 ring-1 ring-white/25 backdrop-blur"><E.icone size={20} aria-hidden /></span>
                  <div>
                    <p className="font-display text-[17px] font-bold">{E.titre}</p>
                    <p className="mt-1 text-[14.5px] leading-relaxed text-white/80">{E.texte}</p>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="flex gap-1.5" aria-hidden>
              {ENONCES.map((_, i) => <motion.span key={i} className="h-1 rounded-full bg-white" animate={{ width: i === enonce ? 28 : 8, opacity: i === enonce ? 1 : 0.4 }} transition={{ duration: 0.4 }} />)}
            </div>
          </div>
          <p className="text-[12px] text-white/60">Accès réservé aux personnes habilitées · Chaque connexion est journalisée</p>
        </div>
        <BandeNationale className="absolute inset-x-0 bottom-0 h-[5px]" />
      </aside>

      {/* Formulaire */}
      <main className="relative flex flex-col">
        <BandeNationale className="h-[4px] lg:hidden" />
        <div className="flex items-center justify-between px-6 pt-6 lg:justify-end">
          <Link href="/" className="lg:hidden"><Logo /></Link>
          <Link href="/verifier" className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium text-ink-2 hover:bg-surface-2">
            <BadgeCheck size={15} aria-hidden /> Vérifier un diplôme
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: EASE }} className="w-full max-w-[400px]">
            <AnimatePresence mode="wait">
              {succes ? (
                <motion.div key="ok" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-10 text-center">
                  <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 320, damping: 18 }} className="flex h-16 w-16 items-center justify-center rounded-full bg-success-bg text-success">
                    <ShieldCheck size={30} aria-hidden />
                  </motion.span>
                  <p className="mt-5 font-display text-[22px] font-bold text-ink">Bienvenue, {succes.split(" ")[0]}</p>
                  <p className="mt-1 text-sm text-ink-muted">Ouverture de votre espace…</p>
                </motion.div>
              ) : (
                <motion.div key="form" exit={{ opacity: 0, y: -10 }}>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-accent-ink">Espace sécurisé</p>
                  <h2 className="mt-2 font-display text-[30px] font-bold leading-tight text-ink">Connexion</h2>
                  <p className="mt-2 text-[15px] text-ink-2">Utilisez l'identifiant qui vous a été remis par votre administration.</p>

                  <AnimatePresence>
                    {m && !erreur && (
                      <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className={cn("mt-5 rounded-md px-3.5 py-2.5 text-[13px]", m.ton === "info" ? "bg-info-bg text-info" : "bg-warning-bg text-warning")}>
                        {m.texte}
                      </motion.p>
                    )}
                  </AnimatePresence>

                  <form onSubmit={soumettre} className="mt-7 space-y-4" noValidate>
                    <Champ id="identifiant" libelle="Identifiant" icone={UserRound}>
                      <input
                        id="identifiant" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus
                        value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} placeholder="prenom.nom"
                        className="h-12 w-full rounded-md border border-line bg-surface pl-10 pr-3 text-[15px] text-ink outline-none transition focus:border-blue focus:ring-4 focus:ring-blue/15"
                      />
                    </Champ>
                    <Champ id="mot-de-passe" libelle="Mot de passe" icone={Lock}>
                      <input
                        id="mot-de-passe" name="password" type={visible ? "text" : "password"} autoComplete="current-password"
                        value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)}
                        className="h-12 w-full rounded-md border border-line bg-surface pl-10 pr-11 text-[15px] text-ink outline-none transition focus:border-blue focus:ring-4 focus:ring-blue/15"
                      />
                      <button type="button" onClick={() => setVisible((v) => !v)} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink" aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}>
                        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </Champ>

                    <AnimatePresence>
                      {erreur && (
                        <motion.div
                          key={erreur.texte}
                          initial={{ opacity: 0, x: 0 }} animate={{ opacity: 1, x: [0, -8, 8, -5, 5, 0] }} exit={{ opacity: 0 }} transition={{ duration: 0.45 }}
                          className={cn("flex items-start gap-2.5 rounded-md px-3.5 py-2.5 text-[13px]", erreur.verrou ? "bg-warning-bg text-warning" : "bg-critical-bg text-critical")}
                          role="alert"
                        >
                          <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden /> {erreur.texte}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <motion.button
                      type="submit" disabled={envoi} whileTap={{ scale: 0.98 }}
                      className="group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-md bg-navy text-[15px] font-semibold text-white shadow-sm transition hover:bg-navy-deep disabled:opacity-70"
                    >
                      {envoi ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <>Se connecter <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" aria-hidden /></>}
                    </motion.button>
                  </form>

                  <div className="mt-8 rounded-lg border border-line/70 bg-surface-2/50 p-4 text-[12.5px] leading-relaxed text-ink-muted">
                    <p className="flex items-center gap-1.5 font-semibold text-ink-2"><ShieldCheck size={14} aria-hidden /> Protection du compte</p>
                    <p className="mt-1">Après 5 essais infructueux, le compte est verrouillé 15 minutes. Mot de passe oublié : adressez-vous à l'administrateur de la plateforme, qui vous remettra un mot de passe temporaire.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </main>
    </div>
  );
}

function Champ({ id, libelle, icone: Icone, children }: { id: string; libelle: string; icone: typeof Lock; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-ink-2">{libelle}</label>
      <div className="relative">
        <Icone size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
        {children}
      </div>
    </div>
  );
}
