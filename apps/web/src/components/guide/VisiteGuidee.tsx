"use client";

import { ArrowLeft, ArrowRight, BookOpen, Check, CircleHelp, Lightbulb, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ClavierReact } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, EASE, motion } from "@/components/motion";
import { useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { etapesPour, guideAutomatique, guideParId, guidePourEcran, guideVu, marquerGuideVu, type EtapeGuide, type Guide } from "@/lib/guides";
import { useSession } from "@/lib/session";

/**
 * Visite guidée animée : un voile sombre découpé autour de l'élément expliqué (la découpe glisse
 * d'une étape à l'autre), une bulle positionnée pour rester dans l'écran (feuille basse sur téléphone),
 * progression, Précédent / Suivant / Passer, clavier (← → Échap) et focus piégé dans la bulle.
 *
 * L'état vit hors de React (magasin de module) : la visite survit au changement d'enveloppe
 * (pilotage ↔ gestion) et peut être lancée depuis le centre d'aide, avant même l'ouverture de l'espace.
 */

/* ------------------------------------------------------------------ Magasin de la visite */

type EtatVisite = { guideId: string; index: number; sens: 1 | -1 } | null;
let etatCourant: EtatVisite = null;
const abonnes = new Set<() => void>();
const definir = (e: EtatVisite) => { etatCourant = e; abonnes.forEach((f) => f()); };
const abonner = (f: () => void) => { abonnes.add(f); return () => { abonnes.delete(f); }; };
const useEtatVisite = () => useSyncExternalStore(abonner, () => etatCourant, () => null);

/** Lance une visite (bouton « Guide », centre d'aide). L'écran de départ s'ouvre de lui-même. */
export function lancerVisite(guideId: string) {
  definir({ guideId, index: 0, sens: 1 });
}

/* ------------------------------------------------------------------ Outils DOM */

const MOBILE = 640;
const MARGE = 12;

function selecteurs(e: EtapeGuide): string[] {
  const cibles = e.cible ? (Array.isArray(e.cible) ? e.cible : [e.cible]) : [];
  return [...cibles.map((c) => `[data-guide="${c}"]`), ...(e.selecteur ? [e.selecteur] : [])];
}

/** Premier élément visible (taille non nulle) : gère les doublons téléphone / ordinateur. */
function premierVisible(sels: string[]): HTMLElement | null {
  for (const s of sels) {
    for (const el of document.querySelectorAll<HTMLElement>(s)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden") return el;
    }
  }
  return null;
}

/** L'élément est-il (ou est-il dans) un bloc fixe ? Faire défiler la page ne le déplacerait pas. */
function estFixe(el: HTMLElement | null): boolean {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (getComputedStyle(n).position === "fixed") return true;
  }
  return false;
}

/** Écran attendu pour une étape : le dernier « aller » qui la précède, sinon le départ du guide. */
function ecranAttendu(g: Guide, etapes: EtapeGuide[], i: number): string | null {
  for (let j = i; j >= 0; j--) if (etapes[j]?.aller) return etapes[j]!.aller!;
  return g.nature === "espace" ? g.depart : null;
}

function surEcran(attendu: string | null): boolean {
  if (!attendu) return true;
  if (attendu.startsWith("?")) {
    const voulu = new URLSearchParams(attendu);
    const actuel = new URLSearchParams(window.location.search);
    return [...voulu.entries()].every(([k, v]) => actuel.get(k) === v);
  }
  return window.location.pathname === attendu;
}

type Boite = { x: number; y: number; l: number; h: number };
const egales = (a: Boite | null, b: Boite | null) => !!a && !!b && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.l - b.l) < 0.5 && Math.abs(a.h - b.h) < 0.5;

function useFenetre() {
  const [f, setF] = useState({ l: 1280, h: 800 });
  useLayoutEffect(() => {
    const maj = () => setF({ l: window.innerWidth, h: window.innerHeight });
    maj();
    window.addEventListener("resize", maj);
    return () => window.removeEventListener("resize", maj);
  }, []);
  return f;
}

