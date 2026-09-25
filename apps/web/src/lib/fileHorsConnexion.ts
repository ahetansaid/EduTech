"use client";

import { useSyncExternalStore } from "react";
import { ecrire, ErreurApi } from "./http";

/**
 * File d'attente hors connexion — saisies de terrain (appel, notes, corrections).
 *
 * - Persistée en localStorage : survit au rechargement, à la fermeture de l'onglet et à une coupure prolongée.
 * - Chaque saisie porte un identifiant unique et sa date de saisie réelle (celle du geste, pas du renvoi).
 * - Vidée automatiquement au retour du réseau (événement « online »), dans l'ordre de saisie.
 * - Idempotence : une saisie acceptée par le serveur est retirée de la file ET son identifiant est inscrit dans
 *   un registre local des saisies acceptées ; elle n'est jamais rejouée, même si l'onglet se ferme entre la réponse
 *   et le retrait. Un verrou (Web Locks, repli en mémoire) empêche deux onglets de vider la file en même temps.
 *   Chaque type de saisie peut en outre déclarer une vérification serveur (`avantEnvoi`) : pour l'appel,
 *   les élèves déjà enregistrés absents à cette date sont retirés avant l'envoi (clé naturelle classe + date + élève).
 * - Réponses : réseau indisponible (statut 0) ou 5xx → la saisie reste et sera retentée ; 401 → la saisie reste
 *   (la personne doit se reconnecter) ; autre 4xx (refus, élève hors classe, validation) → la saisie est retirée
 *   de la file et signalée, pour ne pas bloquer les suivantes.
 */

export type TypeSaisie = "appel" | "notes" | "correction";

export interface SaisieEnAttente {
  id: string;
  type: TypeSaisie;
  /** Route d'écriture de l'API (sous /api/v1). */
  chemin: string;
  corps: Record<string, unknown>;
  /** Libellé lisible (« Appel 5e A · 3 absents »). */
  libelle: string;
  /** Rattachement, pour filtrer l'affichage par classe. */
  classeId?: string;
  /** Date ISO du geste de saisie. */
  saisiLe: string;
  tentatives: number;
  derniereErreur?: string;
}

export interface BilanSynchronisation {
  envoyees: SaisieEnAttente[];
  rejetees: { saisie: SaisieEnAttente; motif: string }[];
  restantes: number;
}

const CLE_FILE = "beile.file-hors-connexion.v1";
const CLE_ACCEPTEES = "beile.file-hors-connexion.acceptees.v1";
const EVENEMENT = "beile:file-hors-connexion";
const VIDE: SaisieEnAttente[] = [];

/* ------------------------------------------------------------------ Stockage */

function lireBrut(cle: string): string | null {
  try { return typeof localStorage === "undefined" ? null : localStorage.getItem(cle); } catch { return null; }
}

function ecrireBrut(cle: string, valeur: string) {
  try { localStorage.setItem(cle, valeur); } catch { /* quota ou mode privé : la saisie reste en mémoire pour la session */ }
}

let memoire: SaisieEnAttente[] | null = null;
let cacheBrut: string | null = null;
let cacheListe: SaisieEnAttente[] = VIDE;

/** Lecture avec cache : même référence tant que le contenu ne change pas (exigé par useSyncExternalStore). */
export function lireFile(): SaisieEnAttente[] {
  const brut = lireBrut(CLE_FILE);
  if (brut === null) return memoire ?? VIDE;
  if (brut === cacheBrut) return cacheListe;
  try {
    const liste = JSON.parse(brut) as SaisieEnAttente[];
    cacheBrut = brut;
    cacheListe = Array.isArray(liste) ? liste : VIDE;
  } catch {
    cacheBrut = brut;
    cacheListe = VIDE;
  }
  return cacheListe;
}

function ecrireFile(liste: SaisieEnAttente[]) {
  memoire = liste;
  ecrireBrut(CLE_FILE, JSON.stringify(liste));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENEMENT));
}

function acceptees(): string[] {
  try { return JSON.parse(lireBrut(CLE_ACCEPTEES) ?? "[]") as string[]; } catch { return []; }
}

function marquerAcceptee(id: string) {
  ecrireBrut(CLE_ACCEPTEES, JSON.stringify([...acceptees().filter((x) => x !== id), id].slice(-300)));
}

function identifiant() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ------------------------------------------------------------------ Opérations */

export function mettreEnFile(s: Pick<SaisieEnAttente, "type" | "chemin" | "corps" | "libelle" | "classeId">): SaisieEnAttente {
  const saisie: SaisieEnAttente = { ...s, id: identifiant(), saisiLe: new Date().toISOString(), tentatives: 0 };
  ecrireFile([...lireFile(), saisie]);
  return saisie;
}

export function retirerDeLaFile(id: string) {
  ecrireFile(lireFile().filter((s) => s.id !== id));
}

