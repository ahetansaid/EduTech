import { randomUUID } from "node:crypto";
import { authentifie, base, cleUtilisateur, corps, journaliser, limiteDebit, type Variables } from "./commun";
import { parcours } from "./parcours";
import { classesCourantes, dejaSaisi, ID_SAISIE, inscrireAuRegistre } from "./ecriture";
import { auth } from "./auth";
import { perimetrePilotage, pilotage } from "./pilotage";
import { etablissement } from "./etablissement";
import { enseignant } from "./enseignant";
import { plateforme } from "./plateforme";
import { complementsPilotage } from "./complements-pilotage";
import { complementsEtablissement } from "./complements-etablissement";
import { complementsEnseignant } from "./complements-enseignant";
import { complementsFamille } from "./complements-famille";
import { complementsGouvernance } from "./complements-gouvernance";
import { administration } from "./administration";
import type { Perimetre, Profil, ResultatVerification } from "@beile/contracts";
import { RequeteSemantique } from "@beile/contracts";
import { schema } from "@beile/db";
import { decider } from "@beile/simulation/abac";
import { repondre } from "@beile/simulation/ask";
import { empreinteCertificat } from "@beile/simulation/micro";
import { indexer, notesApprenant, situationApprenant } from "@beile/simulation/projections";
import { calculer, DICTIONNAIRE, priorites } from "@beile/simulation/semantique";
import { COMMUNES, DEPARTEMENTS } from "@beile/simulation/territoire";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import { chargerCouches, contexteApprenant, enEvenement, memo } from "./donnees";
import { lireEnv } from "./env";

/**
 * API BEILE v1 — source de vérité : PostgreSQL (Neon), connexion par le rôle restreint beile_api.
 * Les décisions d'accès aux données individuelles sont prises ICI, côté serveur, et journalisées dans
 * audit.journal (accordées comme refusées). Le navigateur n'est plus une frontière de sécurité.
 */

export const app = new Hono<{ Variables: Variables }>().basePath("/api/v1");

app.use("*", secureHeaders({ crossOriginResourcePolicy: "same-site", xFrameOptions: "DENY" }));
app.use("*", cors({ origin: (origine) => (lireEnv().ORIGINES.includes(origine) ? origine : null), allowMethods: ["GET", "POST"], allowHeaders: ["Content-Type", "X-CSRF-Token"], credentials: true, maxAge: 600 }));
app.use("*", bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json({ erreur: "Requête trop volumineuse" }, 413) }));
// Deux plafonds : par IP (large — un établissement entier peut partager une IP publique) et par utilisateur.
app.use("*", limiteDebit(1500, 60_000));
app.use("*", limiteDebit(300, 60_000, cleUtilisateur));

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ erreur: err.message }, err.status);
  // Doublon de saisie détecté par l'index d'idempotence (deux rejeux simultanés) : déjà enregistré.
  if ((err as { code?: string; cause?: { code?: string } }).code === "23505" || (err as { cause?: { code?: string } }).cause?.code === "23505") return c.json({ erreur: "Saisie déjà enregistrée", deja: true }, 409);
  // Paramètre d'URL ou de requête invalide (validation zod) : erreur du client, jamais un 500.
  if (err instanceof z.ZodError) return c.json({ erreur: "Paramètre invalide", champs: err.issues.map((i) => i.path.join(".") || "valeur") }, 422);
  // Journal minimal : jamais la requête SQL ni ses paramètres (identifiants d'élèves) dans les journaux de l'hébergeur.
  const cause = (err as { cause?: { code?: string; message?: string } }).cause;
  console.error(JSON.stringify({
    niveau: "erreur", methode: c.req.method, route: c.req.routePath, chemin: new URL(c.req.url).pathname.replace(/APP-\d{6}/g, "APP-…"),
    type: err.name, code: cause?.code ?? (err as { code?: string }).code ?? null,
    // Première ligne seulement : le message des requêtes échouées contient ensuite le SQL et ses paramètres.
    message: (cause?.message ?? err.message).split(/\r?\n/)[0]!.slice(0, 200),
  }));
  return c.json({ erreur: "Erreur interne" }, 500);
});
app.notFound((c) => c.json({ erreur: "Ressource introuvable" }, 404));

/* ================================================================== Authentification (sessions) */

app.route("/", auth);

app.get("/moi", authentifie, (c) => c.json(c.get("profil")));

/* ================================================================== Public */

