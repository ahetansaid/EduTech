"use client";

import type { TypeActe } from "@beile/contracts";
import { LIBELLE_ACTE, LIBELLE_AUTORITE, LIBELLE_STATUT_COMPTE, StatutCompte, TypeActe as TypeActeSchema, TypeDecisionAllocation } from "@beile/contracts";
import { Building2, CalendarClock, Download, Info, Lock, Scale, ScrollText, Stamp, Wallet } from "lucide-react";
import { useState } from "react";
import { TableauDonnees } from "@/components/charts/Graphiques";
import { Cascade, Compteur, Element, EntreePage } from "@/components/motion";
import { notifier } from "@/components/ui/Notifications";
import { TuileIndicateur } from "@/components/ui/donnees";
import { Badge, Button, Card, CardHeader, EtatVide, PageHeader, Squelette } from "@/components/ui/primitives";
import {
  LIBELLE_AUTORITE_ALLOCATION, LIBELLE_TYPE_DECISION,
  useDeclencheurEcheanceMutation, useDecisionEtatMutation, useDelaisNationaux, useEcheances, useEffectifsAllocations, useStaterAllocationMutation,
} from "@/lib/api/guichet";
import { classeChamp, classeSelect, EtatErreur } from "../../etablissement/_composants";
import { cn } from "@/lib/cn";
import { exporterCsv, type Colonne } from "@/lib/export";
import { date, entier } from "@/lib/format";
import { ErreurApi } from "@/lib/http";
import { useProfil, useRoles } from "@/lib/session";
import { OngletsESup } from "../_Onglets";

/** Un délai national sous dix demandes devient un annuaire : le seuil est celui de la convention nationale. */
const SEUIL_PUBLICATION = 10;

/** Les mêmes rôles que la porte API : un écran qui propose une donnée que le serveur refuserait serait un mensonge. */
const PILOTAGE = ["administration_centrale", "direction_departementale", "inspecteur", "chercheur"] as const;

