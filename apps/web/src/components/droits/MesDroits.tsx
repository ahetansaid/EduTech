"use client";

import { FINALITE_LIBELLE } from "@beile/contracts";
import { CircleCheck, Clock, Eye, FileSearch, PenLine, Send, ShieldCheck, ShieldOff, X } from "lucide-react";
import { useState } from "react";
import { Cascade, Element } from "@/components/motion";
import { notifier } from "@/components/ui/Notifications";
import { Badge, Button, Card, EtatVide, PageHeader, Squelette } from "@/components/ui/primitives";
import { useDeposerDemandeDroit, useMesConsultations, useMesDemandesDroits, type Droit } from "@/lib/api/droits";
import { cn } from "@/lib/cn";
import { ErreurApi } from "@/lib/http";

/**
 * « Mes données » : la personne exerce ses droits (accès, rectification, limitation, opposition) sur ses
 * propres données ou celles d'un enfant dont elle est responsable, et suit la réponse écrite du délégué à
 * la protection des données. Le serveur vérifie la relation au sujet ; ici on ne fait que la proposer.
 */

const DROITS: { valeur: Droit; titre: string; texte: string; icone: typeof FileSearch }[] = [
  { valeur: "acces", titre: "Accès", texte: "Savoir quelles données sont conservées, et qui les a consultées.", icone: FileSearch },
  { valeur: "rectification", titre: "Rectification", texte: "Faire corriger une donnée inexacte.", icone: PenLine },
  { valeur: "limitation", titre: "Limitation", texte: "Suspendre un usage le temps d'une vérification.", icone: ShieldOff },
  { valeur: "opposition", titre: "Opposition", texte: "Refuser un traitement qui n'est pas obligatoire.", icone: X },
];
const LIBELLE: Record<Droit, string> = { acces: "Accès", rectification: "Rectification", limitation: "Limitation", opposition: "Opposition" };
const CRITERE: Record<string, string> = { role: "rôle", perimetre: "périmètre", relation: "relation", finalite: "finalité" };
const date = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const moment = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function MesDroits({ sujets }: { sujets: { valeur: string; libelle: string }[] }) {
  const q = useMesDemandesDroits();
  const depot = useDeposerDemandeDroit();
  const [droit, setDroit] = useState<Droit>("acces");
  const [sujet, setSujet] = useState(sujets[0]?.valeur ?? "compte");
  const [precision, setPrecision] = useState("");
  const erreur = depot.error instanceof ErreurApi ? depot.error.message : depot.error ? "Envoi impossible pour le moment." : null;

  const envoyer = () => {
    if (precision.trim().length < 10) return;
    depot.mutate({ droit, sujet, precision: precision.trim() }, {
      onSuccess: (r) => {
        setPrecision("");
        notifier({ ton: "succes", titre: "Demande envoyée", texte: `Le délégué à la protection des données vous répondra avant le ${date(r.echeance)}.` });
      },
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader surtitre="Vos droits" titre="Mes données" />
      <Card className="min-w-0">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Nouvelle demande</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Droit exercé">
          {DROITS.map((d) => (
            <button key={d.valeur} type="button" role="radio" aria-checked={droit === d.valeur} onClick={() => setDroit(d.valeur)}
              className={cn("flex items-start gap-3 rounded-xl border p-3 text-left transition", droit === d.valeur ? "border-blue bg-blue-soft/60 ring-2 ring-blue/20" : "border-line/70 hover:bg-surface-2")}>
              <d.icone size={18} className={cn("mt-0.5 shrink-0", droit === d.valeur ? "text-accent-ink" : "text-ink-muted")} aria-hidden />
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold text-ink">{d.titre}</span>
                <span className="block text-[12.5px] leading-snug text-ink-muted">{d.texte}</span>
              </span>
            </button>
          ))}
        </div>
        {sujets.length > 1 && (
          <label className="mt-4 block">
            <span className="text-[13px] font-medium text-ink">Données concernées</span>
            <select value={sujet} onChange={(e) => setSujet(e.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-line bg-bg px-3 text-[14px] text-ink outline-none focus:border-blue focus:ring-4 focus:ring-blue/15">
              {sujets.map((s) => <option key={s.valeur} value={s.valeur}>{s.libelle}</option>)}
            </select>
          </label>
        )}
        <label className="mt-4 block">
          <span className="text-[13px] font-medium text-ink">Votre demande <span className="text-critical">*</span></span>
          <textarea value={precision} onChange={(e) => setPrecision(e.target.value.slice(0, 500))} rows={4}
            placeholder={droit === "rectification" ? "Quelle donnée est inexacte, et quelle est la bonne valeur ?" : "Précisez votre demande."}
            className="mt-1.5 w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-[14px] text-ink outline-none focus:border-blue focus:ring-4 focus:ring-blue/15" />
          <span className="mt-1 block text-xs text-ink-muted">{precision.trim().length}/500 · 10 caractères minimum</span>
        </label>
        {erreur && <p role="alert" className="mt-3 rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">{erreur}</p>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12.5px] text-ink-muted">Réponse écrite sous 30 jours. Chaque demande est journalisée.</p>
          <Button icone={Send} onClick={envoyer} disabled={precision.trim().length < 10} chargement={depot.isPending}>Envoyer</Button>
        </div>
      </Card>

      <section aria-labelledby="mes-demandes">
        <h2 id="mes-demandes" className="mb-3 text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Mes demandes</h2>
        {q.isPending ? <Squelette className="h-24 rounded-2xl" />
          : !q.data?.length ? <Card><EtatVide icone={ShieldCheck} titre="Aucune demande" texte="Vos demandes et les réponses du délégué apparaîtront ici." /></Card>
          : (
            <Cascade className="space-y-3">
              {q.data.map((d) => {
                const enCours = d.statut === "ouverte" || d.statut === "en_cours";
                return (
                  <Element key={d.id}>
                    <Card className="min-w-0">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="font-semibold text-ink">{d.droit ? LIBELLE[d.droit] : "Demande"} · <span className="font-normal text-ink-2">{d.sujet === "compte" ? "mon compte" : `dossier ${d.sujet}`}</span></p>
                        {enCours ? <Badge ton="info" icone={Clock}>En cours</Badge> : d.statut === "refusee" ? <Badge ton="critique">Refus motivé</Badge> : <Badge ton="succes" icone={CircleCheck}>Répondue</Badge>}
                      </div>
                      <p className="mt-1 text-[12.5px] text-ink-muted">Déposée le {date(d.deposeeLe)}{enCours && d.echeance ? ` · réponse avant le ${date(d.echeance)}` : ""}</p>
                      {d.precision && <p className="mt-2 text-[13.5px] text-ink-2">« {d.precision} »</p>}
                      {d.reponse?.texte && (
                        <div className={cn("mt-3 rounded-lg px-3 py-2.5 text-[13.5px]", d.statut === "refusee" ? "bg-critical-bg text-critical" : "bg-success-bg text-success")}>
                          <p className="text-[12px] font-semibold uppercase tracking-[0.08em]">Réponse du délégué · {date(d.reponse.le)}</p>
                          <p className="mt-1 whitespace-pre-line">{d.reponse.texte}</p>
                        </div>
                      )}
                    </Card>
                  </Element>
                );
              })}
            </Cascade>
          )}
      </section>

      <section aria-labelledby="mes-consultations">
        <h2 id="mes-consultations" className="mb-3 text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Consultations de ces données</h2>
        <BlocConsultations sujet={sujet} />
      </section>
    </div>
  );
}

/**
 * Le droit d'accès tel qu'il est annoncé ci-dessus (« savoir qui les a consultées ») porte ici sur la seule
 * trace que le service tienne : les décisions prises côté serveur à une porte nommée. Deux bornes sont dites
 * à l'utilisateur plutôt que cachées derrière un écran vide — douze mois, deux cents lignes — et ses propres
 * lectures sont retirées, puisque ce ne sont pas des accès d'un tiers.
 */
function BlocConsultations({ sujet }: { sujet: string }) {
  const q = useMesConsultations(sujet);
  const trace = q.data;
  if (q.isPending) return <Squelette className="h-28 rounded-2xl" />;
  // Ni en cours, ni lue : la trace a manqué, et le texte rendu est celui du service, pas un message générique.
  if (!trace) {
    const message = q.error instanceof ErreurApi ? q.error.message : "Lecture de la trace impossible pour le moment.";
    return <Card><p role="alert" className="text-[13.5px] text-critical">{message}</p><Button variante="secondaire" taille="sm" className="mt-3" onClick={() => q.refetch()}>Réessayer</Button></Card>;
  }

  const refus = trace.lignes.filter((l) => !l.autorise).length;
  return (
    <Card className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[13.5px] font-semibold text-ink">
          {trace.lignes.length} accès enregistré{trace.lignes.length > 1 ? "s" : ""} depuis le {date(trace.depuis)}
        </p>
        {refus > 0 && <Badge ton="critique" icone={ShieldOff}>{refus} refusé{refus > 1 ? "s" : ""}</Badge>}
      </div>
      <p className="mt-1 text-[12.5px] leading-snug text-ink-muted">
        Vos propres consultations ne sont pas listées. Certaines lectures répétées sont regroupées : la trace dit
        quelles portes ont été franchies, pas chaque rafraîchissement d'écran.{trace.tronque && " Seuls les 200 accès les plus récents sont affichés."}
      </p>

      {!trace.lignes.length ? (
        <EtatVide icone={Eye} titre="Aucun accès d'un tiers sur cette période" texte="Rien n'a été consulté à votre sujet depuis douze mois. Le service n'affiche que cette fenêtre : pour une trace plus ancienne, adressez une demande d'accès ci-dessus." />
      ) : (
        <Cascade className="mt-4 space-y-2.5">
          {trace.lignes.map((l, i) => (
            <Element key={`${l.horodatage}-${i}`} className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-lg border border-line/60 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-medium text-ink">{l.action}</span>
                <span className="mt-0.5 block text-[12.5px] text-ink-muted">{moment(l.horodatage)} · {FINALITE_LIBELLE[l.finalite] ?? l.finalite}</span>
              </span>
              {l.autorise
                ? <Badge ton="succes" icone={CircleCheck}>Accordé · {l.agent}</Badge>
                : <Badge ton="critique" icone={ShieldOff}>Refusé · {CRITERE[l.motifRefus ?? ""] ?? "critère non précisé"}</Badge>}
            </Element>
          ))}
        </Cascade>
      )}
    </Card>
  );
}
