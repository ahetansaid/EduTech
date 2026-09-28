"use client";

import type { DemandeActe } from "@beile/contracts";
import { BAREME_DELAI, LIBELLE_ACTE, LIBELLE_AUTORITE, LIBELLE_STATUT_COMPTE, TypeActe } from "@beile/contracts";
import { AlertTriangle, Award, Clock, FileClock, FolderOpen, GraduationCap, Info, Send, Wallet } from "lucide-react";
import { useState } from "react";
import { Cascade, Compteur, Element, EntreePage } from "@/components/motion";
import { notifier } from "@/components/ui/Notifications";
import { TuileIndicateur } from "@/components/ui/donnees";
import { Badge, Button, Card, CardHeader, EtatVide, PageHeader, Squelette } from "@/components/ui/primitives";
import {
  LIBELLE_AUTORITE_ALLOCATION, LIBELLE_MODE_RETRAIT, LIBELLE_PASSAGE, LIBELLE_PIECE, LIBELLE_STATUT_ACTE,
  LIBELLE_STATUT_DOSSIER, LIBELLE_TYPE_DECISION, TON_STATUT_ACTE, TON_STATUT_DOSSIER, useDeposerActeMutation,
  useMesActes, useMesAllocations, useMonAttestation, useMonDossier, useRetirerActeMutation,
} from "@/lib/api/guichet";
import { classeChamp, classeSelect } from "@/app/(gestion)/etablissement/_composants";
import { cn } from "@/lib/cn";
import { date, entier } from "@/lib/format";
import { ErreurApi } from "@/lib/http";

/**
 * Espace de l'étudiant : ses démarches administratives. Le délai affiché est celui que l'administration
 * a publié (fiche CatIS citée), et le retard est calculé par le serveur — l'écran ne fait pas son
 * arithmetic avec l'horloge du téléphone.
 */
export default function Demarches() {
  const q = useMesActes();
  const attestation = useMonAttestation(null);

  return (
    <EntreePage>
      <div className="space-y-5">
        <PageHeader
          titre="Mes démarches"
          sousTitre="Demandez vos actes en ligne, suivez où ils en sont, et retirez-les avec la preuve de leur authenticité. Une pièce d'un dossier de bourse prête au guichet mais non retirée compte comme manquante : cette page est faite pour que ça ne vous coûte pas un droit."
        />

        <div className="flex items-start gap-3 rounded-lg bg-info-bg px-4 py-3 text-[13px] text-info">
          <Info size={17} className="mt-0.5 shrink-0" aria-hidden />
          <p>Les délais ci-dessous sont <strong>annoncés par l&apos;administration</strong> (fiches CatIS, portail des services publics), pas promis par BEILE. Ce que BEILE enregistre, c&apos;est la date de votre dépôt et celle de la mise à disposition — donc le retard, et à quelle autorité il revient.</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Depot />
          <Attestation q={attestation} />
        </div>

        <Card data-guide="demarches-suivi" className="min-w-0 overflow-hidden p-0">
          <CardHeader icon={FolderOpen} title="Mes demandes" subtitle="Chaque étape est un fait au registre : rien n'efface une demande, même retirée." action={<Badge>{q.data?.length ?? 0}</Badge>} />
          {q.isPending ? (
            <div className="space-y-2 px-5 pb-5">{[0, 1, 2].map((i) => <Squelette key={i} className="h-20 rounded-lg" />)}</div>
          ) : q.isError ? (
            <div className="px-5 pb-5"><EtatVide icone={AlertTriangle} titre="Demandes momentanément indisponibles" texte={`${q.error.message}. Réessayez dans un instant.`} action={<Button variante="secondaire" onClick={() => q.refetch()}>Réessayer</Button>} /></div>
          ) : !q.data?.length ? (
            <div className="px-5 pb-5"><EtatVide icone={FileClock} titre="Aucune demande pour l'instant" texte="Déposez votre première demande ci-dessus : vous saurez ici qui la traite et quand elle doit être prête." /></div>
          ) : (
            <ul className="divide-y divide-line/60 border-t border-line/60">
              {q.data.map((d) => <LigneDemande key={d.id} d={d} />)}
            </ul>
          )}
        </Card>

        <Allocations annee={attestation.data?.anneeUniversitaire ?? null} />
      </div>
    </EntreePage>
  );
}

