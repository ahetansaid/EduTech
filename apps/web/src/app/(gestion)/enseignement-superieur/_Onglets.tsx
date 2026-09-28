"use client";

import { Briefcase, Building2, GraduationCap, Inbox, Layers, Stamp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

interface Onglet {
  href: string;
  libelle: string;
  icone: LucideIcon;
  /** La page « Filières » est racine : elle ne doit pas rester active sur ses sous-volets. */
  exact?: boolean;
}

const ONGLETS: Onglet[] = [
  { href: "/enseignement-superieur", libelle: "Filières", icone: GraduationCap, exact: true },
  { href: "/enseignement-superieur/ecoles-nationales", libelle: "Écoles & établissements", icone: Building2 },
  { href: "/enseignement-superieur/concours", libelle: "Concours", icone: Inbox },
  { href: "/enseignement-superieur/stages", libelle: "Stages", icone: Briefcase },
  { href: "/enseignement-superieur/formations-pro", libelle: "Formations professionnelles", icone: Layers },
  { href: "/enseignement-superieur/guichet", libelle: "Guichet & délais", icone: Stamp },
];

/** Barre de volets de la console « Enseignement supérieur » — navigation par routes, style back-office. */
export function OngletsESup() {
  const pathname = usePathname();
  const actif = (o: Onglet) => (o.exact ? pathname === o.href : pathname === o.href || pathname.startsWith(`${o.href}/`));
  return (
    <nav aria-label="Volets de l'enseignement supérieur" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
      {ONGLETS.map((o) => {
        const on = actif(o);
        return (
          <Link
            key={o.href}
            href={o.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors duration-200",
              on ? "bg-blue-soft text-accent-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}
          >
            <o.icone size={15} aria-hidden />
            {o.libelle}
          </Link>
        );
      })}
    </nav>
  );
}
