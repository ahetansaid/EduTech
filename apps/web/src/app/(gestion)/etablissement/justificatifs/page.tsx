"use client";

import { CalendarX2, Check, ClipboardCheck, Download, Hourglass, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Cascade, Compteur, Element, EntreePage, motion } from "@/components/motion";
import { TuileIndicateur } from "@/components/ui/donnees";
import { notifier } from "@/components/ui/Notifications";
import { Badge, Button, Card, CardHeader, EtatVide, PageHeader, Segmente, Squelette } from "@/components/ui/primitives";
import { useDecisionJustificatifMutation, useJustificatifs, type JustificatifAbsence, type Justificatifs } from "@/lib/api/etablissement";
import { cn } from "@/lib/cn";
import { exporterCsv, type Colonne } from "@/lib/export";
import { entier } from "@/lib/format";
import { ErreurApi } from "@/lib/http";
import { useEtablissementCourant } from "@/lib/session";
import { ChampRecherche, classeChamp, dateCourte, Dialogue, EtatErreur, HorsPerimetre, LIBELLE_STATUT_JUSTIF, normaliser, Statut, TON_STATUT_JUSTIF } from "../_composants";

type Filtre = "tous" | "en_attente" | "validee" | "refusee";

/** Colonnes exportées : le même contenu que l'écran, mis en forme pour Excel (locale fr). */
const COLONNES: Colonne<JustificatifAbsence>[] = [
  { entete: "Statut", valeur: (j) => LIBELLE_STATUT_JUSTIF[j.statut] },
  { entete: "Apprenant", valeur: (j) => j.nom ?? "" },
  { entete: "Identifiant", valeur: (j) => j.apprenantId ?? "" },
  { entete: "Absences liées", valeur: (j) => j.absenceIds.length },
  { entete: "Dates d'absence", valeur: (j) => j.dates.map(dateCourte).join(" / ") },
  { entete: "Motif déclaré", valeur: (j) => j.motif },
  { entete: "Déclarant (NPI)", valeur: (j) => j.declarantNpi ?? "" },
  { entete: "Transmis le", valeur: (j) => dateCourte(j.transmisLe) },
  { entete: "Motif de décision", valeur: (j) => j.decisionMotif ?? "" },
  { entete: "Décidé le", valeur: (j) => (j.decideLe ? dateCourte(j.decideLe) : "") },
];

export default function Page() {
  const id = useEtablissementCourant();
  return <EntreePage>{id ? <PageJustificatifs id={id} /> : <HorsPerimetre />}</EntreePage>;
}

function PageJustificatifs({ id }: { id: string }) {
  const q = useJustificatifs(id);
  return (
    <div className="space-y-5">
      <PageHeader
        surtitre="Processus P7"
        titre="Justificatifs d'absence"
        sousTitre="Les responsables légaux transmettent un motif d'absence depuis l'espace famille. La direction statue ici : la décision est inscrite au registre, en ajout seul, et la famille est notifiée."
      />
      {q.isPending ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Squelette key={i} className="h-[104px] rounded-lg" />)}</div>
          <Squelette className="h-96" />
        </>
      ) : q.isError ? (
        <Card><EtatErreur erreur={q.error} reessayer={() => q.refetch()} /></Card>
      ) : (
        <Contenu id={id} x={q.data!} />
      )}
    </div>
  );
}

