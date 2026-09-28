"use client";

import type { DecisionGuichet, ModeRetrait, PieceIdentite, StatutViseParGuichet } from "@beile/contracts";
import { LIBELLE_ACTE, LIBELLE_AUTORITE, TRANSITIONS_ACTE } from "@beile/contracts";
import { AlertTriangle, Check, Clock, Gauge, Hourglass, Inbox, PackageCheck, Scale, Stamp, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Cascade, Compteur, Element, EntreePage } from "@/components/motion";
import { notifier } from "@/components/ui/Notifications";
import { TuileIndicateur } from "@/components/ui/donnees";
import { Badge, Button, Card, CardHeader, EtatVide, PageHeader, Squelette } from "@/components/ui/primitives";
import {
  LIBELLE_MODE_RETRAIT, LIBELLE_PIECE, LIBELLE_STATUT_ACTE, TON_STATUT_ACTE, useDecisionGuichetMutation,
  useDelaisGuichet, useFileGuichet, type DemandeGuichet,
} from "@/lib/api/guichet";
import { classeChamp, classeSelect, Dialogue, EtatErreur, HorsPerimetre, normaliser, Statut } from "../_composants";
import { cn } from "@/lib/cn";
import { date, entier } from "@/lib/format";
import { ErreurApi } from "@/lib/http";
import { useEtablissementCourant } from "@/lib/session";

type Filtre = "tous" | "a_preparer" | "en_instruction" | "pretes" | "remises" | "en_retard";

const TITRE_DECISION: Record<StatutViseParGuichet, string> = {
  en_instruction: "Prendre en charge",
  disponible: "Marquer prêt à retirer",
  remise: "Constat de remise",
  refusee: "Refuser la demande",
};

/** Guichet de l'établissement : la file des actes demandés par les étudiants, et ce que le guichet met à les délivrer. */
export default function Page() {
  const id = useEtablissementCourant();
  return <EntreePage>{id ? <PageGuichet id={id} /> : <HorsPerimetre />}</EntreePage>;
}

function PageGuichet({ id }: { id: string }) {
  const q = useFileGuichet(id);
  return (
    <div className="space-y-5">
      <PageHeader
        surtitre="Enseignement supérieur · P6"
        titre="Guichet de l'étudiant"
        sousTitre="Chaque étape d'un acte — prise en charge, mise à disposition, remise, refus — est inscrite au registre en ajout seul. Les délais mesurés ici sont ceux que l'étudiant subit ou évite."
      />
      {q.isPending ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Squelette key={i} className="h-[104px] rounded-lg" />)}</div>
          <Squelette className="h-96" />
        </>
      ) : q.isError ? (
        <Card><EtatErreur erreur={q.error} reessayer={() => q.refetch()} /></Card>
      ) : (
        <Contenu id={id} lignes={q.data!} />
      )}
    </div>
  );
}

