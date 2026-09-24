import { randomUUID } from "node:crypto";
import type { Finalite, Perimetre, Profil, ResultatVerification } from "@beile/contracts";
import { RequeteSemantique } from "@beile/contracts";
import { connecter, schema } from "@beile/db";
import { decider } from "@beile/simulation/abac";
import { repondre } from "@beile/simulation/ask";
import { empreinteCertificat } from "@beile/simulation/micro";
import { indexer, notesApprenant, situationApprenant } from "@beile/simulation/projections";
import { calculer, DICTIONNAIRE, priorites } from "@beile/simulation/semantique";
import { COMMUNES, DEPARTEMENTS } from "@beile/simulation/territoire";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { sign, verify } from "hono/jwt";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import { chargerCouches, contexteApprenant, enEvenement, profilParId } from "./donnees";
import { env } from "./env";

/**
 * API BEILE v1 — source de vérité : PostgreSQL (Neon), connexion par le rôle restreint beile_api.
 * Les décisions d'accès aux données individuelles sont prises ICI, côté serveur, et journalisées dans
 * audit.journal (accordées comme refusées). Le navigateur n'est plus une frontière de sécurité.
 */

const { db } = connecter(env.DATABASE_URL_API);
type Variables = { profil: Profil };

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

export const app = new Hono<{ Variables: Variables }>().basePath("/api/v1");

app.use("*", secureHeaders({ crossOriginResourcePolicy: "same-site", xFrameOptions: "DENY" }));
app.use("*", cors({ origin: env.ORIGINES, allowMethods: ["GET", "POST"], allowHeaders: ["Content-Type", "Authorization"], maxAge: 600 }));
app.use("*", bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json({ erreur: "Requête trop volumineuse" }, 413) }));
app.use("*", limiteDebit(240, 60_000));

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ erreur: err.message }, err.status);
  console.error(err);
  return c.json({ erreur: "Erreur interne" }, 500);
});
app.notFound((c) => c.json({ erreur: "Ressource introuvable" }, 404));

async function corps<T>(c: Context, schemaZod: z.ZodType<T>): Promise<T> {
  const brut = await c.req.json().catch(() => {
    throw new HTTPException(400, { message: "Corps JSON invalide" });
  });
  const r = schemaZod.safeParse(brut);
  if (!r.success) throw new HTTPException(422, { message: `Requête non conforme au contrat : ${r.error.issues.map((i) => `${i.path.join(".") || "corps"} ${i.message}`).join(" ; ")}` });
  return r.data;
}

/* ================================================================== Authentification */

/**
 * Jeton de session signé (HS256, 2 h). En démonstration, il est délivré pour un profil fictif ;
 * en production, il est remplacé par l'OIDC fédéré à l'identité nationale (docs/SECURITE.md).
 */
const authentifie: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  const entete = c.req.header("authorization") ?? "";
  const jeton = entete.startsWith("Bearer ") ? entete.slice(7) : "";
  if (!jeton) throw new HTTPException(401, { message: "Authentification requise" });
  let charge: Record<string, unknown>;
  try { charge = (await verify(jeton, env.JWT_SECRET, "HS256")) as Record<string, unknown>; }
  catch { throw new HTTPException(401, { message: "Jeton invalide ou expiré" }); }
  const profil = typeof charge.sub === "string" ? await profilParId(db, charge.sub) : null;
  if (!profil) throw new HTTPException(401, { message: "Profil inconnu" });
  c.set("profil", profil);
  await next();
};

async function journaliser(profil: Profil, action: string, ressource: string, finalite: Finalite, autorise: boolean, critereManquant: string | null) {
  await db.insert(schema.journal).values({ id: `AUD-${randomUUID()}`, profilId: profil.id, profilNom: profil.nomAffiche, action, ressource: ressource.slice(0, 200), finalite, autorise, critereManquant });
}

