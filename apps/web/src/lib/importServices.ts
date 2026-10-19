import { cleEntete, decoder, lireCsv } from "@/lib/importListe";

/**
 * Lecture d'un fichier de services d'enseignement (CSV) dans le navigateur. Comme pour les élèves, seules des
 * lignes typées partent vers l'API, qui reconnaît les enseignants parmi le seul personnel de l'établissement.
 */
export const MAX_SERVICES = 800;
export const COLONNES_SERVICES = ["classe", "matiere", "enseignant", "npi_enseignant", "principal"] as const;
type Colonne = (typeof COLONNES_SERVICES)[number];

export interface LigneService { n: number; classe: string; matiere: string; enseignant?: string; npiEnseignant?: string; principal?: boolean }
export interface ServiceLu { n: number; brut: Record<string, string>; ligne: LigneService | null; erreur: string | null }
export interface LectureServices { lignes: ServiceLu[]; colonnesManquantes: string[]; separateur: string; encodage: string }

export const MODELE_SERVICES = [
  COLONNES_SERVICES.join(";"),
  "6e A;Mathématiques;DOSSOU Afiavi;;oui",
  "6e A;Français;;0123456789;",
].join("\r\n");

const ALIAS: Record<string, Colonne> = {
  classe: "classe", division: "classe",
  matiere: "matiere", discipline: "matiere",
  enseignant: "enseignant", professeur: "enseignant", prof: "enseignant", nomenseignant: "enseignant",
  npienseignant: "npi_enseignant", npi: "npi_enseignant",
  principal: "principal", professeurprincipal: "principal", pp: "principal",
};
const OUI = new Set(["OUI", "O", "X", "1", "VRAI", "PP", "PRINCIPAL"]);
const NON = new Set(["", "NON", "N", "0", "FAUX"]);

export function lireServices(octets: ArrayBuffer): LectureServices {
  const { texte: brut, encodage } = decoder(octets);
  const texte = brut.replace(/^﻿/, "");
  const premiere = texte.split(/\r?\n/, 1)[0] ?? "";
  const separateur = [";", ",", "\t"].sort((x, y) => premiere.split(y).length - premiere.split(x).length)[0]!;
  const [entetes = [], ...corps] = lireCsv(texte, separateur);
  const colonnes = entetes.map((e) => ALIAS[cleEntete(e)] ?? null);
  const colonnesManquantes = (["classe", "matiere"] as const).filter((c) => !colonnes.includes(c));
  if (!colonnes.includes("enseignant") && !colonnes.includes("npi_enseignant")) colonnesManquantes.push("enseignant" as never);
  const lignes = corps.map((cellules, i): ServiceLu => {
    const n = i + 2;
    const v: Record<string, string> = {};
    colonnes.forEach((c, k) => { if (c && v[c] === undefined) v[c] = (cellules[k] ?? "").trim(); });
    const erreur = (motif: string): ServiceLu => ({ n, brut: v, ligne: null, erreur: motif });
    if (!v.classe || !v.matiere) return erreur("Classe et matière obligatoires");
    if (v.classe.length > 40 || v.matiere.length > 40 || (v.enseignant ?? "").length > 100) return erreur("Champ trop long");
    const npi = (v.npi_enseignant ?? "").replace(/\s/g, "");
    if (npi && !/^\d{10}$/.test(npi)) return erreur("NPI de l'enseignant : 10 chiffres");
    if (!npi && (v.enseignant ?? "").length < 2) return erreur("Enseignant : nom et prénoms, ou NPI");
    const p = (v.principal ?? "").toUpperCase();
    if (!OUI.has(p) && !NON.has(p)) return erreur("Principal : oui ou non");
    return {
      n, brut: v, erreur: null,
      ligne: { n, classe: v.classe, matiere: v.matiere, ...(npi ? { npiEnseignant: npi } : { enseignant: v.enseignant! }), ...(OUI.has(p) ? { principal: true } : {}) },
    };
  });
  return { lignes, colonnesManquantes, separateur: separateur === "\t" ? "tabulation" : separateur, encodage };
}
