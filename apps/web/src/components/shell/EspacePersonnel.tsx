"use client";

import type { Role } from "@beile/contracts";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { BandeNationale, Logo } from "@/components/ui/primitives";
import { IndicateurActif } from "@/components/motion";
import { cn } from "@/lib/cn";
import { useThemeEspace } from "@/lib/useSombre";
import { accueilPour, useProfil } from "@/lib/session";
import { useTitre } from "@/lib/titre";
import { Cloche } from "./Cloche";
import { EtatReseau } from "./EtatReseau";
import { GardeSession } from "./GardeSession";
import { MenuUtilisateur } from "./MenuUtilisateur";

export interface Onglet { href: string; libelle: string; icone: LucideIcon }

/** Couleur propre à chaque espace : l'utilisateur sait d'un coup d'œil où il se trouve. */
const ACCENTS = {
  apprenant: { accent: "#0e6258", doux: "#e3f3ef", nom: "Mon espace apprenant" },
  famille: { accent: "#9a5b00", doux: "#fbf0dc", nom: "Espace famille" },
  enseignant: { accent: "#1567c4", doux: "#e9f3ff", nom: "Espace enseignant" },
} as const;

/**
 * Enveloppe des espaces personnels : pensée d'abord pour le téléphone, sans barre latérale,
 * onglets en bas d'écran sur mobile et en tête sur ordinateur. Lecture calme, une action par écran.
 */
type Proprietes = { espace: keyof typeof ACCENTS; onglets: Onglet[]; roles: Role[]; largeur?: "etroite" | "large"; children: ReactNode };

export function EspacePersonnel(props: Proprietes) {
  useThemeEspace(false);
  return <GardeSession><Enveloppe {...props} /></GardeSession>;
}

function Enveloppe({ espace, onglets, roles, largeur = "etroite", children }: Proprietes) {
  const pathname = usePathname();
  const profil = useProfil();
  const a = ACCENTS[espace];
  const autorise = profil.habilitations.some((h) => roles.includes(h.role));
  useTitre([...onglets].sort((x, y) => y.href.length - x.href.length).find((o) => pathname === o.href || pathname.startsWith(`${o.href}/`))?.libelle ?? a.nom);
  const actif = (href: string) => (href === onglets[0]?.href ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <div className="min-h-screen bg-bg" style={{ "--acc": a.accent, "--acc-doux": a.doux } as CSSProperties}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[linear-gradient(180deg,var(--acc-doux),transparent)] dark:opacity-10" aria-hidden />
      <BandeNationale className="relative z-40 h-[3px]" />

      <header className="sticky top-0 z-30 border-b border-line/50 bg-bg/80 backdrop-blur-xl">
        <div className={cn("mx-auto flex h-16 items-center gap-3 px-4", largeur === "large" ? "max-w-6xl" : "max-w-3xl")}>
          <Link href="/" aria-label="Accueil BEILE"><Logo compact /></Link>
          <div className="min-w-0 leading-tight">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--acc)" }}>{a.nom}</p>
            <p className="truncate text-[13px] text-ink-muted">{profil.nomAffiche}</p>
          </div>
          <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Sections de l'espace">
            {onglets.map((o) => (
              <Link
                key={o.href}
                href={o.href}
                aria-current={actif(o.href) ? "page" : undefined}
                className={cn("relative rounded-md px-3 py-1.5 text-[13.5px] font-medium transition-colors duration-200", actif(o.href) ? "text-white" : "text-ink-2 hover:bg-surface-2")}
              >
                {actif(o.href) && <IndicateurActif id={`onglet-${espace}`} className="absolute inset-0 rounded-md shadow-sm" style={{ background: "var(--acc)" }} />}
                <span className="relative">{o.libelle}</span>
              </Link>
            ))}
          </nav>
          <div className="flex-1" />
          <EtatReseau />
          <Cloche />
          <div className="w-auto"><MenuUtilisateur compact vers="bas" /></div>
        </div>
      </header>

      <main className={cn("relative mx-auto px-4 pb-28 pt-6 md:pb-12", largeur === "large" ? "max-w-6xl" : "max-w-3xl")}>
        {autorise ? children : (
          <div className="rounded-xl border border-line/70 bg-surface p-8 text-center shadow-float">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-critical">Espace non autorisé</p>
            <p className="mt-2 text-sm text-ink-2">Votre compte ({profil.nomAffiche}) n'a pas d'habilitation pour cet espace.</p>
            <Link href={accueilPour(profil.habilitations.map((h) => h.role))} className="mt-4 inline-flex h-10 items-center rounded-md bg-navy px-4 text-sm font-medium text-white">Retour à mon espace</Link>
          </div>
        )}
      </main>

      {/* Onglets en bas d'écran (téléphone) */}
      <nav className="fixed inset-x-3 bottom-3 z-30 flex items-center justify-around rounded-xl border border-line/70 bg-surface/90 p-1.5 shadow-pop backdrop-blur-xl md:hidden" aria-label="Sections de l'espace">
        {onglets.map((o) => (
          <Link key={o.href} href={o.href} aria-current={actif(o.href) ? "page" : undefined} className="relative flex flex-1 flex-col items-center gap-0.5 rounded-md py-1.5 text-[10.5px] font-medium" style={{ color: actif(o.href) ? "var(--acc)" : "var(--text-muted)" }}>
            {actif(o.href) && <IndicateurActif id={`onglet-mobile-${espace}`} className="absolute inset-0 rounded-md" style={{ background: "var(--acc-doux)" }} />}
            <o.icone size={20} aria-hidden className="relative" />
            <span className="relative">{o.libelle}</span>
          </Link>
        ))}
      </nav>
      <BandeNationale className="hidden md:grid" />
    </div>
  );
}
