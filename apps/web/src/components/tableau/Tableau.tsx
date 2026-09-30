"use client";

import { ArrowRight, CalendarDays, Check, Settings2, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence, EASE, motion } from "@/components/motion";
import { cn } from "@/lib/cn";
import { useCalendrier } from "@/lib/api/public";
import { CATEGORIES, enDate, jours, periode } from "@/lib/calendrier";

/**
 * Tableau de bord commun à tous les espaces : un bandeau d'accueil qui dit ce qui attend l'utilisateur,
 * puis une grille de widgets propre à son rôle. Un widget sans donnée disparaît au lieu d'afficher du vide ;
 * chacun peut masquer les widgets qui ne lui servent pas (préférence locale, jamais transmise).
 */

/* ------------------------------------------------------------------ Bandeau d'accueil */

export interface ATraiter { cle: string; libelle: string; href: string; ton?: "alerte" | "info" }

const sAbonnerRien = () => () => {};
const salutation = () => (new Date().getHours() >= 18 ? "Bonsoir" : "Bonjour");
const dateDuJour = () => new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date()).replace(/^./, (c) => c.toUpperCase());

export function BandeauAccueil({ prenom, contexte, aTraiter, chargement = false, actions, children }: {
  prenom?: string | null;
  /** Lieu ou fonction, affiché après la date (« CEG Les Rôniers », « Direction du Borgou »). */
  contexte?: string | null;
  aTraiter: ATraiter[];
  chargement?: boolean;
  actions?: ReactNode;
  /** Contenu libre sous les pastilles (chiffres clés compacts, par exemple). */
  children?: ReactNode;
}) {
  // La salutation et la date dépendent de l'horloge du navigateur : lues côté client seulement (pas d'écart d'hydratation).
  const client = useSyncExternalStore(sAbonnerRien, () => true, () => false);
  const moment = client ? { salut: salutation(), date: dateDuJour() } : null;
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}
      className="relative overflow-hidden rounded-2xl border border-line/70 bg-surface p-5 shadow-float sm:p-6" aria-label="Accueil">
      <div className="pointer-events-none absolute inset-0" aria-hidden style={{ backgroundImage:
        "radial-gradient(120% 120% at 0% 0%, var(--color-blue-soft) 0%, transparent 45%), radial-gradient(120% 120% at 100% 0%, color-mix(in srgb, var(--color-warning-bg) 70%, transparent) 0%, transparent 50%)" }} />
      <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-blue/10 blur-3xl" aria-hidden />
      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12.5px] font-medium text-ink-muted">{moment?.date ?? " "}{contexte ? ` · ${contexte}` : ""}</p>
            <h1 className="mt-1 font-display text-[24px] font-bold leading-tight tracking-tight text-ink sm:text-[28px]">
              {moment?.salut ?? "Bonjour"}{prenom ? ` ${prenom}` : ""}
            </h1>
          </div>
          {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2" aria-live="polite">
          {chargement ? (
            [0, 1, 2].map((i) => <span key={i} className="h-7 w-36 animate-pulse rounded-full bg-surface-2" />)
          ) : aTraiter.length ? (
            <>
              <span className="text-[12.5px] font-semibold text-ink-2">À traiter :</span>
              {aTraiter.map((t) => (
                <Link key={t.cle} href={t.href}
                  className={cn("inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-medium transition hover:brightness-95",
                    t.ton === "alerte" ? "bg-warning-bg text-warning" : "bg-blue-soft text-accent-ink")}>
                  {t.libelle}
                </Link>
              ))}
            </>
          ) : (
            <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-success-bg px-3 py-1 text-[13px] font-medium text-success">
              <Check size={14} aria-hidden /> Rien d&apos;urgent aujourd&apos;hui
            </span>
          )}
        </div>
        {children && <div className="mt-5">{children}</div>}
      </div>
    </motion.section>
  );
}

/* ------------------------------------------------------------------ Widget */

