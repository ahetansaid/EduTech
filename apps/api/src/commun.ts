import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
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

/**
 * Limitation de débit à fenêtre fixe (mémoire du processus ; Redis partagé en production, cf. INFRASTRUCTURE.md).
 * La clé est l'adresse IP par défaut, ou toute autre clé (session) : un établissement derrière un NAT partage
 * une IP, il faut donc un plafond par IP large ET un plafond par utilisateur.
 * Mémoire bornée : purge des fenêtres expirées, puis éviction des plus anciennes — jamais de remise à zéro globale.
 */
const ENTREES_MAX = 50_000;
export function limiteDebit(max: number, fenetreMs: number, cle: (c: Context) => string = adresseIp): MiddlewareHandler {
  const compteurs = new Map<string, { n: number; debut: number }>();
  return async (c, next) => {
    const k = cle(c);
    const maintenant = Date.now();
    const e = compteurs.get(k);
    if (!e || maintenant - e.debut > fenetreMs) {
      compteurs.delete(k);
      compteurs.set(k, { n: 1, debut: maintenant });
      if (compteurs.size > ENTREES_MAX) {
        for (const [x, v] of compteurs) if (maintenant - v.debut > fenetreMs) compteurs.delete(x);
        for (const x of compteurs.keys()) { if (compteurs.size <= ENTREES_MAX * 0.9) break; compteurs.delete(x); }
      }
    } else if (++e.n > max) {
      c.header("Retry-After", String(Math.ceil((fenetreMs - (maintenant - e.debut)) / 1000)));
      throw new HTTPException(429, { message: "Trop de requêtes : réessayez dans quelques instants." });
    }
    await next();
  };
}

/** Clé « utilisateur » : empreinte du cookie de session s'il existe, sinon l'adresse IP. */
export const cleUtilisateur = (c: Context) => {
  const jeton = getCookie(c, COOKIE_SESSION);
  return jeton ? `s:${createHash("sha256").update(jeton).digest("base64url").slice(0, 22)}` : `ip:${adresseIp(c)}`;
};

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

/**
 * Cache de sessions par instance (30 s) : à l'échelle nationale, on évite une lecture en base à chaque
 * requête. Une révocation prend effet immédiatement sur l'instance qui la traite, en 30 s au plus ailleurs.
 */
const CACHE_SESSIONS_MS = 30_000;
const cacheSessions = new Map<string, { expire: number; profil: Profil; compte: CompteSession }>();
export const oublierSession = (empreinte: string) => cacheSessions.delete(empreinte);

/** Session : cookie HttpOnly → empreinte SHA-256 → session valide, compte actif → profil d'habilitations. */
export const authentifie: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const jeton = getCookie(c, COOKIE_SESSION);
  if (!jeton) throw new HTTPException(401, { message: "Authentification requise" });
  const empreinte = empreinteJeton(jeton);
  const enCache = cacheSessions.get(empreinte);
  if (enCache && enCache.expire > Date.now()) {
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) { controlerOrigine(c); controlerCsrf(c); }
    c.set("profil", enCache.profil);
    c.set("compte", enCache.compte);
    return next();
  }
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
  const profil = { ...ligne.profil, habilitations: ligne.profil.habilitations as Profil["habilitations"] };
  const compte = { id: ligne.compte.id, identifiant: ligne.compte.identifiant, doitChangerMotDePasse: ligne.compte.doitChangerMotDePasse, empreinteSession: empreinte };
  if (cacheSessions.size > 50_000) for (const [k, v] of cacheSessions) if (v.expire <= Date.now()) cacheSessions.delete(k);
  cacheSessions.set(empreinte, { expire: Date.now() + CACHE_SESSIONS_MS, profil, compte });
  c.set("profil", profil);
  c.set("compte", compte);
  await next();
};

/**
 * Journal d'audit. Les refus sont toujours tracés. Une CONSULTATION accordée identique (même profil, action,
 * ressource, finalité) n'est tracée qu'une fois par fenêtre de 10 min et par instance : les écrans rafraîchis
 * automatiquement (tableaux de bord « du jour ») ne multiplient pas les lignes — sans quoi 15 000 directions
 * produiraient des dizaines de millions d'entrées par jour sans information supplémentaire.
 */
const FENETRE_CONSULTATION_MS = 10 * 60_000;
const dernieresConsultations = new Map<string, number>();
export async function journaliser(profil: Pick<Profil, "id" | "nomAffiche">, action: string, ressource: string, finalite: Finalite, autorise: boolean, critereManquant: string | null) {
  if (autorise && action.startsWith("Consultation")) {
    const cle = `${profil.id}|${action}|${ressource}|${finalite}`;
    const maintenant = Date.now();
    const derniere = dernieresConsultations.get(cle);
    if (derniere && maintenant - derniere < FENETRE_CONSULTATION_MS) return;
    dernieresConsultations.set(cle, maintenant);
    if (dernieresConsultations.size > 100_000) for (const [k, t] of dernieresConsultations) if (maintenant - t > FENETRE_CONSULTATION_MS) dernieresConsultations.delete(k);
  }
  await base().insert(schema.journal).values({ id: `AUD-${randomUUID()}`, profilId: profil.id, profilNom: profil.nomAffiche, action, ressource: ressource.slice(0, 200), finalite, autorise, critereManquant });
}

export const refuser = (message: string): never => {
  throw new HTTPException(403, { message });
};

/** Tri alphabétique français : un collateur partagé (localeCompare avec locale en recrée un à chaque appel, ×6 plus lent). */
const collateur = new Intl.Collator("fr");
export const comparerFr = (a: string, b: string) => collateur.compare(a, b);
