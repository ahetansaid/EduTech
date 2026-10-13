"use client";

import { StatutStage } from "@beile/contracts";
import { Briefcase, CheckCircle2, GraduationCap, Layers, Lock, Plus, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { Element, EntreePage } from "@/components/motion";
import { notifier } from "@/components/ui/Notifications";
import { TuileIndicateur } from "@/components/ui/donnees";
import { Badge, Button, Card, CardHeader, EtatVide, PageHeader, Squelette } from "@/components/ui/primitives";
import { classeChamp, classeSelect } from "@/app/(gestion)/etablissement/_composants";
import {
  LIBELLE_STATUT_STAGE, useDeclarerStageMutation, useMesStages, useMonContrat, useOffresContrat, useProposerUeMutation,
  useStatutStageMutation, type OffreContrat,
} from "@/lib/api/cursus";
import { date, entier } from "@/lib/format";
import { ErreurApi } from "@/lib/http";
import { useSession } from "@/lib/session";

/**
 * Le cursus de l'étudiant : son contrat pédagogique (ce qu'il suit, ce qu'il a acquis, ce qu'il peut encore
 * choisir) et ses stages. L'étudiant PROPOSE une UE ; la signature engage l'établissement. Chaque offre dit
 * d'avance ce que la proposition vérifiera, pour qu'aucun choix ne soit voué au refus.
 */
export default function Page() {
  const { contexte } = useSession();
  if (!contexte?.etudiantSuperieur) {
    return (
      <EntreePage>
        <Card><EtatVide icone={GraduationCap} titre="Mon cursus" texte="Votre contrat pédagogique et vos stages s'ouvrent avec votre inscription dans l'enseignement supérieur." /></Card>
      </EntreePage>
    );
  }
  return (
    <EntreePage>
      <div className="space-y-5">
        <PageHeader titre="Mon cursus" sousTitre="Ce que vous suivez cette année, ce que vous avez acquis, ce qu'il vous reste à choisir — et vos stages." />
        <Contrat />
        <Stages />
      </div>
    </EntreePage>
  );
}

/* ------------------------------------------------------------------ Contrat pédagogique */

function Contrat() {
  const contrat = useMonContrat();
  const offres = useOffresContrat();
  if (contrat.isPending) return <Squelette className="h-64 rounded-xl" />;
  if (contrat.isError) {
    return <Card><EtatVide icone={Layers} titre="Contrat pédagogique indisponible" texte={contrat.error instanceof ErreurApi && contrat.error.statut === 404 ? "Aucune inscription dans l'enseignement supérieur n'est enregistrée à votre nom." : contrat.error.message} /></Card>;
  }
  const c = contrat.data;
  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Element><TuileIndicateur libelle="Crédits acquis" icone={CheckCircle2} accent="sarcelle" valeur={entier(c.creditsAcquis)} unite="ECTS" indice={`${entier(c.validations.length)} UE validée${c.validations.length > 1 ? "s" : ""}`} /></Element>
        <Element><TuileIndicateur libelle="Crédits restants" icone={GraduationCap} accent="bleu" valeur={entier(c.creditsRestants)} unite="ECTS" indice="jusqu'au diplôme visé" /></Element>
        <Element><TuileIndicateur libelle="UE au contrat" icone={Layers} accent="ambre" valeur={entier(c.ueSignees.length)} indice={c.ueNonEvaluees.length ? `${entier(c.ueNonEvaluees.length)} pas encore évaluée${c.ueNonEvaluees.length > 1 ? "s" : ""}` : "toutes évaluées"} /></Element>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader icon={Layers} title="UE à mon contrat" subtitle={`Année ${c.inscription.anneeUniversitaire} · signées par l'établissement`} />
          {c.ueSignees.length ? (
            <ul className="divide-y divide-line">
              {c.ueSignees.map((l) => (
                <li key={l.inscriptionUe.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium text-ink">{l.ue.code} · {l.ue.intitule}</span>
                    <span className="text-xs text-ink-muted">{entier(l.ue.creditsEcts)} ECTS · {l.groupe?.intitule ?? "sans groupe"}</span>
                  </span>
                  <Badge ton={l.inscriptionUe.statut === "validee" ? "succes" : "info"}>{l.inscriptionUe.statut === "validee" ? "Validée" : "Signée"}</Badge>
                </li>
              ))}
            </ul>
          ) : <EtatVide icone={Layers} titre="Aucune UE signée" texte="Les UE obligatoires sont inscrites d'office par la scolarité ; proposez vos UE au choix ci-contre." />}
        </Card>
        <OffresAuChoix q={offres} />
      </div>
    </section>
  );
}

function OffresAuChoix({ q }: { q: ReturnType<typeof useOffresContrat> }) {
  const proposer = useProposerUeMutation();
  const [enCours, setEnCours] = useState<string | null>(null);
  const auChoix = useMemo(() => (q.data?.offres ?? []).filter((o) => o.auChoix), [q.data]);
  const envoyer = (o: OffreContrat) => {
    setEnCours(o.offreUeId);
    proposer.mutate({ offreUeId: o.offreUeId }, {
      onSuccess: () => notifier({ ton: "succes", titre: "UE proposée", texte: `${o.ue.code} attend la signature de l'établissement.` }),
      onError: (e) => notifier({ ton: "critique", titre: "Proposition refusée", texte: e.message }),
      onSettled: () => setEnCours(null),
    });
  };
  return (
    <Card className="min-w-0">
      <CardHeader icon={Plus} title="UE au choix" subtitle="Optionnelles, libres et transversales de votre filière, ouvertes cette année dans votre établissement." />
      {q.isPending ? <Squelette className="h-40 rounded-lg" /> : q.isError ? (
        <EtatVide icone={Layers} titre="Offres indisponibles" texte={q.error.message} />
      ) : !auChoix.length ? (
        <EtatVide icone={Layers} titre="Aucune UE au choix ouverte" texte="Votre établissement n'a ouvert aucune UE optionnelle ou libre pour votre filière cette année." />
      ) : (
        <ul className="divide-y divide-line">
          {auChoix.map((o) => {
            const bloque = o.acquise ? "Déjà acquise" : o.prerequisManquants.length ? `Prérequis : ${o.prerequisManquants.join(", ")}` : o.placesRestantes === 0 ? "Complet" : null;
            return (
              <li key={o.offreUeId} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium text-ink">{o.ue.code} · {o.ue.intitule}</span>
                  <span className="text-xs text-ink-muted">{o.periode.intitule} · {entier(o.ue.creditsEcts)} ECTS{o.placesRestantes != null ? ` · ${entier(o.placesRestantes)} place${o.placesRestantes > 1 ? "s" : ""}` : ""}</span>
                </span>
                {o.monContrat ? <Badge ton={o.monContrat === "proposee" ? "avertissement" : "succes"}>{o.monContrat === "proposee" ? "Proposée" : "À mon contrat"}</Badge>
                  : bloque ? <Badge ton="neutre" icone={Lock}>{bloque}</Badge>
                  : <Button taille="sm" variante="secondaire" icone={Send} chargement={enCours === o.offreUeId} onClick={() => envoyer(o)}>Proposer</Button>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ Stages */

function Stages() {
  const q = useMesStages();
  const declarer = useDeclarerStageMutation();
  const statut = useStatutStageMutation();
  const [entreprise, setEntreprise] = useState("");
  const [tuteur, setTuteur] = useState("");
  const [du, setDu] = useState("");
  const [au, setAu] = useState("");
  const erreur = declarer.error instanceof ErreurApi ? declarer.error.message : null;
  const envoyer = () => declarer.mutate(
    { entreprise: entreprise.trim(), tuteurPro: tuteur.trim() || null, du: du || null, au: au || null },
    { onSuccess: () => { notifier({ ton: "succes", titre: "Stage déclaré", texte: `${entreprise.trim()} figure à votre dossier.` }); setEntreprise(""); setTuteur(""); setDu(""); setAu(""); } },
  );
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="min-w-0">
        <CardHeader icon={Briefcase} title="Mes stages" subtitle="Rattachés à votre inscription en cours ; l'encadrant académique s'en porte responsable de son côté." />
        {q.isPending ? <Squelette className="h-32 rounded-lg" /> : q.isError ? <EtatVide icone={Briefcase} titre="Stages indisponibles" texte={q.error.message} /> : !q.data.length ? (
          <EtatVide icone={Briefcase} titre="Aucun stage déclaré" texte="Déclarez votre stage dès la piste identifiée : la convention et l'encadrement suivront." />
        ) : (
          <ul className="divide-y divide-line">
            {q.data.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium text-ink">{s.entreprise}</span>
                  <span className="text-xs text-ink-muted">{s.du ? `du ${date(s.du)}` : "dates à fixer"}{s.au ? ` au ${date(s.au)}` : ""}{s.tuteurPro ? ` · tuteur ${s.tuteurPro}` : ""}{s.tuteurAcademiqueId ? " · encadrant académique désigné" : ""}</span>
                </span>
                <select value={s.statut} aria-label={`Avancement du stage chez ${s.entreprise}`} className={`${classeSelect} w-auto`} disabled={statut.isPending}
                  onChange={(e) => statut.mutate({ id: s.id, statut: e.target.value as StatutStage }, { onError: (er) => notifier({ ton: "critique", titre: "Avancement refusé", texte: er.message }) })}>
                  {StatutStage.options.map((x) => <option key={x} value={x}>{LIBELLE_STATUT_STAGE[x]}</option>)}
                </select>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="min-w-0">
        <CardHeader icon={Plus} title="Déclarer un stage" subtitle="L'établissement et la filière viennent de votre inscription : vous ne les choisissez pas." />
        <div className="space-y-3.5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Structure d&apos;accueil <span className="text-critical">*</span></span>
            <input value={entreprise} onChange={(e) => setEntreprise(e.target.value.slice(0, 140))} className={classeChamp} aria-label="Structure d'accueil" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Tuteur dans la structure</span>
            <input value={tuteur} onChange={(e) => setTuteur(e.target.value.slice(0, 120))} className={classeChamp} aria-label="Tuteur dans la structure" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">Début</span><input type="date" value={du} onChange={(e) => setDu(e.target.value)} className={classeChamp} aria-label="Date de début" /></label>
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">Fin</span><input type="date" value={au} min={du || undefined} onChange={(e) => setAu(e.target.value)} className={classeChamp} aria-label="Date de fin" /></label>
          </div>
          {erreur && <p role="alert" className="rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">{erreur}</p>}
          <Button variante="primaire" icone={Send} chargement={declarer.isPending} disabled={entreprise.trim().length < 2} onClick={envoyer}>Déclarer</Button>
        </div>
      </Card>
    </div>
  );
}
