"use client";

import type { Evenement } from "@beile/contracts";
import { communeById } from "@beile/simulation/territoire";
import { ArrowLeft, ArrowRightLeft, Award, BookOpenCheck, CalendarX2, Check, History, School, ShieldAlert, UserMinus, UserRoundX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { AnimatePresence, Cascade, EASE, Element, EntreePage, motion } from "@/components/motion";
import { DecisionAccesCarte } from "@/components/ui/donnees";
import { notifier } from "@/components/ui/Notifications";
import { CartePreuve } from "@/components/ui/Preuve";
import { Badge, Button, Card, CardHeader, EtatVide, Squelette } from "@/components/ui/primitives";
import { decisionDuRefus, jourCourant, useAbandonMutation, useClassesAccueil, useDossier, useTransfertMutation, type DossierGestion } from "@/lib/api/etablissement";
import { cn } from "@/lib/cn";
import { entier, nombre } from "@/lib/format";
import { ErreurApi } from "@/lib/http";
import {
  ageEnAnnees, Avatar, ChampRecherche, classeChamp, dateCourte, Dialogue, EtatErreur, heureLocale, LIBELLE_EVENEMENT, LIBELLE_IDENTITE,
  LIBELLE_SITUATION, LIBELLE_SOURCE, Statut, TON_EVENEMENT, TON_IDENTITE, TON_SITUATION,
} from "../../_composants";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <EntreePage><Dossier id={decodeURIComponent(id)} /></EntreePage>;
}

function Retour() {
  return <Link href="/etablissement/eleves" className="inline-flex min-h-10 items-center gap-1.5 text-[13px] font-medium text-ink-muted hover:text-ink"><ArrowLeft size={15} aria-hidden /> Apprenants</Link>;
}

function Dossier({ id }: { id: string }) {
  const dossier = useDossier(id);
  const d = dossier.data;

  if (!/^APP-\d{6}$/.test(id)) {
    return <div className="space-y-5"><Retour /><Card><EtatVide icone={UserRoundX} titre="Identifiant invalide" texte="Un identifiant éducatif a la forme APP-000000." /></Card></div>;
  }
  if (dossier.isPending) return <SqueletteDossier />;
  if (dossier.isError) {
    const decision = decisionDuRefus(dossier.error);
    return (
      <div className="space-y-5">
        <Retour />
        {decision ? (
          <Card className="space-y-4">
            <CardHeader icon={ShieldAlert} title="Dossier hors de votre périmètre" subtitle="La décision a été prise par le serveur et inscrite au journal d'audit, avec le critère manquant." />
            <DecisionAccesCarte decision={decision} />
            <p className="text-[13px] text-ink-2">Un apprenant transféré ou sorti de l'établissement n'est plus accessible au titre de la gestion : son dossier suit l'établissement qui l'accueille.</p>
          </Card>
        ) : (
          <Card><EtatErreur erreur={dossier.error} reessayer={() => dossier.refetch()} /></Card>
        )}
      </div>
    );
  }
  return <DossierCharge d={d!} />;
}

function SqueletteDossier() {
  return (
    <div className="space-y-5">
      <Squelette className="h-5 w-28" />
      <div className="flex items-center gap-4"><Squelette className="h-16 w-16 rounded-full" /><div className="space-y-2"><Squelette className="h-7 w-64" /><Squelette className="h-4 w-48" /></div></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Squelette key={i} className="h-20" />)}</div>
      <div className="grid gap-6 lg:grid-cols-3"><Squelette className="h-80 lg:col-span-2" /><Squelette className="h-80" /></div>
    </div>
  );
}

/* ================================================================== Dossier */