function Contenu({ id, x }: { id: string; x: Justificatifs }) {
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [recherche, setRecherche] = useState("");
  const [cible, setCible] = useState<{ justificatif: JustificatifAbsence; decision: "validee" | "refusee" } | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [lot, setLot] = useState<"validee" | "refusee" | null>(null);

  const validees = x.justificatifs.filter((j) => j.statut === "validee").length;
  const refusees = x.justificatifs.filter((j) => j.statut === "refusee").length;

  const liste = useMemo(() => {
    const n = normaliser(recherche);
    return x.justificatifs.filter((j) =>
      (filtre === "tous" || j.statut === filtre) &&
      (!n || normaliser(`${j.nom ?? ""} ${j.apprenantId ?? ""} ${j.motif}`).includes(n)),
    );
  }, [x.justificatifs, filtre, recherche]);

  // Seules les pièces « en attente » sont cochables, et seulement si l'on peut statuer.
  const cochables = useMemo(() => (x.peutStatuer ? liste.filter((j) => j.statut === "en_attente").map((j) => j.id) : []), [liste, x.peutStatuer]);
  const toutCoche = cochables.length > 0 && cochables.every((i) => selection.has(i));
  const basculer = (jid: string) => setSelection((s) => { const n = new Set(s); if (n.has(jid)) n.delete(jid); else n.add(jid); return n; });
  const toutBasculer = () => setSelection(toutCoche ? new Set() : new Set(cochables));
  const choisirFiltre = (f: Filtre) => { setFiltre(f); setSelection(new Set()); };

  const options = [
    { valeur: "tous" as const, libelle: `Tous (${x.justificatifs.length})` },
    { valeur: "en_attente" as const, libelle: `En attente (${x.enAttente})` },
    { valeur: "validee" as const, libelle: `Validées (${validees})` },
    { valeur: "refusee" as const, libelle: `Refusées (${refusees})` },
  ];

  const ciblesDuLot = useMemo(() => x.justificatifs.filter((j) => selection.has(j.id) && j.statut === "en_attente"), [x.justificatifs, selection]);

  return (
    <>
      <Cascade className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Element><TuileIndicateur libelle="En attente" icone={Hourglass} accent="ambre" valeur={<Compteur valeur={x.enAttente} format={entier} />} indice="à statuer par la direction" /></Element>
        <Element><TuileIndicateur libelle="Validées" icone={Check} accent="sarcelle" valeur={<Compteur valeur={validees} format={entier} />} indice="justificatifs acceptés" /></Element>
        <Element><TuileIndicateur libelle="Refusées" icone={X} accent="bleu" valeur={<Compteur valeur={refusees} format={entier} />} indice="motifs non retenus" /></Element>
        <Element><TuileIndicateur libelle="Total transmis" icone={ClipboardCheck} accent="bleu" valeur={<Compteur valeur={x.justificatifs.length} format={entier} />} indice="depuis l'espace famille" /></Element>
      </Cascade>

      <Card className="min-w-0 overflow-hidden p-0">
        <div className="space-y-4 px-5 pt-5">
          <CardHeader className="mb-0" icon={ClipboardCheck} title="Justificatifs transmis" subtitle="Registre en ajout seul : l'absence d'origine n'est jamais modifiée" action={<Badge>{x.justificatifs.length}</Badge>} />
          <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
            <div className="-mx-1 overflow-x-auto px-1"><Segmente label="État" valeur={filtre} onChange={choisirFiltre} options={options} /></div>
            <ChampRecherche valeur={recherche} onChange={setRecherche} placeholder="Apprenant, identifiant ou motif" label="Rechercher un justificatif" />
            <Button variante="secondaire" icone={Download} disabled={!liste.length} onClick={() => exporterCsv(`justificatifs_${id}`, liste, COLONNES)} title={`Exporter les ${liste.length} lignes affichées au format CSV`}>Exporter</Button>
          </div>
        </div>

        {!x.peutStatuer && (
          <p className="mx-5 mt-4 rounded-md bg-info-bg px-3 py-2 text-[13px] text-info">Lecture seule : seul le chef de l'établissement peut statuer sur un justificatif.</p>
        )}

        {x.peutStatuer && selection.size > 0 && (
          <div className="mx-5 mt-4 flex flex-wrap items-center gap-2 rounded-md bg-blue-soft/50 px-3 py-2 text-[13px]">
            <span className="font-medium text-ink">{selection.size} sélectionné{selection.size > 1 ? "s" : ""} · en attente</span>
            <div className="ml-auto flex flex-wrap gap-1.5">
              <Button variante="valider" taille="sm" icone={Check} onClick={() => setLot("validee")}>Valider en lot</Button>
              <Button variante="danger" taille="sm" icone={X} onClick={() => setLot("refusee")}>Refuser en lot</Button>
              <Button variante="fantome" taille="sm" onClick={() => setSelection(new Set())}>Annuler</Button>
            </div>
          </div>
        )}

        {liste.length === 0 ? (
          <EtatVide icone={CalendarX2} titre="Aucun justificatif" texte={x.justificatifs.length ? "Aucun justificatif ne correspond à ces critères." : "Les justificatifs transmis par les familles apparaîtront ici."} />
        ) : (
          <>
            {cochables.length > 0 && (
              <label className="mt-4 flex items-center gap-2 border-t border-line/60 px-5 py-2.5 text-[13px] text-ink-2 hover:bg-surface-2/40">
                <input type="checkbox" checked={toutCoche} onChange={toutBasculer} className="h-4 w-4 accent-[var(--blue)]" />
                Tout sélectionner ({cochables.length} en attente)
              </label>
            )}
            <ul className={cn("divide-y divide-line/60", cochables.length > 0 && "border-t border-line/60")}>
              {liste.map((j, i) => (
                <Ligne
                  key={j.id} j={j} index={i} peutStatuer={x.peutStatuer}
                  selectable={x.peutStatuer && j.statut === "en_attente"}
                  coche={selection.has(j.id)}
                  onBasculer={() => basculer(j.id)}
                  onStatuer={(decision) => setCible({ justificatif: j, decision })}
                />
              ))}
            </ul>
          </>
        )}
      </Card>

      <DialogueDecision id={id} cible={cible} onFermer={() => setCible(null)} />
      {lot && (
        <DialogueLot
          id={id} cibles={ciblesDuLot} decision={lot}
          onFermer={() => setLot(null)}
          onTermine={() => { setSelection(new Set()); setLot(null); }}
        />
      )}
    </>
  );
}

