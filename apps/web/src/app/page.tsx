"use client";

import { ArrowRight, BookOpenCheck, GraduationCap, Landmark, LogIn, Search, Users } from "lucide-react";
import Link from "next/link";
import { EASE, motion } from "@/components/motion";
import { BandeNationale } from "@/components/ui/primitives";
import { EnTetePublic, PiedPublic, useMonEspace } from "@/components/public/CadrePublic";
import { useThemeEspace } from "@/lib/useSombre";
import { SectionCalendrier, SectionChiffres, SectionEtablissements, SectionInscription, SectionResultats } from "@/components/public/SectionsAccueil";

/** Un espace pour chaque acteur, chacun avec son guide. */
const ESPACES = [
  { icone: Users, titre: "Familles et élèves", texte: "Notes, absences et diplômes, en direct.", guide: "/aide/parent" },
  { icone: GraduationCap, titre: "Enseignants", texte: "L'appel et les notes, même sans réseau.", guide: "/aide/enseignant" },
  { icone: BookOpenCheck, titre: "Établissements", texte: "Inscriptions, suivi et examens.", guide: "/aide/chef-etablissement" },
  { icone: Landmark, titre: "Pilotage", texte: "Décider sur des chiffres fiables.", guide: "/aide/administration-centrale" },
];

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

/** Accueil public : message, services ouverts à tous, espaces par acteur. */
export default function Accueil() {
  useThemeEspace(false);
  const monEspace = useMonEspace();

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-bg">
      <BandeNationale className="relative z-20 h-[4px]" />
      <div className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-blue-soft/70 blur-3xl" aria-hidden />

      <EnTetePublic transparent />

      <main className="relative mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[1.3fr_0.9fr] lg:gap-6 lg:py-16">
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
            <Link href="/etablissements" className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-navy px-7 text-[15px] font-semibold text-white shadow-pop transition hover:-translate-y-0.5 hover:bg-navy-deep">
              <Search size={17} aria-hidden /> Trouver un établissement
            </Link>
            <Link href={monEspace ?? "/connexion"} className="inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-[15px] font-semibold text-ink ring-1 ring-inset ring-line transition hover:bg-surface">
              <LogIn size={17} className="text-accent-ink" aria-hidden /> {monEspace ? "Ouvrir mon espace" : "Se connecter"}
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

      {/* Chaque service public, présenté par un aperçu vivant de sa page */}
      <SectionCalendrier />
      <SectionEtablissements />
      <SectionInscription />
      <SectionResultats />
      <SectionChiffres />

      {/* Un espace pour chaque acteur */}
      <section className="relative bg-navy">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
          <Titre surtitre="Espaces connectés" titre="Un espace pour chacun" clair />
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ESPACES.map((e, i) => (
              <motion.div key={e.titre} initial={{ y: 18 }} whileInView={{ y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ delay: i * 0.07, duration: 0.5, ease: EASE }}
                className="rounded-2xl bg-white/[0.06] p-5 ring-1 ring-inset ring-white/10">
                <e.icone size={22} className="text-flag-yellow" aria-hidden />
                <p className="mt-4 font-display text-[16px] font-bold text-white">{e.titre}</p>
                <p className="mt-1 text-[13.5px] text-white/70">{e.texte}</p>
                <Link href={e.guide} className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-white hover:underline">Voir le guide <ArrowRight size={14} aria-hidden /></Link>
              </motion.div>
            ))}
          </div>
          <Link href={monEspace ?? "/connexion"} className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[15px] font-semibold text-navy transition hover:-translate-y-0.5">
            <LogIn size={17} aria-hidden /> {monEspace ? "Ouvrir mon espace" : "Accéder à mon espace"}
          </Link>
        </div>
      </section>

      <PiedPublic />
    </div>
  );
}

function Titre({ surtitre, titre, clair = false }: { surtitre: string; titre: string; clair?: boolean }) {
  return (
    <motion.div initial={{ y: 12 }} whileInView={{ y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, ease: EASE }}>
      <p className={clair ? "text-[12px] font-semibold uppercase tracking-[0.16em] text-white/60" : "text-[12px] font-semibold uppercase tracking-[0.16em] text-accent-ink"}>{surtitre}</p>
      <h2 className={clair ? "mt-2 font-display text-[28px] font-extrabold tracking-tight text-white sm:text-[34px]" : "mt-2 font-display text-[28px] font-extrabold tracking-tight text-ink sm:text-[34px]"}>{titre}</h2>
    </motion.div>
  );
}
