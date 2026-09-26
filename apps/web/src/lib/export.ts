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

const echapper = (v: string) => (/[",;\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const cellule = (x: string | number | null | undefined) =>
  echapper(x == null ? "" : typeof x === "number" ? String(x) : neutraliser(x));

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

/** Un seul geste : sérialiser puis télécharger. `nom` sans extension. */
export function exporterCsv<T>(nom: string, lignes: readonly T[], colonnes: readonly Colonne<T>[]) {
  telechargerCsv(`${nom}_${new Date().toISOString().slice(0, 10)}.csv`, versCsv(lignes, colonnes));
}
