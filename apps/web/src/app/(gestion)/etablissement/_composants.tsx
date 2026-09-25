"use client";

import { Building2, Lock, RotateCw, Search, TriangleAlert, WifiOff, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, type ReactNode } from "react";
import { AnimatePresence, EASE, motion } from "@/components/motion";
import { Button, Card, EtatVide } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { ErreurApi } from "@/lib/http";

/** Composants propres à l'espace établissement (non partagés). */

/* ------------------------------------------------------------------ Formats locaux (heure du Bénin) */

const fmtHeure = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Porto-Novo" });
const fmtHeureSec = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Africa/Porto-Novo" });
const fmtDateCourte = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Porto-Novo" });

export const heureLocale = (iso: string | number) => fmtHeure.format(new Date(iso));
export const heureSecondes = (iso: string | number) => fmtHeureSec.format(new Date(iso));
export const dateCourte = (iso: string) => fmtDateCourte.format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso));

export function ageEnAnnees(naissance: string, reference: string) {
  const n = new Date(naissance), r = new Date(reference);
  let a = r.getUTCFullYear() - n.getUTCFullYear();
  if (r.getUTCMonth() < n.getUTCMonth() || (r.getUTCMonth() === n.getUTCMonth() && r.getUTCDate() < n.getUTCDate())) a--;
  return a;
}

export const normaliser = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/* ------------------------------------------------------------------ Garde : réservé au chef d'établissement */

export function HorsPerimetre() {
  return (
    <Card>
      <EtatVide icone={Building2} titre="Espace réservé à la direction d'un établissement" texte="Votre compte ne porte pas d'habilitation « chef d'établissement ». Les données d'établissement sont consultées depuis votre propre espace." />
    </Card>
  );
}

/* ------------------------------------------------------------------ Erreur / refus */

export function EtatErreur({ erreur, reessayer, className }: { erreur: unknown; reessayer?: () => void; className?: string }) {
  const e = erreur instanceof ErreurApi ? erreur : null;
  const refus = e?.refus;
  const reseau = e?.statut === 0;
  const Icone: LucideIcon = refus ? Lock : reseau ? WifiOff : TriangleAlert;
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center rounded-lg px-6 py-10 text-center", refus ? "bg-critical-bg/50" : "bg-surface-2/60", className)}>
      <span className={cn("mb-3 flex h-12 w-12 items-center justify-center rounded-lg", refus ? "bg-critical/10 text-critical" : "bg-surface text-ink-muted")}><Icone size={22} aria-hidden /></span>
      <p className="font-semibold text-ink">{refus ? "Accès refusé" : reseau ? "Service injoignable" : "Chargement impossible"}</p>
      <p className="mt-1 max-w-md text-sm text-ink-2">
        {refus ? `${e!.message}. Le refus a été inscrit au journal d'audit.` : e?.message ?? "Une erreur inattendue est survenue."}
      </p>
      {reessayer && !refus && <Button className="mt-4" variante="secondaire" taille="sm" icone={RotateCw} onClick={reessayer}>Réessayer</Button>}
    </div>
  );
}

/* ------------------------------------------------------------------ Champ de recherche */

export function ChampRecherche({ valeur, onChange, placeholder, label, className }: { valeur: string; onChange: (v: string) => void; placeholder: string; label: string; className?: string }) {
  return (
    <label className={cn("relative block", className)}>
      <span className="sr-only">{label}</span>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
      <input
        type="search"
        value={valeur}
        onChange={(e) => onChange(e.target.value.slice(0, 60))}
        placeholder={placeholder}
        className="h-10 w-full rounded-md border border-line bg-surface pl-9 pr-9 text-sm text-ink placeholder:text-ink-muted focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/15"
      />
      {valeur && (
        <button type="button" onClick={() => onChange("")} className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink" aria-label="Effacer la recherche">
          <X size={14} aria-hidden />
        </button>
      )}
    </label>
  );
}

export const classeChamp = "h-10 w-full rounded-md border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-ink-muted focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/15";
export const classeSelect = "h-10 rounded-md border border-line bg-surface px-3.5 text-sm text-ink focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/15";

/* ------------------------------------------------------------------ Avatar à initiales */