/**
 * Erreur « réseau » : pas de réponse du serveur (hors connexion, coupure, DNS), ou passerelle sans service
 * derrière elle (502/503/504 : la requête n'a pas atteint l'API). Un 500 n'en fait pas partie : l'écriture a pu avoir lieu.
 */
export const estErreurReseau = (e: unknown) => e instanceof ErreurApi && [0, 502, 503, 504].includes(e.statut);

/**
 * Vérification propre à un type, juste avant l'envoi : renvoie le corps à envoyer,
 * ou null si la saisie est déjà entièrement enregistrée côté serveur (elle est alors retirée sans renvoi).
 */
export type AvantEnvoi = (s: SaisieEnAttente) => Promise<Record<string, unknown> | null>;
const verifications = new Map<TypeSaisie, AvantEnvoi>();
export function declarerVerification(type: TypeSaisie, f: AvantEnvoi) { verifications.set(type, f); }

let enCours: Promise<BilanSynchronisation> | null = null;

/** Réseau mobile instable : une requête sans réponse au bout de 30 s est traitée comme une coupure (nouvel essai plus tard). */
function avecDelai<T>(p: Promise<T>, ms = 30_000): Promise<T> {
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<never>((_, rejeter) => { minuterie = setTimeout(() => rejeter(new ErreurApi(0, "Délai de réponse dépassé")), ms); });
  return Promise.race([p, delai]).finally(() => clearTimeout(minuterie));
}

async function sousVerrou<T>(f: () => Promise<T>): Promise<T> {
  const verrous = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  return verrous ? (verrous.request("beile-file-hors-connexion", f) as Promise<T>) : f();
}

/** Vide la file dans l'ordre de saisie. Un seul vidage à la fois (onglet et inter-onglets). */
export function synchroniser(): Promise<BilanSynchronisation> {
  if (enCours) return enCours;
  enCours = sousVerrou(async () => {
    const bilan: BilanSynchronisation = { envoyees: [], rejetees: [], restantes: 0 };
    const dejaAcceptees = new Set(acceptees());
    for (const saisie of [...lireFile()]) {
      // Relire à chaque tour : un autre onglet a pu la traiter entre-temps.
      if (!lireFile().some((s) => s.id === saisie.id)) continue;
      if (dejaAcceptees.has(saisie.id)) { retirerDeLaFile(saisie.id); continue; }
      if (typeof navigator !== "undefined" && !navigator.onLine) break;
      try {
        const verification = verifications.get(saisie.type);
        const corps = verification ? await avecDelai(verification(saisie)) : saisie.corps;
        // L'identifiant de la saisie sert de clé d'idempotence côté serveur (rejeu sans doublon).
        const idempotent = saisie.type === "appel" || saisie.type === "notes";
        if (corps) await avecDelai(ecrire(saisie.chemin, idempotent ? { ...corps, idSaisie: saisie.id } : corps));
        marquerAcceptee(saisie.id);
        retirerDeLaFile(saisie.id);
        bilan.envoyees.push(saisie);
      } catch (e) {
        const statut = e instanceof ErreurApi ? e.statut : 0;
        const message = e instanceof Error ? e.message : "Erreur inconnue";
        if (statut === 409 && (e as ErreurApi).details && ((e as ErreurApi).details as { deja?: boolean }).deja) {
          marquerAcceptee(saisie.id);
          retirerDeLaFile(saisie.id);
          bilan.envoyees.push(saisie);
          continue;
        }
        if (statut === 0 || statut === 401 || statut === 429 || statut >= 500) {
          ecrireFile(lireFile().map((s) => (s.id === saisie.id ? { ...s, tentatives: s.tentatives + 1, derniereErreur: message } : s)));
          break; // encore hors connexion, session à renouveler ou service indisponible : on retentera plus tard
        }
        retirerDeLaFile(saisie.id);
        bilan.rejetees.push({ saisie, motif: message });
      }
    }
    bilan.restantes = lireFile().length;
    return bilan;
  }).finally(() => { enCours = null; });
  return enCours;
}

/* ------------------------------------------------------------------ Abonnement React */

function abonner(f: () => void) {
  const surStockage = (e: StorageEvent) => { if (e.key === CLE_FILE) f(); };
  window.addEventListener(EVENEMENT, f);
  window.addEventListener("storage", surStockage);
  return () => { window.removeEventListener(EVENEMENT, f); window.removeEventListener("storage", surStockage); };
}

/** Saisies en attente (toutes, ou celles d'une classe). Se met à jour entre onglets. */
export function useFileHorsConnexion(classeId?: string): SaisieEnAttente[] {
  const liste = useSyncExternalStore(abonner, lireFile, () => VIDE);
  return classeId ? liste.filter((s) => s.classeId === classeId) : liste;
}