/** Comparateur national des délais de délivrance, calendrier des dépôts et effet des allocations. */
export default function GuichetNational() {
  const roles = useRoles();
  const profil = useProfil();
  const pilotage = roles.some((r) => (PILOTAGE as readonly string[]).includes(r));
  /** La porte d'écriture exige l'habilitation centrale ET nationale : les formulaires se montrent sous cette condition seule. */
  const admin = profil.habilitations.some((h) => h.role === "administration_centrale" && h.perimetre.niveau === "national");
  const delais = useDelaisNationaux(pilotage);
  const [annee, setAnnee] = useState("");
  const effectifs = useEffectifsAllocations(annee || null, pilotage);

  const lignes = delais.data ?? [];
  const totaux = (() => {
    const demandes = lignes.reduce((s, l) => s + l.demandes, 0);
    const remises = lignes.reduce((s, l) => s + l.remises, 0);
    const dansDelai = lignes.reduce((s, l) => s + l.dansDelai, 0);
    const ponderees = lignes.filter((l) => l.medianeJours !== null);
    const mediane = ponderees.length
      ? Math.round(ponderees.reduce((s, l) => s + (l.medianeJours ?? 0) * l.demandes, 0) / (ponderees.reduce((s, l) => s + l.demandes, 0) || 1))
      : null;
    return { demandes, remises, dansDelai, mediane, unites: new Set(lignes.map((l) => l.etablissementId)).size };
  })();

  const COLONNES: Colonne<(typeof lignes)[number]>[] = [
    { entete: "Établissement", valeur: (l) => l.etablissementNom ?? l.etablissementId },
    { entete: "Acte", valeur: (l) => LIBELLE_ACTE[l.typeActe] },
    { entete: "Autorité signataire", valeur: (l) => LIBELLE_AUTORITE[l.autorite] },
    { entete: "Barème (jours)", valeur: (l) => l.delaiContractuelJours },
    { entete: "Demandes", valeur: (l) => l.demandes },
    { entete: "Remises", valeur: (l) => l.remises },
    { entete: "Remises dans le barème", valeur: (l) => l.dansDelai },
    { entete: "Médiane constatée (jours)", valeur: (l) => (l.medianeJours === null ? "" : l.medianeJours) },
    { entete: "Sous le seuil de publication", valeur: (l) => (l.petiteUnite ? "oui" : "non") },
  ];

  return (
    <EntreePage>
      <div className="space-y-5">
        <PageHeader
          surtitre="Enseignement supérieur"
          titre="Guichet & délais de délivrance"
          sousTitre="Ce que le parcours administratif coûte aux étudiants : le délai réellement constaté entre le dépôt d'une demande et la mise à disposition de l'acte, par établissement et par autorité signataire."
          actions={pilotage && <Button variante="secondaire" taille="sm" icone={Download} disabled={!lignes.length} onClick={() => exporterCsv("delais_delivrance_superieur", lignes, COLONNES, `BEILE — délais constatés par médiane, jamais par moyenne. Barème = délai annoncé par l'administration (fiches CatIS), mesuré ici. Export ${lignes.length} ligne(s) — ${date(new Date().toISOString())}.`)}>Exporter (CSV)</Button>}
        />

        <OngletsESup />

        {!pilotage ? (
          <Card>
            <EtatVide icone={Lock} titre="Comparateur réservé au pilotage" texte="Les délais agrégés de délivrance ne se lisent que sous une habilitation de pilotage (administration centrale, direction départementale, inspection, recherche). Un guichet d'établissement ne voit que ses propres demandes." />
          </Card>
        ) : (
          <>
            <div className="flex items-start gap-3 rounded-lg bg-info-bg px-4 py-3 text-[13px] text-info">
              <Info size={17} className="mt-0.5 shrink-0" aria-hidden />
              <p>Aucune ligne nominative ici : le périmètre de pilotage ne donne accès qu&apos;à des comptages et à des médianes, bornés aux communes de l&apos;agent. Sous <strong>{SEUIL_PUBLICATION} demandes</strong>, la ligne est signalée — un délai mesuré sur trois dossiers d&apos;une petite composante se lit comme un annuaire. Les délais de référence restent <strong>annoncés par l&apos;administration</strong> (fiches CatIS), mesurés par BEILE, jamais promis par elle.</p>
            </div>

            {delais.isPending ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Squelette key={i} className="h-[104px] rounded-lg" />)}</div> : delais.isError ? (
              <Card><EtatErreur erreur={delais.error} reessayer={() => delais.refetch()} /></Card>
            ) : (
              <>
                <Cascade className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Element><TuileIndicateur libelle="Demandes suivies" icone={Stamp} accent="bleu" valeur={<Compteur valeur={totaux.demandes} format={entier} />} indice={`${totaux.unites} unité(s) de délivrance`} /></Element>
                  <Element><TuileIndicateur libelle="Remises dans le barème" icone={Scale} accent="sarcelle" valeur={<Compteur valeur={totaux.dansDelai} format={entier} />} indice={`sur ${totaux.remises} remise(s) constatée(s)`} /></Element>
                  <Element><TuileIndicateur libelle="Médiane pondérée" icone={CalendarClock} accent={totaux.mediane !== null && totaux.mediane > 30 ? "critique" : "ambre"} valeur={totaux.mediane === null ? "—" : `${totaux.mediane} j`} indice="dépôt → mise à disposition" /></Element>
                  <Element><TuileIndicateur libelle="Allocataires décidés" icone={Wallet} accent="bleu" valeur={effectifs.data ? <Compteur valeur={effectifs.data.parStatut.reduce((s, l) => s + l.effectif, 0)} format={entier} /> : "—"} indice="statuts certifiés, aucun montant" /></Element>
                </Cascade>

                <Card data-guide="guichet-national-tableau" className="min-w-0 overflow-hidden p-0">
                  <CardHeader icon={Building2} title="Délais par établissement et par autorité" subtitle="Le barème jugé est celui qui courait au jour du dépôt : deux lignes peuvent coexister pour le même acte." />
                  {!lignes.length ? (
                    <div className="px-5 pb-5"><EtatVide icone={Scale} titre="Aucun dépôt enregistré dans votre périmètre" texte="Les demandes apparaîtront dès qu'un étudiant de votre territoire déposera une demande d'acte." /></div>
                  ) : (
                    <TableauDonnees
                      colonnes={["Établissement", "Acte", "Autorité signataire", "Barème", "Demandes", "Remises", "Dans le barème", "Médiane"]}
                      lignes={lignes.map((l) => [
                        <>{l.etablissementNom ?? l.etablissementId}{l.petiteUnite && <Badge ton="neutre" className="ml-2">sous {SEUIL_PUBLICATION}</Badge>}</>,
                        LIBELLE_ACTE[l.typeActe],
                        LIBELLE_AUTORITE[l.autorite],
                        `${l.delaiContractuelJours} j`,
                        `${l.demandes}`,
                        `${l.remises}`,
                        `${l.dansDelai}/${l.demandes}`,
                        l.medianeJours === null ? "—" : `${l.medianeJours} j`,
                      ])}
                    />
                  )}
                </Card>
              </>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              <Calendrier annee={annee} setAnnee={setAnnee} admin={admin} />
              <Allocations annee={annee} q={effectifs} admin={admin} />
            </div>

            {admin && <Scellement />}
          </>
        )}
      </div>
    </EntreePage>
  );
}

