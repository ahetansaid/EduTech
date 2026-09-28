"use client";

import type { AvisConseil, ConclusionControle, Diplome, PhaseEpes, RegleCompensation, ReglePonderation, RegleSessionRetenue, RegimePedagogique, StatutAccreditation, StatutAgrement } from "@beile/contracts";
import { Tutelle } from "@beile/contracts";
import { Calculator, Download, Gavel, Library, ListChecks, ScrollText, ShieldCheck, Users } from "lucide-react";
import { useState } from "react";
import { TableauDonnees } from "@/components/charts/Graphiques";
import { Cascade, Element, EntreePage } from "@/components/motion";
import { notifier } from "@/components/ui/Notifications";
import { Badge, Button, Card, CardHeader, EtatVide, PageHeader, Squelette } from "@/components/ui/primitives";
import { TuileIndicateur } from "@/components/ui/donnees";
import {
  LIBELLE_AVIS_CONSEIL, LIBELLE_COMPENSATION, LIBELLE_CONCLUSION_CONTROLE, LIBELLE_PONDERATION, LIBELLE_PHASE_EPES,
  LIBELLE_REGIME, LIBELLE_SESSION_RETENUE, LIBELLE_STATUT_ACCREDITATION, LIBELLE_STATUT_AGREMENT, LIBELLE_STATUT_ETABLISSEMENT,
  LIBELLE_STATUT_INSCRIPTION, LIBELLE_STATUT_JURY,
  type EtablissementSupLu, type EffectifsScolarite, type FiliereEtab, type HomologationLue,
  useCatalogueNational, useCreditsEtsNationaux, useControleMutation, useDeclarerRegleNationaleMutation, useEffectifsScolarite,
  useHomologuerMutation, useReseauSuperieur, useSuiviEpesMutation,
} from "@/lib/api/scolarite-superieure";
import { LIBELLE_DIPLOME, LIBELLE_TYPE_PARCOURS, LIBELLE_TUTELLE } from "@/lib/enseignement-superieur";
import { exporterCsv, type Colonne } from "@/lib/export";
import { date, entier } from "@/lib/format";
import { useProfil, useRoles } from "@/lib/session";
import { classeChamp, classeSelect, EtatErreur } from "../../../etablissement/_composants";
import { Bandeau, Champ, ErreurEnvoi, TableauCapitalisation } from "../_commun";
import { OngletsScolarite } from "../_OngletsScolarite";
import { OngletsESup } from "../../_Onglets";

/** Les rôles que la porte `perimetrePilotage` admet : l'écran ne propose pas ce que le serveur refuserait. */
const PILOTAGE = ["administration_centrale", "direction_departementale", "inspecteur", "chercheur"] as const;

/** Compensations qu'une règle nationale peut déclarer : `par_bloc` exige des codes d'UE du catalogue d'un établissement. */
const COMPENSATIONS_NATIONALES: RegleCompensation[] = ["aucune", "entre_toutes_les_ue"];

/**
 * Agrégats et actes de l'État : le volet qui ne nomme personne. Les chiffres viennent du registre des
 * écritures du supérieur, les actes engagent le bureau du supérieur — les deux portes sont distinctes et
 * rien ici n'élargit l'accès d'un agent.
 */
export default function Page() {
  return <EntreePage><Pilotage /></EntreePage>;
}

