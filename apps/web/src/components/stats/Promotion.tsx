"use client";

import { BarChart3, ChevronDown, Download } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { BarresClassees, SERIES, TableauDonnees, type Barre } from "@/components/charts/Graphiques";
import { Button, Card, CardHeader } from "@/components/ui/primitives";
import type { EleveLigne } from "@/lib/api/etablissement";
import { cn } from "@/lib/cn";
import { exporterStats, type LigneStat } from "@/lib/export";
import { entier, note, nombre, pourcent } from "@/lib/format";
import { asymetrie, ecartType, mediane, moyenne, quantile, repartir, sousSeuil, type Bande } from "@/lib/statistiques";

/**
 * Statistiques descriptives d'une promotion, calculées sur les apprenants *déjà chargés* pour le rôle.
 * Aucune nouvelle donnée, aucun nouvel accès : on éclaire la cohorte que la direction voit déjà.
 * On montre la distribution, pas seulement la moyenne (médiane, écart-type, bandes) : c'est là que
 * se lit le décrochage. S'agissant de la direction de l'établissement — qui a accès à chaque dossier —
 * les effectifs sont affichés sans masquage ; le masquement des petits effectifs relève des niveaux
 * de pilotage plus larges (département, national), où l'audience dépasse le propriétaire de la donnée.
 */

const BANDES_MOYENNE: Bande[] = [
  { libelle: "moins de 8/20", max: 8 },
  { libelle: "8 à 9,99", max: 10 },
  { libelle: "10 à 11,99", max: 12 },
  { libelle: "12 à 13,99", max: 14 },
  { libelle: "14 et plus" },
];

const BANDES_ABSENCES: Bande[] = [
  { libelle: "aucune absence", max: 1 },
  { libelle: "1 à 3 jours", max: 4 },
  { libelle: "4 à 7 jours", max: 8 },
  { libelle: "8 à 11 jours", max: 12 },
  { libelle: "12 jours et plus" },
];

interface Niveaux { nominal: number; a_surveiller: number; urgent: number }