if (env.MODE_DEMO) {
  app.post("/auth/demo", limiteDebit(30, 60_000), async (c) => {
    const { profilId } = await corps(c, z.object({ profilId: z.string().regex(/^p-[a-z]+$/) }).strict());
    const profil = await profilParId(db, profilId);
    if (!profil) throw new HTTPException(404, { message: "Profil de démonstration inconnu" });
    const expire = Math.floor(Date.now() / 1000) + 2 * 3600;
    const jeton = await sign({ sub: profil.id, exp: expire, iat: Math.floor(Date.now() / 1000) }, env.JWT_SECRET, "HS256");
    return c.json({ jeton, expire, profil });
  });
}

app.get("/moi", authentifie, (c) => c.json(c.get("profil")));

/* ================================================================== Public */

app.get("/sante", async (c) => {
  const [r] = await db.select({ n: schema.departements.id }).from(schema.departements).limit(1);
  return c.json({ statut: "ok", service: "beile-api", version: "0.2.0", base: r ? "connectée" : "vide", horodatage: new Date().toISOString() });
});

app.get("/referentiels/departements", (c) => c.json(DEPARTEMENTS));
app.get("/referentiels/communes", (c) => c.json(COMMUNES.map(({ cx: _cx, cy: _cy, ...commune }) => commune)));
app.get("/dictionnaire", (c) => c.json(Object.values(DICTIONNAIRE)));
app.get("/dictionnaire/:code", (c) => {
  const d = DICTIONNAIRE[c.req.param("code") as keyof typeof DICTIONNAIRE];
  if (!d) throw new HTTPException(404, { message: "Indicateur non défini au dictionnaire national" });
  return c.json(d);
});

/** Service public de vérification : aucune authentification, réponse minimale. */
app.get("/certificats/:id/verification", limiteDebit(30, 60_000), async (c) => {
  const id = c.req.param("id");
  if (!/^CERT-[A-Z]+-\d{4}-\d{6}$/.test(id)) throw new HTTPException(400, { message: "Identifiant de diplôme mal formé" });
  const presente = (c.req.query("e") ?? "").toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 64);
  const [cert] = await db.select().from(schema.certificats).where(eq(schema.certificats.id, id));
  const [titulaire] = cert ? await db.select().from(schema.apprenants).where(eq(schema.apprenants.id, cert.apprenantId)) : [];
  let r: ResultatVerification;
  if (!cert || !titulaire) r = { statut: "introuvable", explication: "Aucun diplôme ne porte cet identifiant." };
  else if (cert.revoque) r = { statut: "revoque", certificatId: id, explication: "Diplôme révoqué par l'autorité de certification." };
  else if (presente && !empreinteCertificat(cert, `${titulaire.prenoms} ${titulaire.nom}`).startsWith(presente)) r = { statut: "altere", certificatId: id, explication: "Le document présenté ne correspond pas au diplôme délivré." };
  else r = { statut: "authentique", certificatId: id, titulaire: `${titulaire.prenoms} ${titulaire.nom}`, examen: cert.examen, session: cert.session, mention: cert.mention, delivreLe: cert.delivreLe };
  return c.json(r);
});

/* ================================================================== Pilotage (agrégats sous périmètre) */

function perimetrePilotage(profil: Profil): Perimetre {
  const h = profil.habilitations.find((x) => ["administration_centrale", "direction_departementale", "inspecteur", "chercheur"].includes(x.role));
  if (!h) throw new HTTPException(403, { message: "Aucune habilitation de pilotage" });
  return h.perimetre;
}

app.post("/indicateurs", authentifie, async (c) => {
  const requete = await corps(c, RequeteSemantique);
  const profil = c.get("profil");
  const perimetre = perimetrePilotage(profil);
  const resultat = calculer(await chargerCouches(db), requete, perimetre);
  await journaliser(profil, "Calcul d'indicateur", resultat.definition.nom, "statistique", true, null);
  return c.json(resultat);
});

