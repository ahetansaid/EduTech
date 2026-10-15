"use client";

import type { DefinitionIndicateur } from "@beile/contracts";
import { BookOpen, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { PagePublique } from "@/components/public/CadrePublic";
import { EtatVide, Squelette } from "@/components/ui/primitives";
import { useDictionnaire } from "@/lib/api/gouvernance";

/**
 * Définitions publiques des indicateurs : le dictionnaire national est ouvert à tous, par choix de transparence.
 * Il ne contient aucune donnée personnelle — seulement ce que chaque chiffre mesure, comment il se calcule, d'où
 * il vient, et sous quel effectif il n'est jamais publié.
 */
const DEGRE: Record<DefinitionIndicateur["rattachementOdd"]["degre"], string> = { exact: "Indicateur ODD", analogique: "Proche d'un indicateur ODD", absent: "Hors cadre ODD" };

export default function PageDefinitions() {
  const q = useDictionnaire();
  const [recherche, setRecherche] = useState("");
  const fiches = useMemo(() => {
    const r = recherche.trim().toLocaleLowerCase("fr");
    return (q.data ?? []).filter((f) => !r || `${f.nom} ${f.definition} ${f.code}`.toLocaleLowerCase("fr").includes(r)).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  }, [q.data, recherche]);

  return (
    <PagePublique large surtitre="Données ouvertes" titre="Définitions des indicateurs" intro="Ce que mesure chaque chiffre publié, comment il se calcule, d'où il vient, et le seuil sous lequel il n'est jamais diffusé. Aucune donnée personnelle.">
      <label className="relative mb-5 block max-w-md">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
        <input value={recherche} onChange={(e) => setRecherche(e.target.value.slice(0, 80))} placeholder="Rechercher un indicateur" aria-label="Rechercher un indicateur"
          className="h-11 w-full rounded-full border border-line bg-surface pl-9 pr-4 text-[14px] text-ink outline-none focus:border-blue/50 focus:ring-2 focus:ring-blue/20" />
      </label>
      {q.isPending ? (
        <div className="grid gap-3 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <Squelette key={i} className="h-44 rounded-2xl" />)}</div>
      ) : q.isError ? (
        <EtatVide icone={BookOpen} titre="Les définitions n'ont pas pu être chargées" texte={q.error.message} />
      ) : !fiches.length ? (
        <EtatVide icone={Search} titre="Aucun indicateur ne correspond" texte="Essayez un autre mot : effectif, réussite, abandon, parité…" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {fiches.map((f) => (
            <article key={f.code} className="rounded-2xl border border-line/70 bg-surface p-5 shadow-float">
              <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted">{DEGRE[f.rattachementOdd.degre]}{f.rattachementOdd.code ? ` · ${f.rattachementOdd.code}` : ""}</p>
              <h2 className="mt-1 text-[16px] font-semibold text-ink">{f.nom}</h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{f.definition}</p>
              <dl className="mt-3 space-y-1.5 text-[12.5px]">
                <div><dt className="inline text-ink-muted">Calcul : </dt><dd className="inline text-ink">{f.formule}</dd></div>
                <div><dt className="inline text-ink-muted">Source : </dt><dd className="inline text-ink">{f.source} · {f.frequence}</dd></div>
                <div><dt className="inline text-ink-muted">Jamais publié sous : </dt><dd className="inline text-ink">{f.effectifMinimalPublication} personnes par case</dd></div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </PagePublique>
  );
}
