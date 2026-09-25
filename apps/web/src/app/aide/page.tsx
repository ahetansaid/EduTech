"use client";

import { ArrowRight, BookOpen, CircleHelp, LifeBuoy, Lock, Search, ShieldCheck, Sparkles, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Cascade, EASE, Element, EntreePage, motion } from "@/components/motion";
import {
  CHANGER_MOT_DE_PASSE, DEMANDER_AIDE, EN_CAS_DE_PROBLEME, FAQ_GENERALE, PREMIERE_CONNEXION, PROFILS, SE_CONNECTER, SE_DECONNECTER, SECURITE, VISITE_GUIDEE,
} from "@/lib/aide";
import { useTitre } from "@/lib/titre";
import { Apparition, BoutonVisite, CarteTache, Faq, Pictogramme, SchemaFlux, TitreSection, useRolesSession, visitesLancables } from "./_composants";

const sansAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const PREMIERS_PAS = [SE_CONNECTER, PREMIERE_CONNEXION, CHANGER_MOT_DE_PASSE, SE_DECONNECTER, VISITE_GUIDEE, DEMANDER_AIDE];

export default function CentreAide() {
  useTitre("Centre d'aide");
  const roles = useRolesSession();
  const [q, setQ] = useState("");
  const mesProfils = roles ? PROFILS.filter((p) => (roles as string[]).includes(p.id)) : [];

  const resultats = useMemo(() => {
    const f = sansAccents(q.trim());
    if (f.length < 2) return [];
    const r: { titre: string; lieu: string; href: string }[] = [];
    PREMIERS_PAS.forEach((t, i) => { if (sansAccents(t.titre + t.etapes.join(" ")).includes(f)) r.push({ titre: t.titre, lieu: "Premiers pas", href: `#premier-pas-${i}` }); });
    for (const p of PROFILS) {
      p.taches.forEach((t, i) => { if (sansAccents(t.titre + t.etapes.join(" ")).includes(f)) r.push({ titre: t.titre, lieu: p.nom, href: `/aide/${p.slug}#tache-${i}` }); });
      p.faq.forEach((x) => { if (sansAccents(x.q + x.r).includes(f)) r.push({ titre: x.q, lieu: `${p.nom} · question fréquente`, href: `/aide/${p.slug}#faq` }); });
    }
    return r.slice(0, 12);
  }, [q]);

  return (
    <EntreePage>
      <div className="space-y-12">
        {/* ---------------------------------------------------------- En-tête */}
        <section className="relative">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-soft/80 blur-3xl" aria-hidden />
          <div className="relative">
            <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-blue-soft px-3 py-1 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-accent-ink">
              <BookOpen size={13} aria-hidden /> Centre d'aide
            </p>
            <h1 className="max-w-2xl font-display text-[30px] font-bold leading-[1.1] text-ink sm:text-[38px]">Comment pouvons-nous vous aider ?</h1>
            <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-ink-2">Un guide pour chaque profil, les tâches courantes pas à pas, et les bons réflexes de sécurité. Rien à installer : BEILE s'utilise dans le navigateur, sur téléphone comme sur ordinateur.</p>

            <div className="relative mt-6 max-w-xl">
              <label className="relative block">
                <span className="sr-only">Rechercher une tâche ou une question</span>
                <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
                <input value={q} onChange={(e) => setQ(e.target.value.slice(0, 60))} type="search" placeholder="Ex. : justifier une absence, faire l'appel, mot de passe…"
                  className="h-12 w-full rounded-xl border border-line bg-surface pl-11 pr-11 text-[15px] text-ink shadow-float outline-none transition placeholder:text-ink-muted focus:border-blue focus:ring-4 focus:ring-blue/15" />
                {q && (
                  <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2" aria-label="Effacer la recherche"><X size={16} aria-hidden /></button>
                )}
              </label>
              {q.trim().length >= 2 && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: EASE }}
                  className="mt-2 overflow-hidden rounded-xl border border-line/70 bg-surface shadow-pop" role="region" aria-live="polite" aria-label="Résultats de la recherche">
                  {resultats.length ? (
                    <ul className="divide-y divide-line/60">
                      {resultats.map((r) => (
                        <li key={r.href + r.titre}>
                          <Link href={r.href} className="flex min-h-12 items-center gap-3 px-4 py-2.5 hover:bg-surface-2/70">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[14px] font-medium text-ink">{r.titre}</span>
                              <span className="block truncate text-xs text-ink-muted">{r.lieu}</span>
                            </span>
                            <ArrowRight size={15} className="shrink-0 text-ink-muted" aria-hidden />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="px-4 py-4 text-[14px] text-ink-muted">Aucun résultat pour « {q} ». Essayez un autre mot, ou parcourez les guides ci-dessous.</p>}
                </motion.div>
              )}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- Mon profil (connecté) */}
        {mesProfils.length > 0 && (
          <Apparition>
            <section aria-labelledby="mon-profil" className="rounded-2xl border border-blue/25 bg-blue-soft/50 p-5 sm:p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-ink">Vous êtes connecté</p>
              <h2 id="mon-profil" className="mt-1 font-display text-[20px] font-bold text-ink">Votre guide : {mesProfils.map((p) => p.nom).join(" · ")}</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {mesProfils.map((p) => (
                  <Link key={p.id} href={`/aide/${p.slug}`} className="inline-flex h-11 items-center gap-2 rounded-md bg-surface px-4 text-[14px] font-semibold text-ink ring-1 ring-inset ring-line transition hover:bg-surface-2 active:scale-[0.97]">
                    <BookOpen size={16} aria-hidden /> Guide {p.nom.toLowerCase()}
                  </Link>
                ))}
                {(() => {
                  const g = visitesLancables(mesProfils.flatMap((p) => p.visites)).find((x) => x.nature === "espace" && roles?.some((r) => x.roles.includes(r)));
                  return g ? <BoutonVisite guide={g} /> : null;
                })()}
              </div>
            </section>
          </Apparition>
        )}

        {/* ---------------------------------------------------------- Profils */}
        <section aria-labelledby="profils">
          <TitreSection id="profils" surtitre="Un guide par profil" titre="Choisissez votre profil" texte="Chaque guide explique votre espace écran par écran, avec les tâches courantes et les questions fréquentes." />
          <Cascade className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PROFILS.map((p) => {
              return (
                <Element key={p.id}>
                  <Link href={`/aide/${p.slug}`} className="group flex h-full min-w-0 flex-col rounded-xl border border-line/70 bg-surface p-4 shadow-float transition duration-200 hover:-translate-y-1 hover:shadow-pop">
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-soft text-accent-ink transition-transform duration-200 group-hover:scale-105"><Pictogramme nom={p.icone} size={19} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-[16px] font-bold leading-tight text-ink">{p.nom}</span>
                        <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-muted">{p.pourQui}</span>
                      </span>
                    </div>
                    <p className="mt-3 flex-1 text-[13.5px] leading-relaxed text-ink-2">{p.resume}</p>
                    <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-accent-ink">Lire le guide <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-1" aria-hidden /></span>
                  </Link>
                </Element>
              );
            })}
          </Cascade>
        </section>

        {/* ---------------------------------------------------------- Principe */}
        <section aria-labelledby="principe">
          <TitreSection id="principe" icone={Sparkles} surtitre="Le principe" titre="Un fait saisi une fois, utile à tous" texte="Ce que vous saisissez n'est jamais recopié ailleurs. Chacun voit ce qui le concerne, dans son périmètre." />
          <SchemaFlux />
        </section>

        {/* ---------------------------------------------------------- Premiers pas */}
        <section aria-labelledby="premiers-pas">
          <TitreSection id="premiers-pas" icone={CircleHelp} surtitre="Pour tous" titre="Premiers pas" texte="Se connecter, protéger son compte, retrouver de l'aide." />
          <div className="grid gap-3 lg:grid-cols-2">
            {PREMIERS_PAS.map((t, i) => (
              <Apparition key={t.titre} delai={Math.min(i, 6) * 0.04}>
                <CarteTache tache={t} ancre={`premier-pas-${i}`} ouverteParDefaut={i === 0} />
              </Apparition>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------- Sécurité */}
        <section aria-labelledby="securite">
          <TitreSection id="securite" icone={ShieldCheck} surtitre="Bonnes pratiques" titre="Sécurité : six réflexes" texte="Vos données et celles des élèves sont protégées par la loi. Chaque accès est journalisé." />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SECURITE.map((s, i) => (
              <Apparition key={s.titre} delai={Math.min(i, 6) * 0.05} className="h-full">
                <div className="flex h-full gap-3 rounded-xl border border-line/70 bg-surface p-4 shadow-float">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-success-bg text-success"><Lock size={16} aria-hidden /></span>
                  <div className="min-w-0">
                    <p className="text-[14.5px] font-semibold text-ink">{s.titre}</p>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">{s.texte}</p>
                  </div>
                </div>
              </Apparition>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------- FAQ */}
        <section aria-labelledby="faq-generale">
          <TitreSection id="faq-generale" icone={CircleHelp} surtitre="Questions fréquentes" titre="Vous vous demandez peut-être…" />
          <Faq questions={FAQ_GENERALE} />
        </section>

        {/* ---------------------------------------------------------- En cas de problème */}
        <section aria-labelledby="probleme">
          <TitreSection id="probleme" icone={TriangleAlert} surtitre="En cas de problème" titre="Que faire si quelque chose ne va pas ?" />
          <ul className="space-y-2.5">
            {EN_CAS_DE_PROBLEME.map((t, i) => (
              <Apparition key={i} delai={i * 0.05}>
                <li className="flex gap-3 rounded-xl border border-line/70 bg-surface p-4 text-[14px] leading-relaxed text-ink-2 shadow-float">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-warning-bg text-[12px] font-bold text-warning">{i + 1}</span>
                  {t}
                </li>
              </Apparition>
            ))}
          </ul>
          <div className="mt-4 flex flex-col items-start gap-3 rounded-xl border border-line/70 bg-surface-2/60 p-4 sm:flex-row sm:items-center">
            <LifeBuoy size={22} className="shrink-0 text-accent-ink" aria-hidden />
            <p className="min-w-0 flex-1 text-[14px] text-ink-2">Connecté ? Ouvrez l'écran <strong className="text-ink">Assistance</strong> depuis le menu sous votre nom : votre demande arrive directement à l'équipe d'administration.</p>
            {roles && <Link href="/assistance" className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-navy px-4 text-[13.5px] font-semibold text-white hover:bg-navy-deep dark:bg-blue dark:text-navy-deep">Ouvrir l'assistance <ArrowRight size={15} aria-hidden /></Link>}
          </div>
        </section>
      </div>
    </EntreePage>
  );
}
