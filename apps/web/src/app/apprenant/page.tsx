"use client";

import {
  ArrowRightLeft, Award, BookOpenCheck, CalendarCheck, CalendarX2, Check, ChevronRight, Fingerprint, GraduationCap, NotebookPen, RefreshCw,
  Route, School, ShieldAlert, Sigma, Sparkles, TrendingUp, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Courbes } from "@/components/charts/Graphiques";
import { Cascade, Compteur, EASE, Element, EntreePage, motion } from "@/components/motion";
import { TuileIndicateur } from "@/components/ui/donnees";
import { Badge, Button, Card, CardHeader, EtatVide, Etiquette, PageHeader, Squelette } from "@/components/ui/primitives";
import {
  absencesParJour, jalonsParcours, libelleTrimestre, moyennesParMatiere, NOM_EXAMEN, nomComplet, syntheseScolaire, usePasseport,
  type Dossier, type Jalon, type TypeJalon,
} from "@/lib/api/parcours";
import { cn } from "@/lib/cn";
import { date, nombre } from "@/lib/format";
import { ErreurApi } from "@/lib/http";

const ICONES: Record<TypeJalon, LucideIcon> = {
  inscription: School, transfert: ArrowRightLeft, passage: GraduationCap, examen: BookOpenCheck, diplome: Award, bilan: CalendarCheck,
  abandon: ShieldAlert, reprise: RefreshCw, justification: Check,
};

export default function Passeport() {
  const q = usePasseport();
  return (
    <EntreePage>
      <div className="space-y-5">
        <PageHeader surtitre="Passeport éducatif" titre="Mon parcours" sousTitre="Tout votre parcours scolaire, reconstitué à partir de faits vérifiables, quelle que soit l'école fréquentée." />
        {q.isPending ? <Chargement /> : q.isError ? <Erreur erreur={q.error} onReessayer={() => q.refetch()} /> : <Contenu d={q.data} />}
      </div>
    </EntreePage>
  );
}