/* ------------------------------------------------------------------ Bouton « Guide » */

export function BoutonGuide({ className, libelle = true }: { className?: string; libelle?: boolean }) {
  const { profil } = useSession();
  const pathname = usePathname();
  const roles = profil.habilitations.map((h) => h.role);
  const lancer = () => {
    const g = guidePourEcran(pathname, roles);
    if (g) lancerVisite(g.id);
  };
  return (
    <button
      type="button"
      onClick={lancer}
      data-guide="bouton-guide"
      aria-label="Lancer la visite guidée de cet écran"
      title="Visite guidée"
      className={cn("flex h-9 items-center justify-center gap-1.5 rounded-xl text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink active:scale-[0.97]", libelle ? "px-2.5 text-[13px] font-medium" : "w-9", className)}
    >
      <CircleHelp size={18} aria-hidden />
      {libelle && <span className="hidden sm:inline">Guide</span>}
    </button>
  );
}

/* ------------------------------------------------------------------ Visite */

export function VisiteGuidee() {
  const { profil, compte } = useSession();
  const roles = useMemo(() => profil.habilitations.map((h) => h.role), [profil]);
  const pathname = usePathname();
  const etat = useEtatVisite();

  // Démarrage automatique : première arrivée sur l'écran de départ d'un espace (ou sur un écran guidé).
  useEffect(() => {
    if (etat) return;
    const g = guideAutomatique(pathname, roles);
    if (!g || guideVu(compte.identifiant, g.id)) return;
    const t = setTimeout(() => {
      if (etatCourant) return;
      marquerGuideVu(compte.identifiant, g.id);
      lancerVisite(g.id);
    }, 900);
    return () => clearTimeout(t);
  }, [pathname, roles, compte.identifiant, etat]);

  const guide = etat ? guideParId(etat.guideId) : undefined;
  const etapes = useMemo(() => (guide ? etapesPour(guide, roles) : []), [guide, roles]);
  const valide = !!etat && !!guide && guide.roles.some((r) => roles.includes(r)) && etat.index >= 0 && etat.index < etapes.length;

  useEffect(() => {
    if (etat && !valide) definir(null);
  }, [etat, valide]);

  if (!valide || !etat || !guide || typeof document === "undefined") return null;
  const profilLien = guide.roles.find((r) => roles.includes(r)) ?? guide.profil;
  return createPortal(
    <Projecteur key={guide.id} guide={guide} etapes={etapes} index={etat.index} sens={etat.sens} identifiant={compte.identifiant} profilLien={profilLien} />,
    document.body,
  );
}

