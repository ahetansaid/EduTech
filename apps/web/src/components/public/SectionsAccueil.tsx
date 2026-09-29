"use client";

import { ArrowRight, Award, Baby, CalendarClock, CalendarDays, ChartColumn, CircleCheck, FileCheck2, Fingerprint, GraduationCap, HandCoins, Landmark, LocateFixed, MapPin, School, Search, ShieldCheck, Smartphone, UserPlus, UserRoundCheck, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Compteur, EASE, motion } from "@/components/motion";
import { CarteBenin, RAMPE_CLAIRE } from "@/components/map/CarteBenin";
import { DEPARTEMENTS } from "@beile/simulation/territoire";
import { cn } from "@/lib/cn";
import { NIVEAUX_PUBLICS, useAnnuaire, useCalendrier, useChiffres, useSessionsPubliees, type Echeance } from "@/lib/api/public";
import { avancement, CATEGORIES, dateCourte, dateLongue, enDate, jours, moisDeLAnnee, periode, position, prochaine } from "@/lib/calendrier";

/**
 * Sections de l'accueil : chaque service public présenté par un aperçu vivant de sa page
 * (recherche réelle, prochaine échéance réelle, données réelles), en quelques mots.
 */

/** Mise en page commune : texte d'un côté, aperçu de l'autre, alternés ; entrée animée sans jamais masquer le contenu. */
function Section({ id, surtitre, titre, texte, lien, apercu, inverse = false, fond = false }: {
  id: string; surtitre: string; titre: string; texte: string; lien: { href: string; libelle: string }; apercu: ReactNode; inverse?: boolean; fond?: boolean;
}) {
  return (
    <section id={id} className={cn("relative scroll-mt-20", fond && "bg-surface")}>
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:gap-16 lg:py-20">
        <motion.div initial={{ x: inverse ? 24 : -24 }} whileInView={{ x: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.6, ease: EASE }}
          className={cn("min-w-0", inverse && "lg:order-2")}>
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-accent-ink">{surtitre}</p>
          <h2 className="mt-2 font-display text-[28px] font-extrabold leading-tight tracking-tight text-ink sm:text-[34px]">{titre}</h2>
          <p className="mt-3 max-w-md text-[16px] leading-relaxed text-ink-2">{texte}</p>
          <Link href={lien.href} className="group mt-6 inline-flex items-center gap-2 text-[15px] font-semibold text-accent-ink">
            {lien.libelle} <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" aria-hidden />
          </Link>
        </motion.div>
        <motion.div initial={{ y: 24 }} whileInView={{ y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.6, ease: EASE, delay: 0.08 }}
          className={cn("min-w-0", inverse && "lg:order-1")}>
          {apercu}
        </motion.div>
      </div>
    </section>
  );
}

const Carte = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("rounded-3xl border border-line/70 bg-surface p-5 shadow-float sm:p-6", className)}>{children}</div>
);

/* ------------------------------------------------------------------ 1. Trouver un établissement */

/** Départements colorés dans une gamme de bleus (repérage visuel, pas une valeur). */
const COULEURS_DEPARTEMENTS = new Map(DEPARTEMENTS.map((d, i) => [d.id, RAMPE_CLAIRE[1 + (i % 3)]!]));

export function SectionEtablissements() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <Section id="etablissements" surtitre="Annuaire national" titre="Trouver un établissement"
      texte="Écoles, collèges, lycées et centres de formation : par nom, par lieu ou autour de vous."
      lien={{ href: "/etablissements", libelle: "Ouvrir l'annuaire" }}
      apercu={
        <Carte>
          <form onSubmit={(e) => { e.preventDefault(); router.push(`/etablissements${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`); }} className="flex gap-2">
            <label className="relative flex-1">
              <span className="sr-only">Nom de l&apos;établissement</span>
              <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom de l'établissement"
                className="h-12 w-full rounded-xl border border-line bg-bg pl-11 pr-3 text-[15px] text-ink outline-none transition focus:border-blue focus:ring-4 focus:ring-blue/15" />
            </label>
            <button type="submit" className="h-12 shrink-0 rounded-xl bg-navy px-5 text-[14px] font-semibold text-white transition hover:bg-navy-deep">Chercher</button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            {NIVEAUX_PUBLICS.slice(0, 4).map((n) => (
              <Link key={n.valeur} href={`/etablissements?niveau=${n.valeur}`} className="rounded-full px-3.5 py-1.5 text-[13px] font-medium text-ink-2 ring-1 ring-inset ring-line transition hover:bg-blue-soft hover:text-accent-ink">{n.libelle}</Link>
            ))}
            <Link href="/etablissements?autour=1" className="inline-flex items-center gap-1.5 rounded-full bg-teal/10 px-3.5 py-1.5 text-[13px] font-semibold text-teal transition hover:bg-teal/15"><LocateFixed size={14} aria-hidden /> Autour de moi</Link>
          </div>
          <div className="mt-4 rounded-2xl bg-bg px-2 py-3">
            <div className="mx-auto w-full max-w-[190px] sm:max-w-[210px]">
              <CarteBenin niveau="departements" hauteur={250} couleurs={COULEURS_DEPARTEMENTS} onSelect={(id) => router.push(`/etablissements?departement=${id}`)} className="w-full" />
            </div>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-ink-muted"><School size={14} aria-hidden /> Touchez un département pour voir ses établissements.</p>
        </Carte>
      }
    />
  );
}

