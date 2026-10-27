"use client";

import { LIBELLE_TERME_FRAIS, type FraisTerme, type QualiteAgentEncaisseur } from "@beile/contracts";
import { CalendarPlus, CheckCircle2, Clock, FileText, Inbox, Receipt, ShieldCheck, Wallet, XCircle } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { EntreePage } from "@/components/motion";
import { notifier } from "@/components/ui/Notifications";
import { Badge, Button, Card, CardHeader, EtatVide, PageHeader, Squelette, type Ton } from "@/components/ui/primitives";
import {
  ChampRecherche, Dialogue, EtatErreur, HorsPerimetre, Jauge, classeChamp, classeSelect, dateCourte,
} from "../_composants";
import {
  LIBELLE_AGENT_ENCAISSEUR, LIBELLE_ETAT_TERME, LIBELLE_STATUT_FRAIS, LIBELLE_STATUT_RECLAMATION, QUALITES_AGENT,
  TERMES_FRAIS, TON_RECLAMATION, TON_STATUT_FRAIS, useCadenceMutation, useExonerationMutation, useFraisEcole,
  useQuittanceMutation, useStatuerReclamationMutation, type EtatFraisEcole, type LigneFraisEcole, type ReclamationFrais,
} from "@/lib/api/frais";
import { cn } from "@/lib/cn";
import { entier } from "@/lib/format";
import { ErreurApi } from "@/lib/http";
import { useEtablissementCourant } from "@/lib/session";

/**
 * Frais scolaires de l'établissement : l'école déclare les termes qu'elle appelle (des dates, jamais des sommes),
 * consigne les quittances qu'elle a délivrées et les exonérations qu'elle a décidées, puis compare le nombre de
 * pièces à son effectif. C'est un état de rapprochement, pas une caisse : BEILE ne calcule et n'encaisse rien,
 * et une pièce absente du registre n'est pas la preuve d'un paiement absent.
 */
export default function Page() {
  const id = useEtablissementCourant();
  return <EntreePage>{id ? <FraisEtablissement id={id} /> : <HorsPerimetre />}</EntreePage>;
}

