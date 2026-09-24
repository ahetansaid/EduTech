"use client";

import { ArrowRight, BadgeCheck, Fingerprint, GitBranch, Lock, MapPinned, ScanLine, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/shell/SelecteurProfil";
import { BandeNationale, Logo } from "@/components/ui/primitives";
import { ACCUEIL_PROFIL } from "@/lib/navigation";
import { getMonde } from "@beile/simulation/monde";
import { useDemo, useHydratation } from "@/lib/store";
import { useThemeEspace } from "@/lib/useSombre";

const FAMILLES = [
  { titre: "Pilotage", texte: "Cockpit national, console territoriale, requête contrôlée", ids: ["p-central", "p-departement", "p-inspecteur", "p-chercheur"] },
  { titre: "Établissement", texte: "Gestion, inscriptions, examens, conformité", ids: ["p-directeur", "p-dpo"] },
  { titre: "Parcours", texte: "Espaces personnels, d'abord sur téléphone", ids: ["p-enseignant", "p-parent", "p-apprenant"] },
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
  const router = useRouter();
  const hydrate = useHydratation();
  useThemeEspace(false);
  const changerProfil = useDemo((s) => s.changerProfil);
  const profils = getMonde().profils;
  const entrer = (id: string) => { changerProfil(id); router.push(ACCUEIL_PROFIL[id] ?? "/"); };

  return (
    <div className="min-h-screen bg-bg">
      {/* En-tête visuel */}
      <section className="relative isolate overflow-hidden">
        <Image src="/images/accueil-eleves-secondaire.jpg" alt="" fill priority sizes="100vw" className="-z-10 object-cover object-[center_35%]" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,rgb(7_39_71/0.94)_0%,rgb(10_55_100/0.82)_45%,rgb(10_55_100/0.35)_100%)]" aria-hidden />
        <div className="mx-auto max-w-7xl px-5 pb-20 pt-6 sm:px-8">
          <div className="flex items-center justify-between">
            <span className="rounded-lg bg-white/95 px-3 py-2 shadow-float"><Logo /></span>
            <Link href="/verifier" className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3.5 py-2 text-[13px] font-medium text-white ring-1 ring-white/25 backdrop-blur hover:bg-white/20">
              <BadgeCheck size={16} aria-hidden /> Vérifier un diplôme
            </Link>
          </div>
          <div className="mt-16 max-w-2xl text-white sm:mt-24">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">République du Bénin · Proposition de système national</p>
            <h1 className="mt-4 text-[34px] font-extrabold leading-[1.08] sm:text-[52px]">
              Chaque parcours suivi.<br />Chaque décision éclairée.
            </h1>
            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-white/85 sm:text-[17px]">
              BEILE relie les parcours des apprenants et des enseignants, les établissements et les systèmes existants de l'État,
              pour offrir à chaque acteur un service adapté et au pays une vision fiable, territoriale et en temps utile de son système éducatif.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={() => entrer("p-central")} className="inline-flex h-12 items-center gap-2 rounded-md bg-white px-5 text-[15px] font-semibold text-navy shadow-pop transition hover:-translate-y-0.5">
                Ouvrir le cockpit national <ArrowRight size={17} aria-hidden />
              </button>
              <a href="#acteurs" className="inline-flex h-12 items-center gap-2 rounded-md px-5 text-[15px] font-semibold text-white ring-1 ring-white/40 hover:bg-white/10">
                Choisir un acteur
              </a>
            </div>
          </div>
          <dl className="mt-16 grid max-w-3xl grid-cols-2 gap-6 text-white sm:grid-cols-4">
            {[["12", "départements"], ["77", "communes"], ["15", "processus simulés"], ["9", "profils d'acteurs"]].map(([v, l]) => (
              <div key={l}><dt className="sr-only">{l}</dt><dd><span className="block font-display text-[30px] font-bold leading-none">{v}</span><span className="mt-1 block text-[12.5px] text-white/70">{l}</span></dd></div>
            ))}
          </dl>
        </div>
        <BandeNationale className="h-[5px]" />
      </section>

      {/* Bandeau de démonstration */}
      <div className="border-b border-line/60 bg-warning-bg px-5 py-2.5 text-center text-[13px] text-warning">
        Prototype de démonstration : <strong>toutes les données sont fictives</strong> et générées de façon déterministe. Aucune donnée personnelle réelle n'est utilisée ni hébergée.
      </div>

      {/* Acteurs */}
      <section id="acteurs" className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Une seule architecture, des expériences différentes</p>
        <h2 className="mt-2 text-[28px] font-bold text-ink sm:text-[32px]">Entrez par l'acteur de votre choix</h2>
        <p className="mt-2 max-w-2xl text-ink-2">Chaque profil voit ce dont il a besoin pour sa mission, et rien de plus. Vous pourrez changer d'acteur à tout moment.</p>
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {FAMILLES.map((f) => (
            <div key={f.titre} className="rounded-xl border border-line/70 bg-surface p-5 shadow-float">
              <p className="font-display text-[17px] font-bold text-ink">{f.titre}</p>
              <p className="text-[13px] text-ink-muted">{f.texte}</p>
              <div className="mt-4 space-y-1.5">
                {f.ids.map((id) => {
                  const p = profils.find((x) => x.id === id)!;
                  return (
                    <button key={id} disabled={!hydrate} onClick={() => entrer(id)} className="group flex w-full items-center gap-3 rounded-md px-2.5 py-2.5 text-left transition-colors hover:bg-surface-2 disabled:opacity-60">
                      <Avatar nom={p.nomAffiche} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-ink">{p.nomAffiche}</span>
                        <span className="block truncate text-[12.5px] text-ink-muted">{p.fonction}</span>
                      </span>
                      <ArrowRight size={16} className="text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Ce que démontre le prototype */}
      <section className="border-t border-line/60 bg-surface">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_1.6fr]">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Des mécanismes, pas des maquettes</p>
            <h2 className="mt-2 text-[28px] font-bold text-ink">Ce que la démonstration prouve sous vos yeux</h2>
            <p className="mt-3 text-ink-2">
              Le prototype n'affiche pas des écrans figés : un registre d'événements, un moteur d'autorisation et une couche sémantique
              calculent chaque chiffre et chaque décision. Le même contrat d'interface sera servi par l'API de production.
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
          <span>BEILE — Bénin Education Intelligence & Learning Ecosystem · Prototype</span>
          <span>Photographies : Tosin Olowoleni, Şeyhmus Kino (Pexels)</span>
        </div>
      </footer>
    </div>
  );
}
