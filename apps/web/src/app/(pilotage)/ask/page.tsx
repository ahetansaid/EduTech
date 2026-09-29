"use client";

import type { FamilleQuestion, FigureAnalyse, ReponseAnalyse, TonConstat } from "@beile/contracts";
import { FAMILLE_LIBELLE } from "@beile/contracts";
import {
  AlertCircle, ArrowRight, ArrowUp, BarChart3, Braces, CircleCheck, CircleSlash, Database, GitCompareArrows, Info, LineChart, Map as IconeCarte,
  PieChart, RotateCcw, ScrollText, ShieldAlert, Siren, Sparkles, Telescope, TriangleAlert, Trophy, Scale, Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { BarresClassees, Courbes, Halteres } from "@/components/charts/Graphiques";
import { AnimatePresence, EASE, motion } from "@/components/motion";
import { CarteBenin, LegendeSequentielle } from "@/components/map/CarteBenin";
import { BadgeConfiance, Provenance } from "@/components/ui/donnees";
import { Badge, Button, Card, EtatVide, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { entier, nombre, pourcent } from "@/lib/format";
import { ErreurApi } from "@/lib/http";
import { useAnalyseMutation } from "@/lib/api/pilotage";
import { libellePerimetre, useHabilitationPilotage } from "../_commun";

/**
 * Ask Education (P3) : la question part au serveur (POST /analyse). Le moteur la range dans une famille
 * d'analyse, calcule sur le dictionnaire national sous le périmètre de l'utilisateur, choisit ses figures
 * et rédige ses constats par règles. Aucun modèle de langage : même question, mêmes données, même réponse.
 */

const FAMILLES: { famille: FamilleQuestion; icone: LucideIcon; exemple: string }[] = [
  { famille: "niveau", icone: Target, exemple: "Quel est le taux d'abandon dans le Zou ?" },
  { famille: "comparaison", icone: GitCompareArrows, exemple: "Comparer le ratio d'apprenants par enseignant de Cotonou, Parakou et Natitingou" },
  { famille: "classement", icone: Trophy, exemple: "Quels départements ont le taux d'abandon le plus élevé ?" },
  { famille: "evolution", icone: LineChart, exemple: "Comment a évolué le taux de réussite au BEPC depuis 2021 ?" },
  { famille: "repartition", icone: PieChart, exemple: "Répartition des effectifs par niveau" },
  { famille: "ecart", icone: Scale, exemple: "Écart entre urbain et rural pour le taux d'abandon" },
  { famille: "carte", icone: IconeCarte, exemple: "Carte du taux d'occupation des salles par commune" },
  { famille: "anomalies", icone: Siren, exemple: "Quelles communes sont atypiques pour le taux d'absentéisme ?" },
  { famille: "projection", icone: Telescope, exemple: "Projection des effectifs à l'horizon 2030" },
];
const ICONE_FAMILLE = Object.fromEntries(FAMILLES.map((f) => [f.famille, f.icone])) as Record<FamilleQuestion, LucideIcon>;

const MOTIF: Record<string, { titre: string; ton: string; securite: boolean }> = {
  donnee_individuelle: { titre: "Donnée individuelle : refus journalisé", ton: "Ask Education ne restitue jamais une personne", securite: true },
  hors_perimetre: { titre: "Hors de votre périmètre : refus journalisé", ton: "Le contrôle d'accès s'applique aussi aux questions", securite: true },
  indicateur_inconnu: { titre: "Indicateur non défini", ton: "Aucun chiffre n'est produit sans définition officielle", securite: false },
  question_ambigue: { titre: "Question non traitable telle quelle", ton: "Le système préfère refuser qu'approximer", securite: false },
};

const TON: Record<TonConstat, { icone: LucideIcon; classe: string; libelle: string }> = {
  favorable: { icone: CircleCheck, classe: "text-success", libelle: "Favorable" },
  defavorable: { icone: TriangleAlert, classe: "text-critical", libelle: "Défavorable" },
  alerte: { icone: Siren, classe: "text-warning", libelle: "À surveiller" },
  neutre: { icone: Info, classe: "text-ink-muted", libelle: "Constat" },
};

type Echange =
  | { id: number; question: string; etat: "attente" }
  | { id: number; question: string; etat: "reponse"; reponse: ReponseAnalyse }
  | { id: number; question: string; etat: "erreur"; erreur: unknown };


const formaterSelon = (unite: string) => (v: number) =>
  unite === "pourcentage" ? pourcent(v) : unite === "note" ? `${nombre(v, 2)}/20` : unite === "ratio" ? nombre(v, 1) : unite === "indice" ? nombre(v, 2) : unite === "jours" ? `${entier(v)} j` : entier(v);

const ETAPES = ["Lecture de la question", "Choix de l'analyse", "Contrôle des droits", "Calcul et rédaction"];

function EnAttente({ question }: { question: string }) {
  return (
    <Card className="min-w-0">
      <p className="text-[12.5px] font-medium text-ink-muted">« {question} »</p>
      <ol className="mt-3 grid gap-2 text-[13px] sm:grid-cols-4">
        {ETAPES.map((e, i) => (
          <motion.li key={e} initial={{ opacity: 0.35 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.15, duration: 0.3 }} className="flex items-center gap-2 text-ink-2">
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

/** Une figure décrite par le serveur, dessinée par le composant qui lui correspond. */
function Figure({ f, unite }: { f: FigureAnalyse; unite: string }) {
  const fmt = formaterSelon(unite);
  if (f.type === "chiffre") {
    return (
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{f.titre}</p>
        <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE }} className="mt-2 font-display text-[42px] font-bold leading-none tracking-tight text-ink tabular sm:text-[48px]">
          {f.valeur != null ? fmt(f.valeur) : "—"}
        </motion.p>
        <div className="mt-3 flex flex-wrap gap-2">
          {f.reference?.valeur != null && <Badge ton="neutre">{f.reference.libelle} : {fmt(f.reference.valeur)}</Badge>}
          {f.rang && <Badge ton="marque" icone={Trophy}>{f.rang.position === 1 ? "1er" : `${f.rang.position}e`} / {f.rang.sur} {f.rang.libelle}</Badge>}
        </div>
      </div>
    );
  }
  const titre = <p className="mb-3 text-[13px] font-semibold text-ink">{f.titre}</p>;
  if (f.type === "barres") return <div className="min-w-0">{titre}<BarresClassees barres={f.barres} formater={fmt} reference={f.reference ?? undefined} limite={f.limite ?? 12} /></div>;
  if (f.type === "courbes") return <div className="min-w-0">{titre}<Courbes series={f.series} formater={fmt} /></div>;
  if (f.type === "haltere") return <div className="min-w-0">{titre}<Halteres lignes={f.lignes} libelleA={f.libelleA} libelleB={f.libelleB} formater={fmt} /></div>;
  const valeurs = new Map(Object.entries(f.valeurs));
  const bornes = [...valeurs.values()].filter((v): v is number => v != null);
  return (
    <div className="min-w-0">
      {titre}
      <CarteBenin valeurs={valeurs} niveau={f.niveau} focusDepartement={f.focusDepartement ?? undefined} formater={fmt} libelleValeur={f.titre} hauteur={f.focusDepartement ? 360 : 440}
        className="mx-auto w-full max-w-[320px]"
        legende={bornes.length ? <LegendeSequentielle min={Math.min(...bornes)} max={Math.max(...bornes)} libelle="" formater={fmt} /> : null} />
    </div>
  );
}

function Reponse({ r, onQuestion }: { r: ReponseAnalyse; onQuestion: (q: string) => void }) {
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
            {r.suggestions.length > 0 && <Suggestions r={r} onQuestion={onQuestion} titre="Questions que le moteur sait traiter" />}
          </div>
        </div>
      </Card>
    );
  }
  const Icone = ICONE_FAMILLE[r.famille] ?? BarChart3;
  const [premiere, ...autres] = r.figures;
  const chiffre = premiere?.type === "chiffre" ? premiere : null;
  const figures = chiffre ? autres : r.figures;
  const res = r.resultats[0];
  return (
    <Card className="min-w-0 overflow-hidden p-0">
      <div className="border-b border-line/60 px-5 py-4">
        <p className="text-[12.5px] font-medium text-ink-muted">« {r.question} »</p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {r.interpretation.map((i, k) => <Badge key={i} ton={i.startsWith("Attention") ? "avertissement" : k === 0 ? "info" : "marque"} icone={k === 0 ? Icone : undefined}>{i}</Badge>)}
        </div>
        <h2 className="mt-3 font-display text-[20px] font-bold leading-snug text-ink sm:text-[22px]">{r.titre}</h2>
      </div>

      <div className={cn("grid gap-6 p-5", chiffre && "lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]")}>
        {chiffre && <Figure f={chiffre} unite={r.unite} />}
        <ul className="min-w-0 space-y-2.5" aria-label="Constats">
          {r.constats.map((c, i) => {
            const t = TON[c.ton];
            return (
              <motion.li key={c.texte} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 * i, duration: 0.35, ease: EASE }}
                className="flex items-start gap-2.5 text-[14.5px] leading-relaxed text-ink">
                <t.icone size={17} className={cn("mt-[3px] shrink-0", t.classe)} aria-label={t.libelle} />
                <span>{c.texte}</span>
              </motion.li>
            );
          })}
        </ul>
      </div>

      {figures.length > 0 && (
        <div className={cn("grid gap-6 border-t border-line/60 p-5", figures.length > 1 && "lg:grid-cols-2")}>
          {figures.map((f, i) => <Figure key={`${f.type}-${i}`} f={f} unite={r.unite} />)}
        </div>
      )}

      {(r.avertissements.length > 0 || res) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line/60 px-5 py-3">
          {res && <BadgeConfiance confiance={res.confiance} />}
          {r.avertissements.map((a) => <Badge key={a} ton="avertissement" icone={TriangleAlert}>{a}</Badge>)}
          <Badge ton="neutre" icone={ScrollText}>Question journalisée</Badge>
        </div>
      )}

      {r.suggestions.length > 0 && <div className="border-t border-line/60 px-5 py-4"><Suggestions r={r} onQuestion={onQuestion} titre="Pour aller plus loin" /></div>}

      <details className="border-t border-line/60 px-5 py-4">
        <summary className="flex min-h-9 cursor-pointer items-center gap-2 text-[13px] font-semibold text-ink"><Database size={14} aria-hidden /> Définition, source, méthode et calculs ({r.resultats.length})</summary>
        {res && <Provenance resultat={res} className="mt-4" />}
        <button type="button" onClick={() => setJson((j) => !j)} className="mt-4 inline-flex min-h-9 items-center gap-1.5 text-[12.5px] font-semibold text-blue hover:underline">
          <Braces size={14} aria-hidden /> {json ? "Masquer" : "Voir"} les requêtes exécutées
        </button>
        <AnimatePresence initial={false}>
          {json && (
            <motion.pre initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-2 max-h-72 overflow-auto rounded-md bg-navy-deep p-3 font-mono text-[11.5px] leading-relaxed text-[#cfe3ff]">
              {JSON.stringify(r.resultats.map((x) => x.requete), null, 2)}
            </motion.pre>
          )}
        </AnimatePresence>
        <p className="mt-3 text-[11.5px] leading-snug text-ink-muted">Chaque chiffre vient du calculateur officiel, sous votre périmètre ; les phrases sont produites par des règles publiées. Aucun modèle de langage n'intervient.</p>
      </details>
    </Card>
  );
}

function Suggestions({ r, onQuestion, titre }: { r: ReponseAnalyse; onQuestion: (q: string) => void; titre: string }) {
  return (
    <div className="mt-1">
      <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{titre}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {r.suggestions.map((s) => (
          <button key={s.question} type="button" onClick={() => onQuestion(s.question)}
            className="group inline-flex min-h-9 items-center gap-1.5 rounded-md border border-line/70 bg-surface px-3 py-1.5 text-left text-[12.5px] text-ink-2 transition hover:border-blue/40 hover:text-ink">
            <span className="font-semibold text-accent-ink">{s.libelle}</span> {s.question.replace(/^[^:]+ : /, "")}
            <ArrowRight size={13} className="shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
}

function Ask() {
  const hab = useHabilitationPilotage();
  const params = useSearchParams();
  const analyse = useAnalyseMutation();
  const [saisie, setSaisie] = useState("");
  const [echanges, setEchanges] = useState<Echange[]>([]);
  const suivant = useRef(0);
  const deja = useRef(false);

  const poser = (question: string) => {
    const q = question.trim().slice(0, 400);
    if (q.length < 3 || analyse.isPending) return;
    const id = ++suivant.current;
    setSaisie("");
    setEchanges((es) => [{ id, question: q, etat: "attente" }, ...es]);
    window.scrollTo({ top: 0, behavior: "smooth" });
    analyse.mutate(q, {
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
        surtitre="Analyse déterministe · processus P3"
        titre="Ask Education"
        sousTitre="Posez une question en français. Le moteur choisit l'analyse adaptée, calcule sur le dictionnaire national sous votre périmètre, illustre et rédige ses constats. Aucun modèle de langage : même question, même réponse, avec sa source."
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
          placeholder="Ex. : Quelles communes du Borgou ont le taux d'abandon le plus élevé ?"
          className="w-full resize-none bg-transparent px-3 py-2 text-[15px] text-ink outline-none placeholder:text-ink-muted"
          aria-label="Votre question"
          maxLength={400}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-1">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-[12px] text-ink-muted">
            <Sparkles size={13} className="shrink-0 text-amber" aria-hidden /> Périmètre appliqué par le serveur : {libellePerimetre(hab?.perimetre)}
            <span className="hidden tabular sm:inline">· {saisie.length}/400</span>
          </span>
          <button type="submit" disabled={saisie.trim().length < 3 || analyse.isPending} className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-white transition-transform active:scale-[0.97] disabled:opacity-40 dark:bg-blue dark:text-navy-deep" aria-label="Envoyer la question">
            {analyse.isPending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <ArrowUp size={17} aria-hidden />}
          </button>
        </div>
      </form>

      <div data-guide="ask-exemples" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {FAMILLES.map(({ famille, icone: I, exemple }) => (
          <button key={famille} type="button" disabled={analyse.isPending} onClick={() => poser(exemple)}
            className="group flex min-h-[4.25rem] items-start gap-2.5 rounded-lg border border-line/70 bg-surface p-3 text-left transition hover:-translate-y-0.5 hover:border-blue/30 hover:shadow-float disabled:opacity-50">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-soft text-accent-ink"><I size={16} aria-hidden /></span>
            <span className="min-w-0">
              <span className="block text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-muted">{FAMILLE_LIBELLE[famille]}</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-ink-2 group-hover:text-ink">{exemple}</span>
            </span>
          </button>
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
                : <Reponse r={e.reponse} onQuestion={poser} />}
            </motion.div>
          ))}
        </AnimatePresence>
        {!echanges.length && (
          <Card className="min-w-0">
            <EtatVide icone={Sparkles} titre="Posez votre première question" texte="Neuf familles d'analyse : situer une valeur, comparer, classer, suivre une évolution, répartir, mesurer un écart, cartographier, détecter des anomalies, projeter. Une question sur une personne ou hors de votre territoire est refusée, expliquée et journalisée." />
          </Card>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense><Ask /></Suspense>;
}
