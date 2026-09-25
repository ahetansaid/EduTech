"use client";

import type { ReponseAsk } from "@beile/contracts";
import { AlertCircle, ArrowUp, Braces, CircleSlash, Database, RotateCcw, ScrollText, ShieldAlert, Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { BarresClassees, Courbes } from "@/components/charts/Graphiques";
import { AnimatePresence, EASE, motion } from "@/components/motion";
import { CarteBenin, LegendeSequentielle } from "@/components/map/CarteBenin";
import { BadgeConfiance, Provenance } from "@/components/ui/donnees";
import { Badge, Button, Card, EtatVide, Etiquette, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { entier, nombre, pourcent } from "@/lib/format";
import { ErreurApi } from "@/lib/http";
import { useAskMutation } from "@/lib/api/pilotage";
import { libellePerimetre, useHabilitationPilotage } from "../_commun";

/**
 * Ask Education (P3) : la question part au serveur (POST /ask), qui la traduit en requête structurée sur le
 * dictionnaire national, contrôle le périmètre, calcule sur le registre et journalise. Le navigateur n'affiche
 * que ce que le serveur a décidé : réponse chiffrée avec sa provenance, ou refus motivé.
 */

const EXEMPLES = [
  "Pour les élèves âgés de 11 à 13 ans en 2025-2026, quelle est la proportion ayant obtenu une moyenne ≥ 15/20 en mathématiques, par sexe ?",
  "Dans quels départements la proportion d'élèves ayant au moins 15/20 en mathématiques est-elle la plus faible ?",
  "Comment a évolué la proportion d'élèves ayant au moins 15/20 en mathématiques depuis 2022 ?",
  "Quel est le taux d'abandon dans les communes rurales de l'Atacora ?",
  "Quelles communes ont le ratio d'apprenants par enseignant le plus élevé ?",
  "Montre-moi les notes de Aïcha ZANNOU",
];

const MOTIF: Record<string, { titre: string; ton: string; securite: boolean }> = {
  donnee_individuelle: { titre: "Donnée individuelle : refus journalisé", ton: "Ask Education ne restitue jamais une personne", securite: true },
  hors_perimetre: { titre: "Hors de votre périmètre : refus journalisé", ton: "Le contrôle d'accès s'applique aussi aux questions", securite: true },
  indicateur_inconnu: { titre: "Indicateur non défini", ton: "Aucun chiffre n'est produit sans définition officielle", securite: false },
  question_ambigue: { titre: "Question non traitable telle quelle", ton: "Le système préfère refuser qu'approximer", securite: false },
};

type Echange =
  | { id: number; question: string; etat: "attente" }
  | { id: number; question: string; etat: "reponse"; reponse: ReponseAsk }
  | { id: number; question: string; etat: "erreur"; erreur: unknown };

type Repondu = Extract<ReponseAsk, { statut: "repondu" }>;

function formaterValeur(r: Repondu["resultat"], v: number | null) {
  if (v == null) return "—";
  const u = r.definition.unite;
  return u === "pourcentage" ? pourcent(v) : u === "note" ? `${nombre(v, 2)}/20` : u === "ratio" ? nombre(v, 1) : entier(v);
}

const ETAPES = ["Traduction en requête", "Validation du schéma", "Contrôle des droits", "Calcul sur le registre"];

function EnAttente({ question }: { question: string }) {
  return (
    <Card className="min-w-0">
      <p className="text-[12.5px] font-medium text-ink-muted">« {question} »</p>
      <ol className="mt-3 grid gap-2 text-[13px] sm:grid-cols-4">
        {ETAPES.map((e, i) => (
          <motion.li key={e} initial={{ opacity: 0.35 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.18, duration: 0.3 }} className="flex items-center gap-2 text-ink-2">
            <span className="h-2 w-2 shrink-0 animate-pulse-soft rounded-full bg-blue" style={{ animationDelay: `${i * 120}ms` }} aria-hidden />{e}
          </motion.li>
        ))}
      </ol>
    </Card>
  );
}

function Erreur({ question, erreur, onReessayer }: { question: string; erreur: unknown; onReessayer: () => void }) {
  const e = erreur instanceof ErreurApi ? erreur : null;
  const refus = e?.refus;
  const trop = e?.statut === 429;
  return (
    <Card className={cn("min-w-0", refus ? "border-critical/25" : "border-warning/30")}>
      <div className="flex items-start gap-3">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-md", refus ? "bg-critical-bg text-critical" : "bg-warning-bg text-warning")}>
          {refus ? <ShieldAlert size={19} aria-hidden /> : <AlertCircle size={19} aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-ink-muted">« {question} »</p>
          <p className="mt-1 font-display text-[17px] font-bold text-ink">{refus ? "Accès refusé" : trop ? "Trop de questions en peu de temps" : "Service momentanément indisponible"}</p>
          <p className="mt-1 text-[14px] text-ink-2">{erreur instanceof Error ? erreur.message : "Erreur inattendue"}{refus ? ". Le refus a été journalisé." : ""}</p>
          {!refus && <Button className="mt-3" taille="sm" variante="secondaire" icone={RotateCcw} onClick={onReessayer}>{trop ? "Réessayer dans une minute" : "Réessayer"}</Button>}
        </div>
      </div>
    </Card>
  );
}

function Reponse({ r }: { r: ReponseAsk }) {
  const [json, setJson] = useState(false);
  if (r.statut === "refuse") {
    const m = MOTIF[r.motif] ?? { titre: "Question refusée", ton: "Le système préfère refuser qu'approximer", securite: false };
    return (
      <Card className={cn("min-w-0", m.securite ? "border-critical/25" : "border-warning/30")}>
        <div className="flex items-start gap-3">
          <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-md", m.securite ? "bg-critical-bg text-critical" : "bg-warning-bg text-warning")}>
            {m.securite ? <ShieldAlert size={19} aria-hidden /> : <CircleSlash size={19} aria-hidden />}
          </span>
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-ink-muted">« {r.question} »</p>
            <p className="mt-1 font-display text-[17px] font-bold text-ink">{m.titre}</p>
            <p className="mt-1 text-[14px] text-ink-2">{r.explication}</p>
            <p className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
              {m.ton}. Aucun chiffre n'a été calculé.
              {m.securite && <Badge ton="critique" icone={ScrollText}>Inscrit au journal d'audit</Badge>}
            </p>
            {r.requete && (
              <>
                <button type="button" onClick={() => setJson((j) => !j)} className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-[12.5px] font-semibold text-blue hover:underline">
                  <Braces size={14} aria-hidden /> {json ? "Masquer" : "Voir"} la requête refusée
                </button>
                {json && <pre className="mt-2 max-h-60 overflow-auto rounded-md bg-navy-deep p-3 font-mono text-[11.5px] leading-relaxed text-[#cfe3ff]">{JSON.stringify(r.requete, null, 2)}</pre>}
              </>
            )}
          </div>
        </div>
      </Card>
    );
  }
  const res = r.resultat;
  const ventil = r.requete.ventilation;
  const parCarte = ventil.length === 1 && (ventil[0] === "commune" || ventil[0] === "departement");
  const temporel = ventil[0] === "annee";
  const masquees = res.lignes.filter((l) => l.masquee).length;
  const valeurs = parCarte ? new Map(res.lignes.map((l) => [l.cle, l.valeur])) : undefined;
  const bornes = res.lignes.map((l) => l.valeur).filter((v): v is number => v != null);
  const croissant = /plus faibles?|plus bas|moins (bon|élev)/i.test(r.question);
  const lignes = croissant && !temporel ? [...res.lignes].sort((a, b) => (a.valeur ?? Infinity) - (b.valeur ?? Infinity)) : res.lignes;
  const barres = lignes.map((l) => ({ cle: l.cle, libelle: l.libelle, valeur: l.valeur, masquee: l.masquee, effectif: l.effectif }));

  return (
    <Card className="min-w-0 overflow-hidden p-0">
      <div className="border-b border-line/60 px-5 py-4">
        <p className="text-[12.5px] font-medium text-ink-muted">« {r.question} »</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {r.interpretation.split(" · ").map((i) => (
            <Badge key={i} ton={i.startsWith("Attention") ? "avertissement" : "marque"}>{i}</Badge>
          ))}
        </div>
      </div>
      <div className={cn("grid gap-6 p-5", parCarte ? "lg:grid-cols-[18rem_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]")}>
        <div className="min-w-0">
          <Etiquette>{res.definition.nom}</Etiquette>
          <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE }} className="mt-2 font-display text-[40px] font-bold leading-none tracking-tight text-ink tabular sm:text-[44px]">
            {formaterValeur(res, res.valeur)}
          </motion.p>
          {res.numerateur != null && <p className="mt-2 text-[13px] text-ink-2">{entier(res.numerateur)} apprenants sur {entier(res.denominateur)} évalués</p>}
          <p className="mt-1 text-[13px] text-ink-muted">Période : {res.periode}{temporel ? " (valeur de la dernière année)" : ""}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <BadgeConfiance confiance={res.confiance} />
            {masquees > 0 && <Badge ton="avertissement">{masquees} cellule{masquees > 1 ? "s" : ""} masquée{masquees > 1 ? "s" : ""} (effectif &lt; {res.definition.effectifMinimalPublication})</Badge>}
            <Badge ton="neutre" icone={ScrollText}>Requête journalisée</Badge>
          </div>
          <button type="button" onClick={() => setJson((j) => !j)} className="mt-5 inline-flex min-h-9 items-center gap-1.5 text-[12.5px] font-semibold text-blue hover:underline">
            <Braces size={14} aria-hidden /> {json ? "Masquer" : "Voir"} la requête structurée
          </button>
          <AnimatePresence initial={false}>
            {json && (
              <motion.pre initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-2 max-h-72 overflow-auto rounded-md bg-navy-deep p-3 font-mono text-[11.5px] leading-relaxed text-[#cfe3ff]">
                {JSON.stringify(r.requete, null, 2)}
              </motion.pre>
            )}
          </AnimatePresence>
          <p className="mt-3 text-[11.5px] leading-snug text-ink-muted">Le traducteur n'a produit que cette requête : le chiffre a été calculé par le moteur sur le registre, côté serveur, jamais généré.</p>
        </div>
        <div className="min-w-0">
          {parCarte && valeurs ? (
            <div className="grid items-start gap-6 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
              <CarteBenin valeurs={valeurs} niveau={ventil[0] === "commune" ? "communes" : "departements"} formater={(v) => formaterValeur(res, v)} libelleValeur={res.definition.nom} hauteur={420}
                className="mx-auto w-full max-w-[300px]"
                legende={bornes.length ? <LegendeSequentielle min={Math.min(...bornes)} max={Math.max(...bornes)} libelle="" formater={(v) => formaterValeur(res, v)} /> : null} />
              <BarresClassees barres={barres} formater={(v) => formaterValeur(res, v)} reference={res.valeur != null ? { valeur: res.valeur, libelle: "Ensemble" } : undefined} limite={12} />
            </div>
          ) : temporel && ventil.length === 1 ? (
            <Courbes series={[{ nom: res.definition.nom, points: res.lignes.map((l) => ({ x: l.cle.replace("-20", "-"), y: l.valeur })) }]} formater={(v) => formaterValeur(res, v)} />
          ) : temporel && ventil.length === 2 ? (
            <Courbes
              formater={(v) => formaterValeur(res, v)}
              series={[...new Set(res.lignes.map((l) => l.libelle.split(" · ")[1]!))].map((nom) => ({
                nom, points: res.lignes.filter((l) => l.libelle.endsWith(nom)).map((l) => ({ x: l.cle.split("¦")[0]!.replace("-20", "-"), y: l.valeur })),
              }))}
            />
          ) : res.lignes.length ? (
            <BarresClassees barres={barres} formater={(v) => formaterValeur(res, v)} reference={res.valeur != null ? { valeur: res.valeur, libelle: "Ensemble" } : undefined} limite={12} />
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg bg-surface-2/60 p-6 text-center text-[13px] text-ink-muted">Valeur unique, sans ventilation. Ajoutez « par sexe », « par département » ou « depuis 2022 » pour explorer.</div>
          )}
        </div>
      </div>
      <details className="border-t border-line/60 px-5 py-4">
        <summary className="flex min-h-9 cursor-pointer items-center gap-2 text-[13px] font-semibold text-ink"><Database size={14} aria-hidden /> Définition, source, couverture et méthode</summary>
        <Provenance resultat={res} className="mt-4" />
      </details>
    </Card>
  );
}

function Ask() {
  const hab = useHabilitationPilotage();
  const params = useSearchParams();
  const ask = useAskMutation();
  const [saisie, setSaisie] = useState("");
  const [echanges, setEchanges] = useState<Echange[]>([]);
  const suivant = useRef(0);
  const deja = useRef(false);

  const poser = (question: string) => {
    const q = question.trim().slice(0, 400);
    if (q.length < 3 || ask.isPending) return;
    const id = ++suivant.current;
    setSaisie("");
    setEchanges((es) => [{ id, question: q, etat: "attente" }, ...es]);
    ask.mutate(q, {
      onSuccess: (reponse) => setEchanges((es) => es.map((e) => (e.id === id ? { id, question: q, etat: "reponse", reponse } : e))),
      onError: (erreur) => setEchanges((es) => es.map((e) => (e.id === id ? { id, question: q, etat: "erreur", erreur } : e))),
    });
  };

  useEffect(() => {
    const q = params.get("q");
    if (q && !deja.current) { deja.current = true; poser(q); }
  });

  const refusesSecurite = echanges.filter((e) => e.etat === "reponse" && e.reponse.statut === "refuse" && MOTIF[e.reponse.motif]?.securite).length;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        surtitre="Requête contrôlée · processus P3"
        titre="Ask Education"
        sousTitre="Posez une question en français. Le serveur la traduit en requête sur le dictionnaire national, vérifie vos droits, calcule sur le registre, puis renvoie la source, la couverture et la confiance. Il n'invente jamais un chiffre."
      />
      <form
        data-guide="ask-question"
        onSubmit={(e) => { e.preventDefault(); poser(saisie); }}
        className="relative rounded-xl border border-line/70 bg-surface p-2 shadow-float transition-shadow focus-within:border-blue focus-within:ring-4 focus-within:ring-blue/15"
      >
        <textarea
          value={saisie}
          onChange={(e) => setSaisie(e.target.value.slice(0, 400))}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); poser(saisie); } }}
          rows={2}
          placeholder="Ex. : Proportion d'élèves de 11 à 13 ans ayant au moins 15/20 en mathématiques, par département ?"
          className="w-full resize-none bg-transparent px-3 py-2 text-[15px] text-ink outline-none placeholder:text-ink-muted"
          aria-label="Votre question"
          maxLength={400}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-1">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-[12px] text-ink-muted">
            <Sparkles size={13} className="shrink-0 text-amber" aria-hidden /> Périmètre appliqué par le serveur : {libellePerimetre(hab?.perimetre)}
            <span className="hidden tabular sm:inline">· {saisie.length}/400</span>
          </span>
          <button type="submit" disabled={saisie.trim().length < 3 || ask.isPending} className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-white transition-transform active:scale-[0.97] disabled:opacity-40 dark:bg-blue dark:text-navy-deep" aria-label="Envoyer la question">
            {ask.isPending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <ArrowUp size={17} aria-hidden />}
          </button>
        </div>
      </form>

      <div data-guide="ask-exemples" className="flex flex-wrap gap-2">
        {EXEMPLES.map((q) => (
          <button key={q} type="button" disabled={ask.isPending} onClick={() => poser(q)} className="min-h-10 rounded-md border border-line/70 bg-surface px-3 py-1.5 text-left text-[12.5px] text-ink-2 transition hover:-translate-y-0.5 hover:text-ink hover:shadow-float disabled:opacity-50">{q}</button>
        ))}
      </div>

      {echanges.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
          <span>{echanges.length} question{echanges.length > 1 ? "s" : ""} dans cette séance</span>
          {refusesSecurite > 0 && <Badge ton="critique" icone={ShieldAlert}>{refusesSecurite} refus de sécurité journalisé{refusesSecurite > 1 ? "s" : ""}</Badge>}
          <button type="button" onClick={() => setEchanges([])} className="ml-auto min-h-9 font-medium text-blue hover:underline">Effacer l'historique</button>
        </div>
      )}

      <div data-guide="ask-reponses" className="space-y-5">
        <AnimatePresence initial={false}>
          {echanges.map((e) => (
            <motion.div key={e.id} layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.35, ease: EASE }}>
              {e.etat === "attente" ? <EnAttente question={e.question} />
                : e.etat === "erreur" ? <Erreur question={e.question} erreur={e.erreur} onReessayer={() => { setEchanges((es) => es.filter((x) => x.id !== e.id)); poser(e.question); }} />
                : <Reponse r={e.reponse} />}
            </motion.div>
          ))}
        </AnimatePresence>
        {!echanges.length && (
          <Card className="min-w-0">
            <EtatVide icone={Sparkles} titre="Posez votre première question" texte="Choisissez un exemple ci-dessus ou tapez la vôtre. Essayez aussi une question sur une personne ou hors de votre territoire : le refus est expliqué et journalisé." />
          </Card>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense><Ask /></Suspense>;
}