export function StatsPromotion({ eleves, niveaux }: { eleves: EleveLigne[]; niveaux: Niveaux }) {
  const [ouvert, setOuvert] = useState(false);

  const s = useMemo(() => {
    const notes = eleves.map((e) => e.moyenne).filter((v): v is number => v != null);
    const absences = eleves.map((e) => e.absences);
    const tri = [...notes].sort((a, b) => a - b);
    const groupe = (xs: EleveLigne[]) => {
      const n = xs.map((e) => e.moyenne).filter((v): v is number => v != null);
      return { effectif: xs.length, moyenne: moyenne(n), absMoy: moyenne(xs.map((e) => e.absences)), sous: sousSeuil(n, 10) };
    };
    return {
      notes: notes.length,
      moyenne: moyenne(notes),
      mediane: mediane(notes),
      ecart: ecartType(notes),
      sous10: sousSeuil(notes, 10),
      longues: absences.filter((a) => a >= 12).length,
      bandesMoyenne: bandes(BANDES_MOYENNE, repartir(notes, BANDES_MOYENNE)),
      bandesAbsences: bandes(BANDES_ABSENCES, repartir(absences, BANDES_ABSENCES)),
      filles: groupe(eleves.filter((e) => e.sexe === "F")),
      garcons: groupe(eleves.filter((e) => e.sexe === "M")),
      // Forme de la distribution : où sont les élèves, pas seulement leur moyenne.
      q1: quantile(tri, 0.25), q3: quantile(tri, 0.75), p90: quantile(tri, 0.9),
      asym: asymetrie(notes),
      tete: notes.filter((v) => v >= 14).length,
      bascule: notes.filter((v) => v < 8).length,
    };
  }, [eleves]);

  const enSousS = s.sous10.taux != null ? pourcent(s.sous10.taux * 100, 0) : "—";

  // On n'exporte rien de neuf : les mêmes chiffres, déjà calculés sur la cohorte chargée pour ce rôle.
  function exporter() {
    const lignes: LigneStat[] = [
      { section: "Résumé", indicateur: "Moyenne de la promotion", valeur: note(s.moyenne) },
      { section: "Résumé", indicateur: "Médiane", valeur: note(s.mediane) },
      { section: "Résumé", indicateur: "Écart-type", valeur: s.ecart != null ? nombre(s.ecart, 2) : "—" },
      { section: "Résumé", indicateur: "Élèves sous 10/20", valeur: `${entier(s.sous10.k)} sur ${entier(s.notes)} (${enSousS})` },
    ];
    for (const b of s.bandesMoyenne) lignes.push({ section: "Bandes de moyennes", indicateur: b.libelle, valeur: entier(b.valeur ?? 0) });
    for (const b of s.bandesAbsences) lignes.push({ section: "Bandes d'absences", indicateur: b.libelle, valeur: entier(b.valeur ?? 0) });
    lignes.push(
      { section: "Forme de la distribution", indicateur: "1er quartile (Q1)", valeur: note(s.q1) },
      { section: "Forme de la distribution", indicateur: "3e quartile (Q3)", valeur: note(s.q3) },
      { section: "Forme de la distribution", indicateur: "Meilleur décile (P90)", valeur: note(s.p90) },
      { section: "Forme de la distribution", indicateur: "Asymétrie (Pearson 2)", valeur: s.asym != null ? nombre(s.asym, 2) : "—" },
      { section: "Forme de la distribution", indicateur: "Élèves à 14/20 et plus", valeur: entier(s.tete) },
      { section: "Forme de la distribution", indicateur: "Élèves sous 8/20", valeur: entier(s.bascule) },
    );
    lignes.push({ section: "Bandes d'absences", indicateur: "12 jours et plus (seuil vigilance)", valeur: entier(s.longues) });
    lignes.push(
      { section: "Filles et garçons", indicateur: "Filles — effectif", valeur: entier(s.filles.effectif) },
      { section: "Filles et garçons", indicateur: "Filles — moyenne", valeur: note(s.filles.moyenne) },
      { section: "Filles et garçons", indicateur: "Filles — sous 10/20", valeur: s.filles.sous.taux != null ? pourcent(s.filles.sous.taux * 100, 0) : "—" },
      { section: "Filles et garçons", indicateur: "Garçons — effectif", valeur: entier(s.garcons.effectif) },
      { section: "Filles et garçons", indicateur: "Garçons — moyenne", valeur: note(s.garcons.moyenne) },
      { section: "Filles et garçons", indicateur: "Garçons — sous 10/20", valeur: s.garcons.sous.taux != null ? pourcent(s.garcons.sous.taux * 100, 0) : "—" },
      { section: "Vigilance", indicateur: "Urgent", valeur: entier(niveaux.urgent) },
      { section: "Vigilance", indicateur: "À surveiller", valeur: entier(niveaux.a_surveiller) },
      { section: "Vigilance", indicateur: "Au nominal", valeur: entier(niveaux.nominal) },
    );
    exporterStats("Statistiques promotion", lignes, `Export BEILE du ${new Date().toLocaleDateString("fr-FR")} — portrait descriptif de la promotion affichée à l'écran ; périmètre limité à la cohorte que votre habilitation autorise déjà à voir.`);
  }

  return (
    <Card data-guide="eleves-stats" className="min-w-0 overflow-hidden p-0">
      <button onClick={() => setOuvert((v) => !v)} aria-expanded={ouvert} className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-soft text-accent-ink"><BarChart3 size={16} aria-hidden /></span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-ink">Statistiques de la promotion</span>
            <span className="block text-xs text-ink-muted">
              {s.notes ? `Moyenne ${note(s.moyenne)} · médiane ${nombre(s.mediane, 2)} · ${entier(s.sous10.k)} sous la moyenne (${enSousS})` : "Aucune moyenne calculée pour l'instant"}
            </span>
          </span>
        </span>
        <ChevronDown size={18} className={cn("shrink-0 text-ink-muted transition-transform duration-200", ouvert && "rotate-180")} aria-hidden />
      </button>

      {ouvert && (
        <div className="space-y-6 border-t border-line/60 px-5 py-5">
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <Puce libelle="Moyenne de la promotion" valeur={note(s.moyenne)} />
            <Puce libelle="Médiane" valeur={note(s.mediane)} aide="valeur qui partage la promotion en deux" />
            <Puce libelle="Écart-type" valeur={s.ecart != null ? `${nombre(s.ecart, 2)}` : "—"} aide="dispersion autour de la moyenne" />
            <Puce libelle="Sous 10/20" valeur={`${entier(s.sous10.k)} / ${entier(s.notes)}`} aide={enSousS + " des élèves notés"} accent />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <Titre>Répartition des moyennes</Titre>
              <BarresClassees barres={s.bandesMoyenne} formater={entier} couleur={SERIES[0]} className="mt-2" />
            </section>
            <section>
              <Titre>Répartition des absences</Titre>
              <BarresClassees barres={s.bandesAbsences} formater={entier} couleur={SERIES[1]} className="mt-2" />
              <p className="mt-1.5 text-[12px] text-ink-muted">{entier(s.longues)} élève(s) avec 12 jours d'absence ou plus — seuil du score de vigilance.</p>
            </section>
          </div>

          <section>
            <Titre>Forme de la distribution</Titre>
            <div className="mt-2 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <Puce libelle="Moitié basse (Q1)" valeur={note(s.q1)} aide="25 % des élèves sont en dessous" />
              <Puce libelle="Moitié haute (Q3)" valeur={note(s.q3)} aide="25 % des élèves sont au-dessus" />
              <Puce libelle="Le meilleur décile" valeur={note(s.p90)} aide="note au-dessus de laquelle sont les 10 % les plus forts" />
              <Puce libelle="Asymétrie" valeur={s.asym != null ? nombre(s.asym, 2) : "—"} aide={s.asym == null ? "trop peu d'élèves notés" : s.asym < -0.3 ? "queue tirée vers le bas" : s.asym > 0.3 ? "queue tirée vers le haut" : "distribution à peu près symétrique"} />
            </div>
            <p className="mt-2 text-[13px] text-ink-2">
              {entier(s.tete)} élève(s) à 14/20 et plus · {entier(s.bascule)} sous 8/20.
              Deux classes à la même moyenne se pilotent différemment si l'une est serrée autour de 11 et l'autre partagée entre très forts et très faibles : l'écart interquartile (Q3 − Q1) et l'asymétrie le révèlent, la moyenne seule non.
            </p>
          </section>

          <section>
            <Titre>Filles et garçons</Titre>
            <TableauDonnees
              className="mt-2"
              colonnes={["Groupe", "Effectif", "Moyenne", "Absence moyenne", "Sous 10/20"]}
              lignes={[
                ["Filles", entier(s.filles.effectif), note(s.filles.moyenne), nombre(s.filles.absMoy, 1), s.filles.sous.taux != null ? pourcent(s.filles.sous.taux * 100, 0) : "—"],
                ["Garçons", entier(s.garcons.effectif), note(s.garcons.moyenne), nombre(s.garcons.absMoy, 1), s.garcons.sous.taux != null ? pourcent(s.garcons.sous.taux * 100, 0) : "—"],
              ]}
            />
          </section>

          <section>
            <Titre>Niveaux de vigilance</Titre>
            <p className="mt-1.5 text-[13px] text-ink-2">
              {entier(niveaux.urgent)} urgent(s) · {entier(niveaux.a_surveiller)} à surveiller · {entier(niveaux.nominal)} au nominal.
              Détail élève par élève dans le panneau « Vigilance décrochage ».
            </p>
          </section>

          <div className="flex items-center justify-between gap-3 border-t border-line/60 pt-4">
            <p className="min-w-0 text-[11.5px] text-ink-muted">
              Lecture descriptive de la cohorte que vous gérez, tous effectifs affichés : ce panneau ne masque aucun chiffre, la direction ayant accès à chaque dossier.
              Une moyenne ne prouve rien seule — croisez-la avec les bandes et la médiane avant toute décision.
            </p>
            <Button variante="secondaire" taille="sm" icone={Download} onClick={exporter} className="shrink-0">
              Exporter (CSV)
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function bandes(bandes: Bande[], effectifs: number[]): Barre[] {
  return bandes.map((b, i) => ({ cle: b.libelle, libelle: b.libelle, valeur: effectifs[i] ?? 0 }));
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

function Titre({ children }: { children: ReactNode }) {
  return <CardHeader className="mb-0" title={<span className="text-[13.5px]">{children}</span>} />;
}
