import { randomUUID } from "node:crypto";
import type { Finalite, Profil } from "@beile/contracts";
import { connecter, schema } from "@beile/db";
import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { verify } from "hono/jwt";
import type { z } from "zod";
import { profilParId } from "./donnees";
import { lireEnv } from "./env";

/** Briques communes de l'API : base (rôle restreint), authentification, journalisation, validation. */

/** Connexion paresseuse, ouverte à la première requête avec le rôle restreint beile_api. */
let connexion: ReturnType<typeof connecter> | null = null;
export function base() {
  connexion ??= connecter(lireEnv().DATABASE_URL_API);
  return connexion.db;
}
export type Variables = { profil: Profil };

/** Limitation de débit par adresse (mémoire du processus ; Redis en production, cf. INFRASTRUCTURE.md). */
export function limiteDebit(max: number, fenetreMs: number): MiddlewareHandler {
  const compteurs = new Map<string, { n: number; debut: number }>();
  return async (c, next) => {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "local";
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

/** Validation zod du corps JSON : aucune donnée non conforme au contrat n'entre. */
export async function corps<T>(c: Context, schemaZod: z.ZodType<T>): Promise<T> {
  const brut = await c.req.json().catch(() => {
    throw new HTTPException(400, { message: "Corps JSON invalide" });
  });
  const r = schemaZod.safeParse(brut);
  if (!r.success) throw new HTTPException(422, { message: `Requête non conforme au contrat : ${r.error.issues.map((i) => `${i.path.join(".") || "corps"} ${i.message}`).join(" ; ")}` });
  return r.data;
}

/** Jeton de session signé (HS256). En production : OIDC fédéré à l'identité nationale. */
export const authentifie: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const entete = c.req.header("authorization") ?? "";
  const jeton = entete.startsWith("Bearer ") ? entete.slice(7) : "";
  if (!jeton) throw new HTTPException(401, { message: "Authentification requise" });
  let charge: Record<string, unknown>;
  try { charge = (await verify(jeton, lireEnv().JWT_SECRET, "HS256")) as Record<string, unknown>; }
  catch { throw new HTTPException(401, { message: "Jeton invalide ou expiré" }); }
  const profil = typeof charge.sub === "string" ? await profilParId(base(), charge.sub) : null;
  if (!profil) throw new HTTPException(401, { message: "Profil inconnu" });
  c.set("profil", profil);
  await next();
};

/** Journal d'audit : toute décision d'accès, accordée ou refusée, est inscrite (table en ajout seul). */
export async function journaliser(profil: Profil, action: string, ressource: string, finalite: Finalite, autorise: boolean, critereManquant: string | null) {
  await base().insert(schema.journal).values({ id: `AUD-${randomUUID()}`, profilId: profil.id, profilNom: profil.nomAffiche, action, ressource: ressource.slice(0, 200), finalite, autorise, critereManquant });
}

export const refuser = (message: string): never => {
  throw new HTTPException(403, { message });
};
