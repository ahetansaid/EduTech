"use client";

import { ArrowRight, CalendarCheck, ClipboardCheck, PenLine, Star, TrendingUp, UserX, Users } from "lucide-react";
import Link from "next/link";
import { Cascade, Compteur, Element, EntreePage, motion } from "@/components/motion";
import { Badge, Card, EtatVide, Etiquette, PageHeader, Squelette } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { dateLongue, nombre } from "@/lib/format";
import { useMesClasses, useSynchronisationEnseignant, type ClasseEnseignant } from "@/lib/api/enseignant";
import { BandeauFile, DonneesAnciennes, Erreur } from "./communs";

export default function EspaceEnseignant() {
  useSynchronisationEnseignant();
  const { data, isPending, error, refetch, isRefetching } = useMesClasses();

  if (isPending) return <Chargement />;
  if (!data) return <Erreur erreur={error!} relancer={() => refetch()} enCours={isRefetching} />;

  const { enseignant, classes, date, trimestre } = data;
  const effectif = classes.reduce((s, c) => s + c.effectif, 0);
  const absents = classes.reduce((s, c) => s + c.absentsDuJour, 0);

  const notees = classes.filter((c) => c.moyenne != null);
  const moyenne = notees.length ? notees.reduce((t, c) => t + c.moyenne! * c.effectif, 0) / Math.max(1, notees.reduce((t, c) => t + c.effectif, 0)) : null;

  return (
    <EntreePage>
      <div className="space-y-6">
        <PageHeader
          surtitre={[date ? dateLongue(date) : null, classes[0]?.etablissement].filter(Boolean).join(" · ")}
          titre={`Bonjour ${enseignant.prenoms}`}
          sousTitre="L'appel et les notes que vous saisissez alimentent directement les bulletins et informent les familles : aucune ressaisie."
        />

        <BandeauFile />
        {error && <DonneesAnciennes relancer={() => refetch()} enCours={isRefetching} />}

        <Cascade className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Element><Tuile libelle="Classes" valeur={classes.length} icone={CalendarCheck} indication={`${enseignant.matieres.join(", ")}`} /></Element>
          <Element><Tuile libelle="Élèves" valeur={effectif} icone={Users} indication="effectif scolarisé" /></Element>
          <Element><Tuile libelle="Absents" valeur={absents} icone={UserX} alerte={absents > 0} indication={effectif ? `aujourd'hui · ${nombre((absents / effectif) * 100, 1)} %` : "aujourd'hui"} /></Element>
          <Element><Tuile libelle="Moyenne" valeur={moyenne ?? 0} decimales={2} vide={moyenne == null} icone={TrendingUp} indication={trimestre ? `trimestre ${trimestre}, vos matières` : "vos matières"} /></Element>
        </Cascade>

        {classes.length === 0 ? (
          <Card><EtatVide icone={CalendarCheck} titre="Aucune classe attribuée" texte="Aucune relation pédagogique n'est enregistrée à votre nom pour cette année. Rapprochez-vous de votre chef d'établissement." /></Card>
        ) : (
          <section aria-labelledby="titre-classes">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 id="titre-classes" className="text-[17px] font-semibold text-ink">Mes classes</h2>
              {trimestre && <Etiquette>Trimestre {trimestre}</Etiquette>}
            </div>
            <Cascade className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {classes.map((c) => <Element key={c.id}><CarteClasse classe={c} /></Element>)}
            </Cascade>
          </section>
        )}
      </div>
    </EntreePage>
  );
}

function Tuile({ libelle, valeur, icone: Icone, alerte, indication, decimales = 0, vide }: { libelle: string; valeur: number; icone: typeof Users; alerte?: boolean; indication?: string; decimales?: number; vide?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-line/70 bg-surface p-4 shadow-float">
      <div className="flex items-start justify-between gap-2">
        <Etiquette className="truncate">{libelle}</Etiquette>
        <Icone size={16} aria-hidden className={alerte ? "text-critical" : "text-ink-muted"} />
      </div>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums", alerte ? "text-critical" : "text-ink")}>
        {vide ? "—" : <Compteur valeur={valeur} format={(n) => nombre(n, decimales)} />}
      </p>
      {indication && <p className="mt-0.5 truncate text-xs text-ink-muted">{indication}</p>}
    </div>
  );
}

/** Teinte de la moyenne : rouge sous 10, orange sous 12, vert au-delà. */
const tonMoyenne = (m: number | null) => (m == null ? "text-ink-muted" : m < 10 ? "text-critical" : m < 12 ? "text-warning" : "text-success");
const fondMoyenne = (m: number | null) => (m == null ? "bg-line" : m < 10 ? "bg-critical" : m < 12 ? "bg-warning" : "bg-success");

