"use client";

import type { Role } from "@beile/contracts";
import {
  Award, BadgeCheck, Bell, BookOpen, Building2, CalendarCheck, ChartNoAxesCombined, ChevronDown, ClipboardList, Compass, Database, FileText,
  GraduationCap, House, KeyRound, Landmark, LifeBuoy, LogIn, Map as IconeCarte, Network, PlayCircle, Route, ScrollText, Server, ShieldCheck,
  SlidersHorizontal, Sparkles, UserPlus, Users, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createElement, useId, useState, type ReactNode } from "react";
import { lancerVisite } from "@/components/guide/VisiteGuidee";
import { AnimatePresence, EASE, motion } from "@/components/motion";
import { BandeNationale, Logo } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import type { QuestionReponse, Tache } from "@/lib/aide";
import { guideParId, type Guide } from "@/lib/guides";
import { accueilPour, useSessionServeur } from "@/lib/session";

/* ------------------------------------------------------------------ Icônes */

const ICONES: Record<string, LucideIcon> = {
  chart: ChartNoAxesCombined, map: IconeCarte, sparkles: Sparkles, sliders: SlidersHorizontal, database: Database, landmark: Landmark,
  clipboard: ClipboardList, building: Building2, "user-plus": UserPlus, users: Users, award: Award, "calendar-check": CalendarCheck,
  graduation: GraduationCap, house: House, bell: Bell, file: FileText, route: Route, compass: Compass, shield: ShieldCheck,
  "shield-check": ShieldCheck, scroll: ScrollText, server: Server, key: KeyRound, network: Network, badge: BadgeCheck,
};
/** Pictogramme nommé (contenu du centre d'aide : données pures, sans composant). */
export function Pictogramme({ nom, size, className }: { nom: string; size: number; className?: string }) {
  return createElement(ICONES[nom] ?? BookOpen, { size, className, "aria-hidden": true });
}

/* ------------------------------------------------------------------ Enveloppe publique */

export function EnveloppeAide({ children }: { children: ReactNode }) {
  const { data: session } = useSessionServeur();
  const monEspace = session ? accueilPour(session.profil.habilitations.map((h) => h.role)) : null;
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <BandeNationale className="h-[4px]" />
      <header className="sticky top-0 z-30 border-b border-line/60 bg-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="Accueil BEILE" className="shrink-0"><Logo compact className="sm:hidden" /><Logo className="hidden sm:flex" /></Link>
          <nav className="flex min-w-0 items-center gap-1" aria-label="Centre d'aide">
            <Link href="/aide" className="inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-[13.5px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink">
              <BookOpen size={16} aria-hidden /> <span className="hidden sm:inline">Centre d'aide</span>
            </Link>
            <Link href={monEspace ?? "/connexion"} className="inline-flex h-10 items-center gap-2 rounded-full bg-navy px-4 text-[13.5px] font-semibold text-white shadow-sm transition hover:bg-navy-deep active:scale-[0.97] dark:bg-blue dark:text-navy-deep">
              <LogIn size={16} aria-hidden /> {monEspace ? "Mon espace" : "Connexion"}
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
      <footer className="border-t border-line/60">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-[12px] text-ink-muted sm:px-6">
          <span>BEILE · Centre d'aide · Ministère de l'Éducation du Bénin</span>
          <Link href="/verifier" className="inline-flex items-center gap-1.5 hover:text-ink"><BadgeCheck size={14} aria-hidden /> Vérifier un diplôme</Link>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ Apparition au défilement */

export function Apparition({ children, className, delai = 0 }: { children: ReactNode; className?: string; delai?: number }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.45, ease: EASE, delay: delai }}>
      {children}
    </motion.div>
  );
}

