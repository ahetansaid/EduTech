import Link from "next/link";
import { BandeNationale, Logo } from "@/components/ui/primitives";

/** Service public de vérification : aucune connexion, aucune donnée au-delà du strict nécessaire. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <BandeNationale className="h-[5px]" />
      <header className="border-b border-line/60 bg-surface">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <Link href="/" aria-label="Accueil BEILE"><Logo /></Link>
          <span className="hidden text-[12.5px] font-medium text-ink-muted sm:inline">Service public de vérification des diplômes</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-5 sm:py-10">{children}</main>
      <footer className="px-5 py-6 text-center text-[12px] text-ink-muted">Vérification sans compte · aucune donnée n'est conservée sur l'appareil qui vérifie</footer>
    </div>
  );
}
