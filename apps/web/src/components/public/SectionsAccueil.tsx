"use client";

import { ArrowRight, BadgeCheck, Baby, CalendarClock, ChartColumn, FileCheck2, Fingerprint, LocateFixed, School, Search, Smartphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Compteur, EASE, motion } from "@/components/motion";
import { CarteBenin, RAMPE_CLAIRE } from "@/components/map/CarteBenin";
import { DEPARTEMENTS } from "@beile/simulation/territoire";
import { cn } from "@/lib/cn";
import { NIVEAUX_PUBLICS, useCalendrier, useChiffres } from "@/lib/api/public";
import { avancement, CATEGORIES, lignesFrise, periode, position, prochaine } from "@/lib/calendrier";

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
            <Link href="/etablissements" className="inline-flex items-center gap-1.5 rounded-full bg-teal/10 px-3.5 py-1.5 text-[13px] font-semibold text-teal transition hover:bg-teal/15"><LocateFixed size={14} aria-hidden /> Autour de moi</Link>
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

export function SectionCalendrier() {
  const { data } = useCalendrier();
  const ev = data?.evenements ?? [];
  const auj = data?.aujourdhui ?? "";
  const suite = data ? prochaine(ev, auj) : null;
  const prog = data ? avancement(ev, auj) : null;
  const lignes = lignesFrise(ev).filter((l) => l.libelle !== "Fériés et étapes");
  const officiel = ev.length > 0 && ev.every((e) => e.statut === "officiel");
  return (
    <Section id="calendrier" inverse fond surtitre={data?.annee ? `Année scolaire ${data.annee}` : "Calendrier scolaire"} titre="Où en est l'année ?"
      texte={officiel ? "Trimestres, congés et jours fériés, selon le calendrier officiel." : "Rentrée, congés et examens de l'année scolaire."}
      lien={{ href: "/calendrier", libelle: "Voir le calendrier complet" }}
      apercu={
        <Carte className="overflow-hidden p-0 sm:p-0">
          <div className="bg-navy p-5 text-white sm:p-6">
            <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-white/60"><CalendarClock size={15} aria-hidden /> Prochaine échéance</p>
            {suite ? (
              <div className="mt-2 flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-display text-[20px] font-bold leading-tight">{suite.echeance.titre}</p>
                  <p className="mt-1 text-[13.5px] text-white/75">{periode(suite.echeance).replace(/^\w/, (x) => x.toUpperCase())}</p>
                </div>
                <p className="shrink-0 text-right">
                  {suite.enCours ? <span className="font-display text-[22px] font-extrabold text-flag-yellow">En cours</span>
                    : <><span className="font-display text-[40px] font-extrabold leading-none text-flag-yellow"><Compteur valeur={suite.dans} format={(v) => String(Math.round(v))} /></span><span className="block text-[12.5px] text-white/70">jours</span></>}
                </p>
              </div>
            ) : <p className="mt-2 text-white/80">{data ? "Calendrier en cours de publication." : "…"}</p>}
          </div>
          <div className="p-5 sm:p-6">
            {suite?.periodeEnCours && <p className="text-[13px] font-medium text-ink-2">{suite.periodeEnCours.titre} · semaine {suite.periodeEnCours.semaine} sur {suite.periodeEnCours.semaines}</p>}
            {prog && (
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-2">
                <motion.div className="h-full rounded-full bg-[linear-gradient(90deg,#008751,#FCD116,#E8112D)]" initial={{ width: 0 }} whileInView={{ width: `${prog.pourcentage}%` }} viewport={{ once: true }} transition={{ duration: 1.1, ease: EASE }} />
              </div>
            )}
            <div className="relative mt-5 space-y-2">
              {lignes.map((l, ligne) => (
                <div key={l.libelle} className="relative h-5">
                  {l.echeances.map((e) => {
                    const g = position(data!.annee!, e.debut), d = position(data!.annee!, e.fin);
                    return (
                      <motion.span key={e.id} title={`${e.titre} — ${periode(e)}`} className={cn("absolute top-0 h-5 origin-left rounded-full", CATEGORIES[e.categorie].barre)}
                        style={{ left: `${g}%`, width: `max(${d - g}%, 14px)` }}
                        initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ delay: 0.2 + (g / 100) * 1 + ligne * 0.05, duration: 0.45, ease: EASE }} />
                    );
                  })}
                </div>
              ))}
              {data?.annee && auj && prog && !prog.avant && !prog.apres && (
                <motion.span className="absolute -bottom-1 -top-1 w-0.5 rounded-full bg-navy" initial={{ left: "0%" }} whileInView={{ left: `${position(data.annee, auj)}%` }} viewport={{ once: true }} transition={{ delay: 0.3, duration: 1.1, ease: EASE }} aria-hidden />
              )}
            </div>
            <div className="mt-3 flex justify-between text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted"><span>Sept.</span><span>Déc.</span><span>Mars</span><span>Juil.</span></div>
          </div>
        </Carte>
      }
    />
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

/* ------------------------------------------------------------------ 4. L'éducation en chiffres */

export function SectionChiffres() {
  const { data } = useChiffres();
  const eleves = data?.indicateurs.find((i) => i.cle === "effectif");
  const top = [...(eleves?.departements ?? [])].sort((a, b) => (b.valeur ?? 0) - (a.valeur ?? 0)).slice(0, 6);
  const max = Math.max(1, ...top.map((d) => d.valeur ?? 0));
  return (
    <Section id="chiffres" inverse fond surtitre="Données ouvertes" titre="L'éducation en chiffres"
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

/* ------------------------------------------------------------------ 5. Vérifier un diplôme */

export function SectionVerification() {
  const router = useRouter();
  const [id, setId] = useState("");
  return (
    <Section id="verifier" surtitre="Service de confiance" titre="Vérifier un diplôme"
      texte="Employeurs et administrations vérifient en quelques secondes qu'un diplôme est authentique."
      lien={{ href: "/verifier", libelle: "Plus d'options (QR code)" }}
      apercu={
        <Carte>
          <form onSubmit={(e) => { e.preventDefault(); if (id.trim()) router.push(`/verifier/${encodeURIComponent(id.trim().toUpperCase())}`); }} className="space-y-3">
            <label htmlFor="accueil-diplome" className="block text-[13px] font-medium text-ink-2">Identifiant du diplôme</label>
            <input id="accueil-diplome" value={id} onChange={(e) => setId(e.target.value)} placeholder="CERT-BEPC-2026-000123" spellCheck={false}
              className="h-12 w-full rounded-xl border border-line bg-bg px-4 font-mono text-[15px] uppercase text-ink outline-none transition focus:border-blue focus:ring-4 focus:ring-blue/15" />
            <button type="submit" className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-navy text-[15px] font-semibold text-white transition hover:bg-navy-deep">
              <BadgeCheck size={18} aria-hidden /> Vérifier
            </button>
          </form>
          <p className="mt-3 text-[12.5px] text-ink-muted">L&apos;identifiant figure sur le diplôme, sous le QR code.</p>
        </Carte>
      }
    />
  );
}
