"use client";

import { ArrowLeft, ArrowRight, BadgeCheck, ChevronRight, CircleHelp, KeyRound, LayoutGrid, LifeBuoy, ListChecks, LogIn, PlayCircle, ShieldCheck, Target, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { Cascade, Element, EntreePage } from "@/components/motion";
import { EtatVide } from "@/components/ui/primitives";
import { DEMANDER_AIDE, EN_CAS_DE_PROBLEME, PREMIERE_CONNEXION, PROFILS, profilParSlug, SE_CONNECTER, SECURITE, type ContenuProfil } from "@/lib/aide";
import { useTitre } from "@/lib/titre";
import { Apparition, BoutonVisite, CarteTache, Faq, Pictogramme, TitreSection, useRolesSession, visitesLancables } from "../_composants";

export default function Page({ params }: { params: Promise<{ profil: string }> }) {
  const { profil } = use(params);
  const p = profilParSlug(decodeURIComponent(profil));
  useTitre(p ? `Guide ${p.nom.toLowerCase()}` : "Centre d'aide");
  if (!p) {
    return (
      <div className="rounded-xl border border-line/70 bg-surface shadow-float">
        <EtatVide icone={CircleHelp} titre="Guide introuvable" texte="Ce profil n'existe pas. Choisissez le vôtre dans le centre d'aide."
          action={<Link href="/aide" className="inline-flex h-10 items-center gap-1.5 rounded-md bg-navy px-4 text-sm font-medium text-white dark:bg-blue dark:text-navy-deep"><ArrowLeft size={15} aria-hidden /> Centre d'aide</Link>} />
      </div>
    );
  }
  return <Guide p={p} />;
}

const SOMMAIRE = [
  { id: "objectif", libelle: "Objectif", icone: Target },
  { id: "connexion", libelle: "Se connecter", icone: LogIn },
  { id: "ecrans", libelle: "Écran par écran", icone: LayoutGrid },
  { id: "taches", libelle: "Tâches courantes", icone: ListChecks },
  { id: "faq", libelle: "Questions fréquentes", icone: CircleHelp },
  { id: "securite", libelle: "Sécurité", icone: ShieldCheck },
  { id: "probleme", libelle: "En cas de problème", icone: LifeBuoy },
];

function Guide({ p }: { p: ContenuProfil }) {
  const roles = useRolesSession();
  const publicSansCompte = p.id === "public";
  const concerne = !!roles && (roles as string[]).includes(p.id);
  const visites = concerne ? visitesLancables(p.visites).filter((g) => roles!.some((r) => g.roles.includes(r))) : [];
  const principale = visites.find((g) => g.nature === "espace") ?? visites[0];
  const autres = visites.filter((g) => g !== principale);
  const rang = PROFILS.findIndex((x) => x.id === p.id);
  const precedent = PROFILS[rang - 1];
  const suivant = PROFILS[rang + 1];

  return (
    <EntreePage>
      <div className="space-y-10">
        {/* ---------------------------------------------------------- En-tête */}
        <header className="space-y-4">
          <nav aria-label="Fil d'Ariane" className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-muted">
            <Link href="/aide" className="hover:text-ink">Centre d'aide</Link>
            <ChevronRight size={14} aria-hidden />
            <span className="truncate font-medium text-ink">{p.nom}</span>
          </nav>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-navy text-white shadow-float dark:bg-blue dark:text-navy-deep"><Pictogramme nom={p.icone} size={26} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Guide d'utilisation · {p.espace}</p>
              <h1 className="mt-1 font-display text-[28px] font-bold leading-tight text-ink sm:text-[34px]">{p.nom}</h1>
              <p className="mt-1 text-[15px] text-ink-2">{p.pourQui}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {publicSansCompte ? (
              <Link href="/verifier" className="inline-flex h-11 items-center gap-2 rounded-md bg-navy px-4 text-[14px] font-semibold text-white shadow-sm hover:bg-navy-deep active:scale-[0.97] dark:bg-blue dark:text-navy-deep"><BadgeCheck size={17} aria-hidden /> Vérifier un diplôme</Link>
            ) : principale ? (
              <BoutonVisite guide={principale} />
            ) : !roles ? (
              <Link href={`/connexion?retour=${encodeURIComponent(p.arrivee)}`} className="inline-flex h-11 items-center gap-2 rounded-md bg-navy px-4 text-[14px] font-semibold text-white shadow-sm hover:bg-navy-deep active:scale-[0.97] dark:bg-blue dark:text-navy-deep"><LogIn size={17} aria-hidden /> Se connecter pour la visite guidée</Link>
            ) : null}
            {autres.map((g) => <BoutonVisite key={g.id} guide={g} variante="secondaire" />)}
          </div>
        </header>

        {/* ---------------------------------------------------------- Sommaire */}
        <nav aria-label="Sommaire du guide" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex w-max gap-1.5 sm:w-auto sm:flex-wrap">
            {SOMMAIRE.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line/70 bg-surface px-3 text-[12.5px] font-medium text-ink-2 transition hover:-translate-y-0.5 hover:text-ink hover:shadow-float">
                  <s.icone size={14} aria-hidden /> {s.libelle}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* ---------------------------------------------------------- Objectif */}
        <Apparition>
          <section aria-labelledby="objectif" className="rounded-2xl border border-line/70 bg-surface p-5 shadow-float sm:p-6">
            <TitreSection id="objectif" icone={Target} titre="À quoi sert votre espace" />
            <p className="text-[15px] leading-relaxed text-ink-2">{p.objectif}</p>
            <p className="mt-3 text-[13.5px] text-ink-muted">Après la connexion, vous arrivez sur <strong className="font-semibold text-ink">{p.espace}</strong> <span className="font-mono text-[12.5px]">({p.arrivee})</span>.</p>
          </section>
        </Apparition>

        {/* ---------------------------------------------------------- Connexion */}
        <section aria-labelledby="connexion">
          <TitreSection id="connexion" icone={LogIn} titre="Se connecter" texte={publicSansCompte ? "Aucun compte n'est nécessaire : la vérification est publique et gratuite." : "Votre identifiant vous est remis par l'administrateur de la plateforme."} />
          {!publicSansCompte && (
            <div className="grid gap-3 lg:grid-cols-2">
              <CarteTache tache={SE_CONNECTER} ouverteParDefaut />
              <CarteTache tache={PREMIERE_CONNEXION} />
            </div>
          )}
        </section>

        {/* ---------------------------------------------------------- Écrans */}
        <section aria-labelledby="ecrans">
          <TitreSection id="ecrans" icone={LayoutGrid} titre="Écran par écran" texte="Ce que vous trouvez dans chaque écran, dans l'ordre du menu." />
          <Cascade className="grid gap-3 md:grid-cols-2">
            {p.ecrans.map((e) => {
              return (
                <Element key={e.titre}>
                  <article className="flex h-full min-w-0 flex-col rounded-xl border border-line/70 bg-surface p-4 shadow-float sm:p-5">
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-soft text-accent-ink"><Pictogramme nom={e.icone} size={19} /></span>
                      <div className="min-w-0">
                        <h3 className="text-[15.5px] font-semibold leading-tight text-ink">{e.titre}</h3>
                        <p className="mt-0.5 truncate font-mono text-[11.5px] text-ink-muted">{e.chemin}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-[14px] text-ink-2">{e.resume}</p>
                    <ul className="mt-3 space-y-1.5">
                      {e.points.map((x) => (
                        <li key={x} className="flex gap-2 text-[13.5px] leading-relaxed text-ink-2">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue" aria-hidden />
                          <span className="min-w-0">{x}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                </Element>
              );
            })}
          </Cascade>
        </section>

        {/* ---------------------------------------------------------- Tâches */}
        <section aria-labelledby="taches">
          <TitreSection id="taches" icone={ListChecks} titre="Tâches courantes, pas à pas" texte="Touchez une tâche pour afficher ses étapes." />
          <div className="space-y-3">
            {p.taches.map((t, i) => (
              <Apparition key={t.titre} delai={Math.min(i, 6) * 0.04}>
                <CarteTache tache={t} ancre={`tache-${i}`} ouverteParDefaut={i === 0} />
              </Apparition>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------- FAQ */}
        <section aria-labelledby="faq">
          <TitreSection id="faq" icone={CircleHelp} titre="Questions fréquentes" />
          <Faq questions={p.faq} />
        </section>

        {/* ---------------------------------------------------------- Sécurité */}
        <section aria-labelledby="securite">
          <TitreSection id="securite" icone={ShieldCheck} titre="Sécurité et bonnes pratiques" />
          <div className="grid gap-3 md:grid-cols-2">
            <Apparition className="h-full">
              <div className="h-full rounded-xl border border-success/25 bg-success-bg/60 p-4 sm:p-5">
                <p className="flex items-center gap-2 text-[14.5px] font-semibold text-ink"><ShieldCheck size={17} className="text-success" aria-hidden /> Pour votre profil</p>
                <ul className="mt-3 space-y-2">
                  {p.conseils.map((c) => <li key={c} className="flex gap-2 text-[13.5px] leading-relaxed text-ink-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-success" aria-hidden /><span className="min-w-0">{c}</span></li>)}
                </ul>
              </div>
            </Apparition>
            {!publicSansCompte && (
              <Apparition className="h-full" delai={0.06}>
                <div className="h-full rounded-xl border border-line/70 bg-surface p-4 shadow-float sm:p-5">
                  <p className="flex items-center gap-2 text-[14.5px] font-semibold text-ink"><KeyRound size={17} className="text-accent-ink" aria-hidden /> Pour tous les comptes</p>
                  <ul className="mt-3 space-y-2">
                    {SECURITE.slice(0, 4).map((s) => <li key={s.titre} className="text-[13.5px] leading-relaxed text-ink-2"><strong className="font-semibold text-ink">{s.titre}.</strong> {s.texte}</li>)}
                  </ul>
                </div>
              </Apparition>
            )}
          </div>
        </section>

        {/* ---------------------------------------------------------- Problème */}
        <section aria-labelledby="probleme">
          <TitreSection id="probleme" icone={TriangleAlert} titre="En cas de problème" />
          {publicSansCompte ? (
            <p className="rounded-xl border border-line/70 bg-surface p-4 text-[14px] leading-relaxed text-ink-2 shadow-float">Un verdict vous surprend ? Vérifiez l'identifiant saisi, puis demandez au titulaire le lien de vérification ou l'original du document. En cas de doute sérieux, adressez-vous à l'établissement ou à l'autorité qui a délivré le diplôme.</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              <ul className="space-y-2.5">
                {EN_CAS_DE_PROBLEME.map((t, i) => (
                  <li key={i} className="flex gap-3 rounded-xl border border-line/70 bg-surface p-4 text-[13.5px] leading-relaxed text-ink-2 shadow-float">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-warning-bg text-[12px] font-bold text-warning">{i + 1}</span>
                    {t}
                  </li>
                ))}
              </ul>
              <div><CarteTache tache={DEMANDER_AIDE} ouverteParDefaut /></div>
            </div>
          )}
        </section>

        {/* ---------------------------------------------------------- Navigation entre guides */}
        <nav aria-label="Autres guides" className="grid gap-3 border-t border-line/60 pt-6 sm:grid-cols-2">
          {precedent ? (
            <Link href={`/aide/${precedent.slug}`} className="group flex min-h-16 items-center gap-3 rounded-xl border border-line/70 bg-surface p-4 shadow-float transition hover:-translate-y-0.5 hover:shadow-pop">
              <ArrowLeft size={17} className="shrink-0 text-ink-muted transition-transform group-hover:-translate-x-1" aria-hidden />
              <span className="min-w-0"><span className="block text-xs text-ink-muted">Guide précédent</span><span className="block truncate text-[14.5px] font-semibold text-ink">{precedent.nom}</span></span>
            </Link>
          ) : <span className="hidden sm:block" />}
          {suivant && (
            <Link href={`/aide/${suivant.slug}`} className="group flex min-h-16 items-center justify-end gap-3 rounded-xl border border-line/70 bg-surface p-4 text-right shadow-float transition hover:-translate-y-0.5 hover:shadow-pop">
              <span className="min-w-0"><span className="block text-xs text-ink-muted">Guide suivant</span><span className="block truncate text-[14.5px] font-semibold text-ink">{suivant.nom}</span></span>
              <ArrowRight size={17} className="shrink-0 text-ink-muted transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
          )}
        </nav>
        {concerne && !principale && !publicSansCompte && <p className="flex items-center gap-2 text-xs text-ink-muted"><PlayCircle size={14} aria-hidden /> La visite guidée démarre aussi depuis le bouton « Guide » de votre espace.</p>}
      </div>
    </EntreePage>
  );
}