function Pilotage() {
  const profil = useProfil();
  const roles = useRoles();
  const pilotage = roles.some((r) => (PILOTAGE as readonly string[]).includes(r));
  const admin = profil.habilitations.some((h) => h.role === "administration_centrale" && h.perimetre.niveau === "national");

  const [annee, setAnnee] = useState("");
  const credits = useCreditsEtsNationaux(annee || null, pilotage);
  const effets = useEffectifsScolarite(pilotage);
  const reseau = useReseauSuperieur(pilotage);
  const catalogue = useCatalogueNational(admin);

  if (!pilotage) {
    return (
      <div className="space-y-5">
        <PageHeader surtitre="Enseignement supérieur · Scolarité" titre="Agrégats & actes de l'État" sousTitre="Ce que l'autorité de tutelle voit de la scolarité du supérieur sans ouvrir un dossier d'étudiant." />
        <OngletsESup />
        <OngletsScolarite chef={false} />
        <Card>
          <EtatVide icone={ShieldCheck} titre="Périmètre de pilotage requis" texte="Les agrégats de la scolarité du supérieur se lisent sous une habilitation de pilotage (administration centrale, direction départementale, inspection, recherche). Un chef d'établissement ne voit ici que ses propres agrégats, sur son volet de scolarité." />
        </Card>
      </div>
    );
  }

  const lignes = lignesEffets(effets.data);
  const capitaux = credits.data;
  const inscrits = (effets.data?.inscriptions ?? []).filter((i) => i.statut === "inscrit").reduce((s, i) => s + i.effectif, 0);
  const decisions = (effets.data?.validations ?? []).reduce((s, v) => s + v.decisions, 0);
  const homologuées = (effets.data?.homologations ?? []).filter((h) => h.statut === "accordee").reduce((s, h) => s + h.effectif, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        surtitre="Enseignement supérieur · Scolarité"
        titre="Agrégats & actes de l'État"
        sousTitre="Compter sans nommer : la capitalisation ECTS par voie, les effets enregistrés de la scolarité, et les actes que l'État pose sur un établissement — agrément, homologation, contrôle, règle nationale."
        actions={<Button variante="secondaire" taille="sm" icone={Download} disabled={!lignes.length} onClick={() => exporterCsv("effets_scolarite_superieure", lignes, COLONNES_EFFETS, `BEILE — comptages agrégés du registre des écritures du supérieur, toutes zones. Aucune donnée nominative, aucun établissement nommé. Export du ${date(new Date().toISOString())}.`, false)}>Exporter (CSV)</Button>}
      />
      <OngletsESup />
      <OngletsScolarite chef={false} />
      <Bandeau>
        Deux portes, jamais confondues : les <strong>agrégats</strong> se lisent sous le périmètre territorial de votre habilitation et ne nomment aucun établissement ; les <strong>actes de l&apos;État</strong>
        {" "}{admin ? "sont ouverts à votre compte (bureau du supérieur : administration centrale siégeant au niveau national)" : "exigent l'administration centrale siégeant au niveau national — votre habilitation lit les agrégats, elle ne statue pas"}.
        La console ne relit pas le dossier administratif d&apos;un établissement (cette lecture est réservée à son chef et à l&apos;inspecteur de sa circonscription) : elle statue établissement par établissement, depuis l&apos;annuaire.
      </Bandeau>

      <Cascade className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Element><TuileIndicateur libelle="Établissements de l'annuaire" icone={Library} accent="bleu" valeur={entier((reseau.data ?? []).length)} indice="annuaire administratif du supérieur — ni étudiants, ni notes" /></Element>
        <Element><TuileIndicateur libelle="Étudiants inscrits" icone={Users} accent="sarcelle" valeur={entier(inscrits)} indice="statut « inscrit·e » ; les autres statuts sont détaillés sous le tableau" /></Element>
        <Element><TuileIndicateur libelle="Décisions de validation" icone={ListChecks} accent="ambre" valeur={entier(decisions)} indice="une ligne par acquis enregistré, sous la règle qui l'a jugé" /></Element>
        <Element><TuileIndicateur libelle="Filières homologuées" icone={ShieldCheck} accent={homologuées ? "sarcelle" : "critique"} valeur={entier(homologuées)} indice="statut « homologuée » ; hors de ce statut, aucune certification n'est opposable" /></Element>
      </Cascade>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Champ label="Année universitaire" aide="L'agrégat ne rend pas la liste des années : laissez vide pour toutes, ou saisissez le format AAAA-AAAA.">
            <input value={annee} onChange={(e) => setAnnee(e.target.value.slice(0, 9))} placeholder="2026-2027" className={classeChamp} aria-label="Année universitaire de l'agrégat" />
          </Champ>
        </div>
        {!!annee && <Button variante="fantome" taille="sm" onClick={() => setAnnee("")}>Revenir à toutes les années</Button>}
      </div>

      {!capitaux ? (credits.isError
        ? <Card><EtatErreur erreur={credits.error} reessayer={() => credits.refetch()} /></Card>
        : <Squelette className="h-64 rounded-lg" />)
        : <TableauCapitalisation data={capitaux} titre="Capitalisation ECTS — agrégat par voie" sousTitre="Une ligne par voie, jamais par établissement : sous le seuil, la cellule garde son effectif et perd ses valeurs." />}

      <EffetsAgregesCard lignes={lignes} chargement={effets.isPending} erreur={effets.isError ? effets.error : null} reessayer={() => effets.refetch()} />

      {admin && (
        <ActesEtablissementCard etablissements={reseau.data ?? []} filieres={catalogue.data ?? []} chargementFilieres={catalogue.isPending} />
      )}
      {admin && <RegleNationaleCard />}
      {!admin && (
        <Card>
          <CardHeader icon={Gavel} title="Actes de l'État" subtitle="Non saisissables depuis votre habilitation." />
          <p className="px-5 pb-5 text-[13px] text-ink-2">
            Suivre le cycle EPES, homologuer une filière, consigner un contrôle pédagogique ou porter la règle nationale de validation relève du bureau de l&apos;enseignement supérieur :
            l&apos;habilitation « administration centrale » exerçant au niveau national. Rien ici ne vous est caché — ces écritures ne produisent pas d&apos;agrégat, elles produisent des actes.
            Les agrégats que vous lisez, eux, restent les mêmes.
          </p>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Effets agrégés */

type LigneEffet = { grandeur: string; cle: string; libelle: string; nombre: number };

const COLONNES_EFFETS: Colonne<LigneEffet>[] = [
  { entete: "Grandeur", valeur: (l) => l.grandeur },
  { entete: "Modalité", valeur: (l) => l.cle },
  { entete: "Libellé", valeur: (l) => l.libelle },
  { entete: "Nombre", valeur: (l) => l.nombre },
];

/** Les quatre comptages rendus par le serveur, mis à plat sans en ajouter un cinquième. */
function lignesEffets(e: EffectifsScolarite | undefined): LigneEffet[] {
  if (!e) return [];
  return [
    ...e.inscriptions.map((i) => ({ grandeur: "Inscriptions", cle: i.statut, libelle: LIBELLE_STATUT_INSCRIPTION[i.statut], nombre: i.effectif })),
    ...e.validations.map((v) => ({ grandeur: "Décisions de validation", cle: v.voie, libelle: LIBELLE_TYPE_PARCOURS[v.voie], nombre: v.decisions })),
    ...e.homologations.map((h) => ({ grandeur: "Homologations", cle: h.statut, libelle: LIBELLE_STATUT_ACCREDITATION[h.statut], nombre: h.effectif })),
    ...e.jurys.map((j) => ({ grandeur: "Jurys", cle: j.statut, libelle: LIBELLE_STATUT_JURY[j.statut], nombre: j.effectif })),
  ];
}

function EffetsAgregesCard({ lignes, chargement, erreur, reessayer }: { lignes: LigneEffet[]; chargement: boolean; erreur: unknown; reessayer: () => void }) {
  return (
    <Card data-guide="scolarite-effets-agreges" className="min-w-0 overflow-hidden p-0">
      <CardHeader icon={ListChecks} title="Effets enregistrés de la scolarité" subtitle="Quatre comptages du registre, tous périmètres confondus : ce que le supérieur a inscrit, validé, homologué et jugé." />
      {chargement ? <Squelette className="mx-5 mb-5 h-40 rounded-lg" /> : erreur
        ? <div className="px-5 pb-5"><EtatErreur erreur={erreur} reessayer={reessayer} /></div>
        : !lignes.length ? (
          <EtatVide icone={Calculator} titre="Aucun effet enregistré" texte="Le registre ne rend aucune ligne : ni inscription, ni validation, ni homologation. Un chiffre à zéro ici est un état, pas une panne — mais il signifie aussi qu'aucune scolarité du supérieur n'a encore été écrite." />
        ) : (
          <>
            <TableauDonnees
              colonnes={["Grandeur", "Modalité", "Nombre"]}
              lignes={lignes.map((l) => [
                <span key={`${l.cle}-g`} className="text-[13px] text-ink-2">{l.grandeur}</span>,
                <span key={`${l.cle}-l`} className="flex items-center gap-2 text-[13px] text-ink">{l.libelle}<code className="font-mono text-[11px] text-ink-muted">{l.cle}</code></span>,
                entier(l.nombre),
              ])}
            />
            <p className="border-t border-line/60 px-5 py-3 text-xs text-ink-muted">
              Un effectif n&apos;est pas une population : {entier(lignes.filter((l) => l.grandeur === "Inscriptions").reduce((s, l) => s + l.nombre, 0))} lignes d&apos;inscription et{" "}
              {entier(lignes.filter((l) => l.grandeur === "Décisions de validation").reduce((s, l) => s + l.nombre, 0))} décisions ne désignent pas les mêmes étudiants — un étudiant sous contrat valide plusieurs UE.
            </p>
          </>
        )}
    </Card>
  );
}

/* ------------------------------------------------------------------ Actes de l'État sur un établissement */

function ActesEtablissementCard({ etablissements, filieres, chargementFilieres }: { etablissements: EtablissementSupLu[]; filieres: FiliereEtab[]; chargementFilieres: boolean }) {
  const [etabId, setEtabId] = useState("");
  const etab = etablissements.find((e) => e.id === etabId) ?? null;

  return (
    <Card data-guide="scolarite-actes-etat" className="min-w-0 overflow-hidden p-0">
      <CardHeader icon={ShieldCheck} title="Actes de l'État sur un établissement" subtitle="Agrément du cycle EPES, homologation d'une filière, contrôle pédagogique : trois écritures du bureau du supérieur, chacune posée sur un établissement nommé." />
      <div className="space-y-4 px-5 pb-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Établissement" obligatoire aide="Choisi dans l'annuaire du supérieur. La liste n'est pas bornée à votre commune : un agent national statue partout, un agent territorial ne statue que dans son périmètre.">
            <select value={etabId} onChange={(e) => setEtabId(e.target.value)} className={classeSelect} aria-label="Établissement visé par l'acte">
              <option value="">— Choisissez l'établissement —</option>
              {etablissements.map((e) => <option key={e.id} value={e.id}>{e.nom} · {e.id}</option>)}
            </select>
          </Champ>
          {etab && (
            <Champ label="Statut de l'établissement" aide="Une EPES privée se suit par agrément ; une EPES publique n'a pas d'agrément à renouveler, l'acte reste enregistré mais ne conditionne pas l'inscription.">
              <div className="flex h-10 items-center gap-2 rounded-md border border-line bg-surface-2/40 px-3.5 text-sm text-ink">
                <Badge ton={etab.statut === "public" ? "info" : "neutre"}>{LIBELLE_STATUT_ETABLISSEMENT[etab.statut] ?? etab.statut}</Badge>
                <code className="font-mono text-[11px] text-ink-muted">{etab.id}</code>
              </div>
            </Champ>
          )}
        </div>

        {!etab ? (
          <EtatVide icone={Gavel} titre="Aucun établissement visé" texte="Un acte de l'État nomme son destinataire : choisissez l'établissement pour ouvrir l'agrément, l'homologation et le contrôle." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-line/60 p-4">
              <SuiviEpes key={etab.id} id={etab.id} tutelles={etab.tutelles ?? []} />
            </div>
            <div className="rounded-lg border border-line/60 p-4">
              {chargementFilieres ? <Squelette className="h-40 rounded" />
                : <HomologuerFiliere key={etab.id} id={etab.id} filieres={filieres.filter((f) => f.etablissementId === etab.id)} />}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/** Le cycle EPES d'un établissement, par autorité tutélaire : un acte par (établissement, autorité). */
function SuiviEpes({ id, tutelles }: { id: string; tutelles: Tutelle[] }) {
  const mut = useSuiviEpesMutation(id);
  const [autorite, setAutorite] = useState<Tutelle | "">("");
  const [phase, setPhase] = useState<PhaseEpes | "">("");
  const [statut, setStatut] = useState<StatutAgrement>("instruit");
  const [avis, setAvis] = useState<AvisConseil>("non_demande");
  const [acte, setActe] = useState("");
  const [accordeLe, setAccordeLe] = useState("");
  const [echeanceLe, setEcheanceLe] = useState("");
  const [renouvellements, setRenouvellements] = useState("0");
  const [motif, setMotif] = useState("");

  /** L'autorité d'un acte se lit parmi les tutelles déclarées de l'établissement ; à défaut, les trois tutelles du domaine. */
  const possibles: Tutelle[] = tutelles.length ? tutelles : Tutelle.options;
  const pret = !!autorite && !!phase && !!acte.trim();

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pret) return;
        mut.mutate({
          autorite, phase, statut, avisConseil: avis, acteReference: acte.trim().slice(0, 80),
          accordeLe: accordeLe || null, echeanceLe: echeanceLe || null,
          renouvellements: Math.min(4, Math.max(0, Number(renouvellements) || 0)),
          motif: motif.trim() || null,
        }, {
          onSuccess: (r) => notifier({ ton: "succes", titre: "Cycle EPES porté", texte: `${r.id} · ${LIBELLE_TUTELLE[r.autorite]} — ${LIBELLE_PHASE_EPES[r.phase]} / ${LIBELLE_STATUT_AGREMENT[r.statut]}. La porte d'inscription d'une EPES privée se lit sur cet acte.` }),
        });
      }}
    >
      <p className="flex items-center gap-2 text-sm font-medium text-ink"><ScrollText size={15} aria-hidden />Suivre le cycle EPES</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Champ label="Autorité tutélaire" obligatoire aide={tutelles.length ? "Tutelles déclarées de cet établissement." : "Aucune tutelle déclarée : les trois autorités du domaine sont proposées."}>
          <select value={autorite} onChange={(e) => setAutorite(e.target.value as Tutelle | "")} className={classeSelect} aria-label="Autorité tutélaire">
            <option value="">— Autorité —</option>
            {possibles.map((t) => <option key={t} value={t}>{LIBELLE_TUTELLE[t]}</option>)}
          </select>
        </Champ>
        <Champ label="Phase du cycle" obligatoire aide="Création sollicitée → autorisation de création → autorisation d'ouverture → agrément ; refus, suspension ou retrait clôturent le cycle.">
          <select value={phase} onChange={(e) => setPhase(e.target.value as PhaseEpes | "")} className={classeSelect} aria-label="Phase du cycle EPES">
            <option value="">— Phase —</option>
            {(Object.keys(LIBELLE_PHASE_EPES) as PhaseEpes[]).map((p) => <option key={p} value={p}>{LIBELLE_PHASE_EPES[p]}</option>)}
          </select>
        </Champ>
        <Champ label="Statut de l'acte" aide="Un agrément « expiré » ou « suspendu » retire la porte d'inscription d'une EPES privée.">
          <select value={statut} onChange={(e) => setStatut(e.target.value as StatutAgrement)} className={classeSelect} aria-label="Statut de l'agrément">
            {(Object.keys(LIBELLE_STATUT_AGREMENT) as StatutAgrement[]).map((s) => <option key={s} value={s}>{LIBELLE_STATUT_AGREMENT[s]}</option>)}
          </select>
        </Champ>
        <Champ label="Avis du conseil">
          <select value={avis} onChange={(e) => setAvis(e.target.value as AvisConseil)} className={classeSelect} aria-label="Avis du conseil">
            {(Object.keys(LIBELLE_AVIS_CONSEIL) as AvisConseil[]).map((a) => <option key={a} value={a}>{LIBELLE_AVIS_CONSEIL[a]}</option>)}
          </select>
        </Champ>
        <Champ label="Référence de l'acte" obligatoire aide="Arrêté, décision ou délibération : une autorisation sans référence ne se prouve pas.">
          <input value={acte} onChange={(e) => setActe(e.target.value.slice(0, 80))} placeholder="ARRêté n° 2026-…" className={classeChamp} aria-label="Référence de l'acte administratif" />
        </Champ>
        <Champ label="Renouvellements accordés" aide="0 à 4 ; le compteur reste déclaratif, c'est l'échéance qui borne la porte.">
          <input type="number" min={0} max={4} value={renouvellements} onChange={(e) => setRenouvellements(e.target.value)} className={classeChamp} aria-label="Nombre de renouvellements" />
        </Champ>
        <Champ label="Accordé le"><input type="date" value={accordeLe} onChange={(e) => setAccordeLe(e.target.value)} className={classeChamp} aria-label="Date d'octroi" /></Champ>
        <Champ label="Échéance le" aide="Vide = sans échéance déclarée. Passée cette date, l'agrément ne fonde plus l'inscription."><input type="date" value={echeanceLe} onChange={(e) => setEcheanceLe(e.target.value)} className={classeChamp} aria-label="Date d'échéance" /></Champ>
      </div>
      <Champ label="Motif"><textarea rows={2} value={motif} onChange={(e) => setMotif(e.target.value.slice(0, 200))} className={classeChamp} aria-label="Motif de l'acte" /></Champ>
      <div className="flex items-center gap-3">
        <Button type="submit" variante="primaire" taille="sm" icone={ShieldCheck} chargement={mut.isPending} disabled={!pret}>Porter le cycle</Button>
        <span className="text-xs text-ink-muted">Renvoyer la même autorité remplace la ligne : un acte par (établissement, autorité).</span>
      </div>
      <ErreurEnvoi erreur={mut.error} />
    </form>
  );
}

/**
 * Homologuer une filière, puis consigner le contrôle de cette homologation. Le contrôle ne peut porter
 * que sur la ligne que cet écran vient de rendre : la console ne lit pas les homologations déjà
 * enregistrées d'un autre établissement que son chef.
 */
function HomologuerFiliere({ id, filieres }: { id: string; filieres: FiliereEtab[] }) {
  const homologuer = useHomologuerMutation(id);
  const [filiereId, setFiliereId] = useState("");
  const [statut, setStatut] = useState<StatutAccreditation>("instruite");
  const [quota, setQuota] = useState("");
  const [accordeeLe, setAccordeeLe] = useState("");
  const [echeanceLe, setEcheanceLe] = useState("");
  const [motif, setMotif] = useState("");
  const [rendue, setRendue] = useState<HomologationLue | null>(null);

  const filiere = filieres.find((f) => f.id === filiereId) ?? null;
  const diplome: Diplome | null = filiere?.diplomeVise ?? null;

  return (
    <div className="space-y-4">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!filiere || !diplome) return;
          homologuer.mutate({
            filiereId: filiere.id, diplome, statut,
            quotaAnnuel: quota === "" ? null : Math.max(0, Number(quota) || 0),
            accordeeLe: accordeeLe || null, echeanceLe: echeanceLe || null, motif: motif.trim() || null,
          }, {
            onSuccess: (r) => {
              setRendue(r);
              notifier({
                ton: r.porte.operante ? "succes" : "avertissement",
                titre: r.porte.operante ? "Homologation opérante" : "Homologation enregistrée, porte fermée",
                texte: `${r.id} · ${LIBELLE_DIPLOME[r.diplome]} — ${r.porte.operante ? "la filière peut certifier ses diplômés." : r.porte.motif ?? "certification refusée."}`,
              });
            },
          });
        }}
      >
        <p className="flex items-center gap-2 text-sm font-medium text-ink"><ScrollText size={15} aria-hidden />Homologuer une filière</p>
        {!filieres.length ? (
          <EtatVide icone={Library} titre="Aucune filière au catalogue national pour cet établissement" texte="Le catalogue des filières se déclare au volet référentiel de l'établissement. Sans filière, l'État n'a rien à homologuer." />
        ) : (
          <>
            <Champ label="Filière" obligatoire aide="Filières de cet établissement telles que le catalogue national les rend.">
              <select value={filiereId} onChange={(e) => { setFiliereId(e.target.value); setRendue(null); }} className={classeSelect} aria-label="Filière à homologuer">
                <option value="">— Choisissez une filière —</option>
                {filieres.map((f) => <option key={f.id} value={f.id}>{f.nom} · {LIBELLE_TYPE_PARCOURS[f.voie]}</option>)}
              </select>
            </Champ>
            {filiere && (
              <div className="rounded-md bg-surface-2/40 px-3 py-2 text-[13px] text-ink-2">
                Diplôme visé : <strong>{LIBELLE_DIPLOME[filiere.diplomeVise]}</strong> · volume déclaré{" "}
                <strong>{entier(filiere.creditsEcts)}</strong> crédits ECTS
                <span className="mt-1 block text-xs text-ink-muted">Le diplôme ne se choisit pas ici : le serveur refuse (422) tout autre que celui que la filière vise. Un volume de crédits à zéro rend la délibération impossible.</span>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Champ label="Statut de l'homologation">
                <select value={statut} onChange={(e) => setStatut(e.target.value as StatutAccreditation)} className={classeSelect} aria-label="Statut de l'homologation">
                  {(Object.keys(LIBELLE_STATUT_ACCREDITATION) as StatutAccreditation[]).map((s) => <option key={s} value={s}>{LIBELLE_STATUT_ACCREDITATION[s]}</option>)}
                </select>
              </Champ>
              <Champ label="Quota annuel d'inscriptions" aide="Vide = aucun plafond déclaré. Le quota borne le droit d'inscrire, pas le droit d'exister.">
                <input type="number" min={0} max={20000} value={quota} onChange={(e) => setQuota(e.target.value)} placeholder="120" className={classeChamp} aria-label="Quota annuel" />
              </Champ>
              <Champ label="Accordée le"><input type="date" value={accordeeLe} onChange={(e) => setAccordeeLe(e.target.value)} className={classeChamp} aria-label="Date d'octroi de l'homologation" /></Champ>
              <Champ label="Échéance le" aide="Passée cette date, la porte de certification se ferme, même sous un statut « homologuée »."><input type="date" value={echeanceLe} onChange={(e) => setEcheanceLe(e.target.value)} className={classeChamp} aria-label="Date d'échéance de l'homologation" /></Champ>
            </div>
            <Champ label="Motif"><textarea rows={2} value={motif} onChange={(e) => setMotif(e.target.value.slice(0, 200))} className={classeChamp} aria-label="Motif de l'homologation" /></Champ>
            <div className="flex items-center gap-3">
              <Button type="submit" variante="primaire" taille="sm" icone={ShieldCheck} chargement={homologuer.isPending} disabled={!filiere}>Homologuer</Button>
              <span className="text-xs text-ink-muted">Un acte par (établissement, filière) : renvoyer la même filière remplace la ligne.</span>
            </div>
            <ErreurEnvoi erreur={homologuer.error} />
          </>
        )}
      </form>

      {rendue && <ControlePedagogique id={rendue.etablissementId} ligne={rendue} surConsigne={setRendue} />}
    </div>
  );
}

function ControlePedagogique({ id, ligne, surConsigne }: { id: string; ligne: HomologationLue; surConsigne: (l: HomologationLue) => void }) {
  const mut = useControleMutation(id);
  const [conclusion, setConclusion] = useState<ConclusionControle>("conforme");
  const [motif, setMotif] = useState("");

  return (
    <form
      className="space-y-3 rounded-lg border border-line/60 bg-surface-2/40 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        mut.mutate({ homologationId: ligne.id, conclusion, motif: motif.trim() || null }, {
          onSuccess: (r) => {
            surConsigne(r);
            notifier({
              ton: r.porte.operante ? "succes" : "critique",
              titre: r.porte.operante ? "Contrôle consigné, porte ouverte" : "Contrôle consigné, porte fermée",
              texte: `${r.id} · ${LIBELLE_CONCLUSION_CONTROLE[r.conclusionControle]} — ${r.porte.operante ? "la délibération est possible." : r.porte.motif ?? "certification refusée."}`,
            });
          },
        });
      }}
    >
      <p className="flex items-center gap-2 text-sm font-medium text-ink"><Gavel size={15} aria-hidden />Contrôle pédagogique de {ligne.id}</p>
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
        <Badge ton={ligne.porte.operante ? "succes" : "critique"}>{ligne.porte.operante ? "porte ouverte" : "porte fermée"}</Badge>
        <span>{LIBELLE_DIPLOME[ligne.diplome]} · {LIBELLE_STATUT_ACCREDITATION[ligne.statut]} · dernier contrôle {ligne.dernierControleLe ? date(ligne.dernierControleLe) : "jamais"}</span>
        {ligne.porte.motif && <span className="text-critical">{ligne.porte.motif}</span>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Champ label="Conclusion du contrôle" obligatoire aide="« Non conforme » ferme la porte de certification ; « avec réserves » la laisse ouverte et appelle une prochaine visite.">
          <select value={conclusion} onChange={(e) => setConclusion(e.target.value as ConclusionControle)} className={classeSelect} aria-label="Conclusion du contrôle pédagogique">
            {(Object.keys(LIBELLE_CONCLUSION_CONTROLE) as ConclusionControle[]).map((k) => <option key={k} value={k}>{LIBELLE_CONCLUSION_CONTROLE[k]}</option>)}
          </select>
        </Champ>
        <Champ label="Motif" aide="Ce que la visite a constaté, en 200 signes au plus.">
          <input value={motif} onChange={(e) => setMotif(e.target.value.slice(0, 200))} className={classeChamp} aria-label="Motif du contrôle" />
        </Champ>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variante="primaire" taille="sm" icone={Gavel} chargement={mut.isPending}>Consigner le contrôle</Button>
        <span className="text-xs text-ink-muted">La console applique le contrôle à l&apos;homologation qu&apos;elle vient de rendre ; elle ne relit pas celles d&apos;un établissement dont elle n&apos;a pas le dossier nominatif.</span>
      </div>
      <ErreurEnvoi erreur={mut.error} />
    </form>
  );
}

