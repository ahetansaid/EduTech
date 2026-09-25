"use client";

import { AlertTriangle, Copy, Eye, EyeOff, KeyRound, Lock, MonitorSmartphone, Power, PowerOff, RefreshCw, Search, ShieldCheck, ShieldX, UserCheck, Users, X } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, Cascade, Compteur, EASE, Element, EntreePage, motion } from "@/components/motion";
import { TuileIndicateur } from "@/components/ui/donnees";
import { notifier } from "@/components/ui/Notifications";
import { Badge, Button, Card, EtatVide, PageHeader, Segmente, Squelette, type Ton } from "@/components/ui/primitives";
import { useActivationMutation, useComptes, useReinitialiserMutation, type CompteAdmin } from "@/lib/api/gouvernance";
import { cn } from "@/lib/cn";
import { entier } from "@/lib/format";
import { ErreurApi } from "@/lib/http";
import { useSession } from "@/lib/session";

/* ------------------------------------------------------------------ États d'un compte */

type Etat = "actif" | "desactive" | "verrouille" | "a_changer";
const TON: Record<Etat, Ton> = { actif: "succes", desactive: "neutre", verrouille: "critique", a_changer: "avertissement" };
const LIBELLE: Record<Etat, string> = { actif: "Actif", desactive: "Désactivé", verrouille: "Verrouillé", a_changer: "Doit changer son mot de passe" };
type Filtre = "tous" | "actifs" | "desactives" | "attention";

const TZ = "Africa/Porto-Novo";
const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
function ilYA(iso: string | null, maintenant: number) {
  if (!iso) return "Jamais connecté";
  const s = Math.round((Date.parse(iso) - maintenant) / 1000);
  const a = Math.abs(s);
  if (a < 60) return "à l'instant";
  if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (a < 30 * 86400) return rtf.format(Math.round(s / 86400), "day");
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", timeZone: TZ });
}
const heure = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

function etats(c: CompteAdmin, maintenant: number): Etat[] {
  const e: Etat[] = [c.actif ? "actif" : "desactive"];
  if (c.verrouilleJusquA && Date.parse(c.verrouilleJusquA) > maintenant) e.push("verrouille");
  if (c.doitChangerMotDePasse) e.push("a_changer");
  return e;
}

type Action = { type: "reinitialiser" | "desactiver" | "activer"; compte: CompteAdmin };

/* ------------------------------------------------------------------ Page */