function Ligne({ j, index, peutStatuer, selectable, coche, onBasculer, onStatuer }: {
  j: JustificatifAbsence; index: number; peutStatuer: boolean; selectable: boolean; coche: boolean; onBasculer: () => void; onStatuer: (d: "validee" | "refusee") => void;
}) {
  const dates = j.dates.map(dateCourte).join(", ") || "—";
  return (
    <motion.li initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 12) * 0.035 }} className="flex flex-wrap items-start gap-x-3 gap-y-2 px-5 py-3.5 hover:bg-surface-2/40">
      {selectable && (
        <input type="checkbox" checked={coche} onChange={onBasculer} aria-label={`Sélectionner le justificatif de ${j.nom ?? j.apprenantId ?? "apprenant"}`} className="mt-1 h-4 w-4 shrink-0 accent-[var(--blue)]" />
      )}
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
        j.statut === "validee" ? "bg-success-bg text-success" : j.statut === "refusee" ? "bg-critical-bg text-critical" : "bg-warning-bg text-warning")}>
        <CalendarX2 size={17} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">
          {j.nom ? <Link href={`/etablissement/eleves/${j.apprenantId}`} className="hover:text-blue hover:underline">{j.nom}</Link> : "Apprenant"}
          {j.apprenantId && <span className="ml-2 font-mono text-xs text-ink-muted">{j.apprenantId}</span>}
        </p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {j.absenceIds.length} absence(s) · {dates} · transmis le {dateCourte(j.transmisLe)}
        </p>
        <p className="mt-1 text-[13px] text-ink-2"><span className="text-ink-muted">Motif : </span>{j.motif || "—"}</p>
        {j.statut !== "en_attente" && j.decisionMotif && (
          <p className="mt-1 text-xs text-ink-muted">Décision : {j.decisionMotif}{j.decideLe ? ` · le ${dateCourte(j.decideLe)}` : ""}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Statut ton={TON_STATUT_JUSTIF[j.statut]}>{LIBELLE_STATUT_JUSTIF[j.statut]}</Statut>
        {j.statut === "en_attente" && peutStatuer && (
          <div className="flex gap-1.5">
            <Button variante="valider" taille="sm" icone={Check} onClick={() => onStatuer("validee")}>Valider</Button>
            <Button variante="fantome" taille="sm" icone={X} onClick={() => onStatuer("refusee")}>Refuser</Button>
          </div>
        )}
      </div>
    </motion.li>
  );
}

