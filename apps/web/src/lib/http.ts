/**
 * Client HTTP de l'API BEILE.
 * - Même origine : l'API est servie sous /api/v1 (réécriture Next vers le back-end), les cookies de session
 *   sont donc « first-party », HttpOnly, et jamais lisibles par le JavaScript.
 * - Écritures : jeton CSRF en double soumission (cookie beile_csrf recopié dans l'en-tête X-CSRF-Token).
 * - Session expirée ou révoquée (401) : l'utilisateur est renvoyé vers la page de connexion, puis ramené où il était.
 */
export const BASE_API = "/api/v1";

export class ErreurApi extends Error {
  constructor(public statut: number, message: string, public details?: unknown) {
    super(message);
    this.name = "ErreurApi";
  }
  get refus() { return this.statut === 403; }
  get introuvable() { return this.statut === 404; }
}

function jetonCsrf() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)beile_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : "";
}

let redirectionEnCours = false;
function versConnexion() {
  if (typeof window === "undefined" || redirectionEnCours) return;
  const ici = window.location.pathname + window.location.search;
  if (ici.startsWith("/connexion")) return;
  redirectionEnCours = true;
  // Rechargement complet volontaire : la session a expiré, on repart d'un état client vierge (cache de requêtes vidé).
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/connexion?retour=${encodeURIComponent(ici)}&motif=session`);
}

export async function requete<T>(methode: "GET" | "POST", chemin: string, corps?: unknown, options: { silencieux401?: boolean; signal?: AbortSignal } = {}): Promise<T> {
  const r = await fetch(`${BASE_API}${chemin}`, {
    method: methode,
    credentials: "same-origin",
    signal: options.signal,
    headers: {
      accept: "application/json",
      ...(corps !== undefined ? { "content-type": "application/json" } : {}),
      ...(methode !== "GET" ? { "x-csrf-token": jetonCsrf() } : {}),
    },
    body: corps !== undefined ? JSON.stringify(corps) : undefined,
  }).catch(() => {
    throw new ErreurApi(0, "Connexion au service impossible. Vérifiez votre réseau.");
  });
  const texte = await r.text();
  let json: unknown = null;
  try { json = texte ? JSON.parse(texte) : null; } catch { json = null; }
  if (!r.ok) {
    if (r.status === 401 && !options.silencieux401) versConnexion();
    const message = (json as { erreur?: string } | null)?.erreur ?? `Erreur ${r.status}`;
    throw new ErreurApi(r.status, message, json);
  }
  return json as T;
}

export const lire = <T>(chemin: string, signal?: AbortSignal) => requete<T>("GET", chemin, undefined, { signal });
export const ecrire = <T>(chemin: string, corps: unknown = {}) => requete<T>("POST", chemin, corps);
