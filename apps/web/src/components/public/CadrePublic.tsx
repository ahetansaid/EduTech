"use client";

import { LogIn, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AnimatePresence, EASE, motion } from "@/components/motion";
import { BandeNationale, Logo } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { accueilPour, useSessionServeur } from "@/lib/session";
import { useThemeEspace } from "@/lib/useSombre";

/** Navigation des services publics : ce que chacun peut faire sans compte. */
export const LIENS_PUBLICS = [
  { href: "/etablissements", libelle: "Établissements" },
  { href: "/inscription-scolaire", libelle: "Inscrire son enfant" },
  { href: "/calendrier", libelle: "Calendrier" },
  { href: "/donnees", libelle: "En chiffres" },
  { href: "/aide", libelle: "Aide" },
];

export function useMonEspace() {
  const { data: session } = useSessionServeur();
  return session ? accueilPour(session.profil.habilitations.map((h) => h.role)) : null;
}

/** En-tête des pages publiques : logo, services, accès à l'espace. Menu plein écran sur téléphone. */
export function EnTetePublic({ transparent = false }: { transparent?: boolean }) {
  const pathname = usePathname();
  const monEspace = useMonEspace();
  const [ouvert, setOuvert] = useState(false);
  return (
    <header className={cn("relative z-30", !transparent && "border-b border-line/60 bg-bg/85 backdrop-blur-xl")}>
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-5 sm:px-8">
        <Link href="/" aria-label="Accueil BEILE" className="shrink-0"><Logo compact className="sm:hidden" /><Logo className="hidden sm:flex" /></Link>
        <nav className="ml-6 hidden items-center gap-1 lg:flex" aria-label="Services publics">
          {LIENS_PUBLICS.map((l) => {
            const actif = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link key={l.href} href={l.href} aria-current={actif ? "page" : undefined}
                className={cn("rounded-full px-3.5 py-2 text-[13.5px] font-medium transition-colors", actif ? "bg-blue-soft text-accent-ink" : "text-ink-2 hover:bg-surface hover:text-ink")}>
                {l.libelle}
              </Link>
            );
          })}
        </nav>
        <div className="flex-1" />
        <Link href={monEspace ?? "/connexion"} className="inline-flex h-10 items-center gap-2 rounded-full bg-navy px-4 text-[13.5px] font-semibold text-white shadow-sm transition hover:bg-navy-deep">
          <LogIn size={16} aria-hidden /> {monEspace ? "Mon espace" : "Connexion"}
        </Link>
        <button onClick={() => setOuvert(true)} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2 hover:bg-surface lg:hidden" aria-label="Ouvrir le menu" aria-expanded={ouvert}>
          <Menu size={20} />
        </button>
      </div>
      <AnimatePresence>
        {ouvert && (
          <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-navy-deep/40 backdrop-blur-sm" onClick={() => setOuvert(false)} />
            <motion.nav
              initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }} transition={{ duration: 0.25, ease: EASE }}
              className="absolute inset-x-3 top-3 rounded-2xl bg-surface p-3 shadow-pop" aria-label="Services publics"
            >
              <div className="flex items-center justify-between px-2 pb-2">
                <Logo compact />
                <button onClick={() => setOuvert(false)} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-muted hover:bg-surface-2" aria-label="Fermer le menu"><X size={19} /></button>
              </div>
              {LIENS_PUBLICS.map((l) => (
                <Link key={l.href} href={l.href} onClick={() => setOuvert(false)} className="block rounded-xl px-4 py-3 text-[15px] font-medium text-ink hover:bg-surface-2">{l.libelle}</Link>
              ))}
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

export function PiedPublic() {
  return (
    <footer className="mt-auto border-t border-line/60 bg-surface">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-10 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-[13px] leading-relaxed text-ink-muted">Plateforme nationale des parcours éducatifs et du pilotage du système éducatif.</p>
        </div>
        <ColonnePied titre="Services" liens={[["/etablissements", "Trouver un établissement"], ["/inscription-scolaire", "Inscrire son enfant"], ["/calendrier", "Calendrier scolaire"], ["/donnees", "L'éducation en chiffres"]]} />
        <ColonnePied titre="S'informer" liens={[["/aide", "Centre d'aide"], ["/confidentialite", "Protection des données"]]} />
        <ColonnePied titre="Espaces" liens={[["/connexion", "Connexion"], ["/aide/enseignant", "Guide enseignant"], ["/aide/parent", "Guide famille"], ["/aide/chef-etablissement", "Guide établissement"]]} />
      </div>
      <div className="border-t border-line/60">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-5 py-4 text-[12px] text-ink-muted sm:px-8">
          <span>© République du Bénin · Ministères en charge de l'éducation</span>
          <span>Chaque accès aux données personnelles est journalisé</span>
        </div>
      </div>
      <BandeNationale className="h-[4px]" />
    </footer>
  );
}

function ColonnePied({ titre, liens }: { titre: string; liens: [string, string][] }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{titre}</p>
      <ul className="mt-3 space-y-2">
        {liens.map(([href, libelle]) => <li key={href}><Link href={href} className="text-[13.5px] text-ink-2 transition-colors hover:text-accent-ink">{libelle}</Link></li>)}
      </ul>
    </div>
  );
}

/** Mise en page d'une page publique : en-tête, titre de page animé, contenu, pied. */
export function PagePublique({ surtitre, titre, intro, children, large = false }: { surtitre: string; titre: ReactNode; intro?: ReactNode; children: ReactNode; large?: boolean }) {
  useThemeEspace(false);
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <BandeNationale className="h-[4px]" />
      <EnTetePublic />
      <main className={cn("mx-auto w-full flex-1 px-5 pb-16 pt-10 sm:px-8 sm:pt-14", large ? "max-w-6xl" : "max-w-4xl")}>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-accent-ink">{surtitre}</p>
          <h1 className="mt-2 font-display text-[30px] font-extrabold leading-tight tracking-tight text-ink sm:text-[40px]">{titre}</h1>
          {intro && <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-ink-2">{intro}</p>}
        </motion.div>
        <div className="mt-10">{children}</div>
      </main>
      <PiedPublic />
    </div>
  );
}
