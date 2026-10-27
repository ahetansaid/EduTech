import { notifier } from "@/components/ui/Notifications";
import { ecrire } from "@/lib/http";

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

/** Injection CSV : une cellule dont la tête est = + - @ est interprétée comme formule par Excel (tabulation et
 * saut de ligne en tête compris : le tableur lit la formule qui suit). Le garde teste donc la tête réelle. */
/**
 * Une cellule déjà numérique au format français (signe, séparateur de milliers, virgule décimale) n'est pas une
 * formule : Excel la lit comme valeur. Sans cette distinction, un indicateur négatif — l'asymétrie d'une
 * distribution, un écart entre deux mailles — sortirait du fichier affublé d'une apostrophe, comme l'avait relevé
 * l'audit. Les unités (« % », « /20 ») restent neutralisées : elles ne sont pas des nombres.
 */
const nombreFr = (v: string) => /^-?\d+(?:[.,]\d+)?$/.test(v.replace(/[\s\u00A0\u202F]/g, ""));
/**
 * Tête réelle de la cellule : les tableurs ignorent les blancs initiaux avant d'interpréter une formule, et un
 * espace insécable ou une largeur nulle passe par là. Tester la chaîne brute laisserait «  =1+1 » sortir tel quel.
 */
const tete = (v: string) => v.replace(/^[\s\u200B-\u200D\uFEFF]+/, "");
const neutraliser = (v: string) => (nombreFr(v) ? v : /^[=+\-@]/.test(tete(v)) ? `'${v}` : v);

/** Retire les caractères de contrôle (hors \t \n \r, gérés par l'échappement) : prévient l'injection de lignes et la corruption du fichier. */
const nettoyer = (v: string) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

/** Séparateurs de ligne que certains importeurs respectent hors guillemets (U+2028/U+2029) : ils valent échappement. */
const echapper = (v: string) => (/[",;\n\r\u2028\u2029]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const cellule = (x: string | number | null | undefined) =>
  echapper(x == null ? "" : typeof x === "number" ? String(x) : neutraliser(nettoyer(x)));

export function versCsv<T>(lignes: readonly T[], colonnes: readonly Colonne<T>[]): string {
  // Un en-tête n'est pas plus à l'abri qu'une valeur : celui d'un jeu de données vient du référentiel, pas de l'écran.
  const entetes = colonnes.map((c) => echapper(neutraliser(nettoyer(c.entete)))).join(";");
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
/**
 * Produire un fichier : l'export est d'abord DÉCLARÉ au serveur (journal d'audit : auteur, nom du fichier,
 * colonnes, nombre de lignes, caractère nominatif). Si la trace ne peut pas être écrite, l'interface ne produit
 * aucun fichier. Limite assumée : cette déclaration vient du navigateur. La LECTURE des données est journalisée
 * par l'API sur chaque route ; la transformation en fichier, elle, ne se prouve que côté client.
 *
 * `true` = le fichier est sorti. `false` = aucune trace, donc aucun fichier : l'écran qui annonce un succès
 * doit tester cette valeur, sans quoi il promettrait un téléchargement qui n'a pas eu lieu.
 */
export async function exporterCsv<T>(nom: string, lignes: readonly T[], colonnes: readonly Colonne<T>[], provenance?: string, nominatif = true): Promise<boolean> {
  try {
    await ecrire("/audit/exports", { fichier: nom.slice(0, 120), lignes: lignes.length, colonnes: colonnes.map((c) => c.entete.slice(0, 80)).slice(0, 60), nominatif });
  } catch {
    notifier({ ton: "critique", titre: "Export impossible", texte: "La trace de l'export n'a pas pu être enregistrée : aucun fichier n'a été produit. Réessayez." });
    return false;
  }
  const pied = `${provenance ?? `Export BEILE du ${new Date().toLocaleDateString("fr-FR")}`} — ${lignes.length} ligne(s) — export journalisé${nominatif ? " — document confidentiel" : ""}`;
  const csv = lignes.length ? `${versCsv(lignes, colonnes)}\r\n\r\n${echapper(neutraliser(nettoyer(pied)))}` : versCsv(lignes, colonnes);
  telechargerCsv(`${nom}_${new Date().toISOString().slice(0, 10)}.csv`, csv);
  return true;
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
  return exporterCsv<LigneStat>(
    nom,
    lignes,
    [
      { entete: "Section", valeur: (l) => l.section },
      { entete: "Indicateur", valeur: (l) => l.indicateur },
      { entete: "Valeur", valeur: (l) => l.valeur },
    ],
    provenance,
    false,
  );
}