/* ------------------------------------------------------------------ Couche C : le calendrier national */

function Calendrier({ annee, setAnnee, admin }: { annee: string; setAnnee: (v: string) => void; admin: boolean }) {
  const q = useEcheances();
  const toutes = q.data ?? [];
  const annees = [...new Set(toutes.map((e) => e.anneeUniversitaire))].sort().reverse();
  const visibles = annee ? toutes.filter((e) => e.anneeUniversitaire === annee) : toutes;
  return (
    <Card data-guide="guichet-national-calendrier" className="min-w-0">
      <CardHeader icon={CalendarClock} title="Calendrier des dépôts d'un dossier d'allocation"
        subtitle="Une date d'administration n'est pas une constante de code : elle est déclarée par l'autorité compétente, et l'étudiant la lit sur son espace."
        action={<select value={annee} onChange={(e) => setAnnee(e.target.value)} className={classeSelect} aria-label="Filtrer par année universitaire">
          <option value="">Toutes les années</option>
          {annees.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>} />
      {q.isPending ? <Squelette className="mx-5 mb-5 h-40 rounded-lg" /> : q.isError ? <p className="px-5 pb-5 text-[13px] text-ink-2">{q.error.message}</p> : !visibles.length ? (
        <div className="px-5 pb-5"><EtatVide icone={CalendarClock} titre="Aucune échéance déclarée" texte={admin ? "Déclarez la date limite de dépôt : sans elle, aucun retard de dossier n'est imputable et l'étudiant lit « aucune échéance »." : "Tant que la DBAU n'a pas déclaré de date, les étudiants lisent « aucune échéance » plutôt qu'une date inventée."} /></div>
      ) : (
        <ul className="divide-y divide-line/60 border-y border-line/60">
          {visibles.map((e) => (
            <li key={e.id} className="px-5 py-3">
              <p className="text-sm font-medium text-ink">{e.intitule}</p>
              <p className="mt-0.5 text-xs text-ink-muted">{e.anneeUniversitaire} · {LIBELLE_TYPE_DECISION[e.typeDecision]} · limite le {date(e.dateLimite)} · {e.autorite === "dbau" ? "DBAU" : "MESRS"}</p>
              <p className="mt-1 text-[13px] text-ink-2">{e.actesExiges.length ? `Pièces exigées : ${e.actesExiges.map((t) => LIBELLE_ACTE[t]).join(", ")}` : "Aucune pièce exigée : échéance informative."}</p>
            </li>
          ))}
        </ul>
      )}
      {admin && <Declination anneeProposee={annee || annees[0] || ""} />}
    </Card>
  );
}

function Declination({ anneeProposee }: { anneeProposee: string }) {
  const [annee, setAnnee] = useState(anneeProposee);
  const [dateLimite, setDateLimite] = useState("");
  const [typeDecision, setTypeDecision] = useState<TypeDecisionAllocation>("renouvellement");
  const [intitule, setIntitule] = useState("");
  const [actes, setActes] = useState<TypeActe[]>(["attestation_de_scolarite"]);
  const declarer = useDeclencheurEcheanceMutation();
  const erreur = declarer.error instanceof ErreurApi ? declarer.error.message : null;
  const pret = /^\d{4}-\d{4}$/.test(annee) && !!dateLimite && intitule.trim().length >= 3;

  return (
    <form className="mx-5 mb-5 mt-4 space-y-3 rounded-lg border border-line bg-surface-2/40 p-4" onSubmit={(e) => {
      e.preventDefault();
      declarer.mutate({ anneeUniversitaire: annee, typeDecision, dateLimite, actesExiges: actes, autorite: "dbau", intitule: intitule.trim() }, {
        onSuccess: () => { notifier({ ton: "succes", titre: "Échéance déclarée", texte: "Les étudiants concernés la lisent désormais dans leur dossier." }); setIntitule(""); },
      });
    }}>
      <p className="text-sm font-medium text-ink">Déclarer une échéance</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="mb-1 block text-xs text-ink-muted">Année universitaire</span>
          <input value={annee} onChange={(e) => setAnnee(e.target.value.slice(0, 9))} placeholder="2026-2027" className={classeChamp} aria-label="Année universitaire" /></label>
        <label className="block"><span className="mb-1 block text-xs text-ink-muted">Date limite de dépôt</span>
          <input type="date" value={dateLimite} onChange={(e) => setDateLimite(e.target.value)} className={classeChamp} aria-label="Date limite de dépôt" /></label>
        <label className="block"><span className="mb-1 block text-xs text-ink-muted">Nature de la décision</span>
          <select value={typeDecision} onChange={(e) => setTypeDecision(e.target.value as TypeDecisionAllocation)} className={classeSelect} aria-label="Nature de la décision">
            {TypeDecisionAllocation.options.map((t) => <option key={t} value={t}>{LIBELLE_TYPE_DECISION[t]}</option>)}
          </select></label>
        <label className="block"><span className="mb-1 block text-xs text-ink-muted">Intitulé tel que publié</span>
          <input value={intitule} onChange={(e) => setIntitule(e.target.value.slice(0, 120))} placeholder="Dépôt des dossiers de renouvellement de bourse" className={classeChamp} aria-label="Intitulé de l'échéance" /></label>
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-xs text-ink-muted">Pièces exigées au titre de cette échéance</legend>
        <div className="flex flex-wrap gap-2">
          {TypeActeSchema.options.map((t) => {
            const coche = actes.includes(t);
            return (
              <button type="button" key={t} onClick={() => setActes(coche ? actes.filter((x) => x !== t) : [...actes, t])} aria-pressed={coche}
                className={cn("rounded-md border px-2.5 py-1 text-xs transition-colors", coche ? "border-blue bg-blue-soft text-accent-ink" : "border-line text-ink-2 hover:bg-surface-2")}>
                {LIBELLE_ACTE[t]}
              </button>
            );
          })}
        </div>
      </fieldset>
      {erreur && <p role="alert" className="rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">{erreur}</p>}
      <Button variante="primaire" taille="sm" type="submit" chargement={declarer.isPending} disabled={!pret}>Déclarer au registre</Button>
    </form>
  );
}

/* ------------------------------------------------------------------ Signature de l'État sur un acte */

/**
 * Sceller un acte dont la signature ne relève pas de l'établissement : diplôme (DEC), duplicata national
 * (DGES), allocation (DBAU). La référence suffit — c'est celle que l'étudiant lit sur son espace. Pas de
 * liste à parcourir : le national ne voit que des effectifs, et un bureau qui chercherait « qui attend
 * encore » n'a pas besoin d'un annuaire d'étudiants pour signer ce qu'on lui apporte.
 */
function Scellement() {
  const [reference, setReference] = useState("");
  const [refuser, setRefuser] = useState(false);
  const [motif, setMotif] = useState("");
  const sceller = useDecisionEtatMutation();
  const erreur = sceller.error instanceof ErreurApi ? sceller.error.message : null;
  const id = reference.trim().toUpperCase();
  const pret = /^ACTE-[A-Za-z0-9-]{8,}$/.test(id) && (!refuser || motif.trim().length >= 5);

  return (
    <Card data-guide="guichet-national-scellement" className="min-w-0">
      <CardHeader icon={ScrollText} title="Signer un acte qui ne relève pas de l'établissement"
        subtitle="Le guichet d'établissement prépare et remet ; un diplôme se signe à la DEC, un duplicata national à la DGES. Tant que l'autorité compétente n'a pas scellé l'acte, l'écran du guichet ne propose pas « prêt à retirer »." />
      <form className="mx-5 mb-5 space-y-3" onSubmit={(e) => {
        e.preventDefault();
        sceller.mutate({ demandeId: id, statut: refuser ? "refusee" : "disponible", ...(refuser ? { motif: motif.trim() } : {}) }, {
          onSuccess: (r) => notifier({
            ton: "succes", titre: refuser ? "Demande refusée" : "Acte scellé",
            texte: refuser ? `La demande ${r.acte.id} est refusée ; l'étudiant en lit le motif sur son espace.` : `${LIBELLE_ACTE[r.acte.typeActe]} scellé${r.acte.disponibleLe ? ` le ${date(r.acte.disponibleLe)}` : ""} — vérifiable publiquement sous la référence ${r.acte.id}.`,
          }),
        });
      }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-xs text-ink-muted">Référence de l'acte (ACTE-…)</span>
            <input value={reference} onChange={(e) => setReference(e.target.value.slice(0, 60))} placeholder="ACTE-0b1c…" className={cn(classeChamp, "font-mono")} aria-label="Référence de l'acte à signer" /></label>
          <label className="block"><span className="mb-1 block text-xs text-ink-muted">Décision</span>
            <select value={refuser ? "refusee" : "disponible"} onChange={(e) => setRefuser(e.target.value === "refusee")} className={classeSelect} aria-label="Décision de l'autorité">
              <option value="disponible">Sceller : prêt à retirer au guichet</option>
              <option value="refusee">Refuser, motif écrit</option>
            </select></label>
        </div>
        {refuser && (
          <label className="block"><span className="mb-1 block text-xs text-ink-muted">Motif du refus, lu par l'étudiant</span>
            <input value={motif} onChange={(e) => setMotif(e.target.value.slice(0, 200))} placeholder="Pièce manquante au dossier de l'année considérée" className={classeChamp} aria-label="Motif du refus" /></label>
        )}
        {erreur && <p role="alert" className="rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">{erreur}</p>}
        <Button variante="primaire" taille="sm" type="submit" chargement={sceller.isPending} disabled={!pret}>
          {refuser ? "Refuser au registre" : "Sceller au registre"}
        </Button>
      </form>
    </Card>
  );
}

/* ------------------------------------------------------------------ Couches B et C : effet des allocations */

function Allocations({ annee, q, admin }: { annee: string; q: ReturnType<typeof useEffectifsAllocations>; admin: boolean }) {
  const [apprenantId, setApprenantId] = useState("");
  const [anneeDecision, setAnneeDecision] = useState(annee);
  const [typeDecision, setTypeDecision] = useState<TypeDecisionAllocation>("attribution");
  const [statut, setStatut] = useState<StatutCompte>("boursier_integral");
  const [reference, setReference] = useState("");
  const [motif, setMotif] = useState("");
  const statuer = useStaterAllocationMutation();
  const erreur = statuer.error instanceof ErreurApi ? statuer.error.message : null;
  const pret = /^APP-\d{6}$/.test(apprenantId) && /^\d{4}-\d{4}$/.test(anneeDecision) && (typeDecision === "secours") === (statut === "secours");

  return (
    <Card data-guide="guichet-national-allocations" className="min-w-0">
      <CardHeader icon={Wallet} title="Effet des allocations, et décision d'un statut" subtitle="Un statut daté, signé par une autorité nommée, avec la référence du texte. Aucun montant, aucun échéancier, aucun RIB : la liquidation reste à la DBAU." />
      {q.isPending ? <Squelette className="mx-5 mb-5 h-40 rounded-lg" /> : !q.data ? null : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Statut de compte</p>
              <ul className="divide-y divide-line/60 rounded-md border border-line">
                {q.data.parStatut.map((l) => <li key={`${l.anneeUniversitaire}-${l.statut}`} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]"><span className="text-ink-2">{l.anneeUniversitaire} · {LIBELLE_STATUT_COMPTE[l.statut]}</span><span className="font-medium tabular-nums text-ink">{entier(l.effectif)}</span></li>)}
                {!q.data.parStatut.length && <li className="px-3 py-2 text-[13px] text-ink-muted">Aucune décision enregistrée.</li>}
              </ul>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Nature de la décision</p>
              <ul className="divide-y divide-line/60 rounded-md border border-line">
                {q.data.parDecision.map((l) => <li key={`${l.anneeUniversitaire}-${l.typeDecision}`} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]"><span className="text-ink-2">{l.anneeUniversitaire} · {LIBELLE_TYPE_DECISION[l.typeDecision]}</span><span className="font-medium tabular-nums text-ink">{entier(l.effectif)}</span></li>)}
                {!q.data.parDecision.length && <li className="px-3 py-2 text-[13px] text-ink-muted">Aucune décision enregistrée.</li>}
              </ul>
            </div>
          </div>
          <p className="text-xs text-ink-muted">Autorité ayant statué : {q.data.parAutorite.map((a) => `${LIBELLE_AUTORITE_ALLOCATION[a.autorite]} — ${entier(a.effectif)}`).join(" · ") || "aucune"}. Une année est « sans décision » tant qu'un arrêté n'a pas été enregistré : ce n'est pas une éligibilité refusée.</p>
          <p className="rounded-md bg-surface-2/70 px-3 py-2 text-[13px] text-ink-2">Un effectif par nature de décision reste un comptage : la ligne nominative, elle, ne sort pas de la porte de l&apos;établissement.</p>
        </div>
      )}

      {admin && (
        <form className="mx-5 mb-5 mt-4 space-y-3 rounded-lg border border-line bg-surface-2/40 p-4" onSubmit={(e) => {
          e.preventDefault();
          statuer.mutate({ apprenantId, anneeUniversitaire: anneeDecision, typeDecision, statutCompte: statut, autorite: "dbau", referenceActe: reference.trim() || null, motif: motif.trim() || null }, {
            onSuccess: () => { notifier({ ton: "succes", titre: "Décision enregistrée", texte: `${LIBELLE_STATUT_COMPTE[statut]} · l'étudiant est notifié sur son espace.` }); setReference(""); setMotif(""); },
          });
        }}>
          <p className="flex items-center gap-2 text-sm font-medium text-ink"><ScrollText size={15} aria-hidden />Statuer une allocation</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-1 block text-xs text-ink-muted">Identifiant de l'étudiant</span>
              <input value={apprenantId} onChange={(e) => setApprenantId(e.target.value.toUpperCase().slice(0, 10))} placeholder="APP-000123" className={classeChamp} aria-label="Identifiant de l'étudiant" /></label>
            <label className="block"><span className="mb-1 block text-xs text-ink-muted">Année universitaire</span>
              <input value={anneeDecision} onChange={(e) => setAnneeDecision(e.target.value.slice(0, 9))} placeholder="2026-2027" className={classeChamp} aria-label="Année universitaire de la décision" /></label>
            <label className="block"><span className="mb-1 block text-xs text-ink-muted">Nature de la décision</span>
              <select value={typeDecision} onChange={(e) => setTypeDecision(e.target.value as TypeDecisionAllocation)} className={classeSelect} aria-label="Nature de la décision">
                {TypeDecisionAllocation.options.map((t) => <option key={t} value={t}>{LIBELLE_TYPE_DECISION[t]}</option>)}
              </select></label>
            <label className="block"><span className="mb-1 block text-xs text-ink-muted">Statut de compte</span>
              <select value={statut} onChange={(e) => setStatut(e.target.value as StatutCompte)} className={classeSelect} aria-label="Statut de compte">
                {StatutCompte.options.map((s) => <option key={s} value={s}>{LIBELLE_STATUT_COMPTE[s]}</option>)}
              </select></label>
            <label className="block sm:col-span-2"><span className="mb-1 block text-xs text-ink-muted">Référence de l'arrêté</span>
              <input value={reference} onChange={(e) => setReference(e.target.value.slice(0, 120))} placeholder="Arrêté n° … du …" className={classeChamp} aria-label="Référence de l'arrêté" /></label>
            <label className="block sm:col-span-2"><span className="mb-1 block text-xs text-ink-muted">Motif (retrait, sursis, secours)</span>
              <input value={motif} onChange={(e) => setMotif(e.target.value.slice(0, 200))} className={classeChamp} aria-label="Motif de la décision" /></label>
          </div>
          {(typeDecision === "secours") !== (statut === "secours") && <p className="rounded-md bg-warning-bg px-3 py-2 text-[13px] text-warning">Un secours se statue « secours », et une bourse ne se statue pas « secours » : le MESRS compte les deux à part.</p>}
          {erreur && <p role="alert" className="rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">{erreur}</p>}
          <Button variante="primaire" taille="sm" type="submit" chargement={statuer.isPending} disabled={!pret}>Statuer au registre</Button>
        </form>
      )}
    </Card>
  );
}
