"use client";

import { Search, TrendingDown, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "@/components/motion";
import { Sparkline } from "@/components/ui/donnees";
import { Badge, Card, EtatVide } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { nombre } from "@/lib/format";
import type { Carnet, EleveCarnet } from "@/lib/api/enseignant";
import { initiales } from "../../communs";

type Tri = "nom" | "moyenne" | "absences" | "baisse";
const sansAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Baisse marquée : au moins 5 points perdus sur les trois dernières évaluations. */
const enBaisse = (notes: number[]) => notes.length >= 3 && notes.at(-3)! - notes.at(-1)! >= 5;

/** Élèves de la classe : moyenne du trimestre, absences, évolution — cartes sur téléphone comme sur ordinateur. */
export function Eleves({ carnet }: { carnet: Carnet }) {
  const [recherche, setRecherche] = useState("");
  const [tri, setTri] = useState<Tri>("nom");

  const lignes = useMemo(() => carnet.eleves.map((e) => {
    const serie = [...e.notes].sort((a, b) => a.le.localeCompare(b.le)).map((n) => n.note);
    return { e, serie, baisse: enBaisse(serie) };
  }), [carnet.eleves]);

  const filtre = sansAccents(recherche.trim());
  const visibles = lignes
    .filter(({ e }) => !filtre || sansAccents(`${e.nom} ${e.prenoms}`).includes(filtre))
    .sort((a, b) => {
      if (tri === "moyenne") return (a.e.moyenneTrimestre ?? 99) - (b.e.moyenneTrimestre ?? 99);
      if (tri === "absences") return b.e.absences - a.e.absences;
      if (tri === "baisse") return Number(b.baisse) - Number(a.baisse);
      return 0; // l'API renvoie déjà l'ordre alphabétique
    });
  const nbBaisse = lignes.filter((l) => l.baisse).length;

  return (
    <div className="space-y-4">
      <Card className="grid gap-3 p-3 sm:grid-cols-[1fr_auto]">
        <label className="relative block">
          <span className="sr-only">Rechercher un élève</span>
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input value={recherche} onChange={(e) => setRecherche(e.target.value.slice(0, 40))} placeholder="Rechercher un élève…" enterKeyHint="search"
            className="h-10 w-full rounded-md border border-line bg-surface pl-10 pr-3.5 text-sm text-ink outline-none focus:border-blue focus:ring-4 focus:ring-blue/15" />
        </label>
        <label className="block">
          <span className="sr-only">Trier</span>
          <select value={tri} onChange={(e) => setTri(e.target.value as Tri)} className="h-10 w-full rounded-md border border-line bg-surface px-3.5 text-sm text-ink outline-none focus:border-blue focus:ring-4 focus:ring-blue/15 sm:w-56">
            <option value="nom">Tri : ordre alphabétique</option>
            <option value="moyenne">Tri : moyenne croissante</option>
            <option value="absences">Tri : absences décroissantes</option>
            <option value="baisse">Tri : en baisse d'abord{nbBaisse ? ` (${nbBaisse})` : ""}</option>
          </select>
        </label>
      </Card>

      {visibles.length === 0 ? (
        <Card><EtatVide icone={Users} titre="Aucun élève" texte={recherche ? `Aucun élève ne correspond à « ${recherche} ».` : "Aucun élève scolarisé dans cette classe."} /></Card>
      ) : (
        <motion.ul layout className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence initial={false}>
            {visibles.map(({ e, serie, baisse }, i) => <CarteEleve key={e.id} eleve={e} serie={serie} baisse={baisse} rang={i} />)}
          </AnimatePresence>
        </motion.ul>
      )}
    </div>
  );
}

function CarteEleve({ eleve: e, serie, baisse, rang }: { eleve: EleveCarnet; serie: number[]; baisse: boolean; rang: number }) {
  const m = e.moyenneTrimestre;
  return (
    <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ delay: Math.min(rang, 12) * 0.035 }}
      className="flex min-w-0 items-center gap-3 rounded-xl border border-line/70 bg-surface p-3.5 shadow-float">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold", e.sexe === "F" ? "bg-blue-soft text-accent-ink" : "bg-surface-2 text-ink-2")} aria-hidden>{initiales(e)}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{e.nom} <span className="font-normal text-ink-2">{e.prenoms}</span></p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
          <span>{e.absences} abs.</span>
          {e.absentAujourdhui && <Badge ton="critique">absent ce jour</Badge>}
          {baisse && <Badge ton="avertissement" icone={TrendingDown}>en baisse</Badge>}
          {e.besoinsParticuliers && <Badge ton="info">besoins particuliers</Badge>}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <Sparkline points={serie} className={baisse ? "text-warning" : "text-blue"} />
        <span className={cn("text-[15px] font-semibold tabular-nums", m == null ? "text-ink-muted" : m < 10 ? "text-critical" : "text-ink")}>{nombre(m, 2)}</span>
      </div>
    </motion.li>
  );
}
