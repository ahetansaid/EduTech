"use client";

import { useSyncExternalStore } from "react";

/**
 * Mode économie de données. Au Bénin, les données mobiles coûtent cher : un écran qui se rafraîchit toutes les
 * 15 s pendant une heure consomme pour rien. En économie, aucune requête ne part en arrière-plan ; les données
 * se rafraîchissent quand on revient sur l'écran (retour d'onglet, reconnexion), ou à la demande.
 *
 * Choix de l'utilisateur d'abord (« activé » / « désactivé »), sinon détection automatique : option
 * « économie de données » du téléphone, ou réseau lent (2G). Le choix est une commodité locale (localStorage),
 * sans conséquence de sécurité : il ne change que la fréquence des lectures.
 */
export type ChoixEconomie = "auto" | "active" | "desactive";
const CLE = "beile.economie";
const abonnes = new Set<() => void>();

type ConnexionReseau = { saveData?: boolean; effectiveType?: string; addEventListener?: (t: string, f: () => void) => void; removeEventListener?: (t: string, f: () => void) => void };
const connexion = (): ConnexionReseau | undefined => (typeof navigator !== "undefined" ? (navigator as Navigator & { connection?: ConnexionReseau }).connection : undefined);

export function lireChoix(): ChoixEconomie {
  try { const v = localStorage.getItem(CLE); return v === "active" || v === "desactive" ? v : "auto"; } catch { return "auto"; }
}

export function choisirEconomie(c: ChoixEconomie) {
  try { if (c === "auto") localStorage.removeItem(CLE); else localStorage.setItem(CLE, c); } catch { /* stockage indisponible : le choix vaut pour la page */ }
  abonnes.forEach((f) => f());
}

/** Le réseau demande-t-il l'économie de lui-même ? */
export function reseauEconome() {
  const c = connexion();
  return !!c && (c.saveData === true || c.effectiveType === "slow-2g" || c.effectiveType === "2g");
}

export function economieActive(): boolean {
  if (typeof window === "undefined") return false;
  const c = lireChoix();
  return c === "active" || (c === "auto" && reseauEconome());
}

/** Intervalle de rafraîchissement : `ms` en temps normal, aucun en économie (réévalué à chaque cycle). */
export const rafraichir = (ms: number) => () => (economieActive() ? false : ms);

function abonner(f: () => void) {
  abonnes.add(f);
  connexion()?.addEventListener?.("change", f);
  return () => { abonnes.delete(f); connexion()?.removeEventListener?.("change", f); };
}

/** État courant pour l'interface (bascule, mention). */
export function useEconomie() {
  const actif = useSyncExternalStore(abonner, economieActive, () => false);
  const choix = useSyncExternalStore(abonner, lireChoix, () => "auto" as ChoixEconomie);
  return { actif, choix, auto: choix === "auto" && reseauEconome() };
}
