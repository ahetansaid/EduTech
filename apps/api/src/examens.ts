import { randomUUID } from "node:crypto";
import type { Mention, ResultatExamenPublic } from "@beile/contracts";
import { ExamenNational } from "@beile/contracts";
import { schema } from "@beile/db";
import { aujourdhui } from "@beile/simulation/scolarite";
import { and, count, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authentifie, base, corps, journaliser, limiteDebit, refuser, type Variables } from "./commun";
import { inscrireAuRegistre } from "./ecriture";
import { scolarisesEtablissement } from "./lectures";

/**
 * Office national des examens et concours : la chaîne e-résultat, distincte de la délibération
 * d'établissement (moyenne annuelle provisoire → diplôme vérifiable). Ici vit le processus officiel :
 * ouvrir une session, rattacher des centres, constituer le candidaturé (un numéro de table par candidat),
 * enregistrer la délibération du jury, puis publier. Une fois publiée, la recherche publique par
 * numéro de table répond — et elle seule est ouverte à un tiers sans compte.
 */
export const examens = new Hono<{ Variables: Variables }>();

const EXAMEN = z.enum(["CEP", "BEPC", "BAC"]);
const NIVEAU_PAR_EXAMEN: Record<z.infer<typeof EXAMEN>, string> = { CEP: "CM2", BEPC: "3e", BAC: "Tle" };
/**
 * Les trois examens dont un candidat se désigne par son niveau de classe. Un examen national du
 * supérieur se tient sur des inscriptions en filière : `NIVEAU_PAR_EXAMEN` n'a rien à répondre pour lui,
 * et le dire plutôt que deviner un niveau est la seule issue honnête.
 */
const parNiveau = (e: string): e is z.infer<typeof EXAMEN> => EXAMEN.safeParse(e).success;
const ID_SESSION = z.string().regex(/^SES-[A-Za-z0-9-]+$/);
const ID_CENTRE = z.string().regex(/^CEN-[A-Za-z0-9-]+$/);
const ID_CERTIF = z.string().regex(/^CERT-[A-Z]+-\d{4}-\d{6}$/);
const anneeDe = (session: string) => session.match(/\d{4}/)?.[0] ?? aujourdhui().slice(0, 4);
/** Barème national de la mention : partagé avec la délibération du supérieur pour que les deux volets ne dérivent pas. */
export const mentionDe = (m: number): Mention => (m >= 16 ? "Très bien" : m >= 14 ? "Bien" : m >= 12 ? "Assez bien" : "Passable");
const NOM_COMPLET = sql<string>`${schema.apprenants.prenoms} || ' ' || ${schema.apprenants.nom}`;

/**
 * Le bureau des examens est une autorité centrale : ouvrir/fermer une session, publier, constituent
 * le candidaturé relèvent de l'administration centrale siégeant au niveau national. Refus journalisé.
 */
async function bureau(c: Context<{ Variables: Variables }>, action: string) {
  const profil = c.get("profil");
  const h = profil.habilitations.some((x) => x.role === "administration_centrale" && x.perimetre.niveau === "national");
  if (!h) {
    await journaliser(profil, action, "Bureau des examens nationaux", "gestion", false, "role");
    refuser("Bureau des examens nationaux : accès réservé à l'administration centrale.");
  }
  return profil;
}

const sessionOuverte = async (id: string) => {
  const [s] = await base().select().from(schema.examensSessions).where(eq(schema.examensSessions.id, id));
  if (!s) throw new HTTPException(404, { message: "Session d'examen introuvable" });
  return s;
};

/* ------------------------------------------------------------------ Sessions */

/**
 * Ouvrir une session officielle (examen + session). Idempotente : (examen, session) unique.
 * Tout examen national du domaine s'y déclare — y compris ceux de l'EFTP et du supérieur, dont la
 * licence certifiée par la DEC — mais le candidaturé par niveau de classe reste K-12 (voir plus bas).
 */
