"use client";

import type { Perimetre } from "@beile/contracts";
import { AlertCircle, RotateCcw, ShieldX, X, type LucideIcon } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "@/components/motion";
import { COULEUR_ALERTE } from "@/components/map/CarteBenin";
import { Badge, Button, Card, EtatVide, Squelette, type Ton } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { ErreurApi } from "@/lib/http";
import { useProfil } from "@/lib/session";
import { communeById, departementById } from "@beile/simulation/territoire";
import type { NiveauAlerte } from "@/lib/api/pilotage";

/**
 * Éléments partagés des écrans de pilotage (cockpit, « Où agir ? », console territoriale, Ask, simulation).
 * Mappings centraux des statuts, états obligatoires (chargement, refus, erreur) et feuille modale.
 */

/* ------------------------------------------------------------------ Référentiel géographique */

export const nomCommune = (id: string) => communeById.get(id)?.nom ?? id;
export const nomDepartement = (id: string | null | undefined) => (id ? departementById.get(id)?.nom ?? id : "—");

/* ------------------------------------------------------------------ Niveaux d'alerte */

export const NIVEAUX_ALERTE: { niveau: NiveauAlerte; libelle: string; court: string; symbole: string }[] = [
  { niveau: "critique", libelle: "Critique", court: "Critique", symbole: "◆" },
  { niveau: "attention", libelle: "Attention", court: "Attention", symbole: "▲" },
  { niveau: "surveillance", libelle: "Surveillance", court: "Surveillance", symbole: "◐" },
  { niveau: "favorable", libelle: "Situation favorable", court: "Favorable", symbole: "●" },
];
export const ALERTE = Object.fromEntries(NIVEAUX_ALERTE.map((n) => [n.niveau, n])) as Record<NiveauAlerte, (typeof NIVEAUX_ALERTE)[number]>;
export const niveauDuScore = (s: number): NiveauAlerte => (s >= 3 ? "critique" : s === 2 ? "attention" : s === 1 ? "surveillance" : "favorable");
export const pluriel = (n: number, mot: string, pl = `${mot}s`) => `${n} ${n > 1 ? pl : mot}`;

export function PastilleNiveau({ niveau, className }: { niveau: NiveauAlerte; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-0.5 text-[12px] font-semibold text-white", className)} style={{ background: COULEUR_ALERTE[niveau] }}>
      <span aria-hidden>{ALERTE[niveau].symbole}</span>{ALERTE[niveau].libelle}
    </span>
  );
}

