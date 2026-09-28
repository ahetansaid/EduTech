"use client";

import type {
  Composante, OffreUE, Periode, PorteeRegle, RegimePedagogique, RegleCompensation, ReglePonderation, RegleValidation,
  SessionEvaluation, TypeGroupe, TypePeriode, TypeUE, UniteEnseignement,
} from "@beile/contracts";
import { BookOpen, CalendarRange, Download, Layers, Library, Plus, Scale, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { TableauDonnees } from "@/components/charts/Graphiques";
import { Cascade, Element, EntreePage } from "@/components/motion";
import { notifier } from "@/components/ui/Notifications";
import { Badge, Button, Card, CardHeader, EtatVide, PageHeader, Squelette, type Ton } from "@/components/ui/primitives";
import { TuileIndicateur } from "@/components/ui/donnees";
import {
  LIBELLE_AVIS_CONSEIL, LIBELLE_COMPENSATION, LIBELLE_CONCLUSION_CONTROLE, LIBELLE_PHASE_EPES,
  LIBELLE_PONDERATION, LIBELLE_REGIME, LIBELLE_SESSION, LIBELLE_STATUT_ACCREDITATION, LIBELLE_STATUT_AGREMENT,
  LIBELLE_STATUT_ETABLISSEMENT, LIBELLE_TYPE_GROUPE, LIBELLE_TYPE_PERIODE, LIBELLE_TYPE_UE, TON_STATUT_ACCREDITATION,
  useCatalogueUe, useDeclarerGroupeMutation, useDeclarerOffreMutation, useDeclarerPeriodeMutation, useDeclarerRegleMutation,
  useDeclarerUeMutation, useFilieresEtab, useGroupes, useOffres, usePeriodes, useReglesValidation, useStatutAdministratif,
  type FiliereEtab, type LigneCatalogueUe,
} from "@/lib/api/scolarite-superieure";
import { LIBELLE_DIPLOME, LIBELLE_TUTELLE, LIBELLE_TYPE_PARCOURS } from "@/lib/enseignement-superieur";
import { exporterCsv, type Colonne } from "@/lib/export";
import { date, entier } from "@/lib/format";
import { ErreurApi } from "@/lib/http";
import { useEtablissementCourant } from "@/lib/session";
import { classeChamp, classeSelect, Dialogue, EtatErreur, HorsPerimetre } from "../../../etablissement/_composants";
import { cn } from "@/lib/cn";
import { Bandeau, Champ, ErreurEnvoi, PucePortee, SelectAnnee, SelectVocabulaire, anneesDe } from "../_commun";
import { OngletsScolarite } from "../_OngletsScolarite";
import { OngletsESup } from "../../_Onglets";

/** Libellé d'une composante LMD ; une filière EFTP hors LMD (CAP, BTS) n'en porte pas. */
const LIBELLE_COMPOSANTE: Record<Composante, string> = { L1: "L1", L2: "L2", L3: "L3", M1: "M1", M2: "M2", Dr: "Doctorat" };
const TON_CONCLUSION: Record<string, Ton> = { conforme: "succes", reserve: "avertissement", non_conforme: "critique", non_controle: "neutre" };
const TON_STATUT_ETAB: Record<string, Ton> = { public: "info", prive: "neutre", confessionnel: "neutre", communautaire: "neutre" };
/** Les portées qu'un établissement peut porter lui-même ; `nationale` est une écriture du ministère. */
type PorteeLocale = Exclude<PorteeRegle, "nationale">;

/**
 * Référentiel de scolarité d'un établissement : ce qu'il ouvre (périodes, UE, offres, groupes) et la
 * règle sous laquelle il juge. Tout se lit et s'écrit par la porte d'établissement — un chef déclare
 * SON organisation, jamais celle d'un voisin, et la règle nationale reste du ressort du ministère.
 */
export default function Page() {
  const id = useEtablissementCourant();
  return <EntreePage>{id ? <Referentiel id={id} /> : <HorsPerimetre />}</EntreePage>;
}

function Referentiel({ id }: { id: string }) {
  const filieres = useFilieresEtab(id);
  const periodes = usePeriodes(id);
  const catalogue = useCatalogueUe(id, null);
  const regles = useReglesValidation(id);
  const [annee, setAnnee] = useState("");
  const [filiereCourante, setFiliereCourante] = useState("");

  if (filieres.isPending) return <div className="space-y-5"><Squelette className="h-16" /><Squelette className="h-64" /></div>;
  if (filieres.isError) return <Card><EtatErreur erreur={filieres.error} reessayer={() => filieres.refetch()} /></Card>;

  const lignesFilieres = filieres.data ?? [];
  const selectives = lignesFilieres.filter((f) => f.accesConcours).length;
  const creditsFilieres = lignesFilieres.reduce((s, f) => s + f.creditsEcts, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        surtitre="Enseignement supérieur · Scolarité"
        titre="Référentiel de l'établissement"
        sousTitre="L'ossature de la scolarité : les filières que l'établissement ouvre, les périodes qu'il déclare, les UE et offres qu'il monte, et la règle de validation sous laquelle il jugera ses étudiants."
      />
      <OngletsESup />
      <OngletsScolarite chef />
      <Bandeau>
        Un établissement est libre d&apos;organiser sa scolarité : rythme, volumes, blocs de compensation. Cette liberté tient dans les huit
        paramètres de la règle, pas dans un champ libre — chaque acquis enregistré cite la règle qui l&apos;a jugé. Les écritures d&apos;État
        (règle nationale, cycle EPES, homologation, contrôle pédagogique) ne se font pas ici : elles sont au volet « Agrégats &amp; actes de l&apos;État ».
      </Bandeau>

      <Cascade className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Element><TuileIndicateur libelle="Filières ouvertes" icone={BookOpen} accent="bleu" valeur={entier(lignesFilieres.length)} indice={selectives ? `${selectives} sélective(s) par concours` : "aucune filière sélective"} /></Element>
        <Element><TuileIndicateur libelle="Périodes déclarées" icone={CalendarRange} accent="sarcelle" valeur={entier(periodes.data?.length ?? 0)} indice={`${entier(new Set((periodes.data ?? []).map((p) => p.anneeUniversitaire)).size)} année(s) universitaire(s) couverte(s)`} /></Element>
        <Element><TuileIndicateur libelle="UE au catalogue" icone={Library} accent="ambre" valeur={entier(catalogue.data?.length ?? 0)} indice={creditsFilieres ? `${entier(creditsFilieres)} crédits ECTS au total des filières` : "aucun volume de crédits déclaré"} /></Element>
        <Element><TuileIndicateur libelle="Règles applicables" icone={Scale} accent={regles.data?.some((r) => r.portee === "nationale") ? "neutre" : "critique"} valeur={entier(regles.data?.length ?? 0)} indice="la portée la plus précise couverte est celle qui juge" /></Element>
      </Cascade>

      <FiliairesCard filieres={lignesFilieres} />

      <PeriodesCard id={id} filieres={lignesFilieres} periodes={periodes.data ?? []} annees={anneesDe((periodes.data ?? []).map((p) => p.anneeUniversitaire))} annee={annee} setAnnee={setAnnee} />

      <CatalogueCard id={id} filieres={lignesFilieres} lignes={catalogue.data ?? []} filiereCourante={filiereCourante} setFiliereCourante={setFiliereCourante} />

      <OffresCard id={id} periodes={periodes.data ?? []} ues={(catalogue.data ?? []).map((l) => l.ue)} filieres={lignesFilieres} />

      <ReglesCard id={id} filieres={lignesFilieres} regles={regles.data ?? []} />

      <StatutCard id={id} nomFiliere={new Map(lignesFilieres.map((f) => [f.id, f.nom]))} />
    </div>
  );
}

/* ------------------------------------------------------------------ Filières */

function FiliairesCard({ filieres }: { filieres: FiliereEtab[] }) {
  const COLONNES: Colonne<FiliereEtab>[] = [
    { entete: "Filière", valeur: (f) => f.nom },
    { entete: "Domaine", valeur: (f) => f.domaine },
    { entete: "Voie", valeur: (f) => LIBELLE_TYPE_PARCOURS[f.voie] },
    { entete: "Cycle", valeur: (f) => f.cycle ?? "hors LMD" },
    { entete: "Diplôme visé", valeur: (f) => LIBELLE_DIPLOME[f.diplomeVise] },
    { entete: "Composantes", valeur: (f) => f.composantes.join(", ") },
    { entete: "Crédits ECTS", valeur: (f) => f.creditsEcts },
    { entete: "Capacité annuelle", valeur: (f) => f.capaciteAnnuelle },
    { entete: "Accès", valeur: (f) => (f.accesConcours ? "concours" : "accès classique") },
    { entete: "Stage obligatoire (mois)", valeur: (f) => f.stageObligatoireMois },
  ];
  return (
    <Card data-guide="scolarite-filieres" className="min-w-0 overflow-hidden p-0">
      <CardHeader
        icon={BookOpen}
        title="Filières déclarées par l'établissement"
        subtitle="Le volume de crédits de la filière est le seuil du diplôme : sans lui, une délibération ne peut dire ni « admis » ni « ajourné »."
        action={<Button variante="secondaire" taille="sm" icone={Download} disabled={!filieres.length} onClick={() => exporterCsv("filieres_etablissement", filieres, COLONNES, `BEILE — ${filieres.length} filière(s) déclarée(s) par l'établissement, export du ${date(new Date().toISOString())}.`)}>Exporter (CSV)</Button>}
      />
      {!filieres.length ? (
        <EtatVide icone={BookOpen} titre="Aucune filière déclarée" texte="Un chef d'établissement nomme ici les filières qu'il ouvre. Le catalogue national, lui, se lit au volet « Filières » de la console enseignement supérieur." />
      ) : (
        <TableauDonnees
          colonnes={["Filière", "Voie / cycle", "Diplôme", "Crédits", "Composantes", "Accès", "Capacité"]}
          lignes={filieres.map((f) => [
            <span key={f.id} className="flex flex-col"><span className="text-ink">{f.nom}</span><span className="text-xs text-ink-muted">{f.domaine}</span></span>,
            <span key={`${f.id}-v`} className="flex flex-wrap gap-1"><Badge ton="neutre">{LIBELLE_TYPE_PARCOURS[f.voie]}</Badge>{f.cycle && <Badge ton="info">{f.cycle}</Badge>}</span>,
            <span key={`${f.id}-d`} className="text-[13px] text-ink-2">{LIBELLE_DIPLOME[f.diplomeVise]}<span className="ml-2 font-mono text-xs text-ink-muted">{f.diplomeVise}</span></span>,
            f.creditsEcts ? entier(f.creditsEcts) : <Badge key={`${f.id}-c`} ton="avertissement">non déclaré</Badge>,
            <span key={`${f.id}-cp`} className="flex flex-wrap gap-1">{f.composantes.map((x) => <Badge key={x} ton="marque">{x}</Badge>)}{!f.composantes.length && <span className="text-xs text-ink-muted">—</span>}</span>,
            f.accesConcours ? <Badge key={`${f.id}-a`} ton="avertissement">concours</Badge> : <span key={`${f.id}-a`} className="text-xs text-ink-2">accès classique</span>,
            <span key={`${f.id}-ca`} className="text-[13px] text-ink-2">{f.capaciteAnnuelle === null ? "non déclarée" : `${entier(f.capaciteAnnuelle)} place(s)`}{f.stageObligatoireMois ? ` · stage ${f.stageObligatoireMois} mois` : ""}</span>,
          ])}
        />
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ Périodes */

function PeriodesCard({ id, filieres, periodes, annees, annee, setAnnee }: {
  id: string; filieres: FiliereEtab[]; periodes: Periode[]; annees: string[]; annee: string; setAnnee: (v: string) => void;
}) {
  const [filiere, setFiliere] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const nomParId = useMemo(() => new Map(filieres.map((f) => [f.id, f.nom])), [filieres]);
  const visibles = periodes.filter((p) => (!annee || p.anneeUniversitaire === annee) && (!filiere || p.filiereId === filiere));

  return (
    <Card data-guide="scolarite-periodes" className="min-w-0 overflow-hidden p-0">
      <CardHeader
        icon={CalendarRange}
        title="Périodes de formation"
        subtitle="Semestre, trimestre, année ou module : aucune période n'est privilégiée dans le modèle, un S1 est « semestre 1 »."
        action={<Button variante="secondaire" taille="sm" icone={Plus} onClick={() => setOuvert(true)} disabled={!filieres.length}>Déclarer une période</Button>}
      />
      <div className="flex flex-wrap items-end gap-3 border-y border-line/60 bg-surface-2/40 px-5 py-3">
        <label className="flex items-center gap-2 text-[13px] text-ink-2"><span className="text-ink-muted">Année</span><SelectAnnee annees={annees} valeur={annee} onChange={setAnnee} label="Filtrer les périodes par année universitaire" /></label>
        <label className="flex items-center gap-2 text-[13px] text-ink-2"><span className="text-ink-muted">Filière</span>
          <select value={filiere} onChange={(e) => setFiliere(e.target.value)} className={classeSelect} aria-label="Filtrer les périodes par filière">
            <option value="">Toutes les filières</option>
            {filieres.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
          </select>
        </label>
        <span className="ml-auto text-xs text-ink-muted">{entier(visibles.length)} période(s) affichée(s)</span>
      </div>
      {!visibles.length ? (
        <EtatVide icone={CalendarRange} titre="Aucune période pour ce filtre" texte="Une période se déclare par filière et par année universitaire : c'est elle qui porte les crédits attendus du semestre, donc le dénominateur de la capitalisation." />
      ) : (
        <TableauDonnees
          colonnes={["Période", "Filière", "Année", "Composante", "Crédits attendus", "Calendrier"]}
          lignes={visibles.map((p) => [
            <span key={p.id} className="text-ink">{p.intitule}<span className="ml-2 text-xs text-ink-muted">{LIBELLE_TYPE_PERIODE[p.type]} n°{p.numero}</span></span>,
            <span key={`${p.id}-f`} className="text-[13px] text-ink-2">{nomParId.get(p.filiereId) ?? p.filiereId}</span>,
            p.anneeUniversitaire,
            p.composante ?? "hors LMD",
            entier(p.creditsAttendus),
            p.debut && p.fin ? `${date(p.debut)} → ${date(p.fin)}` : <span key={`${p.id}-k`} className="text-xs text-ink-muted">dates non déclarées</span>,
          ])}
        />
      )}
      <DialoguePeriode id={id} filieres={filieres} ouvert={ouvert} onFermer={() => setOuvert(false)} />
    </Card>
  );
}

function DialoguePeriode({ id, filieres, ouvert, onFermer }: { id: string; filieres: FiliereEtab[]; ouvert: boolean; onFermer: () => void }) {
  const mut = useDeclarerPeriodeMutation(id);
  const [filiereId, setFiliereId] = useState("");
  const [composante, setComposante] = useState<Composante | "">("");
  const [type, setType] = useState<TypePeriode | "">("semestre");
  const [numero, setNumero] = useState("1");
  const [intitule, setIntitule] = useState("");
  const [annee, setAnnee] = useState("");
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  const [credits, setCredits] = useState("30");

  const erreur = mut.error instanceof ErreurApi ? mut.error : null;
  const anneeValide = /^\d{4}-\d{4}$/.test(annee);
  const numeroValide = Number(numero) >= 1 && Number(numero) <= 12;
  const pret = !!filiereId && type !== "" && intitule.trim().length >= 2 && anneeValide && numeroValide;
  const fermer = () => { if (!mut.isPending) onFermer(); };

  const envoyer = () => {
    mut.mutate({
      filiereId, composante: composante === "" ? null : composante, type: type as TypePeriode, numero: Number(numero),
      intitule: intitule.trim(), anneeUniversitaire: annee, debut: debut || null, fin: fin || null,
      creditsAttendus: Math.max(0, Math.min(60, Number(credits) || 0)),
    }, {
      onSuccess: (p) => { notifier({ ton: "succes", titre: "Période déclarée", texte: `${p.intitule} · ${p.anneeUniversitaire}. Les crédits attendus entrent au dénominateur de la capitalisation.` }); fermer(); },
    });
  };

  return (
    <Dialogue ouvert={ouvert} onFermer={fermer} icone={CalendarRange} titre="Déclarer une période de formation"
      description="Une même filière déroule un S1 en L1 et un S1 en L2 la même année : c'est la composante qui les distingue."
      pied={<><Button variante="secondaire" onClick={fermer} disabled={mut.isPending}>Annuler</Button><Button disabled={!pret} chargement={mut.isPending} onClick={envoyer}>Déclarer la période</Button></>}>
      <div className="space-y-4">
        <Champ label="Filière" obligatoire>
          <select value={filiereId} onChange={(e) => setFiliereId(e.target.value)} className={classeChamp} aria-label="Filière de la période">
            <option value="">Choisir une filière…</option>
            {filieres.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
          </select>
        </Champ>
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Nature de la période"><SelectVocabulaire vocabulaire={LIBELLE_TYPE_PERIODE} valeur={type} onChange={setType} label="Nature de la période" /></Champ>
          <Champ label="Composante" aide="Vide pour une filière EFTP hors LMD (CAP, BT, BTS)."><SelectVocabulaire vocabulaire={LIBELLE_COMPOSANTE} valeur={composante} onChange={setComposante} label="Composante de la période" vide="— hors LMD —" /></Champ>
          <Champ label="Rang dans l'année" aide="De 1 à 12."><input type="number" min={1} max={12} value={numero} onChange={(e) => setNumero(e.target.value)} className={classeChamp} aria-label="Rang de la période" /></Champ>
          <Champ label="Année universitaire" aide="Format 2025-2026." obligatoire><input value={annee} onChange={(e) => setAnnee(e.target.value.slice(0, 9))} placeholder="2025-2026" className={classeChamp} aria-invalid={!anneeValide && !!annee} aria-label="Année universitaire" /></Champ>
          <Champ label="Intitulé affiché" aide="Tel que l'étudiant le lira sur son contrat." obligatoire><input value={intitule} onChange={(e) => setIntitule(e.target.value.slice(0, 80))} placeholder="Semestre 1 — L1" className={classeChamp} aria-label="Intitulé de la période" /></Champ>
          <Champ label="Crédits attendus" aide="30 pour un semestre LMD standard."><input type="number" min={0} max={60} value={credits} onChange={(e) => setCredits(e.target.value)} className={classeChamp} aria-label="Crédits attendus de la période" /></Champ>
          <Champ label="Début"><input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} className={classeChamp} aria-label="Date de début de la période" /></Champ>
          <Champ label="Fin"><input type="date" value={fin} min={debut || undefined} onChange={(e) => setFin(e.target.value)} className={classeChamp} aria-label="Date de fin de la période" /></Champ>
        </div>
        <ErreurEnvoi erreur={erreur} />
      </div>
    </Dialogue>
  );
}

/* ------------------------------------------------------------------ Catalogue d'UE */

function CatalogueCard({ id, filieres, lignes, filiereCourante, setFiliereCourante }: {
  id: string; filieres: FiliereEtab[]; lignes: LigneCatalogueUe[]; filiereCourante: string; setFiliereCourante: (v: string) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const visibles = lignes.filter((l) => !filiereCourante || l.ue.filiereId === filiereCourante);
  const COLONNES: Colonne<LigneCatalogueUe>[] = [
    { entete: "Code", valeur: (l) => l.ue.code },
    { entete: "Intitulé", valeur: (l) => l.ue.intitule },
    { entete: "Filière", valeur: (l) => l.filiereNom },
    { entete: "Type", valeur: (l) => LIBELLE_TYPE_UE[l.ue.type] },
    { entete: "Crédits ECTS", valeur: (l) => l.ue.creditsEcts },
    { entete: "Coefficient", valeur: (l) => l.ue.coefficient },
    { entete: "Période-type", valeur: (l) => (l.ue.periodeType ? `${l.ue.periodeType} ${l.ue.periodeNumero ?? ""}`.trim() : "") },
    { entete: "Prérequis", valeur: (l) => l.ue.prerequis.join(" ") },
  ];

  return (
    <Card data-guide="scolarite-ue" className="min-w-0 overflow-hidden p-0">
      <CardHeader
        icon={Library}
        title="Catalogue des unités d'enseignement"
        subtitle="La brique de connaissance, indépendante de toute session : ses crédits, son coefficient, ses prérequis."
        action={<Button variante="secondaire" taille="sm" icone={Plus} onClick={() => setOuvert(true)} disabled={!filieres.length}>Déclarer une UE</Button>}
      />
      <div className="flex flex-wrap items-end gap-3 border-y border-line/60 bg-surface-2/40 px-5 py-3">
        <label className="flex items-center gap-2 text-[13px] text-ink-2"><span className="text-ink-muted">Filière</span>
          <select value={filiereCourante} onChange={(e) => setFiliereCourante(e.target.value)} className={classeSelect} aria-label="Filtrer le catalogue par filière">
            <option value="">Tout le catalogue</option>
            {filieres.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
          </select>
        </label>
        <span className="ml-auto flex items-center gap-3 text-xs text-ink-muted">{entier(visibles.length)} UE · {entier(visibles.reduce((s, l) => s + l.ue.creditsEcts, 0))} crédits
          <Button variante="fantome" taille="sm" icone={Download} disabled={!visibles.length} onClick={() => exporterCsv("catalogue_ue_etablissement", visibles, COLONNES, `BEILE — catalogue d'UE de l'établissement, ${date(new Date().toISOString())}.`)}>Exporter (CSV)</Button>
        </span>
      </div>
      {!visibles.length ? (
        <EtatVide icone={Library} titre="Catalogue vide pour ce filtre" texte="Une UE se déclare par filière ; c'est son code que la règle de validation cite dans les blocs de compensation." />
      ) : (
        <TableauDonnees
          colonnes={["Code", "Intitulé", "Type", "Crédits", "Coefficient", "Période-type", "Prérequis"]}
          lignes={visibles.map(({ ue, filiereNom }) => [
            <span key={ue.id} className="font-mono text-[13px] text-ink">{ue.code}</span>,
            <span key={`${ue.id}-i`} className="flex flex-col"><span className="text-ink">{ue.intitule}</span><span className="text-xs text-ink-muted">{filiereNom}</span></span>,
            <Badge key={`${ue.id}-t`} ton={ue.type === "stage" || ue.type === "memoire" ? "marque" : "neutre"}>{LIBELLE_TYPE_UE[ue.type]}</Badge>,
            entier(ue.creditsEcts),
            ue.coefficient,
            ue.periodeType ? `${LIBELLE_TYPE_PERIODE[ue.periodeType]} ${ue.periodeNumero ?? ""}`.trim() : <span key={`${ue.id}-p`} className="text-xs text-ink-muted">au choix de l'étudiant</span>,
            ue.prerequis.length ? <span key={`${ue.id}-pr`} className="flex flex-wrap gap-1">{ue.prerequis.map((p) => <Badge key={p} ton="info">{p}</Badge>)}</span> : <span key={`${ue.id}-pr`} className="text-xs text-ink-muted">—</span>,
          ])}
        />
      )}
      <DialogueUe id={id} filieres={filieres} ouvert={ouvert} onFermer={() => setOuvert(false)} />
    </Card>
  );
}

function DialogueUe({ id, filieres, ouvert, onFermer }: { id: string; filieres: FiliereEtab[]; ouvert: boolean; onFermer: () => void }) {
  const mut = useDeclarerUeMutation(id);
  const [filiereId, setFiliereId] = useState("");
  const [code, setCode] = useState("");
  const [intitule, setIntitule] = useState("");
  const [type, setType] = useState<TypeUE | "">("obligatoire");
  const [credits, setCredits] = useState("6");
  const [coefficient, setCoefficient] = useState("1");
  const [periodeType, setPeriodeType] = useState<TypePeriode | "">("");
  const [periodeNumero, setPeriodeNumero] = useState("1");
  const [prerequis, setPrerequis] = useState("");

  const erreur = mut.error instanceof ErreurApi ? mut.error : null;
  const creditsValides = Number(credits) >= 1 && Number(credits) <= 30;
  const pret = !!filiereId && code.trim().length >= 2 && intitule.trim().length >= 2 && type !== "" && creditsValides;
  const fermer = () => { if (!mut.isPending) onFermer(); };

  const envoyer = () => {
    mut.mutate({
      filiereId, code: code.trim(), intitule: intitule.trim(), type: type as TypeUE,
      creditsEcts: Number(credits), coefficient: Math.max(0.5, Math.min(10, Number(coefficient) || 1)),
      periodeType: periodeType === "" ? null : periodeType,
      periodeNumero: periodeType === "" ? null : Math.max(1, Math.min(12, Number(periodeNumero) || 1)),
      prerequis: prerequis.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 20),
    }, {
      onSuccess: (ue) => { notifier({ ton: "succes", titre: "UE déclarée", texte: `${ue.code} · ${entier(ue.creditsEcts)} crédits. Une UE s'acquiert en bloc, jamais au prorata.` }); fermer(); },
    });
  };

  return (
    <Dialogue ouvert={ouvert} onFermer={fermer} icone={Library} titre="Déclarer une unité d'enseignement"
      description="Le code et les crédits engagés ici retomberont sur chaque acquis et sur chaque délibération."
      pied={<><Button variante="secondaire" onClick={fermer} disabled={mut.isPending}>Annuler</Button><Button disabled={!pret} chargement={mut.isPending} onClick={envoyer}>Déclarer l&apos;UE</Button></>}>
      <div className="space-y-4">
        <Champ label="Filière" obligatoire>
          <select value={filiereId} onChange={(e) => setFiliereId(e.target.value)} className={classeChamp} aria-label="Filière de l'UE">
            <option value="">Choisir une filière…</option>
            {filieres.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
          </select>
        </Champ>
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Code" aide="Court et stable (ex. INF101)." obligatoire><input value={code} onChange={(e) => setCode(e.target.value.slice(0, 16))} className={classeChamp} aria-label="Code de l'UE" /></Champ>
          <Champ label="Type d'UE"><SelectVocabulaire vocabulaire={LIBELLE_TYPE_UE} valeur={type} onChange={setType} label="Type d'UE" /></Champ>
          <Champ label="Intitulé" obligatoire><input value={intitule} onChange={(e) => setIntitule(e.target.value.slice(0, 120))} className={classeChamp} aria-label="Intitulé de l'UE" /></Champ>
          <Champ label="Crédits ECTS" aide="De 1 à 30."><input type="number" min={1} max={30} value={credits} onChange={(e) => setCredits(e.target.value)} className={classeChamp} aria-label="Crédits ECTS de l'UE" /></Champ>
          <Champ label="Coefficient" aide="Servi seulement si la règle pondère par coefficient."><input type="number" min={0.5} max={10} step={0.5} value={coefficient} onChange={(e) => setCoefficient(e.target.value)} className={classeChamp} aria-label="Coefficient de l'UE" /></Champ>
          <Champ label="Période-type" aide="Vide = l'étudiant la choisit (mineure, réorientation)."><SelectVocabulaire vocabulaire={LIBELLE_TYPE_PERIODE} valeur={periodeType} onChange={setPeriodeType} label="Période-type de l'UE" vide="— au choix —" /></Champ>
          {periodeType !== "" && <Champ label="Rang de la période"><input type="number" min={1} max={12} value={periodeNumero} onChange={(e) => setPeriodeNumero(e.target.value)} className={classeChamp} aria-label="Rang de la période-type" /></Champ>}
        </div>
        <Champ label="Prérequis" aide="Codes d'UE séparés par des virgules : un contrat peut être refusé s'ils ne sont pas acquis."><input value={prerequis} onChange={(e) => setPrerequis(e.target.value.slice(0, 120))} placeholder="INF101, MAT102" className={classeChamp} aria-label="Codes des UE prérequises" /></Champ>
        <ErreurEnvoi erreur={erreur} />
      </div>
    </Dialogue>
  );
}

/* ------------------------------------------------------------------ Offres & groupes */

function OffresCard({ id, periodes, ues, filieres }: { id: string; periodes: Periode[]; ues: UniteEnseignement[]; filieres: FiliereEtab[] }) {
  const [periodeId, setPeriodeId] = useState("");
  const offres = useOffres(id, periodeId || null);
  const groupes = useGroupes(id);
  const [ouvreOffre, setOuvreOffre] = useState(false);
  const [ouvreGroupe, setOuvreGroupe] = useState(false);

  const ueParId = useMemo(() => new Map(ues.map((u) => [u.id, u])), [ues]);
  const periodeParId = useMemo(() => new Map(periodes.map((p) => [p.id, p])), [periodes]);
  const filiereParId = useMemo(() => new Map(filieres.map((f) => [f.id, f.nom])), [filieres]);
  const lignesOffres = offres.data ?? [];
  const lignesGroupes = groupes.data ?? [];

  const COLONNES: Colonne<OffreUE>[] = [
    { entete: "Code UE", valeur: (o) => ueParId.get(o.ueId)?.code ?? o.ueId },
    { entete: "Intitulé", valeur: (o) => ueParId.get(o.ueId)?.intitule ?? "" },
    { entete: "Période", valeur: (o) => periodeParId.get(o.periodeId)?.intitule ?? o.periodeId },
    { entete: "Année", valeur: (o) => periodeParId.get(o.periodeId)?.anneeUniversitaire ?? "" },
    { entete: "Session", valeur: (o) => LIBELLE_SESSION[o.session] },
    { entete: "CM", valeur: (o) => o.volumeCm },
    { entete: "TD", valeur: (o) => o.volumeTd },
    { entete: "TP", valeur: (o) => o.volumeTp },
    { entete: "Capacité", valeur: (o) => o.capacite },
  ];

  return (
    <Card data-guide="scolarite-offres" className="min-w-0 overflow-hidden p-0">
      <CardHeader
        icon={Layers}
        title="Offres d'UE et groupes"
        subtitle="L'UE devient enseignable : une occurrence dans une période, ses volumes horaires, ses groupes de TD ou de TP."
        action={<div className="flex gap-2"><Button variante="secondaire" taille="sm" icone={Plus} onClick={() => setOuvreOffre(true)} disabled={!periodes.length}>Ouvrir une offre</Button><Button variante="fantome" taille="sm" icone={Plus} onClick={() => setOuvreGroupe(true)} disabled={!lignesOffres.length}>Ouvrir un groupe</Button></div>}
      />
      <div className="flex flex-wrap items-end gap-3 border-y border-line/60 bg-surface-2/40 px-5 py-3">
        <label className="flex items-center gap-2 text-[13px] text-ink-2"><span className="text-ink-muted">Période</span>
          <select value={periodeId} onChange={(e) => setPeriodeId(e.target.value)} className={classeSelect} aria-label="Filtrer les offres par période">
            <option value="">Toutes les périodes</option>
            {periodes.map((p) => <option key={p.id} value={p.id}>{p.anneeUniversitaire} · {p.intitule}</option>)}
          </select>
        </label>
        <span className="ml-auto flex items-center gap-3 text-xs text-ink-muted">{entier(lignesOffres.length)} offre(s) · {entier(lignesGroupes.length)} groupe(s)
          <Button variante="fantome" taille="sm" icone={Download} disabled={!lignesOffres.length} onClick={() => exporterCsv("offres_ue_etablissement", lignesOffres, COLONNES, `BEILE — offres d'UE de l'établissement, ${date(new Date().toISOString())}. Une capacité vide = aucune limite déclarée, jamais un nombre inventé.`)}>Exporter (CSV)</Button>
        </span>
      </div>
      {offres.isPending ? <div className="p-5"><Squelette className="h-32" /></div> : offres.isError ? (
        <div className="p-5"><EtatErreur erreur={offres.error} reessayer={() => offres.refetch()} /></div>
      ) : !lignesOffres.length ? (
        <EtatVide icone={Layers} titre="Aucune offre ouverte pour ce filtre" texte="Sans offre dans une période, aucun contrat d'étudiant ne peut être signé et aucune note ne peut y être saisie." />
      ) : (
        <TableauDonnees
          colonnes={["UE", "Période & filière", "Session", "Volumes", "Capacité", "Groupes"]}
          lignes={lignesOffres.map((o) => {
            const ue = ueParId.get(o.ueId);
            const periode = periodeParId.get(o.periodeId);
            const si = lignesGroupes.filter((g) => g.offreUeId === o.id);
            return [
              <span key={o.id} className="flex flex-col"><span className="font-mono text-[13px] text-ink">{ue?.code ?? o.ueId}</span><span className="text-xs text-ink-muted">{ue?.intitule ?? "UE hors catalogue de l'établissement"}</span></span>,
              <span key={`${o.id}-p`} className="text-[13px] text-ink-2">{periode ? `${periode.intitule} · ${periode.anneeUniversitaire}` : "—"}{periode && <span className="mt-0.5 block text-xs text-ink-muted">{filiereParId.get(periode.filiereId) ?? periode.filiereId}</span>}</span>,
              <Badge key={`${o.id}-s`} ton={o.session === "normale" ? "neutre" : "info"}>{LIBELLE_SESSION[o.session]}</Badge>,
              <span key={`${o.id}-v`} className="text-[13px] tabular text-ink-2">CM {o.volumeCm} h · TD {o.volumeTd} h · TP {o.volumeTp} h</span>,
              o.capacite === null ? <Badge key={`${o.id}-c`} ton="neutre">sans limite déclarée</Badge> : entier(o.capacite),
              si.length ? <span key={`${o.id}-g`} className="flex flex-wrap gap-1">{si.map((g) => <Badge key={g.id} ton="marque">{LIBELLE_TYPE_GROUPE[g.type]} · {g.intitule} ({g.capacite})</Badge>)}</span> : <span key={`${o.id}-g`} className="text-xs text-ink-muted">aucun groupe</span>,
            ];
          })}
        />
      )}
      <DialogueOffre id={id} periodes={periodes} ues={ues} nomFiliere={new Map(filieres.map((f) => [f.id, f.nom]))} ouvert={ouvreOffre} onFermer={() => setOuvreOffre(false)} />
      <DialogueGroupe id={id} offres={lignesOffres} ues={ueParId} ouvert={ouvreGroupe} onFermer={() => setOuvreGroupe(false)} />
    </Card>
  );
}

function DialogueOffre({ id, periodes, ues, nomFiliere, ouvert, onFermer }: {
  id: string; periodes: Periode[]; ues: UniteEnseignement[]; nomFiliere: Map<string, string>; ouvert: boolean; onFermer: () => void;
}) {
  const mut = useDeclarerOffreMutation(id);
  const [periodeId, setPeriodeId] = useState("");
  const [ueId, setUeId] = useState("");
  const [session, setSession] = useState<SessionEvaluation | "">("normale");
  const [cm, setCm] = useState("20");
  const [td, setTd] = useState("20");
  const [tp, setTp] = useState("0");
  const [capacite, setCapacite] = useState("");

  const erreur = mut.error instanceof ErreurApi ? mut.error : null;
  const periode = periodes.find((p) => p.id === periodeId);
  const uesFiliere = ues.filter((u) => u.filiereId === periode?.filiereId);
  const pret = !!periodeId && !!ueId && session !== "";
  const fermer = () => { if (!mut.isPending) onFermer(); };

  const envoyer = () => {
    mut.mutate({
      ueId, periodeId, enseignantId: null, session: session as SessionEvaluation,
      volumeCm: Number(cm) || 0, volumeTd: Number(td) || 0, volumeTp: Number(tp) || 0,
      capacite: capacite.trim() === "" ? null : Number(capacite),
    }, {
      onSuccess: (o) => { notifier({ ton: "succes", titre: "Offre ouverte", texte: `${LIBELLE_SESSION[o.session]} — l'enseignant se rattache depuis l'espace enseignement ; ici restent les volumes et la capacité.` }); fermer(); },
    });
  };

  return (
    <Dialogue ouvert={ouvert} onFermer={fermer} icone={Layers} titre="Ouvrir une offre d'UE"
      description="L'offre n'existe que dans la filière de la période : une UE d'une autre filière est refusée par le serveur."
      pied={<><Button variante="secondaire" onClick={fermer} disabled={mut.isPending}>Annuler</Button><Button disabled={!pret} chargement={mut.isPending} onClick={envoyer}>Ouvrir l&apos;offre</Button></>}>
      <div className="space-y-4">
        <Champ label="Période" obligatoire>
          <select value={periodeId} onChange={(e) => { setPeriodeId(e.target.value); setUeId(""); }} className={classeChamp} aria-label="Période de l'offre">
            <option value="">Choisir une période…</option>
            {periodes.map((p) => <option key={p.id} value={p.id}>{p.anneeUniversitaire} · {p.intitule}</option>)}
          </select>
        </Champ>
        <Champ label="UE" aide={periode ? `Catalogue de la filière « ${nomFiliere.get(periode.filiereId) ?? periode.filiereId} ».` : "Choisir d'abord la période."} obligatoire>
          <select value={ueId} onChange={(e) => setUeId(e.target.value)} className={classeChamp} disabled={!periodeId} aria-label="UE de l'offre">
            <option value="">Choisir une UE…</option>
            {uesFiliere.map((u) => <option key={u.id} value={u.id}>{u.code} — {u.intitule}</option>)}
          </select>
        </Champ>
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Session d'évaluation"><SelectVocabulaire vocabulaire={LIBELLE_SESSION} valeur={session} onChange={setSession} label="Session de l'offre" /></Champ>
          <Champ label="Capacité" aide="Vide = aucune limite déclarée, jamais un nombre inventé."><input type="number" min={0} max={2000} value={capacite} onChange={(e) => setCapacite(e.target.value)} className={classeChamp} aria-label="Capacité de l'offre" /></Champ>
          <Champ label="Heures CM"><input type="number" min={0} max={400} value={cm} onChange={(e) => setCm(e.target.value)} className={classeChamp} aria-label="Volume horaire CM" /></Champ>
          <Champ label="Heures TD"><input type="number" min={0} max={400} value={td} onChange={(e) => setTd(e.target.value)} className={classeChamp} aria-label="Volume horaire TD" /></Champ>
          <Champ label="Heures TP"><input type="number" min={0} max={400} value={tp} onChange={(e) => setTp(e.target.value)} className={classeChamp} aria-label="Volume horaire TP" /></Champ>
        </div>
        <ErreurEnvoi erreur={erreur} />
      </div>
    </Dialogue>
  );
}

function DialogueGroupe({ id, offres, ues, ouvert, onFermer }: {
  id: string; offres: OffreUE[];
  ues: Map<string, UniteEnseignement>; ouvert: boolean; onFermer: () => void;
}) {
  const mut = useDeclarerGroupeMutation(id);
  const [offreUeId, setOffreUeId] = useState("");
  const [type, setType] = useState<TypeGroupe | "">("td");
  const [intitule, setIntitule] = useState("");
  const [capacite, setCapacite] = useState("40");
  const [creneau, setCreneau] = useState("");

  const erreur = mut.error instanceof ErreurApi ? mut.error : null;
  const pret = !!offreUeId && type !== "" && intitule.trim().length >= 1 && Number(capacite) >= 1;
  const fermer = () => { if (!mut.isPending) onFermer(); };

  const envoyer = () => {
    mut.mutate({ offreUeId, type: type as TypeGroupe, intitule: intitule.trim(), capacite: Number(capacite), enseignantId: null, creneau: creneau.trim() || null }, {
      onSuccess: (g) => { notifier({ ton: "succes", titre: "Groupe ouvert", texte: `${LIBELLE_TYPE_GROUPE[g.type]} ${g.intitule} · ${g.capacite} place(s). Le créneau déclaré sert à détecter les chevauchements du contrat.` }); fermer(); },
    });
  };

  return (
    <Dialogue ouvert={ouvert} onFermer={fermer} icone={Plus} titre="Ouvrir un groupe"
      description="Un groupe est une instance d'une offre : il se rattache à une offre, pas à une période."
      pied={<><Button variante="secondaire" onClick={fermer} disabled={mut.isPending}>Annuler</Button><Button disabled={!pret} chargement={mut.isPending} onClick={envoyer}>Ouvrir le groupe</Button></>}>
      <div className="space-y-4">
        <Champ label="Offre d'UE" obligatoire aide="La liste suit la période choisie au-dessus de ce volet.">
          <select value={offreUeId} onChange={(e) => setOffreUeId(e.target.value)} className={classeChamp} aria-label="Offre du groupe">
            <option value="">Choisir une offre…</option>
            {offres.map((o) => <option key={o.id} value={o.id}>{ues.get(o.ueId)?.code ?? o.ueId} — {LIBELLE_SESSION[o.session]}</option>)}
          </select>
        </Champ>
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Nature du groupe"><SelectVocabulaire vocabulaire={LIBELLE_TYPE_GROUPE} valeur={type} onChange={setType} label="Nature du groupe" /></Champ>
          <Champ label="Intitulé" aide="Ex. « TD 03 »." obligatoire><input value={intitule} onChange={(e) => setIntitule(e.target.value.slice(0, 60))} className={classeChamp} aria-label="Intitulé du groupe" /></Champ>
          <Champ label="Capacité" aide="De 1 à 2000." obligatoire><input type="number" min={1} max={2000} value={capacite} onChange={(e) => setCapacite(e.target.value)} className={classeChamp} aria-label="Capacité du groupe" /></Champ>
          <Champ label="Créneau" aide="Texte libre, pour repérer un chevauchement de contrat."><input value={creneau} onChange={(e) => setCreneau(e.target.value.slice(0, 60))} placeholder="Mardi 08h-10h" className={classeChamp} aria-label="Créneau du groupe" /></Champ>
        </div>
        <ErreurEnvoi erreur={erreur} />
      </div>
    </Dialogue>
  );
}

/* ------------------------------------------------------------------ Règles de validation */

function ReglesCard({ id, filieres, regles }: { id: string; filieres: FiliereEtab[]; regles: RegleValidation[] }) {
  const [ouvert, setOuvert] = useState(false);
  const nomFiliere = useMemo(() => new Map(filieres.map((f) => [f.id, f.nom])), [filieres]);
  const nationale = regles.find((r) => r.portee === "nationale");
  const locales = regles.filter((r) => r.portee !== "nationale").sort((a, b) => a.portee.localeCompare(b.portee));
  const enVigueur = locales.at(-1) ?? nationale;

  return (
    <Card data-guide="scolarite-regles" className="min-w-0 overflow-hidden p-0">
      <CardHeader
        icon={Scale}
        title="Règle de validation — les huit paramètres"
        subtitle="La liberté de l'établissement tient dans ces huit curseurs. La portée la plus précise l'emporte EN BLOC : c'est elle qui sera citée sur chaque acquis."
        action={<Button variante="secondaire" taille="sm" icone={Plus} onClick={() => setOuvert(true)}>Porter une règle</Button>}
      />
      {!regles.length ? (
        <EtatVide icone={Scale} titre="Aucune règle lisible" texte="Sans règle en vigueur, le serveur refuse toute validation d'UE : une moyenne calculée sous des paramètres que personne n'a déclarés ne se défend devant aucun jury." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 border-y border-line/60 bg-surface-2/40 px-5 py-3 text-[13px] text-ink-2">
            <PucePortee portee={enVigueur!.portee} />
            <span>Règle qui jugerait aujourd&apos;hui : <strong className="text-ink">{enVigueur!.id}</strong></span>
            {nationale && <span className="text-xs text-ink-muted">plancher national {nationale.id} · seuil {nationale.seuilAcquisition.toFixed(2)}/20</span>}
          </div>
          <div className="grid gap-3 p-5 lg:grid-cols-2">
            {regles.map((r) => (
              <div key={r.id} className="rounded-lg border border-line/70 bg-surface-2/30 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <PucePortee portee={r.portee} />
                  <span className="font-mono text-xs text-ink-muted">{r.id}</span>
                  {r.regime && <Badge ton="neutre">{LIBELLE_REGIME[r.regime]}</Badge>}
                  {r.id === enVigueur?.id && <Badge ton="succes">en vigueur</Badge>}
                </div>
                <p className="mt-1 text-[13px] text-ink-2">
                  {r.etablissementId ? (r.etablissementId === id ? "Votre établissement" : `Établissement ${r.etablissementId}`) : "Tous les établissements"}
                  {r.filiereId ? ` · filière ${nomFiliere.get(r.filiereId) ?? r.filiereId}` : ""}
                  {r.periodeId ? ` · période ${r.periodeId}` : ""}
                </p>
                <dl className="mt-3 grid gap-x-4 gap-y-2 text-[13px] sm:grid-cols-2">
                  {[
                    ["1 · Seuil d'acquisition", `${r.seuilAcquisition.toFixed(2)}/20`],
                    ["2 · Note éliminatoire", r.noteEliminatoire === null ? "aucune" : `${r.noteEliminatoire.toFixed(2)}/20`],
                    ["3 · Compensation", LIBELLE_COMPENSATION[r.compensation]],
                    ["4 · Pondération", LIBELLE_PONDERATION[r.ponderation]],
                    ["5 · Note retenue", r.sessionRetenue === "meilleure" ? "la meilleure" : "la dernière"],
                    ["6 · Moyenne de période", r.seuilMoyennePeriode === null ? "aucune condition" : `${r.seuilMoyennePeriode.toFixed(2)}/20`],
                    ["7 · Validité d'un acquis", r.dureeValiditeAcquis === 0 ? "sans limite de durée" : `${r.dureeValiditeAcquis} an(s)`],
                    ["8 · Report inter-établissements", r.reportCreditsInterEtab ? "autorisé" : "exclu"],
                  ].map(([libelle, valeur]) => (
                    <div key={libelle} className="flex items-baseline justify-between gap-3 border-b border-line/40 pb-1">
                      <dt className="text-[12px] text-ink-muted">{libelle}</dt><dd className="text-right font-medium text-ink">{valeur}</dd>
                    </div>
                  ))}
                </dl>
                {!!r.blocs.length && <p className="mt-3 flex flex-wrap gap-1.5">{r.blocs.map((b) => <Badge key={b.code} ton="marque">{b.code} : {b.ue.join(", ")}</Badge>)}</p>}
              </div>
            ))}
          </div>
        </>
      )}
      <DialogueRegle id={id} filieres={filieres} ouvert={ouvert} onFermer={() => setOuvert(false)} />
    </Card>
  );
}

/** Les huit paramètres, plus la cible. La portée `nationale` n'est pas proposée : elle se déclare au volet actes de l'État. */
function DialogueRegle({ id, filieres, ouvert, onFermer }: { id: string; filieres: FiliereEtab[]; ouvert: boolean; onFermer: () => void }) {
  const mut = useDeclarerRegleMutation(id);
  const periodes = usePeriodes(id);
  const catalogue = useCatalogueUe(id, null);
  const [portee, setPortee] = useState<PorteeLocale>("etablissement");
  const [filiereId, setFiliereId] = useState("");
  const [periodeId, setPeriodeId] = useState("");
  const [regime, setRegime] = useState<RegimePedagogique | "">("");
  const [seuil, setSeuil] = useState("10");
  const [eliminatoire, setEliminatoire] = useState("");
  const [compensation, setCompensation] = useState<RegleCompensation | "">("par_bloc");
  const [ponderation, setPonderation] = useState<ReglePonderation | "">("ects");
  const [sessionRetenue, setSessionRetenue] = useState<"meilleure" | "derniere">("meilleure");
  const [moyennePeriode, setMoyennePeriode] = useState("");
  const [duree, setDuree] = useState("5");
  const [report, setReport] = useState(true);
  const [blocs, setBlocs] = useState("");

  const erreur = mut.error instanceof ErreurApi ? mut.error : null;
  const codesUe = useMemo(() => new Set((catalogue.data ?? []).map((l) => l.ue.code)), [catalogue.data]);
  const blocsAnalyses = blocs.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [code, ues] = l.split(/[:;]/);
    return { code: (code ?? "").trim(), ue: (ues ?? "").split(",").map((x) => x.trim()).filter(Boolean) };
  });
  const blocsInconnus = [...new Set(blocsAnalyses.flatMap((b) => b.ue.filter((u) => !codesUe.has(u))))];
  const cibleManquante = (portee !== "etablissement" && !filiereId) || (portee === "periode" && !periodeId);
  const pret = !cibleManquante && !blocsAnalyses.some((b) => !b.code || !b.ue.length) && blocsInconnus.length === 0;
  const fermer = () => { if (!mut.isPending) onFermer(); };

  const envoyer = () => {
    mut.mutate({
      regleId: null, portee, etablissementId: id,
      filiereId: portee === "etablissement" ? null : filiereId,
      periodeId: portee === "periode" ? periodeId : null,
      regime: regime === "" ? null : regime,
      seuilAcquisition: Number(seuil), noteEliminatoire: eliminatoire === "" ? null : Number(eliminatoire),
      compensation: compensation as RegleCompensation, ponderation: ponderation as ReglePonderation, sessionRetenue,
      seuilMoyennePeriode: moyennePeriode === "" ? null : Number(moyennePeriode),
      dureeValiditeAcquis: Number(duree), reportCreditsInterEtab: report,
      blocs: compensation === "par_bloc" ? blocsAnalyses : [],
    }, {
      onSuccess: (r) => { notifier({ ton: "succes", titre: "Règle portée", texte: `${r.id} · portée ${r.portee}. Elle s'appliquera en bloc aux décisions de ce périmètre et chaque acquis la citera.` }); fermer(); },
    });
  };

  const periodesFiliere = (periodes.data ?? []).filter((p) => !filiereId || p.filiereId === filiereId);

  return (
    <Dialogue ouvert={ouvert} onFermer={fermer} icone={Scale} large titre="Porter une règle de validation"
      description="Une ligne nouvelle, à la portée choisie : elle n'écrase rien, elle devient la plus précise, donc celle qui juge."
      pied={<><Button variante="secondaire" onClick={fermer} disabled={mut.isPending}>Annuler</Button><Button disabled={!pret} chargement={mut.isPending} onClick={envoyer}>Porter la règle</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Portée" aide="« Nationale » se déclare au volet actes de l'État.">
            <select value={portee} onChange={(e) => setPortee(e.target.value as typeof portee)} className={classeChamp} aria-label="Portée de la règle">
              <option value="etablissement">Établissement</option>
              <option value="filiere">Filière</option>
              <option value="periode">Période</option>
            </select>
          </Champ>
          <Champ label="Régime visé" aide="Vide = tous les régimes de la portée."><SelectVocabulaire vocabulaire={LIBELLE_REGIME} valeur={regime} onChange={setRegime} label="Régime pédagogique visé" vide="— tous les régimes —" /></Champ>
          {portee !== "etablissement" && (
            <Champ label="Filière" obligatoire>
              <select value={filiereId} onChange={(e) => { setFiliereId(e.target.value); setPeriodeId(""); }} className={classeChamp} aria-label="Filière visée par la règle">
                <option value="">Choisir…</option>
                {filieres.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </select>
            </Champ>
          )}
          {portee === "periode" && (
            <Champ label="Période" obligatoire>
              <select value={periodeId} onChange={(e) => setPeriodeId(e.target.value)} className={classeChamp} disabled={!filiereId} aria-label="Période visée par la règle">
                <option value="">Choisir…</option>
                {periodesFiliere.map((p) => <option key={p.id} value={p.id}>{p.anneeUniversitaire} · {p.intitule}{p.composante ? ` (${p.composante})` : ""}</option>)}
              </select>
            </Champ>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Champ label="1 · Seuil d'acquisition" aide="Sur 20."><input type="number" min={0} max={20} step={0.25} value={seuil} onChange={(e) => setSeuil(e.target.value)} className={classeChamp} aria-label="Seuil d'acquisition" /></Champ>
          <Champ label="2 · Note éliminatoire" aide="Vide = aucune."><input type="number" min={0} max={20} step={0.25} value={eliminatoire} onChange={(e) => setEliminatoire(e.target.value)} className={classeChamp} aria-label="Note éliminatoire" /></Champ>
          <Champ label="6 · Moyenne de période" aide="Condition d'ouverture de la compensation ; vide = aucune."><input type="number" min={0} max={20} step={0.25} value={moyennePeriode} onChange={(e) => setMoyennePeriode(e.target.value)} className={classeChamp} aria-label="Seuil de moyenne de période" /></Champ>
          <Champ label="7 · Validité d'un acquis (ans)" aide="Au-delà, l'acquis reste au registre mais sort du numérateur."><input type="number" min={0} max={20} value={duree} onChange={(e) => setDuree(e.target.value)} className={classeChamp} aria-label="Durée de validité d'un acquis en années" /></Champ>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Champ label="3 · Compensation"><SelectVocabulaire vocabulaire={LIBELLE_COMPENSATION} valeur={compensation} onChange={setCompensation} label="Périmètre de compensation" /></Champ>
          <Champ label="4 · Pondération de la moyenne"><SelectVocabulaire vocabulaire={LIBELLE_PONDERATION} valeur={ponderation} onChange={setPonderation} label="Pondération de la moyenne" /></Champ>
          <Champ label="5 · Note retenue si l'UE est repassée">
            <select value={sessionRetenue} onChange={(e) => setSessionRetenue(e.target.value as "meilleure" | "derniere")} className={classeChamp} aria-label="Session retenue">
              <option value="meilleure">La meilleure note</option>
              <option value="derniere">La dernière note</option>
            </select>
          </Champ>
        </div>

        {compensation === "par_bloc" && (
          <Champ label="Blocs de compensation" aide="Une ligne par bloc, au format « BLOC-1: INF101, INF102 ». Les codes doivent exister au catalogue.">
            <textarea rows={3} value={blocs} onChange={(e) => setBlocs(e.target.value.slice(0, 600))} placeholder={"BLOC-1: INF101, INF102\nBLOC-2: INF201, INF202"} className={cn(classeChamp, "h-auto py-2 font-mono text-xs")} aria-label="Définition des blocs de compensation" />
            {blocsInconnus.length > 0 && <span className="mt-1 block text-xs text-critical">Codes inconnus au catalogue : {blocsInconnus.join(", ")}</span>}
          </Champ>
        )}

        <label className="flex items-start gap-2 text-[13px] text-ink-2">
          <input type="checkbox" checked={report} onChange={(e) => setReport(e.target.checked)} className="mt-0.5" aria-label="Autoriser le report de crédits entre établissements" />
          8 · Autoriser le report des crédits acquis vers un autre établissement homologué.
        </label>
        <ErreurEnvoi erreur={erreur} />
      </div>
    </Dialogue>
  );
}

/* ------------------------------------------------------------------ Statut administratif (lecture seule) */

function StatutCard({ id, nomFiliere }: { id: string; nomFiliere: Map<string, string> }) {
  const q = useStatutAdministratif(id);
  const statuts = q.data?.homologations ?? [];
  return (
    <Card data-guide="scolarite-statut" className="min-w-0 overflow-hidden p-0">
      <CardHeader icon={ShieldCheck} title="Statut administratif de l'établissement" subtitle="Ce que l'établissement sait de SES actes administratifs — et rien de ceux des autres. Les écrire relève du volet « Agrégats & actes de l'État »." />
      {q.isPending ? <div className="p-5"><Squelette className="h-40" /></div> : q.isError ? (
        <div className="p-5"><EtatErreur erreur={q.error} reessayer={() => q.refetch()} /></div>
      ) : (
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <Badge ton={TON_STATUT_ETAB[q.data!.etablissement.statut] ?? "neutre"}>{LIBELLE_STATUT_ETABLISSEMENT[q.data!.etablissement.statut] ?? q.data!.etablissement.statut}</Badge>
            {(q.data!.etablissement.tutelles ?? []).map((t) => <Badge key={t} ton="marque">{LIBELLE_TUTELLE[t] ?? t}</Badge>)}
            <span className="text-ink-2">{q.data!.etablissement.nom}</span>
          </div>
          {!q.data!.cycles.length && !statuts.length ? (
            <EtatVide icone={ShieldCheck} titre="Aucun acte administratif enregistré" texte="Un établissement public n'a pas de cycle EPES : l'autorisation d'ouverture ne contraint pas l'État lui-même. Une filière sans homologation en cours ne peut pas être certifiée par BEILE." />
          ) : (
            <>
              {!!q.data!.cycles.length && (
                <TableauDonnees colonnes={["Tutelle", "Phase", "Statut", "Avis du conseil", "Acte", "Échéance"]} lignes={q.data!.cycles.map((c) => [
                  LIBELLE_TUTELLE[c.autorite] ?? c.autorite,
                  LIBELLE_PHASE_EPES[c.phase],
                  <Badge key={c.id} ton={c.statut === "accorde" ? "succes" : c.statut === "instruit" ? "info" : "critique"}>{LIBELLE_STATUT_AGREMENT[c.statut]}</Badge>,
                  LIBELLE_AVIS_CONSEIL[c.avisConseil],
                  c.acteReference ?? <span key={`${c.id}-a`} className="text-xs text-ink-muted">aucune référence d'acte</span>,
                  c.echeanceLe ? date(c.echeanceLe) : "—",
                ])} />
              )}
              {!!statuts.length && (
                <TableauDonnees colonnes={["Filière", "Diplôme", "Statut", "Porte de certification", "Quota", "Dernier contrôle"]} lignes={statuts.map((h) => [
                  <span key={h.id} className="flex flex-col"><span className="text-ink">{nomFiliere?.get(h.filiereId) ?? "Filière hors de votre déclaration"}</span><span className="font-mono text-xs text-ink-muted">{h.filiereId}</span></span>,
                  LIBELLE_DIPLOME[h.diplome],
                  <Badge key={`${h.id}-s`} ton={TON_STATUT_ACCREDITATION[h.statut]}>{LIBELLE_STATUT_ACCREDITATION[h.statut]}</Badge>,
                  <span key={`${h.id}-p`} className="flex items-center gap-2">{h.porte.operante ? <Badge ton="succes">ouverte</Badge> : <Badge ton="critique">fermée</Badge>}<span className="text-xs text-ink-2">{h.porte.motif ?? "homologation en cours"}</span></span>,
                  h.quotaAnnuel === null ? <span key={`${h.id}-q`} className="text-xs text-ink-muted">aucun plafond déclaré</span> : entier(h.quotaAnnuel),
                  <span key={`${h.id}-c`} className="flex items-center gap-2">{h.dernierControleLe ? date(h.dernierControleLe) : "—"}<Badge ton={TON_CONCLUSION[h.conclusionControle] ?? "neutre"}>{LIBELLE_CONCLUSION_CONTROLE[h.conclusionControle]}</Badge></span>,
                ])} />
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
