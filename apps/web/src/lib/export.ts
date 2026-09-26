/**
 * Export tabulaire côté client. Une source de vérité : on sérialise les lignes *déjà affichées*
 * (filtrées et triées à l'écran), sans appel serveur ni donnée nouvelle — le périmètre exporté
 * reste exactement celui que l'habilitation de l'utilisateur autorise déjà à voir.
 *
 * Convention d'ouverture : séparateur « ; », décimales françaises (via `nombre()`), BOM UTF-8 →
 * Excel en locale fr ouvre le fichier sans assistant d'import.
 */

export interface Colonne<T> {
  entete: string;
  /** Valeur déjà mise en forme (`nombre()`, `date()`, texte…) ou nombre brut (entier, sans séparateur). */
  valeur: (ligne: T) => string | number | null | undefined;
}

/** Injection CSV : une cellule débutant par = + - @ (ou tabulation) est interprétée comme formule par Excel. */
const neutraliser = (v: string) => (/^[=+\-@\t]/.test(v) ? `'${v}` : v);

/** Retire les caractères de contrôle (hors \t \n \r, gérés par l'échappement) : prévient l'injection de lignes et la corruption du fichier. */
const nettoyer = (v: string) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

const echapper = (v: string) => (/[",;\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const cellule = (x: string | number | null | undefined) =>
  echapper(x == null ? "" : typeof x === "number" ? String(x) : neutraliser(nettoyer(x)));

export function versCsv<T>(lignes: readonly T[], colonnes: readonly Colonne<T>[]): string {
  const entetes = colonnes.map((c) => echapper(c.entete)).join(";");
  const corps = lignes.map((l) => colonnes.map((c) => cellule(c.valeur(l))).join(";")).join("\r\n");
  return `${entetes}\r\n${corps}`;
}

const BOM = String.fromCharCode(0xfeff);

/** Déclenche le téléchargement d'un CSV (BOM UTF-8 inclus) dans le navigateur. */
export function telechargerCsv(nom: string, csv: string) {
  const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom.endsWith(".csv") ? nom : `${nom}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Un seul geste : sérialiser puis télécharger. `nom` sans extension.
 *  `provenance` (optionnel) ajoute une dernière ligne de pied de page — périmètre, date, finalité —
 *  pour tracer le cadre d'usage lorsque le fichier contient des données personnelles et quitte la plateforme. */
export function exporterCsv<T>(nom: string, lignes: readonly T[], colonnes: readonly Colonne<T>[], provenance?: string) {
  const csv = lignes.length && provenance ? `${versCsv(lignes, colonnes)}\r\n\r\n${echapper(provenance)}` : versCsv(lignes, colonnes);
  telechargerCsv(`${nom}_${new Date().toISOString().slice(0, 10)}.csv`, csv);
}

/** Une ligne d'un relevé statistique : indicateur déjà mis en forme (texte), regroupé par section. */
export interface LigneStat {
  section: string;
  indicateur: string;
  valeur: string;
}

/**
 * Export d'un portrait statistique (dispersion, bandes, comparatifs) déjà calculé à l'écran :
 * trois colonnes Section / Indicateur / Valeur, lisibles dans Excel sans réouvrir d'assistant.
 * Passe par `exporterCsv`, donc hérite du pied de page de provenance et de la neutralisation des formules.
 */
export function exporterStats(nom: string, lignes: readonly LigneStat[], provenance?: string) {
  exporterCsv<LigneStat>(
    nom,
    lignes,
    [
      { entete: "Section", valeur: (l) => l.section },
      { entete: "Indicateur", valeur: (l) => l.indicateur },
      { entete: "Valeur", valeur: (l) => l.valeur },
    ],
    provenance,
  );
}
