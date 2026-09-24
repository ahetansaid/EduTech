"use client";

import {
  Bell, ChevronRight, CloudOff, Command, LogOut, Menu, Moon, RefreshCw, Search, Sun, Wifi, X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { BandeNationale, Logo } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { useSombre, useThemeEspace } from "@/lib/useSombre";
import { dateLongue } from "@/lib/format";
import { ACCUEIL_PROFIL, NAVIGATION, navigationPour } from "@/lib/navigation";
import { DATE_SIMULEE } from "@/lib/sim/micro";
import { useDemo, useHydratation, useProfil } from "@/lib/store";
import { PaletteCommandes } from "./PaletteCommandes";
import { SelecteurProfil } from "./SelecteurProfil";

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
  const pathname = usePathname();
  const router = useRouter();
  const profil = useProfil();
  const hydrate = useHydratation();
  const enLigne = useDemo((s) => s.enLigne);
  const fileAttente = useDemo((s) => s.fileAttente.length);
  const basculerConnexion = useDemo((s) => s.basculerConnexion);
  const notifications = useDemo((s) => s.notifications);
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
  const nonLues = profil.npi ? notifications.filter((n) => n.destinataireNpi === profil.npi && !n.lue).length : 0;
  // Garde d'espace (cosmétique) : l'entrée de navigation la plus spécifique fixe les rôles admis.
  const entree = [...NAVIGATION].sort((a, b) => b.href.length - a.href.length).find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
  const autorise = !entree || entree.roles.some((r) => rolesProfil.includes(r));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const navigation = (
    <nav className={cn("flex-1 overflow-y-auto py-2", rail ? "space-y-3 px-2" : "space-y-5 px-3")} aria-label="Navigation principale">
      {groupes.map((g) => (
        <div key={g}>
          {rail ? <div className="mx-auto mb-2 h-px w-8 bg-line/70" aria-hidden /> : <p className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{g}</p>}
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
                    "group flex items-center gap-3 rounded-md text-[13.5px] font-medium transition-colors",
                    rail ? "h-11 w-11 justify-center mx-auto" : "px-3 py-2",
                    actif ? "bg-navy text-white shadow-sm dark:bg-blue-soft dark:text-accent-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  <n.icone size={17} aria-hidden className={actif ? "" : "text-ink-muted group-hover:text-ink"} />
                  {!rail && <span className="flex-1 truncate">{n.libelle}</span>}
                  {!rail && n.processus && <span className={cn("text-[10px] font-semibold tabular", actif ? "text-white/70 dark:text-accent-ink/70" : "text-ink-muted/70")}>{n.processus}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  const barreLaterale = (
    <>
      <div className={cn("flex h-16 items-center", rail ? "justify-center" : "px-5")}>
        <Link href="/" aria-label="Accueil BEILE"><Logo compact={rail} /></Link>
      </div>
      {navigation}
      <div className={cn("border-t border-line/60", rail ? "p-2" : "p-3")}>
        <SelecteurProfil compact={rail} />
        {!rail && (
          <Link href="/verifier" className="mt-1 flex items-center gap-2 rounded-md px-3 py-2 text-[12.5px] text-ink-muted hover:bg-surface-2 hover:text-ink">
            <LogOut size={14} aria-hidden className="rotate-180" /> Vérification publique d'un diplôme
          </Link>
        )}
      </div>
    </>
  );

  return (
    <div className="min-h-screen">
      {/* Bandeau permanent : données de démonstration */}
      <div className="relative z-40 flex items-center justify-center gap-2 bg-warning-bg px-4 py-1.5 text-center text-[12px] font-medium text-warning">
        <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse-soft" aria-hidden />
        Prototype de démonstration — toutes les données sont fictives · Date simulée : {dateLongue(DATE_SIMULEE)}
      </div>

      <aside className={cn("fixed inset-y-0 left-0 top-[30px] z-30 hidden flex-col border-r border-line/60 bg-surface lg:flex", rail ? "w-[4.75rem]" : "w-[17rem]")}>{barreLaterale}</aside>

      {mobile && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-navy-deep/40 backdrop-blur-sm" onClick={() => setMobile(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 animate-slide-up flex-col bg-surface shadow-pop">
            <button onClick={() => setMobile(false)} className="absolute right-3 top-4 flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2" aria-label="Fermer le menu"><X size={18} /></button>
            {barreLaterale}
          </aside>
        </div>
      )}

      <div className={cn("flex min-h-[calc(100vh-30px)] flex-col", rail ? "lg:pl-[4.75rem]" : "lg:pl-[17rem]")}>
        <header className="sticky top-2 z-20 mx-2 mt-2 flex h-14 items-center gap-2 rounded-lg border border-line/70 bg-surface/80 px-2.5 shadow-float backdrop-blur-xl sm:mx-3 sm:mt-3 sm:h-16 sm:px-4">
          <button onClick={() => setMobile(true)} className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 lg:hidden" aria-label="Ouvrir le menu"><Menu size={19} /></button>
          <nav aria-label="Fil d'Ariane" className="hidden min-w-0 items-center gap-1.5 text-sm sm:flex">
            <span className="text-ink-muted">{profil.fonction.split("·")[0]?.trim()}</span>
            <ChevronRight size={15} className="text-ink-muted" aria-hidden />
            <span className="truncate rounded-sm bg-surface-2 px-2.5 py-1 font-semibold text-ink">{courant?.libelle ?? "Espace"}</span>
          </nav>
          <div className="flex-1" />
          <button onClick={() => setPalette(true)} className="hidden items-center gap-2 rounded-md border border-line/70 bg-surface-2/60 px-3 py-1.5 text-sm text-ink-muted transition-colors hover:text-ink md:flex">
            <Search size={15} aria-hidden /> Rechercher, poser une question…
            <kbd className="ml-3 inline-flex items-center gap-0.5 rounded-[6px] border border-line bg-surface px-1.5 py-0.5 text-[10px] font-medium"><Command size={10} />K</kbd>
          </button>
          <button onClick={() => setPalette(true)} className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 md:hidden" aria-label="Rechercher"><Search size={18} /></button>

          <button
            onClick={basculerConnexion}
            className={cn("flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors", enLigne ? "text-ink-muted hover:bg-surface-2" : "bg-warning-bg text-warning")}
            title={enLigne ? "Simuler une coupure de connexion" : "Rétablir la connexion et synchroniser"}
          >
            {enLigne ? <Wifi size={16} aria-hidden /> : <CloudOff size={16} aria-hidden />}
            <span className="hidden sm:inline">{enLigne ? "En ligne" : `Hors connexion · ${fileAttente} en attente`}</span>
            {!enLigne && <RefreshCw size={13} aria-hidden />}
          </button>

          {profil.npi && (
            <button onClick={() => router.push(profil.habilitations.some((h) => h.role === "parent") ? "/famille" : ACCUEIL_PROFIL[profil.id] ?? "/")} className="relative flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2" aria-label={`${nonLues} notifications non lues`}>
              <Bell size={18} aria-hidden />
              {nonLues > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[10px] font-bold text-white">{nonLues}</span>}
            </button>
          )}
          <button onClick={basculer} className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2" aria-label={sombre ? "Passer en thème clair" : "Passer en thème sombre"}>
            {sombre ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </header>

        <main className="flex-1">
          <div className={cn("mx-auto w-full px-4 py-6 sm:px-6 sm:py-8", rail ? "max-w-[1680px]" : "max-w-[1400px]")}>
            {!hydrate ? (
              <div className="space-y-4" aria-busy>
                <div className="h-8 w-72 animate-pulse rounded-md bg-surface-2" />
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-lg bg-surface-2" />)}</div>
              </div>
            ) : autorise ? children : <AccesEspaceRefuse />}
          </div>
        </main>
        <footer className="mt-8">
          <BandeNationale className="h-[5px]" />
          <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 text-[12px] text-ink-muted">
            <span>BEILE · Système national interopérable de parcours et d'intelligence éducatifs</span>
            <span>Prototype — données fictives · aucune donnée personnelle réelle</span>
          </div>
        </footer>
      </div>
      {palette && <PaletteCommandes onFermer={() => setPalette(false)} />}
    </div>
  );
}

function AccesEspaceRefuse() {
  const profil = useProfil();
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-line/70 bg-surface p-8 text-center shadow-float">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-critical">Espace non autorisé</p>
      <h1 className="mt-2 text-xl font-bold">Cet espace ne correspond à aucune de vos habilitations</h1>
      <p className="mt-2 text-sm text-ink-2">Profil actif : {profil.nomAffiche} — {profil.fonction}. Changez de profil pour accéder à cet espace.</p>
      <div className="mt-5 flex justify-center"><SelecteurProfil ouvertParDefaut /></div>
    </div>
  );
}