examens.post("/examens/sessions", authentifie, async (c) => {
  const profil = await bureau(c, "Ouverture d'une session d'examen");
  const { examen, session, arretCandidatures } = await corps(c, z.object({
    examen: ExamenNational,
    session: z.string().trim().min(3).max(40),
    arretCandidatures: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }).strict());
  const id = `SES-${randomUUID()}`;
  await base().insert(schema.examensSessions).values({ id, examen, session, arretCandidatures: arretCandidatures ?? null });
  await journaliser(profil, "Ouverture d'une session d'examen", `${examen} ${session}`, "gestion", true, null);
  return c.json({ id, examen, session, statut: "ouverte" as const }, 201);
});

examens.get("/examens/sessions", authentifie, async (c) => {
  const profil = await bureau(c, "Consultation des sessions d'examen");
  const lignes = await base().select().from(schema.examensSessions).orderBy(schema.examensSessions.examen, schema.examensSessions.session);
  await journaliser(profil, "Consultation des sessions d'examen", `${lignes.length} session(s)`, "gestion", true, null);
  return c.json(lignes);
});

/* ------------------------------------------------------------------ Centres */

examens.post("/examens/centres", authentifie, async (c) => {
  const profil = await bureau(c, "Ouverture d'un centre d'examen");
  const { nom, communeId, capacite } = await corps(c, z.object({
    nom: z.string().trim().min(3).max(120),
    communeId: z.string().trim().min(1).max(40),
    capacite: z.coerce.number().int().min(0).max(5000).default(0),
  }).strict());
  const [commune] = await base().select({ id: schema.communes.id }).from(schema.communes).where(eq(schema.communes.id, communeId));
  if (!commune) throw new HTTPException(422, { message: "Commune inconnue du référentiel territorial" });
  const id = `CEN-${randomUUID()}`;
  await base().insert(schema.examensCentres).values({ id, nom, communeId, capacite });
  await journaliser(profil, "Ouverture d'un centre d'examen", `${nom} (${communeId})`, "gestion", true, null);
  return c.json({ id, nom, communeId, capacite }, 201);
});

examens.get("/examens/centres", authentifie, async (c) => {
  const profil = await bureau(c, "Consultation des centres d'examen");
  const lignes = await base().select().from(schema.examensCentres).orderBy(schema.examensCentres.nom);
  await journaliser(profil, "Consultation des centres d'examen", `${lignes.length} centre(s)`, "gestion", true, null);
  return c.json(lignes);
});

/* ------------------------------------------------------------------ Candidaturé (numéro de table) */

/**
 * Constituer le candidaturé d'un établissement pour une session : les scolarisés du niveau requis
 * reçoivent un numéro de table séquentiel, propre à la session. Les déjà inscrits sont ignorés
 * (contrainte d'unicité session+candidat). Avant publication seulement.
 */