/* ------------------------------------------------------------------ 2. Calendrier scolaire */

const jourMois = (iso: string) => {
  const d = enDate(iso);
  return { jour: d.getUTCDate(), mois: d.toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" }).replace(".", "") };
};

/**
 * Bande pleine largeur : la frise de l'année se dessine dans l'ordre chronologique, puis le repère
 * « Aujourd'hui » parcourt le temps écoulé jusqu'à la date du jour. Tout est lu depuis le calendrier publié.
 */
export function SectionCalendrier() {
  const { data } = useCalendrier();
  const annee = data?.annee ?? null;
  const ev = data?.evenements ?? [];
  const auj = data?.aujourdhui ?? "";
  const suite = data ? prochaine(ev, auj) : null;
  const prog = data ? avancement(ev, auj) : null;
  const officiel = ev.length > 0 && ev.every((e) => e.statut === "officiel");
  const mois = annee ? moisDeLAnnee(annee).map((m) => ({ ...m, g: position(annee, `${m.cle}-01`) })) : [];
  const lignes = [
    { cle: "trimestres", echeances: ev.filter((e) => e.categorie === "trimestre") },
    { cle: "conges", echeances: ev.filter((e) => e.categorie === "conges") },
    { cle: "examens", echeances: ev.filter((e) => e.categorie === "examen" || e.categorie === "evaluation") },
  ].filter((l) => l.echeances.length);
  const reperes = ev.filter((e) => e.categorie === "ferie" || e.categorie === "rentree" || e.categorie === "fin");
  const aVenir = ev.filter((e) => e.categorie !== "trimestre" && e.fin >= auj).slice(0, 4);
  // Pour des congés : le jour du retour en classe (début du trimestre suivant).
  const reprise = suite?.echeance.categorie === "conges" ? ev.find((e) => e.categorie === "trimestre" && e.debut > suite.echeance.fin) : undefined;
  const ici = annee && auj && prog && !prog.avant && !prog.apres ? position(annee, auj) : null;
  const delai = (g: number) => 0.25 + (g / 100) * 1.2;

  return (
    <section id="calendrier" className="relative scroll-mt-20 overflow-hidden bg-surface">
      <div className="pointer-events-none absolute -left-32 top-10 h-80 w-80 rounded-full bg-blue-soft/60 blur-3xl" aria-hidden />
      <div className="relative mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
        <motion.div initial={{ y: 16 }} whileInView={{ y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.6, ease: EASE }}
          className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex flex-wrap items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-accent-ink">
              Calendrier scolaire{annee ? ` ${annee}` : ""}
              {officiel && <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-[11px] normal-case tracking-normal text-success"><CircleCheck size={12} aria-hidden /> Officiel</span>}
            </p>
            <h2 className="mt-2 font-display text-[28px] font-extrabold leading-tight tracking-tight text-ink sm:text-[34px]">Où en est l&apos;année ?</h2>
          </div>
          <Link href="/calendrier" className="group inline-flex items-center gap-2 text-[15px] font-semibold text-accent-ink">
            Voir le calendrier complet <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" aria-hidden />
          </Link>
        </motion.div>

        <div className="mt-8 grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* Prochaine échéance */}
          <motion.div initial={{ x: -24 }} whileInView={{ x: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.6, ease: EASE }}
            className="relative flex flex-col overflow-hidden rounded-3xl bg-navy p-6 text-white shadow-float">
            <span className="absolute inset-x-0 top-0 flex h-1" aria-hidden><span className="flex-1 bg-flag-green" /><span className="flex-1 bg-flag-yellow" /><span className="flex-1 bg-flag-red" /></span>
            <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-white/60"><CalendarClock size={15} aria-hidden /> Prochaine échéance</p>
            {suite ? (
              <>
                <p className="mt-3 font-display text-[22px] font-bold leading-tight">{suite.echeance.titre}</p>
                <p className="mt-1 text-[14px] text-white/75">{periode(suite.echeance).replace(/^\w/, (x) => x.toUpperCase())}</p>
                <p className="mt-6 flex items-baseline gap-2">
                  {suite.enCours ? <span className="font-display text-[34px] font-extrabold text-flag-yellow">En cours</span>
                    : <><span className="font-display text-[64px] font-extrabold leading-none tabular-nums text-flag-yellow"><Compteur valeur={suite.dans} format={(v) => String(Math.round(v))} /></span><span className="text-[15px] font-medium text-white/75">{suite.dans > 1 ? "jours" : "jour"}</span></>}
                </p>
                {reprise && <p className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[12.5px] text-white/85">Reprise des cours le {dateLongue(reprise.debut)}</p>}
              </>
            ) : <p className="mt-3 text-[15px] text-white/80">{data ? (prog?.apres ? "L'année scolaire est terminée." : "Calendrier en cours de publication.") : "…"}</p>}
            {prog && (
              <div className="mt-auto pt-6">
                <div className="flex items-center justify-between text-[12.5px] text-white/70">
                  <span>{suite?.periodeEnCours ? `${suite.periodeEnCours.titre} · semaine ${suite.periodeEnCours.semaine}/${suite.periodeEnCours.semaines}` : prog.avant ? `Rentrée dans ${prog.joursAvantRentree} j` : "Année scolaire"}</span>
                  <span className="font-semibold tabular-nums text-white">{Math.round(prog.pourcentage)} %</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <motion.div className="h-full rounded-full bg-[linear-gradient(90deg,#008751,#FCD116,#E8112D)]" initial={{ width: 0 }} whileInView={{ width: `${prog.pourcentage}%` }} viewport={{ once: true }} transition={{ delay: 0.3, duration: 1.4, ease: EASE }} />
                </div>
              </div>
            )}
          </motion.div>

          {/* Frise de l'année */}
          <motion.div initial={{ y: 24 }} whileInView={{ y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.6, ease: EASE, delay: 0.08 }}
            className="min-w-0 rounded-3xl border border-line/70 bg-bg p-4 shadow-float sm:p-6">
            <div className="relative">
              {/* Mois : séparateurs placés au jour près */}
              <div className="relative h-6 text-[11px] font-semibold uppercase tracking-wide text-ink-muted" aria-hidden>
                {mois.map((m, i) => {
                  const d = mois[i + 1]?.g ?? 100;
                  return (
                    <span key={m.cle} className="absolute top-0 text-center" style={{ left: `${m.g}%`, width: `${d - m.g}%` }}>
                      <span className="sm:hidden">{m.court.charAt(0)}</span><span className="hidden sm:inline">{m.court}</span>
                    </span>
                  );
                })}
              </div>
              <div className="relative">
                {mois.map((m, i) => i > 0 && <span key={m.cle} className="absolute inset-y-0 w-px bg-line/70" style={{ left: `${m.g}%` }} aria-hidden />)}
                {ici != null && (
                  <motion.span className="absolute inset-y-0 left-0 rounded-l-lg bg-navy/[0.05]" initial={{ width: "0%" }} whileInView={{ width: `${ici}%` }} viewport={{ once: true }} transition={{ delay: 1.2, duration: 1.4, ease: EASE }} aria-hidden />
                )}
                <div className="relative z-10 space-y-2.5 py-3">
                  {lignes.map((l) => (
                    <div key={l.cle} className="relative h-5 sm:h-8">
                      {l.echeances.map((e) => {
                        const g = position(annee!, e.debut), d = position(annee!, e.fin);
                        return (
                          <motion.span key={e.id} className={cn("group absolute top-0 flex h-5 origin-left items-center overflow-visible rounded-md px-2 sm:h-8 sm:rounded-lg", CATEGORIES[e.categorie].barre)}
                            style={{ left: `${g}%`, width: `max(${d - g}%, 8px)` }}
                            initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ delay: delai(g), duration: 0.5, ease: EASE }}>
                            {e.categorie === "trimestre" && <span className="hidden truncate text-[12px] font-semibold text-white sm:block">{e.titre}</span>}
                            <Infobulle e={e} />
                          </motion.span>
                        );
                      })}
                    </div>
                  ))}
                  {reperes.length > 0 && (
                    <div className="relative h-5 sm:h-8">
                      {reperes.map((e) => {
                        const g = position(annee!, e.debut);
                        return (
                          <motion.span key={e.id} className="group absolute top-1/2 -ml-2 -mt-2 flex h-4 w-4 items-center justify-center rounded-full bg-surface ring-1 ring-line" style={{ left: `${g}%` }}
                            initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: delai(g) + 0.2, type: "spring", stiffness: 380, damping: 16 }}>
                            <span className={cn("h-2.5 w-2.5 rounded-full", CATEGORIES[e.categorie].point)} />
                            <Infobulle e={e} />
                          </motion.span>
                        );
                      })}
                    </div>
                  )}
                </div>
                {ici != null && (
                  <motion.span className="pointer-events-none absolute -top-1 bottom-0 w-0" initial={{ left: "0%" }} whileInView={{ left: `${ici}%` }} viewport={{ once: true }} transition={{ delay: 1.2, duration: 1.4, ease: EASE }} aria-hidden>
                    <span className="absolute inset-y-0 -left-px w-0.5 rounded-full bg-navy" />
                    <span className="absolute -left-[5px] -top-1 z-20 h-2.5 w-2.5 rounded-full bg-navy">
                      <motion.span className="absolute inset-0 rounded-full bg-navy" animate={{ scale: [1, 2.4], opacity: [0.5, 0] }} transition={{ delay: 2.7, duration: 1.8, repeat: Infinity, ease: "easeOut" }} />
                    </span>
                  </motion.span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-ink-2">
                {ici != null && auj && <span className="inline-flex items-center gap-1.5 font-semibold text-ink"><span className="h-2.5 w-0.5 rounded-full bg-navy" /> Aujourd&apos;hui, {dateCourte(auj)}</span>}
                {(["trimestre", "conges", "examen", "ferie"] as const).filter((c) => ev.some((e) => e.categorie === c)).map((c) => (
                  <span key={c} className="inline-flex items-center gap-1.5"><span className={cn("h-2.5 w-2.5 rounded-full", CATEGORIES[c].point)} /> {CATEGORIES[c].libelle}</span>
                ))}
              </div>
            </div>

            {/* Échéances à venir */}
            {aVenir.length > 0 && (
              <ul className="mt-5 grid grid-cols-1 gap-2 border-t border-line/70 pt-5 sm:grid-cols-2">
                {aVenir.map((e, i) => {
                  const { jour, mois: m } = jourMois(e.debut);
                  const encours = e.debut <= auj;
                  return (
                    <motion.li key={e.id} initial={{ y: 12 }} whileInView={{ y: 0 }} viewport={{ once: true }} transition={{ delay: 0.15 + i * 0.07, duration: 0.45, ease: EASE }}
                      className="flex min-w-0 items-center gap-3 rounded-2xl bg-surface p-2.5 ring-1 ring-inset ring-line/60">
                      <span className={cn("flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl", CATEGORIES[e.categorie].doux)}>
                        <span className="font-display text-[18px] font-extrabold leading-none">{jour}</span>
                        <span className="text-[10.5px] font-semibold uppercase">{m}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-ink">{e.titre}</span>
                        <span className="block truncate text-[12px] text-ink-muted">{periode(e)}</span>
                      </span>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold tabular-nums", encours ? "bg-success-bg text-success" : "bg-surface-2 text-ink-2")}>
                        {encours ? "En cours" : `J-${jours(auj, e.debut)}`}
                      </span>
                    </motion.li>
                  );
                })}
              </ul>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/** Infobulle d'une échéance de la frise (survol ou focus). */
function Infobulle({ e }: { e: Echeance }) {
  return (
    <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-[12px] text-white opacity-0 shadow-pop transition-opacity duration-150 group-hover:opacity-100">
      <span className="font-semibold">{e.titre}</span> · {periode(e)}
    </span>
  );
}

/* ------------------------------------------------------------------ 3. Inscrire son enfant */

const ETAPES = [
  { icone: School, titre: "Choisir l'école" },
  { icone: FileCheck2, titre: "Se présenter" },
  { icone: Fingerprint, titre: "Identité vérifiée" },
  { icone: Smartphone, titre: "Suivre en ligne" },
];

export function SectionInscription() {
  return (
    <Section id="inscription" surtitre="Démarche" titre="Inscrire son enfant"
      texte="Quatre étapes, et un dossier qui suit l'enfant d'une école à l'autre, sans ressaisie."
      lien={{ href: "/inscription-scolaire", libelle: "Voir les étapes et les pièces" }}
      apercu={
        <Carte>
          <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ETAPES.map((e, i) => (
              <motion.li key={e.titre} initial={{ y: 14 }} whileInView={{ y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08, duration: 0.45, ease: EASE }}
                className="flex flex-col items-center rounded-2xl bg-bg p-4 text-center">
                <span className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-blue-soft text-accent-ink">
                  <e.icone size={20} aria-hidden />
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-navy text-[11px] font-bold text-white">{i + 1}</span>
                </span>
                <span className="mt-2.5 text-[13px] font-semibold text-ink">{e.titre}</span>
              </motion.li>
            ))}
          </ol>
          <div className="mt-4 flex items-start gap-3 rounded-2xl bg-teal p-4 text-white">
            <Baby size={20} className="mt-0.5 shrink-0" aria-hidden />
            <p className="text-[14px] leading-relaxed"><strong>Pas d&apos;acte de naissance ?</strong> L&apos;enfant est inscrit quand même ; son identité est régularisée ensuite.</p>
          </div>
        </Carte>
      }
    />
  );
}

/* ------------------------------------------------------------------ 4. Résultats d'examens (e-résultat) */

const EXAMENS_CHIPS = [
  { examen: "CEP", libelle: "CEP" },
  { examen: "BEPC", libelle: "BEPC" },
  { examen: "BAC", libelle: "Bac" },
] as const;

/**
 * Entrée directe vers le service des résultats : l'examen se choisit ici, la session est la dernière
 * publiée par l'autorité (jamais une date supposée) ; le numéro de table ouvre le verdict.
 */
export function SectionResultats() {
  const router = useRouter();
  const [table, setTable] = useState("");
  const [choix, setChoix] = useState<string | null>(null);
  const { data: sessions, isPending } = useSessionsPubliees();
  const derniere = (examen: string) => (sessions ?? []).filter((x) => x.examen === examen).sort((a, b) => (b.publieeLe ?? "").localeCompare(a.publieeLe ?? ""))[0];
  const examen = choix ?? EXAMENS_CHIPS.find((x) => derniere(x.examen))?.examen ?? null;
  const session = examen ? derniere(examen) : undefined;
  return (
    <Section id="resultats" inverse fond surtitre="Examens nationaux" titre="Consulter les résultats"
      texte="CEP, BEPC, Baccalauréat : le verdict officiel publié par l'autorité de l'examen, avec votre seul numéro de table."
      lien={{ href: "/resultats", libelle: "Ouvrir le service des résultats" }}
      apercu={
        <Carte>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Examen">
            {EXAMENS_CHIPS.map((x) => {
              const ouvert = !!derniere(x.examen), actif = examen === x.examen;
              return (
                <button key={x.examen} type="button" role="radio" aria-checked={actif} disabled={!ouvert} onClick={() => setChoix(x.examen)}
                  title={ouvert ? undefined : "Aucune session publiée"}
                  className={cn("rounded-full px-4 py-1.5 text-[13px] font-semibold ring-1 ring-inset transition disabled:cursor-not-allowed disabled:opacity-45",
                    actif ? "bg-navy text-white ring-navy" : "text-ink-2 ring-line hover:bg-blue-soft hover:text-accent-ink")}>
                  {x.libelle}
                </button>
              );
            })}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); const t = table.trim(); if (t && session) router.push(`/resultats?examen=${session.examen}&session=${encodeURIComponent(session.session)}&table=${encodeURIComponent(t)}`); }} className="mt-3 flex gap-2">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Numéro de table</span>
              <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
              <input value={table} onChange={(e) => setTable(e.target.value.replace(/[^0-9A-Za-z-]/g, ""))} placeholder="N° de table" inputMode="numeric"
                className="h-12 w-full rounded-xl border border-line bg-bg pl-11 pr-3 font-mono text-[15px] text-ink outline-none transition focus:border-blue focus:ring-4 focus:ring-blue/15" />
            </label>
            <button type="submit" disabled={!table.trim() || !session} className="h-12 shrink-0 rounded-xl bg-navy px-5 text-[14px] font-semibold text-white transition hover:bg-navy-deep disabled:opacity-50">Consulter</button>
          </form>
          <p className="mt-3 min-h-[20px] text-[12.5px] text-ink-muted">
            {session ? <>Session <strong className="font-semibold text-ink-2">{session.session}</strong>{session.publieeLe ? `, publiée le ${dateLongue(session.publieeLe)}` : ""}</>
              : isPending ? " " : "Aucune session publiée pour le moment."}
          </p>
          <p className="mt-3 flex items-start gap-2 rounded-2xl bg-bg px-3.5 py-3 text-[13px] text-ink-2"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-accent-ink" aria-hidden /> Gratuit, sans compte. Seul le verdict s&apos;affiche : ni nom, ni établissement, ni note détaillée.</p>
        </Carte>
      }
    />
  );
}

/* ------------------------------------------------------------------ 5. L'éducation en chiffres */

export function SectionChiffres() {
  const { data } = useChiffres();
  const eleves = data?.indicateurs.find((i) => i.cle === "effectif");
  const top = [...(eleves?.departements ?? [])].sort((a, b) => (b.valeur ?? 0) - (a.valeur ?? 0)).slice(0, 6);
  const max = Math.max(1, ...top.map((d) => d.valeur ?? 0));
  return (
    <Section id="chiffres" inverse surtitre="Données ouvertes" titre="L'éducation en chiffres"
      texte="Les indicateurs clés par département, avec leur définition, leur source et leur indice de confiance."
      lien={{ href: "/donnees", libelle: "Explorer les données" }}
      apercu={
        <Carte>
          <p className="flex items-center gap-2 text-[13.5px] font-semibold text-ink"><ChartColumn size={16} className="text-accent-ink" aria-hidden /> Élèves par département</p>
          <ul className="mt-4 space-y-3">
            {(top.length ? top : Array.from({ length: 6 }, (_, i) => ({ id: String(i), nom: "", valeur: null }))).map((d, i) => (
              <li key={d.id} className="grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-3 text-[13px]">
                <span className="truncate text-ink-2">{d.nom || "…"}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                  <motion.span className="block h-full rounded-full bg-blue" initial={{ width: 0 }} whileInView={{ width: `${((d.valeur ?? 0) / max) * 100}%` }} viewport={{ once: true }} transition={{ delay: i * 0.07, duration: 0.8, ease: EASE }} />
                </span>
                <span className="text-right font-semibold tabular-nums text-ink">{d.valeur != null ? `${Math.round(d.valeur / 1000).toLocaleString("fr-FR")} k` : ""}</span>
              </li>
            ))}
          </ul>
          {eleves && <p className="mt-4 text-[12px] text-ink-muted">{eleves.periode} · indice de confiance {eleves.confiance} %</p>}
        </Carte>
      }
    />
  );
}

/* ------------------------------------------------------------------ Héros : trois chiffres du registre */

const compact = (v: number) => (v >= 1e6 ? `${(v / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M` : Math.round(v).toLocaleString("fr-FR"));

/** Trois chiffres lus en direct (registre et annuaire) ; la place est réservée pour qu'aucun contenu ne saute. */
export function ChiffresHeros() {
  const { data } = useChiffres();
  const { data: annuaire } = useAnnuaire({});
  const eleves = data?.indicateurs.find((i) => i.cle === "effectif");
  const ratio = data?.indicateurs.find((i) => i.cle === "ratio");
  const items = [
    { valeur: eleves?.valeur ?? null, format: compact, libelle: "élèves suivis" },
    { valeur: annuaire?.total ?? null, format: compact, libelle: "établissements" },
    { valeur: ratio?.valeur ?? null, format: (v: number) => v.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }), libelle: "élèves par enseignant" },
  ];
  return (
    <motion.dl initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.6, ease: EASE }}
      className="mt-10 grid max-w-lg grid-cols-3 divide-x divide-line/80 border-t border-line/70 pt-5">
      {items.map((x, i) => (
        <div key={x.libelle} className={cn("flex min-w-0 flex-col-reverse", i > 0 && "pl-4 sm:pl-6", i < 2 && "pr-3")}>
          <dt className="mt-1.5 text-[12px] leading-snug text-ink-muted sm:text-[13px]">{x.libelle}</dt>
          <dd className="font-display text-[22px] font-extrabold leading-none tracking-tight text-ink sm:text-[28px]">
            {x.valeur != null ? <Compteur valeur={x.valeur} format={x.format} /> : <span className="inline-block h-[22px] w-16 animate-pulse rounded-md bg-surface-2 align-top sm:h-7" />}
          </dd>
        </div>
      ))}
    </motion.dl>
  );
}

