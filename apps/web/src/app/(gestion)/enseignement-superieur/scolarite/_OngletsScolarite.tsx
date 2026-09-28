"use client";

import { BookOpen, GraduationCap, PlugZap, ScrollText, ShieldCheck, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

interface OngletScolarite {
  href: string;
  libelle: string;
  icone: LucideIcon;
  /** Ce que l'onglet donne à voir, en un mot — l'onglet se choisit sur ce qu'il répond, pas sur son nom. */
  porte: string;
}

const ONGLETS: OngletScolarite[] = [
  { href: "/enseignement-superieur/scolarite/referentiel", libelle: "Référentiel", icone: BookOpen, porte: "direction" },
  { href: "/enseignement-superieur/scolarite/etudiants", libelle: "Étudiants & parcours", icone: Users, porte: "direction" },
  { href: "/enseignement-superieur/scolarite/certification", libelle: "Jury & certification", icone: ScrollText, porte: "direction" },
  { href: "/enseignement-superieur/scolarite/pilotage", libelle: "Agrégats & actes de l'État", icone: ShieldCheck, porte: "pilotage" },
];

/**
 * Barre de volets de la scolarité du supérieur. Les onglets « direction » se lisent par la porte
 * d'établissement, l'onglet « pilotage » par le périmètre d'agrégats : les mélanger sur un même écran
 * ferait croire qu'un agent de l'État voit du nominatif.
 */
export function OngletsScolarite({ chef }: { chef: boolean }) {
  const pathname = usePathname();
  const visibles = ONGLETS.filter((o) => (o.porte === "direction" ? chef : !chef));
  return (
    <>
    {chef && (
      <p className="flex items-start gap-2 rounded-lg bg-info-bg px-3.5 py-2.5 text-[12.5px] text-info">
        <PlugZap size={15} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          <strong>Mode secours.</strong> Un établissement raccordé transmet ses inscriptions et ses procès-verbaux de délibération depuis son propre système de scolarité : BEILE les contrôle (homologation, crédits) et scelle les diplômes. Ces écrans servent à un établissement non encore raccordé.
        </span>
      </p>
    )}
    <nav aria-label="Volets de la scolarité du supérieur" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
      {visibles.map((o) => {
        const on = pathname === o.href || pathname.startsWith(`${o.href}/`);
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
      {!chef && (
        <Link href="/enseignement-superieur" className="inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[13.5px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink">
          <GraduationCap size={15} aria-hidden />
          Catalogue
        </Link>
      )}
    </nav>
    </>
  );
}