export function LegendeAlertes({ avecPoints, className }: { avecPoints?: boolean; className?: string }) {
  return (
    <div className={cn("mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] text-ink-2", className)}>
      {NIVEAUX_ALERTE.map((n) => (
        <span key={n.niveau} className="inline-flex items-center gap-1.5">
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[4px] text-[9px] leading-none text-white" style={{ background: COULEUR_ALERTE[n.niveau] }} aria-hidden>{n.symbole}</span>
          {n.libelle}
        </span>
      ))}
      {avecPoints && (
        <>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-ink/40" aria-hidden />Établissement</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-surface bg-amber" aria-hidden />Établissement pilote</span>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Faits du registre */

export const LIBELLE_FAIT: Record<string, string> = {
  INSCRIPTION: "Inscription",
  EVALUATION: "Évaluation",
  CORRECTION_EVALUATION: "Correction de note",
  ABSENCE: "Absence",
  PASSAGE: "Passage",
  TRANSFERT: "Transfert",
  ABANDON: "Abandon",
  REPRISE: "Reprise",
  RESULTAT_EXAMEN: "Résultat d'examen",
  CERTIFICATION: "Certification",
  REGULARISATION_IDENTITE_DEMANDEE: "Régularisation d'identité",
  AFFECTATION_ENSEIGNANT: "Affectation d'enseignant",
  FORMATION_ENSEIGNANT: "Formation d'enseignant",
};
export const TON_FAIT: Record<string, Ton> = {
  ABSENCE: "avertissement",
  ABANDON: "critique",
  EVALUATION: "info",
  CORRECTION_EVALUATION: "info",
  INSCRIPTION: "succes",
  REPRISE: "succes",
  CERTIFICATION: "marque",
  RESULTAT_EXAMEN: "marque",
};
export const libelleFait = (type: string) => LIBELLE_FAIT[type] ?? type.replaceAll("_", " ").toLowerCase();
export const tonFait = (type: string): Ton => TON_FAIT[type] ?? "neutre";

const COULEUR_POINT: Record<Ton, string> = {
  neutre: "bg-ink-muted", info: "bg-info", succes: "bg-success", avertissement: "bg-warning", critique: "bg-critical", marque: "bg-blue",
};
export const pointTon = (ton: Ton) => COULEUR_POINT[ton];

/** Badge de statut avec point (mapping central TON/LIBELLÉ). */
export function BadgePoint({ ton, children, className }: { ton: Ton; children: ReactNode; className?: string }) {
  return (
    <Badge ton={ton} className={className}>
      <span className={cn("h-1.5 w-1.5 rounded-full", COULEUR_POINT[ton])} aria-hidden />
      {children}
    </Badge>
  );
}

/* ------------------------------------------------------------------ Heures */

/** Horodatage Postgres (« 2026-09-25 11:04:54+00 ») ou ISO → ISO. */
export const versIso = (t: string) => (t.includes("T") ? t : t.replace(" ", "T").replace(/\+00$/, "Z"));

/** « à l'instant », « il y a 4 min », « il y a 2 h » — `maintenant` est fourni par l'appelant (rendu pur). */
export function ilYa(iso: string, maintenant: number) {
  const s = Math.max(0, Math.round((maintenant - new Date(versIso(iso)).getTime()) / 1000));
  if (s < 45) return "à l'instant";
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `il y a ${h} h${m % 60 ? ` ${String(m % 60).padStart(2, "0")}` : ""}` : `il y a ${Math.floor(h / 24)} j`;
}

/** Horloge qui avance toutes les `pas` millisecondes (heures relatives vivantes sans rendu impur). */
export function useMaintenant(pas = 20_000) {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setT(Date.now()), pas);
    return () => clearInterval(i);
  }, [pas]);
  return t;
}

/* ------------------------------------------------------------------ Habilitation */

const ROLES_PILOTAGE = ["administration_centrale", "direction_departementale", "inspecteur", "chercheur"] as const;

export function useHabilitationPilotage() {
  const profil = useProfil();
  const h = profil.habilitations.find((x) => (ROLES_PILOTAGE as readonly string[]).includes(x.role));
  return h ? { role: h.role, perimetre: h.perimetre as Perimetre } : null;
}

export function libellePerimetre(p: Perimetre | null | undefined) {
  if (!p) return "—";
  if (p.niveau === "national") return "national";
  if (p.niveau === "departement") return `département ${nomDepartement(p.departementId)}`;
  if (p.niveau === "circonscription") return `circonscription de ${p.circonscription.replace(/^CS /, "")}`;
  return "établissement";
}

/* ------------------------------------------------------------------ États obligatoires */

/** Refus (403) ou erreur (réseau, 5xx) avec « Réessayer » ; le refus rappelle que l'API l'a journalisé. */
export function EtatEchec({ erreur, onReessayer, titreRefus = "Hors de votre périmètre", className }: { erreur: unknown; onReessayer?: () => void; titreRefus?: string; className?: string }) {
  const refus = erreur instanceof ErreurApi && erreur.refus;
  const message = erreur instanceof Error ? erreur.message : "Erreur inattendue";
  return (
    <Card className={cn("min-w-0", className)}>
      <EtatVide
        icone={refus ? ShieldX : AlertCircle}
        titre={refus ? titreRefus : "Données indisponibles"}
        texte={refus ? `${message}. Le refus a été journalisé par le serveur.` : `${message}. Vos données ne sont pas perdues : réessayez dans un instant.`}
        action={!refus && onReessayer ? <Button variante="secondaire" taille="sm" icone={RotateCcw} onClick={onReessayer}>Réessayer</Button> : undefined}
      />
    </Card>
  );
}

/** Bandeau de refus compact (dans une page qui reste utilisable). */
export function BandeauRefus({ titre, texte }: { titre: string; texte: ReactNode }) {
  return (
    <motion.div
      role="status" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 rounded-lg border border-critical/30 bg-critical-bg/60 px-4 py-3 text-[13px] text-critical"
    >
      <ShieldX size={17} className="mt-0.5 shrink-0" aria-hidden />
      <p className="min-w-0"><span className="font-semibold">{titre}</span> <span className="text-ink-2">{texte}</span></p>
    </motion.div>
  );
}

export function SqueletteTuiles({ n = 4, className }: { n?: number; className?: string }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", n >= 5 ? "lg:grid-cols-5" : "lg:grid-cols-4", className)}>
      {Array.from({ length: n }, (_, i) => <Squelette key={i} className="h-[108px] rounded-lg" />)}
    </div>
  );
}

export function SqueletteLignes({ n = 6, className }: { n?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-busy="true" aria-label="Chargement">
      {Array.from({ length: n }, (_, i) => <Squelette key={i} className="h-9" />)}
    </div>
  );
}

/* ------------------------------------------------------------------ Feuille modale */

/** Modale : feuille basse sur mobile, centrée à partir de sm ; Échap et voile ferment. */
export function Feuille({ ouvert, onFermer, titre, description, icone: Icone, children, pied }: {
  ouvert: boolean; onFermer: () => void; titre: ReactNode; description?: ReactNode; icone?: LucideIcon; children?: ReactNode; pied?: ReactNode;
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
            className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line/70 bg-surface shadow-pop sm:max-w-lg sm:rounded-2xl"
          >
            <div className="flex items-start gap-3 border-b border-line/60 px-5 pb-4 pt-5">
              {Icone && <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-soft text-accent-ink"><Icone size={19} aria-hidden /></span>}
              <div className="min-w-0 flex-1">
                <h2 id={`${id}-t`} className="text-[17px] font-bold leading-snug text-ink">{titre}</h2>
                {description && <p className="mt-1 text-[13.5px] text-ink-2">{description}</p>}
              </div>
              <button type="button" onClick={onFermer} className="-mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink" aria-label="Fermer"><X size={17} aria-hidden /></button>
            </div>
            {children && <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>}
            {pied && <div className="flex flex-col-reverse gap-2 border-t border-line/60 bg-surface-2/40 px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">{pied}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