/* ------------------------------------------------------------------ Services directs */

const SERVICES = [
  { href: "/resultats", icone: Award, titre: "Résultats d'examens", texte: "CEP, BEPC, Bac : le verdict officiel", teinte: "bg-blue-soft text-accent-ink" },
  { href: "/verifier", icone: ShieldCheck, titre: "Vérifier un diplôme", texte: "Authentique ou non, en un scan", teinte: "bg-success-bg text-success" },
  { href: "/etablissements", icone: MapPin, titre: "Trouver un établissement", texte: "Par nom, par lieu, autour de vous", teinte: "bg-teal/10 text-teal" },
  { href: "/calendrier", icone: CalendarDays, titre: "Calendrier scolaire", texte: "Rentrée, congés et examens", teinte: "bg-warning-bg text-warning" },
  { href: "/inscription-scolaire", icone: UserPlus, titre: "Inscrire son enfant", texte: "Les étapes et les pièces", teinte: "bg-info-bg text-info" },
];

/** Les cinq services publics, un geste chacun : liste compacte sur téléphone, cartes sur grand écran. */
export function ServicesDirects() {
  return (
    <section aria-labelledby="services-titre" className="relative">
      <div className="mx-auto w-full max-w-6xl px-5 pb-14 sm:px-8 lg:pb-16">
        <h2 id="services-titre" className="text-[12px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Services publics · sans compte</h2>
        <ul className="mt-4 grid gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-5">
          {SERVICES.map((x, i) => (
            <motion.li key={x.href} initial={{ y: 16 }} whileInView={{ y: 0 }} viewport={{ once: true, margin: "-30px" }} transition={{ delay: i * 0.06, duration: 0.5, ease: EASE }}
              className={cn(i === 4 && "sm:col-span-2 lg:col-span-1")}>
              <Link href={x.href}
                className="group flex h-full items-center gap-3.5 rounded-2xl border border-line/70 bg-surface p-3.5 shadow-sm outline-none transition duration-200 hover:-translate-y-0.5 hover:border-blue/30 hover:shadow-float focus-visible:ring-4 focus-visible:ring-blue/20 lg:flex-col lg:items-start lg:gap-0 lg:p-5">
                <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105", x.teinte)}><x.icone size={21} aria-hidden /></span>
                <span className="min-w-0 flex-1 lg:mt-4">
                  <span className="block text-[14.5px] font-semibold leading-tight text-ink">{x.titre}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-muted lg:mt-1">{x.texte}</span>
                </span>
                <ArrowRight size={17} className="shrink-0 text-ink-muted transition-all duration-200 group-hover:translate-x-1 group-hover:text-accent-ink lg:mt-4" aria-hidden />
              </Link>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Couche nationale */

type Maillon = { icone: typeof Award; nom: string; fait: string };
const SOURCES: Maillon[] = [
  { icone: UserRoundCheck, nom: "EducMaster", fait: "Présences et vie scolaire" },
  { icone: Award, nom: "eRESULTATS", fait: "PV officiels des examens" },
  { icone: GraduationCap, nom: "SI des universités", fait: "Délibérations et diplômes" },
  { icone: HandCoins, nom: "DBAU", fait: "Bourses et allocations" },
];
const USAGES: Maillon[] = [
  { icone: Users, nom: "Familles et élèves", fait: "Le parcours complet, en direct" },
  { icone: School, nom: "Établissements", fait: "Un dossier sans ressaisie" },
  { icone: Landmark, nom: "Pilotage", fait: "Des indicateurs fiables" },
  { icone: ShieldCheck, nom: "Tout public", fait: "Des diplômes vérifiables" },
];

/** Flux animé entre deux colonnes : vertical sur téléphone, horizontal sur grand écran. */
function Flux() {
  return (
    <div className="flex items-center justify-center py-1 lg:px-2 lg:py-0" aria-hidden>
      <span className="relative block h-10 w-px overflow-hidden bg-line lg:h-px lg:w-full">
        {[0, 1, 2].map((i) => (
          <motion.span key={`v${i}`} className="absolute left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-blue lg:hidden"
            animate={{ top: ["-15%", "105%"] }} transition={{ duration: 1.8, delay: i * 0.6, repeat: Infinity, ease: "linear" }} />
        ))}
        {[0, 1, 2].map((i) => (
          <motion.span key={`h${i}`} className="absolute top-1/2 hidden h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-blue lg:block"
            animate={{ left: ["-10%", "102%"] }} transition={{ duration: 1.8, delay: i * 0.6, repeat: Infinity, ease: "linear" }} />
        ))}
      </span>
    </div>
  );
}

function Pile({ titre, items, delai }: { titre: string; items: Maillon[]; delai: number }) {
  return (
    <div className="min-w-0">
      <p className="mb-3 text-center text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-muted lg:text-left">{titre}</p>
      <ul className="grid grid-cols-2 gap-2 lg:grid-cols-1">
        {items.map((x, i) => (
          <motion.li key={x.nom} initial={{ y: 10 }} whileInView={{ y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ delay: delai + i * 0.07, duration: 0.45, ease: EASE }}
            className="flex min-w-0 items-center gap-2.5 rounded-xl border border-line/70 bg-bg p-2.5 sm:p-3">
            <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-soft text-accent-ink sm:flex"><x.icone size={16} aria-hidden /></span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold leading-tight text-ink">{x.nom}</span>
              <span className="block text-[11.5px] leading-snug text-ink-muted">{x.fait}</span>
            </span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Le positionnement : BEILE ne remplace pas les systèmes nationaux en place ; il reçoit leurs faits
 * par connecteur signé, les rattache au NPI et les rend utiles à chacun.
 */
export function SectionCoucheNationale() {
  return (
    <section id="couche-nationale" className="relative scroll-mt-20 overflow-hidden bg-surface">
      <div className="pointer-events-none absolute -right-40 top-0 h-96 w-96 rounded-full bg-blue-soft/60 blur-3xl" aria-hidden />
      <div className="relative mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 lg:py-20">
        <motion.div initial={{ y: 16 }} whileInView={{ y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.6, ease: EASE }} className="max-w-2xl">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-accent-ink">Couche nationale</p>
          <h2 className="mt-2 font-display text-[28px] font-extrabold leading-tight tracking-tight text-ink sm:text-[34px]">Relier l&apos;existant, pas le remplacer</h2>
          <p className="mt-3 text-[16px] leading-relaxed text-ink-2">Les systèmes déjà en service transmettent leurs faits par connecteur signé. BEILE les rattache à l&apos;identité de chaque apprenant (NPI), les scelle au registre et les rend utiles à chacun.</p>
        </motion.div>

        <div className="mt-10 grid items-center gap-2 lg:grid-cols-[minmax(0,1fr)_64px_minmax(0,0.95fr)_64px_minmax(0,1fr)] lg:gap-0">
          <Pile titre="Systèmes en place" items={SOURCES} delai={0} />
          <Flux />
          <motion.div initial={{ scale: 0.96 }} whileInView={{ scale: 1 }} viewport={{ once: true, margin: "-40px" }} transition={{ delay: 0.2, duration: 0.6, ease: EASE }}
            className="relative overflow-hidden rounded-3xl bg-navy p-6 text-white shadow-float">
            <span className="absolute inset-x-0 top-0 flex h-1" aria-hidden><span className="flex-1 bg-flag-green" /><span className="flex-1 bg-flag-yellow" /><span className="flex-1 bg-flag-red" /></span>
            <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-white/60"><Fingerprint size={15} aria-hidden /> Registre BEILE</p>
            <p className="mt-2 font-display text-[21px] font-bold leading-tight">Un fait reçu, contrôlé, scellé</p>
            <ul className="mt-4 space-y-2.5 text-[13.5px] text-white/85">
              {["Signature et horodatage vérifiés à chaque lot", "Rattachement à l'apprenant par son NPI", "Rejeu sans doublon, provenance tracée", "Diplômes scellés, vérifiables par tous"].map((t) => (
                <li key={t} className="flex items-start gap-2"><CircleCheck size={16} className="mt-0.5 shrink-0 text-flag-yellow" aria-hidden /> {t}</li>
              ))}
            </ul>
          </motion.div>
          <Flux />
          <Pile titre="Au service de" items={USAGES} delai={0.35} />
        </div>
        <p className="mt-6 text-[12px] text-ink-muted">Connecteurs démontrés sur données de recette ; le raccordement effectif de chaque système suit la convention signée avec son opérateur.</p>
      </div>
    </section>
  );
}