function DialogueDecision({ id, cible, onFermer }: { id: string; cible: { justificatif: JustificatifAbsence; decision: "validee" | "refusee" } | null; onFermer: () => void }) {
  const [motif, setMotif] = useState("");
  const valider = useDecisionJustificatifMutation(id);
  const erreur = valider.error instanceof ErreurApi ? valider.error : null;
  const refus = cible?.decision === "refusee";
  const motifValide = !refus || motif.trim().length >= 5;

  const fermer = () => { if (valider.isPending) return; setMotif(""); onFermer(); };
  const envoyer = () => {
    if (!cible) return;
    valider.mutate(
      { justificationId: cible.justificatif.id, decision: cible.decision, ...(refus ? { motif: motif.trim() } : {}) },
      {
        onSuccess: () => {
          notifier({ ton: "succes", titre: refus ? "Justificatif refusé" : "Justificatif validé", texte: `La décision a été inscrite au registre et la famille notifiée.` });
          setMotif("");
          onFermer();
        },
        onError: (e) => { if (e instanceof ErreurApi && e.statut === 409) onFermer(); },
      },
    );
  };

  return (
    <Dialogue
      ouvert={!!cible}
      onFermer={fermer}
      ton={refus ? "danger" : "succes"}
      icone={refus ? X : Check}
      titre={refus ? "Refuser le justificatif" : "Valider le justificatif"}
      description={cible ? `${cible.justificatif.nom ?? "Apprenant"} · ${cible.justificatif.dates.map(dateCourte).join(", ") || "—"}` : undefined}
      pied={
        <>
          <Button variante="secondaire" onClick={fermer} disabled={valider.isPending}>Annuler</Button>
          <Button variante={refus ? "danger" : "valider"} icone={refus ? X : Check} disabled={!motifValide} chargement={valider.isPending} onClick={envoyer}>
            {refus ? "Refuser" : "Valider"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {cible && (
          <p className="rounded-md bg-surface-2/70 px-3 py-2 text-[13px] text-ink-2"><span className="text-ink-muted">Motif déclaré : </span>{cible.justificatif.motif || "—"}</p>
        )}
        {refus && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Motif du refus <span className="text-critical">*</span></span>
            <textarea
              value={motif}
              onChange={(e) => setMotif(e.target.value.slice(0, 200))}
              rows={3}
              placeholder="Expliquez pourquoi le justificatif n'est pas retenu (transmis à la famille)."
              className={cn(classeChamp, "h-auto py-2")}
              aria-invalid={!!motif && !motifValide}
            />
            <span className="mt-1 block text-xs text-ink-muted">{motif.trim().length}/200 · 5 caractères minimum</span>
          </label>
        )}
        {!refus && <p className="text-[13px] text-ink-2">L'absence restera marquée comme justifiée pour la famille. Cette décision est journalisée avec son auteur.</p>}
        {erreur && erreur.statut !== 409 && <p role="alert" className="rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">{erreur.message}</p>}
        {erreur?.statut === 409 && <p role="status" className="rounded-md bg-info-bg px-3 py-2 text-[13px] text-info">Ce justificatif a déjà fait l'objet d'une décision : l'écran vient d'être actualisé.</p>}
      </div>
    </Dialogue>
  );
}

/* ------------------------------------------------------------------ Décision en lot sur plusieurs justificatifs « en attente » */

function DialogueLot({ id, cibles, decision, onFermer, onTermine }: {
  id: string; cibles: JustificatifAbsence[]; decision: "validee" | "refusee"; onFermer: () => void; onTermine: () => void;
}) {
  const [motif, setMotif] = useState("");
  const [enCours, setEnCours] = useState(false);
  const statuer = useDecisionJustificatifMutation(id);
  const refus = decision === "refusee";
  const motifValide = !refus || motif.trim().length >= 5;
  const n = cibles.length;

  const envoyer = async () => {
    if (!n) return;
    setEnCours(true);
    const motifs = refus ? motif.trim() : undefined;
    const resultats = await Promise.allSettled(
      cibles.map((j) => statuer.mutateAsync({ justificationId: j.id, decision, ...(motifs ? { motif: motifs } : {}) })),
    );
    setEnCours(false);
    const reussis = resultats.filter((r) => r.status === "fulfilled").length;
    const echoues = n - reussis;
    notifier({
      ton: echoues ? "avertissement" : "succes",
      titre: refus ? "Refus enregistrés" : "Justificatifs validés",
      texte: `${reussis} décision(s) inscrite(s) au registre${echoues ? ` · ${echoues} en échec (déjà traité(s) ?)` : ""}.`,
    });
    onTermine();
  };

  return (
    <Dialogue
      ouvert
      onFermer={() => !enCours && onFermer()}
      ton={refus ? "danger" : "succes"}
      icone={refus ? X : Check}
      titre={refus ? `Refuser ${n} justificatif${n > 1 ? "s" : ""}` : `Valider ${n} justificatif${n > 1 ? "s" : ""}`}
      description="Chaque décision est inscrite au registre, en ajout seul, et notifiée à la famille concernée."
      pied={
        <>
          <Button variante="secondaire" onClick={onFermer} disabled={enCours}>Annuler</Button>
          <Button variante={refus ? "danger" : "valider"} icone={refus ? X : Check} disabled={!motifValide || !n} chargement={enCours} onClick={envoyer}>
            {refus ? `Refuser (${n})` : `Valider (${n})`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ul className="max-h-48 space-y-1 overflow-y-auto text-[13px] text-ink-2">
          {cibles.map((j) => <li key={j.id} className="truncate">• {j.nom ?? "Apprenant"}{j.apprenantId ? ` · ${j.apprenantId}` : ""} — {j.motif || "motif non précisé"}</li>)}
        </ul>
        {refus && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Motif du refus (commun) <span className="text-critical">*</span></span>
            <textarea
              value={motif}
              onChange={(e) => setMotif(e.target.value.slice(0, 200))}
              rows={3}
              placeholder="Expliquez pourquoi ces justificatifs ne sont pas retenus (transmis à chaque famille)."
              className={cn(classeChamp, "h-auto py-2")}
              aria-invalid={!!motif && !motifValide}
            />
            <span className="mt-1 block text-xs text-ink-muted">{motif.trim().length}/200 · 5 caractères minimum</span>
          </label>
        )}
        {!refus && <p className="text-[13px] text-ink-2">Les absences resteront marquées comme justifiées. Chaque décision est journalisée avec son auteur.</p>}
      </div>
    </Dialogue>
  );
}
