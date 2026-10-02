import { randomUUID } from "node:crypto";
import type { Mention, ResultatExamenPublic, SessionPubliee } from "@beile/contracts";
import { AUTORITE_EXAMEN, Decision, ExamenNational, examenNationalCertifie } from "@beile/contracts";
import { schema } from "@beile/db";
import { aujourdhui } from "@beile/simulation/scolarite";
import { and, count, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authentifie, base, corps, journaliser, limiteDebitPartage, refuser, type Variables } from "./commun";
import { sceauCertificat } from "./certification";
import { inscrireAuRegistre, type NouveauFait } from "./ecriture";
import { scolarisesEtablissement } from "./lectures";

/**
 * Examens nationaux, vus depuis le registre national. BEILE n'organise ni ne délibère un examen : la
 * DEC du MEMP (CEP) et la DEC du MESTFP (BEPC, BAC) le font, et publient sur eRESULTATS. BEILE tient ce
 * qui lui revient : le candidaturé rattaché au parcours, la RÉCEPTION des verdicts du procès-verbal
 * officiel (jamais recalculés), puis, à la publication, la délivrance — au nom de l'autorité compétente
 * — de diplômes vérifiables qui entrent dans le parcours de l'apprenant.
 * Une école ne délivre jamais un diplôme national.
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
 *
 * Le filtre `examenNationalCertifie` n'est pas cosmétique : `ExamenNational` garde les sigles `BEP` et
 * `BT` pour relire une écriture déjà enregistrée, et aucune autorité béninoise ne les publie. Ouvrir une
 * session sous l'un d'eux, ce serait créer de toutes pièces un examen national que personne ne délibère.
 */
