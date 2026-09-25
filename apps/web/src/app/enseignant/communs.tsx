"use client";

import { AlertTriangle, ChevronDown, CloudOff, CloudUpload, RefreshCw, ShieldAlert, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, EASE, motion } from "@/components/motion";
import { useEnLigne } from "@/components/shell/EtatReseau";
import { Button, Card, EtatVide } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { heure } from "@/lib/format";
import { ErreurApi } from "@/lib/http";
import { useSynchronisationEnseignant } from "@/lib/api/enseignant";
import { useFileHorsConnexion } from "@/lib/fileHorsConnexion";

/**
 * Bandeau « N saisies en attente » : visible dès qu'une saisie attend le réseau.
 * Déplié, il liste chaque saisie (libellé, heure du geste, dernière erreur) ; « Envoyer maintenant » force un vidage.
 */
export function BandeauFile({ classeId, className }: { classeId?: string; className?: string }) {
  const file = useFileHorsConnexion(classeId);
  const enLigne = useEnLigne();
  const synchroniser = useSynchronisationEnseignant();
  const [ouvert, setOuvert] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  return (
    <AnimatePresence initial={false}>
      {file.length > 0 && (
        <motion.section
          key="file"
          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          className={cn("overflow-hidden", className)}
          aria-live="polite"
        >
          <div className="rounded-xl border border-warning/30 bg-warning-bg/70">
            <div className="flex flex-wrap items-center gap-3 p-3 sm:p-3.5">
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning text-white">
                {enLigne ? <CloudUpload size={19} aria-hidden /> : <CloudOff size={19} aria-hidden />}
                <motion.span key={file.length} initial={{ scale: 1.6 }} animate={{ scale: 1 }} className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-surface px-1 text-[11px] font-bold tabular text-warning ring-2 ring-warning-bg">
                  {file.length}
                </motion.span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-ink">{file.length} saisie{file.length > 1 ? "s" : ""} en attente</p>
                <p className="text-[12.5px] text-ink-2">
                  {enLigne ? "Envoi en cours ou en attente de nouvelle tentative." : "Conservées sur cet appareil : envoi automatique au retour du réseau."}
                </p>
              </div>
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <button onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} className="inline-flex h-10 flex-1 items-center justify-center gap-1 rounded-md px-3 text-[13px] font-medium text-ink-2 hover:bg-surface/60 sm:flex-none">
                  Détail <ChevronDown size={15} className={cn("transition-transform", ouvert && "rotate-180")} aria-hidden />
                </button>
                <Button taille="md" variante="secondaire" icone={RefreshCw} disabled={!enLigne} chargement={envoi} className="flex-1 sm:flex-none"
                  onClick={async () => { setEnvoi(true); try { await synchroniser(); } finally { setEnvoi(false); } }}>
                  Envoyer
                </Button>
              </div>
            </div>
            <AnimatePresence initial={false}>
              {ouvert && (
                <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="divide-y divide-warning/15 overflow-hidden border-t border-warning/20">
                  {file.map((s) => (
                    <motion.li key={s.id} layout exit={{ opacity: 0, x: 24 }} className="flex items-start gap-3 px-3.5 py-2.5 text-[13px]">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-warning" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink">{s.libelle}</p>
                        <p className="text-[12px] text-ink-muted">
                          Saisi à {heure(s.saisiLe)}{s.tentatives ? ` · ${s.tentatives} tentative${s.tentatives > 1 ? "s" : ""}` : ""}{s.derniereErreur ? ` · ${s.derniereErreur}` : ""}
                        </p>
                      </div>
                    </motion.li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

/** Erreur ou refus d'un écran : un 403 est dit clairement (et il a été journalisé côté serveur). */
export function Erreur({ erreur, relancer, enCours, titre = "Impossible de charger vos classes" }: { erreur: Error; relancer: () => void; enCours?: boolean; titre?: string }) {
  const refus = erreur instanceof ErreurApi && erreur.refus;
  const introuvable = erreur instanceof ErreurApi && erreur.introuvable;
  return (
    <Card className="mx-auto max-w-lg">
      <EtatVide
        icone={refus ? ShieldAlert : AlertTriangle}
        titre={refus ? "Accès refusé" : introuvable ? "Introuvable" : titre}
        texte={refus ? `${erreur.message.replace(/\.$/, "")}. La plateforme a enregistré cette tentative dans le journal d'audit.` : erreur.message}
        action={!refus && !introuvable && <Button variante="secondaire" icone={RefreshCw} chargement={enCours} onClick={relancer}>Réessayer</Button>}
      />
    </Card>
  );
}

/** Coche animée (tracé progressif) pour les confirmations. */
export function CocheAnimee({ taille = 56, ton = "succes" }: { taille?: number; ton?: "succes" | "attente" }) {
  return (
    <motion.span
      initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 380, damping: 18 }}
      className={cn("flex items-center justify-center rounded-full text-white shadow-pop", ton === "succes" ? "bg-success" : "bg-warning")}
      style={{ width: taille, height: taille }}
      aria-hidden
    >
      {ton === "succes" ? (
        <svg viewBox="0 0 24 24" width={taille * 0.5} height={taille * 0.5} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <motion.path d="M5 12.5 10 17.5 19 7" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, delay: 0.15, ease: EASE }} />
        </svg>
      ) : (
        <CloudOff size={taille * 0.45} />
      )}
    </motion.span>
  );
}

/* ------------------------------------------------------------------ Feuille modale */

/**
 * Modale : feuille basse sur téléphone, centrée à partir de `sm`. Échap et clic sur le voile ferment.
 * Le focus est placé dans la feuille à l'ouverture.
 */
export function FeuilleModale({ ouverte, fermer, titre, sousTitre, pied, children }: { ouverte: boolean; fermer: () => void; titre: ReactNode; sousTitre?: ReactNode; pied?: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ouverte) return;
    const surTouche = (e: KeyboardEvent) => { if (e.key === "Escape") fermer(); };
    window.addEventListener("keydown", surTouche);
    const t = window.setTimeout(() => ref.current?.querySelector<HTMLElement>("input, textarea, button")?.focus(), 60);
    return () => { window.removeEventListener("keydown", surTouche); window.clearTimeout(t); };
  }, [ouverte, fermer]);
  return enPortail(
    <AnimatePresence>
      {ouverte && (
        <motion.div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-navy-deep/40 backdrop-blur-sm" onClick={fermer} aria-hidden />
          <motion.div
            ref={ref}
            role="dialog" aria-modal="true" aria-label={typeof titre === "string" ? titre : undefined}
            initial={{ y: 48, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 48, opacity: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
            className="relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-line/70 bg-surface shadow-pop sm:max-w-lg sm:rounded-2xl"
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden />
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-[16px] font-semibold text-ink">{titre}</h2>
                {sousTitre && <p className="mt-0.5 text-[13px] text-ink-muted">{sousTitre}</p>}
              </div>
              <button onClick={fermer} className="-mr-1 flex h-10 w-10 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink" aria-label="Fermer"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto px-5 py-4">{children}</div>
            {pied && <div className="flex justify-end gap-3 border-t border-line px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">{pied}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ Statuts (mapping central) */

export type StatutEleve = "present" | "absent" | "enregistre" | "attente";
export const TON_STATUT: Record<StatutEleve, "succes" | "critique" | "neutre" | "avertissement"> = { present: "succes", absent: "critique", enregistre: "neutre", attente: "avertissement" };
export const LIBELLE_STATUT: Record<StatutEleve, string> = { present: "Présent", absent: "Absent", enregistre: "Absent · enregistré", attente: "Absent · en attente" };

export type StatutFormation = "inscrit" | "validee" | "en_cours" | "a_faire";
export const TON_FORMATION: Record<StatutFormation, "info" | "succes" | "avertissement" | "neutre"> = { inscrit: "info", validee: "succes", en_cours: "info", a_faire: "neutre" };
export const LIBELLE_FORMATION: Record<StatutFormation, string> = { inscrit: "Inscrit", validee: "Validée", en_cours: "En cours", a_faire: "Non inscrit" };

/** Badge avec point de statut. */
export function BadgePoint({ ton, children, className }: { ton: "succes" | "critique" | "neutre" | "avertissement" | "info"; children: ReactNode; className?: string }) {
  const point = { succes: "bg-success", critique: "bg-critical", neutre: "bg-ink-muted", avertissement: "bg-warning", info: "bg-info" }[ton];
  const fond = { succes: "bg-success-bg text-success", critique: "bg-critical-bg text-critical", neutre: "bg-surface-2 text-ink-2", avertissement: "bg-warning-bg text-warning", info: "bg-info-bg text-info" }[ton];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-0.5 text-[12px] font-medium", fond, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", point)} aria-hidden />{children}
    </span>
  );
}

/* ------------------------------------------------------------------ Confirmation animée */

/** Confirmation plein écran brève (coche tracée) ; se ferme seule ou au toucher. */
export function Confirmation({ visible, attente, titre, texte, fermer }: { visible: boolean; attente?: boolean; titre: string; texte?: string; fermer: () => void }) {
  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(fermer, 2600);
    return () => window.clearTimeout(t);
  }, [visible, fermer]);
  return enPortail(
    <AnimatePresence>
      {visible && (
        <motion.div className="fixed inset-0 z-[65] flex items-center justify-center p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={fermer} role="status" aria-live="assertive">
          <div className="absolute inset-0 bg-navy-deep/25 backdrop-blur-[2px]" aria-hidden />
          <motion.div
            initial={{ scale: 0.9, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ type: "spring", stiffness: 360, damping: 26 }}
            className="relative flex w-full max-w-xs flex-col items-center rounded-2xl border border-line/70 bg-surface px-6 py-7 text-center shadow-pop"
          >
            <CocheAnimee taille={64} ton={attente ? "attente" : "succes"} />
            <p className="mt-4 text-[17px] font-semibold text-ink">{titre}</p>
            {texte && <p className="mt-1 text-[13.5px] text-ink-2">{texte}</p>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const nomComplet = (e: { nom: string; prenoms: string }) => `${e.nom} ${e.prenoms}`;
export const initiales = (e: { nom: string; prenoms: string }) => `${e.nom[0] ?? ""}${e.prenoms[0] ?? ""}`.toUpperCase();

/**
 * Rendu dans <body> : l'animation d'entrée de page laisse un `filter` sur l'enveloppe, qui ferait
 * de celle-ci le bloc conteneur des éléments `fixed` (modales, barre d'action).
 */
const ACCENT = { "--acc": "#1567c4", "--acc-doux": "#e9f3ff" } as CSSProperties;

export function enPortail(contenu: ReactNode) {
  // Le portail sort de l'enveloppe de l'espace : on y reporte l'accent de l'espace enseignant.
  return typeof document === "undefined" ? null : createPortal(<div className="contents" style={ACCENT}>{contenu}</div>, document.body);
}

/** Barre d'action fixée au-dessus des onglets du téléphone (en bas à droite sur ordinateur), avec un espace réservé. */
export function BarreAction({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="h-28 md:h-20" aria-hidden />
      {enPortail(
        <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 360, damping: 30 }}
          className="fixed inset-x-3 bottom-[80px] z-40 mx-auto max-w-xl rounded-2xl border border-line/70 bg-surface/95 p-2 shadow-pop backdrop-blur-xl md:bottom-5">
          {children}
        </motion.div>,
      )}
    </>
  );
}

/** Données en cache affichées alors que la dernière actualisation a échoué (réseau, service redémarré). */
export function DonneesAnciennes({ relancer, enCours }: { relancer: () => void; enCours?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 rounded-lg bg-surface-2/80 px-3.5 py-2 text-[13px] text-ink-2" role="status">
      <CloudOff size={15} className="shrink-0 text-ink-muted" aria-hidden />
      <span className="min-w-0 flex-1">Actualisation impossible : dernières données connues affichées.</span>
      <button onClick={relancer} disabled={enCours} className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 font-medium text-accent-ink hover:bg-surface disabled:opacity-50"><RefreshCw size={14} className={enCours ? "animate-spin" : undefined} aria-hidden />Réessayer</button>
    </motion.div>
  );
}
