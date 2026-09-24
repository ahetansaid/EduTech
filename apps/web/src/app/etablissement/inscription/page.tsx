"use client";

import type { Apprenant, LienFamilial, NouvelEvenement, PersonneRegistre } from "@beile/contracts";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CircleUserRound, Database, Fingerprint, Search, ShieldCheck, UserPlus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Button, Card, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { date } from "@/lib/format";
import { ageAu, elevesClasse } from "@/lib/scolarite";
import { ANNEE, ETAB_RONIERS } from "@/lib/sim/micro";
import { situationApprenant } from "@/lib/sim/projections";
import { maintenant, useDemo, useMonde } from "@/lib/store";

type Etape = 1 | 2 | 3 | 4;
const ETAPES = ["Registre national", "Filiation", "Classe", "Confirmation"];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export default function Inscription() {
  const monde = useMonde();
  const enregistrer = useDemo((s) => s.enregistrer);
  const ajouterApprenant = useDemo((s) => s.ajouterApprenant);
  const [etape, setEtape] = useState<Etape>(1);
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [cherche, setCherche] = useState(false);
  const [enfant, setEnfant] = useState<PersonneRegistre | null>(null);
  const [sansActe, setSansActe] = useState<{ nom: string; prenoms: string; sexe: "F" | "M"; naissance: string; responsable: string } | null>(null);
  const [classeId, setClasseId] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{ apprenant: Apprenant; evts: string[] } | null>(null);

  const resultats = useMemo(() => {
    if (!cherche || (!nom.trim() && !prenom.trim())) return [];
    return monde.registre.filter((p) => p.dateNaissance >= "2008-01-01" && (!nom.trim() || norm(p.nom).includes(norm(nom))) && (!prenom.trim() || norm(p.prenoms).includes(norm(prenom)))).slice(0, 8);
  }, [monde, nom, prenom, cherche]);

  const dejaInscrit = (npi: string) => {
    const a = monde.apprenants.find((x) => x.npi === npi);
    if (!a) return null;
    const s = situationApprenant(monde, monde.evenements, a.id);
    return s.statut === "scolarise" ? monde.etablissements.find((e) => e.id === s.etablissementId)?.nom ?? "un établissement" : null;
  };
  const parents = enfant ? monde.registre.filter((p) => enfant.parentsNpi.includes(p.npi)) : [];
  const classes = monde.classes.filter((c) => c.etablissementId === ETAB_RONIERS).map((c) => ({ c, n: elevesClasse(monde, monde.evenements, c).length }));
  const identite = enfant ? { nom: enfant.nom, prenoms: enfant.prenoms, sexe: enfant.sexe, naissance: enfant.dateNaissance } : sansActe ? { nom: sansActe.nom.toUpperCase(), prenoms: sansActe.prenoms, sexe: sansActe.sexe, naissance: sansActe.naissance } : null;

  const confirmer = () => {
    if (!identite || !classeId) return;
    const apprenant: Apprenant = {
      id: `APP-${String(900000 + monde.apprenants.length + 1)}`,
      npi: enfant?.npi ?? null,
      statutIdentite: enfant ? "verifiee" : "regularisation_en_cours",
      nom: identite.nom, prenoms: identite.prenoms, dateNaissance: identite.naissance, sexe: identite.sexe, besoinsParticuliers: false,
    };
    const liens: LienFamilial[] = parents.map((p) => ({ responsableNpi: p.npi, apprenantId: apprenant.id, nature: "parent", verifie: true }));
    ajouterApprenant(apprenant, liens, null);
    const base = { survenuLe: maintenant(), auteurId: "p-directeur", source: "beile" as const, etablissementId: ETAB_RONIERS };
    const evts: NouvelEvenement[] = [{ type: "INSCRIPTION", apprenantId: apprenant.id, classeId, anneeScolaire: ANNEE, ...base }];
    if (!enfant) evts.push({ type: "REGULARISATION_IDENTITE_DEMANDEE", apprenantId: apprenant.id, motif: `Absence d'acte de naissance — responsable déclaré : ${sansActe?.responsable || "non renseigné"}`, ...base });
    const crees = enregistrer(evts);
    setResultat({ apprenant, evts: crees.map((e) => `${e.id} · ${e.type}`) });
  };

  if (resultat) {
    const a = resultat.apprenant;
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Card className="animate-slide-up text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-bg text-success"><Check size={28} /></span>
          <h1 className="mt-4 text-[24px] font-bold text-ink">{a.prenoms} {a.nom} est inscrit·e</h1>
          <p className="mt-1 text-ink-2">Identifiant éducatif <span className="font-mono font-semibold text-ink">{a.id}</span> — stable d'un établissement et d'un cycle à l'autre.</p>
          {a.statutIdentite === "regularisation_en_cours" && (
            <p className="mx-auto mt-4 max-w-md rounded-md bg-warning-bg px-4 py-3 text-[13px] text-warning">L'enfant n'a pas été exclu faute d'acte de naissance : l'inscription est effective et une régularisation a été transmise à l'agence d'identification.</p>
          )}
          <div className="mx-auto mt-5 max-w-md text-left">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">Événements inscrits au registre</p>
            <ul className="mt-2 space-y-1 font-mono text-[12px] text-ink-2">{resultat.evts.map((e) => <li key={e}>{e}</li>)}</ul>
            <p className="mt-3 text-[12.5px] text-ink-muted">Ils alimentent immédiatement les effectifs de la classe, le passeport éducatif, la notification aux parents vérifiés et les indicateurs territoriaux.</p>
          </div>
          <div className="mt-6 flex justify-center gap-2">
            <Link href="/etablissement"><Button variante="secondaire">Tableau de bord</Button></Link>
            <Button icone={UserPlus} onClick={() => { setResultat(null); setEtape(1); setEnfant(null); setSansActe(null); setClasseId(null); setNom(""); setPrenom(""); setCherche(false); }}>Nouvelle inscription</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/etablissement" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-muted hover:text-ink"><ArrowLeft size={15} /> Mon établissement</Link>
      <PageHeader surtitre="Processus P4 · P6" titre="Inscrire un apprenant" sousTitre="Le système éducatif ne crée jamais une identité : il interroge le registre national, puis rattache l'apprenant." />

      <ol className="grid grid-cols-4 gap-2" aria-label="Étapes">
        {ETAPES.map((l, i) => {
          const n = (i + 1) as Etape;
          return (
            <li key={l} className={cn("rounded-md px-3 py-2 text-[12.5px] font-medium", n === etape ? "bg-navy text-white dark:bg-blue dark:text-navy-deep" : n < etape ? "bg-success-bg text-success" : "bg-surface-2 text-ink-muted")} aria-current={n === etape ? "step" : undefined}>
              <span className="tabular">{n}.</span> {l}
            </li>
          );
        })}
      </ol>

      {etape === 1 && (
        <Card>
          <form onSubmit={(e) => { e.preventDefault(); setCherche(true); }} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <label className="block"><span className="mb-1 block text-[12.5px] font-medium text-ink-2">Nom</span>
              <input value={nom} onChange={(e) => { setNom(e.target.value.slice(0, 40)); setCherche(false); }} className="h-11 w-full rounded-md border border-line bg-surface px-3 text-[14px] uppercase" placeholder="WOROU" /></label>
            <label className="block"><span className="mb-1 block text-[12.5px] font-medium text-ink-2">Prénom(s)</span>
              <input value={prenom} onChange={(e) => { setPrenom(e.target.value.slice(0, 40)); setCherche(false); }} className="h-11 w-full rounded-md border border-line bg-surface px-3 text-[14px]" placeholder="Sidonie" /></label>
            <Button type="submit" className="self-end" taille="lg" icone={Search} disabled={!nom.trim() && !prenom.trim()}>Interroger le registre</Button>
          </form>
          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-muted"><Database size={13} /> Requête transmise via la plateforme nationale d'interopérabilité (simulée). Exemples : WOROU Sidonie, HOUESSOU Landry, ou un nom absent du registre.</p>
          {cherche && (
            <div className="mt-5 animate-fade-in">
              {resultats.length > 0 ? (
                <ul className="divide-y divide-line/60 rounded-lg border border-line/70">
                  {resultats.map((p) => {
                    const deja = dejaInscrit(p.npi);
                    return (
                      <li key={p.npi} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <CircleUserRound size={20} className="text-ink-muted" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] font-semibold text-ink">{p.nom} {p.prenoms}</p>
                          <p className="text-[12.5px] text-ink-muted">Né·e le {date(p.dateNaissance)} ({ageAu(p.dateNaissance)} ans) · NPI {p.npi.slice(0, 3)}••••{p.npi.slice(-3)}</p>
                        </div>
                        {deja ? <Badge ton="avertissement" icone={AlertTriangle}>Déjà inscrit·e : {deja}</Badge> : (
                          <Button taille="sm" icone={ArrowRight} onClick={() => { setEnfant(p); setSansActe(null); setEtape(2); }}>Sélectionner</Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="rounded-lg border border-warning/30 bg-warning-bg/60 p-4">
                  <p className="text-[14px] font-semibold text-warning">Aucune personne correspondante au registre national</p>
                  <p className="mt-1 text-[13px] text-ink-2">Tous les enfants ne disposent pas d'un acte d'état civil. Refuser l'inscription exclurait les plus vulnérables : la règle est d'inscrire, signaler et régulariser.</p>
                  <Button className="mt-3" variante="secondaire" taille="sm" onClick={() => { setSansActe({ nom, prenoms: prenom, sexe: "F", naissance: "2013-06-01", responsable: "" }); setEnfant(null); setEtape(2); }}>Inscrire avec procédure de régularisation</Button>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {etape === 2 && (
        <Card>
          {enfant ? (
            <>
              <div className="flex items-center gap-2"><Badge ton="succes" icone={Fingerprint}>Identité vérifiée au registre national</Badge></div>
              <p className="mt-3 font-display text-[20px] font-bold text-ink">{enfant.nom} {enfant.prenoms}</p>
              <p className="text-[13px] text-ink-muted">Né·e le {date(enfant.dateNaissance)} · sexe {enfant.sexe === "F" ? "féminin" : "masculin"}</p>
              <p className="mt-5 text-[13px] font-semibold text-ink-2">Responsables légaux (lien de filiation issu du registre, non déclaratif)</p>
              <ul className="mt-2 space-y-2">
                {parents.map((p) => (
                  <li key={p.npi} className="flex items-center gap-3 rounded-md bg-surface-2/70 px-3 py-2.5 text-[13.5px]"><ShieldCheck size={16} className="text-success" /> <span className="flex-1 text-ink">{p.prenoms} {p.nom}</span><Badge>{p.sexe === "F" ? "Mère" : "Père"}</Badge></li>
                ))}
              </ul>
              <p className="mt-3 text-[12.5px] text-ink-muted">Ces responsables recevront l'accès à l'espace famille. Aucun autre adulte ne peut se déclarer parent.</p>
            </>
          ) : sansActe && (
            <div className="grid gap-3 sm:grid-cols-2">
              <p className="sm:col-span-2 rounded-md bg-warning-bg px-3 py-2 text-[13px] text-warning">Identité déclarative, en attente de régularisation. Le lien familial ne sera vérifié qu'après enregistrement à l'état civil.</p>
              <label className="block"><span className="mb-1 block text-[12.5px] font-medium text-ink-2">Nom</span><input value={sansActe.nom} onChange={(e) => setSansActe({ ...sansActe, nom: e.target.value.slice(0, 40) })} className="h-11 w-full rounded-md border border-line bg-surface px-3 uppercase" /></label>
              <label className="block"><span className="mb-1 block text-[12.5px] font-medium text-ink-2">Prénom(s)</span><input value={sansActe.prenoms} onChange={(e) => setSansActe({ ...sansActe, prenoms: e.target.value.slice(0, 40) })} className="h-11 w-full rounded-md border border-line bg-surface px-3" /></label>
              <label className="block"><span className="mb-1 block text-[12.5px] font-medium text-ink-2">Date de naissance déclarée</span><input type="date" value={sansActe.naissance} onChange={(e) => setSansActe({ ...sansActe, naissance: e.target.value })} className="h-11 w-full rounded-md border border-line bg-surface px-3" /></label>
              <label className="block"><span className="mb-1 block text-[12.5px] font-medium text-ink-2">Sexe</span><select value={sansActe.sexe} onChange={(e) => setSansActe({ ...sansActe, sexe: e.target.value as "F" | "M" })} className="h-11 w-full rounded-md border border-line bg-surface px-3"><option value="F">Féminin</option><option value="M">Masculin</option></select></label>
              <label className="block sm:col-span-2"><span className="mb-1 block text-[12.5px] font-medium text-ink-2">Responsable déclaré</span><input value={sansActe.responsable} onChange={(e) => setSansActe({ ...sansActe, responsable: e.target.value.slice(0, 60) })} className="h-11 w-full rounded-md border border-line bg-surface px-3" placeholder="Nom et prénom du parent ou tuteur" /></label>
            </div>
          )}
          <div className="mt-6 flex justify-between">
            <Button variante="fantome" onClick={() => setEtape(1)}>Retour</Button>
            <Button icone={ArrowRight} disabled={!!sansActe && (!sansActe.nom.trim() || !sansActe.prenoms.trim())} onClick={() => setEtape(3)}>Choisir la classe</Button>
          </div>
        </Card>
      )}

      {etape === 3 && (
        <Card>
          <p className="text-[14px] font-semibold text-ink">Classe d'accueil — année {ANNEE}</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {classes.map(({ c, n }) => {
              const pleine = n >= c.capacite;
              return (
                <li key={c.id}>
                  <button disabled={pleine} onClick={() => setClasseId(c.id)} aria-pressed={classeId === c.id}
                    className={cn("flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition", classeId === c.id ? "border-blue ring-2 ring-blue/30" : "border-line/70 hover:bg-surface-2", pleine && "cursor-not-allowed opacity-60")}>
                    <span className="flex-1"><span className="block text-[15px] font-semibold text-ink">{c.libelle}</span><span className="text-[12.5px] text-ink-muted">{n}/{c.capacite} élèves</span></span>
                    {pleine ? <Badge ton="critique">Complète</Badge> : <Badge ton="succes">{c.capacite - n} places</Badge>}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-6 flex justify-between">
            <Button variante="fantome" onClick={() => setEtape(2)}>Retour</Button>
            <Button icone={ArrowRight} disabled={!classeId} onClick={() => setEtape(4)}>Vérifier</Button>
          </div>
        </Card>
      )}

      {etape === 4 && identite && (
        <Card>
          <p className="text-[14px] font-semibold text-ink">Récapitulatif</p>
          <dl className="mt-3 grid gap-2 text-[14px] sm:grid-cols-2">
            {[["Apprenant", `${identite.nom} ${identite.prenoms}`], ["Identité", enfant ? "Vérifiée (registre national)" : "Régularisation à engager"], ["Classe", classes.find((x) => x.c.id === classeId)?.c.libelle ?? ""], ["Année scolaire", ANNEE], ["Responsables", enfant ? parents.map((p) => `${p.prenoms} ${p.nom}`).join(", ") : sansActe?.responsable || "—"], ["Établissement", "CEG Les Rôniers"]].map(([l, v]) => (
              <div key={l} className="rounded-md bg-surface-2/60 px-3 py-2"><dt className="text-[12px] text-ink-muted">{l}</dt><dd className="font-medium text-ink">{v}</dd></div>
            ))}
          </dl>
          <div className="mt-6 flex justify-between">
            <Button variante="fantome" onClick={() => setEtape(3)}>Retour</Button>
            <Button variante="valider" icone={Check} onClick={confirmer}>Confirmer l'inscription</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