examens.post("/examens/sessions", authentifie, async (c) => {
  const profil = await bureau(c, "Ouverture d'une session d'examen");
  const { examen, session, arretCandidatures } = await corps(c, z.object({
    examen: ExamenNational,
    session: z.string().trim().min(3).max(40),
    arretCandidatures: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }).strict().refine((b) => examenNationalCertifie(b.examen), {
    message: "n'est publié par aucune autorité de délibération : aucune session ne peut être ouverte sous ce sigle",
    path: ["examen"],
  }));
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

/** Une ligne du procès-verbal officiel : numéro de table, décision prononcée, moyenne d'épreuve. */
export const LigneVerdict = z.object({
  numeroTable: z.string().trim().min(1).max(20),
  decision: Decision,
  moyenne: z.coerce.number().min(0).max(20).nullable().default(null),
}).strict().refine((l) => (l.decision === "admis" || l.decision === "non_admis") === (l.moyenne !== null), {
  message: "Une moyenne accompagne un verdict noté (admis, non admis), jamais une absence ni une exclusion",
});
type Verdict = z.infer<typeof LigneVerdict>;
/** Qui agit : un profil du bureau (saisie de secours) ou un système partenaire (connecteur). */
export type Auteur = { id: string; nomAffiche: string };
/** Source inscrite au registre : le PV reçu de l'autorité par connecteur, ou saisi au bureau en secours. */
type SourceExamen = "examens" | "beile";

/**
 * Réception d'un lot du procès-verbal officiel. Rien n'est déduit : un jury peut racheter un candidat, et
 * « absent » n'est pas un échec noté. Un seul UPDATE … FROM (VALUES …) dans une transaction : le lot
 * passe entier ou pas du tout. Rejouable : réappliquer le même lot écrit les mêmes valeurs.
 */
export async function recevoirPv(sessionId: string, decisions: Verdict[], pvReference: string, auteur: Auteur) {
  const session = await sessionOuverte(sessionId);
  if (session.statut === "publiee") throw new HTTPException(409, { message: "Session déjà publiée : verdicts figés." });
  const tables = decisions.map((d) => d.numeroTable);
  const connues = await base().select({ id: schema.examensCandidatures.id, numeroTable: schema.examensCandidatures.numeroTable })
    .from(schema.examensCandidatures).where(and(eq(schema.examensCandidatures.sessionId, sessionId), inArray(schema.examensCandidatures.numeroTable, tables)));
  const parTable = new Map(connues.map((x) => [x.numeroTable, x.id]));
  const verdicts = decisions.flatMap((d) => {
    const candidatureId = parTable.get(d.numeroTable);
    if (!candidatureId) return [];
    const moyenne = d.moyenne === null ? null : Math.round(d.moyenne * 100) / 100;
    // Un admis racheté sous 10 reçoit la mention la plus basse, jamais une mention calculée sous le seuil.
    return [{ candidatureId, moyenne, decision: d.decision, mention: d.decision === "admis" && moyenne !== null ? mentionDe(Math.max(moyenne, 10)) : null }];
  });
  if (verdicts.length) {
    await base().transaction(async (tx) => {
      const valeurs = sql.join(verdicts.map((v) => sql`(${v.candidatureId}, ${v.decision}, ${v.moyenne}::numeric, ${v.mention})`), sql`, `);
      await tx.execute(sql`
        update core.examens_candidatures as c set decision = v.decision, moyenne = v.moyenne, mention = v.mention
        from (values ${valeurs}) as v(id, decision, moyenne, mention)
        where c.id = v.id and c.session_id = ${sessionId}`);
      await tx.update(schema.examensSessions).set({ statut: "deliberation" }).where(eq(schema.examensSessions.id, sessionId));
    });
  }
  const inconnus = decisions.filter((d) => !parTable.has(d.numeroTable)).map((d) => d.numeroTable);
  await journaliser(auteur, "Réception du procès-verbal d'une session d'examen", `${session.examen} ${session.session} · PV ${pvReference} · ${verdicts.length} verdict(s)${inconnus.length ? ` · ${inconnus.length} numéro(s) inconnu(s)` : ""}`, "gestion", true, null);
  return { sessionId, recus: verdicts.length, numerosInconnus: inconnus.slice(0, 50) };
}

/**
 * Publication : TOUS les candidats doivent être statués (un candidat sans verdict paraîtrait
 * « introuvable » au public). Inscrit au registre le résultat de chaque candidat noté et, pour chaque
 * admis, le diplôme délivré au nom de l'autorité compétente, scellé à clef. Par lots de 1 000 candidats ;
 * rejouable (ce qui est déjà inscrit est sauté) ; la session ne passe « publiée » qu'à la fin.
 */
const LOT_PUBLICATION = 1000;
export async function publierSession(sessionId: string, auteur: Auteur, source: SourceExamen) {
  const session = await sessionOuverte(sessionId);
  if (session.statut === "publiee") throw new HTTPException(409, { message: "Session déjà publiée." });
  if (!parNiveau(session.examen)) throw new HTTPException(422, { message: `Session « ${session.examen} » : la certification d'un examen du supérieur passe par le registre du supérieur` });
  const [{ total, statues } = { total: 0, statues: 0 }] = await base().select({
    total: count(), statues: sql<number>`count(${schema.examensCandidatures.decision})::int`,
  }).from(schema.examensCandidatures).where(eq(schema.examensCandidatures.sessionId, sessionId));
  if (!total) throw new HTTPException(422, { message: "Aucun candidat dans cette session : rien à publier." });
  if (statues < total) throw new HTTPException(409, { message: `${total - statues} candidat(s) sans verdict du procès-verbal : la publication attend que tous soient statués.` });

  const autorite = AUTORITE_EXAMEN[session.examen];
  const annee = anneeDe(session.session);
  const delivreLe = aujourdhui();
  const idSaisie = `PUB-${sessionId.slice(4)}`;
  const candidats = await base().select({
    apprenantId: schema.examensCandidatures.apprenantId, decision: schema.examensCandidatures.decision,
    moyenne: schema.examensCandidatures.moyenne, mention: schema.examensCandidatures.mention,
    prenoms: schema.apprenants.prenoms, nom: schema.apprenants.nom,
  }).from(schema.examensCandidatures)
    .innerJoin(schema.apprenants, eq(schema.apprenants.id, schema.examensCandidatures.apprenantId))
    .where(eq(schema.examensCandidatures.sessionId, sessionId));
  // Déjà inscrits (rejeu d'une publication interrompue) : résultats de cette publication, diplômes existants.
  const [dejaResultat, dejaDiplome] = await Promise.all([
    base().select({ a: schema.evenements.apprenantId }).from(schema.evenements).where(and(
      eq(schema.evenements.type, "RESULTAT_EXAMEN"), sql`${schema.evenements.donnees} ? 'idSaisie'`, sql`${schema.evenements.donnees}->>'idSaisie' = ${idSaisie}`)),
    base().select({ id: schema.certificats.id }).from(schema.certificats).where(sql`${schema.certificats.id} like ${`CERT-${session.examen}-${annee}-%`}`),
  ]);
  const resultatFait = new Set(dejaResultat.map((x) => x.a));
  const diplomeFait = new Set(dejaDiplome.map((x) => x.id));
  let resultats = 0, diplomes = 0;
  for (let k = 0; k < candidats.length; k += LOT_PUBLICATION) {
    const faits: NouveauFait[] = [];
    for (const a of candidats.slice(k, k + LOT_PUBLICATION)) {
      if (a.decision !== "admis" && a.decision !== "non_admis") continue; // absent, exclu : aucun résultat noté
      const admis = a.decision === "admis";
      if (!resultatFait.has(a.apprenantId)) {
        faits.push({
          type: "RESULTAT_EXAMEN", auteurId: auteur.id, etablissementId: null, apprenantId: a.apprenantId, source,
          donnees: { apprenantId: a.apprenantId, examen: session.examen, session: session.session, moyenne: Number(a.moyenne ?? 0), admis, idSaisie },
        });
        resultats++;
      }
      const certificatId = `CERT-${session.examen}-${annee}-${a.apprenantId.slice(4)}`;
      if (admis && !diplomeFait.has(certificatId)) {
        const brut = {
          id: certificatId, apprenantId: a.apprenantId, examen: session.examen, session: session.session,
          mention: (a.mention ?? mentionDe(Math.max(Number(a.moyenne ?? 10), 10))) as Mention,
          moyenne: a.moyenne === null ? null : Number(a.moyenne), delivreLe,
          // L'office nommé fait du sceau un MAC (clef de l'hébergeur) : un diplôme national ne se recalcule pas en base.
          filiereId: null, etablissementId: null, office: autorite.office,
        };
        faits.push({
          type: "CERTIFICATION", auteurId: auteur.id, etablissementId: null, apprenantId: a.apprenantId, source,
          donnees: { ...brut, certificatId, delivrePar: null, empreinte: sceauCertificat(brut, `${a.prenoms} ${a.nom}`) },
        });
        diplomes++;
      }
    }
    if (faits.length) await inscrireAuRegistre(faits);
  }
  await base().update(schema.examensSessions).set({ statut: "publiee", publieeLe: delivreLe }).where(eq(schema.examensSessions.id, sessionId));
  await journaliser(auteur, "Publication des résultats d'examen", `${session.examen} ${session.session} · ${autorite.sigle} · ${resultats} résultat(s), ${diplomes} diplôme(s)`, "gestion", true, null);
  return { sessionId, publie: true, candidats: total, resultats, diplomes, autorite: autorite.libelle, publieeLe: delivreLe };
}

/** Session désignée par l'autorité comme elle la nomme : examen + libellé de session. */
export async function sessionParLibelle(examen: string, libelle: string) {
  const [s] = await base().select({ id: schema.examensSessions.id }).from(schema.examensSessions)
    .where(and(eq(schema.examensSessions.examen, examen as never), eq(schema.examensSessions.session, libelle)));
  if (!s) throw new HTTPException(404, { message: `Aucune session ${examen} « ${libelle} » : le candidaturé doit précéder le procès-verbal` });
  return s.id;
}

/** Saisie de secours au bureau : le PV d'une autorité non encore connectée. */
examens.post("/examens/sessions/:id/deliberation", authentifie, async (c) => {
  const id = ID_SESSION.parse(c.req.param("id"));
  const profil = await bureau(c, "Réception du procès-verbal d'une session d'examen");
  const { decisions, pvReference } = await corps(c, z.object({
    // Par lots de 5 000 verdicts au plus (≈ 250 Ko, voir la limite de corps propre à cette route).
    decisions: z.array(LigneVerdict).min(1).max(5000),
    /** Référence du procès-verbal officiel : l'acte signé reste la source, BEILE en garde la trace. */
    pvReference: z.string().trim().min(3).max(80),
  }).strict());
  return c.json(await recevoirPv(id, decisions, pvReference, profil));
});

examens.post("/examens/sessions/:id/publication", authentifie, async (c) => {
  const id = ID_SESSION.parse(c.req.param("id"));
  const profil = await bureau(c, "Publication des résultats d'examen");
  return c.json(await publierSession(id, profil, "beile"));
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
 * Service public e-résultat, en complément de la plateforme officielle eRESULTATS. Minimisation : le
 * numéro de table seul donne le verdict et la mention, jamais le nom ni la moyenne — les numéros se
 * suivent, et sans second facteur une session entière se lirait nom par nom. Avec la date de naissance
 * du candidat, qui concorde avec le registre, le nom et la moyenne s'ajoutent. Les essais de date sont
 * plafonnés par candidat : la date ne se devine pas par balayage.
 */
examens.get("/public/resultats/sessions", async (c) => {
  const lignes = await base().select({ examen: schema.examensSessions.examen, session: schema.examensSessions.session, publieeLe: schema.examensSessions.publieeLe })
    .from(schema.examensSessions).where(and(eq(schema.examensSessions.statut, "publiee"), inArray(schema.examensSessions.examen, ["CEP", "BEPC", "BAC"])))
    .orderBy(sql`${schema.examensSessions.publieeLe} desc nulls last`, schema.examensSessions.examen);
  c.header("Cache-Control", "public, max-age=300");
  return c.json(lignes.filter((l): l is typeof l & { examen: "CEP" | "BEPC" | "BAC" } => parNiveau(l.examen))
    .map((l): SessionPubliee => ({ ...l, autorite: AUTORITE_EXAMEN[l.examen].libelle })));
});

const RECHERCHE_RESULTAT = z.object({
  examen: EXAMEN, session: z.string().trim().min(1).max(40), table: z.string().trim().min(1).max(20),
  naissance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
/** Clé d'un candidat NORMALISÉE (espaces, casse) : « %20123 » et « 123 » désignent le même candidat. */
const cleCandidat = (examen: unknown, session: unknown, table: unknown) =>
  [examen, session, table].map((x) => String(x ?? "").replace(/\s+/g, "").toLowerCase()).join("|");

/**
 * Essais de date de naissance : 10 par candidat et par heure (toutes adresses confondues), et 30 par
 * adresse et par heure (tous candidats confondus) — ni balayage des dates, ni balayage des numéros.
 */
const rechercheDe = (c: Context) => (c as unknown as { get: (k: string) => z.infer<typeof RECHERCHE_RESULTAT> | undefined }).get("rechercheResultat");
const essaisDateCandidat = limiteDebitPartage("resultat-naissance", 10, 3_600_000, (c) => { const f = rechercheDe(c); return cleCandidat(f?.examen, f?.session, f?.table); });
const essaisDateAdresse = limiteDebitPartage("resultat-naissance-ip", 30, 3_600_000);

/**
 * GET : numéro de table seul (verdict et mention). La date de naissance d'un candidat (second facteur)
 * passe par POST, dans le corps : jamais dans une URL, donc jamais dans les journaux d'accès.
 */
examens.get("/public/resultats", limiteDebitPartage("resultats", 60, 60_000), async (c) => {
  if (c.req.query("naissance")) throw new HTTPException(422, { message: "La date de naissance s'envoie dans le corps d'une requête POST, jamais dans l'adresse." });
  return repondreResultat(c, RECHERCHE_RESULTAT.parse(c.req.query()));
});
examens.post("/public/resultats", limiteDebitPartage("resultats", 60, 60_000), async (c, next) => {
  const f = await corps(c, RECHERCHE_RESULTAT.strict());
  (c as unknown as { set: (k: string, v: unknown) => void }).set("rechercheResultat", f);
  if (!f.naissance) return next();
  await essaisDateAdresse(c, async () => { await essaisDateCandidat(c, next); });
}, async (c) => repondreResultat(c, rechercheDe(c)!));

async function repondreResultat(c: Context, f: z.infer<typeof RECHERCHE_RESULTAT>) {
  const autorite = AUTORITE_EXAMEN[f.examen].libelle;
  const [session] = await base().select().from(schema.examensSessions)
    .where(and(eq(schema.examensSessions.examen, f.examen), eq(schema.examensSessions.session, f.session)));
  let r: ResultatExamenPublic;
  if (!session) r = { statut: "introuvable", explication: "Aucune session pour cet examen et cette session." };
  else if (session.statut !== "publiee") r = { statut: "session_non_publiee", examen: f.examen, session: f.session, explication: "Les résultats de cette session ne sont pas encore publiés." };
  else {
    const [ligne] = await base()
      .select({
        titulaire: NOM_COMPLET, naissance: schema.apprenants.dateNaissance, centre: schema.examensCentres.nom,
        decision: schema.examensCandidatures.decision, moyenne: schema.examensCandidatures.moyenne, mention: schema.examensCandidatures.mention,
      })
      .from(schema.examensCandidatures)
      .innerJoin(schema.apprenants, eq(schema.apprenants.id, schema.examensCandidatures.apprenantId))
      .innerJoin(schema.examensCentres, eq(schema.examensCentres.id, schema.examensCandidatures.centreId))
      .where(and(eq(schema.examensCandidatures.sessionId, session.id), eq(schema.examensCandidatures.numeroTable, f.table)));
    const concorde = !!ligne && !!f.naissance && ligne.naissance === f.naissance;
    const identite = concorde ? { titulaire: ligne!.titulaire, moyenne: ligne!.moyenne === null ? null : Number(ligne!.moyenne) } : null;
    const dateNonConcordante = !!f.naissance && !concorde;
    if (!ligne || !ligne.decision) r = { statut: "introuvable", explication: "Aucun candidat inscrit sous ce numéro de table pour cette session." };
    else if (ligne.decision === "admis") r = { statut: "admis", examen: f.examen, session: f.session, numeroTable: f.table, centre: ligne.centre, mention: (ligne.mention ?? "Passable") as Mention, autorite, identite, dateNonConcordante };
    else r = { statut: "non_admis", examen: f.examen, session: f.session, numeroTable: f.table, autorite, identite, dateNonConcordante };
  }
  // Tracée sans donnée sur le demandeur : volumétrie et tentatives de balayage.
  await journaliser({ id: "public", nomAffiche: "Consultation publique des résultats" }, "Recherche de résultat d'examen", `${f.examen} ${f.session} · ${f.table} · ${r.statut}${f.naissance ? " · 2e facteur" : ""}`, "controle", true, null);
  c.header("Cache-Control", "no-store");
  return c.json(r);
}