const TEINTES = ["bg-blue-soft text-accent-ink", "bg-success-bg text-success", "bg-warning-bg text-warning", "bg-info-bg text-info", "bg-surface-2 text-ink-2"];
export function Avatar({ prenoms, nom, taille = "md", className }: { prenoms: string; nom: string; taille?: "sm" | "md" | "lg"; className?: string }) {
  const initiales = `${prenoms.trim()[0] ?? ""}${nom.trim()[0] ?? ""}`.toUpperCase();
  const teinte = TEINTES[[...`${prenoms}${nom}`].reduce((s, c) => s + c.charCodeAt(0), 0) % TEINTES.length];
  return (
    <span aria-hidden className={cn("flex shrink-0 items-center justify-center rounded-full font-display font-bold", teinte,
      taille === "sm" ? "h-8 w-8 text-[11.5px]" : taille === "lg" ? "h-16 w-16 text-[22px]" : "h-10 w-10 text-[13px]", className)}>
      {initiales}
    </span>
  );
}

/* ------------------------------------------------------------------ Jauge d'occupation */

export function Jauge({ valeur, max, className }: { valeur: number; max: number; className?: string }) {
  const taux = max ? valeur / max : 0;
  const couleur = taux > 1 ? "bg-critical" : taux >= 0.92 ? "bg-warning" : "bg-teal";
  return (
    <span className={cn("relative block h-1.5 overflow-hidden rounded-full bg-surface-2", className)} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={valeur} aria-label="Occupation">
      <motion.span className={cn("absolute inset-y-0 left-0 rounded-full", couleur)} initial={{ width: 0 }} animate={{ width: `${Math.min(100, taux * 100)}%` }} transition={{ duration: 0.8, ease: EASE }} />
    </span>
  );
}

/* ------------------------------------------------------------------ Point « en direct » */

export function PointDirect({ actif, className }: { actif: boolean; className?: string }) {
  return (
    <span className={cn("relative flex h-2.5 w-2.5", className)} aria-hidden>
      {actif && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />}
      <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", actif ? "bg-success" : "bg-ink-muted")} />
    </span>
  );
}

/* ------------------------------------------------------------------ Dialogue de confirmation */