examens.post("/examens/sessions/:id/candidatures", authentifie, async (c) => {
  const id = ID_SESSION.parse(c.req.param("id"));
  const profil = await bureau(c, "Constitution du candidaturé");
  const session = await sessionOuverte(id);
  if (session.statut === "publiee") throw new HTTPException(409, { message: "Session publiée : le candidaturé est clos." });
  const { etablissementId, centreId } = await corps(c, z.object({
    etablissementId: z.string().regex(/^ETB-[A-Z0-9-]+$/),
    centreId: ID_CENTRE,
  }).strict());
  const [centre] = await base().select({ id: schema.examensCentres.id }).from(schema.examensCentres).where(eq(schema.examensCentres.id, centreId));
  if (!centre) throw new HTTPException(422, { message: "Centre d'examen inconnu" });
  if (!parNiveau(session.examen)) {
    await journaliser(profil, "Constitution du candidaturé d'un examen supérieur", `${id} · ${session.examen}`, "gestion", false, "perimetre");
    throw new HTTPException(422, { message: `Session « ${session.examen} » : le candidaturé d'un examen national du supérieur se constitue par inscriptions en filière, pas par niveau de classe. La porte est celle du registre du supérieur.` });
  }
  const niveau = NIVEAU_PAR_EXAMEN[session.examen];
  const candidats = (await scolarisesEtablissement(etablissementId)).filter((e) => e.niveau === niveau);
  if (!candidats.length) throw new HTTPException(422, { message: `Aucun scolarisé au niveau ${niveau} pour le ${session.examen}` });
  const dejaInscrits = await base().select({ apprenantId: schema.examensCandidatures.apprenantId, numeroTable: schema.examensCandidatures.numeroTable })
    .from(schema.examensCandidatures).where(eq(schema.examensCandidatures.sessionId, id));
  const dansSession = new Set(dejaInscrits.map((x) => x.apprenantId));
  const annee = anneeDe(session.session);
  // Suite du numérotage : on reprend au plus haut rang déjà attribué dans la session.
  let rang = dejaInscrits.reduce((m, x) => Math.max(m, Number(x.numeroTable.slice(annee.length)) || 0), 0);
  const nouveaux = candidats.filter((e) => !dansSession.has(e.id));
  const valeurs = nouveaux.map((e) => {
    rang += 1;
    return { id: `CAN-${randomUUID()}`, sessionId: id, apprenantId: e.id, centreId, numeroTable: `${annee}${String(rang).padStart(6, "0")}` };
  });
  if (valeurs.length) await base().insert(schema.examensCandidatures).values(valeurs);
  await journaliser(profil, "Constitution du candidaturé", `${session.examen} ${session.session} · ${etablissementId} · ${valeurs.length} inscrit(s)`, "gestion", true, null);
  return c.json({ sessionId: id, ajoutes: valeurs.length, ignores: candidats.length - nouveaux.length }, 201);
});

/** Candidaturé d'une session (avec nom du candidat et centre) — lecture du bureau. */
examens.get("/examens/sessions/:id/candidatures", authentifie, async (c) => {
  const id = ID_SESSION.parse(c.req.param("id"));
  const profil = await bureau(c, "Consultation du candidaturé");
  await sessionOuverte(id);
  const lignes = await base()
    .select({
      numeroTable: schema.examensCandidatures.numeroTable, apprenantId: schema.examensCandidatures.apprenantId,
      titulaire: NOM_COMPLET, centre: schema.examensCentres.nom, decision: schema.examensCandidatures.decision,
      moyenne: schema.examensCandidatures.moyenne, mention: schema.examensCandidatures.mention,
    })
    .from(schema.examensCandidatures)
    .innerJoin(schema.apprenants, eq(schema.apprenants.id, schema.examensCandidatures.apprenantId))
    .innerJoin(schema.examensCentres, eq(schema.examensCentres.id, schema.examensCandidatures.centreId))
    .where(eq(schema.examensCandidatures.sessionId, id))
    .orderBy(schema.examensCandidatures.numeroTable);
  await journaliser(profil, "Consultation du candidaturé", `${id} · ${lignes.length} candidat(s)`, "gestion", true, null);
  return c.json(lignes);
});

/* ------------------------------------------------------------------ Délibération puis publication */

/**
 * Délibération du jury : la moyenne d'épreuve (reportée depuis le PV officiel, non la moyenne annuelle)
 * décide du sort de chaque candidat. On ne publie pas une décision inventée : seul un candidat dont le
 * jury a reporté la note reçoit un verdict. La session bascule en « deliberation ».
 */
