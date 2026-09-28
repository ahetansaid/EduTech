"use client";

import type { LigneCapitalisation, ResultatCapitalisation } from "@beile/contracts";
import { Calculator, Download, Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { TableauDonnees } from "@/components/charts/Graphiques";
import { Badge, Button, Card, CardHeader, EtatVide } from "@/components/ui/primitives";
import { LIBELLE_PORTEE } from "@/lib/api/scolarite-superieure";
import { classeSelect } from "../../etablissement/_composants";
import { ErreurApi } from "@/lib/http";
import { exporterCsv, type Colonne } from "@/lib/export";
import { entier, pourcent } from "@/lib/format";

/**
 * Pièces partagées des écrans de scolarité. Ce fichier n'introduit aucune donnée : il rend deux fois
 * la même définition ECTS — par période chez soi, par voie pour l'État — sans jamais reformuler le
 * chiffre calculé par le serveur.
 */

/* ------------------------------------------------------------------ Capitalisation ECTS */

const COLONNES_ECTS: Colonne<LigneCapitalisation>[] = [
  { entete: "Cellule", valeur: (l) => l.libelle },
  { entete: "Année universitaire", valeur: (l) => l.anneeUniversitaire },
  { entete: "Étudiants sous contrat", valeur: (l) => l.apprenants },
  { entete: "Crédits acquis", valeur: (l) => (l.creditsAcquis === null ? "" : l.creditsAcquis) },
  { entete: "Crédits attendus", valeur: (l) => (l.creditsAttendus === null ? "" : l.creditsAttendus) },
  { entete: "Crédits périmés", valeur: (l) => (l.creditsPerimes === null ? "" : l.creditsPerimes) },
  { entete: "Taux de capitalisation", valeur: (l) => (l.tauxCapitalisation === null ? "" : l.tauxCapitalisation) },
  { entete: "Publication", valeur: (l) => (l.masquee ? "masquée (effectif sous le seuil)" : l.petiteUnite ? "signalée" : "publiée") },
];

const cellule = (l: LigneCapitalisation) => (
  <>
    {l.libelle}
    {l.masquee && <Badge ton="critique" className="ml-2">non publiée</Badge>}
    {!l.masquee && l.petiteUnite && <Badge ton="neutre" className="ml-2">sous le seuil</Badge>}
  </>
);

/**
 * La ligne et son dénominateur : un pourcentage de crédits sans population lisible n'est pas
 * contestable. Une cellule masquée rend son effectif et ses valeurs `null` — elle est déclarée, pas effacée.
 */
export function TableauCapitalisation({ data, titre, sousTitre }: { data: ResultatCapitalisation; titre: string; sousTitre: string }) {
  const lignes = [...data.lignes, ...(data.total ? [data.total] : [])];
  const masquees = data.lignes.filter((l) => l.masquee).length;
  return (
    <Card data-guide="scolarite-credits-ects" className="min-w-0 overflow-hidden p-0">
      <CardHeader
        icon={Calculator}
        title={titre}
        subtitle={sousTitre}
        action={<Button variante="secondaire" taille="sm" icone={Download} disabled={!data.lignes.length} onClick={() => exporterCsv("capitalisation_ects", lignes, COLONNES_ECTS, `BEILE — crédits ECTS calculés par le registre des écritures du supérieur. Définitions : ${data.definitions.join(", ")}. Seuil de publication : ${data.seuilPublication}. Cellules non publiées : ${masquees}.`)}>Exporter (CSV)</Button>}
      />
      <div className="flex items-start gap-3 border-y border-line/60 bg-info-bg px-5 py-3 text-[13px] text-info">
        <Info size={17} className="mt-0.5 shrink-0" aria-hidden />
        <p>
          Moteur <strong>{data.moteur}</strong> — ces deux chiffres ne viennent pas de la couche statistique nationale.
          Définitions publiées et citées : <strong>{data.definitions.join(" · ")}</strong>. Périmètre rendu : <code className="font-mono">{data.perimetre}</code>.
          Une cellule sous le seuil de publication (<strong>{data.seuilPublication} étudiants</strong>) garde son effectif et perd ses valeurs.
        </p>
      </div>
      <TableauDonnees
        colonnes={["Cellule", "Année", "Étudiants sous contrat", "Crédits acquis", "Crédits attendus", "Périmés", "Taux", "Publication"]}
        lignes={lignes.map((l) => {
          const estTotal = data.total !== null && l.cle === data.total.cle;
          return [
            estTotal ? <strong key={l.cle}>{l.libelle}</strong> : cellule(l),
            l.anneeUniversitaire,
            entier(l.apprenants),
            l.creditsAcquis === null ? "—" : entier(l.creditsAcquis),
            l.creditsAttendus === null ? "—" : entier(l.creditsAttendus),
            l.creditsPerimes === null ? "—" : entier(l.creditsPerimes),
            l.tauxCapitalisation === null ? "—" : pourcent(l.tauxCapitalisation),
            l.masquee ? "effectif sous le seuil" : l.petiteUnite ? "signalée" : estTotal ? "consolidée" : "publiée",
          ];
        })}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ Sélecteur d'année */

export function SelectAnnee({ annees, valeur, onChange, label }: { annees: string[]; valeur: string; onChange: (v: string) => void; label: string }) {
  return (
    <select value={valeur} onChange={(e) => onChange(e.target.value)} className="h-10 rounded-md border border-line bg-surface px-3.5 text-sm text-ink focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/15" aria-label={label}>
      <option value="">Toutes les années</option>
      {annees.map((a) => <option key={a} value={a}>{a}</option>)}
    </select>
  );
}

/** Les années universitaires rencontrées, triées de la plus récente à la plus ancienne. */
export const anneesDe = (...liste: (string | undefined)[][]) =>
  [...new Set(liste.flat().filter((x): x is string => !!x))].sort().reverse();

/* ------------------------------------------------------------------ Fiche d'une règle de validation */

export function PucePortee({ portee }: { portee: keyof typeof LIBELLE_PORTEE }) {
  return <Badge ton={portee === "nationale" ? "info" : portee === "periode" ? "marque" : "neutre"}>{LIBELLE_PORTEE[portee]}</Badge>;
}

/* ------------------------------------------------------------------ Pièces de formulaire */

/**
 * Un champ nommé et expliqué : une écriture du supérieur (règle, jury, délibération) engage un diplôme,
 * et l'agent qui la saisit doit lire ce qu'elle produit avant de la valider.
 */
export function Champ({ label, aide, obligatoire, children }: { label: string; aide?: ReactNode; obligatoire?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}{obligatoire && <span className="text-critical"> *</span>}</span>
      {children}
      {aide && <span className="mt-1 block text-xs text-ink-muted">{aide}</span>}
    </label>
  );
}

/** Un select bâti sur le vocabulaire d'affichage : l'écran n'a pas de liste à lui. */
export function SelectVocabulaire<T extends string>({ vocabulaire, valeur, onChange, label, vide }: {
  vocabulaire: Record<T, string>; valeur: T | ""; onChange: (v: T | "") => void; label: string; vide?: string;
}) {
  return (
    <select aria-label={label} value={valeur} onChange={(e) => onChange((e.target.value === "" ? "" : e.target.value) as T | "")} className={classeSelect}>
      {vide !== undefined && <option value="">{vide}</option>}
      {(Object.keys(vocabulaire) as T[]).map((k) => <option key={k} value={k}>{vocabulaire[k]}</option>)}
    </select>
  );
}

/** La bande qui rappelle la porte et le moteur sous un écran — la lire évite de croire à un tableau de bord ordinaire. */
export function Bandeau({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-info-bg px-4 py-3 text-[13px] text-info">
      <Info size={17} className="mt-0.5 shrink-0" aria-hidden />
      <p>{children}</p>
    </div>
  );
}

/** L'erreur d'un envoi, telle que le serveur l'a refusée : un 409 lu ici évite un second essai à l'aveugle. */
export function ErreurEnvoi({ erreur }: { erreur: unknown }) {
  if (!erreur) return null;
  return <p role="alert" className="rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">{erreur instanceof ErreurApi ? erreur.message : "Envoi impossible."}</p>;
}

/** Un établissement sans ligne : jamais un tableau vide sans pourquoi — ici, c'est le référentiel qui n'est pas encore déclaré. */
export function Rien({ icone, titre, texte }: { icone: LucideIcon; titre: string; texte: string }) {
  return <EtatVide icone={icone} titre={titre} texte={texte} />;
}