app.get("/sante", async (c) => {
  const [r] = await base().select({ n: schema.departements.id }).from(schema.departements).limit(1);
  return c.json({ statut: "ok", service: "beile-api", version: "0.3.0", base: r ? "connectée" : "vide", horodatage: new Date().toISOString() });
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
  const [cert] = await base().select().from(schema.certificats).where(eq(schema.certificats.id, id));
  const [titulaire] = cert ? await base().select().from(schema.apprenants).where(eq(schema.apprenants.id, cert.apprenantId)) : [];
  let r: ResultatVerification;
  if (!cert || !titulaire) r = { statut: "introuvable", explication: "Aucun diplôme ne porte cet identifiant." };
  else if (cert.revoque) r = { statut: "revoque", certificatId: id, explication: "Diplôme révoqué par l'autorité de certification." };
  else if (presente && !empreinteCertificat(cert, `${titulaire.prenoms} ${titulaire.nom}`).startsWith(presente)) r = { statut: "altere", certificatId: id, explication: "Le document présenté ne correspond pas au diplôme délivré." };
  else r = { statut: "authentique", certificatId: id, titulaire: `${titulaire.prenoms} ${titulaire.nom}`, examen: cert.examen, session: cert.session, mention: cert.mention, delivreLe: cert.delivreLe };
  // Chaque vérification publique est tracée (sans donnée sur le demandeur) : volume et tentatives de fraude.
  await journaliser({ id: "public", nomAffiche: "Vérification publique" }, "Vérification de diplôme", `${id} · ${r.statut}`, "controle", true, null);
  return c.json(r);
});

/* ================================================================== Pilotage (agrégats sous périmètre) */


app.post("/indicateurs", authentifie, async (c) => {
  const requete = await corps(c, RequeteSemantique);
  const profil = c.get("profil");
  const perimetre = perimetrePilotage(profil);
  const couches = await chargerCouches(base());
  const resultat = memo(couches, `indicateur:${JSON.stringify(perimetre)}:${JSON.stringify(requete)}`, () => calculer(couches, requete, perimetre));
  await journaliser(profil, "Calcul d'indicateur", resultat.definition.nom, "statistique", true, null);
  return c.json(resultat);
});

app.post("/ask", authentifie, limiteDebit(20, 60_000, cleUtilisateur), async (c) => {
  const { question } = await corps(c, z.object({ question: z.string().trim().min(3).max(400) }).strict());
  const profil = c.get("profil");
  const reponse = repondre(await chargerCouches(base()), question, perimetrePilotage(profil));
  if (reponse.statut === "refuse" && (reponse.motif === "hors_perimetre" || reponse.motif === "donnee_individuelle")) {
    await journaliser(profil, "Ask Education — requête refusée", question, "statistique", false, reponse.motif === "hors_perimetre" ? "perimetre" : "relation");
  } else if (reponse.statut === "repondu") {
    await journaliser(profil, "Ask Education — requête agrégée", reponse.resultat.definition.nom, "statistique", true, null);
  }
  return c.json(reponse);
});

app.get("/priorites", authentifie, async (c) => {
  perimetrePilotage(c.get("profil"));
  const couches = await chargerCouches(base());
  return c.json(memo(couches, "priorites:json", () => Object.fromEntries(priorites(couches))));
});

/* ================================================================== Données individuelles (ABAC serveur) */

const FINALITES = ["consultation_personnelle", "suivi_familial", "evaluation", "gestion", "controle", "statistique", "audit"] as const;

