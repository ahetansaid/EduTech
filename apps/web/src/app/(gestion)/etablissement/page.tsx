"use client";

import { communeById } from "@beile/simulation/territoire";
import { ArrowRight, BookOpenCheck, CalendarX2, Check, ClipboardList, Fingerprint, GraduationCap, HandHelping, Percent, School, Send, TrendingDown, UserPlus, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, Cascade, Compteur, Element, EntreePage, motion } from "@/components/motion";
import { TuileIndicateur } from "@/components/ui/donnees";
import { notifier } from "@/components/ui/Notifications";
import { Badge, Button, Card, CardHeader, EtatVide, PageHeader, Squelette } from "@/components/ui/primitives";
import { useAbsencesDuJour, useAccompagnementMutation, useDemandes, useEleves, useTableau, type Absence, type Demande, type Tableau } from "@/lib/api/etablissement";
import { cn } from "@/lib/cn";
import { entier, nombre, pourcent } from "@/lib/format";
import { useEtablissementCourant } from "@/lib/session";
import { classeChamp, dateCourte, Dialogue, EtatErreur, ETAPES_ACCOMPAGNEMENT, heureLocale, heureSecondes, HorsPerimetre, Jauge, LienBouton, LIBELLE_STATUT_DEMANDE, PointDirect, Statut, TON_STATUT_DEMANDE } from "./_composants";

export default function MonEtablissement() {
  const id = useEtablissementCourant();
  if (!id) return <EntreePage><HorsPerimetre /></EntreePage>;
  return <EntreePage><TableauDeBord id={id} /></EntreePage>;
}

/* ================================================================== Tableau de bord */

