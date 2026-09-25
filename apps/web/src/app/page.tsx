"use client";

import { ArrowRight, BadgeCheck, LogIn } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { EASE, motion } from "@/components/motion";
import { BandeNationale, Logo } from "@/components/ui/primitives";
import { accueilPour, useSessionServeur } from "@/lib/session";
import { useThemeEspace } from "@/lib/useSombre";

/** Accueil public : un message, deux actions. */
export default function Accueil() {
  useThemeEspace(false);
  const { data: session } = useSessionServeur();
  const monEspace = session ? accueilPour(session.profil.habilitations.map((h) => h.role)) : null;

  return (
    <main className="relative isolate flex min-h-screen flex-col overflow-hidden bg-navy-deep text-white">
      <motion.div className="absolute inset-0 -z-10" initial={{ scale: 1.08 }} animate={{ scale: 1 }} transition={{ duration: 2.4, ease: EASE }}>
        <Image src="/images/accueil-eleves-secondaire.jpg" alt="" fill priority sizes="100vw" className="object-cover object-[center_35%]" />
      </motion.div>
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,rgb(7_39_71/0.95)_0%,rgb(10_55_100/0.84)_50%,rgb(10_55_100/0.45)_100%)]" aria-hidden />

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-5 pt-6 sm:px-8">
        <span className="rounded-lg bg-white/95 px-2.5 py-2 shadow-float sm:px-3"><Logo compact className="sm:hidden" /><Logo className="hidden sm:flex" /></span>
        <Link href={monEspace ?? "/connexion"} className="inline-flex h-10 items-center gap-2 rounded-md bg-white/10 px-4 text-[13.5px] font-semibold text-white ring-1 ring-white/25 backdrop-blur transition hover:bg-white/20">
          <LogIn size={16} aria-hidden /> {monEspace ? "Mon espace" : "Connexion"}
        </Link>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 items-center px-5 py-16 sm:px-8">
        <div className="max-w-xl">
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.6, ease: EASE }} className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
            République du Bénin · Plateforme nationale de l'éducation
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.7, ease: EASE }} className="mt-4 text-[38px] font-extrabold leading-[1.06] sm:text-[56px]">
            Chaque parcours suivi.<br />Chaque décision éclairée.
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.33, duration: 0.6, ease: EASE }} className="mt-5 max-w-md text-[16px] leading-relaxed text-white/80 sm:text-[17px]">
            Élèves, familles, enseignants, établissements et administration : un seul registre, un espace pour chacun.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.6, ease: EASE }} className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href={monEspace ?? "/connexion"} className="group inline-flex h-12 items-center justify-center gap-2 rounded-md bg-white px-6 text-[15px] font-semibold text-navy shadow-pop transition hover:-translate-y-0.5">
              {monEspace ? "Ouvrir mon espace" : "Se connecter"} <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <Link href="/verifier" className="inline-flex h-12 items-center justify-center gap-2 rounded-md px-6 text-[15px] font-semibold text-white ring-1 ring-white/40 transition hover:bg-white/10">
              <BadgeCheck size={17} aria-hidden /> Vérifier un diplôme
            </Link>
          </motion.div>
        </div>
      </div>

      <footer className="px-5 pb-5 text-center text-[12px] text-white/55 sm:px-8">Accès réservé aux personnes habilitées · Chaque accès est journalisé</footer>
      <BandeNationale className="h-[5px]" />
    </main>
  );
}
