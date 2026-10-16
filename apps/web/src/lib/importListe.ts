/**
 * Lecture d'une liste d'élèves (CSV) DANS le navigateur. Le fichier ne quitte jamais l'appareil : seules des
 * lignes typées partent vers l'API, qui refait toutes les vérifications. Ici on ne fait que rendre le fichier
 * lisible (encodage, séparateur, en-têtes tolérants, dates françaises) et écarter ce qui ne peut pas être envoyé.
 */

export const NIVEAUX = ["CI", "CP", "CE1", "CE2", "CM1", "CM2", "6e", "5e", "4e", "3e", "2nde", "1re", "Tle"] as const;
export const MAX_LIGNES = 1500;
export const MAX_OCTETS = 2 * 1024 * 1024;

export interface LigneEleve {
  n: number; classe: string; niveau?: string; npi?: string; nom: string; prenoms: string;
  sexe?: "F" | "M"; dateNaissance?: string; responsable?: string;
}
export interface LigneLue { n: number; brut: Record<string, string>; ligne: LigneEleve | null; erreur: string | null }
export interface Lecture { lignes: LigneLue[]; colonnesManquantes: string[]; separateur: string; encodage: string }

export const COLONNES_MODELE = ["classe", "niveau", "npi", "nom", "prenoms", "sexe", "date_naissance", "responsable"] as const;

/** Modèle à remplir : en-têtes et deux lignes d'exemple fictives (à supprimer avant import). */
export const MODELE_CSV = [
  COLONNES_MODELE.join(";"),
  "6e A;6e;0123456789;DOSSOU;Afiavi Marie;F;12/03/2014;",
  "6e A;6e;;HOUNSOU;Kossi;M;05/11/2013;Tante : Mme Hounsou",
].join("\r\n");

const sansAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const cleEntete = (s: string) => sansAccents(s).toLowerCase().replace(/[^a-z0-9]/g, "");

const ALIAS: Record<string, (typeof COLONNES_MODELE)[number]> = {
  classe: "classe", division: "classe", salle: "classe",
  niveau: "niveau", cycle: "niveau",
  npi: "npi", numeropersonnelidentification: "npi",
  nom: "nom", nomdefamille: "nom",
  prenoms: "prenoms", prenom: "prenoms",
  sexe: "sexe", genre: "sexe",
  datenaissance: "date_naissance", datedenaissance: "date_naissance", nele: "date_naissance", nee: "date_naissance", naissance: "date_naissance",
  responsable: "responsable", parent: "responsable", tuteur: "responsable", responsablelegal: "responsable",
};

/** UTF-8 si le fichier l'est ; sinon Windows-1252, l'encodage du « CSV (séparateur : point-virgule) » d'Excel en français. */
export function decoder(octets: ArrayBuffer): { texte: string; encodage: string } {
  try { return { texte: new TextDecoder("utf-8", { fatal: true }).decode(octets), encodage: "UTF-8" }; }
  catch { return { texte: new TextDecoder("windows-1252").decode(octets), encodage: "Windows-1252" }; }
}

/** Analyse CSV (guillemets, séparateur dans un champ, sauts de ligne protégés). */
function lireCsv(texte: string, sep: string): string[][] {
  const lignes: string[][] = [];
  let champ = "", ligne: string[] = [], entre = false;
  for (let i = 0; i < texte.length; i++) {
    const ch = texte[i]!;
    if (entre) {
      if (ch === '"') { if (texte[i + 1] === '"') { champ += '"'; i++; } else entre = false; }
      else champ += ch;
    } else if (ch === '"' && champ === "") entre = true;
    else if (ch === sep) { ligne.push(champ); champ = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && texte[i + 1] === "\n") i++;
      ligne.push(champ); lignes.push(ligne); ligne = []; champ = "";
    } else champ += ch;
  }
  if (champ !== "" || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  return lignes.filter((l) => l.some((c) => c.trim() !== ""));
}

