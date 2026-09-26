"use client";

import { TrendingUp } from "lucide-react";
import { Courbes, TableauDonnees } from "@/components/charts/Graphiques";
import { Card, CardHeader } from "@/components/ui/primitives";
import type { DossierGestion } from "@/lib/api/etablissement";
import { cn } from "@/lib/cn";
import { entier, nombre } from "@/lib/format";

/**
 * Évolution longitudinale d'un apprenant, construite sur l'`historique` que le serveur réagrège à partir
 * des notes déjà chargées pour ce dossier (même périmètre ABAC, aucune donnée nouvelle, base intacte).
 * La moyenne générale est la moyenne NON pondérée des moyennes de matière — l'API ne transmet aucun
 * coefficient — exactement comme la tuile du trimestre courant : les deux chiffres restent cohérents.
 * Une matière non évaluée sur une période reste « — » ; rien n'est interpolé.
 */

type Historique = DossierGestion["historique"];
const libelle = (h: Historique[number]) => `T${h.trimestre} ${h.anneeScolaire.slice(2)}`;

export function Evolution({ historique }: { historique: Historique }) {
  if (historique.length === 0) return null;

  const points = historique.map((h) => ({ x: libelle(h), y: h.moyenne }));
  const notees = points.filter((p) => p.y != null);
  const premier = historique.find((h) => h.moyenne != null) ?? null;
  const dernier = [...historique].reverse().find((h) => h.moyenne != null) ?? null;
  const evo = premier && dernier && dernier !== premier ? dernier.moyenne! - premier.moyenne! : null;

  const matieres: string[] = [];
  for (const h of historique) for (const m of h.matieres) if (!matieres.includes(m.matiere)) matieres.push(m.matiere);
  const cells = new Map<string, number>();
  for (const h of historique) for (const m of h.matieres) cells.set(`${libelle(h)}|${m.matiere}`, m.moyenne);

  return (
    <Card data-guide="dossier-evolution" className="min-w-0">
      <CardHeader
        icon={TrendingUp}
        title="Évolution longitudinale"
        subtitle={premier ? `${entier(historique.length)} trimestre(s) évalué(s), de ${libelle(premier)} à ${libelle(dernier ?? premier)} · moyenne non pondérée des matières` : "Aucune moyenne calculée pour l'instant"}
      />

      {notees.length >= 2 ? (
        <Courbes formater={(v) => nombre(v, 2)} min={0} series={[{ nom: "Moyenne générale", points }]} hauteur={200} />
      ) : (
        <p className="text-[13px] text-ink-muted">Un seul trimestre évalué pour l'instant : la courbe apparaîtra dès la saisie des notes suivantes.</p>
      )}

      <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
        <Puce libelle="Dernière moyenne" valeur={dernier?.moyenne != null ? `${nombre(dernier.moyenne, 2)}/20` : "—"} aide={dernier ? libelle(dernier) : undefined} accent={dernier?.moyenne != null && dernier.moyenne < 10} />
        <Puce libelle="Progression" valeur={evo == null ? "—" : `${evo >= 0 ? "+" : "−"}${nombre(Math.abs(evo), 2)}`} aide={evo == null ? "besoin de deux trimestres" : "depuis le premier trimestre noté"} accent={evo != null && evo < 0} />
        <Puce libelle="Matières suivies" valeur={entier(matieres.length)} aide="au fil du parcours" />
      </div>

      {matieres.length > 0 && (
        <TableauDonnees
          className="mt-4"
          colonnes={["Matière", ...historique.map(libelle)]}
          lignes={matieres.map((mt) => [
            mt,
            ...historique.map((h) => {
              const v = cells.get(`${libelle(h)}|${mt}`);
              return v == null
                ? <span key={libelle(h)} className="text-ink-muted">—</span>
                : <span key={libelle(h)} className={cn("font-medium tabular", v < 10 ? "text-critical" : "text-ink")}>{nombre(v, 2)}</span>;
            }),
          ])}
        />
      )}

      <p className="mt-3 text-[11.5px] leading-snug text-ink-muted">
        Chaque case est une moyenne de trimestre réellement saisie ; un « — » signifie que la matière n'a pas été évaluée sur la période, jamais une valeur estimée. Moyennes annuelles et de matière calculées sans coefficient.
      </p>
    </Card>
  );
}

function Puce({ libelle, valeur, aide, accent }: { libelle: string; valeur: string; aide?: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-lg border px-3.5 py-2.5", accent ? "border-critical/30 bg-critical-bg/50" : "border-line/70 bg-surface-2/50")}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{libelle}</p>
      <p className={cn("mt-0.5 text-[18px] font-bold tabular", accent ? "text-critical" : "text-ink")}>{valeur}</p>
      {aide && <p className="text-[11px] text-ink-muted">{aide}</p>}
    </div>
  );
}