function FraisEtablissement({ id }: { id: string }) {
  const [annee, setAnnee] = useState<string | null>(null);
  const [declarer, setDeclarer] = useState(false);
  const [recherche, setRecherche] = useState("");
  // La recherche se fait côté serveur, mais seulement quand la frappe se pose : une requête par caractère
  // parcourrait l'effectif à chaque touche.
  const rechercheDifferee = useDeferredValue(recherche);
  const q = useFraisEcole(id, annee, rechercheDifferee.trim() ? rechercheDifferee : null);
  const etat = q.data;

  return (
    <div className="space-y-5">
      <PageHeader surtitre="Établissement" titre="Frais scolaires"
        sousTitre="Déclarez les termes que l'école appelle, enregistrez les quittances délivrées et les exonérations décidées. Aucun montant ne passe par BEILE : la somme reste sur la pièce papier et dans la comptabilité de l'établissement."
        actions={etat ? <Button icone={CalendarPlus} onClick={() => setDeclarer(true)}>{etat.cadence ? "Modifier l'appel de l'année" : "Déclarer l'appel de l'année"}</Button> : undefined} />

      <Card className="min-w-0 bg-surface-2/40">
        <div className="flex items-start gap-3">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-ink-2" aria-hidden />
          <p className="text-[13px] text-ink-2">
            Un terme sans pièce enregistrée ne bloque <strong className="font-semibold text-ink">rien</strong> : ni bulletin, ni examen, ni appel en classe, ni accès à l&apos;école. Ces traces ne sortent pas de la direction de l&apos;établissement
            et du responsable légal qui paie — la lecture d&apos;un enseignant reste pédagogique.
          </p>
        </div>
      </Card>

      {q.isPending ? (
        <div className="space-y-3">{Array.from({ length: 4 }, (_, i) => <Squelette key={i} className="h-28" />)}</div>
      ) : q.isError ? (
        <Card className="min-w-0"><EtatErreur erreur={q.error} reessayer={() => q.refetch()} /></Card>
      ) : !etat ? null : !etat.anneeScolaire ? (
        <Card className="min-w-0"><EtatVide icone={FileText} titre="Aucune année en cours" texte="Aucune classe n'est ouverte dans cet établissement : l'appel des frais se déclare une fois les classes de l'année créées." /></Card>
      ) : (
        <>
          {etat.annees.length > 1 && (
            <label className="flex items-center gap-2 text-sm text-ink-2">
              <span className="text-[13px] text-ink-muted">Année</span>
              <select value={annee ?? etat.anneeScolaire} onChange={(e) => setAnnee(e.target.value)} className={classeSelect}>
                {etat.annees.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
          )}
          <SituationGlobale etat={etat} />
          <AppelDeAnnee etat={etat} />
          <Reclamations etat={etat} />
          <ParApprenant etat={etat} recherche={recherche} setRecherche={setRecherche} />
          {declarer && <DialogueCadence id={id} etat={etat} fermer={() => setDeclarer(false)} />}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Totaux de l'école */

function SituationGlobale({ etat }: { etat: EtatFraisEcole }) {
  const cases: { cle: keyof typeof LIBELLE_STATUT_FRAIS; libelle: string; icone: typeof Receipt; ton: Ton }[] = [
    { cle: "couvert", libelle: "Tous les termes appelés ont une pièce", icone: CheckCircle2, ton: "succes" },
    { cle: "exonere", libelle: "Exonérés ou pris en charge", icone: ShieldCheck, ton: "info" },
    { cle: "attendu", libelle: "Un terme exigible sans pièce", icone: XCircle, ton: "avertissement" },
    { cle: "en_cours", libelle: "Année en cours", icone: Wallet, ton: "neutre" },
    { cle: "sans_declaration", libelle: "Aucun appel déclaré", icone: FileText, ton: "neutre" },
  ];
  return (
    <Card className="min-w-0">
      <CardHeader icon={Receipt} title="Situation de l'école" subtitle={subtitle(etat)} />
      {etat.anneeCourante && etat.anneeScolaire !== etat.anneeCourante && (
        <p className="mb-4 rounded-md bg-warning-bg px-3 py-2.5 text-[13px] text-warning">
          Année close : le registre ne conserve pas les listes d&apos;élèves par année, l&apos;effectif affiché reste donc celui scolarisé
          aujourd&apos;hui dans l&apos;établissement. Les pièces consignées pour {etat.anneeScolaire}, elles, sont bien celles de cette année.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cases.map((c) => (
          <div key={c.cle} className="rounded-lg border border-line/70 px-3 py-2.5">
            <p className="flex items-start gap-1.5 text-[11px] font-semibold uppercase leading-tight tracking-[0.08em] text-ink-muted"><c.icone size={13} className="mt-px shrink-0" aria-hidden /> {c.libelle}</p>
            <p className="mt-1.5 font-display text-[22px] font-bold tabular-nums text-ink">{entier(etat.totaux[c.cle] ?? 0)}</p>
            <Badge ton={c.ton} className="mt-1.5">{LIBELLE_STATUT_FRAIS[c.cle]}</Badge>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-muted">Ce sont des comptes de pièces, pas des sommes : ils se comparent à l&apos;effectif de l&apos;école, jamais à un montant. Zéro dans une case veut simplement dire qu&apos;aucun élève n&apos;est dans ce cas aujourd&apos;hui.</p>
    </Card>
  );
}

/**
 * Ce que l'effectif comparé veut dire : la liste scolarisée du jour — le registre ne conserve pas les listes des
 * années closes — augmentée des élèves qui en sont sortis mais ont donné lieu à une pièce pour l'année lue.
 */
function subtitle(etat: EtatFraisEcole) {
  const sortis = etat.horsEffectif > 0 ? ` + ${entier(etat.horsEffectif)} sorti${etat.horsEffectif > 1 ? "s" : ""} de la liste du jour avec une pièce` : "";
  return `${etat.etablissement} · année ${etat.anneeScolaire} · ${entier(etat.effectif)} élèves scolarisés aujourd'hui${sortis}, comparés au ${dateCourte(etat.jour)}`;
}

/* ------------------------------------------------------------------ Appel déclaré */

function AppelDeAnnee({ etat }: { etat: EtatFraisEcole }) {
  if (!etat.cadence) {
    return (
      <Card className="min-w-0">
        <CardHeader icon={CalendarPlus} title="Appel de l'année" subtitle="Les termes que l'école dit appeler, et à quelle date" />
        <EtatVide icone={FileText} titre="Aucun appel déclaré" texte="Sans déclaration, les pièces consignées restent visibles, mais l'école ne peut pas les comparer à son effectif terme par terme." />
      </Card>
    );
  }
  return (
    <Card className="min-w-0">
      <CardHeader icon={CalendarPlus} title="Appel de l'année" subtitle={`Déclaré le ${dateCourte(etat.cadence.declareeLe)}${etat.cadence.referenceDeliberation ? ` · délibération ${etat.cadence.referenceDeliberation}` : ""}`} />
      <p className="mb-4 rounded-md bg-surface-2/60 px-3 py-2.5 text-[13px] text-ink-2">{etat.cadence.cadre}</p>
      {etat.parTerme.length === 0 ? (
        <p className="text-[13px] text-ink-2">La déclaration ne porte aucun terme.</p>
      ) : (
        <ul className="space-y-3">
          {etat.parTerme.map((t) => {
            const pieces = t.couvertes + t.exonerees;
            return (
              <li key={t.terme} className="rounded-lg border border-line/70 px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{t.libelle} <span className="font-normal text-ink-muted">· exigible le {dateCourte(t.exigibleLe)}</span></p>
                  <p className="text-xs tabular-nums text-ink-2">{entier(pieces)} pièce{pieces > 1 ? "s" : ""} sur {entier(etat.effectif)} élèves</p>
                </div>
                <Jauge valeur={pieces} max={Math.max(etat.effectif, 1)} className="mt-2" />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge ton="succes">{entier(t.couvertes)} quittance{t.couvertes > 1 ? "s" : ""}</Badge>
                  {t.exonerees > 0 && <Badge ton="info">{entier(t.exonerees)} exonération{t.exonerees > 1 ? "s" : ""}</Badge>}
                  {t.attendues > 0 && <Badge ton="avertissement">{entier(t.attendues)} sans pièce à ce jour</Badge>}
                  {t.aVenir > 0 && <Badge ton="neutre">{entier(t.aVenir)} avant l&apos;échéance</Badge>}
                  {pieces + t.attendues + t.aVenir === 0 && <Badge ton="neutre">aucune trace pour ce terme</Badge>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ Réclamations des familles */

/**
 * « J'ai payé, rien n'est enregistré » : la seule voie par laquelle une famille peut contester une pièce absente
 * du registre. La réponse se rend en deux temps — consigner la pièce, puis statuer — parce que l'API refuse une
 * validation sans trace au registre. C'est ce verrou qui fait de la réclamation la boucle du rapprochement, et
 * non une promesse de paiement ni une boîte aux lettres.
 */
/**
 * Le jour béninois d'un horodatage ISO : la même dérive d'une heure que `jourLocal()` côté API. Le retard d'une
 * réclamation se juge contre la date rendue par le serveur, jamais contre l'horloge du poste — un poste réglé à
 * l'heure GMT accuserait l'école de retard le matin même, et l'écran contredirait la demande écrite.
 */
const jourBenin = (iso: string) => new Date(new Date(iso).getTime() + 3_600_000).toISOString().slice(0, 10);

function Reclamations({ etat }: { etat: EtatFraisEcole }) {
  const [piece, setPiece] = useState<ReclamationFrais | null>(null);
  const [reponse, setReponse] = useState<{ r: ReclamationFrais; decision: "valide" | "refuse" } | null>(null);
  const vivante = (r: ReclamationFrais) => r.statut === "ouverte" || r.statut === "en_cours";
  const vivantes = etat.reclamations.filter(vivante);
  const traitees = etat.reclamations.filter((r) => !vivante(r));
  const enRetard = vivantes.filter((r) => r.echeance !== null && jourBenin(r.echeance) < etat.jour);

  return (
    <Card className="min-w-0">
      <CardHeader icon={Inbox} title="Réclamations des familles"
        subtitle={vivantes.length
          ? `${entier(vivantes.length)} à instruire${enRetard.length ? ` · ${entier(enRetard.length)} au-delà des 7 jours annoncés` : ""}`
          : "Aucune réclamation en attente de réponse"}
        action={traitees.length ? <Badge ton="neutre">{entier(traitees.length)} déjà traitée{traitees.length > 1 ? "s" : ""}</Badge> : undefined} />
      {etat.reclamations.length === 0 ? (
        <EtatVide icone={Inbox} titre="Aucune famille ne signale de pièce manquante"
          texte="Une famille peut écrire depuis son espace qu'elle a payé alors que rien n'est consigné ici. Sa réclamation arrive sur cet écran, avec une réponse annoncée sous 7 jours." />
      ) : (
        <>
          {enRetard.length > 0 && (
            <p className="mb-4 flex items-start gap-2 rounded-md bg-warning-bg px-3 py-2.5 text-[13px] text-warning">
              <Clock size={15} className="mt-0.5 shrink-0" aria-hidden />
              {entier(enRetard.length)} réclamation{enRetard.length > 1 ? "s" : ""} a{enRetard.length > 1 ? "ont" : ""} dépassé le délai de réponse annoncé à la famille. Ce délai n&apos;a rien
              suspendu — ni bulletin, ni examen, ni appel en classe : c&apos;est une promesse d&apos;écrit, pas de silence.
            </p>
          )}
          <ul className="divide-y divide-line">
            {[...vivantes, ...traitees].map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-ink">{r.nomApprenant ?? r.apprenantId ?? "Élève non nommé"}</p>
                    <p className="mt-0.5 text-[13px] text-ink-2">{r.terme ? LIBELLE_TERME_FRAIS[r.terme] : "Toute l&apos;année"} · déposée le {dateCourte(r.deposeeLe)}</p>
                    <p className="mt-1.5 text-[13px] text-ink-2">« {r.texte} »</p>
                    {r.reponse && (
                      <p className="mt-1.5 text-[13px] text-ink-2">
                        <span className="text-ink-muted">Réponse rendue le {dateCourte(r.reponse.le)} — {r.reponse.decision === "valide" ? "pièce reconnue" : "refus"} : </span>
                        {r.reponse.motif || "sans motif écrit"}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Badge ton={TON_RECLAMATION[r.statut]}>{LIBELLE_STATUT_RECLAMATION[r.statut]}</Badge>
                    {vivante(r) && (
                      <>
                        <div className="flex flex-wrap justify-end gap-2">
                          {r.apprenantId && <Button taille="sm" variante="secondaire" icone={Receipt} onClick={() => setPiece(r)}>Consigner la pièce</Button>}
                          <Button taille="sm" variante="valider" icone={CheckCircle2} onClick={() => setReponse({ r, decision: "valide" })}>Pièce reconnue</Button>
                          <Button taille="sm" variante="fantome" icone={XCircle} onClick={() => setReponse({ r, decision: "refuse" })}>Refuser</Button>
                        </div>
                        {r.echeance && <p className="text-xs text-ink-muted">Réponse attendue avant le {dateCourte(r.echeance)}</p>}
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {piece?.apprenantId && (
        <DialogueQuittance apprenantId={piece.apprenantId} eleve={piece.nomApprenant ?? piece.apprenantId} annee={etat.anneeScolaire!} jour={etat.jour}
          termes={etat.cadence?.termes ?? []} fermer={() => setPiece(null)} />
      )}
      {reponse && <DialogueReponse r={reponse.r} decision={reponse.decision} fermer={() => setReponse(null)} />}
    </Card>
  );
}

/**
 * La réponse part telle quelle en notification à la famille : c'est pourquoi elle est obligatoire, écrite, et
 * refusée si elle porte une somme. Reconnaître sans pièce au registre est impossible — l'API le vérifie.
 */
function DialogueReponse({ r, decision, fermer }: { r: ReclamationFrais; decision: "valide" | "refuse"; fermer: () => void }) {
  const m = useStatuerReclamationMutation();
  const [motif, setMotif] = useState("");
  const pret = motif.trim().length >= 10;

  const envoyer = () => m.mutate({ id: r.id, decision, motif: motif.trim() }, {
    onSuccess: () => {
      notifier(decision === "valide"
        ? { ton: "succes", titre: "Réclamation close — pièce reconnue", texte: `${r.nomApprenant ?? "La famille"} en est notifié. La trace reste la quittance consignée : rien n'a été encaissé ici.` }
        : { ton: "info", titre: "Réponse écrite envoyée à la famille", texte: "Le refus est motivé et notifié. Il ne suspend rien : ni bulletin, ni examen, ni appel en classe." });
      fermer();
    },
  });

  return (
    <Dialogue ouvert onFermer={() => { if (!m.isPending) fermer(); }} icone={decision === "valide" ? CheckCircle2 : XCircle} ton={decision === "valide" ? "succes" : "danger"}
      titre={decision === "valide" ? "Reconnaître la pièce consignée" : "Refuser, en motivant par écrit"}
      description={`${r.nomApprenant ?? "Réclamation"} · ${r.terme ? LIBELLE_TERME_FRAIS[r.terme] : "toute l'année"} · déposée le ${dateCourte(r.deposeeLe)}`}
      pied={<>
        <Button variante="secondaire" onClick={fermer} disabled={m.isPending}>Annuler</Button>
        <Button variante={decision === "valide" ? "valider" : "danger"} disabled={!pret} chargement={m.isPending} onClick={envoyer}>Envoyer la réponse</Button>
      </>}>
      <div className="space-y-4">
        <p className="rounded-md bg-surface-2/60 px-3 py-2.5 text-[13px] text-ink-2">Ce que la famille a écrit : « {r.texte} »</p>
        <p className={cn("rounded-md px-3 py-2.5 text-[13px]", decision === "valide" ? "bg-success-bg text-success" : "bg-critical-bg text-critical")}>
          {decision === "valide"
            ? "Reconnaître suppose la pièce déjà au registre : sans quittance ni exonération consignée pour cet élève et cette année, la réponse est refusée. Consignez-la d'abord."
            : "Le refus est écrit, motivé et notifié à la famille telle quelle. Il ne suspend rien, et la plateforme ne prévoit pas encore de recours au-dessus de l'établissement : le motif écrit est ce qui reste à la famille."}
        </p>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Réponse adressée à la famille</span>
          <textarea value={motif} onChange={(e) => setMotif(e.target.value.slice(0, 500))} rows={3}
            placeholder={decision === "valide" ? "Ex. : quittance retrouvée dans le cahier de l'intendance et consignée ce jour" : "Ex. : aucune pièce portant cette référence n'a été délivrée par l'établissement pour cette année"}
            className={cn(classeChamp, "h-auto py-2.5")} />
          <span className={cn("mt-1 block text-xs", motif.trim() && motif.trim().length < 10 ? "text-critical" : "text-ink-muted")}>
            {motif.trim() && motif.trim().length < 10 ? "Au moins 10 caractères." : `${motif.length}/500 caractères · ni somme ni devise`}
          </span>
        </label>
        {m.error instanceof ErreurApi && <p role="alert" className="text-xs text-critical">{m.error.message}</p>}
      </div>
    </Dialogue>
  );
}

/* ------------------------------------------------------------------ État par apprenant */

function ParApprenant({ etat, recherche, setRecherche }: { etat: EtatFraisEcole; recherche: string; setRecherche: (v: string) => void }) {
  const lignes = etat.lignes;
  // Une réclamation vivante signalée sur la ligne de l'élève : c'est là que l'école consigne la pièce qui la
  // clos, et le lien entre les deux doit rester visible sans repasser par le panneau ci-dessus.
  const vivantes = new Map(etat.reclamations.filter((r) => r.statut === "ouverte" || r.statut === "en_cours").map((r) => [r.apprenantId, r]));
  return (
    <Card className="min-w-0">
      <CardHeader icon={Wallet} title="État par apprenant" subtitle="Les élèves sans pièce sur un terme exigible viennent en tête"
        action={<ChampRecherche valeur={recherche} onChange={setRecherche} label="Rechercher un apprenant" placeholder="Nom de l'élève" className="w-full sm:w-64" />} />
      {!etat.cadence && (
        <p className="mb-4 flex items-start gap-2 rounded-md bg-warning-bg px-3 py-2.5 text-[13px] text-warning">
          <FileText size={15} className="mt-0.5 shrink-0" aria-hidden />
          Aucun appel déclaré pour {etat.anneeScolaire} : les lignes montrent les pièces déjà consignées, et l&apos;absence de pièce n&apos;est
          pas une dette — un terme que l&apos;école n&apos;a pas appelé ne peut être exigible de personne.
        </p>
      )}
      {lignes.length === 0 ? (
        <EtatVide icone={recherche ? Wallet : FileText} titre={recherche ? "Aucun apprenant trouvé" : "Aucun apprenant scolarisé"}
          texte={recherche ? `Aucun nom ne correspond à « ${recherche} » dans la liste de ${etat.etablissement}.` : "Aucun élève scolarisé aujourd'hui, et aucune pièce consignée pour cette année."} />
      ) : (
        <ul className="divide-y divide-line">
          {lignes.map((l) => <LigneEleve key={l.apprenantId} l={l} annee={etat.anneeScolaire!} jour={etat.jour} termes={etat.cadence?.termes ?? []} reclamation={vivantes.get(l.apprenantId) ?? null} />)}
        </ul>
      )}
      {etat.tronque && (
        <p className="mt-3 text-xs text-ink-muted">
          {entier(lignes.length)} ligne{lignes.length > 1 ? "s" : ""} affichée{lignes.length > 1 ? "s" : ""} sur {entier(etat.trouves)}
          {recherche.trim() ? "" : " de l'effectif complet"}. La recherche filtre la liste sur toute l&apos;école : les comptes ci-dessus restent, eux, calculés sur l&apos;effectif entier.
        </p>
      )}
    </Card>
  );
}

function LigneEleve({ l, annee, jour, termes, reclamation }: { l: LigneFraisEcole; annee: string; jour: string; termes: { terme: FraisTerme }[]; reclamation: ReclamationFrais | null }) {
  const [fenetre, setFenetre] = useState<"quittance" | "exoneration" | null>(null);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-ink">{l.nom}</p>
          <p className="mt-0.5 text-[13px] text-ink-2">{l.classe ?? (l.horsEffectif ? "sorti de la liste du jour" : "classe non renseignée")} · {annee}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-1.5">
            <Badge ton={TON_STATUT_FRAIS[l.statut]}>{LIBELLE_STATUT_FRAIS[l.statut]}</Badge>
            {reclamation && <Badge ton="avertissement" icone={Inbox}>La famille signale une pièce payée</Badge>}
          </div>
          <div className="flex gap-2">
            <Button taille="sm" variante="secondaire" icone={Receipt} onClick={() => setFenetre("quittance")}>Quittance</Button>
            <Button taille="sm" variante="fantome" icone={ShieldCheck} onClick={() => setFenetre("exoneration")}>Exonération</Button>
          </div>
        </div>
      </div>
      {l.termes.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {l.termes.map((t) => (
            <li key={t.terme} className="text-xs text-ink-2">
              <span className="text-ink-muted">{LIBELLE_TERME_FRAIS[t.terme]} : </span>
              <span className={cn("font-medium", t.etat === "attendu" ? "text-warning" : t.etat === "paye" ? "text-success" : "text-ink-2")}>{LIBELLE_ETAT_TERME[t.etat]}</span>
              {t.quittance && <span className="text-ink-muted"> · réf. {t.quittance.reference}</span>}
              {t.mesure && <span className="text-ink-muted"> · {t.mesure.nature === "prise_en_charge" ? "prise en charge" : "exonération"}</span>}
            </li>
          ))}
        </ul>
      )}
      {fenetre === "quittance" && <DialogueQuittance apprenantId={l.apprenantId} eleve={l.nom} annee={annee} jour={jour} termes={termes} fermer={() => setFenetre(null)} />}
      {fenetre === "exoneration" && <DialogueExoneration apprenantId={l.apprenantId} eleve={l.nom} annee={annee} jour={jour} termes={termes} fermer={() => setFenetre(null)} />}
    </li>
  );
}

/* ------------------------------------------------------------------ Déclaration d'appel */

function DialogueCadence({ id, etat, fermer }: { id: string; etat: EtatFraisEcole; fermer: () => void }) {
  const m = useCadenceMutation(id);
  const [anneeScolaire, setAnneeScolaire] = useState(etat.anneeScolaire ?? "");
  const [termes, setTermes] = useState<{ terme: FraisTerme; exigibleLe: string }[]>(etat.cadence?.termes ?? [{ terme: "T1", exigibleLe: "" }]);
  const [cadre, setCadre] = useState(etat.cadence?.cadre ?? "");
  const [deliberation, setDeliberation] = useState(etat.cadence?.referenceDeliberation ?? "");
  const dublons = new Set(termes.map((t) => t.terme)).size !== termes.length;
  const datesCompletes = termes.every((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.exigibleLe));
  const pret = /^\d{4}-\d{4}$/.test(anneeScolaire) && termes.length >= 1 && !dublons && datesCompletes && cadre.trim().length >= 10;

  const envoyer = () => m.mutate({ anneeScolaire, termes, cadre: cadre.trim(), referenceDeliberation: deliberation.trim() || null }, {
    onSuccess: (r) => {
      notifier({
        ton: "succes", titre: "Appel de l'année enregistré",
        texte: r.remplace ? `La déclaration précédente de ${anneeScolaire} reste au registre ; c'est celle-ci qui s'affiche.`
          : `${anneeScolaire} : ${termes.length} terme${termes.length > 1 ? "s" : ""} appelé${termes.length > 1 ? "s" : ""}, sans aucun montant.`,
      });
      fermer();
    },
  });

  return (
    <Dialogue ouvert onFermer={() => { if (!m.isPending) fermer(); }} large titre={etat.cadence ? "Modifier l'appel de l'année" : "Déclarer l'appel de l'année"}
      description="Des termes et des dates. La grille tarifaire reste celle de votre école : BEILE ne la transporte pas et ne la contraint pas."
      pied={<>
        <Button variante="secondaire" onClick={fermer} disabled={m.isPending}>Annuler</Button>
        <Button disabled={!pret} chargement={m.isPending} onClick={envoyer}>Enregistrer l&apos;appel</Button>
      </>}>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Année scolaire</span>
          {etat.annees.length ? (
            <select value={anneeScolaire} onChange={(e) => setAnneeScolaire(e.target.value)} className={cn(classeSelect, "w-full")}>
              {etat.annees.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          ) : (
            <input value={anneeScolaire} onChange={(e) => setAnneeScolaire(e.target.value.slice(0, 9))} placeholder="2026-2027" className={cn(classeChamp, "tabular-nums")} />
          )}
        </label>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink">Termes appelés (jusqu&apos;à quatre)</span>
          <ul className="space-y-2">
            {termes.map((t, i) => (
              <li key={i} className="flex items-center gap-2">
                <select value={t.terme} onChange={(e) => setTermes((x) => x.map((y, j) => (j === i ? { ...y, terme: e.target.value as FraisTerme } : y)))} className={classeSelect} aria-label={`Terme ${i + 1}`}>
                  {TERMES_FRAIS.map((x) => <option key={x} value={x}>{LIBELLE_TERME_FRAIS[x]}</option>)}
                </select>
                <input type="date" value={t.exigibleLe} onChange={(e) => setTermes((x) => x.map((y, j) => (j === i ? { ...y, exigibleLe: e.target.value } : y)))}
                  className={cn(classeChamp, "flex-1")} aria-label={`Date d'exigibilité — terme ${i + 1}`} />
                <button type="button" onClick={() => setTermes((x) => x.filter((_, j) => j !== i))} disabled={termes.length === 1}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink disabled:opacity-40"
                  aria-label={`Retirer le terme ${i + 1}`}><XCircle size={16} aria-hidden /></button>
              </li>
            ))}
          </ul>
          {!datesCompletes && <p className="mt-1 text-xs text-critical">Chaque terme appelle une date d&apos;exigibilité.</p>}
          {dublons && <p className="mt-1 text-xs text-critical">Un même terme ne peut pas être appelé deux fois dans l&apos;année.</p>}
          {termes.length < 4 && (
            <Button taille="sm" variante="fantome" className="mt-2" icone={CalendarPlus}
              onClick={() => setTermes((x) => [...x, { terme: TERMES_FRAIS[x.length] ?? "ANNEE", exigibleLe: "" }])}>Ajouter un terme</Button>
          )}
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Cadre de l&apos;appel</span>
          <textarea value={cadre} onChange={(e) => setCadre(e.target.value.slice(0, 400))} rows={3}
            placeholder="Ex. : trois termes d'appel votés en conseil d'établissement, recouvrement à l'intendance" className={cn(classeChamp, "h-auto py-2.5")} />
          <span className={cn("mt-1 block text-xs", cadre.trim() && cadre.trim().length < 10 ? "text-critical" : "text-ink-muted")}>
            {cadre.trim() && cadre.trim().length < 10 ? "Au moins 10 caractères." : `${cadre.length}/400 caractères`}
          </span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Référence de délibération <span className="font-normal text-ink-muted">(facultatif)</span></span>
          <input value={deliberation} onChange={(e) => setDeliberation(e.target.value.slice(0, 120))} placeholder="Ex. : PV n°3 du conseil d'établissement du 12/10/2026" className={classeChamp} />
        </label>
        {m.error instanceof ErreurApi && <p role="alert" className="text-xs text-critical">{m.error.message}</p>}
      </div>
    </Dialogue>
  );
}

/* ------------------------------------------------------------------ Consigner une quittance */

function DialogueQuittance({ apprenantId, eleve, annee, jour, termes, fermer }: { apprenantId: string; eleve: string; annee: string; jour: string; termes: { terme: FraisTerme }[]; fermer: () => void }) {
  const m = useQuittanceMutation(apprenantId);
  const [terme, setTerme] = useState<FraisTerme>(termes[0]?.terme ?? "T1");
  const [delivreeLe, setDelivreeLe] = useState("");
  const [reference, setReference] = useState("");
  const [qualite, setQualite] = useState<QualiteAgentEncaisseur>("intendance");
  const [agent, setAgent] = useState("");
  const agentRequis = qualite === "autre" && agent.trim().length < 3;
  const pret = /^\d{4}-\d{2}-\d{2}$/.test(delivreeLe) && delivreeLe <= jour && reference.trim().length >= 3 && !agentRequis;
  const appeles = termes.length ? termes.map((t) => t.terme) : TERMES_FRAIS;

  const envoyer = () => m.mutate({ anneeScolaire: annee, terme, delivreeLe, referenceQuittance: reference.trim(), qualiteAgent: qualite, agent: agent.trim() || null }, {
    onSuccess: (r) => {
      notifier(r.alerte
        ? { ton: "avertissement", titre: "Pièce enregistrée, référence déjà utilisée", texte: "Cette référence figure déjà pour un autre élève de l'école cette année. La vigie en est saisie : vérifiez la pièce d'origine." }
        : { ton: "succes", titre: r.deja ? "Cette pièce était déjà consignée" : "Quittance enregistrée", texte: `${eleve} · ${LIBELLE_TERME_FRAIS[terme]} · référence ${reference.trim()}. La trace part en notification au responsable légal dont le lien de filiation est vérifié au registre.` });
      fermer();
    },
  });

  return (
    <Dialogue ouvert onFermer={() => { if (!m.isPending) fermer(); }} icone={Receipt} titre="Enregistrer une quittance" description={`${eleve} · ${annee}`}
      pied={<>
        <Button variante="secondaire" onClick={fermer} disabled={m.isPending}>Annuler</Button>
        <Button disabled={!pret} chargement={m.isPending} onClick={envoyer}>Enregistrer la pièce</Button>
      </>}>
      <div className="space-y-4">
        <p className="rounded-md bg-surface-2/60 px-3 py-2.5 text-[13px] text-ink-2">Rien n&apos;est encaissé ici : vous consignez une pièce déjà délivrée. Ne saisissez ni montant, ni mode de paiement.</p>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Terme</span>
          <select value={terme} onChange={(e) => setTerme(e.target.value as FraisTerme)} className={cn(classeSelect, "w-full")}>
            {TERMES_FRAIS.filter((t) => appeles.includes(t)).map((t) => <option key={t} value={t}>{LIBELLE_TERME_FRAIS[t]}</option>)}
          </select>
          {termes.length === 0 && <p className="mt-1 text-xs text-ink-muted">Aucun appel déclaré : la pièce se consigne librement pour l&apos;année.</p>}
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Délivrée le</span>
            <input type="date" max={jour} value={delivreeLe} onChange={(e) => setDelivreeLe(e.target.value)} className={classeChamp} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Référence de la quittance</span>
            <input value={reference} onChange={(e) => setReference(e.target.value.slice(0, 60))} placeholder="Numéro porté sur la pièce" className={cn(classeChamp, "tabular-nums")} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Qualité de l&apos;agent qui a délivré la pièce</span>
          <select value={qualite} onChange={(e) => setQualite(e.target.value as QualiteAgentEncaisseur)} className={cn(classeSelect, "w-full")}>
            {QUALITES_AGENT.map((x) => <option key={x} value={x}>{LIBELLE_AGENT_ENCAISSEUR[x]}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Agent <span className="font-normal text-ink-muted">{qualite === "autre" ? "(fonction obligatoire)" : "(facultatif)"}</span></span>
          <input value={agent} onChange={(e) => setAgent(e.target.value.slice(0, 80))} placeholder="Ex. : l'intendant de l'établissement" className={classeChamp} />
          {agentRequis && <span className="mt-1 block text-xs text-critical">Précisez la fonction de l&apos;agent.</span>}
        </label>
        {m.error instanceof ErreurApi && <p role="alert" className="text-xs text-critical">{m.error.message}</p>}
      </div>
    </Dialogue>
  );
}

/* ------------------------------------------------------------------ Exonération, prise en charge */

function DialogueExoneration({ apprenantId, eleve, annee, jour, termes, fermer }: { apprenantId: string; eleve: string; annee: string; jour: string; termes: { terme: FraisTerme }[]; fermer: () => void }) {
  const m = useExonerationMutation(apprenantId);
  const [nature, setNature] = useState<"exoneration" | "prise_en_charge">("exoneration");
  const [terme, setTerme] = useState<FraisTerme | "">("");
  const [motif, setMotif] = useState("");
  const [autorite, setAutorite] = useState("");
  const [texte, setTexte] = useState("");
  const [decideLe, setDecideLe] = useState("");
  const pret = motif.trim().length >= 5 && autorite.trim().length >= 3 && /^\d{4}-\d{2}-\d{2}$/.test(decideLe) && decideLe <= jour;

  const envoyer = () => m.mutate({
    anneeScolaire: annee, terme: terme || null, nature, motif: motif.trim(), autorite: autorite.trim(), referenceTexte: texte.trim() || null, decideLe,
  }, {
    onSuccess: () => {
      notifier({
        ton: "succes", titre: nature === "prise_en_charge" ? "Prise en charge enregistrée" : "Exonération enregistrée",
        texte: `${eleve} · ${terme ? LIBELLE_TERME_FRAIS[terme] : "toute l'année"} : la décision est consignée, elle remplace la pièce attendue à l'écran de l'école comme à celui de la famille.`,
      });
      fermer();
    },
  });

  return (
    <Dialogue ouvert onFermer={() => { if (!m.isPending) fermer(); }} icone={ShieldCheck} ton="succes" titre="Exonération ou prise en charge" description={`${eleve} · ${annee}`}
      pied={<>
        <Button variante="secondaire" onClick={fermer} disabled={m.isPending}>Annuler</Button>
        <Button disabled={!pret} chargement={m.isPending} onClick={envoyer}>Enregistrer la décision</Button>
      </>}>
      <div className="space-y-4">
        <p className="rounded-md bg-surface-2/60 px-3 py-2.5 text-[13px] text-ink-2">Un statut légitime, pas une anomalie : c&apos;est ainsi que la gratuité des filles dans le secondaire public se consigne.</p>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">Nature</legend>
          <div className="flex flex-wrap gap-2">
            {(["exoneration", "prise_en_charge"] as const).map((x) => (
              <button key={x} type="button" onClick={() => setNature(x)} aria-pressed={nature === x}
                className={cn("h-10 rounded-md px-3.5 text-[13px] font-medium ring-1 ring-inset transition active:scale-[0.97]", nature === x ? "bg-navy text-white ring-transparent" : "bg-surface text-ink-2 ring-line hover:bg-surface-2")}>
                {x === "exoneration" ? "Exonération" : "Prise en charge par un tiers"}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Portée</span>
          <select value={terme} onChange={(e) => setTerme(e.target.value as FraisTerme | "")} className={cn(classeSelect, "w-full")}>
            <option value="">Toute l&apos;année</option>
            {(termes.length ? termes.map((t) => t.terme) : TERMES_FRAIS).map((t) => <option key={t} value={t}>{LIBELLE_TERME_FRAIS[t]}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Motif</span>
          <textarea value={motif} onChange={(e) => setMotif(e.target.value.slice(0, 300))} rows={2}
            placeholder="Ex. : fille scolarisée dans le secondaire public — décision du 3 juin 2026" className={cn(classeChamp, "h-auto py-2.5")} />
          <span className={cn("mt-1 block text-xs", motif.trim() && motif.trim().length < 5 ? "text-critical" : "text-ink-muted")}>
            {motif.trim() && motif.trim().length < 5 ? "Au moins 5 caractères." : `${motif.length}/300 caractères`}
          </span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Autorité qui décide</span>
            <input value={autorite} onChange={(e) => setAutorite(e.target.value.slice(0, 120))} placeholder="Ex. : conseil d'établissement" className={classeChamp} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Décidée le</span>
            <input type="date" max={jour} value={decideLe} onChange={(e) => setDecideLe(e.target.value)} className={classeChamp} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Texte de référence <span className="font-normal text-ink-muted">(facultatif)</span></span>
          <input value={texte} onChange={(e) => setTexte(e.target.value.slice(0, 160))} placeholder="Ex. : note de service n°012 du 10/09/2026" className={classeChamp} />
        </label>
        {m.error instanceof ErreurApi && <p role="alert" className="text-xs text-critical">{m.error.message}</p>}
      </div>
    </Dialogue>
  );
}