/** Dossier d'un apprenant : décision rôle + périmètre + relation + finalité, prise ici et journalisée. */
app.get("/apprenants/:id", authentifie, async (c) => {
  const profil = c.get("profil");
  const apprenantId = c.req.param("id");
  if (!/^APP-\d{6}$/.test(apprenantId)) throw new HTTPException(400, { message: "Identifiant d'apprenant mal formé" });
  const finalite = z.enum(FINALITES).catch("gestion").parse(c.req.query("finalite"));
  const ctx = await contexteApprenant(base(), apprenantId, profil);
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
    idSaisie: ID_SAISIE,
  }).strict());
  const [enseignant] = profil.npi ? await base().select().from(schema.enseignants).where(eq(schema.enseignants.npi, profil.npi)) : [];
  const [relation] = enseignant ? await base().select().from(schema.enseignements).where(and(eq(schema.enseignements.enseignantId, enseignant.id), eq(schema.enseignements.classeId, saisie.classeId))).limit(1) : [];
  if (!profil.habilitations.some((h) => h.role === "enseignant") || !enseignant || !relation) {
    await journaliser(profil, "Saisie d'absences", saisie.classeId, "evaluation", false, !enseignant ? "role" : "relation");
    throw new HTTPException(403, { message: "Aucune relation pédagogique avec cette classe : saisie refusée et journalisée" });
  }
  // Les apprenants doivent appartenir à la classe (projection de lecture indexée).
  const courantes = await classesCourantes(saisie.apprenantIds);
  const horsClasse = saisie.apprenantIds.filter((id) => courantes.get(id) !== saisie.classeId);
  if (horsClasse.length) throw new HTTPException(422, { message: `Apprenants hors de la classe : ${horsClasse.join(", ")}` });
  const [classe] = await base().select().from(schema.classes).where(eq(schema.classes.id, saisie.classeId));
  const deja = await dejaSaisi(saisie.idSaisie, "ABSENCE");
  if (deja) return c.json({ enregistres: deja, deja: true }, 200);
  const enregistres = await inscrireAuRegistre(saisie.apprenantIds.map((apprenantId) => ({
    type: "ABSENCE", auteurId: enseignant.id, etablissementId: classe!.etablissementId, apprenantId,
    donnees: { apprenantId, classeId: saisie.classeId, date: saisie.date, justifiee: false, anneeScolaire: classe!.anneeScolaire, ...(saisie.idSaisie ? { idSaisie: saisie.idSaisie } : {}) },
  })));
  await journaliser(profil, "Saisie d'absences", `${saisie.classeId} (${enregistres.length})`, "evaluation", true, null);
  return c.json({ enregistres }, 201);
});

/** Absences d'un établissement : chef d'établissement (son établissement) ou inspecteur (sa circonscription). */
app.get("/etablissements/:id/absences", authentifie, async (c) => {
  const profil = c.get("profil");
  const etablissementId = c.req.param("id");
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(c.req.query("date") ?? new Date().toISOString().slice(0, 10));
  const [etab] = await base().select({ id: schema.etablissements.id, circonscription: schema.etablissements.circonscription }).from(schema.etablissements).where(eq(schema.etablissements.id, etablissementId));
  if (!etab) throw new HTTPException(404, { message: "Établissement inconnu" });
  const autorise = profil.habilitations.some((h) =>
    (h.role === "chef_etablissement" && h.perimetre.niveau === "etablissement" && h.perimetre.etablissementId === etablissementId) ||
    (h.role === "inspecteur" && h.perimetre.niveau === "circonscription" && h.perimetre.circonscription === etab.circonscription));
  await journaliser(profil, "Consultation des absences", etablissementId, "gestion", autorise, autorise ? null : "perimetre");
  if (!autorise) throw new HTTPException(403, { message: "Établissement hors de votre périmètre : refus journalisé" });
  // Filtre sur la date déclarée de l'appel (et non sur l'heure d'enregistrement, qui peut suivre une synchronisation).
  const lignes = await base().select().from(schema.evenements).where(and(eq(schema.evenements.etablissementId, etablissementId), eq(schema.evenements.type, "ABSENCE"), sql`${schema.evenements.donnees}->>'date' = ${date}`)).orderBy(desc(schema.evenements.enregistreLe));
  return c.json(lignes.map(enEvenement));
});

/** Journal d'audit : réservé au délégué à la protection des données. */
app.get("/audit", authentifie, async (c) => {
  const profil = c.get("profil");
  const autorise = profil.habilitations.some((h) => h.role === "dpo");
  await journaliser(profil, "Consultation du journal d'audit", "audit.journal", "audit", autorise, autorise ? null : "role");
  if (!autorise) throw new HTTPException(403, { message: "Journal réservé au délégué à la protection des données" });
  const limite = z.coerce.number().int().min(1).max(500).catch(100).parse(c.req.query("limite"));
  return c.json(await base().select().from(schema.journal).orderBy(desc(schema.journal.horodatage)).limit(limite));
});


/* ================================================================== Parcours : famille, apprenant, notes, inscription */

app.route("/", parcours);
app.route("/", pilotage);
app.route("/", etablissement);
app.route("/", enseignant);
app.route("/", plateforme);
app.route("/", complementsPilotage);
app.route("/", complementsEtablissement);
app.route("/", complementsEnseignant);
app.route("/", complementsFamille);
app.route("/", complementsGouvernance);
app.route("/", administration);
