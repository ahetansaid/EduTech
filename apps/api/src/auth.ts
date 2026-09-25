import { randomBytes } from "node:crypto";
import { schema } from "@beile/db";
import { empreinteJeton, genererMotDePasse, hacherMotDePasse, motDePasseConforme, nouveauJeton, verifierMotDePasse } from "@beile/db/securite";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { adresseIp, authentifie, base, controlerOrigine, COOKIE_CSRF, COOKIE_SESSION, corps, journaliser, limiteDebit, oublierSession, refuser, type Variables } from "./commun";

/**
 * Authentification : identifiant + mot de passe (scrypt), session serveur de 12 h dans un cookie HttpOnly,
 * jeton CSRF en double soumission, verrouillage de 15 min après 5 échecs. Chaque connexion est journalisée.
 */
export const auth = new Hono<{ Variables: Variables }>();

const DUREE_SESSION_MS = 12 * 3600_000;
const ECHECS_MAX = 5;
const VERROU_MS = 15 * 60_000;
/** Empreinte factice : la vérification coûte le même temps même si le compte n'existe pas (pas d'énumération). */
const HASH_FACTICE = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$" + "A".repeat(86);

const securise = (c: Context) => c.req.url.startsWith("https://") || c.req.header("x-forwarded-proto") === "https";

function poserCookies(c: Context, jeton: string) {
  const secure = securise(c);
  setCookie(c, COOKIE_SESSION, jeton, { httpOnly: true, secure, sameSite: "Lax", path: "/", maxAge: DUREE_SESSION_MS / 1000 });
  setCookie(c, COOKIE_CSRF, randomBytes(24).toString("base64url"), { httpOnly: false, secure, sameSite: "Strict", path: "/", maxAge: DUREE_SESSION_MS / 1000 });
}

// Limite par IP large : établissements et réseaux mobiles partagent souvent une IP (NAT). La force brute
// est bornée par le verrouillage par compte (5 échecs → 15 min).
auth.post("/auth/connexion", limiteDebit(60, 60_000), async (c) => {
  controlerOrigine(c);
  const { identifiant, motDePasse } = await corps(c, z.object({ identifiant: z.string().trim().toLowerCase().min(3).max(80), motDePasse: z.string().min(1).max(200) }).strict());
  const [compte] = await base().select().from(schema.comptes).where(eq(schema.comptes.identifiant, identifiant));
  const [profil] = compte ? await base().select().from(schema.profils).where(eq(schema.profils.id, compte.profilId)) : [];

  if (compte?.verrouilleJusquA && compte.verrouilleJusquA > new Date()) {
    if (profil) await journaliser(profil, "Connexion — compte verrouillé", identifiant, "gestion", false, "role");
    const minutes = Math.ceil((compte.verrouilleJusquA.getTime() - Date.now()) / 60_000);
    throw new HTTPException(423, { message: `Compte temporairement verrouillé après plusieurs échecs. Réessayez dans ${minutes} minute(s).` });
  }
  const valide = await verifierMotDePasse(motDePasse, compte?.motDePasseHash ?? HASH_FACTICE);
  if (!compte || !profil || !compte.actif || !valide) {
    if (compte) {
      const echecs = compte.echecsConsecutifs + 1;
      await base().update(schema.comptes).set({ echecsConsecutifs: echecs, verrouilleJusquA: echecs >= ECHECS_MAX ? new Date(Date.now() + VERROU_MS) : null }).where(eq(schema.comptes.id, compte.id));
      if (profil) await journaliser(profil, "Connexion refusée", `${identifiant} (${echecs} échec(s))`, "gestion", false, "role");
    }
    throw new HTTPException(401, { message: "Identifiant ou mot de passe incorrect" });
  }

  const jeton = nouveauJeton();
  await base().insert(schema.sessions).values({ empreinte: empreinteJeton(jeton), compteId: compte.id, expireLe: new Date(Date.now() + DUREE_SESSION_MS), adresseIp: adresseIp(c), agent: (c.req.header("user-agent") ?? "").slice(0, 200) });
  await base().update(schema.comptes).set({ echecsConsecutifs: 0, verrouilleJusquA: null, derniereConnexion: new Date() }).where(eq(schema.comptes.id, compte.id));
  await journaliser(profil, "Connexion", identifiant, "gestion", true, null);
  poserCookies(c, jeton);
  return c.json({ profil, compte: { identifiant: compte.identifiant, doitChangerMotDePasse: compte.doitChangerMotDePasse } });
});

auth.get("/auth/session", authentifie, (c) => c.json({ profil: c.get("profil"), compte: { identifiant: c.get("compte").identifiant, doitChangerMotDePasse: c.get("compte").doitChangerMotDePasse } }));