function Projecteur({ guide, etapes, index, sens, identifiant, profilLien }: { guide: Guide; etapes: EtapeGuide[]; index: number; sens: 1 | -1; identifiant: string; profilLien: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const reduit = !!useReducedMotion();
  const fenetre = useFenetre();
  const mobile = fenetre.l < MOBILE;
  const etape = etapes[index]!;
  const centree = selecteurs(etape).length === 0;
  const derniere = index === etapes.length - 1;

  const [cible, setCible] = useState<{ index: number; el: HTMLElement } | null>(null);
  const [boite, setBoite] = useState<Boite | null>(null);
  const [ouverture, setOuverture] = useState(false);
  const bulle = useRef<HTMLDivElement>(null);
  const boutonSuivant = useRef<HTMLButtonElement>(null);
  const [tailleBulle, setTailleBulle] = useState({ l: 360, h: 220 });
  const idTitre = useId();
  const idTexte = useId();
  const focusAvant = useRef<Element | null>(null);

  const terminer = useCallback(() => {
    marquerGuideVu(identifiant, guide.id);
    definir(null);
  }, [identifiant, guide.id]);
  const aller = useCallback((i: number, s: 1 | -1) => {
    if (i < 0) return;
    if (i >= etapes.length) { terminer(); return; }
    definir({ guideId: guide.id, index: i, sens: s });
  }, [etapes.length, guide.id, terminer]);
  const suivant = useCallback(() => aller(index + 1, 1), [aller, index]);
  const precedent = useCallback(() => aller(index - 1, -1), [aller, index]);

  // Focus : mémorisé à l'ouverture, rendu à la fermeture.
  useEffect(() => {
    focusAvant.current = document.activeElement;
    return () => { if (focusAvant.current instanceof HTMLElement) focusAvant.current.focus({ preventScroll: true }); };
  }, []);

  // Navigation vers l'écran de l'étape, puis recherche de la cible (les données arrivent parfois après l'écran).
  useEffect(() => {
    const attendu = ecranAttendu(guide, etapes, index);
    let navigue = false;
    if (!surEcran(attendu) && attendu) {
      navigue = true;
      if (attendu.startsWith("?")) router.replace(`${window.location.pathname}${attendu}`, { scroll: false });
      else router.push(attendu);
    }
    if (centree) return;

    const sels = selecteurs(etape);
    const limite = Date.now() + (navigue ? 15_000 : 4_000);
    let annule = false;
    let minuterie: ReturnType<typeof setTimeout> | undefined;
    const chercher = () => {
      if (annule) return;
      const el = surEcran(attendu) ? premierVisible(sels) : null;
      if (el) {
        setOuverture(false);
        cadrer(el, mobile, fenetre.h, tailleBulle.h, reduit);
        setCible({ index, el });
        return;
      }
      if (Date.now() > limite) {
        // Cible absente : l'étape est ignorée dans le sens du parcours (jamais avant la première).
        if (index + sens < 0) aller(index + 1, 1); else aller(index + sens, sens);
        return;
      }
      setOuverture(navigue);
      minuterie = setTimeout(chercher, 120);
    };
    chercher();
    return () => { annule = true; if (minuterie) clearTimeout(minuterie); };
    // La recherche ne se relance qu'au changement d'étape ou d'écran.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, guide.id, pathname]);

  const el = !centree && cible?.index === index ? cible.el : null;

  // Suivi continu de la cible (défilement, animations, données qui arrivent).
  useEffect(() => {
    if (!el) return;
    let raf = 0;
    let derniere: Boite | null = null;
    const tick = () => {
      if (!el.isConnected) { setCible(null); return; }
      const r = el.getBoundingClientRect();
      const b = { x: r.left, y: r.top, l: r.width, h: r.height };
      if (!egales(b, derniere)) { derniere = b; setBoite(b); }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [el]);

  // Cible disparue (rendu remplacé) : on la retrouve.
  useEffect(() => {
    if (centree || cible || ouverture) return;
    const t = setTimeout(() => {
      const nouvelle = premierVisible(selecteurs(etape));
      if (nouvelle) setCible({ index, el: nouvelle });
    }, 150);
    return () => clearTimeout(t);
  }, [cible, centree, etape, index, ouverture]);

  // Taille réelle de la bulle, pour la placer sans jamais sortir de l'écran.
  useLayoutEffect(() => {
    const b = bulle.current;
    if (!b) return;
    const ro = new ResizeObserver(() => setTailleBulle({ l: b.offsetWidth, h: b.offsetHeight }));
    ro.observe(b);
    return () => ro.disconnect();
  }, []);

  // Focus sur « Suivant » à chaque étape : « Entrée » fait avancer, Tab reste dans la bulle.
  useEffect(() => {
    (boutonSuivant.current ?? bulle.current)?.focus({ preventScroll: true });
  }, [index]);

  // Clavier : ← → pour naviguer, Échap pour quitter.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); terminer(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); suivant(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); precedent(); }
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [terminer, suivant, precedent]);

  const pieger = (e: ClavierReact<HTMLDivElement>) => {
    if (e.key !== "Tab" || !bulle.current) return;
    const f = [...bulle.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]")];
    if (!f.length) return;
    const premier = f[0]!, dernier = f[f.length - 1]!;
    if (e.shiftKey && (document.activeElement === premier || document.activeElement === bulle.current)) { e.preventDefault(); dernier.focus(); }
    else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
  };

  /* ---------------------------------------------------------------- Géométrie */

  const { l: vl, h: vh } = fenetre;
  const marge = mobile ? 6 : 8;
  // Entre deux étapes du même écran, la découpe reste sur l'ancienne cible jusqu'à trouver la nouvelle (glissement continu).
  const boiteAffichee = centree || ouverture ? null : boite;
  const trou = boiteAffichee
    ? (() => {
      const b = boiteAffichee;
      const x = Math.max(4, b.x - marge), y = Math.max(4, b.y - marge);
      const x2 = Math.min(vl - 4, b.x + b.l + marge), y2 = Math.min(vh - 4, b.y + b.h + marge);
      return { x, y, l: Math.max(0, x2 - x), h: Math.max(0, y2 - y) };
    })()
    : { x: vl / 2, y: vh / 2, l: 0, h: 0 };
  const visible = !!boiteAffichee && trou.l > 0 && trou.h > 0;

  const place = placerBulle({ trou: visible ? trou : null, bulle: tailleBulle, vl, vh, mobile });
  // Géométrie du projecteur : courbe sans dépassement (un ressort oscille au-delà de la cible et donnerait
  // des largeurs/hauteurs négatives, invalides en SVG, lorsque la découpe rétrécit fortement).
  const ressort = reduit ? { duration: 0 } : { duration: 0.45, ease: EASE };

  const pret = centree || (!!el && visible);
  const progression = ((index + 1) / etapes.length) * 100;

  return (
    <div className="fixed inset-0 z-[90]" aria-live="off">
      {/* Voile découpé */}
      <svg className="absolute inset-0 h-full w-full" width={vl} height={vh} aria-hidden>
        <defs>
          <mask id="beile-visite-masque">
            <rect x="0" y="0" width={vl} height={vh} fill="white" />
            <motion.rect initial={false} animate={{ x: trou.x, y: trou.y, width: trou.l, height: trou.h }} transition={ressort} rx={14} ry={14} fill="black" />
          </mask>
        </defs>
        <motion.rect x="0" y="0" width={vl} height={vh} className="fill-navy-deep dark:fill-black" mask="url(#beile-visite-masque)"
          initial={{ opacity: 0 }} animate={{ opacity: 0.58 }} transition={{ duration: reduit ? 0 : 0.3, ease: EASE }} />
        {visible && (
          <>
            <motion.rect initial={false} animate={{ x: trou.x, y: trou.y, width: trou.l, height: trou.h }} transition={ressort} rx={14} ry={14}
              fill="none" className="stroke-white dark:stroke-blue" strokeWidth={2} />
            {!reduit && (
              <motion.rect initial={false} animate={{ x: trou.x - 5, y: trou.y - 5, width: trou.l + 10, height: trou.h + 10, opacity: [0.55, 0, 0.55] }}
                transition={{ ...ressort, opacity: { duration: 2.2, repeat: Infinity, ease: "easeInOut" } }} rx={18} ry={18}
                fill="none" className="stroke-flag-yellow" strokeWidth={2} />
            )}
          </>
        )}
      </svg>

      {/* Écran en cours d'ouverture */}
      <AnimatePresence>
        {!pret && ouverture && (
          <motion.p key="ouverture" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-full bg-surface px-4 py-2.5 text-[13.5px] font-medium text-ink shadow-pop" role="status">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue border-t-transparent" aria-hidden /> Ouverture de l'écran…
          </motion.p>
        )}
      </AnimatePresence>

      {/* Bulle d'explication */}
      <motion.div
        ref={bulle}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitre}
        aria-describedby={idTexte}
        tabIndex={-1}
        onKeyDown={pieger}
        initial={mobile ? { y: 40, opacity: 0 } : { opacity: 0, scale: 0.96 }}
        animate={mobile
          ? { y: 0, opacity: pret ? 1 : 0, top: place.haut, left: 0 }
          : { opacity: pret ? 1 : 0, scale: pret ? 1 : 0.97, top: place.haut, left: place.gauche }}
        transition={reduit ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 34, opacity: { duration: 0.2 } }}
        style={{ width: mobile ? vl : Math.min(384, vl - 2 * MARGE), pointerEvents: pret ? "auto" : "none" }}
        className={cn(
          "absolute flex flex-col border-line/70 bg-surface text-ink shadow-pop outline-none",
          mobile ? cn("max-h-[62vh] border", place.cote === "haut-ecran" ? "rounded-b-2xl" : "rounded-t-2xl pb-[max(0.75rem,env(safe-area-inset-bottom))]") : "max-h-[calc(100vh-24px)] rounded-2xl border",
        )}
      >
        {!mobile && place.fleche && <Fleche cote={place.fleche.cote} decalage={place.fleche.decalage} />}
        {mobile && place.cote !== "haut-ecran" && <span className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line" aria-hidden />}

        {/* En-tête : guide et progression */}
        <div className="shrink-0 px-5 pt-4">
          <div className="flex items-center justify-between gap-3">
            <p className="flex min-w-0 items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
              <Lightbulb size={13} className="shrink-0 text-amber" aria-hidden />
              <span className="truncate">Visite guidée · {guide.titre}</span>
            </p>
            <button type="button" onClick={terminer} className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink" aria-label="Fermer la visite guidée">
              <X size={17} aria-hidden />
            </button>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={1} aria-valuemax={etapes.length} aria-valuenow={index + 1} aria-label="Progression de la visite">
              <motion.div className="h-full rounded-full bg-blue" initial={false} animate={{ width: `${progression}%` }} transition={reduit ? { duration: 0 } : { duration: 0.45, ease: EASE }} />
            </div>
            <span className="shrink-0 text-[12px] font-medium tabular-nums text-ink-muted">Étape {index + 1} sur {etapes.length}</span>
          </div>
        </div>

        {/* Contenu de l'étape */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-1 pt-3">
          <AnimatePresence mode="wait" initial={false} custom={sens}>
            <motion.div
              key={index}
              custom={sens}
              initial={reduit ? { opacity: 0 } : { opacity: 0, x: sens * 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduit ? { opacity: 0 } : { opacity: 0, x: sens * -14 }}
              transition={{ duration: reduit ? 0 : 0.22, ease: EASE }}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy font-display text-[13px] font-bold text-white dark:bg-blue dark:text-navy-deep" aria-hidden>{index + 1}</span>
                <h2 id={idTitre} className="min-w-0 pt-0.5 font-display text-[17px] font-bold leading-snug text-ink">{etape.titre}</h2>
              </div>
              <p id={idTexte} className="mt-2.5 text-[14px] leading-relaxed text-ink-2">{etape.texte}</p>
              {etape.pourquoi && (
                <p className="mt-3 rounded-lg border border-info/20 bg-info-bg/70 px-3 py-2.5 text-[13px] leading-relaxed text-ink-2">
                  <span className="font-semibold text-info">Pourquoi ? </span>{etape.pourquoi}
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Commandes */}
        <div className="shrink-0 px-5 pb-4 pt-3">
          <div className="flex items-center gap-2">
            {!derniere ? (
              <button type="button" onClick={terminer} className="h-10 rounded-md px-2 text-[13px] font-medium text-ink-muted hover:text-ink">Passer</button>
            ) : (
              <Link href={`/aide/${profilLien.replaceAll("_", "-")}`} onClick={terminer} className="inline-flex h-10 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-accent-ink hover:underline">
                <BookOpen size={15} aria-hidden /> Centre d'aide
              </Link>
            )}
            <div className="flex-1" />
            {index > 0 && <Button variante="secondaire" icone={ArrowLeft} onClick={precedent} aria-label="Étape précédente"><span className="hidden min-[380px]:inline">Précédent</span></Button>}
            <Button ref={boutonSuivant} onClick={suivant} icone={derniere ? Check : undefined}>
              {derniere ? "Terminer" : <>Suivant <ArrowRight size={16} aria-hidden /></>}
            </Button>
          </div>
          {!mobile && <p className="mt-2.5 text-[11.5px] text-ink-muted">Touches ← → pour naviguer · Échap pour quitter</p>}
        </div>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ Placement */

type Cote = "bas" | "haut" | "droite" | "gauche";

function placerBulle({ trou, bulle, vl, vh, mobile }: { trou: Boite | null; bulle: { l: number; h: number }; vl: number; vh: number; mobile: boolean }): {
  haut: number; gauche: number; cote?: "haut-ecran" | "bas-ecran"; fleche?: { cote: Cote; decalage: number };
} {
  if (mobile) {
    // Feuille basse ; en haut si la cible occupe le bas de l'écran (barre d'onglets, bouton de validation).
    const enBas = !!trou && trou.y + trou.h > vh - bulle.h - 8 && trou.y > bulle.h + 8;
    return enBas ? { haut: 0, gauche: 0, cote: "haut-ecran" } : { haut: vh - bulle.h, gauche: 0, cote: "bas-ecran" };
  }
  const l = Math.min(384, vl - 2 * MARGE);
  const h = bulle.h;
  const borne = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  if (!trou) return { haut: borne((vh - h) / 2, MARGE, vh - h - MARGE), gauche: (vl - l) / 2 };

  const ecart = 14;
  const cx = trou.x + trou.l / 2, cy = trou.y + trou.h / 2;
  const essais: { cote: Cote; ok: boolean; haut: number; gauche: number }[] = [
    { cote: "bas", ok: trou.y + trou.h + ecart + h <= vh - MARGE, haut: trou.y + trou.h + ecart, gauche: borne(cx - l / 2, MARGE, vl - l - MARGE) },
    { cote: "haut", ok: trou.y - ecart - h >= MARGE, haut: trou.y - ecart - h, gauche: borne(cx - l / 2, MARGE, vl - l - MARGE) },
    { cote: "droite", ok: trou.x + trou.l + ecart + l <= vl - MARGE, haut: borne(cy - h / 2, MARGE, vh - h - MARGE), gauche: trou.x + trou.l + ecart },
    { cote: "gauche", ok: trou.x - ecart - l >= MARGE, haut: borne(cy - h / 2, MARGE, vh - h - MARGE), gauche: trou.x - ecart - l },
  ];
  const choix = essais.find((e) => e.ok);
  if (!choix) {
    // Cible plus grande que l'écran : la bulle se pose dans le coin inférieur droit, par-dessus.
    return { haut: vh - h - MARGE - 8, gauche: vl - l - MARGE - 8 };
  }
  const decalage = choix.cote === "bas" || choix.cote === "haut" ? borne(cx - choix.gauche, 22, l - 22) : borne(cy - choix.haut, 22, h - 22);
  return { haut: choix.haut, gauche: choix.gauche, fleche: { cote: choix.cote, decalage } };
}

function Fleche({ cote, decalage }: { cote: Cote; decalage: number }) {
  const pos = {
    bas: { top: -6, left: decalage - 6 },
    haut: { bottom: -6, left: decalage - 6 },
    droite: { left: -6, top: decalage - 6 },
    gauche: { right: -6, top: decalage - 6 },
  }[cote];
  const bords = { bas: "border-l border-t", haut: "border-b border-r", droite: "border-b border-l", gauche: "border-r border-t" }[cote];
  return <span className={cn("pointer-events-none absolute h-3 w-3 rotate-45 border-line/70 bg-surface", bords)} style={pos} aria-hidden />;
}

/** Amène la cible dans la zone utile (sous l'en-tête, au-dessus de la feuille sur téléphone). */
function cadrer(el: HTMLElement, mobile: boolean, vh: number, hauteurBulle: number, reduit: boolean) {
  if (estFixe(el)) return;
  const r = el.getBoundingClientRect();
  const haut = mobile ? 72 : 96;
  const bas = mobile ? vh - Math.max(hauteurBulle, vh * 0.4) - 12 : vh - 24;
  if (r.top >= haut && r.bottom <= bas) return;
  const place = bas - haut;
  const cible = r.height > place ? window.scrollY + r.top - haut : window.scrollY + r.top - haut - (place - r.height) / 2;
  window.scrollTo({ top: Math.max(0, cible), behavior: reduit ? "auto" : "smooth" });
}