function DossierCharge({ d }: { d: DossierGestion }) {
  const a = d.apprenant;
  const s = d.situation;
  const [action, setAction] = useState<"transfert" | "abandon" | null>(null);
  const [decisionVisible, setDecisionVisible] = useState(false);
  const moyenneGenerale = d.moyennes.length ? d.moyennes.reduce((x, m) => x + m.moyenne, 0) / d.moyennes.length : null;
  const titulaire = `${a.prenoms} ${a.nom}`;

  return (
    <div className="space-y-5">
      <Retour />

      {/* En-tête du dossier */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar prenoms={a.prenoms} nom={a.nom} taille="lg" />
          <div className="min-w-0">
            <p className="mb-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Dossier {a.id}</p>
            <h1 className="text-[24px] font-bold leading-tight text-ink sm:text-[28px]">{a.prenoms} <span className="uppercase">{a.nom}</span></h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Statut ton={TON_SITUATION[s.statut]}>{LIBELLE_SITUATION[s.statut]}</Statut>
              <Statut ton={TON_IDENTITE[a.statutIdentite]}>{LIBELLE_IDENTITE[a.statutIdentite]}</Statut>
              {a.besoinsParticuliers && <Badge ton="marque">Besoins particuliers</Badge>}
            </div>
          </div>
        </div>
        {(d.actions.transfert || d.actions.abandon) && (
          <div className="flex flex-wrap gap-2 sm:shrink-0">
            {d.actions.transfert && <Button variante="secondaire" icone={ArrowRightLeft} onClick={() => setAction("transfert")} className="flex-1 sm:flex-none">Transférer</Button>}
            {d.actions.abandon && <Button variante="secondaire" icone={UserMinus} onClick={() => setAction("abandon")} className="flex-1 text-critical sm:flex-none">Déclarer un abandon</Button>}
          </div>
        )}
      </header>

      {/* Chiffres */}
      <Cascade className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Element><Fait libelle="Classe" icone={School} valeur={s.classe ?? "—"} indice={s.etablissement ?? "Aucun établissement"} /></Element>
        <Element><Fait libelle={`Moyenne T${d.trimestre}`} icone={BookOpenCheck} valeur={moyenneGenerale != null ? `${nombre(moyenneGenerale, 2)}` : "—"} unite={moyenneGenerale != null ? "/20" : undefined} indice={`${d.moyennes.length} matière${d.moyennes.length > 1 ? "s" : ""} évaluée${d.moyennes.length > 1 ? "s" : ""}`} alerte={moyenneGenerale != null && moyenneGenerale < 10} /></Element>
        <Element><Fait libelle="Absences" icone={CalendarX2} valeur={entier(d.absences)} indice="depuis la rentrée" alerte={d.absences >= 5} /></Element>
        <Element><Fait libelle="Âge" icone={History} valeur={`${ageEnAnnees(a.dateNaissance, jourCourant())} ans`} indice={`né·e le ${dateCourte(a.dateNaissance)} · ${a.sexe === "F" ? "fille" : "garçon"}`} /></Element>
      </Cascade>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card className="min-w-0">
            <CardHeader icon={BookOpenCheck} title={`Moyennes du trimestre ${d.trimestre}`} subtitle="Notes effectives : une correction remplace la note d'origine sans l'effacer du registre" />
            {d.moyennes.length === 0 ? (
              <EtatVide icone={BookOpenCheck} titre="Aucune note ce trimestre" texte="Les évaluations saisies par les enseignants apparaîtront ici." />
            ) : (
              <ul className="space-y-2.5">
                {d.moyennes.map((m, i) => (
                  <li key={m.matiere} className="grid grid-cols-[minmax(0,9rem)_1fr_4.5rem] items-center gap-3 text-[13.5px] sm:grid-cols-[11rem_1fr_5rem]">
                    <span className="truncate text-ink-2">{m.matiere}</span>
                    <span className="relative h-2 overflow-hidden rounded-full bg-surface-2">
                      <motion.span className={cn("absolute inset-y-0 left-0 rounded-full", m.moyenne < 10 ? "bg-critical" : m.moyenne < 12 ? "bg-warning" : "bg-teal")}
                        initial={{ width: 0 }} animate={{ width: `${(m.moyenne / 20) * 100}%` }} transition={{ duration: 0.8, ease: EASE, delay: Math.min(i, 12) * 0.05 }} />
                      <span className="absolute inset-y-0 left-1/2 w-px bg-ink/30" aria-hidden />
                    </span>
                    <span className={cn("text-right font-semibold tabular", m.moyenne < 10 ? "text-critical" : "text-ink")}>{nombre(m.moyenne, 2)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="min-w-0">
            <CardHeader icon={History} title="Parcours" subtitle="Événements du registre national, du plus récent au plus ancien" action={<Badge>{d.evenements.length}</Badge>} />
            {d.evenements.length === 0 ? (
              <EtatVide icone={History} titre="Aucun événement" />
            ) : (
              <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-line">
                {d.evenements.map((e, i) => (
                  <motion.li key={e.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 12) * 0.05 }} className="relative flex gap-3 pl-6">
                    <span className={cn("absolute left-0 top-1 h-[15px] w-[15px] rounded-full border-[3px] border-surface",
                      { marque: "bg-blue", succes: "bg-success", info: "bg-info", critique: "bg-critical", avertissement: "bg-warning", neutre: "bg-ink-muted" }[TON_EVENEMENT[e.type] ?? "neutre"])} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <p className="text-sm font-medium text-ink">{LIBELLE_EVENEMENT[e.type] ?? e.type}</p>
                        <p className="text-xs tabular text-ink-muted">{dateCourte(e.survenuLe)}</p>
                      </div>
                      <p className="text-[13px] text-ink-2">{detailEvenement(e, d)}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">Source : {LIBELLE_SOURCE[e.source] ?? e.source}</p>
                    </div>
                  </motion.li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card className="min-w-0">
            <CardHeader icon={Award} title="Diplômes" subtitle="Vérifiables par un tiers, sans compte" action={<Badge>{d.certificats.length}</Badge>} />
            {d.certificats.length === 0 ? (
              <EtatVide icone={Award} titre="Aucun diplôme" texte="Les diplômes délivrés (CEP, BEPC…) sont rattachés à l'identifiant de l'apprenant." />
            ) : (
              <div className="space-y-3">{d.certificats.map((c) => <CartePreuve key={c.id} certificat={c} titulaire={titulaire} />)}</div>
            )}
          </Card>

          <Card className="min-w-0">
            <button type="button" onClick={() => setDecisionVisible((v) => !v)} aria-expanded={decisionVisible} className="flex w-full min-h-10 items-center justify-between gap-3 text-left">
              <span className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-success-bg text-success"><Check size={16} aria-hidden /></span>
                <span><span className="block text-[15px] font-semibold text-ink">Accès accordé et journalisé</span><span className="block text-[13px] text-ink-muted">{d.decision.motif}</span></span>
              </span>
              <span className="text-[12.5px] font-medium text-blue">{decisionVisible ? "Masquer" : "Détail"}</span>
            </button>
            <AnimatePresence initial={false}>
              {decisionVisible && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <DecisionAccesCarte decision={d.decision} className="mt-4" />
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </div>
      </div>

      {d.actions.transfert && <DialogueTransfert d={d} ouvert={action === "transfert"} onFermer={() => setAction(null)} />}
      {d.actions.abandon && <DialogueAbandon d={d} ouvert={action === "abandon"} onFermer={() => setAction(null)} />}
    </div>
  );
}

function Fait({ libelle, valeur, unite, indice, icone: Icone, alerte }: { libelle: string; valeur: string; unite?: string; indice?: string; icone: typeof School; alerte?: boolean }) {
  return (
    <div className="flex h-full min-w-0 flex-col rounded-lg border border-line/70 bg-surface px-3.5 py-3 shadow-float sm:px-4 sm:py-3.5">
      <span className="flex items-center justify-between gap-3">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{libelle}</span>
        <Icone size={16} className={alerte ? "text-critical" : "text-ink-muted"} aria-hidden />
      </span>
      <span className={cn("mt-2 truncate text-xl font-semibold sm:text-2xl tabular-nums", alerte ? "text-critical" : "text-ink")}>
        {valeur}{unite && <span className="ml-1 text-[15px] font-semibold text-ink-muted">{unite}</span>}
      </span>
      {indice && <span className="mt-1 truncate text-xs text-ink-muted">{indice}</span>}
    </div>
  );
}

function detailEvenement(e: Evenement, d: DossierGestion): string {
  const etab = (x: string | null) => (x ? d.etablissements[x] ?? x : "—");
  const classe = (x: string) => d.classes[x] ?? x;
  switch (e.type) {
    case "INSCRIPTION": return `${classe(e.classeId)} · ${etab(e.etablissementId)} · année ${e.anneeScolaire}`;
    case "REPRISE": return `Reprise en ${classe(e.classeId)} · ${etab(e.etablissementId)}`;
    case "TRANSFERT": return `${etab(e.deEtablissementId)} → ${etab(e.versEtablissementId)} (${classe(e.versClasseId)})`;
    case "ABANDON": return `Sortie déclarée · année ${e.anneeScolaire}`;
    case "PASSAGE": return `${e.deNiveau} → ${e.versNiveau} · ${e.decision === "admis" ? "admis" : "redoublement"} (${e.anneeScolaire})`;
    case "RESULTAT_EXAMEN": return `${e.examen} ${e.session} · ${nombre(e.moyenne, 2)}/20 · ${e.admis ? "admis" : "ajourné"}`;
    case "CERTIFICATION": return `${e.examen} ${e.session} · mention ${e.mention}`;
    case "REGULARISATION_IDENTITE_DEMANDEE": return e.motif;
    case "CORRECTION_EVALUATION": return `Note corrigée : ${nombre(e.nouvelleNote, 2)}/20 — ${e.motif}`;
    default: return `Enregistré à ${heureLocale(e.enregistreLe)}`;
  }
}

/* ================================================================== Transfert */

function DialogueTransfert({ d, ouvert, onFermer }: { d: DossierGestion; ouvert: boolean; onFermer: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [choix, setChoix] = useState<string | null>(null);
  const [confirme, setConfirme] = useState(false);
  const accueil = useClassesAccueil(d.apprenant.id, q.trim(), ouvert);
  const transferer = useTransfertMutation(d.apprenant.id);
  const cible = accueil.data?.classes.find((c) => c.id === choix);

  const fermer = () => { if (transferer.isPending) return; setConfirme(false); onFermer(); };
  const valider = () => transferer.mutate(choix!, {
    onSuccess: () => {
      notifier({ ton: "succes", titre: "Transfert enregistré", texte: `${d.apprenant.prenoms} ${d.apprenant.nom} rejoint ${cible?.etablissement ?? "l'établissement d'accueil"} (${cible?.libelle ?? ""}). Son dossier le suit.` });
      onFermer();
      router.push("/etablissement/eleves");
    },
  });

  return (
    <Dialogue
      ouvert={ouvert}
      onFermer={fermer}
      large
      icone={ArrowRightLeft}
      titre={`Transférer ${d.apprenant.prenoms} ${d.apprenant.nom}`}
      description={`Classe d'accueil de même niveau (${accueil.data?.niveau ?? d.situation.niveau ?? "—"}) dans un autre établissement. Aucune ressaisie : le parcours et le passeport éducatif suivent l'apprenant.`}
      pied={
        <>
          <Button variante="secondaire" onClick={fermer} disabled={transferer.isPending}>Annuler</Button>
          <Button variante="primaire" icone={ArrowRightLeft} disabled={!cible || !confirme} chargement={transferer.isPending} onClick={valider}>Confirmer le transfert</Button>
        </>
      }
    >
      <div className="space-y-4">
        <ChampRecherche valeur={q} onChange={setQ} placeholder="Établissement, commune ou classe" label="Rechercher une classe d'accueil" />
        {accueil.isPending ? (
          <div className="space-y-2">{Array.from({ length: 3 }, (_, i) => <Squelette key={i} className="h-16" />)}</div>
        ) : accueil.isError ? (
          <EtatErreur erreur={accueil.error} reessayer={() => accueil.refetch()} />
        ) : !accueil.data.classes.length ? (
          <EtatVide icone={School} titre="Aucune classe d'accueil" texte={`Aucune classe de ${accueil.data.niveau} n'est ouverte dans un autre établissement${q ? " pour cette recherche" : ""}.`} />
        ) : (
          <ul className={cn("space-y-2 transition-opacity", accueil.isFetching && "opacity-60")} role="radiogroup" aria-label="Classe d'accueil">
            {accueil.data.classes.map((c) => {
              const pleine = c.places <= 0;
              const actif = choix === c.id;
              return (
                <li key={c.id}>
                  <button type="button" role="radio" aria-checked={actif} disabled={pleine} onClick={() => { setChoix(c.id); setConfirme(false); }}
                    className={cn("flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all", actif ? "border-blue bg-blue-soft/40 ring-4 ring-blue/15" : "border-line/70 hover:bg-surface-2/60", pleine && "cursor-not-allowed opacity-55")}>
                    <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", actif ? "border-blue bg-blue text-white" : "border-line")}>{actif && <Check size={12} aria-hidden />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{c.etablissement}</span>
                      <span className="block text-xs text-ink-muted">{c.libelle} · {communeById.get(c.communeId)?.nom ?? c.communeId} · {c.effectif}/{c.capacite} élèves</span>
                    </span>
                    {pleine ? <Badge ton="critique">Complète</Badge> : <Badge ton="succes">{c.places} place{c.places > 1 ? "s" : ""}</Badge>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <AnimatePresence>
          {cible && (
            <motion.label initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex cursor-pointer items-start gap-3 rounded-lg border border-warning/30 bg-warning-bg/60 p-3.5">
              <input type="checkbox" checked={confirme} onChange={(e) => setConfirme(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--blue)]" />
              <span className="text-[13px] text-ink-2">
                Je confirme le transfert vers <strong className="text-ink">{cible.etablissement}</strong> ({cible.libelle}). Mon accès au dossier prendra fin : il sera géré par l'établissement d'accueil.
              </span>
            </motion.label>
          )}
        </AnimatePresence>
        {transferer.error instanceof ErreurApi && <p role="alert" className="text-xs text-critical">{transferer.error.message}</p>}
      </div>
    </Dialogue>
  );
}

/* ================================================================== Abandon */

function DialogueAbandon({ d, ouvert, onFermer }: { d: DossierGestion; ouvert: boolean; onFermer: () => void }) {
  const router = useRouter();
  const [motif, setMotif] = useState("");
  const abandon = useAbandonMutation(d.apprenant.id);
  const valide = motif.trim().length >= 5;
  const fermer = () => { if (!abandon.isPending) onFermer(); };
  const valider = () => abandon.mutate(motif.trim(), {
    onSuccess: () => {
      notifier({ ton: "avertissement", titre: "Abandon déclaré", texte: `${d.apprenant.prenoms} ${d.apprenant.nom} sort des effectifs. Une reprise ultérieure conservera ses acquis.` });
      onFermer();
      router.push("/etablissement/eleves");
    },
  });
  return (
    <Dialogue
      ouvert={ouvert}
      onFermer={fermer}
      ton="danger"
      icone={UserMinus}
      titre="Déclarer un abandon"
      description={`${d.apprenant.prenoms} ${d.apprenant.nom} (${d.situation.classe}) sortira des effectifs et sera compté·e dans le taux d'abandon. L'événement est inscrit au registre, sans effacement.`}
      pied={
        <>
          <Button variante="secondaire" onClick={fermer} disabled={abandon.isPending}>Annuler</Button>
          <Button variante="danger" icone={UserMinus} disabled={!valide} chargement={abandon.isPending} onClick={valider}>Confirmer l'abandon</Button>
        </>
      }
    >
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">Motif (obligatoire)</span>
        <textarea value={motif} onChange={(e) => setMotif(e.target.value.slice(0, 200))} rows={3} placeholder="Ex. : départ de la famille hors du pays, sans nouvelle depuis trois semaines…" className={cn(classeChamp, "h-auto py-2.5")} />
        <span className={cn("mt-1 block text-xs", motif && !valide ? "text-critical" : "text-ink-muted")}>{motif && !valide ? "Au moins 5 caractères." : `${motif.trim().length}/200 caractères`}</span>
      </label>
      {abandon.error instanceof ErreurApi && <p role="alert" className="mt-2 text-xs text-critical">{abandon.error.message}</p>}
    </Dialogue>
  );
}