function Contenu({ id, lignes }: { id: string; lignes: DemandeGuichet[] }) {
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [recherche, setRecherche] = useState("");
  const [cible, setCible] = useState<{ demande: DemandeGuichet; statut: StatutViseParGuichet } | null>(null);

  const aPreparer = lignes.filter((d) => d.statut === "demandee").length;
  const enCours = lignes.filter((d) => d.statut === "en_instruction").length;
  const prêtes = lignes.filter((d) => d.statut === "disponible").length;
  const enRetard = lignes.filter((d) => (d.statut === "demandee" || d.statut === "en_instruction") && (d.retardJours ?? 0) > 0).length;

  const liste = useMemo(() => {
    const n = normaliser(recherche);
    return lignes.filter((d) => {
      const passe = filtre === "tous"
        || (filtre === "a_preparer" && d.statut === "demandee")
        || (filtre === "en_instruction" && d.statut === "en_instruction")
        || (filtre === "pretes" && d.statut === "disponible")
        || (filtre === "remises" && d.statut === "remise")
        || (filtre === "en_retard" && (d.statut === "demandee" || d.statut === "en_instruction") && (d.retardJours ?? 0) > 0);
      return passe && (!n || normaliser(`${d.apprenant.prenoms} ${d.apprenant.nom} ${d.apprenant.id} ${LIBELLE_ACTE[d.typeActe]}`).includes(n));
    });
  }, [lignes, filtre, recherche]);

  const options: { valeur: Filtre; libelle: string }[] = [
    { valeur: "tous", libelle: `Toutes (${lignes.length})` },
    { valeur: "a_preparer", libelle: `À préparer (${aPreparer})` },
    { valeur: "en_instruction", libelle: `En cours (${enCours})` },
    { valeur: "pretes", libelle: `Prêtes (${prêtes})` },
    { valeur: "remises", libelle: `Remises (${lignes.filter((d) => d.statut === "remise").length})` },
    { valeur: "en_retard", libelle: `En retard (${enRetard})` },
  ];

  return (
    <>
      <Cascade className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Element><TuileIndicateur libelle="À préparer" icone={Inbox} accent="ambre" valeur={<Compteur valeur={aPreparer} format={entier} />} indice="déposées, aucune prise en charge" /></Element>
        <Element><TuileIndicateur libelle="Prêtes à retirer" icone={PackageCheck} accent="sarcelle" valeur={<Compteur valeur={prêtes} format={entier} />} indice="signées, en attente de l'étudiant" /></Element>
        <Element><TuileIndicateur libelle="Au-delà du délai publié" icone={Clock} accent="critique" valeur={<Compteur valeur={enRetard} format={entier} />} indice="jours écoulés sans acte" /></Element>
        <Element><TuileIndicateur libelle="Délai médian constaté" icone={Gauge} accent="bleu" valeur={<Medianes id={id} />} indice="demande → mise à disposition" /></Element>
      </Cascade>

      <Card data-guide="guichet-file" className="min-w-0 overflow-hidden p-0">
        <div className="space-y-4 px-5 pt-5">
          <CardHeader className="mb-0" icon={Stamp} title="File du guichet" subtitle="La remise exige le mode de retrait et la pièce présentée : sans les deux, rien ne se prouve." action={<Badge>{liste.length}</Badge>} />
          <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1">
              {options.map((o) => (
                <button key={o.valeur} onClick={() => setFiltre(o.valeur)} aria-pressed={filtre === o.valeur}
                  className={cn("shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors", filtre === o.valeur ? "bg-blue-soft text-accent-ink" : "text-ink-2 hover:bg-surface-2")}>
                  {o.libelle}
                </button>
              ))}
            </div>
            <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Étudiant, identifiant ou acte" aria-label="Rechercher dans la file" className={cn(classeChamp, "lg:w-72")} />
          </div>
        </div>

        {liste.length === 0 ? (
          <div className="px-5 pb-5"><EtatVide icone={Hourglass} titre="Aucune demande dans ce cadre" texte={lignes.length ? "Aucune demande ne correspond à ce filtre." : "Les demandes déposées par les étudiants de votre établissement apparaîtront ici."} /></div>
        ) : (
          <ul className="divide-y divide-line/60 border-t border-line/60">
            {liste.map((d) => <Ligne key={d.id} d={d} onStatuer={(statut) => setCible({ demande: d, statut })} />)}
          </ul>
        )}
      </Card>

      <DelaisGuichet id={id} />
      <DialogueDecision id={id} cible={cible} onFermer={() => setCible(null)} />
    </>
  );
}

/** Médiane toutes lignes confondues de l'établissement : un seul chiffre à lire avant d'ouvrir le détail. */
function Medianes({ id }: { id: string }) {
  const q = useDelaisGuichet(id);
  const ponderee = useMemo(() => {
    const utiles = (q.data ?? []).filter((l) => l.medianeJours !== null);
    if (!utiles.length) return null;
    const total = utiles.reduce((s, l) => s + l.demandes, 0);
    return Math.round(utiles.reduce((s, l) => s + (l.medianeJours ?? 0) * l.demandes, 0) / (total || 1));
  }, [q.data]);
  return <span className="font-display text-[26px] font-bold leading-none tracking-tight text-ink tabular">{ponderee === null ? "—" : `${ponderee} j`}</span>;
}