function TableauDeBord({ id }: { id: string }) {
  const tableau = useTableau(id);
  const absences = useAbsencesDuJour(id);
  const eleves = useEleves(id);
  const t = tableau.data;

  // Noms résolus depuis la liste des apprenants (chargée une fois) ; classes depuis le tableau.
  const noms = useMemo(() => new Map((eleves.data ?? []).map((e) => [e.id, `${e.prenoms} ${e.nom}`])), [eleves.data]);
  const classes = useMemo(() => new Map((t?.classes ?? []).map((c) => [c.id, c.libelle])), [t]);
  const absentsParClasse = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const a of absences.data ?? []) m.set(a.classeId, (m.get(a.classeId) ?? new Set()).add(a.apprenantId));
    return m;
  }, [absences.data]);
  const nbAbsents = absences.data ? new Set(absences.data.map((a) => a.apprenantId)).size : t?.chiffres.absentsDuJour ?? 0;

  if (tableau.isError) {
    return (
      <div className="space-y-6">
        <PageHeader surtitre="Mon établissement" titre="Tableau de bord" />
        <Card><EtatErreur erreur={tableau.error} reessayer={() => tableau.refetch()} /></Card>
      </div>
    );
  }

  const commune = t ? communeById.get(t.etablissement.communeId)?.nom ?? t.etablissement.communeId : null;

  return (
    <div className="space-y-6">
      <PageHeader
        surtitre={t ? `Mon établissement · ${commune} · ${t.etablissement.circonscription}` : "Mon établissement"}
        titre={t ? t.etablissement.nom : <Squelette className="h-8 w-64" />}
        sousTitre="Ce que l'établissement saisit lui revient en temps réel : effectifs, absences, alertes et décisions à prendre."
        actions={
          <>
            <LienBouton href="/etablissement/eleves" variante="secondaire" icone={Users}>Apprenants</LienBouton>
            <LienBouton href="/etablissement/inscription" icone={UserPlus}>Inscrire un apprenant</LienBouton>
          </>
        }
      />

      {/* Chiffres clés */}
      {!t ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{Array.from({ length: 5 }, (_, i) => <Squelette key={i} className="h-[104px] rounded-lg" />)}</div>
      ) : (
        <Cascade data-guide="etab-indicateurs" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Element><TuileIndicateur libelle="Apprenants" icone={Users} accent="bleu" valeur={<Compteur valeur={t.chiffres.apprenants} format={entier} />} indice={`${t.classes.length} classes`} /></Element>
          <Element><TuileIndicateur libelle="Occupation" icone={Percent} accent={t.chiffres.apprenants > t.chiffres.capacite ? "critique" : "sarcelle"} valeur={<Compteur valeur={(t.chiffres.apprenants / Math.max(1, t.chiffres.capacite)) * 100} format={(v) => nombre(v, 0)} />} unite="%" indice={`capacité ${entier(t.chiffres.capacite)} places`} /></Element>
          <Element><TuileIndicateur libelle="Enseignants" icone={GraduationCap} accent="bleu" valeur={<Compteur valeur={t.chiffres.enseignants} format={entier} />} indice={t.chiffres.enseignants ? `${nombre(t.chiffres.apprenants / t.chiffres.enseignants, 0)} élèves par enseignant` : undefined} /></Element>
          <Element><TuileIndicateur libelle={`Moyenne T${t.trimestre}`} icone={BookOpenCheck} accent="ambre" valeur={t.chiffres.moyenne != null ? <Compteur valeur={t.chiffres.moyenne} format={(v) => nombre(v, 2)} /> : "—"} unite="/20" indice="toutes matières" /></Element>
          <Element><TuileIndicateur libelle="Absents aujourd'hui" icone={CalendarX2} accent={nbAbsents ? "critique" : "neutre"} valeur={<Compteur valeur={nbAbsents} format={entier} />} indice={<span className="inline-flex items-center gap-1.5"><PointDirect actif={!absences.isError} className="scale-75" /> {pourcent((nbAbsents / Math.max(1, t.chiffres.apprenants)) * 100)} · en direct</span>} /></Element>
        </Cascade>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <CarteAlertes t={t} />
          <CarteAccompagnement id={id} t={t} />
        </div>
        <div className="min-w-0">
          <CarteAbsences
            absences={absences.data}
            chargement={absences.isPending}
            erreur={absences.isError ? absences.error : null}
            reessayer={() => absences.refetch()}
            majLe={absences.dataUpdatedAt}
            enCours={absences.isFetching}
            noms={noms}
            classes={classes}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2"><CarteClasses t={t} absentsParClasse={absentsParClasse} /></div>
        <div className="min-w-0"><CarteDemandes id={id} /></div>
      </div>
    </div>
  );
}

/* ================================================================== Alertes */

