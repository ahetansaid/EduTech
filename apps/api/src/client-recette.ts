import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Client de recette : se connecte avec de VRAIS comptes (identifiant + mot de passe lus dans
 * COMPTES.local.md), conserve les cookies de session et envoie le jeton CSRF sur les écritures,
 * exactement comme un navigateur.
 */
export const BASE = process.env.BEILE_API ?? "http://localhost:4000/api/v1";

function trouverComptes(): Record<string, string> {
  for (let d = process.cwd(), i = 0; i < 4; i++, d = dirname(d)) {
    try {
      const t = readFileSync(join(d, "COMPTES.local.md"), "utf8");
      return Object.fromEntries([...t.matchAll(/\| `([^`]+)` \| `([^`]+)` \|/g)].map((m) => [m[1]!, m[2]!]));
    } catch { /* dossier suivant */ }
  }
  throw new Error("COMPTES.local.md introuvable : lancer `npm run comptes -w @beile/db`");
}
export const COMPTES = trouverComptes();

export class Session {
  private cookies = new Map<string, string>();
  constructor(public nom = "anonyme") {}

  private absorber(r: Response) {
    for (const c of r.headers.getSetCookie()) {
      const [paire] = c.split(";");
      const [k, ...v] = paire!.split("=");
      const valeur = v.join("=");
      if (/max-age=0/i.test(c) || valeur === "") this.cookies.delete(k!.trim());
      else this.cookies.set(k!.trim(), valeur);
    }
  }

  get aSession() { return this.cookies.has("beile_session"); }

  async appel(methode: string, chemin: string, corps?: unknown, entetes: Record<string, string> = {}) {
    const ecriture = !["GET", "HEAD"].includes(methode);
    const r = await fetch(`${BASE}${chemin}`, {
      method: methode,
      headers: {
        "content-type": "application/json",
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        ...(ecriture && this.cookies.get("beile_csrf") ? { "x-csrf-token": this.cookies.get("beile_csrf")! } : {}),
        ...entetes,
      },
      body: corps !== undefined ? JSON.stringify(corps) : undefined,
    });
    this.absorber(r);
    const texte = await r.text();
    let json: unknown = texte;
    try { json = JSON.parse(texte); } catch { /* texte brut */ }
    return { statut: r.status, json: json as Record<string, unknown> & unknown[] };
  }

  async connexion(identifiant: string, motDePasse = COMPTES[identifiant] ?? "") {
    this.nom = identifiant;
    return this.appel("POST", "/auth/connexion", { identifiant, motDePasse });
  }
}
