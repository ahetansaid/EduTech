"use client";

import type { Composante, ContratPedagogique, RegimePedagogique, UniteEnseignement, VoieAcquisition } from "@beile/contracts";
import { LIBELLE_STATUT_COMPTE, StatutCompte, VOIES_SANS_NOTE } from "@beile/contracts";
import { ArrowLeftRight, ClipboardList, Download, GraduationCap, Library, ListChecks, Plus, Scale, UserPlus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { TableauDonnees } from "@/components/charts/Graphiques";
import { Cascade, Element, EntreePage } from "@/components/motion";
import { notifier } from "@/components/ui/Notifications";
import { Badge, Button, Card, CardHeader, PageHeader, Squelette } from "@/components/ui/primitives";
import { TuileIndicateur } from "@/components/ui/donnees";
import {
  LIBELLE_COMPENSATION, LIBELLE_PONDERATION, LIBELLE_REGIME, LIBELLE_SESSION, LIBELLE_SESSION_RETENUE,
  LIBELLE_STATUT_CONTRAT, LIBELLE_STATUT_INSCRIPTION, LIBELLE_VOIE_ACQUISITION,
  TON_STATUT_CONTRAT, TON_STATUT_INSCRIPTION, TON_VOIE_ACQUISITION,
  useAbandonMutation, useAcquisitionHorsNoteMutation, useCatalogueUe, useContratEtab, useCreditsEtsEtab,
  useDeciderContratMutation, useFeuilleValidation, useFilieresEtab, useInscrireMutation, useInscriptions,
  usePeriodes, useTransfertCreditsMutation, useValiderPeriodeMutation,
  type FiliereEtab, type InscriptionEtab, type LigneCatalogueUe, type RenduValidation,
} from "@/lib/api/scolarite-superieure";
import { useEleves } from "@/lib/api/etablissement";
import { LIBELLE_DIPLOME } from "@/lib/enseignement-superieur";
import { exporterCsv, type Colonne } from "@/lib/export";
import { date, entier, note } from "@/lib/format";
import { ErreurApi } from "@/lib/http";
import { useEtablissementCourant } from "@/lib/session";
import { classeChamp, classeSelect, Dialogue, EtatErreur, HorsPerimetre } from "../../../etablissement/_composants";
import { Bandeau, Champ, ErreurEnvoi, PucePortee, Rien, SelectAnnee, SelectVocabulaire, anneesDe } from "../_commun";
import { OngletsScolarite } from "../_OngletsScolarite";
import { OngletsESup } from "../../_Onglets";

/** Libellé d'une composante LMD ; une filière EFTP hors LMD (CAP, BT, BTS, CQP) n'en porte pas. */
const LIBELLE_COMPOSANTE: Record<Composante, string> = { L1: "L1", L2: "L2", L3: "L3", M1: "M1", M2: "M2", Dr: "Doctorat" };

/** Les voies qui n'attendent aucune note de session : ce que l'étudiant a déjà fait ailleurs. */
const VOCABULAIRE_VOIE: Record<string, string> = Object.fromEntries(VOIES_SANS_NOTE.map((v) => [v, LIBELLE_VOIE_ACQUISITION[v]]));

/**
 * Étudiants, contrats et validation des périodes — l'écran de la direction d'un établissement du
 * supérieur. Les portes restent celles de `accesEtablissement` (chef : écrire ; inspecteur de la
 * circonscription : lire) et toute écriture nominative passe par le registre.
 */
export default function Page() {
  const id = useEtablissementCourant();
  return <EntreePage>{id ? <Etudiants id={id} /> : <HorsPerimetre />}</EntreePage>;
}

function Etudiants({ id }: { id: string }) {
  const [annee, setAnnee] = useState("");
  const [filiere, setFiliere] = useState("");
  const [apprenantCourant, setApprenantCourant] = useState("");

  const filieres = useFilieresEtab(id);
  const inscriptions = useInscriptions(id, { annee: annee || null, filiereId: filiere || null });
  const periodes = usePeriodes(id);
  const catalogue = useCatalogueUe(id, null);
  const credits = useCreditsEtsEtab(id, annee || null);

  if (filieres.isPending) return <div className="space-y-5"><Squelette className="h-16" /><Squelette className="h-64" /></div>;
  if (filieres.isError) return <Card><EtatErreur erreur={filieres.error} reessayer={() => filieres.refetch()} /></Card>;

  const lignes = inscriptions.data ?? [];
  const lignesFilieres = filieres.data ?? [];
  const actifs = lignes.filter((l) => l.inscription.statut === "inscrit").length;
  const sorties = lignes.filter((l) => l.inscription.statut === "abandon" || l.inscription.statut === "transfere_sorti").length;
  const creditsAcquis = credits.data?.total?.creditsAcquis ?? null;

  return (
    <div className="space-y-5">
      <PageHeader
        surtitre="Enseignement supérieur · Scolarité"
        titre="Étudiants, contrats & validation"
        sousTitre="La promotion de l'établissement : qui est inscrit, ce que signe son contrat pédagogique, et ce que la règle en vigueur rend comme acquis quand on valide une période."
      />
      <OngletsESup />
      <OngletsScolarite chef />
      <Bandeau>
        Écran <strong>nominatif</strong>, sous la porte d&apos;établissement : un chef voit sa promotion, un inspecteur de la circonscription la lit sans pouvoir l&apos;écrire.
        Trois choses ne se saisissent pas ici : une <strong>note</strong> — elle vient de l&apos;enseignant qui l&apos;a déposée —, une <strong>moyenne</strong> et une <strong>mention</strong>,
        que le serveur calcule sous la règle citée sur chaque acquis. La direction, elle, décide d&apos;un contrat, valide une période déjà notée et reconnaît un acquis jugé ailleurs.
      </Bandeau>

      <Cascade className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Element><TuileIndicateur libelle="Inscriptions (filtre)" icone={Users} accent="bleu" valeur={entier(lignes.length)} indice={annee || filiere ? "après filtre année / filière" : "toutes années, toutes filières"} /></Element>
        <Element><TuileIndicateur libelle="Étudiants en formation" icone={GraduationCap} accent="sarcelle" valeur={entier(actifs)} indice={`${entier(lignesFilieres.length)} filière(s) ouverte(s) par l'établissement`} /></Element>
        <Element><TuileIndicateur libelle="Sorties & transferts" icone={ArrowLeftRight} accent={sorties ? "ambre" : "neutre"} valeur={entier(sorties)} indice="un crédit acquis reste acquis après une sortie" /></Element>
        <Element><TuileIndicateur libelle="Crédits acquis" icone={ListChecks} accent="bleu" valeur={creditsAcquis === null ? "—" : entier(creditsAcquis)} indice="somme des acquis encore valides — jamais une moyenne saisie" /></Element>
      </Cascade>

      <InscriptionsCard
        id={id} filieres={lignesFilieres} lignes={lignes}
        annees={anneesDe(lignes.map((l) => l.inscription.anneeUniversitaire), (periodes.data ?? []).map((p) => p.anneeUniversitaire))}
        annee={annee} setAnnee={setAnnee} filiere={filiere} setFiliere={setFiliere}
        selectionne={apprenantCourant} setSelectionne={setApprenantCourant}
        erreur={inscriptions.isError ? inscriptions.error : null} reessayer={() => inscriptions.refetch()}
      />

      <ContratCard id={id} lignes={lignes} apprenantId={apprenantCourant} setApprenantId={setApprenantCourant} ueParId={new Map((catalogue.data ?? []).map((l) => [l.ue.id, l.ue]))} />

      <FeuilleValidationCard id={id} periodes={periodes.data ?? []} nomFiliere={new Map(lignesFilieres.map((f) => [f.id, f.nom]))} />

      <AcquisitionsCard id={id} lignes={lignes} periodes={periodes.data ?? []} filieres={lignesFilieres} catalogue={catalogue.data ?? []} />
    </div>
  );
}

/* ------------------------------------------------------------------ Inscriptions */

function InscriptionsCard({ id, filieres, lignes, annees, annee, setAnnee, filiere, setFiliere, selectionne, setSelectionne, erreur, reessayer }: {
  id: string; filieres: FiliereEtab[]; lignes: InscriptionEtab[]; annees: string[];
  annee: string; setAnnee: (v: string) => void; filiere: string; setFiliere: (v: string) => void;
  selectionne: string; setSelectionne: (v: string) => void; erreur: unknown; reessayer: () => void;
}) {
  const [ouvrir, setOuvrir] = useState(false);
  const [sortie, setSortie] = useState<InscriptionEtab | null>(null);

  const COLONNES: Colonne<InscriptionEtab>[] = [
    { entete: "Nom", valeur: (l) => l.apprenant.nom },
    { entete: "Prénoms", valeur: (l) => l.apprenant.prenoms },
    { entete: "Numéro étudiant", valeur: (l) => l.inscription.numeroEtudiant ?? "" },
    { entete: "Filière", valeur: (l) => l.filiere.nom },
    { entete: "Diplôme visé", valeur: (l) => LIBELLE_DIPLOME[l.filiere.diplomeVise] },
    { entete: "Composante", valeur: (l) => l.inscription.composante ?? "" },
    { entete: "Année universitaire", valeur: (l) => l.inscription.anneeUniversitaire },
    { entete: "Régime", valeur: (l) => LIBELLE_REGIME[l.inscription.regimePedagogique] },
    { entete: "Statut", valeur: (l) => LIBELLE_STATUT_INSCRIPTION[l.inscription.statut] },
    { entete: "Statut de compte", valeur: (l) => LIBELLE_STATUT_COMPTE[l.inscription.statutCompte] },
    { entete: "Crédits acquis", valeur: (l) => l.inscription.creditsAcquisCumules },
    { entete: "Inscrite le", valeur: (l) => date(l.inscription.inscriteLe) },
  ];

  return (
    <Card data-guide="scolarite-inscriptions" className="min-w-0 overflow-hidden p-0">
      <CardHeader
        icon={Users}
        title="Inscriptions de l'établissement"
        subtitle="Une inscription porte l'année, la filière, le régime et le statut de compte — jamais un montant, ni une pièce d'identité."
        action={<Button variante="secondaire" taille="sm" icone={Plus} disabled={!filieres.length} onClick={() => setOuvrir(true)}>Inscrire un étudiant</Button>}
      />
      <div className="flex flex-wrap items-end gap-3 border-y border-line/60 bg-surface-2/40 px-5 py-3">
        <SelectAnnee annees={annees} valeur={annee} onChange={setAnnee} label="Filtrer les inscriptions par année universitaire" />
        <label className="flex items-center gap-2 text-[13px] text-ink-2"><span className="text-ink-muted">Filière</span>
          <select value={filiere} onChange={(e) => setFiliere(e.target.value)} className={classeSelect} aria-label="Filtrer les inscriptions par filière">
            <option value="">Toutes les filières</option>
            {filieres.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
          </select>
        </label>
        <span className="ml-auto flex items-center gap-3 text-xs text-ink-muted">{entier(lignes.length)}/{entier(filieres.length)} filière(s)
          <Button variante="fantome" taille="sm" icone={Download} disabled={!lignes.length} onClick={() => exporterCsv("inscriptions_superieures", lignes, COLONNES, `BEILE — inscriptions du supérieur de cet établissement. Filtre année « ${annee || "toutes"} », filière « ${filieres.find((f) => f.id === filiere)?.nom ?? "toutes"} ». ${lignes.length} ligne(s), export du ${date(new Date().toISOString())}.`)}>Exporter (CSV)</Button>
        </span>
      </div>
      {erreur ? (
        <div className="px-5 pb-5"><EtatErreur erreur={erreur} reessayer={reessayer} /></div>
      ) : !lignes.length ? (
        <div className="px-5 pb-5"><Rien icone={Users} titre="Aucune inscription pour ce filtre" texte="Une inscription nomme une personne déjà connue de l'établissement, une filière déclarée et une année universitaire." /></div>
      ) : (
        <TableauDonnees
          colonnes={["Étudiant·e", "Filière · diplôme", "Année · régime", "Composante", "Statut", "Compte", "Crédits", "Actions"]}
          lignes={lignes.map((l) => [
            <span key={l.inscription.id} className="flex flex-col"><span className="text-ink">{l.apprenant.nom} {l.apprenant.prenoms}</span><span className="font-mono text-xs text-ink-muted">{l.inscription.numeroEtudiant ?? "numéro non attribué"}</span></span>,
            <span key={`${l.inscription.id}-f`} className="flex flex-col"><span className="text-ink">{l.filiere.nom}</span><span className="text-xs text-ink-muted">{LIBELLE_DIPLOME[l.filiere.diplomeVise]}</span></span>,
            <span key={`${l.inscription.id}-a`} className="flex flex-col"><span className="text-ink-2">{l.inscription.anneeUniversitaire}</span><span className="text-xs text-ink-muted">{LIBELLE_REGIME[l.inscription.regimePedagogique]}</span></span>,
            l.inscription.composante ? <Badge key={`${l.inscription.id}-c`} ton="marque">{LIBELLE_COMPOSANTE[l.inscription.composante]}</Badge> : <span key={`${l.inscription.id}-c`} className="text-xs text-ink-muted">hors LMD</span>,
            <Badge key={`${l.inscription.id}-s`} ton={TON_STATUT_INSCRIPTION[l.inscription.statut]}>{LIBELLE_STATUT_INSCRIPTION[l.inscription.statut]}</Badge>,
            <span key={`${l.inscription.id}-cp`} className="text-[13px] text-ink-2">{LIBELLE_STATUT_COMPTE[l.inscription.statutCompte]}</span>,
            entier(l.inscription.creditsAcquisCumules),
            <span key={`${l.inscription.id}-act`} className="flex justify-end gap-1">
              <Button variante="fantome" taille="sm" icone={ClipboardList} className={selectionne === l.apprenant.id ? "bg-surface-2" : undefined} onClick={() => setSelectionne(l.apprenant.id)}>Contrat</Button>
              {l.inscription.statut === "inscrit" && <Button variante="fantome" taille="sm" icone={ArrowLeftRight} onClick={() => setSortie(l)}>Sortie</Button>}
            </span>,
          ])}
        />
      )}
      <DialogueInscription id={id} filieres={filieres} ouvert={ouvrir} onFermer={() => setOuvrir(false)} />
      <DialogueSortie id={id} ligne={sortie} onFermer={() => setSortie(null)} />
    </Card>
  );
}

function DialogueInscription({ id, filieres, ouvert, onFermer }: { id: string; filieres: FiliereEtab[]; ouvert: boolean; onFermer: () => void }) {
  const mut = useInscrireMutation(id);
  const eleves = useEleves(ouvert ? id : null);
  const [apprenantId, setApprenantId] = useState("");
  const [filiereId, setFiliereId] = useState("");
  const [composante, setComposante] = useState<Composante | "">("");
  const [annee, setAnnee] = useState("");
  const [regime, setRegime] = useState<RegimePedagogique | "">("semestriel");
  const [numero, setNumero] = useState("");
  const [compte, setCompte] = useState<StatutCompte>("non_precise");

  const filiereChoisie = filieres.find((f) => f.id === filiereId) ?? null;
  const erreur = mut.error instanceof ErreurApi ? mut.error : null;
  const anneeValide = /^\d{4}-\d{4}$/.test(annee);
  const pret = !!apprenantId && !!filiereId && anneeValide && regime !== "";
  const fermer = () => { if (!mut.isPending) onFermer(); };

  const envoyer = () => {
    mut.mutate({
      apprenantId, filiereId, composante: composante === "" ? null : composante, anneeUniversitaire: annee,
      regimePedagogique: regime as RegimePedagogique, numeroEtudiant: numero.trim() || null, statutCompte: compte,
    }, {
      onSuccess: () => { notifier({ ton: "succes", titre: "Inscription enregistrée", texte: "Fait du registre : la projection de scolarité s'est construite dans la même transaction." }); fermer(); },
    });
  };

  return (
    <Dialogue ouvert={ouvert} onFermer={fermer} icone={UserPlus} titre="Inscrire un étudiant dans une filière"
      description="Le droit d'inscrire (cycle EPES) et le plafond de places sont jugés par le serveur, pas par ce formulaire."
      pied={<><Button variante="secondaire" onClick={fermer} disabled={mut.isPending}>Annuler</Button><Button disabled={!pret} chargement={mut.isPending} onClick={envoyer}>Inscrire</Button></>}>
      <div className="space-y-4">
        <Champ label="Étudiant·e" obligatoire aide="La liste est celle des personnes déjà connues de votre établissement : une inscription du supérieur ne crée pas une identité.">
          <select value={apprenantId} onChange={(e) => setApprenantId(e.target.value)} className={classeChamp} aria-label="Choisir l'étudiant à inscrire">
            <option value="">{eleves.isPending ? "Chargement de la liste…" : eleves.isError ? "Liste des personnes indisponible" : "Choisir une personne…"}</option>
            {(eleves.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.nom} {x.prenoms}</option>)}
          </select>
        </Champ>
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Filière" obligatoire>
            <select value={filiereId} onChange={(e) => { setFiliereId(e.target.value); setComposante(""); }} className={classeChamp} aria-label="Choisir la filière d'inscription">
              <option value="">Choisir une filière…</option>
              {filieres.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
            </select>
          </Champ>
          <Champ label="Composante" aide={filiereChoisie && !filiereChoisie.composantes.length ? "Cette filière n'ouvre aucune composante (filière EFTP hors LMD)." : "Limitée aux composantes ouvertes par la filière."}>
            <select value={composante} onChange={(e) => setComposante(e.target.value as Composante | "")} className={classeChamp} disabled={!filiereChoisie?.composantes.length} aria-label="Choisir la composante">
              <option value="">— aucune —</option>
              {(filiereChoisie?.composantes ?? []).map((x) => <option key={x} value={x}>{LIBELLE_COMPOSANTE[x]}</option>)}
            </select>
          </Champ>
          <Champ label="Année universitaire" aide="Format 2025-2026." obligatoire><input value={annee} onChange={(e) => setAnnee(e.target.value.slice(0, 9))} placeholder="2025-2026" className={classeChamp} aria-invalid={!anneeValide && !!annee} aria-label="Année universitaire de l'inscription" /></Champ>
          <Champ label="Régime pédagogique" aide="Le régime choisi décide quelle règle de validation jugera les acquis."><SelectVocabulaire vocabulaire={LIBELLE_REGIME} valeur={regime} onChange={setRegime} label="Régime pédagogique" /></Champ>
          <Champ label="Numéro étudiant" aide="Attribué par l'établissement ; vide = pas encore attribué."><input value={numero} onChange={(e) => setNumero(e.target.value.slice(0, 24))} className={classeChamp} aria-label="Numéro étudiant" /></Champ>
          <Champ label="Statut de compte" aide="Dimension de comptage national : aucune cotisation, aucun montant, aucun RIB en base.">
            <select value={compte} onChange={(e) => setCompte(e.target.value as StatutCompte)} className={classeChamp} aria-label="Statut de compte de l'inscription">
              {StatutCompte.options.map((s) => <option key={s} value={s}>{LIBELLE_STATUT_COMPTE[s]}</option>)}
            </select>
          </Champ>
        </div>
        <ErreurEnvoi erreur={erreur} />
      </div>
    </Dialogue>
  );
}

function DialogueSortie({ id, ligne, onFermer }: { id: string; ligne: InscriptionEtab | null; onFermer: () => void }) {
  const mut = useAbandonMutation(id);
  const [motif, setMotif] = useState("");
  const fermer = () => { if (!mut.isPending) onFermer(); };

  return (
    <Dialogue ouvert={!!ligne} onFermer={fermer} icone={ArrowLeftRight} ton="danger" titre="Déclarer une sortie de formation"
      description="La promotion ferme, les acquis restent : un crédit capitalisé ne s'efface pas, il se reporte."
      pied={<><Button variante="secondaire" onClick={fermer} disabled={mut.isPending}>Annuler</Button>
        <Button variante="danger" chargement={mut.isPending} disabled={!ligne} onClick={() => mut.mutate({ inscriptionId: ligne!.inscription.id, motif: motif.trim() || null }, {
          onSuccess: () => { notifier({ ton: "succes", titre: "Sortie enregistrée", texte: "Les acquis de l'étudiant restent capitalisables dans une autre filière ou un autre établissement." }); setMotif(""); fermer(); },
        })}>Enregistrer la sortie</Button></>}>
      <div className="space-y-4">
        {ligne && <p className="text-[13px] text-ink-2">{ligne.apprenant.nom} {ligne.apprenant.prenoms} · {ligne.filiere.nom} · {ligne.inscription.anneeUniversitaire}</p>}
        <Champ label="Motif" aide="140 caractères au plus, facultatif. C'est un fait d'état, pas une appréciation."><input value={motif} onChange={(e) => setMotif(e.target.value.slice(0, 140))} className={classeChamp} aria-label="Motif de la sortie" /></Champ>
        <ErreurEnvoi erreur={mut.error} />
      </div>
    </Dialogue>
  );
}

/* ------------------------------------------------------------------ Contrat pédagogique */

const COLONNES_CONTRAT: Colonne<ContratPedagogique["ueSignees"][number]>[] = [
  { entete: "Code UE", valeur: (l) => l.ue.code },
  { entete: "Intitulé", valeur: (l) => l.ue.intitule },
  { entete: "Crédits ECTS", valeur: (l) => l.ue.creditsEcts },
  { entete: "Session", valeur: (l) => LIBELLE_SESSION[l.offre.session] },
  { entete: "Statut du contrat", valeur: (l) => LIBELLE_STATUT_CONTRAT[l.inscriptionUe.statut] },
  { entete: "Signée le", valeur: (l) => (l.inscriptionUe.signeeLe ? date(l.inscriptionUe.signeeLe) : "") },
  { entete: "Motif de la décision", valeur: (l) => l.inscriptionUe.motifRefus ?? "" },
];

/** L'export porte le code de l'UE joint depuis le catalogue, pas l'identifiant opaque que porte la ligne. */
const colonnesAcquis = (ueParId: Map<string, UniteEnseignement>): Colonne<ContratPedagogique["validations"][number]>[] => [
  { entete: "UE", valeur: (v) => ueParId.get(v.ueId)?.code ?? v.ueId },
  { entete: "Intitulé", valeur: (v) => ueParId.get(v.ueId)?.intitule ?? "" },
  { entete: "Voie d'acquisition", valeur: (v) => LIBELLE_VOIE_ACQUISITION[v.voie] },
  { entete: "Crédits capitalisés", valeur: (v) => v.creditsAcquis },
  { entete: "Moyenne", valeur: (v) => (v.moyenne === null ? "" : v.moyenne) },
  { entete: "Session", valeur: (v) => LIBELLE_SESSION[v.session] },
  { entete: "Justification", valeur: (v) => v.justification },
  { entete: "Règle appliquée", valeur: (v) => v.regleValidationId },
  { entete: "Definitif", valeur: (v) => (v.definitive ? "oui" : "non") },
  { entete: "Acquis le", valeur: (v) => date(v.acquiseLe) },
];

/**
 * Le contrat d'UNE personne : la porte est nominative et le reste. Une liste de contrats exportable
 * n'est pas ce dont la direction a besoin pour décider — la feuille de validation, plus bas, rend le lot.
 */
function ContratCard({ id, lignes, apprenantId, setApprenantId, ueParId }: {
  id: string; lignes: InscriptionEtab[]; apprenantId: string; setApprenantId: (v: string) => void;
  ueParId: Map<string, UniteEnseignement>;
}) {
  const contrat = useContratEtab(id, apprenantId || null);
  const decider = useDeciderContratMutation(id);
  const [motifs, setMotifs] = useState<Record<string, string>>({});
  const ligne = lignes.find((l) => l.apprenant.id === apprenantId);
  const c = contrat.data;
  const regle = c?.regleAppliquee;

  const decider_ = (inscriptionUeId: string, statut: "signee" | "abandonnee" | "non_validee") => {
    decider.mutate({ inscriptionUeId, statut, motifRefus: (motifs[inscriptionUeId] ?? "").trim() || null }, {
      onSuccess: () => notifier({ ton: "succes", titre: "Décision de contrat enregistrée", texte: "Une décision de contrat ne valide aucun crédit : seul un acquis enregistré en capitalise." }),
    });
  };

  return (
    <Card data-guide="scolarite-contrat" className="min-w-0 overflow-hidden p-0">
      <CardHeader
        icon={ClipboardList}
        title="Contrat pédagogique"
        subtitle="Ce qui a été proposé, ce que la direction a signé, ce que la règle a rendu. La règle citée est celle qui a jugé — une moyenne saisie à la main serait une inflation libre du diplôme."
      />
      <div className="flex flex-wrap items-end gap-3 border-y border-line/60 bg-surface-2/40 px-5 py-3">
        <label className="flex items-center gap-2 text-[13px] text-ink-2"><span className="text-ink-muted">Étudiant·e</span>
          <select value={apprenantId} onChange={(e) => setApprenantId(e.target.value)} className={classeSelect} aria-label="Choisir l'étudiant dont on lit le contrat">
            <option value="">Choisir dans la promotion filtrée…</option>
            {lignes.map((l) => <option key={l.apprenant.id} value={l.apprenant.id}>{l.apprenant.nom} {l.apprenant.prenoms} · {l.filiere.nom}</option>)}
          </select>
        </label>
        {c && <span className="ml-auto text-xs text-ink-muted">{entier(c.ueSignees.length)} contrat(s) d&apos;UE · {entier(c.validations.length)} acquis</span>}
      </div>

      {!apprenantId ? (
        <div className="px-5 pb-5"><Rien icone={ClipboardList} titre="Aucun étudiant sélectionné" texte="Le contrat se lit personne par personne : c'est la porte nominative de l'établissement, pas une liste exportable." /></div>
      ) : contrat.isPending ? (
        <div className="grid gap-3 px-5 py-5 sm:grid-cols-3">{[0, 1, 2].map((i) => <Squelette key={i} className="h-[92px] rounded-lg" />)}</div>
      ) : contrat.isError ? (
        <div className="px-5 pb-5"><EtatErreur erreur={contrat.error} reessayer={() => contrat.refetch()} /></div>
      ) : !c ? (
        <div className="px-5 pb-5"><Rien icone={ClipboardList} titre="Contrat indisponible" texte="Aucune inscription de cette personne dans cet établissement : le contrat ne se lit que sous la porte nominative." /></div>
      ) : (
        <div className="space-y-5 px-5 pb-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <TuileIndicateur libelle="Crédits acquis" icone={ListChecks} accent="bleu" valeur={entier(c.creditsAcquis)} indice={ligne ? ligne.filiere.nom : ""} />
            <TuileIndicateur libelle="Crédits restants" icone={Scale} accent={c.creditsRestants > 0 ? "ambre" : "sarcelle"} valeur={entier(c.creditsRestants)} indice="le seuil du diplôme est le volume de la filière" />
            <TuileIndicateur libelle="UE sans évaluation" icone={ArrowLeftRight} accent={c.ueNonEvaluees.length ? "critique" : "neutre"} valeur={entier(c.ueNonEvaluees.length)} indice="aucune note déposée : rien à valider" />
          </div>

          {regle && (
            <div className="rounded-lg border border-line/70 bg-surface-2/40 px-4 py-3 text-[13px]">
              <p className="mb-2 flex flex-wrap items-center gap-2 text-ink"><PucePortee portee={regle.portee} /><span className="font-mono text-xs text-ink-muted">{regle.id}</span>{regle.regime && <Badge ton="neutre">{LIBELLE_REGIME[regle.regime]}</Badge>}</p>
              <ul className="grid gap-1 text-ink-2 sm:grid-cols-2">
                <li>Seuil d&apos;acquisition d&apos;une UE : <strong>{note(regle.seuilAcquisition)}</strong></li>
                <li>Note éliminatoire : <strong>{regle.noteEliminatoire === null ? "aucune" : note(regle.noteEliminatoire)}</strong></li>
                <li>Compensation : <strong>{LIBELLE_COMPENSATION[regle.compensation]}</strong>{regle.compensation === "par_bloc" && ` · ${entier(regle.blocs.length)} bloc(s)`}</li>
                <li>Pondération : <strong>{LIBELLE_PONDERATION[regle.ponderation]}</strong></li>
                <li>Session retenue : <strong>{LIBELLE_SESSION_RETENUE[regle.sessionRetenue]}</strong></li>
                <li>Moyenne minimale de période : <strong>{regle.seuilMoyennePeriode === null ? "non exigée" : note(regle.seuilMoyennePeriode)}</strong></li>
                <li>Validité d&apos;un acquis : <strong>{entier(regle.dureeValiditeAcquis)} an(s)</strong></li>
                <li>Report inter-établissements : <strong>{regle.reportCreditsInterEtab ? "autorisé" : "exclu"}</strong></li>
              </ul>
            </div>
          )}

          <div className="min-w-0 overflow-hidden rounded-lg border border-line/70">
            <p className="flex items-center justify-between gap-3 border-b border-line/60 bg-surface-2/60 px-4 py-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
              Contrats d&apos;UE
              <Button variante="fantome" taille="sm" icone={Download} disabled={!c.ueSignees.length} onClick={() => exporterCsv("contrat_ue", c.ueSignees, COLONNES_CONTRAT, `BEILE — contrats d'UE de l'étudiant sélectionné, règle appliquée ${c.regleAppliquee.id} (portée ${c.regleAppliquee.portee}). Export du ${date(new Date().toISOString())}.`)}>Exporter (CSV)</Button>
            </p>
            {!c.ueSignees.length ? (
              <p className="px-4 py-6 text-center text-[13px] text-ink-muted">Aucun contrat d&apos;UE : c&apos;est l&apos;étudiant qui propose ses UE, la direction qui décide. Aucun de ces deux gestes ne se saisit à sa place.</p>
            ) : (
              <TableauDonnees
                colonnes={["UE", "Crédits", "Session", "Statut", "Décision de la direction", "Signée · motif", "Groupe"]}
                lignes={c.ueSignees.map((l) => [
                  <span key={l.inscriptionUe.id} className="flex flex-col"><span className="font-mono text-[13px] text-ink">{l.ue.code}</span><span className="text-xs text-ink-muted">{l.ue.intitule}</span></span>,
                  entier(l.ue.creditsEcts),
                  LIBELLE_SESSION[l.offre.session],
                  <Badge key={`${l.inscriptionUe.id}-s`} ton={TON_STATUT_CONTRAT[l.inscriptionUe.statut]}>{LIBELLE_STATUT_CONTRAT[l.inscriptionUe.statut]}</Badge>,
                  l.inscriptionUe.statut === "proposee" ? (
                    <span key={`${l.inscriptionUe.id}-d`} className="flex flex-col gap-1.5">
                      <input value={motifs[l.inscriptionUe.id] ?? ""} onChange={(e) => setMotifs((m) => ({ ...m, [l.inscriptionUe.id]: e.target.value.slice(0, 200) }))} placeholder="motif de la décision (facultatif)" className="h-8 w-56 rounded-md border border-line bg-surface px-2 text-xs text-ink focus:border-blue focus:outline-none" aria-label={`Motif de la décision sur l'UE ${l.ue.code}`} />
                      <span className="flex flex-wrap gap-1">
                        <Button variante="secondaire" taille="sm" icone={Plus} chargement={decider.isPending} onClick={() => decider_(l.inscriptionUe.id, "signee")}>Signer</Button>
                        <Button variante="fantome" taille="sm" icone={ArrowLeftRight} disabled={decider.isPending} onClick={() => decider_(l.inscriptionUe.id, "abandonnee")}>Abandon</Button>
                        <Button variante="fantome" taille="sm" icone={Scale} disabled={decider.isPending} onClick={() => decider_(l.inscriptionUe.id, "non_validee")}>Non validé</Button>
                      </span>
                    </span>
                  ) : <span key={`${l.inscriptionUe.id}-d`} className="text-xs text-ink-muted">décision déjà prise</span>,
                  <span key={`${l.inscriptionUe.id}-g`} className="text-[13px] text-ink-2">{l.inscriptionUe.signeeLe ? date(l.inscriptionUe.signeeLe) : "—"}{l.inscriptionUe.motifRefus ? ` · ${l.inscriptionUe.motifRefus}` : ""}</span>,
                  <span key={`${l.inscriptionUe.id}-g2`} className="text-xs text-ink-muted">{l.groupe ? `${l.groupe.intitule}` : "sans groupe"}</span>,
                ])}
              />
            )}
          </div>

          <div className="min-w-0 overflow-hidden rounded-lg border border-line/70">
            <p className="flex items-center justify-between gap-3 border-b border-line/60 bg-surface-2/60 px-4 py-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
              Acquis enregistrés au registre
              <Button variante="fantome" taille="sm" icone={Download} disabled={!c.validations.length} onClick={() => exporterCsv("acquis_contrat", c.validations, colonnesAcquis(ueParId), `BEILE — acquis du contrat, chacun citant la règle qui l'a jugé. Règle appliquée au contrat : ${c.regleAppliquee.id}. ${entier(c.validations.length)} ligne(s), export du ${date(new Date().toISOString())}.`)}>Exporter (CSV)</Button>
            </p>
            {!c.validations.length ? (
              <p className="px-4 py-6 text-center text-[13px] text-ink-muted">Aucun acquis : cette personne n&apos;a encore capitalisé aucune UE dans cet établissement. Un crédit ne se déclare pas, il se juge.</p>
            ) : (
              <TableauDonnees
                colonnes={["UE", "Voie", "Crédits", "Moyenne", "Session", "Justification", "Règle appliquée", "Acquis le"]}
                lignes={c.validations.map((v) => [
                  <span key={v.id} className="flex flex-col"><span className="font-mono text-[13px] text-ink">{ueParId.get(v.ueId)?.code ?? "UE hors catalogue"}</span><span className="text-xs text-ink-muted">{ueParId.get(v.ueId)?.intitule ?? v.ueId}</span></span>,
                  <Badge key={`${v.id}-v`} ton={TON_VOIE_ACQUISITION[v.voie]}>{LIBELLE_VOIE_ACQUISITION[v.voie]}</Badge>,
                  entier(v.creditsAcquis),
                  note(v.moyenne),
                  LIBELLE_SESSION[v.session],
                  <span key={`${v.id}-j`} className="max-w-[280px] text-[13px] text-ink-2">{v.justification}</span>,
                  <span key={`${v.id}-r`} className="font-mono text-xs text-ink-muted">{v.regleValidationId}</span>,
                  <span key={`${v.id}-a`} className="text-[13px] text-ink-2">{date(v.acquiseLe)}{v.definitive ? "" : " · non définitif"}</span>,
                ])}
              />
            )}
          </div>

          {c.ueNonEvaluees.length > 0 && (
            <p className="rounded-md bg-warning-bg px-3 py-2 text-[13px] text-warning">
              {entier(c.ueNonEvaluees.length)} UE du contrat n&apos;ont reçu aucune note : {c.ueNonEvaluees.join(", ")}. Elles ne peuvent être ni validées ni compensées — la période restera incomplète tant que l&apos;enseignant n&apos;aura pas déposé ses notes.
            </p>
          )}
          <ErreurEnvoi erreur={decider.error} />
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ Feuille de validation */

const nomLigne = (l: { apprenantId: string; offreUeId: string }) => `${l.apprenantId}|${l.offreUeId}`;

/**
 * La feuille de validation : ce que la période permet de juger AUJOURD&apos;HUI. Le client ne nomme que des
 * couples (étudiant, offre) ; les crédits, la moyenne et la voie d&apos;acquisition sortent du serveur sous la
 * règle en vigueur.
 */
function FeuilleValidationCard({ id, periodes, nomFiliere }: { id: string; periodes: { id: string; intitule: string; anneeUniversitaire: string; filiereId: string; creditsAttendus: number }[]; nomFiliere: Map<string, string> }) {
  const [periodeId, setPeriodeId] = useState("");
  const [choix, setChoix] = useState<Record<string, boolean> | null>(null);
  const [rendu, setRendu] = useState<RenduValidation | null>(null);
  const feuille = useFeuilleValidation(id, periodeId || null);
  const mut = useValiderPeriodeMutation(id);
  const lignes = useMemo(() => feuille.data?.lignes ?? [], [feuille.data?.lignes]);

  const parDefaut = useMemo(() => {
    const o: Record<string, boolean> = {};
    for (const l of lignes) o[nomLigne(l)] = l.contratStatut === "signee" && !l.dejaAcquise && l.notes > 0;
    return o;
  }, [lignes]);
  const etat = choix ?? parDefaut;
  const selectionnees = lignes.filter((l) => etat[nomLigne(l)]);
  const periode = periodes.find((p) => p.id === periodeId);

  const envoyer = () => {
    setRendu(null);
    mut.mutate({ periodeId, lignes: selectionnees.map((l) => ({ apprenantId: l.apprenantId, offreUeId: l.offreUeId })) }, {
      onSuccess: (r) => { setRendu(r); notifier({ ton: r.enregistres.length ? "succes" : "avertissement", titre: r.enregistres.length ? `${entier(r.enregistres.length)} acquis enregistré(s)` : "Aucun crédit enregistré", texte: r.deja ? "Cette saisie était déjà au registre : rien n'a été doublonné." : `Règle(s) appliquée(s) : ${r.reglesAppliquees.join(", ") || "aucune"}. Le motif de chaque décision est rendu ligne par ligne.` }); },
    });
  };

  return (
    <Card data-guide="scolarite-validation" className="min-w-0 overflow-hidden p-0">
      <CardHeader
        icon={ListChecks}
        title="Valider une période"
        subtitle="La période se juge en lot, sous la règle de portée la plus précise. Une ligne non acquise n'est pas une erreur : c'est une décision rendue avec son motif."
        action={<Button disabled={!selectionnees.length} chargement={mut.isPending} icone={ListChecks} onClick={envoyer}>Valider {entier(selectionnees.length)} ligne(s)</Button>}
      />
      <div className="flex flex-wrap items-end gap-3 border-y border-line/60 bg-surface-2/40 px-5 py-3">
        <label className="flex items-center gap-2 text-[13px] text-ink-2"><span className="text-ink-muted">Période</span>
          <select value={periodeId} onChange={(e) => { setPeriodeId(e.target.value); setChoix(null); setRendu(null); }} className={classeSelect} aria-label="Choisir la période à valider">
            <option value="">Choisir une période déclarée…</option>
            {periodes.map((p) => <option key={p.id} value={p.id}>{p.anneeUniversitaire} · {p.intitule}</option>)}
          </select>
        </label>
        {periode && <span className="text-xs text-ink-muted">{nomFiliere.get(periode.filiereId) ?? "filière hors de votre référentiel"} · {entier(periode.creditsAttendus)} crédits attendus</span>}
        {!!lignes.length && (
          <span className="ml-auto flex items-center gap-2 text-xs text-ink-muted">
            {entier(selectionnees.length)}/{entier(lignes.length)} retenu(s)
            <Button variante="fantome" taille="sm" onClick={() => setChoix(Object.fromEntries(lignes.map((l) => [nomLigne(l), true])))}>Tout</Button>
            <Button variante="fantome" taille="sm" onClick={() => setChoix(Object.fromEntries(lignes.map((l) => [nomLigne(l), false])))}>Rien</Button>
            <Button variante="fantome" taille="sm" onClick={() => setChoix(null)}>Contrats signés notés</Button>
          </span>
        )}
      </div>

      {!periodeId ? (
        <div className="px-5 pb-5"><Rien icone={ListChecks} titre="Aucune période choisie" texte="Une période ne se valide que si ses offres sont ouvertes, les contrats signés et les notes déposées par les enseignants." /></div>
      ) : feuille.isPending ? (
        <div className="px-5 py-5"><Squelette className="h-40 rounded-lg" /></div>
      ) : feuille.isError ? (
        <div className="px-5 pb-5"><EtatErreur erreur={feuille.error} reessayer={() => feuille.refetch()} /></div>
      ) : !lignes.length ? (
        <div className="px-5 pb-5"><Rien icone={ListChecks} titre="Personne à juger sur cette période" texte="La feuille ne liste que les étudiants d'une inscription de cette filière et de cette année, sous contrat avec une offre de la période." /></div>
      ) : (
        <div className="min-w-0 overflow-x-auto px-5 pb-2">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line/70 text-left text-[11.5px] uppercase tracking-wide text-ink-muted">
              <th className="py-2 pr-3 font-medium">Retenue</th><th className="py-2 pr-3 font-medium">Étudiant·e</th><th className="py-2 pr-3 font-medium">UE</th>
              <th className="py-2 pr-3 font-medium">Crédits</th><th className="py-2 pr-3 font-medium">Notes</th><th className="py-2 pr-3 font-medium">Meilleure</th><th className="py-2 pr-3 font-medium">Contrat</th><th className="py-2 font-medium">Déjà acquise</th>
            </tr></thead>
            <tbody>
              {lignes.map((l) => {
                const cle = nomLigne(l);
                return (
                  <tr key={cle} className="border-b border-line/40 last:border-0">
                    <td className="py-2 pr-3"><input type="checkbox" checked={!!etat[cle]} disabled={l.dejaAcquise} onChange={(e) => setChoix({ ...parDefaut, ...etat, [cle]: e.target.checked })} aria-label={`Retenir ${l.nom} ${l.prenoms} pour ${l.ueCode}`} className="h-4 w-4 shrink-0 accent-[var(--blue)]" /></td>
                    <td className="py-2 pr-3 text-ink">{l.nom} {l.prenoms}</td>
                    <td className="py-2 pr-3"><span className="font-mono text-[13px] text-ink">{l.ueCode}</span> <span className="text-xs text-ink-muted">{l.ueIntitule}</span></td>
                    <td className="py-2 pr-3 tabular-nums text-ink-2">{entier(l.creditsEcts)}</td>
                    <td className="py-2 pr-3 tabular-nums text-ink-2">{entier(l.notes)}</td>
                    <td className="py-2 pr-3 tabular-nums text-ink-2">{note(l.noteMaximale)}</td>
                    <td className="py-2 pr-3"><Badge ton={TON_STATUT_CONTRAT[l.contratStatut]}>{LIBELLE_STATUT_CONTRAT[l.contratStatut]}</Badge></td>
                    <td className="py-2">{l.dejaAcquise ? <Badge ton="marque">oui</Badge> : <span className="text-xs text-ink-muted">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-3 px-5 pb-5">
        <ErreurEnvoi erreur={mut.error} />
        {rendu && (
          <div className="rounded-lg border border-line/70">
            <p className="border-b border-line/60 bg-surface-2/60 px-4 py-2 text-xs text-ink-2">{rendu.deja ? "Rejeu d'une saisie déjà enregistrée : " : `${entier(rendu.enregistres.length)} fait(s) au registre · `}règle(s) appliquée(s) <span className="font-mono">{rendu.reglesAppliquees.join(", ") || "aucune"}</span></p>
            <TableauDonnees
              colonnes={["Étudiant·e", "UE", "Acquise", "Voie", "Justification rendue par la règle"]}
              lignes={rendu.rendu.map((r, i) => [
                <span key={`r${i}`} className="text-[13px] text-ink-2">{r.apprenantId}</span>,
                <span key={`r${i}-u`} className="font-mono text-[13px] text-ink">{r.code}</span>,
                <Badge key={`r${i}-a`} ton={r.acquise ? "succes" : "critique"}>{r.acquise ? "oui" : "non"}</Badge>,
                <Badge key={`r${i}-v`} ton={TON_VOIE_ACQUISITION[r.voie as VoieAcquisition]}>{LIBELLE_VOIE_ACQUISITION[r.voie as VoieAcquisition]}</Badge>,
                <span key={`r${i}-j`} className="text-[13px] text-ink-2">{r.justification}</span>,
              ])}
            />
          </div>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ Acquis hors note & report de crédits */

/**
 * Deux écritures qui ne passent pas par une note : reconnaître un acquis jugé ailleurs, et reporter des
 * crédits d'une inscription antérieure. La seconde n'est pas vérifiée par BEILE — l'écran le dit.
 */
function AcquisitionsCard({ id, lignes, periodes, filieres, catalogue }: {
  id: string; lignes: InscriptionEtab[];
  periodes: { id: string; intitule: string; anneeUniversitaire: string; filiereId: string }[];
  filieres: FiliereEtab[]; catalogue: LigneCatalogueUe[];
}) {
  const horsNote = useAcquisitionHorsNoteMutation(id);
  const transfert = useTransfertCreditsMutation(id);

  const [apprenantId, setApprenantId] = useState("");
  const [ueId, setUeId] = useState("");
  const [periodeId, setPeriodeId] = useState("");
  const [voie, setVoie] = useState<VoieAcquisition | "">("acquis_anterieur");
  const [justification, setJustification] = useState("");

  const [versId, setVersId] = useState("");
  const [depuisId, setDepuisId] = useState("");
  const [uesReportees, setUesReportees] = useState<string[]>([]);

  const inscription = lignes.find((l) => l.apprenant.id === apprenantId);
  const uesDeLaFiliere = catalogue.filter((l) => !inscription || l.ue.filiereId === inscription.filiere.id);
  const erreurs = useMemo(() => {
    const e: string[] = [];
    if (justification.trim().length && justification.trim().length < 5) e.push("Une acquisition hors note se justifie en 5 caractères au moins.");
    return e;
  }, [justification]);

  const pretHorsNote = !!apprenantId && !!ueId && voie !== "" && justification.trim().length >= 5;

  return (
    <Card data-guide="scolarite-acquis" className="min-w-0 overflow-hidden p-0">
      <CardHeader icon={Library} title="Reconnaître un acquis, reporter des crédits" subtitle="Ce que l'étudiant a déjà validé ailleurs n'attend aucune note ici : les crédits viennent de l'UE, jamais de la demande." />

      <div className="grid gap-5 border-y border-line/60 bg-surface-2/40 px-5 py-4 lg:grid-cols-2">
        <div className="space-y-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Acquisition hors note de session</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Champ label="Étudiant·e" obligatoire aide="Le serveur exige une inscription dans CET établissement : on ne capitalise pas pour un inconnu.">
              <select value={apprenantId} onChange={(e) => { setApprenantId(e.target.value); setUeId(""); }} className={classeChamp} aria-label="Étudiant pour l'acquisition hors note">
                <option value="">Choisir dans la promotion…</option>
                {lignes.map((l) => <option key={l.apprenant.id} value={l.apprenant.id}>{l.apprenant.nom} {l.apprenant.prenoms} · {l.filiere.nom}</option>)}
              </select>
            </Champ>
            <Champ label="Unité d'enseignement" obligatoire aide={inscription ? `Catalogue de ${inscription.filiere.nom} — ${entier(uesDeLaFiliere.length)} UE.` : "Choisissez d'abord l'étudiant."}>
              <select value={ueId} onChange={(e) => setUeId(e.target.value)} className={classeChamp} disabled={!apprenantId} aria-label="Unité d'enseignement à reconnaître">
                <option value="">Choisir une UE…</option>
                {uesDeLaFiliere.map((l) => <option key={l.ue.id} value={l.ue.id}>{l.ue.code} — {l.ue.intitule} ({entier(l.ue.creditsEcts)} crédits)</option>)}
              </select>
            </Champ>
            <Champ label="Voie d'acquisition" obligatoire aide="Les six voies du vocabulaire fermé ; « note de session » ne se déclare pas ici."><SelectVocabulaire vocabulaire={VOCABULAIRE_VOIE} valeur={voie} onChange={setVoie} label="Voie d'acquisition hors note" /></Champ>
            <Champ label="Période rattachée" aide="Facultatif : rattacher la période place l'acquis dans son décompte de capitalisation.">
              <select value={periodeId} onChange={(e) => setPeriodeId(e.target.value)} className={classeChamp} aria-label="Période rattachée à l'acquisition">
                <option value="">— aucune —</option>
                {periodes.map((p) => <option key={p.id} value={p.id}>{p.anneeUniversitaire} · {p.intitule}</option>)}
              </select>
            </Champ>
          </div>
          <Champ label="Justification" obligatoire aide="Obligatoire : c'est la réponse à « pourquoi cette UE est-elle acquise ? », et elle voyagera sur l'acquis.">
            <textarea value={justification} onChange={(e) => setJustification(e.target.value.slice(0, 200))} rows={2} className={classeChamp} aria-label="Justification de l'acquisition hors note" />
          </Champ>
          {erreurs.map((e) => <p key={e} className="text-xs text-warning">{e}</p>)}
          <div className="flex items-center gap-3"><Button disabled={!pretHorsNote} chargement={horsNote.isPending} icone={Plus} onClick={() => horsNote.mutate({ apprenantId, ueId, periodeId: periodeId || null, voie: voie as VoieAcquisition, justification: justification.trim() }, {
            onSuccess: (r) => { notifier({ ton: "succes", titre: "Acquis enregistré", texte: `${entier(r.creditsAcquis)} crédits capitalisés — une UE s'acquiert en bloc, jamais au prorata.` }); setJustification(""); setUeId(""); },
          })}>Enregistrer l&apos;acquis</Button><ErreurEnvoi erreur={horsNote.error} /></div>
        </div>

        <div className="space-y-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Report de crédits entre inscriptions</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Champ label="Inscription d'accueil" obligatoire aide="L'inscription de cette personne dans CET établissement ; c'est la porte qui la choisit.">
              <select value={versId} onChange={(e) => { setVersId(e.target.value); setUesReportees([]); }} className={classeChamp} aria-label="Inscription d'accueil du report de crédits">
                <option value="">Choisir dans la promotion…</option>
                {lignes.map((l) => <option key={l.inscription.id} value={l.apprenant.id}>{l.apprenant.nom} {l.apprenant.prenoms} · {l.inscription.anneeUniversitaire}</option>)}
              </select>
            </Champ>
            <Champ label="Inscription d'origine" obligatoire aide="Identifiant d'inscription (INS-…) relevé sur le relevé d'inscriptions de l'étudiant. BEILE ne le découvre pas pour vous : un chef ne lit pas les inscriptions d'un autre établissement.">
              <input value={depuisId} onChange={(e) => setDepuisId(e.target.value.trim().slice(0, 60))} placeholder="INS-…" className={classeChamp} aria-label="Identifiant de l'inscription d'origine" />
            </Champ>
          </div>
          <Champ label="UE à reporter" aide={`Jusqu'à 60 UE, prises dans le catalogue de la filière d'accueil (${entier(filieres.length)} filière(s) déclarée(s)).`}>
            <select multiple value={uesReportees} onChange={(e) => setUesReportees(Array.from(e.target.selectedOptions, (o) => o.value).slice(0, 60))} className={`${classeChamp} h-32`} aria-label="Unités d'enseignement à reporter">
              {catalogue.slice(0, 300).map((l) => <option key={l.ue.id} value={l.ue.id}>{l.ue.code} — {l.filiereNom} ({entier(l.ue.creditsEcts)})</option>)}
            </select>
          </Champ>
          <p className="rounded-md bg-warning-bg px-3 py-2 text-[13px] text-warning">
            Le serveur vérifie la règle de report et l&apos;existence des UE, pas que l&apos;étudiant les a réellement acquises à l&apos;origine : ce report est une <strong>déclaration</strong> de l&apos;établissement d&apos;accueil.
            La voie auditable reste l&apos;<strong>équivalence</strong> déposée puis instruite, qui porte un titre d&apos;origine et une autorité.
          </p>
          <div className="flex items-center gap-3"><Button disabled={!versId || !/^INS-/.test(depuisId) || !uesReportees.length} chargement={transfert.isPending} icone={ArrowLeftRight} onClick={() => transfert.mutate({ apprenantId: versId, deInscriptionSuperieureId: depuisId, ueIds: uesReportees }, {
            onSuccess: (r) => { notifier({ ton: "succes", titre: "Report enregistré", texte: `${entier(r.ueIds.length)} UE reconnues sous la règle ${r.regleAppliquee}. La projection en équivalences évitera un double comptage national.` }); setUesReportees([]); setDepuisId(""); },
          })}>Reporter les crédits</Button><ErreurEnvoi erreur={transfert.error} /></div>
        </div>
      </div>
    </Card>
  );
}
