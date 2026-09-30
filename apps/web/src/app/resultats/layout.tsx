import type { Metadata } from "next";
import Link from "next/link";
import { BandeNationale, Logo } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Résultats d'examens", description: "Consultation des résultats des examens nationaux du Bénin (CEP, BEPC, BAC) par numéro de table, en complément de la plateforme officielle eRESULTATS." };

/** Service public e-résultat : aucune connexion, le verdict d'une session publiée et rien de plus. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <BandeNationale className="h-[5px]" />
      <header className="border-b border-line/60 bg-surface">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <Link href="/" aria-label="Accueil BEILE"><Logo /></Link>
          <span className="hidden text-[12.5px] font-medium text-ink-muted sm:inline">Service public des résultats d&apos;examens nationaux</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">{children}</main>
      <footer className="border-t border-line/60 px-5 py-5 text-center text-[12px] text-ink-muted">Consultation gratuite, sans compte · Verdicts reçus des autorités d&apos;examen : DEC du MEMP (CEP), DEC du MESTFP (BEPC et BAC)</footer>
    </div>
  );
}