function CarteAlertes({ t }: { t: Tableau | undefined }) {
  if (!t) return <Card className="min-w-0"><Squelette className="mb-4 h-6 w-72" />{Array.from({ length: 3 }, (_, i) => <Squelette key={i} className="mb-2.5 h-16" />)}</Card>;
  const a = t.alertes;
  const lignes: { icone: LucideIcon; ton: "avertissement" | "info" | "critique"; titre: string; detail: string; lien?: string; action?: string }[] = [];
  if (a.baisse.length) lignes.push({ icone: TrendingDown, ton: "avertissement", titre: `${a.baisse.length} élève${a.baisse.length > 1 ? "s" : ""} en baisse importante en mathématiques`, detail: "Trois évaluations consécutives en recul d'au moins 5 points au total", lien: "/etablissement/eleves?filtre=baisse", action: "Voir la liste" });
  if (a.regularisations.length) lignes.push({ icone: Fingerprint, ton: "info", titre: `${a.regularisations.length} identité${a.regularisations.length > 1 ? "s" : ""} en cours de régularisation`, detail: "Inscription maintenue ; démarche engagée auprès de l'agence d'identification", lien: "/etablissement/eleves?filtre=identite", action: "Suivre" });
  for (const s of a.surcharges) lignes.push({ icone: Users, ton: "critique", titre: `${s.classe} au-delà de sa capacité`, detail: `${s.effectif} élèves pour ${s.capacite} places`, lien: "/etablissement/eleves", action: "Examiner" });
  if (a.enseignantsSansFormation) lignes.push({ icone: GraduationCap, ton: "avertissement", titre: `${a.enseignantsSansFormation} enseignant${a.enseignantsSansFormation > 1 ? "s n'ont" : " n'a"} pas suivi la formation obligatoire`, detail: `« ${a.formationObligatoire} »` });

  return (
    <Card data-guide="etab-alertes" className="min-w-0">
      <CardHeader icon={HandHelping} title="Ce que le système vous signale" subtitle="Calculé à partir du registre, à chaque ouverture — aucune mesure sans décision humaine" action={<Badge ton={lignes.length ? "avertissement" : "succes"}>{lignes.length}</Badge>} />
      {lignes.length === 0 ? (
        <EtatVide icone={Check} titre="Aucune alerte" texte="Effectifs, identités, résultats et formations : rien ne demande votre attention aujourd'hui." />
      ) : (
        <ul className="space-y-2.5">
          {lignes.map((l, i) => (
            <motion.li key={l.titre} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 12) * 0.05 }}
              className="flex flex-wrap items-start gap-3 rounded-lg border border-line/70 p-3.5 sm:flex-nowrap">
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", l.ton === "critique" ? "bg-critical-bg text-critical" : l.ton === "info" ? "bg-info-bg text-info" : "bg-warning-bg text-warning")}><l.icone size={17} aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-ink">{l.titre}</p>
                <p className="text-[12.5px] text-ink-muted">{l.detail}</p>
              </div>
              {l.lien && (
                <Link href={l.lien} className="ml-12 inline-flex min-h-10 shrink-0 items-center gap-1 text-[13px] font-semibold text-blue hover:underline sm:ml-0 sm:min-h-0 sm:self-center">
                  {l.action} <ArrowRight size={14} aria-hidden />
                </Link>
              )}
            </motion.li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ================================================================== Accompagnement (moteur de workflow) */

const OBJET_DEFAUT = "Soutien en mathématiques — baisse sur trois évaluations consécutives";

function CarteAccompagnement({ id, t }: { id: string; t: Tableau | undefined }) {
  const [exclus, setExclus] = useState<Set<string>>(new Set());
  const [tout, setTout] = useState(false);
  const [ouvert, setOuvert] = useState(false);
  const [objet, setObjet] = useState(OBJET_DEFAUT);
  const proposer = useAccompagnementMutation(id);
  if (!t) return <Card className="min-w-0"><Squelette className="h-40" /></Card>;
  const baisse = t.alertes.baisse;
  const choisis = baisse.filter((b) => !exclus.has(b.apprenantId));
  const visibles = tout ? baisse : baisse.slice(0, 6);
  const basculer = (a: string) => setExclus((s) => { const n = new Set(s); if (n.has(a)) n.delete(a); else n.add(a); return n; });
  const objetValide = objet.trim().length >= 5 && objet.trim().length <= 200;

  const envoyer = () => proposer.mutate({ apprenantIds: choisis.map((c) => c.apprenantId), objet: objet.trim() }, {
    onSuccess: () => {
      setOuvert(false);
      notifier({ ton: "succes", titre: "Proposition transmise au conseil pédagogique", texte: `${choisis.length} élève${choisis.length > 1 ? "s" : ""} · validation attendue sous 7 jours.` });
    },
  });

  return (
    <Card data-guide="etab-accompagnement" className="min-w-0">
      <CardHeader icon={TrendingDown} title="Élèves en baisse en mathématiques" subtitle="Trois dernières notes, de la plus ancienne à la plus récente" action={<Badge ton={baisse.length ? "avertissement" : "succes"}>{baisse.length}</Badge>} />
      {baisse.length === 0 ? (
        <EtatVide icone={Check} titre="Aucune baisse détectée" texte="Aucun élève ne présente trois évaluations consécutives en recul d'au moins 5 points." />
      ) : (
        <>
          <ul className="grid gap-2 sm:grid-cols-2">
            {visibles.map((b, i) => {
              const coche = !exclus.has(b.apprenantId);
              return (
                <motion.li key={b.apprenantId} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.035 }}>
                  <label className={cn("flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors", coche ? "border-blue/40 bg-blue-soft/40" : "border-line/70 hover:bg-surface-2/60")}>
                    <input type="checkbox" checked={coche} onChange={() => basculer(b.apprenantId)} className="h-4 w-4 shrink-0 accent-[var(--blue)]" />
                    <span className="min-w-0 flex-1">
                      <Link href={`/etablissement/eleves/${b.apprenantId}`} className="block truncate text-[13.5px] font-semibold text-ink hover:text-blue hover:underline">{b.nom ?? b.apprenantId}</Link>
                      <span className="text-[12px] tabular text-ink-muted">{b.notes.map((n) => nombre(n, 2)).join(" → ")}</span>
                    </span>
                    <span className="shrink-0 rounded-sm bg-critical-bg px-1.5 py-0.5 text-[12px] font-semibold tabular text-critical">−{nombre(b.baisse, 2)}</span>
                  </label>
                </motion.li>
              );
            })}
          </ul>
          {baisse.length > 6 && (
            <button type="button" onClick={() => setTout((x) => !x)} className="mt-2 min-h-10 text-[13px] font-medium text-blue hover:underline">{tout ? "Réduire" : `Afficher les ${baisse.length} élèves`}</button>
          )}
          <div className="mt-4 flex flex-col gap-3 rounded-lg bg-surface-2/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] text-ink-2">
              <strong className="text-ink">{choisis.length}</strong> élève{choisis.length > 1 ? "s" : ""} sélectionné{choisis.length > 1 ? "s" : ""}. La proposition suit le circuit : conseil pédagogique, puis information des familles.
            </p>
            <Button variante="valider" icone={Send} disabled={!choisis.length} onClick={() => setOuvert(true)} className="shrink-0">Proposer un accompagnement</Button>
          </div>
        </>
      )}

      <Dialogue
        ouvert={ouvert}
        onFermer={() => !proposer.isPending && setOuvert(false)}
        icone={HandHelping}
        titre="Proposer un accompagnement"
        description="Une demande est ouverte dans le circuit « Accompagnement pédagogique ». Aucune mesure n'est appliquée sans la décision du conseil."
        pied={
          <>
            <Button variante="secondaire" onClick={() => setOuvert(false)} disabled={proposer.isPending}>Annuler</Button>
            <Button variante="valider" icone={Send} chargement={proposer.isPending} disabled={!objetValide} onClick={envoyer}>Transmettre ({choisis.length})</Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Objet de la demande</span>
            <textarea value={objet} onChange={(e) => setObjet(e.target.value.slice(0, 200))} rows={3} className={cn(classeChamp, "h-auto py-2.5")} />
            <span className={cn("mt-1 block text-xs", objetValide ? "text-ink-muted" : "text-critical")}>{objetValide ? `${objet.trim().length}/200 caractères` : "Entre 5 et 200 caractères."}</span>
          </label>
          <div>
            <p className="mb-2 text-sm font-medium text-ink">Élèves concernés</p>
            <div className="flex flex-wrap gap-1.5">{choisis.map((c) => <Badge key={c.apprenantId}>{c.nom ?? c.apprenantId}</Badge>)}</div>
          </div>
          <ol className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2">
            {ETAPES_ACCOMPAGNEMENT.map((e, i) => (
              <li key={e.code} className="inline-flex items-center gap-2">
                <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold", i === 0 ? "bg-teal text-white" : "bg-surface-2 text-ink-muted")}>{i + 1}</span>
                {e.libelle}
                {i < ETAPES_ACCOMPAGNEMENT.length - 1 && <ArrowRight size={13} className="text-ink-muted" aria-hidden />}
              </li>
            ))}
          </ol>
        </div>
      </Dialogue>
    </Card>
  );
}

/* ================================================================== Absences du jour (temps réel) */

interface LigneAbsence { apprenantId: string; classeId: string; derniere: string; signalements: number }

function regrouper(absences: Absence[]): LigneAbsence[] {
  const m = new Map<string, LigneAbsence>();
  for (const a of absences) {
    const x = m.get(a.apprenantId);
    if (!x) m.set(a.apprenantId, { apprenantId: a.apprenantId, classeId: a.classeId, derniere: a.enregistreLe, signalements: 1 });
    else { x.signalements++; if (a.enregistreLe > x.derniere) x.derniere = a.enregistreLe; }
  }
  return [...m.values()].sort((a, b) => b.derniere.localeCompare(a.derniere));
}

function CarteAbsences({ absences, chargement, erreur, reessayer, majLe, enCours, noms, classes }: {
  absences: Absence[] | undefined; chargement: boolean; erreur: unknown; reessayer: () => void; majLe: number; enCours: boolean;
  noms: Map<string, string>; classes: Map<string, string>;
}) {
  const lignes = useMemo(() => regrouper(absences ?? []), [absences]);
  return (
    <Card data-guide="etab-absences" className="min-w-0 lg:sticky lg:top-20">
      <CardHeader
        icon={CalendarX2}
        title="Absences du jour"
        subtitle={<span className="inline-flex items-center gap-1.5"><PointDirect actif={!erreur} /> En direct{majLe ? ` · mis à jour à ${heureSecondes(majLe)}` : ""}</span>}
        action={<Badge ton={lignes.length ? "critique" : "succes"}>{lignes.length}</Badge>}
      />
      {erreur && !absences ? (
        <EtatErreur erreur={erreur} reessayer={reessayer} />
      ) : chargement ? (
        <div className="space-y-2">{Array.from({ length: 4 }, (_, i) => <Squelette key={i} className="h-11" />)}</div>
      ) : (
        <ListeAbsences lignes={lignes} noms={noms} classes={classes} enCours={enCours} />
      )}
    </Card>
  );
}

/** Monté une fois les premières données reçues : tout ce qui arrive ensuite est signalé comme nouveau. */
function ListeAbsences({ lignes, noms, classes, enCours }: { lignes: LigneAbsence[]; noms: Map<string, string>; classes: Map<string, string>; enCours: boolean }) {
  const [initiales] = useState(() => new Set(lignes.map((l) => `${l.apprenantId}:${l.signalements}`)));
  const connues = useRef(new Set(lignes.map((l) => `${l.apprenantId}:${l.signalements}`)));

  // Nouvelle absence saisie par un enseignant : notification discrète (la ligne s'insère en haut de liste).
  useEffect(() => {
    const nouvelles = lignes.filter((l) => !connues.current.has(`${l.apprenantId}:${l.signalements}`));
    for (const l of lignes) connues.current.add(`${l.apprenantId}:${l.signalements}`);
    if (!nouvelles.length) return;
    const n = nouvelles[0]!;
    notifier({
      ton: "info",
      titre: nouvelles.length > 1 ? `${nouvelles.length} nouvelles absences signalées` : "Nouvelle absence signalée",
      texte: `${noms.get(n.apprenantId) ?? n.apprenantId} · ${classes.get(n.classeId) ?? n.classeId} — appel de ${heureLocale(n.derniere)}`,
    });
  }, [lignes, noms, classes]);

  if (!lignes.length) {
    return <EtatVide icone={Check} titre="Aucune absence enregistrée" texte="Les absences saisies par les enseignants lors de l'appel apparaissent ici, sans rechargement." />;
  }
  return (
    <ul className={cn("divide-y divide-line/60 transition-opacity", enCours && "opacity-90")} aria-live="polite">
      <AnimatePresence initial={false}>
        {lignes.map((l, i) => {
          const nouveau = !initiales.has(`${l.apprenantId}:${l.signalements}`);
          const nom = noms.get(l.apprenantId);
          return (
            <motion.li
              key={l.apprenantId}
              layout
              initial={{ opacity: 0, y: -12, backgroundColor: "var(--warning-bg)" }}
              animate={{ opacity: 1, y: 0, backgroundColor: nouveau ? "var(--warning-bg)" : "rgba(0,0,0,0)" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.4, delay: Math.min(i, 12) * 0.035 }}
              className="-mx-2 flex items-start gap-3 rounded-md px-2 py-2.5"
            >
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", nouveau ? "bg-warning" : "bg-critical")} aria-hidden />
              <div className="min-w-0 flex-1">
                <Link href={`/etablissement/eleves/${l.apprenantId}`} className="block truncate text-sm font-medium text-ink hover:text-blue hover:underline">{nom ?? l.apprenantId}</Link>
                <p className="text-xs text-ink-muted">
                  {classes.get(l.classeId) ?? l.classeId}
                  {l.signalements > 1 && ` · signalé ${l.signalements} fois`}
                  {nouveau && <span className="ml-1.5 font-semibold text-warning">Nouveau</span>}
                </p>
              </div>
              <span className="shrink-0 text-xs tabular text-ink-muted">{heureLocale(l.derniere)}</span>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

/* ================================================================== Classes */

function CarteClasses({ t, absentsParClasse }: { t: Tableau | undefined; absentsParClasse: Map<string, Set<string>> }) {
  return (
    <Card data-guide="etab-classes" className="min-w-0 overflow-hidden p-0">
      <div className="px-5 pt-5"><CardHeader icon={School} title="Classes" subtitle="Effectifs issus des inscriptions et transferts enregistrés au registre" /></div>
      {!t ? (
        <div className="space-y-2 px-5 pb-5">{Array.from({ length: 5 }, (_, i) => <Squelette key={i} className="h-12" />)}</div>
      ) : t.classes.length === 0 ? (
        <EtatVide icone={School} titre="Aucune classe ouverte" texte="Les classes de l'année scolaire apparaîtront ici dès leur création." />
      ) : (
        <>
          {/* Cartes sous md */}
          <ul className="grid gap-3 px-5 pb-5 sm:grid-cols-2 md:hidden">
            {t.classes.map((c) => (
              <li key={c.id} className="rounded-lg border border-line/70 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-ink">{c.libelle}</p>
                  <span className="text-[12.5px] tabular text-ink-muted">{c.effectif}/{c.capacite}</span>
                </div>
                <Jauge valeur={c.effectif} max={c.capacite} className="mt-2" />
                <dl className="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
                  <div><dt className="text-ink-muted">Moyenne T{t.trimestre}</dt><dd className="font-semibold tabular text-ink">{nombre(c.moyenne, 2)}</dd></div>
                  <div><dt className="text-ink-muted">Absents ce jour</dt><dd className="font-semibold tabular text-ink">{absentsParClasse.get(c.id)?.size ?? 0}</dd></div>
                  <div className="col-span-2"><dt className="text-ink-muted">Professeur principal</dt><dd className="truncate text-ink">{c.professeurPrincipal ?? "—"}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
          {/* Tableau à partir de md */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm tabular-nums">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-5 py-2.5 font-semibold">Classe</th>
                  <th className="px-5 py-2.5 font-semibold">Effectif</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Moyenne T{t.trimestre}</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Absents</th>
                  <th className="hidden px-5 py-2.5 font-semibold lg:table-cell">Professeur principal</th>
                </tr>
              </thead>
              <tbody>
                {t.classes.map((c, i) => {
                  const abs = absentsParClasse.get(c.id)?.size ?? 0;
                  return (
                    <motion.tr key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 12) * 0.035 }} className="border-t border-line/60 hover:bg-surface-2/50">
                      <td className="px-5 py-3"><span className="font-medium text-ink">{c.libelle}</span><span className="block text-xs text-ink-muted">Niveau {c.niveau}</span></td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="w-14 shrink-0">{c.effectif}/{c.capacite}</span>
                          <Jauge valeur={c.effectif} max={c.capacite} className="w-24 lg:w-32" />
                        </div>
                      </td>
                      <td className={cn("px-5 py-3 text-right font-medium", c.moyenne != null && c.moyenne < 10 ? "text-critical" : "text-ink")}>{nombre(c.moyenne, 2)}</td>
                      <td className="px-5 py-3 text-right">{abs ? <Badge ton="critique">{abs}</Badge> : <span className="text-ink-muted">0</span>}</td>
                      <td className="hidden px-5 py-3 text-ink-2 lg:table-cell">{c.professeurPrincipal ?? "—"}</td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

/* ================================================================== Demandes (circuit d'accompagnement) */

function CarteDemandes({ id }: { id: string }) {
  const demandes = useDemandes(id);
  const [tout, setTout] = useState(false);
  const liste = demandes.data ?? [];
  const visibles = tout ? liste : liste.slice(0, 5);
  return (
    <Card data-guide="etab-demandes" className="min-w-0">
      <CardHeader icon={ClipboardList} title="Demandes en circuit" subtitle="Accompagnements proposés et leur étape" action={<Badge>{liste.length}</Badge>} />
      {demandes.isPending ? (
        <div className="space-y-2">{Array.from({ length: 3 }, (_, i) => <Squelette key={i} className="h-14" />)}</div>
      ) : demandes.isError ? (
        <EtatErreur erreur={demandes.error} reessayer={() => demandes.refetch()} />
      ) : liste.length === 0 ? (
        <EtatVide icone={ClipboardList} titre="Aucune demande" texte="Les propositions d'accompagnement transmises au conseil pédagogique apparaîtront ici." />
      ) : (
        <>
          <ul className="divide-y divide-line/60">
            <AnimatePresence initial={false}>
              {visibles.map((d) => <LigneDemande key={d.id} d={d} />)}
            </AnimatePresence>
          </ul>
          {liste.length > 5 && <button type="button" onClick={() => setTout((x) => !x)} className="mt-2 min-h-10 text-[13px] font-medium text-blue hover:underline">{tout ? "Réduire" : `Afficher les ${liste.length} demandes`}</button>}
        </>
      )}
    </Card>
  );
}

function LigneDemande({ d }: { d: Demande }) {
  const rang = ETAPES_ACCOMPAGNEMENT.findIndex((e) => e.code === d.etapeCourante);
  const etape = ETAPES_ACCOMPAGNEMENT[rang]?.libelle ?? d.etapeCourante;
  return (
    <motion.li layout initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-start gap-3 py-2.5">
      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", d.statut === "en_cours" ? "bg-warning" : d.statut === "acceptee" ? "bg-success" : d.statut === "refusee" ? "bg-critical" : "bg-info")} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink">{d.objet}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <Statut ton={TON_STATUT_DEMANDE[d.statut]}>{LIBELLE_STATUT_DEMANDE[d.statut]}</Statut>
          <span className="text-xs text-ink-muted">Étape : {etape}</span>
        </div>
        <div className="mt-1.5 flex gap-1" aria-label={`Étape ${rang + 1} sur ${ETAPES_ACCOMPAGNEMENT.length}`}>
          {ETAPES_ACCOMPAGNEMENT.map((e, i) => <span key={e.code} className={cn("h-1 w-8 rounded-full", i < rang ? "bg-teal" : i === rang ? "bg-warning" : "bg-surface-2")} />)}
        </div>
      </div>
      <span className="shrink-0 text-right text-xs text-ink-muted">
        {dateCourte(d.creeeLe)}
        {d.echeance && <span className="block">échéance {dateCourte(d.echeance)}</span>}
      </span>
    </motion.li>
  );
}
