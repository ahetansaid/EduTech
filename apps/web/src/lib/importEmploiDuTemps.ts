import { cleEntete, decoder, lireCsv } from "@/lib/importListe";

/**
 * Lecture d'un emploi du temps (CSV) dans le navigateur. Seules des lignes typées partent vers l'API, qui contrôle
 * services, chevauchements et plages horaires ; ici on écarte ce qui ne peut pas être envoyé.
 */
export const MAX_SEANCES = 3000;
export const COLONNES_EDT = ["classe", "jour", "debut", "fin", "matiere", "enseignant", "npi_enseignant", "salle"] as const;
type Colonne = (typeof COLONNES_EDT)[number];

export interface LigneSeance { n: number; classe: string; jour: string; debut: string; fin: string; matiere: string; enseignant?: string; npiEnseignant?: string; salle?: string }
export interface SeanceLue { n: number; brut: Record<string, string>; ligne: LigneSeance | null; erreur: string | null }
export interface LectureEdt { lignes: SeanceLue[]; colonnesManquantes: string[]; separateur: string; encodage: string }

export const MODELE_EDT = [
  COLONNES_EDT.join(";"),
  "6e A;lundi;07:00;09:00;Mathématiques;DOSSOU Afiavi;;Salle 1",
  "6e A;mardi;10:00;12:00;Français;;0123456789;Salle 2",
].join("\r\n");

const ALIAS: Record<string, Colonne> = {
  classe: "classe", division: "classe",
  jour: "jour",
  debut: "debut", heuredebut: "debut", de: "debut", horairedebut: "debut",
  fin: "fin", heurefin: "fin", a: "fin", horairefin: "fin",
  matiere: "matiere", discipline: "matiere",
  enseignant: "enseignant", professeur: "enseignant", prof: "enseignant",
  npienseignant: "npi_enseignant", npi: "npi_enseignant",
  salle: "salle", local: "salle",
};

export function lireEmploiDuTemps(octets: ArrayBuffer): LectureEdt {
  const { texte: brut, encodage } = decoder(octets);
  const texte = brut.replace(/^﻿/, "");
  const premiere = texte.split(/\r?\n/, 1)[0] ?? "";
  const separateur = [";", ",", "\t"].sort((x, y) => premiere.split(y).length - premiere.split(x).length)[0]!;
  const [entetes = [], ...corps] = lireCsv(texte, separateur);
  const colonnes = entetes.map((e) => ALIAS[cleEntete(e)] ?? null);
  const colonnesManquantes: string[] = (["classe", "jour", "debut", "fin", "matiere"] as const).filter((c) => !colonnes.includes(c));
  if (!colonnes.includes("enseignant") && !colonnes.includes("npi_enseignant")) colonnesManquantes.push("enseignant");
  const lignes = corps.map((cellules, i): SeanceLue => {
    const n = i + 2;
    const v: Record<string, string> = {};
    colonnes.forEach((c, k) => { if (c && v[c] === undefined) v[c] = (cellules[k] ?? "").trim(); });
    const erreur = (motif: string): SeanceLue => ({ n, brut: v, ligne: null, erreur: motif });
    if (!v.classe || !v.jour || !v.debut || !v.fin || !v.matiere) return erreur("Classe, jour, début, fin et matière obligatoires");
    if (v.classe.length > 40 || v.matiere.length > 40 || (v.enseignant ?? "").length > 100 || (v.salle ?? "").length > 30 || v.jour.length > 12 || v.debut.length > 5 || v.fin.length > 5) return erreur("Champ trop long");
    const npi = (v.npi_enseignant ?? "").replace(/\s/g, "");
    if (npi && !/^\d{10}$/.test(npi)) return erreur("NPI de l'enseignant : 10 chiffres");
    if (!npi && (v.enseignant ?? "").length < 2) return erreur("Enseignant : nom et prénoms, ou NPI");
    return {
      n, brut: v, erreur: null,
      ligne: { n, classe: v.classe, jour: v.jour, debut: v.debut, fin: v.fin, matiere: v.matiere, ...(npi ? { npiEnseignant: npi } : { enseignant: v.enseignant! }), ...(v.salle ? { salle: v.salle } : {}) },
    };
  });
  return { lignes, colonnesManquantes, separateur: separateur === "\t" ? "tabulation" : separateur, encodage };
}