/* ------------------------------------------------------------------ Déposer une demande */

function Depot() {
  const [typeActe, setTypeActe] = useState<TypeActe>("attestation_de_scolarite");
  const [annee, setAnnee] = useState("");
  const [motif, setMotif] = useState("");
  const deposer = useDeposerActeMutation();
  const bareme = BAREME_DELAI[typeActe];
  const exigeMotif = typeActe === "duplicata_de_diplome";
  const erreur = deposer.error instanceof ErreurApi ? deposer.error.message : null;

  const envoyer = () => {
    deposer.mutate(
      { typeActe, anneeUniversitaire: annee.trim() || null, motifDemande: motif.trim() || null },
      {
        onSuccess: (r) => {
          notifier({ ton: "succes", titre: "Demande déposée", texte: r.deja ? "Votre demande avait déjà été enregistrée." : `${LIBELLE_ACTE[typeActe]} attendu le ${r.attenduLe ? date(r.attenduLe) : "—"}.` });
          setMotif("");
        },
      },
    );
  };

  return (
    <Card data-guide="demarches-depot" className="min-w-0">
      <CardHeader icon={Send} title="Demander un acte" subtitle="Le guichet compétent et le délai sont fixés par le barème publié, pas par vous." />
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Acte demandé</span>
          <select value={typeActe} onChange={(e) => setTypeActe(e.target.value as TypeActe)} className={classeSelect} aria-label="Acte demandé">
            {TypeActe.options.map((t) => <option key={t} value={t}>{LIBELLE_ACTE[t]}</option>)}
          </select>
        </label>

        <div className="rounded-lg border border-line bg-surface-2/50 px-3.5 py-3 text-[13px] text-ink-2">
          <p><span className="text-ink-muted">Délai annoncé : </span><strong className="text-ink">{bareme.jours} jours calendaires</strong> · à préparer par {LIBELLE_AUTORITE[bareme.autorite]}</p>
          <p className="mt-1 text-xs text-ink-muted">Source : {bareme.source}</p>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Année universitaire</span>
          <input value={annee} onChange={(e) => setAnnee(e.target.value.slice(0, 9))} placeholder="laisser vide = année en cours" className={cn(classeChamp, "placeholder:text-ink-muted/70")} aria-label="Année universitaire, au format 2025-2026" />
          <span className="mt-1 block text-xs text-ink-muted">Format AAAA-AAAA. Un acte se délivre au titre d&apos;une année d&apos;inscription.</span>
        </label>

        {exigeMotif && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Motif de la demande <span className="text-critical">*</span></span>
            <textarea value={motif} onChange={(e) => setMotif(e.target.value.slice(0, 200))} rows={2} placeholder="Perte, vol, détérioration : sans trace, un duplicata serait un second original." className={cn(classeChamp, "h-auto py-2")} />
          </label>
        )}

        {erreur && <p role="alert" className="rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">{erreur}</p>}
        <Button variante="primaire" icone={Send} chargement={deposer.isPending} disabled={exigeMotif && motif.trim().length < 3} onClick={envoyer}>Déposer la demande</Button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ Couche A : l'attestation recalculée */

function Attestation({ q }: { q: ReturnType<typeof useMonAttestation> }) {
  const a = q.data;
  return (
    <Card className="min-w-0">
      <CardHeader icon={GraduationCap} title="Attestation de scolarité et de progression" subtitle="Recalculée depuis les faits du registre : inscription, crédits validés, délibération du jury." />
      {q.isPending ? (
        <Squelette className="h-56 rounded-lg" />
      ) : q.isError ? (
        <EtatVide icone={Award} titre="Pas d'inscription dans le supérieur" texte={q.error instanceof ErreurApi && q.error.statut === 404 ? "Cette page s'adresse aux étudiant·e·s inscrit·e·s dans l'enseignement supérieur." : q.error.message} />
      ) : !a ? null : (
        <div className="space-y-3.5">
          <div>
            <p className="text-[15px] font-semibold text-ink">{a.etablissementNom}</p>
            <p className="text-[13px] text-ink-2">{a.filiereIntitule} · {a.diplomeVise} · {a.anneeUniversitaire}</p>
            <p className="mt-0.5 font-mono text-xs text-ink-muted">{a.numeroEtudiant ?? "numéro étudiant non attribué"}</p>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <Palier libelle="Crédits de l'année" valeur={a.creditsAcquisAnnee} sur={a.creditsAttendusAnnee} />
            <Palier libelle="Crédits cumulés" valeur={a.creditsAcquisCumules} sur={null} />
            <Palier libelle="Moyenne délibérée" valeur={a.moyennePonderee} sur={20} decimal />
          </div>
          <p className="text-[13px] text-ink-2">
            <span className="text-ink-muted">Passage : </span>{LIBELLE_PASSAGE[a.passage]}
            {a.delibereLe ? ` · délibération du ${date(a.delibereLe)}` : ""}
          </p>
          {a.delivre ? (
            <p className="rounded-md bg-success-bg px-3 py-2 text-[13px] text-success">Délivrée le {date(a.delivreLe)} · empreinte <span className="font-mono text-xs">{a.empreinte.slice(0, 16)}…</span></p>
          ) : (
            <p className="rounded-md bg-warning-bg px-3 py-2 text-[13px] text-warning">Aperçu non signé : cet état n&apos;a été délivré par personne. Demandez l&apos;attestation pour l&apos;opposer à une administration.</p>
          )}
        </div>
      )}
    </Card>
  );
}

function Palier({ libelle, valeur, sur, decimal = false }: { libelle: string; valeur: number | null; sur: number | null; decimal?: boolean }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2.5">
      <p className={cn("text-xl font-semibold tabular-nums text-ink", decimal && "text-lg")}>{valeur === null ? "—" : decimal ? valeur.toFixed(2) : entier(valeur)}</p>
      <p className="text-[11.5px] leading-snug text-ink-muted">{libelle}{sur !== null ? ` / ${sur}` : ""}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ Suivi d'une demande */

function LigneDemande({ d }: { d: DemandeActe }) {
  const retirer = useRetirerActeMutation();
  const enRetard = (d.retardJours ?? 0) > 0 && (d.statut === "demandee" || d.statut === "en_instruction");
  return (
    <li className="px-5 py-3.5">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{LIBELLE_ACTE[d.typeActe]}{d.anneeUniversitaire ? <span className="ml-2 text-xs font-normal text-ink-muted">{d.anneeUniversitaire}</span> : ""}</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            Déposée le {date(d.demandeeLe)} · délai annoncé {d.delaiContractuelJours} j par {LIBELLE_AUTORITE[d.autorite]} · <span className="font-mono">{d.id}</span>
          </p>
          {d.disponibleLe && <p className="mt-1 text-[13px] text-ink-2">Prête depuis le {date(d.disponibleLe)}{d.remisLe ? ` · remise le ${date(d.remisLe)} (${LIBELLE_MODE_RETRAIT[d.modeRetrait ?? "titulaire"]}${d.piecePresentee ? `, ${LIBELLE_PIECE[d.piecePresentee]}` : ""})` : " — présentez-vous au guichet."}</p>}
          {d.statut === "refusee" && d.motifRefus && <p className="mt-1 text-[13px] text-critical">Motif du refus : {d.motifRefus}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Badge ton={TON_STATUT_ACTE[d.statut]}>{LIBELLE_STATUT_ACTE[d.statut]}</Badge>
          {d.joursEcoules !== null && <span className="text-xs tabular-nums text-ink-muted">{d.joursEcoules} j écoulés</span>}
          {enRetard && <Badge ton="critique" icone={Clock}>{d.retardJours} j de retard</Badge>}
          {d.statut === "demandee" && (
            <Button variante="fantome" taille="sm" chargement={retirer.isPending} onClick={() => retirer.mutate(d.id, { onSuccess: () => notifier({ ton: "succes", titre: "Demande retirée", texte: "Elle reste visible dans votre historique." }) })}>Retirer</Button>
          )}
        </div>
      </div>
    </li>
  );
}

/* ---------------------------------------------------------------- Couches B et C : allocations */

function Allocations({ annee }: { annee: string | null }) {
  const decisions = useMesAllocations();
  const dossier = useMonDossier(annee, null);
  const d = dossier.data;

  return (
    <div className="space-y-3">
      <Cascade className="grid gap-3 sm:grid-cols-3">
        <Element><TuileIndicateur libelle="Mon dossier" icone={Wallet} accent={d && d.statut === "complet" ? "sarcelle" : "ambre"} valeur={d ? LIBELLE_STATUT_DOSSIER[d.statut] : "…"} indice={d?.echeance ? `${d.pieces.filter((p) => p.produiteLe).length}/${d.pieces.length} pièces remises` : "aucune échéance déclarée"} /></Element>
        <Element><TuileIndicateur libelle="Jours restants" icone={Clock} accent="bleu" valeur={d && d.joursRestants !== null ? entier(d.joursRestants) : "—"} indice="avant la date limite de dépôt" /></Element>
        <Element><TuileIndicateur libelle="Décisions enregistrées" icone={FolderOpen} accent="bleu" valeur={<Compteur valeur={decisions.data?.length ?? 0} format={entier} />} indice="statut, autorité, référence du texte" /></Element>
      </Cascade>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card data-guide="demarches-pieces" className="min-w-0">
          <CardHeader icon={FolderOpen} title="Pièces exigées au titre du calendrier" subtitle="Une pièce prête au guichet mais non retirée compte ici comme manquante." />
          {dossier.isPending ? <Squelette className="h-40 rounded-lg" /> : dossier.isError ? (
            <p className="text-[13px] text-ink-2">{dossier.error.message}</p>
          ) : !d ? null : (
            <div className="space-y-3">
              <Badge ton={TON_STATUT_DOSSIER[d.statut]}>{LIBELLE_STATUT_DOSSIER[d.statut]}{d.echeance ? ` · limite le ${date(d.echeance.dateLimite)}` : ""}</Badge>
              {d.statut === "sans_echeance" && <p className="rounded-md bg-info-bg px-3 py-2 text-[13px] text-info">Aucune échéance de dépôt n&apos;est déclarée pour {d.anneeUniversitaire} ({LIBELLE_TYPE_DECISION[d.typeDecision]}). Le calendrier relève de la DBAU : sans date publiée, aucun retard ne peut être imputé.</p>}
              {!d.pieces.length && <p className="text-[13px] text-ink-muted">Cette échéance ne demande aucune pièce.</p>}
              <ul className="divide-y divide-line/60 border-y border-line/60">
                {d.pieces.map((p) => (
                  <li key={p.typeActe} className="flex items-center gap-3 py-2.5 text-[13px]">
                    <span className="min-w-0 flex-1 truncate text-ink">{LIBELLE_ACTE[p.typeActe]}</span>
                    {p.produiteLe ? <Badge ton="succes">remise le {date(p.produiteLe)}</Badge> : <Badge ton={p.statutDemande ? TON_STATUT_ACTE[p.statutDemande] : "critique"}>{p.statutDemande ? LIBELLE_STATUT_ACTE[p.statutDemande] : "jamais demandée"}</Badge>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card data-guide="demarches-allocations" className="min-w-0">
          <CardHeader icon={Wallet} title="Mes allocations" subtitle="Un statut daté et signé par une autorité nommée. Aucun montant, aucun relevé bancaire ici : la liquidation reste à la DBAU." />
          {decisions.isPending ? <Squelette className="h-40 rounded-lg" /> : !decisions.data?.length ? (
            <EtatVide icone={Wallet} titre="Aucune décision enregistrée à votre nom" texte="Si vous êtes boursier·e et que rien n'apparaît, c'est à signaler à votre guichet : le statut se certifie, il ne se devine pas." />
          ) : (
            <ul className="divide-y divide-line/60 border-y border-line/60">
              {decisions.data.map((x) => (
                <li key={x.id} className="py-3">
                  <p className="text-sm font-medium text-ink">{LIBELLE_TYPE_DECISION[x.typeDecision]} · {LIBELLE_STATUT_COMPTE[x.statut]}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">{x.anneeUniversitaire} · décidé le {date(x.decideLe)} · {LIBELLE_AUTORITE_ALLOCATION[x.autorite]}</p>
                  {x.referenceActe && <p className="mt-1 text-xs text-ink-2">Référence : {x.referenceActe}</p>}
                  {x.motif && <p className="mt-1 text-xs text-ink-2">Motif : {x.motif}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