function Ligne({ d, onStatuer }: { d: DemandeGuichet; onStatuer: (s: StatutViseParGuichet) => void }) {
  const ouvrables = TRANSITIONS_ACTE[d.statut].filter((s): s is StatutViseParGuichet => s !== "retiree");
  const retard = (d.statut === "demandee" || d.statut === "en_instruction") && (d.retardJours ?? 0) > 0;
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-2 px-5 py-3.5 hover:bg-surface-2/40">
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
        d.statut === "disponible" ? "bg-success-bg text-success" : d.statut === "refusee" ? "bg-critical-bg text-critical" : retard ? "bg-warning-bg text-warning" : "bg-surface-2 text-ink-muted")}>
        <Stamp size={17} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">
          {d.apprenant.prenoms} {d.apprenant.nom}
          <span className="ml-2 font-mono text-xs text-ink-muted">{d.apprenant.id}</span>
        </p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {LIBELLE_ACTE[d.typeActe]} · {d.anneeUniversitaire ?? "hors année"} · déposée le {date(d.demandeeLe)} · délai {d.delaiContractuelJours} j ({LIBELLE_AUTORITE[d.autorite]})
        </p>
        {d.joursEcoules !== null && <p className="mt-1 text-[13px] text-ink-2">{d.joursEcoules} jours écoulés{retard ? ` · ${d.retardJours} jours au-delà du délai publié` : ""}</p>}
        {d.statut === "refusee" && d.motifRefus && <p className="mt-1 text-xs text-critical">Refus : {d.motifRefus}</p>}
        {d.statut === "remise" && <p className="mt-1 text-xs text-ink-muted">Remise le {d.remisLe ? date(d.remisLe) : "—"} · {d.modeRetrait ? LIBELLE_MODE_RETRAIT[d.modeRetrait] : "—"}{d.piecePresentee ? ` · ${LIBELLE_PIECE[d.piecePresentee]}` : ""}{d.remisA ? ` · à ${d.remisA}` : ""}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Statut ton={TON_STATUT_ACTE[d.statut]}>{LIBELLE_STATUT_ACTE[d.statut]}</Statut>
        {ouvrables.map((s) => (
          <Button key={s} variante={s === "refusee" ? "fantome" : s === "remise" ? "valider" : "secondaire"} taille="sm"
            icone={s === "refusee" ? X : s === "remise" ? Check : undefined}
            onClick={() => onStatuer(s)}>
            {TITRE_DECISION[s]}
          </Button>
        ))}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ Dialogue de transition */

function DialogueDecision({ id, cible, onFermer }: { id: string; cible: { demande: DemandeGuichet; statut: StatutViseParGuichet } | null; onFermer: () => void }) {
  const [dateActe, setDateActe] = useState("");
  const [motif, setMotif] = useState("");
  const [mode, setMode] = useState<ModeRetrait>("titulaire");
  const [piece, setPiece] = useState<PieceIdentite | "">("");
  const [remisA, setRemisA] = useState("");
  const [quittance, setQuittance] = useState("");
  const statuer = useDecisionGuichetMutation(id);

  const statut = cible?.statut ?? "en_instruction";
  const estRemise = statut === "remise";
  const estRefus = statut === "refusee";
  const erreur = statuer.error instanceof ErreurApi ? statuer.error : null;

  const pieceExigee = estRemise && mode !== "dematerialise";
  const procuration = mode === "mandataire" && piece !== "procuration_notariee" && piece !== "procuration_tribunal";
  const destinataire = estRemise && mode !== "titulaire" && mode !== "dematerialise" && !remisA.trim();
  const refusVide = estRefus && motif.trim().length < 5;
  const pret = !procuration && !destinataire && !refusVide;

  const fermer = () => { if (!statuer.isPending) { setDateActe(""); setMotif(""); setRemisA(""); setQuittance(""); setPiece(""); setMode("titulaire"); onFermer(); } };

  const envoyer = () => {
    if (!cible) return;
    const corps: DecisionGuichet = {
      statut,
      ...(dateActe ? { date: dateActe } : {}),
      ...(estRefus ? { motif: motif.trim() } : {}),
      ...(estRemise ? {
        modeRetrait: mode,
        piecePresentee: piece === "" ? null : piece,
        remisA: mode === "titulaire" || mode === "dematerialise" ? null : remisA.trim() || null,
        referenceQuittance: quittance.trim() || null,
      } : {}),
    };
    statuer.mutate({ demandeId: cible.demande.id, ...corps }, {
      onSuccess: () => {
        notifier({ ton: "succes", titre: TITRE_DECISION[statut], texte: `${LIBELLE_ACTE[cible.demande.typeActe]} · l'étudiant est notifié et le registre porte la date.` });
        fermer();
      },
      onError: (e) => { if (e instanceof ErreurApi && e.statut === 409) onFermer(); },
    });
  };

  return (
    <Dialogue
      ouvert={!!cible}
      onFermer={fermer}
      ton={estRefus ? "danger" : estRemise ? "succes" : "neutre"}
      icone={estRefus ? X : estRemise ? Check : Hourglass}
      titre={cible ? `${TITRE_DECISION[cible.statut]} — ${LIBELLE_ACTE[cible.demande.typeActe]}` : ""}
      description={cible ? `${cible.demande.apprenant.prenoms} ${cible.demande.apprenant.nom} · déposée le ${date(cible.demande.demandeeLe)}` : undefined}
      pied={
        <>
          <Button variante="secondaire" onClick={fermer} disabled={statuer.isPending}>Annuler</Button>
          <Button variante={estRefus ? "danger" : estRemise ? "valider" : "primaire"} disabled={!pret} chargement={statuer.isPending} onClick={envoyer}>{TITRE_DECISION[statut]}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Date de l&apos;acte</span>
          <input type="date" value={dateActe} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDateActe(e.target.value)} className={classeChamp} aria-label="Date de l'acte" />
          <span className="mt-1 block text-xs text-ink-muted">Vide = aujourd&apos;hui. Une remise constatée la veille se date : sans cela, le guichet fabriquerait un jour de retard à l&apos;étudiant.</span>
        </label>

        {estRefus && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Motif du refus <span className="text-critical">*</span></span>
            <textarea value={motif} onChange={(e) => setMotif(e.target.value.slice(0, 200))} rows={3} placeholder="Ce qui manque, et comment l'obtenir : un refus sans motif ne se conteste pas." className={cn(classeChamp, "h-auto py-2")} aria-invalid={!!motif && refusVide} />
            <span className="mt-1 block text-xs text-ink-muted">{motif.trim().length}/200 · 5 caractères minimum</span>
          </label>
        )}

        {estRemise && (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Mode de retrait <span className="text-critical">*</span></span>
              <select value={mode} onChange={(e) => setMode(e.target.value as ModeRetrait)} className={classeSelect} aria-label="Mode de retrait">
                {(Object.keys(LIBELLE_MODE_RETRAIT) as ModeRetrait[]).map((m) => <option key={m} value={m}>{LIBELLE_MODE_RETRAIT[m]}</option>)}
              </select>
            </label>
            {pieceExigee && (
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Pièce présentée <span className="text-critical">*</span></span>
                <select value={piece} onChange={(e) => setPiece(e.target.value as PieceIdentite | "")} className={classeSelect} aria-label="Pièce d'identité présentée">
                  <option value="">— choisir —</option>
                  {(Object.keys(LIBELLE_PIECE) as PieceIdentite[])
                    .filter((p) => mode !== "mandataire" || p === "procuration_notariee" || p === "procuration_tribunal")
                    .map((p) => <option key={p} value={p}>{LIBELLE_PIECE[p]}</option>)}
                </select>
                {procuration && <p className="mt-1 text-xs text-critical">Un mandataire doit présenter une procuration notariée ou établie au tribunal.</p>}
              </label>
            )}
            {mode !== "titulaire" && mode !== "dematerialise" && (
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Remis à <span className="text-critical">*</span></span>
                <input value={remisA} onChange={(e) => setRemisA(e.target.value.slice(0, 120))} placeholder="Nom et qualité du réceptionnaire" className={classeChamp} aria-label="Nom du réceptionnaire" />
              </label>
            )}
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Référence de quittance</span>
              <input value={quittance} onChange={(e) => setQuittance(e.target.value.slice(0, 60))} placeholder="une référence, jamais un montant" className={classeChamp} aria-label="Référence de quittance" />
            </label>
          </div>
        )}

        {!estRemise && !estRefus && <p className="text-[13px] text-ink-2">La demande passera à « {LIBELLE_STATUT_ACTE[statut]} ». L&apos;étudiant est notifié sur son espace personnel.</p>}
        {erreur && erreur.statut !== 409 && <p role="alert" className="rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">{erreur.message}</p>}
        {erreur?.statut === 409 && <p role="status" className="rounded-md bg-info-bg px-3 py-2 text-[13px] text-info">Un autre agent a déjà fait avancer cette demande : la liste vient d&apos;être actualisée.</p>}
        {cible && <p className="flex items-start gap-2 text-xs text-ink-muted"><AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />{pieceExigee && piece === "" ? "La pièce présentée est obligatoire au guichet : sans elle, la remise n'est pas prouvée." : "Cette écriture est journalisée avec votre profil et devient opposable."}</p>}
      </div>
    </Dialogue>
  );
}