export default function AdministrationPage() {
  const comptes = useComptes();
  const { compte: moi } = useSession();
  const reinit = useReinitialiserMutation();
  const activation = useActivationMutation();

  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [action, setAction] = useState<Action | null>(null);
  // Mot de passe temporaire : uniquement dans l'état de ce composant, le temps de l'affichage. Jamais stocké ailleurs.
  const [secret, setSecret] = useState<{ compte: CompteAdmin; motDePasse: string } | null>(null);

  const maintenant = comptes.dataUpdatedAt;
  const liste = useMemo(() => comptes.data ?? [], [comptes.data]);
  const filtres = useMemo(() => {
    const q = normaliser(recherche.trim());
    return liste.filter((c) => {
      const e = etats(c, maintenant);
      const okFiltre = filtre === "tous" || (filtre === "actifs" ? c.actif : filtre === "desactives" ? !c.actif : e.includes("verrouille") || e.includes("a_changer"));
      return okFiltre && (!q || [c.nomAffiche, c.identifiant, c.fonction].some((t) => normaliser(t).includes(q)));
    });
  }, [liste, recherche, filtre, maintenant]);

  if (comptes.isError && comptes.error instanceof ErreurApi && comptes.error.refus) {
    return (
      <EntreePage>
        <div className="space-y-5">
          <PageHeader surtitre="Administration" titre="Comptes et accès" />
          <Card><EtatVide icone={ShieldX} titre="Réservé à l'administrateur de la plateforme" texte="Le refus a été inscrit au journal d'audit." /></Card>
        </div>
      </EntreePage>
    );
  }

  const actifs = liste.filter((c) => c.actif).length;
  const sessions = liste.reduce((s, c) => s + c.sessionsActives, 0);
  const verrouilles = liste.filter((c) => etats(c, maintenant).includes("verrouille")).length;
  const aChanger = liste.filter((c) => c.doitChangerMotDePasse).length;

  const confirmer = async () => {
    if (!action) return;
    const { type, compte } = action;
    if (type === "reinitialiser") {
      const r = await reinit.mutateAsync(compte.id).catch(() => null);
      reinit.reset();
      setAction(null);
      if (r) setSecret({ compte, motDePasse: r.motDePasseTemporaire });
    } else {
      const ok = await activation.mutateAsync({ id: compte.id, actif: type === "activer" }).then(() => true, () => false);
      setAction(null);
      if (ok) notifier({ ton: "succes", titre: type === "activer" ? "Compte réactivé" : "Compte désactivé", texte: type === "activer" ? `${compte.nomAffiche} peut de nouveau se connecter.` : `${compte.nomAffiche} ne peut plus se connecter ; ses sessions ont été révoquées.` });
    }
  };

  return (
    <EntreePage>
      <div className="space-y-5">
        <PageHeader
          surtitre="Administration"
          titre="Comptes et accès"
          sousTitre="Qui peut se connecter, depuis quand, avec combien de sessions ouvertes. Chaque réinitialisation, activation ou désactivation est inscrite au journal d'audit."
          actions={<Button variante="secondaire" taille="sm" icone={RefreshCw} chargement={comptes.isFetching && !comptes.isPending} onClick={() => comptes.refetch()}>Actualiser</Button>}
        />

        {comptes.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Squelette key={i} className="h-[104px] rounded-lg" />)}</div>
        ) : comptes.data ? (
          <Cascade className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Element><TuileIndicateur libelle="Comptes actifs" icone={UserCheck} accent="sarcelle" valeur={<Compteur valeur={actifs} format={entier} />} indice={`sur ${entier(liste.length)} comptes`} /></Element>
            <Element><TuileIndicateur libelle="Sessions ouvertes" icone={MonitorSmartphone} accent="bleu" valeur={<Compteur valeur={sessions} format={entier} />} indice="non révoquées, non expirées" /></Element>
            <Element><TuileIndicateur libelle="Verrouillés" icone={Lock} accent={verrouilles ? "critique" : "neutre"} valeur={<Compteur valeur={verrouilles} format={entier} />} indice="5 échecs → 15 min de verrou" /></Element>
            <Element><TuileIndicateur libelle="Mot de passe à changer" icone={KeyRound} accent={aChanger ? "ambre" : "neutre"} valeur={<Compteur valeur={aChanger} format={entier} />} indice="à la prochaine connexion" /></Element>
          </Cascade>
        ) : null}

        <Card className="min-w-0 p-3">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <label className="relative block min-w-0">
              <span className="sr-only">Rechercher un compte</span>
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
              <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Nom, identifiant, fonction…" className="h-10 w-full rounded-md border border-line bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/15" />
            </label>
            <div className="max-w-full overflow-x-auto">
              <Segmente
                label="Filtrer les comptes"
                options={[{ valeur: "tous", libelle: "Tous" }, { valeur: "actifs", libelle: "Actifs" }, { valeur: "desactives", libelle: "Désactivés" }, { valeur: "attention", libelle: "À surveiller" }]}
                valeur={filtre}
                onChange={setFiltre}
              />
            </div>
          </div>
        </Card>

        {comptes.isPending ? (
          <Card className="overflow-hidden p-0"><div className="divide-y divide-line/60">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="flex items-center gap-4 px-5 py-4"><Squelette className="h-9 w-9 rounded-full" /><div className="flex-1 space-y-2"><Squelette className="h-4 w-1/3" /><Squelette className="h-3 w-1/2" /></div><Squelette className="h-8 w-40" /></div>)}</div></Card>
        ) : comptes.isError ? (
          <Card><EtatVide icone={RefreshCw} titre="Liste des comptes indisponible" texte={comptes.error.message} action={<Button variante="secondaire" taille="sm" icone={RefreshCw} onClick={() => comptes.refetch()}>Réessayer</Button>} /></Card>
        ) : filtres.length === 0 ? (
          <Card><EtatVide icone={Users} titre="Aucun compte ne correspond" texte="Modifiez la recherche ou le filtre." action={<Button variante="secondaire" taille="sm" icone={X} onClick={() => { setRecherche(""); setFiltre("tous"); }}>Effacer les filtres</Button>} /></Card>
        ) : (
          <>
            {/* Tableau à partir de md */}
            <Card className="hidden min-w-0 overflow-hidden p-0 md:block">
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-muted">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-semibold">Personne</th>
                      <th scope="col" className="hidden px-5 py-3 font-semibold xl:table-cell">Identifiant</th>
                      <th scope="col" className="px-5 py-3 font-semibold">Dernière connexion</th>
                      <th scope="col" className="hidden px-5 py-3 font-semibold lg:table-cell">Sessions</th>
                      <th scope="col" className="px-5 py-3 font-semibold">État</th>
                      <th scope="col" className="px-5 py-3 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence initial={false}>
                      {filtres.map((c, i) => (
                        <motion.tr key={c.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: EASE, delay: Math.min(i, 12) * 0.035 }} className={cn("border-t border-line/60", !c.actif && "bg-surface-2/40")}>
                          <td className="min-w-[15rem] max-w-[22rem] px-5 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar nom={c.nomAffiche} actif={c.actif} />
                              <div className="min-w-0">
                                <p className="truncate font-medium text-ink">{c.nomAffiche}{c.identifiant === moi.identifiant && <span className="ml-2 text-xs font-normal text-ink-muted">(vous)</span>}</p>
                                <p className="truncate text-xs text-ink-muted">{c.fonction}<span className="xl:hidden"> · <span className="font-mono">{c.identifiant}</span></span></p>
                              </div>
                            </div>
                          </td>
                          <td className="hidden whitespace-nowrap px-5 py-3 font-mono text-xs text-ink-2 xl:table-cell">{c.identifiant}</td>
                          <td className="whitespace-nowrap px-5 py-3 text-ink-2" title={c.derniereConnexion ? new Date(c.derniereConnexion).toLocaleString("fr-FR", { timeZone: TZ }) : undefined}>{ilYA(c.derniereConnexion, maintenant)}</td>
                          <td className="hidden px-5 py-3 lg:table-cell"><span className={cn(c.sessionsActives ? "font-semibold text-ink" : "text-ink-muted")}>{entier(c.sessionsActives)}</span></td>
                          <td className="px-5 py-3"><Etats c={c} maintenant={maintenant} /></td>
                          <td className="whitespace-nowrap px-5 py-3 text-right"><Actions c={c} moi={c.identifiant === moi.identifiant} onAction={setAction} /></td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Cartes sous md */}
            <ul className="grid gap-3 sm:grid-cols-2 md:hidden">
              <AnimatePresence initial={false}>
                {filtres.map((c, i) => (
                  <motion.li key={c.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: EASE, delay: Math.min(i, 12) * 0.035 }} className={cn("min-w-0 rounded-xl border border-line/70 bg-surface p-4 shadow-float", !c.actif && "bg-surface-2/60")}>
                    <div className="flex items-start gap-3">
                      <Avatar nom={c.nomAffiche} actif={c.actif} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-ink">{c.nomAffiche}{c.identifiant === moi.identifiant && <span className="ml-1.5 text-xs font-normal text-ink-muted">(vous)</span>}</p>
                        <p className="truncate text-xs text-ink-muted">{c.fonction}</p>
                        <p className="truncate font-mono text-xs text-ink-2">{c.identifiant}</p>
                      </div>
                    </div>
                    <div className="mt-3"><Etats c={c} maintenant={maintenant} /></div>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-md bg-surface-2/60 px-2.5 py-2"><dt className="text-ink-muted">Dernière connexion</dt><dd className="mt-0.5 font-medium text-ink">{ilYA(c.derniereConnexion, maintenant)}</dd></div>
                      <div className="rounded-md bg-surface-2/60 px-2.5 py-2"><dt className="text-ink-muted">Sessions ouvertes</dt><dd className="mt-0.5 font-medium tabular text-ink">{entier(c.sessionsActives)}</dd></div>
                    </dl>
                    <div className="mt-3 border-t border-line/60 pt-3"><Actions c={c} moi={c.identifiant === moi.identifiant} onAction={setAction} pleine /></div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </>
        )}

        <p className="text-xs text-ink-muted">
          Sécurité des comptes : mots de passe hachés (scrypt), sessions serveur de 12 h révocables, verrouillage de 15 min après 5 échecs. L'administrateur ne voit jamais un mot de passe :
          il ne peut qu'en générer un temporaire, affiché une seule fois, que la personne devra remplacer à sa connexion.
        </p>
      </div>

      <Confirmation action={action} chargement={reinit.isPending || activation.isPending} onAnnuler={() => setAction(null)} onConfirmer={confirmer} />
      <MotDePasseTemporaire secret={secret} onFermer={() => setSecret(null)} />
    </EntreePage>
  );
}