examens.post("/examens/sessions/:id/deliberation", authentifie, async (c) => {
  const id = ID_SESSION.parse(c.req.param("id"));
  const profil = await bureau(c, "Délibération d'une session d'examen");
  const session = await sessionOuverte(id);
  if (session.statut === "publiee") throw new HTTPException(409, { message: "Session déjà publiée : verdicts figés." });
  const { decisions } = await corps(c, z.object({
    // Par lots de 5 000 verdicts au plus (≈ 250 Ko, voir la limite de corps propre à cette route).
    decisions: z.array(z.object({ numeroTable: z.string().trim().min(1).max(20), moyenne: z.coerce.number().min(0).max(20) }).strict()).min(1).max(5000),
  }).strict());
  const tables = decisions.map((d) => d.numeroTable);
  const connues = await base().select({ id: schema.examensCandidatures.id, numeroTable: schema.examensCandidatures.numeroTable })
    .from(schema.examensCandidatures).where(and(eq(schema.examensCandidatures.sessionId, id), inArray(schema.examensCandidatures.numeroTable, tables)));
  const parTable = new Map(connues.map((x) => [x.numeroTable, x.id]));
  // Un seul UPDATE … FROM (VALUES …) dans une transaction : le lot passe entier ou pas du tout (jamais
  // une session à moitié délibérée), et en un aller-retour au lieu d'un par candidat.
  const verdicts = decisions.flatMap((d) => {
    const candidatureId = parTable.get(d.numeroTable);
    if (!candidatureId) return [];
    const moyenne = Math.round(d.moyenne * 100) / 100;
    const admis = moyenne >= 10;
    return [{ candidatureId, moyenne, decision: admis ? "admis" : "non_admis", mention: admis ? mentionDe(moyenne) : null }];
  });
  const maj = verdicts.length;
  if (maj) {
    await base().transaction(async (tx) => {
      const valeurs = sql.join(verdicts.map((v) => sql`(${v.candidatureId}, ${v.decision}, ${v.moyenne}::numeric, ${v.mention})`), sql`, `);
      await tx.execute(sql`
        update core.examens_candidatures as c set decision = v.decision, moyenne = v.moyenne, mention = v.mention
        from (values ${valeurs}) as v(id, decision, moyenne, mention)
        where c.id = v.id and c.session_id = ${id}`);
      await tx.update(schema.examensSessions).set({ statut: "deliberation" }).where(eq(schema.examensSessions.id, id));
    });
  }
  await journaliser(profil, "Délibération d'une session d'examen", `${session.examen} ${session.session} · ${maj} verdict(s) reporté(s)`, "gestion", true, null);
  return c.json({ sessionId: id, deliberes: maj, nonTrouves: decisions.length - maj });
});

/** Publication : rend les verdicts consultables par le public ; fige la session. */
examens.post("/examens/sessions/:id/publication", authentifie, async (c) => {
  const id = ID_SESSION.parse(c.req.param("id"));
  const profil = await bureau(c, "Publication des résultats d'examen");
  const session = await sessionOuverte(id);
  if (session.statut === "publiee") throw new HTTPException(409, { message: "Session déjà publiée." });
  const [{ n } = { n: 0 }] = await base().select({ n: count() }).from(schema.examensCandidatures)
    .where(and(eq(schema.examensCandidatures.sessionId, id), isNotNull(schema.examensCandidatures.decision)));
  if (n === 0) throw new HTTPException(422, { message: "Aucun verdict délibéré : rien à publier." });
  await base().update(schema.examensSessions).set({ statut: "publiee", publieeLe: aujourdhui() }).where(eq(schema.examensSessions.id, id));
  await journaliser(profil, "Publication des résultats d'examen", `${session.examen} ${session.session} · ${n} résultat(s)`, "gestion", true, null);
  return c.json({ sessionId: id, publie: true, resultats: n, publieeLe: aujourdhui() });
});

/* ------------------------------------------------------------------ Révocation de diplôme */

/**
 * Révocation d'un diplôme par l'autorité de certification (administration centrale, niveau national).
 * Le certificat n'est jamais effacé : l'acte est un fait REVOCATION_CERTIFICAT du registre et l'état
 * courant (core.certificats.revoque) s'en déduit. La vérification publique rend alors « révoqué ».
 */