export function TitreSection({ id, surtitre, titre, texte, icone: Icone }: { id?: string; surtitre?: string; titre: string; texte?: string; icone?: LucideIcon }) {
  return (
    <div id={id} className="mb-4 scroll-mt-24">
      {surtitre && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{surtitre}</p>}
      <h2 className="flex items-center gap-2.5 font-display text-[21px] font-bold leading-tight text-ink sm:text-[23px]">
        {Icone && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-soft text-accent-ink"><Icone size={17} aria-hidden /></span>}
        {titre}
      </h2>
      {texte && <p className="mt-1.5 max-w-2xl text-[14.5px] text-ink-2">{texte}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ Tâche pas à pas */

/** Tâche dépliable : étapes numérotées reliées par un fil, avec le « pourquoi ». */
export function CarteTache({ tache, ouverteParDefaut = false, ancre }: { tache: Tache; ouverteParDefaut?: boolean; ancre?: string }) {
  const [ouverte, setOuverte] = useState(ouverteParDefaut);
  const id = useId();
  return (
    <div id={ancre} className="scroll-mt-24 overflow-hidden rounded-xl border border-line/70 bg-surface shadow-float">
      <button type="button" onClick={() => setOuverte((o) => !o)} aria-expanded={ouverte} aria-controls={id}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/60 sm:px-5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-soft text-[12px] font-bold text-accent-ink tabular-nums">{tache.etapes.length}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink">{tache.titre}</span>
          <span className="block text-xs text-ink-muted">{tache.etapes.length} étape{tache.etapes.length > 1 ? "s" : ""}</span>
        </span>
        <ChevronDown size={18} className={cn("shrink-0 text-ink-muted transition-transform duration-300", ouverte && "rotate-180")} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {ouverte && (
          <motion.div id={id} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: EASE }}>
            <div className="border-t border-line/60 px-4 pb-5 pt-4 sm:px-5">
              <ol className="relative space-y-3">
                {tache.etapes.map((e, i) => (
                  <motion.li key={i} className="relative flex gap-3" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 12) * 0.05, duration: 0.3, ease: EASE }}>
                    {i < tache.etapes.length - 1 && <span className="absolute left-[13px] top-7 h-[calc(100%-4px)] w-px bg-line" aria-hidden />}
                    <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy text-[12px] font-bold text-white dark:bg-blue dark:text-navy-deep">{i + 1}</span>
                    <p className="min-w-0 pt-1 text-[14px] leading-relaxed text-ink-2">{e}</p>
                  </motion.li>
                ))}
              </ol>
              {tache.pourquoi && (
                <p className="mt-4 rounded-lg border border-info/20 bg-info-bg/70 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-2">
                  <span className="font-semibold text-info">Pourquoi ? </span>{tache.pourquoi}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ Questions fréquentes */

export function Faq({ questions }: { questions: QuestionReponse[] }) {
  const [ouverte, setOuverte] = useState<number | null>(null);
  return (
    <div className="divide-y divide-line/60 overflow-hidden rounded-xl border border-line/70 bg-surface shadow-float">
      {questions.map((q, i) => (
        <div key={q.q}>
          <button type="button" onClick={() => setOuverte((o) => (o === i ? null : i))} aria-expanded={ouverte === i}
            className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left text-[14.5px] font-medium text-ink transition-colors hover:bg-surface-2/60 sm:px-5">
            <span className="min-w-0 flex-1">{q.q}</span>
            <ChevronDown size={17} className={cn("shrink-0 text-ink-muted transition-transform duration-300", ouverte === i && "rotate-180")} aria-hidden />
          </button>
          <AnimatePresence initial={false}>
            {ouverte === i && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: EASE }} className="overflow-hidden">
                <p className="px-4 pb-4 text-[14px] leading-relaxed text-ink-2 sm:px-5">{q.r}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Visite guidée depuis l'aide */

/** Visites qui peuvent être lancées d'ici : leur écran de départ est fixe et guidé. */
export function visitesLancables(ids: string[]): Guide[] {
  return ids.map(guideParId).filter((g): g is Guide => !!g && g.id !== "assistance" && (g.nature === "espace" || g.ecrans.test(g.depart)));
}

export function useRolesSession(): Role[] | null {
  const { data: session } = useSessionServeur();
  return session ? session.profil.habilitations.map((h) => h.role) : null;
}

export function BoutonVisite({ guide, variante = "primaire", className }: { guide: Guide; variante?: "primaire" | "secondaire"; className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => { lancerVisite(guide.id); router.push(guide.depart); }}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-[14px] font-semibold transition active:scale-[0.97]",
        variante === "primaire" ? "bg-navy text-white shadow-sm hover:bg-navy-deep dark:bg-blue dark:text-navy-deep" : "bg-surface text-ink ring-1 ring-inset ring-line hover:bg-surface-2",
        className,
      )}
    >
      <PlayCircle size={17} aria-hidden /> {variante === "primaire" ? "Lancer la visite guidée" : guide.titre}
    </button>
  );
}

/* ------------------------------------------------------------------ Schéma : un fait saisi une fois */

const NOEUDS = [
  { icone: CalendarCheck, titre: "L'enseignant fait l'appel", texte: "sur son téléphone, même sans réseau" },
  { icone: Database, titre: "Le registre national l'inscrit", texte: "une seule fois, daté, signé" },
];
const SORTIES = [
  { icone: Bell, titre: "La famille est prévenue" },
  { icone: Building2, titre: "La direction le voit" },
  { icone: Landmark, titre: "Le territoire le suit" },
  { icone: ChartNoAxesCombined, titre: "Le cockpit l'agrège" },
];

export function SchemaFlux() {
  return (
    <div className="rounded-xl border border-line/70 bg-surface p-4 shadow-float sm:p-6" role="img" aria-label="Un fait saisi une fois : l'appel de l'enseignant est inscrit au registre national, puis prévient la famille, informe la direction, le territoire et le cockpit, sans ressaisie.">
      <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr_auto_1.3fr]">
        {NOEUDS.map((n, i) => (
          <FragmentNoeud key={n.titre} i={i} icone={n.icone} titre={n.titre} texte={n.texte} />
        ))}
        <div className="grid grid-cols-2 gap-2">
          {SORTIES.map((s, i) => (
            <motion.div key={s.titre} initial={{ opacity: 0, scale: 0.92 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.9 + i * 0.12, duration: 0.35, ease: EASE }}
              className="flex min-h-16 flex-col items-start gap-1.5 rounded-lg bg-surface-2/70 p-2.5">
              <s.icone size={16} className="text-accent-ink" aria-hidden />
              <span className="text-[12.5px] font-medium leading-tight text-ink">{s.titre}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FragmentNoeud({ i, icone: Icone, titre, texte }: { i: number; icone: LucideIcon; titre: string; texte: string }) {
  return (
    <>
      <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.35, duration: 0.4, ease: EASE }}
        className="flex items-center gap-3 rounded-lg border border-line/70 bg-bg p-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-navy text-white dark:bg-blue dark:text-navy-deep"><Icone size={18} aria-hidden /></span>
        <span className="min-w-0">
          <span className="block text-[13.5px] font-semibold leading-tight text-ink">{titre}</span>
          <span className="block text-xs text-ink-muted">{texte}</span>
        </span>
      </motion.div>
      <Fleche delai={0.2 + i * 0.35} />
    </>
  );
}

function Fleche({ delai }: { delai: number }) {
  return (
    <div className="flex justify-center" aria-hidden>
      <svg viewBox="0 0 40 16" className="h-4 w-10 rotate-90 text-blue md:rotate-0">
        <motion.path d="M2 8 H34 M28 3 L35 8 L28 13" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ delay: delai, duration: 0.5, ease: EASE }} />
      </svg>
    </div>
  );
}

export const IconeAssistance = LifeBuoy;