function Contenu({ d }: { d: Dossier }) {
  const s = useMemo(() => syntheseScolaire(d), [d]);
  const jalons = useMemo(() => jalonsParcours(d), [d]);
  const absences = useMemo(() => absencesParJour(d.evenements), [d]);
  const annuelles = useMemo(() => moyennesParMatiere(s.notes, s.annee).sort((a, b) => b.moyenne - a.moyenne), [s]);
  const a = d.apprenant;
  const etab = d.situation.etablissementId ? d.etablissements[d.situation.etablissementId] : null;

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5, ease: EASE }}
        className="relative overflow-hidden rounded-2xl text-white shadow-pop" style={{ background: "linear-gradient(135deg, var(--acc), #0a3764)" }}>
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <div className="relative p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">République du Bénin · passeport éducatif</p>
            <Fingerprint size={22} className="shrink-0 text-white/70" aria-hidden />
          </div>
          <p className="mt-3 font-display text-[26px] font-bold leading-tight sm:text-[30px]">{nomComplet(a)}</p>
          <p className="mt-1 text-sm text-white/85">{d.situation.classe?.libelle ?? "Aucune classe en cours"}{etab ? ` · ${etab}` : ""}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-[11.5px]">
            <span className="rounded-full bg-white/15 px-2.5 py-1 font-mono">{a.id}</span>
            <span className="rounded-full bg-white/15 px-2.5 py-1">{a.statutIdentite === "verifiee" ? "Identité vérifiée au registre national" : "Identité en cours de régularisation"}</span>
            {d.situation.classe && <span className="rounded-full bg-white/15 px-2.5 py-1">Année {d.situation.classe.anneeScolaire}</span>}
          </div>
        </div>
      </motion.div>

      <Cascade className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Element>
          <TuileIndicateur libelle={s.courant ? `Moyenne T${s.courant}` : "Moyenne"} icone={Sigma} accent="bleu" valeur={s.moyenne != null ? <Compteur valeur={s.moyenne} format={(n) => nombre(n, 2)} /> : "—"} unite={s.moyenne != null ? "/20" : undefined}
            variation={s.evolution != null ? { texte: `${s.evolution >= 0 ? "+" : ""}${nombre(s.evolution, 2)} depuis le T${s.precedent}`, favorable: s.evolution >= 0 } : undefined} />
        </Element>
        <Element><TuileIndicateur libelle="Évaluations" icone={NotebookPen} valeur={<Compteur valeur={s.notes.filter((n) => n.anneeScolaire === s.annee).length} format={(n) => nombre(n)} />} indice={`année ${s.annee ?? "—"}`} /></Element>
        <Element><TuileIndicateur libelle="Absences" icone={CalendarX2} accent={absences.some((x) => x.statut === "a_justifier") ? "ambre" : "neutre"} valeur={<Compteur valeur={absences.length} format={(n) => nombre(n)} />} indice={absences.length ? `dernière le ${date(absences[0]!.date)}` : "aucune"} /></Element>
        <Element><TuileIndicateur libelle="Diplômes" icone={Award} accent="sarcelle" valeur={<Compteur valeur={d.certificats.filter((c) => !c.revoque).length} format={(n) => nombre(n)} />} indice="vérifiables en ligne" /></Element>
      </Cascade>

      {annuelles.length > 0 ? (
        <Card className="min-w-0">
          <CardHeader icon={Sparkles} title="Mes points forts" subtitle={`Moyennes de l'année ${s.annee}, de la plus haute à la plus basse`} />
          <ul className="space-y-3">
            {annuelles.map((m, i) => (
              <li key={m.matiere} className="flex items-center gap-3">
                <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold", i < 3 ? "text-white" : "bg-surface-2 text-ink-muted")} style={i < 3 ? { background: "var(--acc)" } : undefined}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm"><span className="truncate text-ink">{m.matiere}</span><span className="shrink-0 font-semibold tabular-nums text-ink">{nombre(m.moyenne, 2)}</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <motion.div className="h-full rounded-full" initial={{ width: 0 }} whileInView={{ width: `${(m.moyenne / 20) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.05 * i, ease: EASE }} style={{ background: m.moyenne >= 10 ? "var(--acc)" : "var(--critical)" }} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {s.parTrimestre.length > 1 && (
            <div className="mt-6 min-w-0">
              <Etiquette>Progression de la moyenne générale</Etiquette>
              <Courbes className="mt-2 w-full" hauteur={170} formater={(v) => nombre(v, 2)} series={[{ nom: "Moyenne générale", points: s.parTrimestre.map((t) => ({ x: libelleTrimestre(t.trimestre), y: t.moyenne })) }]} />
            </div>
          )}
        </Card>
      ) : (
        <Card><EtatVide icone={NotebookPen} titre="Pas encore de note cette année" texte="Vos moyennes apparaîtront dès la première évaluation saisie par vos enseignants." /></Card>
      )}

      {d.certificats.length > 0 && (
        <Link href="/apprenant/preuves" className="flex items-center gap-3 rounded-xl border border-line/70 bg-surface p-4 shadow-float transition hover:-translate-y-1 hover:shadow-pop">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: "var(--acc)" }}><Award size={20} aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">{d.certificats.map((c) => NOM_EXAMEN[c.examen] ?? c.examen).join(" · ")}</p>
            <p className="text-[13px] text-ink-2">Partagez vos diplômes : QR code et lien de vérification</p>
          </div>
          <ChevronRight size={18} className="shrink-0 text-ink-muted" aria-hidden />
        </Link>
      )}

      <Card className="min-w-0">
        <CardHeader icon={Route} title="Ma frise" subtitle="Du plus récent au plus ancien · chaque étape indique sa source" />
        {jalons.length ? <Frise jalons={jalons} /> : <EtatVide icone={Route} titre="Parcours vide" texte="Votre parcours se construira au fil de votre scolarité." />}
      </Card>
    </>
  );
}

/** Frise chronologique : regroupée par année, le fil se trace à mesure que l'on fait défiler. */
function Frise({ jalons }: { jalons: Jalon[] }) {
  const annees = useMemo(() => {
    const m = new Map<string, Jalon[]>();
    for (const j of jalons) { const k = j.date.slice(0, 4); m.set(k, [...(m.get(k) ?? []), j]); }
    return [...m];
  }, [jalons]);
  return (
    <div className="space-y-6">
      {annees.map(([annee, liste]) => (
        <section key={annee}>
          <motion.p initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="mb-3 inline-flex rounded-full px-3 py-1 font-display text-sm font-bold" style={{ background: "var(--acc-doux)", color: "var(--acc)" }}>{annee}</motion.p>
          <ol className="relative ml-4 pl-7">
            <motion.span className="absolute bottom-2 left-0 top-2 w-0.5 origin-top rounded-full bg-line" initial={{ scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.8, ease: EASE }} aria-hidden />
            {liste.map((j, i) => {
              const Icone = ICONES[j.type];
              return (
                <motion.li key={j.id} initial={{ opacity: 0, x: 14 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "-30px" }} transition={{ duration: 0.45, delay: Math.min(i, 12) * 0.05, ease: EASE }} className="relative pb-5 last:pb-0">
                  <motion.span initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ type: "spring", stiffness: 420, damping: 20, delay: Math.min(i, 12) * 0.05 + 0.1 }}
                    className="absolute -left-[43px] flex h-8 w-8 items-center justify-center rounded-full ring-4 ring-surface" style={{ background: j.accent ? "var(--acc)" : "var(--surface-2)", color: j.accent ? "#fff" : "var(--acc)" }}>
                    <Icone size={15} aria-hidden />
                  </motion.span>
                  <Etiquette>{date(j.date)} · source {j.source}</Etiquette>
                  <p className="mt-0.5 text-[15px] font-semibold text-ink">{j.titre}</p>
                  <p className="text-[13.5px] text-ink-2">{j.detail}</p>
                  {j.type === "diplome" && <Badge ton="succes" className="mt-1.5">Preuve vérifiable</Badge>}
                </motion.li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

function Chargement() {
  return (
    <div className="space-y-5" aria-busy aria-label="Chargement du passeport">
      <Squelette className="h-44 rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Squelette key={i} className="h-[92px] rounded-lg" />)}</div>
      <div className="space-y-3 rounded-xl border border-line/70 bg-surface p-5 shadow-float">{[0, 1, 2, 3, 4].map((i) => <Squelette key={i} className="h-7" />)}</div>
    </div>
  );
}

function Erreur({ erreur, onReessayer }: { erreur: Error; onReessayer: () => void }) {
  const refus = erreur instanceof ErreurApi && erreur.refus;
  return (
    <Card>
      <EtatVide icone={refus ? ShieldAlert : TrendingUp} titre={refus ? "Accès refusé" : "Passeport momentanément indisponible"}
        texte={refus ? `${erreur.message.startsWith("Erreur ") ? "Le contrôle d'accès n'autorise pas la consultation de ce passeport" : erreur.message}. Ce refus a été enregistré au journal d'audit.` : `${erreur.message}. Réessayez dans un instant.`}
        action={refus ? undefined : <Button variante="secondaire" icone={RefreshCw} onClick={onReessayer}>Réessayer</Button>} />
    </Card>
  );
}