function CarteClasse({ classe: c }: { classe: ClasseEnseignant }) {
  const presents = Math.max(0, c.effectif - c.absentsDuJour);
  const tauxPresence = c.effectif ? presents / c.effectif : 1;
  const remplissage = c.capacite ? Math.min(1, c.effectif / c.capacite) : 0;
  return (
    <Card className="flex h-full min-w-0 flex-col p-4 transition-shadow duration-200 hover:shadow-pop sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/enseignant/classe/${c.id}`} className="group min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-muted">
            {c.matieres.join(", ")}
            {c.principal && <Badge ton="marque" icone={Star}>Prof. principal</Badge>}
          </p>
          <p className="mt-1 flex items-center gap-1.5 font-display text-[26px] font-bold leading-none text-ink">
            {c.libelle}
            <ArrowRight size={18} className="text-ink-muted transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
          </p>
        </Link>
        <AnneauPresence taux={tauxPresence} />
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-surface-2/70 px-1.5 py-2.5">
          <dt className="text-[11px] text-ink-muted">Élèves</dt>
          <dd className="mt-0.5 font-display text-[20px] font-bold tabular text-ink">{c.effectif}</dd>
        </div>
        <div className={cn("rounded-lg px-1.5 py-2.5", c.absentsDuJour ? "bg-critical-bg" : "bg-surface-2/70")}>
          <dt className="text-[11px] text-ink-muted">Absents</dt>
          <dd className={cn("mt-0.5 font-display text-[20px] font-bold tabular", c.absentsDuJour ? "text-critical" : "text-ink")}>{c.absentsDuJour}</dd>
        </div>
        <div className="rounded-lg bg-surface-2/70 px-1.5 py-2.5">
          <dt className="text-[11px] text-ink-muted">Moyenne</dt>
          <dd className={cn("mt-0.5 font-display text-[20px] font-bold tabular", tonMoyenne(c.moyenne))}>{nombre(c.moyenne, 1)}</dd>
        </div>
      </dl>

      {/* Moyenne sur 20 et remplissage de la classe */}
      <div className="mt-4 space-y-2.5">
        <Jauge libelle="Moyenne du trimestre" valeur={c.moyenne == null ? 0 : c.moyenne / 20} teinte={fondMoyenne(c.moyenne)} texte={c.moyenne == null ? "aucune note" : `${nombre(c.moyenne, 2)}/20`} />
        <Jauge libelle="Effectif / capacité" valeur={remplissage} teinte={remplissage > 0.95 ? "bg-warning" : "bg-[var(--acc)]"} texte={`${c.effectif}/${c.capacite}`} />
      </div>

      <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
        <Link href={`/enseignant/classe/${c.id}?onglet=appel`} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg text-[14px] font-semibold text-white shadow-sm transition active:scale-[0.97]" style={{ background: "var(--acc)" }}>
          <ClipboardCheck size={18} aria-hidden /> Appel
        </Link>
        <Link href={`/enseignant/classe/${c.id}?onglet=notes`} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-surface text-[14px] font-semibold text-ink ring-1 ring-inset ring-line transition hover:bg-surface-2 active:scale-[0.97]">
          <PenLine size={18} aria-hidden /> Notes
        </Link>
      </div>
    </Card>
  );
}

function Jauge({ libelle, valeur, teinte, texte }: { libelle: string; valeur: number; teinte: string; texte: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11.5px]"><span className="text-ink-muted">{libelle}</span><span className="font-medium tabular text-ink-2">{texte}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <motion.div className={cn("h-full rounded-full", teinte)} initial={{ width: 0 }} animate={{ width: `${Math.round(valeur * 100)}%` }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }} />
      </div>
    </div>
  );
}

/** Anneau du taux de présence du jour. */
function AnneauPresence({ taux }: { taux: number }) {
  const r = 20, circ = 2 * Math.PI * r;
  return (
    <div className="relative h-16 w-16 shrink-0" role="img" aria-label={`Présence du jour : ${Math.round(taux * 100)} %`}>
      <svg viewBox="0 0 48 48" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="24" cy="24" r={r} fill="none" strokeWidth="5" className="stroke-surface-2" />
        <motion.circle cx="24" cy="24" r={r} fill="none" strokeWidth="5" strokeLinecap="round" style={{ stroke: "var(--acc)" }}
          strokeDasharray={circ} initial={{ strokeDashoffset: circ }} animate={{ strokeDashoffset: circ * (1 - taux) }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-[13px] font-bold tabular-nums text-ink">{Math.round(taux * 100)} %</span>
        <span className="mt-0.5 text-[9px] text-ink-muted">présents</span>
      </span>
    </div>
  );
}

function Chargement() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Chargement de vos classes">
      <div className="space-y-2"><Squelette className="h-4 w-48" /><Squelette className="h-8 w-64" /><Squelette className="h-4 w-full max-w-xl" /></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Squelette key={i} className="h-20 rounded-xl" />)}</div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1].map((i) => <Squelette key={i} className="h-80 rounded-xl" />)}</div>
    </div>
  );
}
