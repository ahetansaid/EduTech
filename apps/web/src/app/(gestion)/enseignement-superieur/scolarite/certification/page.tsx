"use client";

import type { DecisionDiplome, Equivalence, Jury, StatutJury } from "@beile/contracts";
import { modesCertificationDe } from "@beile/contracts";
import { ArrowLeftRight, CheckCheck, Download, Gavel, Plus, ScrollText, ShieldCheck, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { TableauDonnees } from "@/components/charts/Graphiques";
import { Cascade, Element, EntreePage } from "@/components/motion";
import { notifier } from "@/components/ui/Notifications";
import { Badge, Button, Card, CardHeader, PageHeader, Squelette } from "@/components/ui/primitives";
import { TuileIndicateur } from "@/components/ui/donnees";
import {
  LIBELLE_AUTORITE_EQUIVALENCE, LIBELLE_DECISION_DIPLOME, LIBELLE_MODE_DELIBERATION, LIBELLE_OFFICE,
  LIBELLE_STATUT_EQUIVALENCE, LIBELLE_STATUT_INSCRIPTION, LIBELLE_STATUT_JURY, TON_DECISION_DIPLOME,
  TON_STATUT_EQUIVALENCE, TON_STATUT_INSCRIPTION, TON_STATUT_JURY,
  useConstituerJuryMutation, useDeliberations, useDelibererMutation, useDecisionEquivalenceMutation,
  useDeposerEquivalenceMutation, useEquivalences, useFilieresEtab, useInscriptions, useJurys, usePeriodes,
  type FiliereEtab, type InscriptionEtab, type LigneDeliberation, type RenduDeliberation,
} from "@/lib/api/scolarite-superieure";
import { LIBELLE_DIPLOME } from "@/lib/enseignement-superieur";
import { exporterCsv, type Colonne } from "@/lib/export";
import { date, entier, note } from "@/lib/format";
import { useEtablissementCourant, useProfil } from "@/lib/session";
import { classeChamp, classeSelect, Dialogue, EtatErreur, HorsPerimetre } from "../../../etablissement/_composants";
import { Bandeau, Champ, ErreurEnvoi, Rien, SelectVocabulaire } from "../_commun";
import { OngletsScolarite } from "../_OngletsScolarite";
import { OngletsESup } from "../../_Onglets";

/** Un jury ne se décrète pas complet : le quorum est une condition de validité de la délibération. */
const ETAPES_JURY: StatutJury[] = ["constitue", "reuni", "delibere", "publie"];
const ETAPE_SUIVANTE: Record<StatutJury, StatutJury | null> = { constitue: "reuni", reuni: "delibere", delibere: "publie", publie: null };
const LIBELLE_DECISION: Record<DecisionDiplome, string> = LIBELLE_DECISION_DIPLOME;

/**
 * Certification du supérieur : jury, délibération et équivalences. La porte est double et le reste à
 * l'écran — un jury d'établissement ne juge qu'un diplôme que l'autorité de capitalisation peut délibérer,
 * et un jury d'examen national relève du bureau du supérieur, jamais de la direction d'un établissement.
 */
export default function Page() {
  const id = useEtablissementCourant();
  return <EntreePage>{id ? <Certification id={id} /> : <HorsPerimetre />}</EntreePage>;
}

function Certification({ id }: { id: string }) {
  const profil = useProfil();
  const nationale = profil.habilitations.some((h) => h.role === "administration_centrale" && h.perimetre.niveau === "national");
  const jurys = useJurys(id);
  const deliberations = useDeliberations(id, null);
  const equivalences = useEquivalences(id);
  const filieres = useFilieresEtab(id);
  const periodes = usePeriodes(id);
  const inscriptions = useInscriptions(id);

  if (filieres.isPending) return <div className="space-y-5"><Squelette className="h-16" /><Squelette className="h-64" /></div>;
  if (filieres.isError) return <Card><EtatErreur erreur={filieres.error} reessayer={() => filieres.refetch()} /></Card>;

  const lignesFilieres = filieres.data ?? [];
  const noms = new Map((inscriptions.data ?? []).map((l) => [l.apprenant.id, `${l.apprenant.nom} ${l.apprenant.prenoms}`] as const));
  const enDeliberation = (jurys.data ?? []).filter((j) => j.statut === "delibere" || j.statut === "publie").length;
  const aStatuer = (equivalences.data ?? []).filter((e) => e.statut === "demandee").length;

  return (
    <div className="space-y-5">
      <PageHeader
        surtitre="Enseignement supérieur · Scolarité"
        titre="Jury, délibération & équivalences"
        sousTitre="Ce qui transforme des crédits en diplôme : un jury nommé, une délibération rendue sous homologation en cours, et les équivalences qui reconnaissent ce qui a été validé ailleurs."
      />
      <OngletsESup />
      <OngletsScolarite chef />
      <Bandeau>
        Le client ne fournit que la <strong>décision</strong> du jury : crédits validés, moyenne générale et mention sont recalculés par le serveur depuis les acquis enregistrés.
        Une délibération sur une filière <strong>sans homologation en cours</strong> est refusée (409) et le refus est journalisé — un diplôme non opposable ne se certifie pas.
        Les jurys d&apos;<strong>examen national</strong> ({LIBELLE_MODE_DELIBERATION.examen_national}) ne se constituent pas ici : {nationale ? "la porte du bureau du supérieur est ouverte à votre compte, mais cet écran reste celui d'un établissement." : "ils relèvent du bureau du supérieur (administration centrale, niveau national)." }
      </Bandeau>

      <Cascade className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Element><TuileIndicateur libelle="Jurys de l'établissement" icone={Users} accent="bleu" valeur={entier((jurys.data ?? []).length)} indice="jury_capitalisation uniquement — la liste ne montre pas les jurys nationaux" /></Element>
        <Element><TuileIndicateur libelle="Jurys délibérants" icone={Gavel} accent="sarcelle" valeur={entier(enDeliberation)} indice="seuls ceux-ci peuvent juger une promotion" /></Element>
        <Element><TuileIndicateur libelle="Décisions rendues" icone={ScrollText} accent="ambre" valeur={entier((deliberations.data ?? []).length)} indice="crédits, moyenne et mention recalculés au jour du délibéré" /></Element>
        <Element><TuileIndicateur libelle="Équivalences à statuer" icone={ShieldCheck} accent={aStatuer ? "critique" : "neutre"} valeur={entier(aStatuer)} indice="autorité d'établissement ou MESRS (DCE)" /></Element>
      </Cascade>

      <JurysCard id={id} filieres={lignesFilieres} periodes={(periodes.data ?? []).map((p) => ({ id: p.id, intitule: p.intitule, filiereId: p.filiereId, anneeUniversitaire: p.anneeUniversitaire }))} jurys={jurys.data ?? []} chargement={jurys.isPending} erreur={jurys.isError ? jurys.error : null} reessayer={() => jurys.refetch()} />

      <DeliberationCard id={id} filieres={lignesFilieres} jurys={jurys.data ?? []} lignes={inscriptions.data ?? []} noms={noms} />

      <DeliberationsRenderuesCard deliberations={deliberations.data ?? []} jurys={jurys.data ?? []} noms={noms} erreur={deliberations.isError ? deliberations.error : null} reessayer={() => deliberations.refetch()} />

      <EquivalencesCard id={id} lignes={inscriptions.data ?? []} equivalences={equivalences.data ?? []} nomme={(e: Equivalence) => noms.get(e.apprenantId) ?? e.apprenantId} erreur={equivalences.isError ? equivalences.error : null} reessayer={() => equivalences.refetch()} />
    </div>
  );
}

/* ------------------------------------------------------------------ Jurys */

function JurysCard({ id, filieres, periodes, jurys, chargement, erreur, reessayer }: {
  id: string; filieres: FiliereEtab[];
  periodes: { id: string; intitule: string; filiereId: string; anneeUniversitaire: string }[];
  jurys: Jury[]; chargement: boolean; erreur: unknown; reessayer: () => void;
}) {
  const [ouvrir, setOuvrir] = useState(false);
  const [avancer, setAvancer] = useState<Jury | null>(null);

  const COLONNES: Colonne<Jury>[] = [
    { entete: "Identifiant", valeur: (j) => j.id },
    { entete: "Autorité délibérante", valeur: (j) => LIBELLE_MODE_DELIBERATION[j.autorite] },
    { entete: "Office", valeur: (j) => (j.office ? LIBELLE_OFFICE[j.office] : "") },
    { entete: "Diplôme", valeur: (j) => LIBELLE_DIPLOME[j.diplome] },
    { entete: "Filière", valeur: (j) => j.filiereId ?? "" },
    { entete: "Période", valeur: (j) => j.periodeId ?? "" },
    { entete: "Président", valeur: (j) => j.president },
    { entete: "Membres", valeur: (j) => j.membres.join(" | ") },
    { entete: "Quorum", valeur: (j) => j.quorum },
    { entete: "Statut", valeur: (j) => LIBELLE_STATUT_JURY[j.statut] },
    { entete: "Référence du PV", valeur: (j) => j.pvReference ?? "" },
  ];

  return (
    <Card data-guide="scolarite-jurys" className="min-w-0 overflow-hidden p-0">
      <CardHeader
        icon={Users}
        title="Jurys de capitalisation"
        subtitle="Le président ne compte pas deux fois dans le quorum : membres + président doivent l'atteindre, sinon la délibération est impossible."
        action={<Button variante="secondaire" taille="sm" icone={Plus} disabled={!filieres.length} onClick={() => setOuvrir(true)}>Constituer un jury</Button>}
      />
      <div className="flex flex-wrap items-center gap-3 border-y border-line/60 bg-surface-2/40 px-5 py-3 text-xs text-ink-muted">
        {entier(jurys.length)} jury(ies) déclaré(s)
        <Button variante="fantome" taille="sm" icone={Download} disabled={!jurys.length} onClick={() => exporterCsv("jurys_certification", jurys, COLONNES, `BEILE — jurys de capitalisation de l'établissement (les jurys d'examen national ne sont pas listés ici). ${entier(jurys.length)} ligne(s), export du ${date(new Date().toISOString())}.`)}>Exporter (CSV)</Button>
      </div>
      {erreur ? (
        <div className="px-5 pb-5"><EtatErreur erreur={erreur} reessayer={reessayer} /></div>
      ) : chargement ? (
        <div className="px-5 py-5"><Squelette className="h-32 rounded-lg" /></div>
      ) : !jurys.length ? (
        <div className="px-5 pb-5"><Rien icone={Users} titre="Aucun jury constitué" texte="Un jury nomme un président, des membres et un quorum ; il désigne la filière et le diplôme qu'il juge." /></div>
      ) : (
        <TableauDonnees
          colonnes={["Jury", "Diplôme · filière", "Président", "Membres", "Quorum", "Statut", "PV", "Avancement"]}
          lignes={jurys.map((j) => [
            <span key={j.id} className="font-mono text-xs text-ink-muted">{j.id}</span>,
            <span key={`${j.id}-d`} className="flex flex-col"><span className="text-ink">{LIBELLE_DIPLOME[j.diplome]}</span><span className="text-xs text-ink-muted">{filieres.find((f) => f.id === j.filiereId)?.nom ?? (j.filiereId ? `filière ${j.filiereId}` : "filière non désignée")}</span></span>,
            <span key={`${j.id}-p`} className="text-[13px] text-ink-2">{j.president}</span>,
            <span key={`${j.id}-m`} className="flex flex-wrap gap-1">{j.membres.map((m, i) => <Badge key={`${j.id}-m-${i}`} ton="neutre">{m}</Badge>)}</span>,
            <span key={`${j.id}-q`} className={j.membres.length + 1 >= j.quorum ? "tabular-nums text-ink-2" : "tabular-nums text-critical"}>{entier(j.membres.length + 1)}/{entier(j.quorum)}</span>,
            <Badge key={`${j.id}-s`} ton={TON_STATUT_JURY[j.statut]}>{LIBELLE_STATUT_JURY[j.statut]}</Badge>,
            <span key={`${j.id}-pv`} className="font-mono text-xs text-ink-muted">{j.pvReference ?? "—"}</span>,
            <span key={`${j.id}-a`}>{ETAPE_SUIVANTE[j.statut] ? <Button variante="fantome" taille="sm" icone={ArrowLeftRight} onClick={() => setAvancer(j)}>→ {LIBELLE_STATUT_JURY[ETAPE_SUIVANTE[j.statut]!]}</Button> : <span className="text-xs text-ink-muted">achevé</span>}</span>,
          ])}
        />
      )}
      <DialogueJury id={id} filieres={filieres} periodes={periodes} ouvert={ouvrir} onFermer={() => setOuvrir(false)} />
      <DialogueAvancement id={id} jury={avancer} periodes={periodes} onFermer={() => setAvancer(null)} />
    </Card>
  );
}

function DialogueJury({ id, filieres, periodes, ouvert, onFermer }: {
  id: string; filieres: FiliereEtab[]; periodes: { id: string; intitule: string; filiereId: string; anneeUniversitaire: string }[];
  ouvert: boolean; onFermer: () => void;
}) {
  const mut = useConstituerJuryMutation(id);
  const [filiereId, setFiliereId] = useState("");
  const [periodeId, setPeriodeId] = useState("");
  const [president, setPresident] = useState("");
  const [membres, setMembres] = useState("");
  const [quorum, setQuorum] = useState("3");
  const [pv, setPv] = useState("");

  const filiere = filieres.find((f) => f.id === filiereId) ?? null;
  const diplome = filiere?.diplomeVise ?? null;
  const liste = useMemo(() => [...new Set(membres.split(",").map((x) => x.trim()).filter(Boolean))], [membres]);
  const quorumNombre = Math.max(1, Math.min(31, Number(quorum) || 0));
  const pret = !!filiere && president.trim().length >= 3 && quorumNombre >= 1;
  const fermer = () => { if (!mut.isPending) onFermer(); };

  const envoyer = () => {
    if (!diplome) return;
    mut.mutate({
      juryId: null, autorite: "jury_capitalisation", office: "etablissement", diplome,
      periodeId: periodeId || null, filiereId, sessionExamenId: null, statut: "constitue",
      president: president.trim(), membres: liste, quorum: quorumNombre, pvReference: pv.trim() || null,
    }, {
      onSuccess: (r) => { notifier({ ton: "succes", titre: "Jury constitué", texte: `${r.juryId} · statut « ${LIBELLE_STATUT_JURY[r.statut]} ». Le procès-verbal papier reste l'acte : BEILE en tient la référence.` }); fermer(); },
    });
  };

  return (
    <Dialogue ouvert={ouvert} onFermer={fermer} icone={Users} titre="Constituer un jury de capitalisation"
      description="L'autorité est fixée à « jury de l'établissement » : un examen national se déclare au bureau du supérieur, pas ici."
      pied={<><Button variante="secondaire" onClick={fermer} disabled={mut.isPending}>Annuler</Button><Button disabled={!pret} chargement={mut.isPending} onClick={envoyer}>Constituer</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Filière jugée" obligatoire>
            <select value={filiereId} onChange={(e) => { setFiliereId(e.target.value); setPeriodeId(""); }} className={classeChamp} aria-label="Choisir la filière jugée par le jury">
              <option value="">Choisir une filière…</option>
              {filieres.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
            </select>
          </Champ>
          <Champ label="Diplôme délibéré" aide={diplome ? `Valeurs certifiables par cette autorité : ${modesCertificationDe(diplome).map((m) => LIBELLE_MODE_DELIBERATION[m]).join(", ")}.` : "Dépend du diplôme visé par la filière."}>
            <input readOnly value={diplome ? LIBELLE_DIPLOME[diplome] : ""} className={`${classeChamp} bg-surface-2`} aria-label="Diplôme délibéré par le jury" />
          </Champ>
          <Champ label="Période" aide="Facultatif : elle borne la règle de validation appliquée à la délibération.">
            <select value={periodeId} onChange={(e) => setPeriodeId(e.target.value)} className={classeChamp} disabled={!filiere} aria-label="Choisir la période du jury">
              <option value="">— aucune —</option>
              {periodes.filter((p) => !filiere || p.filiereId === filiere.id).map((p) => <option key={p.id} value={p.id}>{p.anneeUniversitaire} · {p.intitule}</option>)}
            </select>
          </Champ>
          <Champ label="Quorum" aide="Président compris : membres + président doivent l'atteindre."><input type="number" min={1} max={31} value={quorum} onChange={(e) => setQuorum(e.target.value)} className={classeChamp} aria-label="Quorum du jury" /></Champ>
        </div>
        <Champ label="Président du jury" aide="Nom civique tel que porté au procès-verbal (3 caractères au moins)." obligatoire><input value={president} onChange={(e) => setPresident(e.target.value.slice(0, 120))} className={classeChamp} aria-label="Président du jury" /></Champ>
        <Champ label="Membres" aide={`Noms séparés par des virgules, 30 au plus. Actuellement ${entier(liste.length)} membre(s) — total ${entier(liste.length + 1)} avec le président, quorum ${entier(quorumNombre)}.`}>
          <textarea value={membres} onChange={(e) => setMembres(e.target.value.slice(0, 1200))} rows={2} className={classeChamp} aria-label="Membres du jury" />
        </Champ>
        <Champ label="Référence du procès-verbal" aide="La cote de l'acte signé : BEILE ne remplace pas le papier, il en garde la trace."><input value={pv} onChange={(e) => setPv(e.target.value.slice(0, 80))} placeholder="PV-2026-…" className={classeChamp} aria-label="Référence du procès-verbal" /></Champ>
        <ErreurEnvoi erreur={mut.error} />
      </div>
    </Dialogue>
  );
}

function DialogueAvancement({ id, jury, periodes, onFermer }: {
  id: string; jury: Jury | null; periodes: { id: string; intitule: string; filiereId: string; anneeUniversitaire: string }[]; onFermer: () => void;
}) {
  const mut = useConstituerJuryMutation(id);
  const [pv, setPv] = useState("");
  const suivante = jury ? ETAPE_SUIVANTE[jury.statut] : null;
  const fermer = () => { if (!mut.isPending) onFermer(); };

  return (
    <Dialogue ouvert={!!jury && !!suivante} onFermer={fermer} icone={Gavel} titre={`Faire avancer le jury : ${jury ? LIBELLE_STATUT_JURY[suivante!] : ""}`}
      description="La même composition est réenregistrée au statut suivant. Un jury doit atteindre « A délibéré » avant de juger une promotion."
      pied={<><Button variante="secondaire" onClick={fermer} disabled={mut.isPending}>Annuler</Button>
        <Button chargement={mut.isPending} disabled={!jury || !suivante} onClick={() => {
          if (!jury || !suivante) return;
          mut.mutate({
            juryId: jury.id, autorite: jury.autorite, office: jury.office, diplome: jury.diplome, periodeId: jury.periodeId,
            filiereId: jury.filiereId, sessionExamenId: jury.sessionExamenId, statut: suivante, president: jury.president,
            membres: jury.membres, quorum: jury.quorum, pvReference: pv.trim() || jury.pvReference,
          }, { onSuccess: () => { notifier({ ton: "succes", titre: "Statut du jury mis à jour", texte: `${jury.id} est maintenant « ${LIBELLE_STATUT_JURY[suivante]} ».` }); setPv(""); fermer(); } });
        }}>Enregistrer</Button></>}>
      <div className="space-y-4">
        {jury && (
          <div className="space-y-2 text-[13px] text-ink-2">
            <p><span className="font-mono text-xs text-ink-muted">{jury.id}</span> · {LIBELLE_DIPLOME[jury.diplome]} · {periodes.find((p) => p.id === jury.periodeId)?.intitule ?? "sans période"}</p>
            <p>Président {jury.president} · {entier(jury.membres.length)} membre(s) · quorum {entier(jury.quorum)}</p>
            <p className="flex flex-wrap gap-1">{ETAPES_JURY.map((s) => <Badge key={s} ton={s === suivante ? "avertissement" : jury.statut === s ? "succes" : "neutre"}>{LIBELLE_STATUT_JURY[s]}</Badge>)}</p>
          </div>
        )}
        <Champ label="Référence du PV (nouvelle étape)" aide="Facultatif : sans saisie, la référence déjà enregistrée est conservée."><input value={pv} onChange={(e) => setPv(e.target.value.slice(0, 80))} className={classeChamp} aria-label="Référence du procès-verbal de la nouvelle étape" /></Champ>
        <ErreurEnvoi erreur={mut.error} />
      </div>
    </Dialogue>
  );
}

/* ------------------------------------------------------------------ Délibérer une promotion */

function DeliberationCard({ id, filieres, jurys, lignes, noms }: {
  id: string; filieres: FiliereEtab[]; jurys: Jury[]; lignes: InscriptionEtab[]; noms: Map<string, string>;
}) {
  const delibereurs = jurys.filter((j) => j.statut === "delibere" || j.statut === "publie");
  const [juryId, setJuryId] = useState("");
  const [choix, setChoix] = useState<Record<string, DecisionDiplome>>({});
  const [manquantes, setManquantes] = useState<Record<string, string>>({});
  const mut = useDelibererMutation(id);

  const jury = delibereurs.find((j) => j.id === juryId) ?? null;
  const candidates = jury ? lignes.filter((l) => l.filiere.id === jury.filiereId) : [];
  const selectionnes = candidates.filter((l) => choix[l.apprenant.id]);
  const filiere = filieres.find((f) => f.id === jury?.filiereId) ?? null;

  const envoyer = () => {
    mut.mutate({
      juryId,
      decisions: selectionnes.map((l) => ({
        apprenantId: l.apprenant.id, decision: choix[l.apprenant.id],
        ueManquantes: (manquantes[l.apprenant.id] ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 60),
      })),
    }, {
      onSuccess: (r: RenduDeliberation) => {
        notifier({
          ton: r.enregistres.length ? "succes" : "avertissement",
          titre: r.enregistres.length ? `${entier(r.enregistres.length)} décision(s) au registre` : "Aucune décision enregistrée",
          texte: r.deja ? "Cette délibération était déjà au registre : rien n'a été doublonné." : selectionnes.length ? `${entier(r.rendu.filter((x) => x.decision === "non_enregistree").length)} ligne(s) refusée(s) par le serveur, motif rendu.` : "",
        });
        setChoix({}); setManquantes({});
      },
    });
  };

  return (
    <Card data-guide="scolarite-deliberation" className="min-w-0 overflow-hidden p-0">
      <CardHeader
        icon={Gavel}
        title="Délibérer une promotion"
        subtitle={`Le jury ${jury ? jury.id : ""} ne juge que la filière qu'il désigne. Crédits validés, moyenne et mention sont recalculés : ici on ne saisit que la décision.`}
        action={<Button disabled={!selectionnes.length} chargement={mut.isPending} icone={CheckCheck} onClick={envoyer}>Délibérer {entier(selectionnes.length)} ligne(s)</Button>}
      />
      <div className="flex flex-wrap items-end gap-3 border-y border-line/60 bg-surface-2/40 px-5 py-3">
        <label className="flex items-center gap-2 text-[13px] text-ink-2"><span className="text-ink-muted">Jury délibérant</span>
          <select value={juryId} onChange={(e) => { setJuryId(e.target.value); setChoix({}); setManquantes({}); }} className={classeSelect} aria-label="Choisir le jury délibérant">
            <option value="">Choisir un jury…</option>
            {delibereurs.map((j) => <option key={j.id} value={j.id}>{LIBELLE_DIPLOME[j.diplome]} · {j.president} · {j.id}</option>)}
          </select>
        </label>
        {filiere && <span className="text-xs text-ink-muted">{filiere.nom} — {entier(filiere.creditsEcts)} crédits requis · {entier(candidates.length)} étudiant(s) de la filière</span>}
        {!delibereurs.length && <span className="text-xs text-critical">Aucun jury au statut « A délibéré » : la porte est fermée tant que le jury n&apos;est pas déclaré délibérant.</span>}
      </div>

      {!jury ? (
        <div className="px-5 pb-5"><Rien icone={Gavel} titre="Aucun jury sélectionné" texte="Un jury délibère la filière qu'il désigne, sous une homologation en cours." /></div>
      ) : !jury.filiereId ? (
        <div className="px-5 pb-5"><Rien icone={Gavel} titre="Ce jury ne désigne aucune filière" texte="Le serveur refuse la délibération (422) tant que le jury n'a pas nommé la filière qu'il juge : reprendre la constitution du jury." /></div>
      ) : !candidates.length ? (
        <div className="px-5 pb-5"><Rien icone={Gavel} titre="Aucun étudiant dans la filière jugée" texte="La liste suit les inscriptions de l'établissement pour la filière du jury." /></div>
      ) : (
        <div className="space-y-3 px-5 pb-5">
          <TableauDonnees
            colonnes={["Étudiant·e", "Année", "Statut", "Crédits acquis", "Décision du jury", "UE manquantes"]}
            lignes={candidates.map((l) => {
              const decision = choix[l.apprenant.id];
              return [
                <span key={l.inscription.id} className="flex flex-col"><span className="text-ink">{noms.get(l.apprenant.id) ?? l.apprenant.id}</span><span className="font-mono text-xs text-ink-muted">{l.inscription.numeroEtudiant ?? "—"}</span></span>,
                l.inscription.anneeUniversitaire,
                <Badge key={`${l.inscription.id}-s`} ton={TON_STATUT_INSCRIPTION[l.inscription.statut]}>{LIBELLE_STATUT_INSCRIPTION[l.inscription.statut]}</Badge>,
                entier(l.inscription.creditsAcquisCumules),
                <select key={`${l.inscription.id}-d`} value={decision ?? ""} onChange={(e) => setChoix({ ...choix, [l.apprenant.id]: e.target.value as DecisionDiplome })} className={classeSelect} aria-label={`Décision du jury pour ${noms.get(l.apprenant.id) ?? l.apprenant.id}`}>
                  <option value="">— ne pas délibérer —</option>
                  {(Object.keys(LIBELLE_DECISION) as DecisionDiplome[]).map((d) => <option key={d} value={d}>{LIBELLE_DECISION[d]}</option>)}
                </select>,
                <input key={`${l.inscription.id}-u`} value={manquantes[l.apprenant.id] ?? ""} onChange={(e) => setManquantes({ ...manquantes, [l.apprenant.id]: e.target.value.slice(0, 200) })} placeholder={decision === "admis_sous_reserve" || decision === "ajourne" ? "UE à nommer (obligatoire)" : "UE 4, UE 7…"} className={classeChamp} aria-label={`UE manquantes pour ${noms.get(l.apprenant.id) ?? l.apprenant.id}`} />,
              ];
            })}
          />
          {filiere && !filiere.creditsEcts && <p className="rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">La filière n&apos;a aucun volume de crédits déclaré : le serveur refusera la délibération (409) — nul ne peut être dit admis ni ajourné sans seuil.</p>}
          <p className="text-xs text-ink-muted">Un « admis » sous le volume de la filière n&apos;est pas enregistré : le serveur rend la ligne avec son motif et demande au jury de statuer à nouveau. Une « admission sous réserve » doit nommer ce qui manque.</p>
          <ErreurEnvoi erreur={mut.error} />
        </div>
      )}
    </Card>
  );
}

function DeliberationsRenderuesCard({ deliberations, jurys, noms, erreur, reessayer }: {
  deliberations: LigneDeliberation[]; jurys: Jury[]; noms: Map<string, string>; erreur: unknown; reessayer: () => void;
}) {
  const COLONNES: Colonne<LigneDeliberation>[] = [
    { entete: "Délibéré le", valeur: (l) => date(l.deliberation.delibereLe) },
    { entete: "Étudiant", valeur: (l) => noms.get(l.apprenant.id) ?? l.apprenant.id },
    { entete: "Diplôme", valeur: (l) => LIBELLE_DIPLOME[l.deliberation.diplome] },
    { entete: "Décision", valeur: (l) => LIBELLE_DECISION[l.deliberation.decision] },
    { entete: "Crédits validés", valeur: (l) => l.deliberation.creditsValides },
    { entete: "Crédits requis", valeur: (l) => l.deliberation.creditsRequis },
    { entete: "Moyenne générale", valeur: (l) => (l.deliberation.moyenneGenerale === null ? "" : l.deliberation.moyenneGenerale) },
    { entete: "Mention", valeur: (l) => l.deliberation.mention ?? "" },
    { entete: "UE manquantes", valeur: (l) => l.deliberation.ueManquantes.join(" | ") },
    { entete: "Jury", valeur: (l) => l.deliberation.juryId },
    { entete: "Certificat émis", valeur: (l) => l.deliberation.certificatId ?? "" },
  ];
  const sansCertificat = deliberations.filter((l) => l.deliberation.certificatId === null).length;

  return (
    <Card data-guide="scolarite-deliberations" className="min-w-0 overflow-hidden p-0">
      <CardHeader
        icon={ScrollText}
        title="Délibérations rendues dans l'établissement"
        subtitle="Une délibération sans certificat émis reste visible : c'est l'état que la certification du supérieur doit retrouver, pas une ligne à masquer."
        action={<Button variante="secondaire" taille="sm" icone={Download} disabled={!deliberations.length} onClick={() => exporterCsv("deliberations_diplomes", deliberations, COLONNES, `BEILE — décisions de jury rendues dans cet établissement ; moyenne, mention et crédits proviennent du recalcul du serveur. ${deliberations.length} ligne(s) dont ${sansCertificat} sans certificat, export du ${date(new Date().toISOString())}.`)}>Exporter (CSV)</Button>}
      />
      <div className="flex flex-wrap items-center gap-3 border-y border-line/60 bg-surface-2/40 px-5 py-3 text-xs text-ink-muted">
        {entier(deliberations.length)} décision(s) · {entier(sansCertificat)} sans certificat émis
        <Badge ton="neutre">{entier(jurys.length)} jury(s) de capitalisation</Badge>
      </div>
      {erreur ? (
        <div className="px-5 pb-5"><EtatErreur erreur={erreur} reessayer={reessayer} /></div>
      ) : !deliberations.length ? (
        <div className="px-5 pb-5"><Rien icone={ScrollText} titre="Aucune délibération enregistrée" texte="Les décisions apparaissent dès qu'un jury déclaré délibérant a statué sur une promotion." /></div>
      ) : (
        <TableauDonnees
          colonnes={["Étudiant·e", "Diplôme", "Décision", "Crédits validés / requis", "Moyenne", "Mention", "Manquantes", "Jury", "Certificat"]}
          lignes={deliberations.map((l) => [
            <span key={l.deliberation.id} className="flex flex-col"><span className="text-ink">{noms.get(l.apprenant.id) ?? l.apprenant.id}</span><span className="text-xs text-ink-muted">{l.jury.president}</span></span>,
            LIBELLE_DIPLOME[l.deliberation.diplome],
            <Badge key={`${l.deliberation.id}-d`} ton={TON_DECISION_DIPLOME[l.deliberation.decision]}>{LIBELLE_DECISION[l.deliberation.decision]}</Badge>,
            <span key={`${l.deliberation.id}-c`} className="tabular-nums text-ink-2">{entier(l.deliberation.creditsValides)} / {entier(l.deliberation.creditsRequis)}</span>,
            note(l.deliberation.moyenneGenerale),
            l.deliberation.mention ? <Badge key={`${l.deliberation.id}-m`} ton="marque">{l.deliberation.mention}</Badge> : <span key={`${l.deliberation.id}-m`} className="text-xs text-ink-muted">—</span>,
            <span key={`${l.deliberation.id}-u`} className="text-xs text-ink-2">{l.deliberation.ueManquantes.length ? l.deliberation.ueManquantes.join(", ") : "—"}</span>,
            <span key={`${l.deliberation.id}-j`} className="font-mono text-xs text-ink-muted">{l.deliberation.juryId}</span>,
            l.deliberation.certificatId ? <Badge key={`${l.deliberation.id}-ct`} ton="succes">{l.deliberation.certificatId}</Badge> : <Badge key={`${l.deliberation.id}-ct`} ton="avertissement">non émis</Badge>,
          ])}
        />
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ Équivalences */

function EquivalencesCard({ id, lignes, equivalences, nomme, erreur, reessayer }: {
  id: string; lignes: InscriptionEtab[]; equivalences: Equivalence[]; nomme: (e: Equivalence) => string; erreur: unknown; reessayer: () => void;
}) {
  const [deposer, setDeposer] = useState(false);
  const [statuer, setStatuer] = useState<Equivalence | null>(null);

  const COLONNES: Colonne<Equivalence>[] = [
    { entete: "Identifiant", valeur: (e) => e.id },
    { entete: "Personne", valeur: (e) => nomme(e) },
    { entete: "UE visée", valeur: (e) => e.ueId },
    { entete: "Titre d'origine", valeur: (e) => e.titreOrigine },
    { entete: "Établissement d'origine", valeur: (e) => e.etablissementOrigine ?? "" },
    { entete: "Année d'origine", valeur: (e) => e.anneeOrigine ?? "" },
    { entete: "Crédits reconnus", valeur: (e) => e.creditsReconnus },
    { entete: "Statut", valeur: (e) => LIBELLE_STATUT_EQUIVALENCE[e.statut] },
    { entete: "Autorité", valeur: (e) => LIBELLE_AUTORITE_EQUIVALENCE[e.autorite] },
    { entete: "Motif", valeur: (e) => e.motif },
    { entete: "Statuée le", valeur: (e) => (e.decideLe ? date(e.decideLe) : "") },
  ];

  return (
    <Card data-guide="scolarite-equivalences" className="min-w-0 overflow-hidden p-0">
      <CardHeader
        icon={ShieldCheck}
        title="Équivalences"
        subtitle="Reconnaître une UE validée ailleurs. Une équivalence d'autorité nationale relève d'une direction du MESRS (DCE), pas de l'établissement qui en profite."
        action={<Button variante="secondaire" taille="sm" icone={Plus} disabled={!lignes.length} onClick={() => setDeposer(true)}>Déposer une demande</Button>}
      />
      <div className="flex flex-wrap items-center gap-3 border-y border-line/60 bg-surface-2/40 px-5 py-3 text-xs text-ink-muted">
        {entier(equivalences.length)} demande(s) · {entier(equivalences.filter((e) => e.statut === "demandee").length)} à statuer
        <Button variante="fantome" taille="sm" icone={Download} disabled={!equivalences.length} onClick={() => exporterCsv("equivalences", equivalences, COLONNES, `BEILE — équivalences déposées dans cet établissement. L'UE visée est identifiée par son identifiant de catalogue. ${entier(equivalences.length)} ligne(s), export du ${date(new Date().toISOString())}.`)}>Exporter (CSV)</Button>
      </div>
      {erreur ? (
        <div className="px-5 pb-5"><EtatErreur erreur={erreur} reessayer={reessayer} /></div>
      ) : !equivalences.length ? (
        <div className="px-5 pb-5"><Rien icone={ShieldCheck} titre="Aucune équivalence déposée" texte="Une demande nomme l'UE visée, le titre d'origine et un motif — la décision, elle, portera une autorité." /></div>
      ) : (
        <TableauDonnees
          colonnes={["Personne", "UE visée", "Titre d'origine", "Crédits reconnus", "Statut", "Autorité", "Motif", "Décision"]}
          lignes={equivalences.map((e) => [
            <span key={e.id} className="text-[13px] text-ink">{nomme(e)}</span>,
            <span key={`${e.id}-u`} className="font-mono text-xs text-ink-muted">{e.ueId}</span>,
            <span key={`${e.id}-t`} className="flex flex-col"><span className="text-ink">{e.titreOrigine}</span><span className="text-xs text-ink-muted">{e.etablissementOrigine ?? "origine non déclarée"}{e.anneeOrigine ? ` · ${e.anneeOrigine}` : ""}</span></span>,
            entier(e.creditsReconnus),
            <Badge key={`${e.id}-s`} ton={TON_STATUT_EQUIVALENCE[e.statut]}>{LIBELLE_STATUT_EQUIVALENCE[e.statut]}</Badge>,
            <span key={`${e.id}-a`} className="text-[13px] text-ink-2">{LIBELLE_AUTORITE_EQUIVALENCE[e.autorite]}</span>,
            <span key={`${e.id}-m`} className="max-w-[260px] text-[13px] text-ink-2">{e.motif}</span>,
            <span key={`${e.id}-d`} className="flex items-center justify-end gap-2"><span className="text-xs text-ink-muted">{e.decideLe ? date(e.decideLe) : "—"}</span>{e.statut === "demandee" && <Button variante="fantome" taille="sm" icone={Gavel} onClick={() => setStatuer(e)}>Statuer</Button>}</span>,
          ])}
        />
      )}
      <DialogueDepot id={id} lignes={lignes} ouvert={deposer} onFermer={() => setDeposer(false)} />
      <DialogueDecision id={id} equivalence={statuer} nomme={statuer ? nomme(statuer) : ""} onFermer={() => setStatuer(null)} />
    </Card>
  );
}

function DialogueDepot({ id, lignes, ouvert, onFermer }: { id: string; lignes: InscriptionEtab[]; ouvert: boolean; onFermer: () => void }) {
  const mut = useDeposerEquivalenceMutation(id);
  const [apprenantId, setApprenantId] = useState("");
  const [ueId, setUeId] = useState("");
  const [titre, setTitre] = useState("");
  const [etablissement, setEtablissement] = useState("");
  const [annee, setAnnee] = useState("");
  const [motif, setMotif] = useState("");

  const inscription = lignes.find((l) => l.apprenant.id === apprenantId) ?? null;
  const fermer = () => { if (!mut.isPending) onFermer(); };
  const pret = !!apprenantId && !!ueId && titre.trim().length >= 3 && motif.trim().length >= 5 && (!annee || /^\d{4}-\d{4}$/.test(annee));

  return (
    <Dialogue ouvert={ouvert} onFermer={fermer} icone={ShieldCheck} titre="Déposer une demande d'équivalence"
      description="Le dépôt enregistre une demande : les crédits reconnus restent à 0 tant qu'une autorité n'a pas statué."
      pied={<><Button variante="secondaire" onClick={fermer} disabled={mut.isPending}>Annuler</Button>
        <Button disabled={!pret} chargement={mut.isPending} onClick={() => mut.mutate({ apprenantId, ueId, titreOrigine: titre.trim(), etablissementOrigine: etablissement.trim() || null, anneeOrigine: annee || null, motif: motif.trim() }, {
          onSuccess: (e) => { notifier({ ton: "succes", titre: "Demande déposée", texte: `${e.id} · statut « ${LIBELLE_STATUT_EQUIVALENCE[e.statut]} ». Elle ne capitalise aucun crédit avant décision.` }); fermer(); },
        })}>Déposer</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Personne" obligatoire aide="Seule une inscription de CET établissement permet de déposer : l'équivalence porte sur une UE de son cursus.">
            <select value={apprenantId} onChange={(e) => { setApprenantId(e.target.value); setUeId(""); }} className={classeChamp} aria-label="Choisir la personne de la demande d'équivalence">
              <option value="">Choisir dans la promotion…</option>
              {lignes.map((l) => <option key={l.apprenant.id} value={l.apprenant.id}>{l.apprenant.nom} {l.apprenant.prenoms} · {l.filiere.nom}</option>)}
            </select>
          </Champ>
          <Champ label="UE visée (identifiant du catalogue)" obligatoire aide={inscription ? `Filière ${inscription.filiere.nom} — l'UE doit exister au catalogue national.` : "Choisissez d'abord la personne."}>
            <input value={ueId} onChange={(e) => setUeId(e.target.value.trim().slice(0, 60))} placeholder="UEC-…" className={classeChamp} aria-label="Identifiant de l'unité d'enseignement visée" />
          </Champ>
          <Champ label="Titre d'origine" obligatoire aide="Le diplôme ou le titre dont provient l'acquis (3 caractères au moins)."><input value={titre} onChange={(e) => setTitre(e.target.value.slice(0, 120))} className={classeChamp} aria-label="Titre d'origine de l'équivalence" /></Champ>
          <Champ label="Établissement d'origine"><input value={etablissement} onChange={(e) => setEtablissement(e.target.value.slice(0, 120))} className={classeChamp} aria-label="Établissement d'origine" /></Champ>
          <Champ label="Année d'origine" aide="Format 2024-2025."><input value={annee} onChange={(e) => setAnnee(e.target.value.slice(0, 9))} placeholder="2024-2025" className={classeChamp} aria-label="Année d'origine" /></Champ>
        </div>
        <Champ label="Motif" obligatoire aide="5 caractères au moins : c'est la trace lisible de la demande."><textarea value={motif} onChange={(e) => setMotif(e.target.value.slice(0, 200))} rows={2} className={classeChamp} aria-label="Motif de la demande d'équivalence" /></Champ>
        <ErreurEnvoi erreur={mut.error} />
      </div>
    </Dialogue>
  );
}

function DialogueDecision({ id, equivalence, nomme, onFermer }: { id: string; equivalence: Equivalence | null; nomme: string; onFermer: () => void }) {
  const mut = useDecisionEquivalenceMutation(id);
  const [statut, setStatut] = useState<"accordee" | "refusee" | "retiree">("accordee");
  const [autorite, setAutorite] = useState<"etablissement" | "nationale">("etablissement");
  const [credits, setCredits] = useState("6");
  const [motif, setMotif] = useState("");
  const fermer = () => { if (!mut.isPending) onFermer(); };

  return (
    <Dialogue ouvert={!!equivalence} onFermer={fermer} icone={Gavel} titre="Statuer sur une équivalence"
      description="Une décision d'autorité nationale exige l'habilitation centrale au niveau national ; sinon le serveur refuse et journalise le refus."
      pied={<><Button variante="secondaire" onClick={fermer} disabled={mut.isPending}>Annuler</Button>
        <Button disabled={motif.trim().length < 5} chargement={mut.isPending} onClick={() => equivalence && mut.mutate({
          equivalenceId: equivalence.id, statut, autorite, motif: motif.trim(),
          creditsReconnus: statut === "accordee" ? Math.max(0, Math.min(30, Number(credits) || 0)) : null,
        }, { onSuccess: (e) => { notifier({ ton: "succes", titre: "Équivalence statuée", texte: `${LIBELLE_AUTORITE_EQUIVALENCE[e.autorite]} · ${entier(e.creditsReconnus)} crédit(s) reconnu(s). La reconnaissance ne valide pas l'UE : l'établissement d'accueil l'instruit ensuite par une acquisition.` }); setMotif(""); fermer(); } })}>Statuer</Button></>}>
      <div className="space-y-4">
        {equivalence && <p className="text-[13px] text-ink-2">{nomme} · {equivalence.titreOrigine} · UE <span className="font-mono text-xs">{equivalence.ueId}</span></p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Décision" obligatoire><SelectVocabulaire vocabulaire={{ accordee: "Accordée", refusee: "Refusée", retiree: "Retirée" }} valeur={statut} onChange={(v) => v && setStatut(v)} label="Décision sur l'équivalence" /></Champ>
          <Champ label="Autorité qui statue" aide="« MESRS (DCE) » = une direction du ministère ; la porte n'est plus celle de l'établissement."><SelectVocabulaire vocabulaire={{ etablissement: LIBELLE_AUTORITE_EQUIVALENCE.etablissement, nationale: LIBELLE_AUTORITE_EQUIVALENCE.nationale }} valeur={autorite} onChange={(v) => v && setAutorite(v)} label="Autorité de la décision" /></Champ>
          {statut === "accordee" && <Champ label="Crédits reconnus" aide="0 à 30. Une reconnaissance ne capitalise rien sans acquisition enregistrée."><input type="number" min={0} max={30} value={credits} onChange={(e) => setCredits(e.target.value)} className={classeChamp} aria-label="Crédits reconnus par l'équivalence" /></Champ>}
        </div>
        <Champ label="Motif de la décision" obligatoire aide="5 caractères au moins ; il voyagera sur la ligne." ><textarea value={motif} onChange={(e) => setMotif(e.target.value.slice(0, 200))} rows={2} className={classeChamp} aria-label="Motif de la décision d'équivalence" /></Champ>
        <ErreurEnvoi erreur={mut.error} />
      </div>
    </Dialogue>
  );
}
