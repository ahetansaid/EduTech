"use client";

import { ArrowRight, BadgeCheck, Building2, ChartNoAxesCombined, Fingerprint, GitBranch, GraduationCap, Lock, LogIn, MapPinned, ScanLine, ShieldCheck, Sparkles, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { EASE, motion } from "@/components/motion";
import { BandeNationale, Logo } from "@/components/ui/primitives";
import { accueilPour, useSessionServeur } from "@/lib/session";
import { useThemeEspace } from "@/lib/useSombre";

const ESPACES = [
  { icone: ChartNoAxesCombined, titre: "Pilotage", texte: "Cockpit national, console départementale et d'inspection, requêtes contrôlées, planification.", publics: "Cabinet · Directions départementales · Inspection · Recherche" },
  { icone: Building2, titre: "Établissement", texte: "Tableau de bord du jour, inscriptions ancrées au registre national, examens et diplômes vérifiables.", publics: "Chefs d'établissement" },
  { icone: GraduationCap, titre: "Enseignement", texte: "Appel en quelques secondes, carnet de notes, corrections tracées, passeport professionnel.", publics: "Enseignants" },
  { icone: Users, titre: "Familles et apprenants", texte: "Suivi en temps réel, notifications, passeport éducatif et preuves partageables.", publics: "Parents · Apprenants" },
  { icone: ShieldCheck, titre: "Conformité et exploitation", texte: "Journal d'audit des accès et des refus, registre des traitements, qualité des données, comptes.", publics: "DPO · Administrateurs" },
];

const PREUVES = [
  { icone: GitBranch, titre: "Un fait, quatre restitutions", texte: "Une absence saisie une fois devient une notification, une ligne de suivi, un taux et une carte." },
  { icone: Fingerprint, titre: "Identité ancrée au registre national", texte: "Aucun identifiant maison. L'enfant sans acte est inscrit, signalé, régularisé — jamais exclu." },
  { icone: Lock, titre: "Rôle, périmètre, relation, finalité", texte: "Chaque accès est décidé sur quatre critères et journalisé, refus compris." },
  { icone: ScanLine, titre: "Diplôme vérifiable en quelques secondes", texte: "Un tiers vérifie une preuve sans compte ; une altération est détectée." },
  { icone: Sparkles, titre: "L'IA n'invente jamais un chiffre", texte: "Ask Education traduit la question ; le moteur calcule ; la source et la confiance sont affichées." },
  { icone: MapPinned, titre: "Un pilotage territorial explicable", texte: "77 communes, des zones prioritaires dont chaque couleur se justifie par ses facteurs." },
];

export default function Accueil() {
  useThemeEspace(false);
  const { data: session } = useSessionServeur();
  const monEspace = session ? accueilPour(session.profil.habilitations.map((h) => h.role)) : null;

  return (
    <div className="min-h-screen bg-bg">
      {/* En-tête visuel */}
      <section className="relative isolate overflow-hidden">
        <Image src="/images/accueil-eleves-secondaire.jpg" alt="" fill priority sizes="100vw" className="-z-10 object-cover object-[center_35%]" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,rgb(7_39_71/0.94)_0%,rgb(10_55_100/0.82)_45%,rgb(10_55_100/0.35)_100%)]" aria-hidden />
        <div className="mx-auto max-w-7xl px-5 pb-20 pt-6 sm:px-8">
          <div className="flex items-center justify-between">
            <span className="rounded-lg bg-white/95 px-3 py-2 shadow-float"><Logo /></span>
            <div className="flex items-center gap-2">
              <Link href="/verifier" className="hidden items-center gap-2 rounded-md bg-white/10 px-3.5 py-2 text-[13px] font-medium text-white ring-1 ring-white/25 backdrop-blur hover:bg-white/20 sm:inline-flex">
                <BadgeCheck size={16} aria-hidden /> Vérifier un diplôme
              </Link>
              <Link href={monEspace ?? "/connexion"} className="inline-flex items-center gap-2 rounded-md bg-white px-3.5 py-2 text-[13px] font-semibold text-navy shadow-float hover:bg-white/90">
                <LogIn size={16} aria-hidden /> {monEspace ? "Mon espace" : "Se connecter"}
              </Link>
            </div>
          </div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }} className="mt-14 max-w-2xl text-white sm:mt-24">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">République du Bénin · Plateforme nationale</p>
            <h1 className="mt-4 text-[34px] font-extrabold leading-[1.08] sm:text-[52px]">
              Chaque parcours suivi.<br />Chaque décision éclairée.
            </h1>
            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-white/85 sm:text-[17px]">
              BEILE relie les parcours des apprenants et des enseignants, les établissements et les systèmes existants de l'État,
              pour offrir à chaque acteur un service adapté et au pays une vision fiable, territoriale et en temps utile de son système éducatif.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={monEspace ?? "/connexion"} className="inline-flex h-12 items-center gap-2 rounded-md bg-white px-5 text-[15px] font-semibold text-navy shadow-pop transition hover:-translate-y-0.5">
                {monEspace ? "Ouvrir mon espace" : "Accéder à mon espace"} <ArrowRight size={17} aria-hidden />
              </Link>
              <Link href="/verifier" className="inline-flex h-12 items-center gap-2 rounded-md px-5 text-[15px] font-semibold text-white ring-1 ring-white/40 hover:bg-white/10">
                <BadgeCheck size={17} aria-hidden /> Vérifier un diplôme
              </Link>
            </div>
          </motion.div>
          <dl className="mt-16 grid max-w-3xl grid-cols-2 gap-6 text-white sm:grid-cols-4">
            {[["12", "départements"], ["77", "communes"], ["15", "processus couverts"], ["10", "espaces métiers"]].map(([v, l]) => (
              <div key={l}><dt className="sr-only">{l}</dt><dd><span className="block font-display text-[30px] font-bold leading-none">{v}</span><span className="mt-1 block text-[12.5px] text-white/70">{l}</span></dd></div>
            ))}
          </dl>
        </div>
        <BandeNationale className="h-[5px]" />
      </section>

      {/* Espaces */}
      <section id="espaces" className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-16">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Une seule plateforme, des espaces différents</p>
        <h2 className="mt-2 text-[26px] font-bold text-ink sm:text-[32px]">Chacun voit ce dont il a besoin, et rien de plus</h2>
        <p className="mt-2 max-w-2xl text-ink-2">L'espace s'ouvre selon vos habilitations, décidées sur le serveur. Chaque accès à une donnée personnelle est journalisé.</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ESPACES.map((e, i) => (
            <motion.div
              key={e.titre}
              initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ delay: i * 0.06, duration: 0.5, ease: EASE }}
              whileHover={{ y: -4 }}
              className="rounded-xl border border-line/70 bg-surface p-5 shadow-float transition-shadow hover:shadow-pop"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-soft text-accent-ink"><e.icone size={19} aria-hidden /></span>
              <p className="mt-4 font-display text-[17px] font-bold text-ink">{e.titre}</p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{e.texte}</p>
              <p className="mt-3 text-[12px] font-medium text-ink-muted">{e.publics}</p>
            </motion.div>
          ))}
          <Link href={monEspace ?? "/connexion"} className="group flex flex-col justify-between rounded-xl bg-navy p-5 text-white shadow-float transition hover:bg-navy-deep">
            <LogIn size={22} aria-hidden />
            <div>
              <p className="mt-6 font-display text-[18px] font-bold">{monEspace ? "Reprendre où vous en étiez" : "Se connecter"}</p>
              <p className="mt-1 flex items-center gap-1.5 text-[14px] text-white/80">Identifiant remis par votre administration <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" aria-hidden /></p>
            </div>
          </Link>
        </div>
      </section>

      {/* Ce que démontre le prototype */}
      <section className="border-t border-line/60 bg-surface">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_1.6fr]">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Des mécanismes, pas des maquettes</p>
            <h2 className="mt-2 text-[26px] font-bold text-ink sm:text-[28px]">Ce que garantit la plateforme</h2>
            <p className="mt-3 text-ink-2">
              Un registre d'événements en ajout seul, un moteur d'autorisation et une couche sémantique calculent chaque chiffre
              et chaque décision, côté serveur. Rien n'est effacé : une erreur se corrige par un événement tracé.
            </p>
            <div className="relative mt-8 aspect-[4/3] overflow-hidden rounded-xl">
              <Image src="/images/classe-primaire.jpg" alt="" fill sizes="(min-width: 1024px) 40vw, 100vw" className="object-cover" />
              <div className="absolute inset-0 bg-navy/25" aria-hidden />
            </div>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {PREUVES.map((p) => (
              <li key={p.titre} className="rounded-xl border border-line/70 bg-bg p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-soft text-accent-ink"><p.icone size={19} aria-hidden /></span>
                <p className="mt-4 font-display text-[16px] font-bold text-ink">{p.titre}</p>
                <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{p.texte}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer>
        <BandeNationale className="h-[5px]" />
        <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-2 px-5 py-6 text-[12.5px] text-ink-muted sm:px-8">
          <span>BEILE — Bénin Education Intelligence & Learning Ecosystem</span>
          <span>Photographies : Tosin Olowoleni, Şeyhmus Kino (Pexels)</span>
        </div>
      </footer>
    </div>
  );
}
