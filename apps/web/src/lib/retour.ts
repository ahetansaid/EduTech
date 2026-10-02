/**
 * Adresse de retour après connexion, changement de mot de passe ou second facteur : seulement un chemin
 * interne de l'application. Refuse tout ce qu'un navigateur résoudrait vers une autre origine
 * (« //x », « /\x », caractères de contrôle comme « /\t/x »), et les pages d'authentification elles-mêmes
 * (boucles). Sinon, une page de connexion authentique redirigerait vers un clone d'hameçonnage.
 */
const ETAPES = ["/connexion", "/mot-de-passe", "/second-facteur", "/activation", "/mot-de-passe-oublie"];

export function retourSur(valeur: string | null): string | null {
  if (!valeur || typeof window === "undefined") return null;
  if (!/^\/(?![/\\])/.test(valeur) || /[\u0000-\u001F\u007F\\]/.test(valeur)) return null;
  let u: URL;
  try { u = new URL(valeur, window.location.origin); } catch { return null; }
  if (u.origin !== window.location.origin) return null;
  if (ETAPES.some((e) => u.pathname === e || u.pathname.startsWith(`${e}/`))) return null;
  return u.pathname + u.search + u.hash;
}