export function Widget({ titre, icone: Icone, lien, children, className, sansMarge = false }: {
  titre: string; icone?: LucideIcon; lien?: { href: string; libelle: string }; children: ReactNode; className?: string; sansMarge?: boolean;
}) {
  return (
    <section className={cn("min-w-0 rounded-2xl border border-line/70 bg-surface shadow-float", sansMarge ? "overflow-hidden" : "p-5", className)} aria-label={titre}>
      <div className={cn("flex items-center justify-between gap-3", sansMarge ? "px-5 pt-5" : "")}>
        <h2 className="flex min-w-0 items-center gap-2.5 text-[15px] font-semibold text-ink">
          {Icone && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-soft text-accent-ink"><Icone size={16} aria-hidden /></span>}
          <span className="truncate">{titre}</span>
        </h2>
        {lien && (
          <Link href={lien.href} className="group inline-flex shrink-0 items-center gap-1 text-[12.5px] font-semibold text-blue hover:underline">
            {lien.libelle} <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        )}
      </div>
      <div className={sansMarge ? "mt-4" : "mt-4"}>{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ Grille personnalisable */

export interface DefinitionWidget { id: string; libelle: string; colonne: "etroite" | "large"; noeud: ReactNode; fixe?: boolean }

const cleMasques = (espace: string) => `beile-tableau-${espace}`;
const EVT_MASQUES = "beile-tableau-masques";
/** Préférence locale lue comme une source externe : chaîne brute (stable), décodée à l'usage. */
const lireMasquesBruts = (espace: string) => { try { return localStorage.getItem(cleMasques(espace)) ?? "[]"; } catch { return "[]"; } };
const abonnerMasques = (rappel: () => void) => { window.addEventListener(EVT_MASQUES, rappel); window.addEventListener("storage", rappel); return () => { window.removeEventListener(EVT_MASQUES, rappel); window.removeEventListener("storage", rappel); }; };

/**
 * Deux colonnes (étroite 1/3, large 2/3) sur grand écran, une seule sur téléphone. `min-w-0` partout :
 * un tableau ou une carte trop large ne doit jamais provoquer de défilement horizontal de la page.
 */
export function GrilleWidgets({ espace, widgets }: { espace: string; widgets: DefinitionWidget[] }) {
  const brut = useSyncExternalStore(abonnerMasques, () => lireMasquesBruts(espace), () => "[]");
  const masques = new Set<string>((() => { try { return JSON.parse(brut) as string[]; } catch { return []; } })());
  const [reglage, setReglage] = useState(false);
  const basculer = (id: string) => {
    const s = new Set(masques);
    if (s.has(id)) s.delete(id); else s.add(id);
    try { localStorage.setItem(cleMasques(espace), JSON.stringify([...s])); } catch { /* stockage indisponible : le réglage ne tient pas */ }
    window.dispatchEvent(new Event(EVT_MASQUES));
  };
  const visibles = widgets.filter((w) => w.fixe || !masques.has(w.id));
  const colonne = (c: DefinitionWidget["colonne"]) => visibles.filter((w) => w.colonne === c);
  const masquables = widgets.filter((w) => !w.fixe);
  return (
    <div className="space-y-3">
      {masquables.length > 1 && (
        <div className="relative flex justify-end">
          <button type="button" onClick={() => setReglage((r) => !r)} aria-expanded={reglage}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium text-ink-muted transition hover:bg-surface-2 hover:text-ink">
            <Settings2 size={14} aria-hidden /> Personnaliser
          </button>
          <AnimatePresence>
            {reglage && (
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}
                className="absolute right-0 top-10 z-30 w-64 rounded-xl border border-line/70 bg-surface p-3 shadow-pop">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Widgets affichés</p>
                  <button type="button" onClick={() => setReglage(false)} className="rounded p-1 text-ink-muted hover:bg-surface-2" aria-label="Fermer"><X size={14} /></button>
                </div>
                {masquables.map((w) => (
                  <label key={w.id} className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-1.5 text-[13.5px] text-ink hover:bg-surface-2">
                    <input type="checkbox" checked={!masques.has(w.id)} onChange={() => basculer(w.id)} className="h-4 w-4 accent-[var(--color-blue)]" /> {w.libelle}
                  </label>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5">{colonne("etroite").map((w) => <div key={w.id} className="min-w-0">{w.noeud}</div>)}</div>
        <div className="min-w-0 space-y-5 lg:col-span-2">{colonne("large").map((w) => <div key={w.id} className="min-w-0">{w.noeud}</div>)}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Widget commun : échéances du calendrier officiel */

/** Prochaines échéances du calendrier scolaire publié (congés, examens, rentrée) : les mêmes pour tous. */
export function WidgetEcheances({ nombre = 4 }: { nombre?: number }) {
  const { data, isPending } = useCalendrier();
  const auj = data?.aujourdhui ?? "";
  const aVenir = (data?.evenements ?? []).filter((e) => e.categorie !== "trimestre" && e.fin >= auj).slice(0, nombre);
  if (!isPending && !aVenir.length) return null;
  return (
    <Widget titre="Prochaines échéances" icone={CalendarDays} lien={{ href: "/calendrier", libelle: "Calendrier" }}>
      {isPending ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-surface-2" />)}</div>
      ) : (
        <ul className="space-y-1.5">
          {aVenir.map((e) => {
            const d = enDate(e.debut), enCours = e.debut <= auj;
            return (
              <li key={e.id} className="flex min-w-0 items-center gap-3 rounded-xl px-1.5 py-1.5">
                <span className={cn("flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl", CATEGORIES[e.categorie].doux)}>
                  <span className="font-display text-[16px] font-extrabold leading-none">{d.getUTCDate()}</span>
                  <span className="text-[10px] font-semibold uppercase">{d.toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" }).replace(".", "")}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink">{e.titre}</span>
                  <span className="block truncate text-[12px] text-ink-muted">{periode(e)}</span>
                </span>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold tabular-nums", enCours ? "bg-success-bg text-success" : "bg-surface-2 text-ink-2")}>
                  {enCours ? "En cours" : `J-${jours(auj, e.debut)}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Widget>
  );
}