/* ------------------------------------------------------------------ Règle nationale de validation */

/**
 * La ligne qui fonde toutes les autres : là où un établissement n&apos;a pas déclaré de portée plus précise,
 * c&apos;est elle qui juge. `par_bloc` reste exclu — les codes d&apos;UE appartiennent à un catalogue d&apos;établissement.
 */
function RegleNationaleCard() {
  const mut = useDeclarerRegleNationaleMutation();
  const [regleId, setRegleId] = useState("");
  const [regime, setRegime] = useState<RegimePedagogique | "">("");
  const [seuil, setSeuil] = useState("10");
  const [eliminatoire, setEliminatoire] = useState("");
  const [compensation, setCompensation] = useState<RegleCompensation>("entre_toutes_les_ue");
  const [ponderation, setPonderation] = useState<ReglePonderation>("ects");
  const [sessionRetenue, setSessionRetenue] = useState<RegleSessionRetenue>("meilleure");
  const [moyennePeriode, setMoyennePeriode] = useState("");
  const [duree, setDuree] = useState("5");
  const [report, setReport] = useState(true);
  const [rendue, setRendue] = useState<string | null>(null);

  const nombre = (v: string) => Math.min(20, Math.max(0, Number(v) || 0));

  return (
    <Card data-guide="scolarite-regle-nationale" className="min-w-0 overflow-hidden p-0">
      <CardHeader icon={ScrollText} title="Règle nationale de validation" subtitle="Les huit paramètres sous lesquels aucune règle d'établissement n'a été déclarée. La portée la plus précise gagne : cette ligne ne remplace pas celles des établissements, elle les précède." />
      <form
        className="space-y-4 px-5 pb-5"
        onSubmit={(e) => {
          e.preventDefault();
          mut.mutate({
            regleId: regleId.trim() || null, portee: "nationale",
            etablissementId: null, filiereId: null, periodeId: null,
            regime: regime === "" ? null : regime,
            seuilAcquisition: nombre(seuil), noteEliminatoire: eliminatoire === "" ? null : nombre(eliminatoire),
            compensation, ponderation, sessionRetenue,
            seuilMoyennePeriode: moyennePeriode === "" ? null : nombre(moyennePeriode),
            dureeValiditeAcquis: Math.min(20, Math.max(0, Math.round(Number(duree) || 0))),
            reportCreditsInterEtab: report, blocs: [],
          }, {
            onSuccess: (r) => {
              setRendue(r.id);
              notifier({ ton: "succes", titre: "Règle nationale portée", texte: `${r.id} · seuil ${r.seuilAcquisition}/20, validité des acquis ${r.dureeValiditeAcquis === 0 ? "sans limite" : `${r.dureeValiditeAcquis} an(s)`}. Chaque acquis qui la citera pourra être défendu paramètre par paramètre.` });
            },
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Champ label="Identifiant de la ligne à remplacer" aide="Vide = nouvelle ligne. Deux lignes nationales coexistantes laissent le moteur libre de l'une ou l'autre : préférez le remplacement.">
            <input value={regleId} onChange={(e) => setRegleId(e.target.value.toUpperCase().slice(0, 44))} placeholder="RGL-…" className={classeChamp} aria-label="Identifiant de la règle nationale" />
          </Champ>
          <Champ label="Régime pédagogique" aide="Vide = tous les régimes. Une règle nationale limitée à un régime ne jugerait pas les étudiants des autres.">
            <select value={regime} onChange={(e) => setRegime(e.target.value as RegimePedagogique | "")} className={classeSelect} aria-label="Régime pédagogique de la règle nationale">
              <option value="">Tous les régimes</option>
              {(Object.keys(LIBELLE_REGIME) as RegimePedagogique[]).map((r) => <option key={r} value={r}>{LIBELLE_REGIME[r]}</option>)}
            </select>
          </Champ>
          <Champ label="1 · Seuil d'acquisition (sur 20)"><input type="number" min={0} max={20} step="0.05" value={seuil} onChange={(e) => setSeuil(e.target.value)} className={classeChamp} aria-label="Seuil d'acquisition" /></Champ>
          <Champ label="2 · Note éliminatoire" aide="Vide = aucune. Sous cette note, la compensation ne rachète plus l'UE."><input type="number" min={0} max={20} step="0.05" value={eliminatoire} onChange={(e) => setEliminatoire(e.target.value)} className={classeChamp} aria-label="Note éliminatoire" /></Champ>
          <Champ label="3 · Compensation" aide="« Par bloc » se déclare à la portée établissement : une règle nationale ignorerait les codes d'UE de chaque catalogue.">
            <select value={compensation} onChange={(e) => setCompensation(e.target.value as RegleCompensation)} className={classeSelect} aria-label="Périmètre de compensation">
              {COMPENSATIONS_NATIONALES.map((k) => <option key={k} value={k}>{LIBELLE_COMPENSATION[k]}</option>)}
            </select>
          </Champ>
          <Champ label="4 · Pondération de la moyenne">
            <select value={ponderation} onChange={(e) => setPonderation(e.target.value as ReglePonderation)} className={classeSelect} aria-label="Pondération de la moyenne">
              {(Object.keys(LIBELLE_PONDERATION) as ReglePonderation[]).map((k) => <option key={k} value={k}>{LIBELLE_PONDERATION[k]}</option>)}
            </select>
          </Champ>
          <Champ label="5 · Note retenue après un repassage">
            <select value={sessionRetenue} onChange={(e) => setSessionRetenue(e.target.value as RegleSessionRetenue)} className={classeSelect} aria-label="Session retenue">
              {(Object.keys(LIBELLE_SESSION_RETENUE) as RegleSessionRetenue[]).map((k) => <option key={k} value={k}>{LIBELLE_SESSION_RETENUE[k]}</option>)}
            </select>
          </Champ>
          <Champ label="6 · Moyenne minimale de période" aide="Vide = aucune condition de moyenne pour ouvrir la compensation."><input type="number" min={0} max={20} step="0.05" value={moyennePeriode} onChange={(e) => setMoyennePeriode(e.target.value)} className={classeChamp} aria-label="Moyenne minimale de période" /></Champ>
          <Champ label="7 · Validité d'un acquis (années)" aide="0 = sans limite. Ce nombre borne aussi la capitalisation ECTS : un acquis périmé reste compté à part.">
            <input type="number" min={0} max={20} value={duree} onChange={(e) => setDuree(e.target.value)} className={classeChamp} aria-label="Durée de validité d'un acquis" />
          </Champ>
        </div>
        <label className="flex items-start gap-2 text-[13px] text-ink-2">
          <input type="checkbox" checked={report} onChange={(e) => setReport(e.target.checked)} className="mt-0.5" aria-label="Autoriser le report national des crédits" />
          8 · Autoriser le report des crédits acquis vers un autre établissement homologué. Un établissement qui refuse ce rapport pour ses entrées le déclare à sa portée.
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variante="primaire" taille="sm" icone={ScrollText} chargement={mut.isPending}>Porter la règle nationale</Button>
          {rendue && <span className="text-[13px] text-ink-2">Dernière ligne portée : <code className="font-mono text-xs text-ink">{rendue}</code></span>}
        </div>
        <ErreurEnvoi erreur={mut.error} />
      </form>
    </Card>
  );
}
