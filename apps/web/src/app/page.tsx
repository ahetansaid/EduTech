"use client";

import { ArrowRight, BadgeCheck, LogIn } from "lucide-react";
import Link from "next/link";
import { EASE, motion } from "@/components/motion";
import { BandeNationale, Logo } from "@/components/ui/primitives";
import { accueilPour, useSessionServeur } from "@/lib/session";
import { useThemeEspace } from "@/lib/useSombre";

/**
 * Pilules diagonales qui découpent une même photographie. Chaque pilule est un tracé déjà incliné
 * (aucune transformation CSS : l'animation n'interfère pas avec l'inclinaison).
 */
const ANGLE = (38 * Math.PI) / 180;
const LARGEUR_PILULE = 96;
function pilule(cx: number, cy: number, longueur: number) {
  const r = LARGEUR_PILULE / 2, demi = longueur / 2 - r;
  const ux = Math.sin(ANGLE), uy = -Math.cos(ANGLE); // axe : vers le haut et la droite
  const nx = -uy, ny = ux; // perpendiculaire
  const ax = cx - ux * demi, ay = cy - uy * demi, bx = cx + ux * demi, by = cy + uy * demi;
  const f = (v: number) => v.toFixed(1);
  return `M${f(ax + nx * r)} ${f(ay + ny * r)}L${f(bx + nx * r)} ${f(by + ny * r)}A${r} ${r} 0 0 0 ${f(bx - nx * r)} ${f(by - ny * r)}L${f(ax - nx * r)} ${f(ay - ny * r)}A${r} ${r} 0 0 0 ${f(ax + nx * r)} ${f(ay + ny * r)}Z`;
}
/** Quatre pilules parallèles, décalées le long de la perpendiculaire (centre, longueur, décalage sur l'axe). */
const PILULES = [-1.5, -0.5, 0.5, 1.5].map((k, i) => {
  const pas = LARGEUR_PILULE + 14;
  const longueurs = [270, 380, 400, 290];
  const glisse = [30, -10, 20, -30];
  const cx = 260 + k * pas * Math.cos(ANGLE) + glisse[i]! * Math.sin(ANGLE);
  const cy = 280 + k * pas * Math.sin(ANGLE) - glisse[i]! * Math.cos(ANGLE);
  return { d: pilule(cx, cy, longueurs[i]!), delai: 0.15 + i * 0.1 };
});

/** Pastilles aux couleurs du drapeau, qui flottent doucement autour du collage. */
const PASTILLES = [
  { c: "bg-flag-green", t: "h-3.5 w-3.5", p: "left-[4%] top-[18%]", d: 0 },
  { c: "bg-flag-yellow", t: "h-5 w-5", p: "right-[6%] top-[8%]", d: 0.8 },
  { c: "bg-flag-red", t: "h-3 w-3", p: "right-[2%] top-[62%]", d: 1.6 },
  { c: "bg-blue", t: "h-2.5 w-2.5", p: "left-[14%] bottom-[10%]", d: 2.2 },
];

/** Accueil public : un message, deux actions, une image. */
export default function Accueil() {
  useThemeEspace(false);
  const { data: session } = useSessionServeur();
  const monEspace = session ? accueilPour(session.profil.habilitations.map((h) => h.role)) : null;

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-bg">
      <BandeNationale className="relative z-20 h-[4px]" />
      <div className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-blue-soft/70 blur-3xl" aria-hidden />

      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-5 pt-5 sm:px-8">
        <Link href="/" aria-label="Accueil BEILE"><Logo compact className="sm:hidden" /><Logo className="hidden sm:flex" /></Link>
        <Link href={monEspace ?? "/connexion"} className="inline-flex h-10 items-center gap-2 rounded-full bg-navy px-4 text-[13.5px] font-semibold text-white shadow-sm transition hover:bg-navy-deep">
          <LogIn size={16} aria-hidden /> {monEspace ? "Mon espace" : "Connexion"}
        </Link>
      </header>

      <main className="relative mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[1.3fr_0.9fr] lg:gap-6 lg:py-6">
        <div className="max-w-2xl">
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.6, ease: EASE }} className="text-[12px] font-semibold uppercase tracking-[0.18em] text-accent-ink">
            République du Bénin<span className="hidden sm:inline"> · Éducation nationale</span>
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.7, ease: EASE }} className="mt-4 font-display text-[38px] font-extrabold leading-[1.05] tracking-tight text-ink sm:text-[54px] lg:text-[42px] xl:text-[48px]">
            <span className="sm:whitespace-nowrap">Chaque parcours suivi.</span><br /><span className="sm:whitespace-nowrap">Chaque décision <span className="text-blue">éclairée.</span></span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.6, ease: EASE }} className="mt-5 max-w-md text-[16.5px] leading-relaxed text-ink-2">
            Élèves, familles, enseignants, établissements et administration : un seul registre, un espace pour chacun.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.6, ease: EASE }} className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href={monEspace ?? "/connexion"} className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-navy px-7 text-[15px] font-semibold text-white shadow-pop transition hover:-translate-y-0.5 hover:bg-navy-deep">
              {monEspace ? "Ouvrir mon espace" : "Se connecter"} <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <Link href="/verifier" className="inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-[15px] font-semibold text-ink ring-1 ring-inset ring-line transition hover:bg-surface">
              <BadgeCheck size={17} className="text-teal" aria-hidden /> Vérifier un diplôme
            </Link>
          </motion.div>
        </div>

        <div className="relative mx-auto w-full max-w-[340px] sm:max-w-[440px] lg:max-w-[520px]">
          {PASTILLES.map((p, i) => (
            <motion.span
              key={i}
              aria-hidden
              className={`absolute z-10 rounded-full ${p.c} ${p.t} ${p.p}`}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1, y: [0, -10, 0] }}
              transition={{ opacity: { delay: 0.6 + i * 0.1 }, scale: { delay: 0.6 + i * 0.1, type: "spring", stiffness: 300, damping: 14 }, y: { delay: p.d, duration: 5, repeat: Infinity, ease: "easeInOut" } }}
            />
          ))}
          <motion.svg
            viewBox="0 0 520 560" className="h-auto w-full" role="img" aria-label="Élèves béninois en classe"
            initial={{ opacity: 0, x: 40, y: 30 }} animate={{ opacity: 1, x: 0, y: 0 }} transition={{ delay: 0.15, duration: 1, ease: EASE }}
          >
            <defs>
              <clipPath id="pilules">
                {PILULES.map((p) => <path key={p.d} d={p.d} />)}
              </clipPath>
            </defs>
            <image href="/images/accueil-eleves-secondaire.jpg" x="-60" y="0" width="680" height="560" preserveAspectRatio="xMidYMid slice" clipPath="url(#pilules)" />
            {/* Liseré lumineux sur chaque pilule, révélé en cascade */}
            {PILULES.map((p) => (
              <motion.path key={`l${p.d}`} d={p.d} fill="none" stroke="white" strokeOpacity={0.35} strokeWidth={2}
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.5 + p.delai, duration: 1.2, ease: EASE }} />
            ))}
          </motion.svg>
        </div>
      </main>

      <footer className="relative mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-5 pb-5 text-[12px] text-ink-muted sm:px-8">
        <span>Accès réservé aux personnes habilitées · Chaque accès est journalisé</span>
        <span>© République du Bénin</span>
      </footer>
    </div>
  );
}