app.post("/ask", authentifie, limiteDebit(20, 60_000), async (c) => {
  const { question } = await corps(c, z.object({ question: z.string().trim().min(3).max(400) }).strict());
  const profil = c.get("profil");
  const reponse = repondre(await chargerCouches(db), question, perimetrePilotage(profil));
  if (reponse.statut === "refuse" && (reponse.motif === "hors_perimetre" || reponse.motif === "donnee_individuelle")) {
    await journaliser(profil, "Ask Education — requête refusée", question, "statistique", false, reponse.motif === "hors_perimetre" ? "perimetre" : "relation");
  } else if (reponse.statut === "repondu") {
    await journaliser(profil, "Ask Education — requête agrégée", reponse.resultat.definition.nom, "statistique", true, null);
  }
  return c.json(reponse);
});

app.get("/priorites", authentifie, async (c) => {
  perimetrePilotage(c.get("profil"));
  return c.json(Object.fromEntries(priorites(await chargerCouches(db))));
});

/* ================================================================== Données individuelles (ABAC serveur) */

const FINALITES = ["consultation_personnelle", "suivi_familial", "evaluation", "gestion", "controle", "statistique", "audit"] as const;

/** Dossier d'un apprenant : décision rôle + périmètre + relation + finalité, prise ici et journalisée. */
app.get("/apprenants/:id", authentifie, async (c) => {
  const profil = c.get("profil");
  const apprenantId = c.req.param("id");
  if (!/^APP-\d{6}$/.test(apprenantId)) throw new HTTPException(400, { message: "Identifiant d'apprenant mal formé" });
  const finalite = z.enum(FINALITES).catch("gestion").parse(c.req.query("finalite"));
  const ctx = await contexteApprenant(db, apprenantId, profil);
  const decision = decider(profil, { ressource: { type: "dossier_apprenant", apprenantId }, finalite }, { monde: ctx.monde, evenements: ctx.evenements });
  await journaliser(profil, "Ouverture d'un dossier apprenant", apprenantId, finalite, decision.autorise, decision.criteres.find((x) => !x.satisfait)?.critere ?? null);
  if (!decision.autorise || !ctx.apprenant) return c.json({ decision }, 403);

  const situation = situationApprenant(ctx.monde, ctx.evenements, apprenantId);
  const parMatiere = new Map<string, number[]>();
  for (const n of notesApprenant(ctx.evenements, apprenantId)) if (n.trimestre === 2) parMatiere.set(n.matiere, [...(parMatiere.get(n.matiere) ?? []), n.note]);
  return c.json({
    decision,
    apprenant: { id: ctx.apprenant.id, nom: ctx.apprenant.nom, prenoms: ctx.apprenant.prenoms, dateNaissance: ctx.apprenant.dateNaissance, statutIdentite: ctx.apprenant.statutIdentite },
    situation: { classe: situation.classe?.libelle ?? null, etablissementId: situation.etablissementId, statut: situation.statut },
    moyennesTrimestre2: [...parMatiere].map(([matiere, notes]) => ({ matiere, moyenne: notes.reduce((s, x) => s + x, 0) / notes.length })),
    parcours: ctx.evenements.filter((e) => e.type !== "EVALUATION").map((e) => ({ id: e.id, type: e.type, survenuLe: e.survenuLe, source: e.source })),
  });
});

