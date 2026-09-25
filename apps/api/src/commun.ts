import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Finalite, Profil } from "@beile/contracts";
import { connecter, schema } from "@beile/db";
import { empreinteJeton } from "@beile/db/securite";
import { and, eq, gt } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";
import { lireEnv } from "./env";

/** Briques communes de l'API : base (rôle restreint), sessions, CSRF, journalisation, validation. */

let connexion: ReturnType<typeof connecter> | null = null;
export function base() {
  connexion ??= connecter(lireEnv().DATABASE_URL_API);
  return connexion.db;
}

export interface CompteSession { id: string; identifiant: string; doitChangerMotDePasse: boolean; empreinteSession: string }
export type Variables = { profil: Profil; compte: CompteSession };

export const COOKIE_SESSION = "beile_session";
export const COOKIE_CSRF = "beile_csrf";

/** Limitation de débit par adresse (mémoire du processus ; Redis en production, cf. INFRASTRUCTURE.md). */
export function limiteDebit(max: number, fenetreMs: number): MiddlewareHandler {
  const compteurs = new Map<string, { n: number; debut: number }>();
  return async (c, next) => {
    const ip = adresseIp(c);
    const maintenant = Date.now();
    const e = compteurs.get(ip);
    if (!e || maintenant - e.debut > fenetreMs) compteurs.set(ip, { n: 1, debut: maintenant });
    else if (++e.n > max) {
      c.header("Retry-After", String(Math.ceil((fenetreMs - (maintenant - e.debut)) / 1000)));
      throw new HTTPException(429, { message: "Trop de requêtes : réessayez dans quelques instants." });
    }
    if (compteurs.size > 10_000) compteurs.clear();
    await next();
  };
}

export const adresseIp = (c: Context) => c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "local";

/** Validation zod du corps JSON : aucune donnée non conforme au contrat n'entre. */
export async function corps<T>(c: Context, schemaZod: z.ZodType<T>): Promise<T> {
  const brut = await c.req.json().catch(() => {
    throw new HTTPException(400, { message: "Corps JSON invalide" });
  });
  const r = schemaZod.safeParse(brut);
  if (!r.success) throw new HTTPException(422, { message: `Requête non conforme au contrat : ${r.error.issues.map((i) => `${i.path.join(".") || "corps"} ${i.message}`).join(" ; ")}` });
  return r.data;
}

/**
 * Protection des écritures : l'origine doit être la plateforme elle-même (ou une origine autorisée),
 * et le jeton CSRF envoyé en en-tête doit correspondre au cookie (double soumission).
 */
export function controlerOrigine(c: Context) {
  const origine = c.req.header("origin");
  if (!origine) return;
  const hote = new URL(c.req.url).host;
  if (new URL(origine).host !== hote && !lireEnv().ORIGINES.includes(origine)) throw new HTTPException(403, { message: "Origine de la requête non autorisée" });
}

function controlerCsrf(c: Context) {
  const cookie = getCookie(c, COOKIE_CSRF) ?? "";
  const entete = c.req.header("x-csrf-token") ?? "";
  const a = Buffer.from(cookie), b = Buffer.from(entete);
  if (!cookie || a.length !== b.length || !timingSafeEqual(a, b)) throw new HTTPException(403, { message: "Jeton anti-falsification (CSRF) manquant ou invalide" });
}

/** Session : cookie HttpOnly → empreinte SHA-256 → session valide, compte actif → profil d'habilitations. */
export const authentifie: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const jeton = getCookie(c, COOKIE_SESSION);
  if (!jeton) throw new HTTPException(401, { message: "Authentification requise" });
  const empreinte = empreinteJeton(jeton);
  const [ligne] = await base()
    .select({ session: schema.sessions, compte: schema.comptes, profil: schema.profils })
    .from(schema.sessions)
    .innerJoin(schema.comptes, eq(schema.comptes.id, schema.sessions.compteId))
    .innerJoin(schema.profils, eq(schema.profils.id, schema.comptes.profilId))
    .where(and(eq(schema.sessions.empreinte, empreinte), eq(schema.sessions.revoquee, false), gt(schema.sessions.expireLe, new Date()), eq(schema.comptes.actif, true)));
  if (!ligne) throw new HTTPException(401, { message: "Session expirée : reconnectez-vous" });
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) { controlerOrigine(c); controlerCsrf(c); }
  // Activité glissante, écrite au plus toutes les 5 minutes.
  if (Date.now() - ligne.session.derniereActivite.getTime() > 5 * 60_000) {
    await base().update(schema.sessions).set({ derniereActivite: new Date() }).where(eq(schema.sessions.empreinte, empreinte));
  }
  c.set("profil", { ...ligne.profil, habilitations: ligne.profil.habilitations as Profil["habilitations"] });
  c.set("compte", { id: ligne.compte.id, identifiant: ligne.compte.identifiant, doitChangerMotDePasse: ligne.compte.doitChangerMotDePasse, empreinteSession: empreinte });
  await next();
};

/** Journal d'audit : toute décision d'accès, accordée ou refusée, est inscrite (table en ajout seul). */
export async function journaliser(profil: Pick<Profil, "id" | "nomAffiche">, action: string, ressource: string, finalite: Finalite, autorise: boolean, critereManquant: string | null) {
  await base().insert(schema.journal).values({ id: `AUD-${randomUUID()}`, profilId: profil.id, profilNom: profil.nomAffiche, action, ressource: ressource.slice(0, 200), finalite, autorise, critereManquant });
}

export const refuser = (message: string): never => {
  throw new HTTPException(403, { message });
};