auth.post("/auth/deconnexion", authentifie, async (c) => {
  await base().update(schema.sessions).set({ revoquee: true }).where(eq(schema.sessions.empreinte, c.get("compte").empreinteSession));
  oublierSession(c.get("compte").empreinteSession);
  await journaliser(c.get("profil"), "Déconnexion", c.get("compte").identifiant, "gestion", true, null);
  deleteCookie(c, COOKIE_SESSION, { path: "/" });
  deleteCookie(c, COOKIE_CSRF, { path: "/" });
  return c.json({ ok: true });
});

auth.post("/auth/mot-de-passe", authentifie, limiteDebit(10, 60_000), async (c) => {
  const { actuel, nouveau } = await corps(c, z.object({ actuel: z.string().min(1).max(200), nouveau: z.string().min(12).max(200) }).strict());
  if (!motDePasseConforme(nouveau)) throw new HTTPException(422, { message: "12 caractères minimum, avec au moins une minuscule, une majuscule et un chiffre" });
  const compte = c.get("compte");
  const [ligne] = await base().select().from(schema.comptes).where(eq(schema.comptes.id, compte.id));
  if (!ligne || !(await verifierMotDePasse(actuel, ligne.motDePasseHash))) throw new HTTPException(401, { message: "Mot de passe actuel incorrect" });
  if (actuel === nouveau) throw new HTTPException(422, { message: "Le nouveau mot de passe doit être différent de l'actuel" });
  await base().update(schema.comptes).set({ motDePasseHash: await hacherMotDePasse(nouveau), doitChangerMotDePasse: false }).where(eq(schema.comptes.id, compte.id));
  await base().update(schema.sessions).set({ revoquee: true }).where(and(eq(schema.sessions.compteId, compte.id), ne(schema.sessions.empreinte, compte.empreinteSession)));
  await journaliser(c.get("profil"), "Changement de mot de passe", compte.identifiant, "gestion", true, null);
  return c.json({ ok: true });
});

/* ------------------------------------------------------------------ Administration des comptes */

function exigerAdmin(c: Context<{ Variables: Variables }>) {
  if (!c.get("profil").habilitations.some((h) => h.role === "administrateur")) refuser("Réservé à l'administrateur de la plateforme");
}

auth.get("/admin/comptes", authentifie, async (c) => {
  exigerAdmin(c);
  const lignes = await base()
    .select({
      id: schema.comptes.id, identifiant: schema.comptes.identifiant, actif: schema.comptes.actif, derniereConnexion: schema.comptes.derniereConnexion,
      verrouilleJusquA: schema.comptes.verrouilleJusquA, doitChangerMotDePasse: schema.comptes.doitChangerMotDePasse, echecs: schema.comptes.echecsConsecutifs,
      profilId: schema.profils.id, nomAffiche: schema.profils.nomAffiche, fonction: schema.profils.fonction,
      sessionsActives: sql<number>`(select count(*)::int from core.sessions s where s.compte_id = ${schema.comptes.id} and not s.revoquee and s.expire_le > now())`,
    })
    .from(schema.comptes)
    .innerJoin(schema.profils, eq(schema.profils.id, schema.comptes.profilId))
    .orderBy(desc(schema.comptes.derniereConnexion));
  await journaliser(c.get("profil"), "Consultation des comptes", "core.comptes", "gestion", true, null);
  return c.json(lignes);
});

auth.post("/admin/comptes/:id/reinitialiser", authentifie, async (c) => {
  exigerAdmin(c);
  const id = z.string().regex(/^CPT-[a-z]+$/).parse(c.req.param("id"));
  const temporaire = genererMotDePasse();
  const [maj] = await base().update(schema.comptes).set({ motDePasseHash: await hacherMotDePasse(temporaire), doitChangerMotDePasse: true, echecsConsecutifs: 0, verrouilleJusquA: null }).where(eq(schema.comptes.id, id)).returning({ id: schema.comptes.id });
  if (!maj) throw new HTTPException(404, { message: "Compte introuvable" });
  await base().update(schema.sessions).set({ revoquee: true }).where(eq(schema.sessions.compteId, id));
  await journaliser(c.get("profil"), "Réinitialisation du mot de passe", id, "gestion", true, null);
  return c.json({ motDePasseTemporaire: temporaire });
});

auth.post("/admin/comptes/:id/activation", authentifie, async (c) => {
  exigerAdmin(c);
  const id = z.string().regex(/^CPT-[a-z]+$/).parse(c.req.param("id"));
  const { actif } = await corps(c, z.object({ actif: z.boolean() }).strict());
  if (id === c.get("compte").id && !actif) throw new HTTPException(422, { message: "Impossible de désactiver son propre compte" });
  await base().update(schema.comptes).set({ actif }).where(eq(schema.comptes.id, id));
  if (!actif) await base().update(schema.sessions).set({ revoquee: true }).where(eq(schema.sessions.compteId, id));
  await journaliser(c.get("profil"), actif ? "Activation d'un compte" : "Désactivation d'un compte", id, "gestion", true, null);
  return c.json({ ok: true });
});
