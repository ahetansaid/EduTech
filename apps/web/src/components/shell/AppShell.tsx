"use client";

import { BadgeCheck, ChevronRight, Command, Menu, Moon, PanelLeftClose, PanelLeftOpen, Search, Sun, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { BandeNationale, Logo } from "@/components/ui/primitives";
import { AnimatePresence, IndicateurActif } from "@/components/motion";
import { cn } from "@/lib/cn";
import { useSombre, useThemeEspace } from "@/lib/useSombre";
import { NAVIGATION, navigationPour } from "@/lib/navigation";
import { accueilPour, useProfil } from "@/lib/session";
import { useTitre } from "@/lib/titre";
import { Cloche } from "./Cloche";
import { EtatReseau } from "./EtatReseau";
import { GardeSession } from "./GardeSession";
import { MenuUtilisateur } from "./MenuUtilisateur";
import { PaletteCommandes } from "./PaletteCommandes";

function useTheme() {
  const sombre = useSombre();
  const basculer = () => {
    const d = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", d);
    try { localStorage.setItem("beile-theme", d ? "dark" : "light"); } catch { /* stockage indisponible */ }
  };
  return { sombre, basculer };
}

/**
 * Enveloppe des espaces « pilotage » (cockpit, console territoriale : sombres, pleine largeur, rail d'icônes)
 * et « gestion » (établissement, conformité, plateforme : barre latérale complète, style back-office).
 * Les espaces personnels (apprenant, famille, enseignant) ont leur propre enveloppe : EspacePersonnel.
 */
export function AppShell({ children, variante = "gestion" }: { children: ReactNode; variante?: "pilotage" | "gestion" }) {
  const rail = variante === "pilotage";
  useThemeEspace(rail);
  return <GardeSession><Enveloppe rail={rail} variante={variante}>{children}</Enveloppe></GardeSession>;
}

const CLE_RAIL = (variante: string) => `beile.rail.${variante}.replie`;
const EVT_RAIL = "beile:rail";
const abonnerRail = (f: () => void) => {
  window.addEventListener(EVT_RAIL, f);
  window.addEventListener("storage", f);
  return () => { window.removeEventListener(EVT_RAIL, f); window.removeEventListener("storage", f); };
};
const lireRail = (variante: string): boolean | null => {
  try { const v = localStorage.getItem(CLE_RAIL(variante)); return v === null ? null : v === "1"; } catch { return null; }
};

function Enveloppe({ children, rail: railParDefaut, variante }: { children: ReactNode; rail: boolean; variante: string }) {
  const pathname = usePathname();
  const profil = useProfil();
  // Rail flottant repliable (disposition de l'intranet) ; préférence mémorisée par espace.
  const preference = useSyncExternalStore(abonnerRail, () => lireRail(variante), () => null);
  const replie = preference ?? railParDefaut;
  const basculerRail = () => {
    try { localStorage.setItem(CLE_RAIL(variante), replie ? "0" : "1"); } catch { /* stockage indisponible */ }
    window.dispatchEvent(new Event(EVT_RAIL));
  };
  // Le tiroir mobile est lié à la page où il a été ouvert : il se referme de lui-même à la navigation.
  const [mobileSur, setMobileSur] = useState<string | null>(null);
  const mobile = mobileSur === pathname;
  const setMobile = (o: boolean) => setMobileSur(o ? pathname : null);
  const [palette, setPalette] = useState(false);
  const { sombre, basculer } = useTheme();

  const rolesProfil = profil.habilitations.map((h) => h.role);
  const nav = navigationPour(rolesProfil);
  const groupes = [...new Set(nav.map((n) => n.groupe))];
  const courant = [...nav].sort((a, b) => b.href.length - a.href.length).find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
  // Garde d'espace (cosmétique) : l'entrée de navigation la plus spécifique fixe les rôles admis.
  const entree = [...NAVIGATION].sort((a, b) => b.href.length - a.href.length).find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
  const autorise = !entree || entree.roles.some((r) => rolesProfil.includes(r));
  useTitre(courant?.libelle ?? entree?.libelle ?? "Mon espace");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const navigation = (rail: boolean) => (
    <nav className={cn("flex-1 overflow-y-auto py-2", rail ? "space-y-3 px-2" : "space-y-5 px-3")} aria-label="Navigation principale">
      {groupes.map((g) => (
        <div key={g}>
          {rail ? <div className="mx-auto mb-2 h-px w-8 bg-line/70" aria-hidden /> : <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{g}</p>}
          <div className="space-y-0.5">
            {nav.filter((n) => n.groupe === g).map((n) => {
              const actif = courant?.href === n.href;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={actif ? "page" : undefined}
                  title={rail ? n.libelle : undefined}
                  aria-label={rail ? n.libelle : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-xl text-sm font-medium transition-colors duration-200",
                    rail ? "mx-auto h-11 w-11 justify-center" : "px-3 py-2",
                    actif ? "text-accent-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  {actif && <IndicateurActif id={`nav-${variante}-${rail ? "r" : "l"}`} className="absolute inset-0 -z-0 rounded-xl bg-blue-soft" />}
                  {actif && !rail && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-blue" aria-hidden />}
                  <n.icone size={18} aria-hidden className={cn("relative transition-transform duration-200 group-hover:scale-110", actif ? "" : "text-ink-muted group-hover:text-ink")} />
                  {!rail && <span className="relative flex-1 truncate">{n.libelle}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  const barreLaterale = (rail: boolean, repliable: boolean) => (
    <>
      <div className={cn("flex h-16 shrink-0 items-center", rail ? "justify-center" : "px-4")}>
        <Link href="/" aria-label="Accueil BEILE"><Logo compact={rail} /></Link>
      </div>
      {navigation(rail)}
      <div className={cn("space-y-1 border-t border-line/60", rail ? "p-2" : "p-3")}>
        <MenuUtilisateur compact={rail} />
        {!rail && (
          <Link href="/verifier" className="flex items-center gap-2 rounded-xl px-3 py-2 text-[12.5px] text-ink-muted hover:bg-surface-2 hover:text-ink">
            <BadgeCheck size={14} aria-hidden /> Vérification publique d'un diplôme
          </Link>
        )}
        {repliable && (
          <button onClick={basculerRail} className={cn("flex w-full items-center gap-2 rounded-xl py-2 text-[12.5px] text-ink-muted hover:bg-surface-2 hover:text-ink", rail ? "justify-center" : "px-3")} aria-label={rail ? "Déplier la navigation" : "Replier la navigation"} title={rail ? "Déplier la navigation" : undefined}>
            {rail ? <PanelLeftOpen size={16} aria-hidden /> : <><PanelLeftClose size={16} aria-hidden /> Replier</>}
          </button>
        )}
      </div>
    </>
  );

  return (
    <div className="min-h-screen">
      <BandeNationale className="fixed inset-x-0 top-0 z-40 h-[3px]" />
      <aside className={cn("fixed bottom-3 left-3 top-[calc(3px+0.75rem)] z-30 hidden flex-col overflow-hidden rounded-2xl border border-line/70 bg-surface shadow-pop transition-[width] duration-200 lg:flex", replie ? "w-[4.5rem]" : "w-64")}>{barreLaterale(replie, true)}</aside>

      {mobile && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-navy-deep/40 backdrop-blur-sm" onClick={() => setMobile(false)} />
          <aside className="absolute inset-y-2 left-2 flex w-72 max-w-[calc(100vw-1rem)] animate-slide-up flex-col overflow-hidden rounded-2xl bg-surface shadow-pop">
            <button onClick={() => setMobile(false)} className="absolute right-3 top-4 flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2" aria-label="Fermer le menu"><X size={18} /></button>
            {barreLaterale(false, false)}
          </aside>
        </div>
      )}

      <div className={cn("flex min-h-screen min-w-0 flex-col transition-[padding] duration-200", replie ? "lg:pl-[6rem]" : "lg:pl-[17.5rem]")}>
        <header className="sticky top-2 z-20 mx-2 mt-2 flex h-14 items-center gap-2 rounded-2xl border border-line/70 bg-surface/75 px-2.5 shadow-float backdrop-blur-xl sm:top-3 sm:mx-3 sm:mt-3 sm:h-16 sm:px-4">
          <button onClick={() => setMobile(true)} className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 lg:hidden" aria-label="Ouvrir le menu"><Menu size={19} /></button>
          <nav aria-label="Fil d'Ariane" className="hidden min-w-0 items-center gap-1.5 text-sm sm:flex">
            <span className="text-ink-muted">{profil.fonction.split("·")[0]?.trim()}</span>
            <ChevronRight size={15} className="text-ink-muted" aria-hidden />
            <span className="truncate rounded-lg bg-surface-2/70 px-2.5 py-1 font-semibold text-ink">{courant?.libelle ?? "Espace"}</span>
          </nav>
          <div className="flex-1" />
          <button onClick={() => setPalette(true)} className="hidden items-center gap-2 rounded-2xl border border-line/70 bg-surface-2/60 px-3 py-1.5 text-sm text-ink-muted transition-colors hover:text-ink md:flex">
            <Search size={15} aria-hidden /> Rechercher, poser une question…
            <kbd className="ml-3 inline-flex items-center gap-0.5 rounded-[6px] border border-line bg-surface px-1.5 py-0.5 text-[10px] font-medium"><Command size={10} />K</kbd>
          </button>
          <button onClick={() => setPalette(true)} className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 md:hidden" aria-label="Rechercher"><Search size={18} /></button>

          <EtatReseau />
          <div className="flex items-center gap-0.5 rounded-2xl border border-line/70 bg-surface-2/40 px-1 py-0.5">
            <Cloche />
            <button onClick={basculer} className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-muted hover:bg-surface-2" aria-label={sombre ? "Passer en thème clair" : "Passer en thème sombre"}>
              {sombre ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>

        <main className="flex-1">
          <div className={cn("mx-auto w-full min-w-0 px-4 py-6 sm:px-6 sm:py-8", variante === "pilotage" ? "max-w-[1680px]" : "max-w-[1400px]")}>
            {autorise ? children : <AccesEspaceRefuse />}
          </div>
        </main>
        <footer className="mt-8">
          <BandeNationale className="h-[5px]" />
          <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 text-[12px] text-ink-muted">
            <span>BEILE · Système national interopérable de parcours et d'intelligence éducatifs</span>
            <span>Accès journalisé · données protégées</span>
          </div>
        </footer>
      </div>
      <AnimatePresence>{palette && <PaletteCommandes key="palette" onFermer={() => setPalette(false)} />}</AnimatePresence>
    </div>
  );
}

function AccesEspaceRefuse() {
  const profil = useProfil();
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-line/70 bg-surface p-8 text-center shadow-float">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-critical">Espace non autorisé</p>
      <h1 className="mt-2 text-xl font-bold">Cet espace ne correspond à aucune de vos habilitations</h1>
      <p className="mt-2 text-sm text-ink-2">Connecté en tant que {profil.nomAffiche} — {profil.fonction}. Si vous pensez devoir y accéder, adressez-vous à l'administrateur de la plateforme.</p>
      <Link href={accueilPour(profil.habilitations.map((h) => h.role))} className="mt-5 inline-flex h-10 items-center rounded-md bg-navy px-4 text-sm font-medium text-white">Retour à mon espace</Link>
    </div>
  );
}