/* ------------------------------------------------------------------ Éléments de ligne */

function Avatar({ nom, actif }: { nom: string; actif: boolean }) {
  const initiales = nom.split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join("").toUpperCase();
  return (
    <span className={cn("relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold", actif ? "bg-blue-soft text-accent-ink" : "bg-surface-2 text-ink-muted")} aria-hidden>
      {initiales}
      <span className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface", actif ? "bg-success" : "bg-ink-muted")} />
    </span>
  );
}

function Etats({ c, maintenant }: { c: CompteAdmin; maintenant: number }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {etats(c, maintenant).map((e) => (
        <Badge key={e} ton={TON[e]}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
          {e === "verrouille" && c.verrouilleJusquA ? `Verrouillé jusqu'à ${heure(c.verrouilleJusquA)}` : LIBELLE[e]}
        </Badge>
      ))}
      {c.echecs > 0 && <Badge ton="avertissement">{c.echecs} échec{c.echecs > 1 ? "s" : ""}</Badge>}
    </div>
  );
}

function Actions({ c, moi, onAction, pleine }: { c: CompteAdmin; moi: boolean; onAction: (a: Action) => void; pleine?: boolean }) {
  return (
    <div className={cn("flex gap-2", pleine ? "flex-col sm:flex-row" : "justify-end")}>
      <Button variante="secondaire" taille="sm" icone={KeyRound} className={cn(pleine && "h-10 w-full sm:flex-1")} onClick={() => onAction({ type: "reinitialiser", compte: c })}>Réinitialiser</Button>
      {c.actif ? (
        <Button
          variante="fantome"
          taille="sm"
          icone={PowerOff}
          className={cn("text-critical hover:bg-critical-bg hover:text-critical", pleine && "h-10 w-full sm:flex-1")}
          disabled={moi}
          title={moi ? "Vous ne pouvez pas désactiver votre propre compte" : undefined}
          onClick={() => onAction({ type: "desactiver", compte: c })}
        >
          Désactiver
        </Button>
      ) : (
        <Button variante="valider" taille="sm" icone={Power} className={cn(pleine && "h-10 w-full sm:flex-1")} onClick={() => onAction({ type: "activer", compte: c })}>Activer</Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Modale (feuille basse sur mobile, centrée à partir de sm) */

function Modale({ ouvert, onFermer, fermable = true, titre, icone, ton = "info", children, pied }: {
  ouvert: boolean; onFermer: () => void; fermable?: boolean; titre: string; icone: typeof KeyRound; ton?: "info" | "critique" | "avertissement"; children: ReactNode; pied: ReactNode;
}) {
  useEffect(() => {
    if (!ouvert || !fermable) return;
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [ouvert, fermable, onFermer]);
  // Portail vers <body> : l'animation d'entrée de page (transform) deviendrait sinon le repère des éléments « fixed ».
  const monte = useSyncExternalStore(() => () => {}, () => true, () => false);
  const Icone = icone;
  if (!monte) return null;
  return createPortal(
    <AnimatePresence>
      {ouvert && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
          <motion.div className="absolute inset-0 bg-navy-deep/40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={fermable ? onFermer : undefined} aria-hidden />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titre-modale"
            className="relative w-full overflow-hidden rounded-t-2xl border border-line/70 bg-surface shadow-pop sm:max-w-lg sm:rounded-2xl"
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
          >
            <div className="flex items-start gap-3 border-b border-line/60 px-5 py-4">
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", ton === "critique" ? "bg-critical-bg text-critical" : ton === "avertissement" ? "bg-warning-bg text-warning" : "bg-blue-soft text-accent-ink")}><Icone size={17} aria-hidden /></span>
              <h2 id="titre-modale" className="min-w-0 flex-1 pt-1.5 text-[16px] font-semibold text-ink">{titre}</h2>
              {fermable && <button onClick={onFermer} className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2" aria-label="Fermer"><X size={17} /></button>}
            </div>
            <div className="space-y-3 px-5 py-4 text-sm text-ink-2">{children}</div>
            <div className="flex flex-col-reverse gap-2 border-t border-line/60 bg-surface-2/40 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">{pied}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function Confirmation({ action, chargement, onAnnuler, onConfirmer }: { action: Action | null; chargement: boolean; onAnnuler: () => void; onConfirmer: () => void }) {
  const c = action?.compte;
  const type = action?.type;
  const titre = type === "reinitialiser" ? "Réinitialiser le mot de passe ?" : type === "desactiver" ? "Désactiver ce compte ?" : "Réactiver ce compte ?";
  return (
    <Modale
      ouvert={!!action}
      onFermer={chargement ? () => {} : onAnnuler}
      titre={titre}
      icone={type === "reinitialiser" ? KeyRound : type === "desactiver" ? PowerOff : Power}
      ton={type === "desactiver" ? "critique" : type === "reinitialiser" ? "avertissement" : "info"}
      pied={
        <>
          <Button variante="secondaire" onClick={onAnnuler} disabled={chargement}>Annuler</Button>
          <Button variante={type === "desactiver" ? "danger" : type === "activer" ? "valider" : "primaire"} chargement={chargement} onClick={onConfirmer} autoFocus>
            {type === "reinitialiser" ? "Générer un mot de passe temporaire" : type === "desactiver" ? "Désactiver le compte" : "Réactiver le compte"}
          </Button>
        </>
      }
    >
      {c && (
        <>
          <p className="rounded-md bg-surface-2/70 px-3 py-2"><span className="font-semibold text-ink">{c.nomAffiche}</span> · {c.fonction} <span className="block font-mono text-xs text-ink-muted">{c.identifiant}</span></p>
          {type === "reinitialiser" && (
            <ul className="list-disc space-y-1 pl-5">
              <li>Le mot de passe actuel cesse immédiatement de fonctionner.</li>
              <li>{c.sessionsActives ? `Ses ${entier(c.sessionsActives)} session${c.sessionsActives > 1 ? "s" : ""} ouverte${c.sessionsActives > 1 ? "s" : ""} ser${c.sessionsActives > 1 ? "ont" : "a"} révoquée${c.sessionsActives > 1 ? "s" : ""}.` : "Aucune session ouverte à révoquer."}</li>
              <li>Un mot de passe temporaire sera affiché <strong className="text-ink">une seule fois</strong> ; la personne devra le remplacer à sa connexion.</li>
            </ul>
          )}
          {type === "desactiver" && <p>La personne ne pourra plus se connecter{c.sessionsActives ? ` et ses ${entier(c.sessionsActives)} session${c.sessionsActives > 1 ? "s" : ""} ouverte${c.sessionsActives > 1 ? "s" : ""} ser${c.sessionsActives > 1 ? "ont" : "a"} révoquée${c.sessionsActives > 1 ? "s" : ""} immédiatement` : ""}. Son historique et ses traces d'audit sont conservés ; le compte peut être réactivé.</p>}
          {type === "activer" && <p>La personne pourra de nouveau se connecter avec son mot de passe actuel.</p>}
          <p className="flex items-center gap-1.5 text-xs text-ink-muted"><ShieldCheck size={13} aria-hidden />L'opération sera inscrite au journal d'audit à votre nom.</p>
        </>
      )}
    </Modale>
  );
}

/* ------------------------------------------------------------------ Affichage unique du mot de passe temporaire */

function MotDePasseTemporaire({ secret, onFermer }: { secret: { compte: CompteAdmin; motDePasse: string } | null; onFermer: () => void }) {
  return (
    <Modale
      ouvert={!!secret}
      onFermer={onFermer}
      fermable={false}
      titre="Mot de passe temporaire"
      icone={KeyRound}
      ton="avertissement"
      pied={<Button onClick={onFermer} icone={ShieldCheck}>J'ai transmis le mot de passe</Button>}
    >
      {/* La clé remonte le contenu à chaque nouveau secret : l'état « affiché / copié » repart de zéro. */}
      {secret && <ContenuSecret key={secret.compte.id + secret.motDePasse.length} secret={secret} />}
    </Modale>
  );
}

function ContenuSecret({ secret }: { secret: { compte: CompteAdmin; motDePasse: string } }) {
  const [visible, setVisible] = useState(false);
  const [copie, setCopie] = useState(false);
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(secret.motDePasse);
      setCopie(true);
      notifier({ ton: "succes", titre: "Copié dans le presse-papiers" });
    } catch {
      notifier({ ton: "avertissement", titre: "Copie impossible", texte: "Affichez le mot de passe et recopiez-le." });
    }
  };
  return (
    <>
      <p>Pour <span className="font-semibold text-ink">{secret.compte.nomAffiche}</span> (<span className="font-mono">{secret.compte.identifiant}</span>). Transmettez-le par un canal sûr, en personne de préférence.</p>
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2/60 p-2 pl-3">
        <code className="min-w-0 flex-1 select-all break-all font-mono text-[17px] font-semibold tracking-wide text-ink" aria-label={visible ? "Mot de passe temporaire" : "Mot de passe masqué"}>
          {visible ? secret.motDePasse : "•".repeat(Math.min(secret.motDePasse.length, 20))}
        </code>
        <button onClick={() => setVisible((v) => !v)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface hover:text-ink" aria-label={visible ? "Masquer" : "Afficher"} title={visible ? "Masquer" : "Afficher"}>
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
        <Button variante={copie ? "valider" : "secondaire"} taille="sm" icone={Copy} className="h-10 shrink-0" onClick={copier}>{copie ? "Copié" : "Copier"}</Button>
      </div>
      <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-bg px-3 py-2 text-[13px] text-ink">
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" aria-hidden />
        Ce mot de passe ne sera plus jamais affiché : il n'est conservé ni sur le serveur (seule son empreinte l'est) ni dans ce navigateur. En cas de perte, il faudra réinitialiser à nouveau.
      </motion.p>
    </>
  );
}

function normaliser(t: string) {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