examens.post("/certificats/:id/revocation", authentifie, async (c) => {
  const id = ID_CERTIF.parse(c.req.param("id"));
  const profil = await bureau(c, "Révocation d'un diplôme");
  const { motif } = await corps(c, z.object({ motif: z.string().trim().min(3).max(300) }).strict());
  const [cert] = await base().select().from(schema.certificats).where(eq(schema.certificats.id, id));
  if (!cert) throw new HTTPException(404, { message: "Diplôme inconnu du registre national" });
  if (cert.revoque) throw new HTTPException(409, { message: "Diplôme déjà révoqué." });
  await inscrireAuRegistre(
    [{ type: "REVOCATION_CERTIFICAT", auteurId: profil.id, etablissementId: null, apprenantId: cert.apprenantId, source: "examens", donnees: { apprenantId: cert.apprenantId, certificatId: id, motif } }],
    async (tx) => { await tx.update(schema.certificats).set({ revoque: true }).where(eq(schema.certificats.id, id)); },
  );
  await journaliser(profil, "Révocation d'un diplôme", `${id} · ${cert.examen} ${cert.session}`, "gestion", true, null);
  return c.json({ certificatId: id, revoque: true, motif });
});

/* ------------------------------------------------------------------ Recherche publique (sans compte) */

/**
 * Service public e-résultat : examen + session + numéro de table → le verdict, rien de plus.
 * Aucune réponse tant que la session n'est pas publiée ; aucune donnée individuelle via un autre chemin.
 */
examens.get("/public/resultats", limiteDebit(60, 60_000), async (c) => {
  const f = z.object({ examen: EXAMEN, session: z.string().trim().min(1).max(40), table: z.string().trim().min(1).max(20) }).parse(c.req.query());
  const [session] = await base().select().from(schema.examensSessions)
    .where(and(eq(schema.examensSessions.examen, f.examen), eq(schema.examensSessions.session, f.session)));
  let r: ResultatExamenPublic;
  if (!session) r = { statut: "introuvable", explication: "Aucune session pour cet examen et cette session." };
  else if (session.statut !== "publiee") r = { statut: "session_non_publiee", examen: f.examen, session: f.session, explication: "Les résultats de cette session ne sont pas encore publiés." };
  else {
    const [ligne] = await base()
      .select({
        titulaire: NOM_COMPLET, centre: schema.examensCentres.nom, numeroTable: schema.examensCandidatures.numeroTable,
        decision: schema.examensCandidatures.decision, moyenne: schema.examensCandidatures.moyenne, mention: schema.examensCandidatures.mention,
      })
      .from(schema.examensCandidatures)
      .innerJoin(schema.apprenants, eq(schema.apprenants.id, schema.examensCandidatures.apprenantId))
      .innerJoin(schema.examensCentres, eq(schema.examensCentres.id, schema.examensCandidatures.centreId))
      .where(and(eq(schema.examensCandidatures.sessionId, session.id), eq(schema.examensCandidatures.numeroTable, f.table)));
    if (!ligne || !ligne.decision) r = { statut: "introuvable", explication: "Aucun candidat inscrit sous ce numéro de table pour cette session." };
    else if (ligne.decision === "admis") r = { statut: "admis", titulaire: ligne.titulaire, examen: f.examen, session: f.session, numeroTable: f.table, centre: ligne.centre, moyenne: Number(ligne.moyenne ?? 0), mention: (ligne.mention ?? "Passable") as Mention };
    else r = { statut: "non_admis", titulaire: ligne.titulaire, examen: f.examen, session: f.session, numeroTable: f.table, centre: ligne.centre };
  }
  // Chaque consultation publique est tracée sans donnée sur le demandeur : volumétrie et tentatives de devinette.
  await journaliser({ id: "public", nomAffiche: "Consultation publique des résultats" }, "Recherche de résultat d'examen", `${f.examen} ${f.session} · ${f.table} · ${r.statut}`, "controle", true, null);
  c.header("Cache-Control", "no-store");
  return c.json(r);
});