function niveau(v: string): string | null {
  const k = sansAccents(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!k) return null;
  const table: Record<string, string> = {
    CI: "CI", CP: "CP", CE1: "CE1", CE2: "CE2", CM1: "CM1", CM2: "CM2",
    "6": "6e", "6E": "6e", "6EME": "6e", SIXIEME: "6e", "5": "5e", "5E": "5e", "5EME": "5e", CINQUIEME: "5e",
    "4": "4e", "4E": "4e", "4EME": "4e", QUATRIEME: "4e", "3": "3e", "3E": "3e", "3EME": "3e", TROISIEME: "3e",
    "2": "2nde", "2NDE": "2nde", "2DE": "2nde", SECONDE: "2nde", "1": "1re", "1RE": "1re", "1ERE": "1re", PREMIERE: "1re",
    TLE: "Tle", TERMINALE: "Tle", TERM: "Tle",
  };
  return table[k] ?? null;
}

function sexe(v: string): "F" | "M" | null {
  const k = sansAccents(v).toUpperCase().trim();
  if (["F", "FILLE", "FEMININ", "FEMME"].includes(k)) return "F";
  if (["M", "G", "GARCON", "MASCULIN", "HOMME"].includes(k)) return "M";
  return null;
}

/** JJ/MM/AAAA, J/M/AAAA, JJ-MM-AAAA ou AAAA-MM-JJ → AAAA-MM-JJ (date réelle du calendrier). */
export function dateIso(v: string): string | null {
  const s = v.trim();
  let a: number, m: number, j: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (r) { a = +r[1]!; m = +r[2]!; j = +r[3]!; }
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) { j = +r[1]!; m = +r[2]!; a = +r[3]!; }
  else return null;
  const iso = `${a}-${String(m).padStart(2, "0")}-${String(j).padStart(2, "0")}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

export function lireListe(octets: ArrayBuffer): Lecture {
  const { texte: brut, encodage } = decoder(octets);
  const texte = brut.replace(/^﻿/, "");
  const premiere = texte.split(/\r?\n/, 1)[0] ?? "";
  const separateur = [";", ",", "\t"].sort((x, y) => premiere.split(y).length - premiere.split(x).length)[0]!;
  const [entetes = [], ...corps] = lireCsv(texte, separateur);
  const colonnes = entetes.map((e) => ALIAS[cleEntete(e)] ?? null);
  const colonnesManquantes = (["classe", "nom", "prenoms"] as const).filter((c) => !colonnes.includes(c));
  const lignes = corps.map((cellules, i): LigneLue => {
    const n = i + 2; // numéro de ligne du fichier (l'en-tête est la ligne 1)
    const v: Record<string, string> = {};
    colonnes.forEach((c, k) => { if (c && v[c] === undefined) v[c] = (cellules[k] ?? "").trim(); });
    const erreur = (motif: string): LigneLue => ({ n, brut: v, ligne: null, erreur: motif });
    if (!v.classe) return erreur("Classe manquante");
    if (!v.nom || !v.prenoms) return erreur("Nom et prénoms obligatoires");
    if (v.classe.length > 40 || v.nom.length > 40 || v.prenoms.length > 60 || (v.responsable ?? "").length > 80) return erreur("Champ trop long (classe 40, nom 40, prénoms 60, responsable 80 caractères)");
    const npi = (v.npi ?? "").replace(/\s/g, "");
    if (npi && !/^\d{10}$/.test(npi)) return erreur("NPI : 10 chiffres");
    const niv = v.niveau ? niveau(v.niveau) : undefined;
    if (niv === null) return erreur(`Niveau « ${v.niveau} » non reconnu (${NIVEAUX.join(", ")})`);
    const sx = v.sexe ? sexe(v.sexe) : undefined;
    if (sx === null) return erreur("Sexe : F ou M");
    const dn = v.date_naissance ? dateIso(v.date_naissance) : undefined;
    if (dn === null) return erreur("Date de naissance : JJ/MM/AAAA");
    return {
      n, brut: v, erreur: null,
      ligne: {
        n, classe: v.classe, nom: v.nom, prenoms: v.prenoms,
        ...(niv ? { niveau: niv } : {}), ...(npi ? { npi } : {}), ...(sx ? { sexe: sx } : {}),
        ...(dn ? { dateNaissance: dn } : {}), ...(v.responsable ? { responsable: v.responsable } : {}),
      },
    };
  });
  return { lignes, colonnesManquantes, separateur: separateur === "\t" ? "tabulation" : separateur, encodage };
}