/** Appel : seul un enseignant ayant une relation pédagogique avec la classe peut enregistrer des absences. */
app.post("/evenements/absences", authentifie, async (c) => {
  const profil = c.get("profil");
  const saisie = await corps(c, z.object({
    classeId: z.string().regex(/^CLS-[A-Za-z0-9-]+$/),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    apprenantIds: z.array(z.string().regex(/^APP-\d{6}$/)).min(1).max(80),
  }).strict());
  const [enseignant] = profil.npi ? await db.select().from(schema.enseignants).where(eq(schema.enseignants.npi, profil.npi)) : [];
  const [relation] = enseignant ? await db.select().from(schema.enseignements).where(and(eq(schema.enseignements.enseignantId, enseignant.id), eq(schema.enseignements.classeId, saisie.classeId))).limit(1) : [];
  if (!profil.habilitations.some((h) => h.role === "enseignant") || !enseignant || !relation) {
    await journaliser(profil, "Saisie d'absences", saisie.classeId, "evaluation", false, !enseignant ? "role" : "relation");
    throw new HTTPException(403, { message: "Aucune relation pédagogique avec cette classe : saisie refusée et journalisée" });
  }
  // Les apprenants doivent appartenir à la classe à la date de saisie (reconstruit depuis le registre).
  const evts = (await db.select().from(schema.evenements).where(inArray(schema.evenements.apprenantId, saisie.apprenantIds))).map(enEvenement);
  const idx = indexer(evts);
  const horsClasse = saisie.apprenantIds.filter((id) => idx.classeCourante.get(id) !== saisie.classeId);
  if (horsClasse.length) throw new HTTPException(422, { message: `Apprenants hors de la classe : ${horsClasse.join(", ")}` });
  const [classe] = await db.select().from(schema.classes).where(eq(schema.classes.id, saisie.classeId));
  const lignes = saisie.apprenantIds.map((apprenantId) => ({
    id: `EVT-${randomUUID()}`, type: "ABSENCE", survenuLe: new Date(), auteurId: enseignant.id, source: "beile" as const,
    etablissementId: classe!.etablissementId, apprenantId, enseignantId: null,
    donnees: { apprenantId, classeId: saisie.classeId, date: saisie.date, justifiee: false, anneeScolaire: classe!.anneeScolaire },
  }));
  await db.insert(schema.evenements).values(lignes);
  await journaliser(profil, "Saisie d'absences", `${saisie.classeId} (${lignes.length})`, "evaluation", true, null);
  return c.json({ enregistres: lignes.map((l) => l.id) }, 201);
});

/** Absences d'un établissement : chef d'établissement (son établissement) ou inspecteur (sa circonscription). */
app.get("/etablissements/:id/absences", authentifie, async (c) => {
  const profil = c.get("profil");
  const etablissementId = c.req.param("id");
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(c.req.query("date") ?? new Date().toISOString().slice(0, 10));
  const [etab] = await db.select({ id: schema.etablissements.id, circonscription: schema.etablissements.circonscription }).from(schema.etablissements).where(eq(schema.etablissements.id, etablissementId));
  if (!etab) throw new HTTPException(404, { message: "Établissement inconnu" });
  const autorise = profil.habilitations.some((h) =>
    (h.role === "chef_etablissement" && h.perimetre.niveau === "etablissement" && h.perimetre.etablissementId === etablissementId) ||
    (h.role === "inspecteur" && h.perimetre.niveau === "circonscription" && h.perimetre.circonscription === etab.circonscription));
  await journaliser(profil, "Consultation des absences", etablissementId, "gestion", autorise, autorise ? null : "perimetre");
  if (!autorise) throw new HTTPException(403, { message: "Établissement hors de votre périmètre : refus journalisé" });
  const debut = new Date(`${date}T00:00:00Z`);
  const fin = new Date(debut.getTime() + 86_400_000);
  const lignes = await db.select().from(schema.evenements).where(and(eq(schema.evenements.etablissementId, etablissementId), eq(schema.evenements.type, "ABSENCE"), gte(schema.evenements.survenuLe, debut), lt(schema.evenements.survenuLe, fin)));
  return c.json(lignes.map(enEvenement));
});

/** Journal d'audit : réservé au délégué à la protection des données. */
app.get("/audit", authentifie, async (c) => {
  const profil = c.get("profil");
  const autorise = profil.habilitations.some((h) => h.role === "dpo");
  await journaliser(profil, "Consultation du journal d'audit", "audit.journal", "audit", autorise, autorise ? null : "role");
  if (!autorise) throw new HTTPException(403, { message: "Journal réservé au délégué à la protection des données" });
  const limite = z.coerce.number().int().min(1).max(500).catch(100).parse(c.req.query("limite"));
  return c.json(await db.select().from(schema.journal).orderBy(desc(schema.journal.horodatage)).limit(limite));
});