/* ------------------------------------------------------------------ Délais constatés */

function DelaisGuichet({ id }: { id: string }) {
  const q = useDelaisGuichet(id);
  return (
    <Card data-guide="guichet-delais" className="min-w-0 overflow-hidden p-0">
      <CardHeader icon={Scale} title="Délais de mon guichet" subtitle="Médiane de « dépôt → mise à disposition », par acte et par barème applicable. Le retrait, lui, est de l'étudiant." />
      {q.isPending ? <div className="px-5 pb-5"><Squelette className="h-40 rounded-lg" /></div> : !q.data?.length ? (
        <div className="px-5 pb-5"><EtatVide icone={Scale} titre="Aucun acte mis à disposition" texte="La médiane se calcule dès le premier acte préparé : la mesure du délai commence à la mise à disposition." /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="border-t border-line/60 bg-surface-2/60 text-xs uppercase tracking-wide text-ink-muted">
              <tr>{["Acte", "Autorité signataire", "Barème", "Demandes", "Dans le délai", "Médiane constatée"].map((h) => <th key={h} className="px-5 py-2.5 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {q.data.map((l) => (
                <tr key={`${l.typeActe}-${l.autorite}-${l.delaiContractuelJours}`}>
                  <td className="px-5 py-3 font-medium text-ink">{LIBELLE_ACTE[l.typeActe]}</td>
                  <td className="px-5 py-3 text-ink-2">{LIBELLE_AUTORITE[l.autorite]}</td>
                  <td className="px-5 py-3 tabular-nums text-ink-2">{l.delaiContractuelJours} j</td>
                  <td className="px-5 py-3 tabular-nums text-ink-2">{l.demandes}{l.petiteUnite && <Badge ton="neutre" className="ml-2">unité petite</Badge>}</td>
                  <td className="px-5 py-3 tabular-nums text-ink-2">{l.dansDelai}/{l.demandes}</td>
                  <td className="px-5 py-3 tabular-nums font-medium text-ink">{l.medianeJours === null ? "—" : `${l.medianeJours} j`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
