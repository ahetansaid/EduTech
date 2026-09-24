"use client";

import type { Perimetre, ReponseAsk } from "@beile/contracts";
import { ArrowUp, Braces, CircleSlash, Database, ShieldAlert, Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { BarresClassees, Courbes } from "@/components/charts/Graphiques";
import { CarteBenin, LegendeSequentielle } from "@/components/map/CarteBenin";
import { BadgeConfiance, Provenance } from "@/components/ui/donnees";
import { Badge, Card, Etiquette, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { useCouches } from "@/lib/donnees";
import { entier, nombre, pourcent } from "@/lib/format";
import { QUESTIONS_EXEMPLES, repondre } from "@/lib/sim/ask";
import { useDemo, useProfil } from "@/lib/store";

const MOTIF: Record<string, { titre: string; ton: string }> = {
  donnee_individuelle: { titre: "Donnée individuelle : refus", ton: "Ask Education ne restitue jamais une personne" },
  hors_perimetre: { titre: "Hors de votre périmètre : refus journalisé", ton: "Le contrôle d'accès s'applique aussi aux questions" },
  indicateur_inconnu: { titre: "Indicateur non défini", ton: "Aucun chiffre n'est produit sans définition officielle" },
  question_ambigue: { titre: "Question non traitable telle quelle", ton: "Le système préfère refuser qu'approximer" },
};

function formaterValeur(r: Extract<ReponseAsk, { statut: "repondu" }>["resultat"], v: number | null) {
  if (v == null) return "—";
  const u = r.definition.unite;
  return u === "pourcentage" ? pourcent(v) : u === "note" ? `${nombre(v, 2)}/20` : u === "ratio" ? nombre(v, 1) : entier(v);
}

function Reponse({ r }: { r: ReponseAsk }) {
  const [json, setJson] = useState(false);
  if (r.statut === "refuse") {
    const m = MOTIF[r.motif]!;
    return (
      <Card className="animate-slide-up border-critical/25">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-critical-bg text-critical">{r.motif === "hors_perimetre" || r.motif === "donnee_individuelle" ? <ShieldAlert size={19} /> : <CircleSlash size={19} />}</span>
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-ink-muted">« {r.question} »</p>
            <p className="mt-1 font-display text-[17px] font-bold text-ink">{m.titre}</p>
            <p className="mt-1 text-[14px] text-ink-2">{r.explication}</p>
            <p className="mt-3 text-[12px] text-ink-muted">{m.ton}. Aucun chiffre n'a été calculé.</p>
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
    <Card className="animate-slide-up p-0">
      <div className="border-b border-line/60 px-5 py-4">
        <p className="text-[12.5px] font-medium text-ink-muted">« {r.question} »</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {r.interpretation.split(" · ").map((i) => (
            <Badge key={i} ton={i.startsWith("Attention") ? "avertissement" : "marque"}>{i}</Badge>
          ))}
        </div>
      </div>
      <div className={cn("grid gap-6 p-5", parCarte ? "lg:grid-cols-[18rem_1fr]" : "lg:grid-cols-[1fr_1.4fr]")}>
        <div>
          <Etiquette>{res.definition.nom}</Etiquette>
          <p className="mt-2 font-display text-[44px] font-bold leading-none tracking-tight text-ink tabular">{formaterValeur(res, res.valeur)}</p>
          {res.numerateur != null && <p className="mt-2 text-[13px] text-ink-2">{entier(res.numerateur)} apprenants sur {entier(res.denominateur)} évalués</p>}
          <p className="mt-1 text-[13px] text-ink-muted">Période : {res.periode}{temporel ? " (valeur de la dernière année)" : ""}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <BadgeConfiance confiance={res.confiance} />
            {masquees > 0 && <Badge ton="avertissement">{masquees} cellule{masquees > 1 ? "s" : ""} masquée{masquees > 1 ? "s" : ""} (effectif &lt; {res.definition.effectifMinimalPublication})</Badge>}
          </div>
          <button onClick={() => setJson((j) => !j)} className="mt-5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-blue hover:underline">
            <Braces size={14} aria-hidden /> {json ? "Masquer" : "Voir"} la requête structurée
          </button>
          {json && (
            <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-navy-deep p-3 font-mono text-[11.5px] leading-relaxed text-[#cfe3ff]">{JSON.stringify(r.requete, null, 2)}</pre>
          )}
          <p className="mt-3 text-[11.5px] leading-snug text-ink-muted">Le traducteur n'a produit que cette requête : le chiffre a été calculé par le moteur sur le registre, jamais généré.</p>
        </div>
        <div className="min-w-0">
          {parCarte && valeurs ? (
            <div className="grid items-start gap-6 md:grid-cols-[minmax(0,16rem)_1fr]">
              <CarteBenin valeurs={valeurs} niveau={ventil[0] === "commune" ? "communes" : "departements"} formater={(v) => formaterValeur(res, v)} libelleValeur={res.definition.nom} hauteur={420}
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
        <summary className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-ink"><Database size={14} aria-hidden /> Définition, source, couverture et méthode</summary>
        <Provenance resultat={res} className="mt-4" />
      </details>
    </Card>
  );
}

function perimetreDe(profil: ReturnType<typeof useProfil>): Perimetre {
  const h = profil.habilitations.find((x) => ["administration_centrale", "direction_departementale", "inspecteur", "chercheur"].includes(x.role));
  return h?.perimetre ?? { niveau: "etablissement", etablissementId: "" };
}

function Ask() {
  const couches = useCouches();
  const profil = useProfil();
  const journaliser = useDemo((s) => s.journaliser);
  const params = useSearchParams();
  const [saisie, setSaisie] = useState("");
  const [reponses, setReponses] = useState<ReponseAsk[]>([]);
  const [calcul, setCalcul] = useState(false);
  const deja = useRef(false);
  const perimetre = perimetreDe(profil);

  const poser = (question: string) => {
    const q = question.trim().slice(0, 400);
    if (!q) return;
    setCalcul(true);
    setSaisie("");
    // Léger délai : laisse voir l'étape de traduction et de contrôle.
    setTimeout(() => {
      const r = repondre(couches, q, perimetre);
      if (r.statut === "refuse" && (r.motif === "hors_perimetre" || r.motif === "donnee_individuelle")) {
        journaliser({ action: "Ask Education — requête refusée", ressource: q.slice(0, 120), finalite: "statistique", autorise: false, critereManquant: r.motif === "hors_perimetre" ? "perimetre" : "relation" });
      } else if (r.statut === "repondu") {
        journaliser({ action: "Ask Education — requête agrégée", ressource: r.resultat.definition.nom, finalite: "statistique", autorise: true, critereManquant: null });
      }
      setReponses((rs) => [r, ...rs]);
      setCalcul(false);
    }, 450);
  };

  useEffect(() => {
    const q = params.get("q");
    if (q && !deja.current) { deja.current = true; poser(q); }
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        surtitre="Requête contrôlée · processus P3"
        titre="Ask Education"
        sousTitre="Posez une question en français. Le système la traduit en requête sur le dictionnaire national, vérifie vos droits, calcule sur le registre, puis affiche la source, la couverture et la confiance. Il n'invente jamais un chiffre."
      />
      <form
        onSubmit={(e) => { e.preventDefault(); poser(saisie); }}
        className="relative rounded-xl border border-line/70 bg-surface p-2 shadow-float focus-within:ring-2 focus-within:ring-blue/40"
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
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted"><Sparkles size={13} className="text-amber" aria-hidden /> Périmètre appliqué : {perimetre.niveau === "national" ? "national" : perimetre.niveau === "departement" ? `département ${perimetre.departementId}` : perimetre.niveau === "circonscription" ? perimetre.circonscription : "—"}</span>
          <button type="submit" disabled={!saisie.trim() || calcul} className="flex h-9 w-9 items-center justify-center rounded-md bg-navy text-white disabled:opacity-40 dark:bg-blue dark:text-navy-deep" aria-label="Envoyer la question">
            <ArrowUp size={17} />
          </button>
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        {QUESTIONS_EXEMPLES.map((q) => (
          <button key={q} onClick={() => poser(q)} className="rounded-md border border-line/70 bg-surface px-3 py-1.5 text-left text-[12.5px] text-ink-2 transition hover:-translate-y-0.5 hover:text-ink hover:shadow-float">{q}</button>
        ))}
      </div>

      {calcul && (
        <Card className="animate-fade-in">
          <ol className="grid gap-2 text-[13px] sm:grid-cols-4">
            {["Traduction en requête", "Validation du schéma", "Contrôle des droits", "Calcul sur le registre"].map((e, i) => (
              <li key={e} className="flex items-center gap-2 text-ink-2"><span className={cn("h-2 w-2 rounded-full bg-blue animate-pulse-soft")} style={{ animationDelay: `${i * 120}ms` }} />{e}</li>
            ))}
          </ol>
        </Card>
      )}
      <div className="space-y-5">
        {reponses.map((r, i) => <Reponse key={reponses.length - i} r={r} />)}
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense><Ask /></Suspense>;
}
