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
  /** Code machine renvoyé par l'API (mot_de_passe_a_changer, mfa_a_verifier, elevation_requise, inactivite…). */
  get code(): string | null { return (this.details as { code?: string } | null)?.code ?? null; }
  get introuvable() { return this.statut === 404; }
}

function jetonCsrf() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)beile_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : "";
}

/**
 * Activité réelle : seule une interaction (clic, frappe, défilement) des 60 dernières secondes est signalée
 * à l'API. Les rafraîchissements automatiques des écrans ne prolongent donc pas une session laissée ouverte.
 */
let derniereInteraction = 0;
if (typeof window !== "undefined") {
  for (const ev of ["pointerdown", "keydown", "wheel", "touchstart"]) window.addEventListener(ev, () => { derniereInteraction = Date.now(); }, { passive: true, capture: true });
}

let redirectionEnCours = false;
function rediriger(chemin: string, motif?: string) {
  if (typeof window === "undefined" || redirectionEnCours) return;
  const ici = window.location.pathname + window.location.search;
  if (ici.startsWith(chemin)) return;
  redirectionEnCours = true;
  // Rechargement complet volontaire : on repart d'un état client vierge (cache de requêtes vidé).
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`${chemin}?retour=${encodeURIComponent(ici)}${motif ? `&motif=${motif}` : ""}`);
}
const versConnexion = (motif = "session") => rediriger("/connexion", motif);

/**
 * Élévation juste à temps : une action d'administration refusée faute d'élévation ouvre la boîte de
 * confirmation d'identité (enregistrée par l'application), puis la requête est rejouée une fois.
 */
let demandeElevation: (() => Promise<boolean>) | null = null;
export function enregistrerElevation(f: (() => Promise<boolean>) | null) { demandeElevation = f; }

export async function requete<T>(methode: "GET" | "POST", chemin: string, corps?: unknown, options: { silencieux401?: boolean; signal?: AbortSignal; sansElevation?: boolean } = {}): Promise<T> {
  const r = await fetch(`${BASE_API}${chemin}`, {
    method: methode,
    credentials: "same-origin",
    signal: options.signal,
    headers: {
      accept: "application/json",
      ...(corps !== undefined ? { "content-type": "application/json" } : {}),
      ...(methode !== "GET" ? { "x-csrf-token": jetonCsrf() } : {}),
      ...(Date.now() - derniereInteraction < 60_000 ? { "x-beile-actif": "1" } : {}),
    },
    body: corps !== undefined ? JSON.stringify(corps) : undefined,
  }).catch(() => {
    throw new ErreurApi(0, "Connexion au service impossible. Vérifiez votre réseau.");
  });
  const texte = await r.text();
  let json: unknown = null;
  try { json = texte ? JSON.parse(texte) : null; } catch { json = null; }
  if (!r.ok) {
    const code = (json as { code?: string } | null)?.code;
    if (r.status === 401 && !options.silencieux401) versConnexion(code === "inactivite" ? "inactivite" : "session");
    if (r.status === 403 && code === "mot_de_passe_a_changer") rediriger("/mot-de-passe");
    if (r.status === 403 && (code === "mfa_a_verifier" || code === "mfa_a_enroler")) rediriger("/second-facteur");
    if (r.status === 403 && code === "elevation_requise" && !options.sansElevation && demandeElevation && (await demandeElevation())) {
      return requete<T>(methode, chemin, corps, { ...options, sansElevation: true });
    }
    const message = (json as { erreur?: string } | null)?.erreur ?? `Erreur ${r.status}`;
    throw new ErreurApi(r.status, message, json);
  }
  return json as T;
}

export const lire = <T>(chemin: string, signal?: AbortSignal) => requete<T>("GET", chemin, undefined, { signal });
export const ecrire = <T>(chemin: string, corps: unknown = {}) => requete<T>("POST", chemin, corps);
