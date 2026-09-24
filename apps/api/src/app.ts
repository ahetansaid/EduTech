import type { Perimetre, ResultatVerification } from "@beile/contracts";
import { RequeteSemantique } from "@beile/contracts";
import { repondre } from "@beile/simulation/ask";
import { empreinteCertificat } from "@beile/simulation/micro";
import { getCouches, getMonde } from "@beile/simulation/monde";
import { calculer, DICTIONNAIRE, priorites } from "@beile/simulation/semantique";
import { COMMUNES, DEPARTEMENTS } from "@beile/simulation/territoire";
import { Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";

/**
 * API BEILE v1 — sert le contrat défini dans @beile/contracts, sur le même moteur que l'interface.
 * Application indépendante de l'hébergement : montée par server.ts (Node, conteneur) ou par un
 * adaptateur Vercel. Les données sont fictives tant que l'API tourne hors infrastructure souveraine.
 *
 * Authentification : à brancher (OIDC, identité nationale). En attendant, le périmètre appliqué
 * aux requêtes agrégées est national et aucune route n'expose de donnée individuelle.
 */

/** Limitation de débit par adresse (mémoire du processus ; Redis en production, cf. INFRASTRUCTURE.md). */
function limiteDebit(max: number, fenetreMs: number): MiddlewareHandler {
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

const ORIGINES = (process.env.BEILE_ORIGINES_AUTORISEES ?? "http://localhost:3000").split(",").map((o) => o.trim());
const NATIONAL: Perimetre = { niveau: "national" };

export const app = new Hono().basePath("/api/v1");

app.use("*", secureHeaders({ crossOriginResourcePolicy: "same-site", xFrameOptions: "DENY" }));
app.use("*", cors({ origin: ORIGINES, allowMethods: ["GET", "POST"], maxAge: 600 }));
app.use("*", bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json({ erreur: "Requête trop volumineuse" }, 413) }));
app.use("*", limiteDebit(120, 60_000));

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ erreur: err.message }, err.status);
  console.error(err);
  // Aucune trace technique renvoyée au client.
  return c.json({ erreur: "Erreur interne" }, 500);
});
app.notFound((c) => c.json({ erreur: "Ressource introuvable" }, 404));

/** Validation zod du corps JSON : aucune donnée non conforme n'entre. */
async function corps<T>(c: { req: { json: () => Promise<unknown> } }, schema: z.ZodType<T>): Promise<T> {
  const brut = await c.req.json().catch(() => {
    throw new HTTPException(400, { message: "Corps JSON invalide" });
  });
  const r = schema.safeParse(brut);
  if (!r.success) throw new HTTPException(422, { message: `Requête non conforme au contrat : ${r.error.issues.map((i) => `${i.path.join(".") || "corps"} ${i.message}`).join(" ; ")}` });
  return r.data;
}

app.get("/sante", (c) => c.json({ statut: "ok", service: "beile-api", version: "0.1.0", horodatage: new Date().toISOString() }));

/* ---------------------------------------------------------------- Référentiels */

app.get("/referentiels/departements", (c) => c.json(DEPARTEMENTS));
app.get("/referentiels/communes", (c) => c.json(COMMUNES.map(({ cx: _cx, cy: _cy, ...commune }) => commune)));

/* ---------------------------------------------------------------- Couche sémantique */

app.get("/dictionnaire", (c) => c.json(Object.values(DICTIONNAIRE)));
app.get("/dictionnaire/:code", (c) => {
  const d = DICTIONNAIRE[c.req.param("code") as keyof typeof DICTIONNAIRE];
  if (!d) throw new HTTPException(404, { message: "Indicateur non défini au dictionnaire national" });
  return c.json(d);
});

/** Calcul d'un indicateur à partir d'une requête structurée (même contrat que l'interface). */
app.post("/indicateurs", async (c) => {
  const requete = await corps(c, RequeteSemantique);
  return c.json(calculer(getCouches(), requete, NATIONAL));
});

/** Ask Education : traduction contrôlée, jamais de chiffre généré, refus motivés. */
app.post("/ask", limiteDebit(20, 60_000), async (c) => {
  const { question } = await corps(c, z.object({ question: z.string().trim().min(3).max(400) }).strict());
  return c.json(repondre(getCouches(), question, NATIONAL));
});

app.get("/priorites", (c) => c.json(Object.fromEntries(priorites(getCouches()))));

/* ---------------------------------------------------------------- Vérification publique */

/** Service public : aucune authentification, réponse minimale (pas de note, pas de date de naissance). */
app.get("/certificats/:id/verification", limiteDebit(30, 60_000), (c) => {
  const id = c.req.param("id");
  if (!/^CERT-[A-Z]+-\d{4}-\d{6}$/.test(id)) throw new HTTPException(400, { message: "Identifiant de diplôme mal formé" });
  const presente = (c.req.query("e") ?? "").toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 64);
  const monde = getMonde();
  const cert = monde.certificats.find((x) => x.id === id);
  const titulaire = cert && monde.apprenants.find((a) => a.id === cert.apprenantId);
  let r: ResultatVerification;
  if (!cert || !titulaire) r = { statut: "introuvable", explication: "Aucun diplôme ne porte cet identifiant." };
  else if (cert.revoque) r = { statut: "revoque", certificatId: id, explication: "Diplôme révoqué par l'autorité de certification." };
  else if (presente && !empreinteCertificat(cert, `${titulaire.prenoms} ${titulaire.nom}`).startsWith(presente)) r = { statut: "altere", certificatId: id, explication: "Le document présenté ne correspond pas au diplôme délivré." };
  else r = { statut: "authentique", certificatId: id, titulaire: `${titulaire.prenoms} ${titulaire.nom}`, examen: cert.examen, session: cert.session, mention: cert.mention, delivreLe: cert.delivreLe };
  return c.json(r);
});
