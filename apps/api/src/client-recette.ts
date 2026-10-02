import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { codeTotp } from "@beile/db/securite";

/**
 * Client de recette : se connecte avec de VRAIS comptes (identifiant + mot de passe lus dans
 * COMPTES.local.md), conserve les cookies de session et envoie le jeton CSRF sur les écritures,
 * exactement comme un navigateur.
 */
export const BASE = process.env.BEILE_API ?? "http://localhost:4000/api/v1";

function lireFichierComptes(): string {
  if (process.env.BEILE_FICHIER_COMPTES) return readFileSync(process.env.BEILE_FICHIER_COMPTES, "utf8");
  for (let d = process.cwd(), i = 0; i < 4; i++, d = dirname(d)) {
    try { return readFileSync(join(d, "COMPTES.local.md"), "utf8"); } catch { /* dossier suivant */ }
  }
  throw new Error("COMPTES.local.md introuvable : lancer `npm run comptes -w @beile/db`");
}
export const FICHIER_COMPTES = lireFichierComptes();
export const COMPTES: Record<string, string> = Object.fromEntries([...FICHIER_COMPTES.matchAll(/\| `([^`]+)` \| `([^`]+)` \|/g)].map((m) => [m[1]!, m[2]!]));
/** Secrets TOTP des comptes de test soumis au second facteur (lignes « - TOTP `identifiant` : `SECRET` »). */
export const TOTP: Record<string, string> = Object.fromEntries([...FICHIER_COMPTES.matchAll(/^- TOTP `([^`]+)` : `([A-Z2-7]+)`/gm)].map((m) => [m[1]!, m[2]!]));

/**
 * Code TOTP frais pour un compte : le serveur refuse le rejeu d'un pas déjà consommé, on prend donc le pas
 * courant, sinon le suivant (tolérance ±1), sinon on attend le pas d'après. Suivi partagé par compte.
 */
const derniersPas = new Map<string, number>();
/** Le pas courant (et le suivant) sont considérés comme consommés : le prochain code attendra le pas d'après. */
export const passerAuPasSuivant = (identifiant: string) => derniersPas.set(identifiant, Math.floor(Date.now() / 30_000) + 1);
export async function codeFrais(identifiant: string): Promise<string> {
  const secret = TOTP[identifiant];
  if (!secret) throw new Error(`Aucun secret TOTP pour ${identifiant} : lancer « npm run mfa:comptes-test -w @beile/api »`);
  for (;;) {
    const pas = Math.floor(Date.now() / 30_000), dernier = derniersPas.get(identifiant) ?? -1;
    for (const d of [0, 1]) {
      if (pas + d > dernier) { derniersPas.set(identifiant, pas + d); return codeTotp(secret, Date.now(), d); }
    }
    await new Promise((r) => setTimeout(r, 30_000 - (Date.now() % 30_000) + 50));
  }
}

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

  /** Connexion ; pour un compte soumis au second facteur dont le secret est connu, le code est présenté aussitôt. */
  async connexion(identifiant: string, motDePasse = COMPTES[identifiant] ?? "", entetes: Record<string, string> = {}) {
    this.nom = identifiant;
    const r = await this.appel("POST", "/auth/connexion", { identifiant, motDePasse }, entetes);
    if (r.statut === 200 && r.json.etape === "mfa_a_verifier" && TOTP[identifiant]) {
      let v = await this.appel("POST", "/auth/mfa/verifier", { code: await codeFrais(identifiant) }, entetes);
      // Pas déjà consommé par un autre processus (anti-rejeu du serveur) : on attend le pas suivant, une fois.
      if (v.statut === 422) { passerAuPasSuivant(identifiant); v = await this.appel("POST", "/auth/mfa/verifier", { code: await codeFrais(identifiant) }, entetes); }
      if (v.statut !== 200) return v;
    }
    return r;
  }

  /** Élévation juste à temps (actions d'administration) : code TOTP si le compte en a un, sinon mot de passe. */
  async elever() {
    if (!TOTP[this.nom]) return this.appel("POST", "/auth/elevation", { motDePasse: COMPTES[this.nom] ?? "" });
    const r = await this.appel("POST", "/auth/elevation", { code: await codeFrais(this.nom) });
    if (r.statut !== 422) return r;
    passerAuPasSuivant(this.nom);
    return this.appel("POST", "/auth/elevation", { code: await codeFrais(this.nom) });
  }
}