export function Dialogue({ ouvert, onFermer, titre, description, icone: Icone, ton = "neutre", children, pied, large }: {
  ouvert: boolean; onFermer: () => void; titre: ReactNode; description?: ReactNode; icone?: LucideIcon;
  ton?: "neutre" | "danger" | "succes"; children?: ReactNode; pied?: ReactNode; large?: boolean;
}) {
  const id = useId();
  useEffect(() => {
    if (!ouvert) return;
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", f);
    const ancien = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", f); document.body.style.overflow = ancien; };
  }, [ouvert, onFermer]);
  return (
    <AnimatePresence>
      {ouvert && (
        <motion.div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button type="button" aria-label="Fermer" className="absolute inset-0 cursor-default bg-navy-deep/40 backdrop-blur-sm" onClick={onFermer} />
          <motion.div
            role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}
            initial={{ y: 40, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0, transition: { duration: 0.18 } }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
            className={cn("relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line/70 bg-surface shadow-pop sm:rounded-2xl", large ? "sm:max-w-2xl" : "sm:max-w-lg")}
          >
            <div className="flex items-start gap-3 border-b border-line/60 px-5 pb-4 pt-5">
              {Icone && (
                <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                  ton === "danger" ? "bg-critical-bg text-critical" : ton === "succes" ? "bg-success-bg text-success" : "bg-blue-soft text-accent-ink")}>
                  <Icone size={19} aria-hidden />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h2 id={`${id}-t`} className="text-[17px] font-bold leading-snug text-ink">{titre}</h2>
                {description && <p className="mt-1 text-[13.5px] text-ink-2">{description}</p>}
              </div>
              <button type="button" onClick={onFermer} className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink" aria-label="Fermer"><X size={17} aria-hidden /></button>
            </div>
            {children && <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>}
            {pied && <div className="flex flex-col-reverse gap-2 border-t border-line/60 bg-surface-2/40 px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">{pied}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ Ligne de définition */

export function Info({ libelle, children, className }: { libelle: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-md bg-surface-2/60 px-3 py-2.5", className)}>
      <dt className="text-[12px] text-ink-muted">{libelle}</dt>
      <dd className="mt-0.5 text-[14px] font-medium text-ink">{children}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ Statuts : libellés et tons (mapping central) */

export type TonStatut = "neutre" | "info" | "succes" | "avertissement" | "critique" | "marque";

const POINT: Record<TonStatut, string> = {
  neutre: "bg-ink-muted", info: "bg-info", succes: "bg-success", avertissement: "bg-warning", critique: "bg-critical", marque: "bg-blue",
};
const FOND: Record<TonStatut, string> = {
  neutre: "bg-surface-2 text-ink-2", info: "bg-info-bg text-info", succes: "bg-success-bg text-success",
  avertissement: "bg-warning-bg text-warning", critique: "bg-critical-bg text-critical", marque: "bg-blue-soft text-accent-ink",
};

/** Badge de statut avec point (règle 8). */
export function Statut({ ton, children, className }: { ton: TonStatut; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-0.5 text-[12px] font-medium", FOND[ton], className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", POINT[ton])} aria-hidden />
      {children}
    </span>
  );
}

export const LIBELLE_STATUT_DEMANDE = { ouverte: "Ouverte", en_cours: "En cours", acceptee: "Acceptée", refusee: "Refusée", close: "Close" } as const;
export const TON_STATUT_DEMANDE: Record<keyof typeof LIBELLE_STATUT_DEMANDE, TonStatut> = { ouverte: "info", en_cours: "avertissement", acceptee: "succes", refusee: "critique", close: "neutre" };

export const ETAPES_ACCOMPAGNEMENT = [
  { code: "PROPOSITION", libelle: "Proposition" },
  { code: "VALIDATION_CONSEIL", libelle: "Conseil pédagogique" },
  { code: "INFORMATION_FAMILLES", libelle: "Information des familles" },
] as const;

export const LIBELLE_IDENTITE = { verifiee: "Identité vérifiée", regularisation_en_cours: "Régularisation en cours" } as const;
export const TON_IDENTITE: Record<keyof typeof LIBELLE_IDENTITE, TonStatut> = { verifiee: "succes", regularisation_en_cours: "info" };

export const LIBELLE_SITUATION = { scolarise: "Scolarisé·e", abandon: "Sorti·e (abandon)", non_inscrit: "Non inscrit·e" } as const;
export const TON_SITUATION: Record<keyof typeof LIBELLE_SITUATION, TonStatut> = { scolarise: "succes", abandon: "critique", non_inscrit: "neutre" };

export const LIBELLE_EVENEMENT: Record<string, string> = {
  INSCRIPTION: "Inscription", EVALUATION: "Évaluation", CORRECTION_EVALUATION: "Correction de note", ABSENCE: "Absence",
  PASSAGE: "Passage de niveau", TRANSFERT: "Transfert", ABANDON: "Abandon", REPRISE: "Reprise de scolarité",
  RESULTAT_EXAMEN: "Résultat d'examen", CERTIFICATION: "Diplôme délivré", REGULARISATION_IDENTITE_DEMANDEE: "Régularisation d'identité",
  AFFECTATION_ENSEIGNANT: "Affectation", FORMATION_ENSEIGNANT: "Formation",
};
export const TON_EVENEMENT: Record<string, TonStatut> = {
  INSCRIPTION: "marque", PASSAGE: "succes", TRANSFERT: "info", ABANDON: "critique", REPRISE: "succes",
  RESULTAT_EXAMEN: "avertissement", CERTIFICATION: "succes", REGULARISATION_IDENTITE_DEMANDEE: "info", CORRECTION_EVALUATION: "neutre",
};
export const LIBELLE_SOURCE: Record<string, string> = { beile: "BEILE", registre_national: "Registre national", educmaster: "EDUCMASTER", examens: "Office des examens" };

/* ------------------------------------------------------------------ Lien à l'apparence d'un bouton (pas de <button> dans un <a>) */

const LIEN_VARIANTES = {
  primaire: "bg-navy text-white shadow-sm hover:bg-navy-deep dark:bg-blue dark:text-navy-deep dark:hover:bg-blue/85",
  secondaire: "bg-surface text-ink ring-1 ring-inset ring-line hover:bg-surface-2",
  fantome: "bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink",
} as const;

export function LienBouton({ href, variante = "primaire", taille = "md", icone: Icone, children, className, onClick }: {
  href: string; variante?: keyof typeof LIEN_VARIANTES; taille?: "sm" | "md"; icone?: LucideIcon; children: ReactNode; className?: string;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <Link href={href} onClick={onClick} className={cn(
      "inline-flex select-none items-center justify-center gap-2 rounded-md font-medium transition-all duration-150 active:scale-[0.97]",
      taille === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm",
      LIEN_VARIANTES[variante], className,
    )}>
      {Icone && <Icone size={taille === "sm" ? 14 : 16} aria-hidden />}
      {children}
    </Link>
  );
}
