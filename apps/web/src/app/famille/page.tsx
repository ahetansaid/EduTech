"use client";

import {
  ArrowRightLeft, Award, Bell, BookOpenCheck, CalendarCheck, CalendarX2, Check, ChevronDown, ChevronRight, Fingerprint, GraduationCap,
  History, Lock, NotebookPen, Printer, RefreshCw, School, Send, ShieldAlert, Sigma, TrendingUp, UserRound, X, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, Cascade, Compteur, EASE, Element, EntreePage, motion } from "@/components/motion";
import { useNotifications } from "@/components/shell/Cloche";
import { TuileIndicateur } from "@/components/ui/donnees";
import { notifier } from "@/components/ui/Notifications";
import { Badge, Button, Card, CardHeader, EtatVide, Etiquette, PageHeader, Segmente, Squelette, type Ton } from "@/components/ui/primitives";
import { Bulletin } from "@/components/bulletin/Bulletin";
import {
  absencesParJour, ageAu, initiales, jalonsParcours, libelleTrimestre, nomComplet, syntheseScolaire, useEnfants, useJustifierAbsenceMutation,
  type Dossier, type JourAbsence, type TypeJalon,
} from "@/lib/api/parcours";
import { bulletinDepuisDossier } from "@/lib/bulletin";
import { cn } from "@/lib/cn";
import { date, dateLongue, nombre } from "@/lib/format";
import { ErreurApi } from "@/lib/http";
import { useProfil } from "@/lib/session";

/* Statuts d'absence : mapping central (libellé + ton). */
const TON_ABSENCE: Record<JourAbsence["statut"], Ton> = { a_justifier: "avertissement", transmise: "info", refusee: "critique", justifiee: "succes" };
const LIBELLE_ABSENCE: Record<JourAbsence["statut"], string> = { a_justifier: "À justifier", transmise: "Justificatif transmis", refusee: "Justificatif refusé", justifiee: "Justifiée" };

export default function EspaceFamille() {
  const profil = useProfil();
  const q = useEnfants();
  const [choisi, setChoisi] = useState<string | null>(null);
  const enfants = useMemo(() => q.data ?? [], [q.data]);
  const enfant = enfants.find((e) => e.apprenant.id === choisi) ?? enfants[0];

  // Arrivée d'une nouvelle absence pendant la consultation (rafraîchissement 30 s) : on le signale.
  const connues = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!q.data) return;
    const absences = q.data.flatMap((d) => d.evenements.filter((e) => e.type === "ABSENCE").map((e) => ({ id: e.id, prenom: d.apprenant.prenoms })));
    if (connues.current) {
      const nouvelles = absences.filter((a) => !connues.current!.has(a.id)).map((a) => a.prenom);
      if (nouvelles.length) notifier({ ton: "avertissement", titre: `Nouvelle absence : ${[...new Set(nouvelles)].join(", ")}`, texte: "Elle vient d'être enregistrée par l'établissement." });
    }
    connues.current = new Set(absences.map((a) => a.id));
  }, [q.data]);

  return (
    <EntreePage>
      <div className="space-y-5">
        <PageHeader
          titre={`Bonjour ${profil.nomAffiche.split(" ")[0]}`}
          sousTitre="Vos enfants sont rattachés à votre identité par le registre national : vous ne voyez qu'eux."
          actions={q.data ? <Fraicheur maj={q.dataUpdatedAt} actif={q.isFetching} onRafraichir={() => q.refetch()} /> : undefined}
        />

        {enfants.length > 1 && enfant && (
          <div data-guide="famille-enfants" className="-mx-4 overflow-x-auto px-4">
            <Segmente label="Choisir un enfant" valeur={enfant.apprenant.id} onChange={setChoisi} options={enfants.map((e) => ({ valeur: e.apprenant.id, libelle: e.apprenant.prenoms }))} />
          </div>
        )}

        <BandeauNotification />

        {q.isPending ? <Chargement /> : q.isError ? <Erreur erreur={q.error} onReessayer={() => q.refetch()} /> : !enfant ? (
          <Card><EtatVide icone={UserRound} titre="Aucun enfant rattaché" texte="Aucun lien de filiation vérifié au registre national n'est associé à votre identité. Rapprochez-vous de l'établissement de votre enfant." /></Card>
        ) : (
          <>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={enfant.apprenant.id} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }} transition={{ duration: 0.28, ease: EASE }}>
                <FicheEnfant d={enfant} />
              </motion.div>
            </AnimatePresence>
            <p className="flex items-start gap-2 text-xs text-ink-muted"><Lock size={14} className="mt-px shrink-0" aria-hidden /> Chaque consultation est décidée par le contrôle d&apos;accès et enregistrée au journal au titre du suivi familial.</p>
          </>
        )}
      </div>
    </EntreePage>
  );
}

/* ------------------------------------------------------------------ Fiche d'un enfant */

function FicheEnfant({ d }: { d: Dossier }) {
  const s = useMemo(() => syntheseScolaire(d), [d]);
  const absences = useMemo(() => absencesParJour(d.evenements), [d]);
  const aJustifier = absences.filter((a) => a.statut === "a_justifier").length;
  const a = d.apprenant;
  const etab = d.situation.etablissementId ? d.etablissements[d.situation.etablissementId] : null;
  const [bulletinOuvert, setBulletinOuvert] = useState(false);
  const [trimestre, setTrimestre] = useState<number | null>(null);
  const tBulletin = trimestre ?? s.courant;

  return (
    <div className="space-y-5">
      <Card data-guide="famille-fiche" className="min-w-0 overflow-hidden p-0">
        <div className="p-5" style={{ background: "linear-gradient(135deg, var(--acc-doux), transparent 70%)" }}>
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full font-display text-[19px] font-bold text-white shadow-float" style={{ background: "var(--acc)" }}>{initiales(a)}</span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-[21px] font-bold leading-tight text-ink">{nomComplet(a)}</p>
              <p className="mt-0.5 text-sm text-ink-2">{ageAu(a.dateNaissance)} ans{d.situation.classe ? ` · ${d.situation.classe.libelle}` : ""}</p>
              {etab && <p className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-muted"><School size={13} className="shrink-0" aria-hidden /> <span className="truncate">{etab}</span></p>}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <BadgePoint ton={a.statutIdentite === "verifiee" ? "succes" : "avertissement"} icone={Fingerprint}>{a.statutIdentite === "verifiee" ? "Identité vérifiée" : "Identité en régularisation"}</BadgePoint>
            <BadgePoint ton={d.situation.statut === "scolarise" ? "info" : "critique"}>{d.situation.statut === "scolarise" ? `Scolarisé·e · ${d.situation.classe?.anneeScolaire ?? ""}` : d.situation.statut === "abandon" ? "Scolarité interrompue" : "Non inscrit·e"}</BadgePoint>
          </div>
        </div>
      </Card>

      <Cascade data-guide="famille-indicateurs" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Element>
          <TuileIndicateur libelle={s.courant ? `Moyenne T${s.courant}` : "Moyenne"} icone={Sigma} accent="bleu"
            valeur={s.moyenne != null ? <Compteur valeur={s.moyenne} format={(n) => nombre(n, 2)} /> : "—"} unite={s.moyenne != null ? "/20" : undefined}
            indice={s.courant ? libelleTrimestre(s.courant) : "aucune note"} />
        </Element>
        <Element>
          <TuileIndicateur libelle="Évolution" icone={TrendingUp} accent={s.evolution != null && s.evolution < 0 ? "critique" : "sarcelle"}
            valeur={s.evolution == null ? "—" : `${s.evolution >= 0 ? "+" : ""}${nombre(s.evolution, 2)}`}
            indice={s.precedent ? `depuis le T${s.precedent}` : "un seul trimestre"} />
        </Element>
        <Element>
          <TuileIndicateur libelle="Absences" icone={CalendarX2} accent={aJustifier ? "ambre" : "neutre"}
            valeur={<Compteur valeur={absences.length} format={(n) => nombre(n)} />} unite={absences.length > 1 ? "jours" : "jour"}
            indice={aJustifier ? <span className="font-semibold text-warning">{aJustifier} à justifier</span> : "tout est en règle"} />
        </Element>
        <Element>
          <TuileIndicateur libelle="Évaluations" icone={NotebookPen} valeur={<Compteur valeur={s.notes.filter((n) => n.anneeScolaire === s.annee).length} format={(n) => nombre(n)} />} indice={`année ${s.annee ?? "—"}`} />
        </Element>
      </Cascade>

      {/* L'espace famille est en colonne étroite (téléphone d'abord) : une seule colonne, ordre de priorité. */}
      <Absences d={d} jours={absences} />
      <Resultats s={s} onBulletin={s.courant != null ? () => setBulletinOuvert(true) : undefined} />
      <DernieresNotes s={s} />
      <Parcours d={d} />

      {bulletinOuvert && tBulletin != null && (
        <Bulletin
          view={bulletinDepuisDossier(d, tBulletin)}
          trimestres={s.trimestres}
          trimestre={tBulletin}
          onTrimestre={setTrimestre}
          onFermer={() => setBulletinOuvert(false)}
        />
      )}
    </div>
  );
}

function BadgePoint({ ton, icone, children }: { ton: Ton; icone?: LucideIcon; children: ReactNode }) {
  return (
    <Badge ton={ton} icone={icone}>
      {!icone && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </Badge>
  );
}

/* ------------------------------------------------------------------ Résultats par matière */

function Resultats({ s, onBulletin }: { s: ReturnType<typeof syntheseScolaire>; onBulletin?: () => void }) {
  if (!s.courant) {
    return <Card className="min-w-0"><CardHeader icon={TrendingUp} title="Résultats par matière" /><EtatVide icone={NotebookPen} titre="Aucune note cette année" texte="Les moyennes apparaîtront dès la première évaluation saisie par un enseignant." /></Card>;
  }
  return (
    <Card data-guide="famille-resultats" className="min-w-0">
      <CardHeader icon={TrendingUp} title="Résultats par matière" subtitle={`${libelleTrimestre(s.courant)} ${s.annee ?? ""}${s.precedent ? ` · repère : ${libelleTrimestre(s.precedent)}` : ""}`}
        action={onBulletin ? <Button taille="sm" variante="secondaire" icone={Printer} onClick={onBulletin}>Bulletin</Button> : undefined} />
      <ul className="space-y-3.5">
        {s.matieres.map((m, i) => {
          const avant = s.matieresAvant.get(m.matiere);
          const delta = avant != null ? m.moyenne - avant : null;
          return (
            <li key={m.matiere}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-ink">{m.matiere} <span className="text-xs text-ink-muted">· {m.nb} note{m.nb > 1 ? "s" : ""}</span></span>
                <span className="shrink-0 tabular-nums">
                  {delta != null && Math.abs(delta) >= 0.01 && <span className={cn("mr-2 text-xs font-medium", delta > 0 ? "text-success" : "text-critical")}>{delta > 0 ? "▲" : "▼"} {nombre(Math.abs(delta), 1)}</span>}
                  <span className="font-semibold text-ink">{nombre(m.moyenne, 2)}</span>
                </span>
              </div>
              <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
                <motion.div className="h-2 rounded-full" initial={{ width: 0 }} animate={{ width: `${(m.moyenne / 20) * 100}%` }} transition={{ duration: 0.7, delay: 0.05 * i, ease: EASE }} style={{ background: m.moyenne >= 10 ? "var(--acc)" : "var(--critical)" }} />
                {avant != null && <span className="absolute inset-y-0 w-0.5 bg-ink/40" style={{ left: `${(avant / 20) * 100}%` }} title={`${libelleTrimestre(s.precedent!)} : ${nombre(avant, 2)}`} aria-hidden />}
              </div>
            </li>
          );
        })}
      </ul>
      {s.parTrimestre.length > 1 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {s.parTrimestre.map((t) => (
            <span key={t.trimestre} className="rounded-md bg-surface-2 px-2.5 py-1.5 text-xs text-ink-2">{libelleTrimestre(t.trimestre)} <strong className="tabular-nums text-ink">{nombre(t.moyenne, 2)}</strong></span>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-ink-muted">Moyennes non pondérées, calculées à partir des notes enregistrées (corrections comprises). Le trait vertical marque le trimestre précédent.</p>
    </Card>
  );
}

/* ------------------------------------------------------------------ Dernières notes (liste d'activité) */

function DernieresNotes({ s }: { s: ReturnType<typeof syntheseScolaire> }) {
  const [tout, setTout] = useState(false);
  if (!s.recentes.length) return null;
  const liste = s.recentes.slice(0, tout ? 30 : 5);
  return (
    <Card data-guide="famille-notes" className="min-w-0">
      <CardHeader icon={NotebookPen} title="Dernières notes" subtitle="Une note saisie en classe apparaît ici au prochain rafraîchissement" />
      <ul className="divide-y divide-line">
        <AnimatePresence initial={false}>
          {liste.map((n, i) => (
            <motion.li key={n.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, delay: Math.min(i, 12) * 0.035, ease: EASE }} className="flex items-start gap-3 py-2.5">
              <span className={cn("mt-0.5 flex h-9 w-11 shrink-0 items-center justify-center rounded-md font-display text-[14px] font-bold tabular-nums", n.note >= 10 ? "bg-success-bg text-success" : "bg-critical-bg text-critical")}>{nombre(n.note, n.note % 1 ? 2 : 0)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{n.matiere}</p>
                <p className="text-xs text-ink-muted">{libelleTrimestre(n.trimestre)}{n.corrigee ? ` · corrigée (était ${nombre(n.noteInitiale, 2)}${n.motif ? ` — ${n.motif}` : ""})` : ""}</p>
              </div>
              <span className="shrink-0 text-xs tabular-nums text-ink-muted">{date(n.survenuLe)}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {s.recentes.length > 5 && (
        <button onClick={() => setTout((t) => !t)} className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-md text-[13px] font-semibold transition active:scale-[0.97] hover:bg-surface-2" style={{ color: "var(--acc)" }}>
          {tout ? "Afficher moins" : `Voir les ${Math.min(30, s.recentes.length)} dernières notes`}
          <ChevronDown size={15} className={cn("transition-transform", tout && "rotate-180")} aria-hidden />
        </button>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ Absences */

function Absences({ d, jours }: { d: Dossier; jours: JourAbsence[] }) {
  const [cible, setCible] = useState<JourAbsence | null>(null);
  return (
    <Card data-guide="famille-absences" className="min-w-0">
      <CardHeader icon={CalendarX2} title="Absences" subtitle="Justifiez en un geste : l'établissement reçoit le motif dans le registre" />
      {jours.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg bg-success-bg px-4 py-3 text-sm text-success"><Check size={17} aria-hidden /> Aucune absence enregistrée cette année.</div>
      ) : (
        <ul className="divide-y divide-line">
          <AnimatePresence initial={false}>
            {jours.map((j, i) => (
              <motion.li key={j.date} layout initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, delay: Math.min(i, 12) * 0.035, ease: EASE }} className="flex items-start gap-3 py-2.5">
                <span className={cn("flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-md text-[10px] font-semibold uppercase leading-none", j.statut === "a_justifier" ? "bg-warning-bg text-warning" : "bg-surface-2 text-ink-2")}>
                  <span className="font-display text-[16px] tabular-nums">{j.date.slice(8, 10)}</span>
                  {new Date(j.date).toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" }).replace(".", "")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink first-letter:uppercase">{dateLongue(j.date)}</p>
                  <p className="mt-0.5 truncate text-xs text-ink-muted">{j.statut === "refusee" && j.decisionMotif ? `Refusé : ${j.decisionMotif}` : j.statut === "transmise" && j.motif ? `Motif : ${j.motif}` : j.ids.length > 1 ? `${j.ids.length} appels · non justifiée` : j.statut === "justifiee" ? "Justifiée par l'établissement" : "Non justifiée"}</p>
                  <div className="mt-1.5"><BadgePoint ton={TON_ABSENCE[j.statut]}>{LIBELLE_ABSENCE[j.statut]}</BadgePoint></div>
                </div>
                {(j.statut === "a_justifier" || j.statut === "refusee") && <Button taille="sm" variante="secondaire" className="h-10 shrink-0" onClick={() => setCible(j)}>{j.statut === "refusee" ? "Rejustifier" : "Justifier"}</Button>}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      <FeuilleJustification prenom={d.apprenant.prenoms} jour={cible} onFermer={() => setCible(null)} />
    </Card>
  );
}

const MOTIFS = ["Maladie", "Rendez-vous médical", "Raison familiale", "Transport", "Autre"];

/** Justification : feuille basse sur téléphone, fenêtre centrée à partir de sm. */
function FeuilleJustification({ prenom, jour, onFermer }: { prenom: string; jour: JourAbsence | null; onFermer: () => void }) {
  const [motif, setMotif] = useState<string | null>(null);
  const [precision, setPrecision] = useState("");
  const justifier = useJustifierAbsenceMutation();
  const texte = motif ? (precision.trim() ? `${motif} — ${precision.trim()}` : motif) : "";
  const precisionRequise = motif === "Autre" && precision.trim().length < 3;
  const valide = texte.length >= 5 && !precisionRequise;

  const fermer = () => { setMotif(null); setPrecision(""); onFermer(); };
  const envoyer = () => jour && justifier.mutate({ absenceIds: jour.ids, motif: texte.slice(0, 200) }, {
    onSuccess: () => { notifier({ ton: "succes", titre: "Justificatif transmis", texte: `L'absence de ${prenom} du ${date(jour.date)} est signalée à l'établissement.` }); fermer(); },
  });

  return (
    <Feuille ouverte={!!jour} onFermer={fermer} titre={`Justifier l'absence de ${prenom}`} sousTitre={jour ? dateLongue(jour.date) : ""}
      pied={<>
        <Button variante="secondaire" onClick={fermer}>Annuler</Button>
        <Button icone={Send} disabled={!valide} chargement={justifier.isPending} onClick={envoyer}>Transmettre</Button>
      </>}>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">Motif de l&apos;absence</legend>
        <div className="flex flex-wrap gap-2">
          {MOTIFS.map((m) => (
            <button key={m} type="button" onClick={() => setMotif(m)} aria-pressed={motif === m}
              className={cn("h-10 rounded-full px-3.5 text-[13px] font-medium ring-1 ring-inset transition active:scale-[0.97]", motif === m ? "text-white ring-transparent" : "bg-surface text-ink-2 ring-line hover:bg-surface-2")}
              style={motif === m ? { background: "var(--acc)" } : undefined}>{m}</button>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">Précision <span className="font-normal text-ink-muted">{motif === "Autre" ? "(obligatoire)" : "(facultative)"}</span></span>
        <input value={precision} onChange={(e) => setPrecision(e.target.value.slice(0, 150))} placeholder="Ex. : fièvre, consultation au centre de santé"
          className="h-10 w-full rounded-md border border-line bg-surface px-3.5 text-sm text-ink outline-none focus:border-blue focus:ring-4 focus:ring-blue/15" />
        {precisionRequise && precision !== "" && <span className="mt-1 block text-xs text-critical">Précisez le motif en quelques mots.</span>}
      </label>
      <p className="text-xs text-ink-muted">Le motif est ajouté au registre sans modifier l&apos;absence d&apos;origine ; l&apos;établissement le valide.</p>
    </Feuille>
  );
}

function Feuille({ ouverte, onFermer, titre, sousTitre, pied, children }: { ouverte: boolean; onFermer: () => void; titre: string; sousTitre?: string; pied: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!ouverte) return;
    const echap = (e: KeyboardEvent) => { if (e.key === "Escape") onFermer(); };
    document.addEventListener("keydown", echap);
    return () => document.removeEventListener("keydown", echap);
  }, [ouverte, onFermer]);
  return (
    <AnimatePresence>
      {ouverte && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-deep/40 backdrop-blur-sm sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onFermer}>
          <motion.div role="dialog" aria-modal="true" aria-label={titre} onClick={(e) => e.stopPropagation()}
            initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} transition={{ type: "spring", stiffness: 360, damping: 30 }}
            className="w-full rounded-t-2xl border border-line bg-surface shadow-pop sm:max-w-lg sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0"><p className="text-[15px] font-semibold text-ink">{titre}</p>{sousTitre && <p className="mt-0.5 text-[13px] text-ink-muted first-letter:uppercase">{sousTitre}</p>}</div>
              <button onClick={onFermer} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2" aria-label="Fermer"><X size={18} aria-hidden /></button>
            </div>
            <div className="space-y-4 px-5 py-4">{children}</div>
            <div className="flex justify-end gap-3 border-t border-line px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">{pied}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ Parcours */

const ICONES: Record<TypeJalon, LucideIcon> = {
  inscription: School, transfert: ArrowRightLeft, passage: GraduationCap, examen: BookOpenCheck, diplome: Award, bilan: CalendarCheck,
  abandon: ShieldAlert, reprise: RefreshCw, justification: Check,
};

function Parcours({ d }: { d: Dossier }) {
  const jalons = useMemo(() => jalonsParcours(d), [d]);
  const [tout, setTout] = useState(false);
  if (!jalons.length) return null;
  const visibles = tout ? jalons : jalons.slice(0, 4);
  return (
    <Card data-guide="famille-parcours" className="min-w-0">
      <CardHeader icon={History} title="Parcours" subtitle="Reconstitué à partir des faits du registre, quelle que soit l'école" />
      <ol className="relative ml-4 border-l-2 border-line pl-6">
        <AnimatePresence initial={false}>
          {visibles.map((j, i) => {
            const Icone = ICONES[j.type];
            return (
              <motion.li key={j.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, delay: Math.min(i, 12) * 0.035, ease: EASE }} className="relative pb-5 last:pb-0">
                <span className="absolute -left-[39px] flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-surface" style={{ background: j.accent ? "var(--acc)" : "var(--surface-2)", color: j.accent ? "#fff" : "var(--acc)" }}><Icone size={13} aria-hidden /></span>
                <Etiquette>{date(j.date)} · {j.source}</Etiquette>
                <p className="mt-0.5 text-sm font-semibold text-ink">{j.titre}</p>
                <p className="text-[13px] text-ink-2">{j.detail}</p>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
      {jalons.length > 4 && (
        <button onClick={() => setTout((t) => !t)} className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-md text-[13px] font-semibold transition active:scale-[0.97] hover:bg-surface-2" style={{ color: "var(--acc)" }}>
          {tout ? "Réduire" : `Voir tout le parcours (${jalons.length} étapes)`}
          <ChevronDown size={15} className={cn("transition-transform", tout && "rotate-180")} aria-hidden />
        </button>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ Bandeau, fraîcheur, états */

function BandeauNotification() {
  const { data } = useNotifications();
  const n = data?.notifications.find((x) => !x.lue);
  return (
    <AnimatePresence initial={false}>
      {n && (
        <motion.div key={n.id} initial={{ opacity: 0, y: -10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35, ease: EASE }}>
          <Link href="/famille/notifications" className="flex items-center gap-3 rounded-xl border border-line/70 bg-surface p-3.5 shadow-float transition hover:-translate-y-1 hover:shadow-pop">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-white" style={{ background: "var(--acc)" }}>
              <Bell size={18} aria-hidden />
              {(data?.nonLues ?? 0) > 1 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-critical px-1 text-[10.5px] font-bold text-white ring-2 ring-surface">{data!.nonLues}</span>}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{n.titre}</p>
              <p className="truncate text-[13px] text-ink-2">{n.texte}</p>
            </div>
            <ChevronRight size={17} className="shrink-0 text-ink-muted" aria-hidden />
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Fraicheur({ maj, actif, onRafraichir }: { maj: number; actif: boolean; onRafraichir: () => void }) {
  return (
    <button data-guide="famille-direct" onClick={onRafraichir} className="flex h-10 items-center gap-2 rounded-full border border-line/70 bg-surface px-3.5 text-xs text-ink-muted shadow-soft transition active:scale-[0.97] hover:text-ink" aria-label="Actualiser maintenant">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
      </span>
      <span className="tabular-nums">En direct · {new Date(maj).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
      <RefreshCw size={13} className={cn(actif && "animate-spin")} aria-hidden />
    </button>
  );
}

function Chargement() {
  return (
    <div className="space-y-5" aria-busy aria-label="Chargement des dossiers">
      <div className="rounded-xl border border-line/70 bg-surface p-5 shadow-float">
        <div className="flex gap-4"><Squelette className="h-14 w-14 rounded-full" /><div className="flex-1 space-y-2"><Squelette className="h-6 w-2/3" /><Squelette className="h-4 w-1/2" /></div></div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Squelette key={i} className="h-[92px] rounded-lg" />)}</div>
      <div className="space-y-3 rounded-xl border border-line/70 bg-surface p-5 shadow-float">{[0, 1, 2, 3, 4].map((i) => <Squelette key={i} className="h-7" />)}</div>
    </div>
  );
}

function Erreur({ erreur, onReessayer }: { erreur: Error; onReessayer: () => void }) {
  const refus = erreur instanceof ErreurApi && erreur.refus;
  return (
    <Card>
      <EtatVide icone={refus ? ShieldAlert : RefreshCw} titre={refus ? "Accès refusé" : "Dossiers momentanément indisponibles"}
        texte={refus ? `${erreur.message}. Ce refus a été enregistré au journal d'audit.` : `${erreur.message}. Réessayez dans un instant.`}
        action={refus ? undefined : <Button variante="secondaire" icone={RefreshCw} onClick={onReessayer}>Réessayer</Button>} />
    </Card>
  );
}
