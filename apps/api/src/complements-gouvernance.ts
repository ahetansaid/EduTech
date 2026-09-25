import type { Profil } from "@beile/contracts";
import { schema } from "@beile/db";
import { ANNEE_COURANTE } from "@beile/simulation/macro";
import { communesDuPerimetre } from "@beile/simulation/semantique";
import { COMMUNES } from "@beile/simulation/territoire";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authentifie, base, journaliser, refuser, type Variables } from "./commun";
import { chargerCouches, memo } from "./donnees";
import { perimetrePilotage } from "./pilotage";

/**
 * Routes complémentaires de l'espace « gouvernance » (ajoutées pendant le branchement du front) :
 * journal d'audit filtré et paginé, statistiques des décisions, suivi des relances de transmission,
 * effet mesuré d'un changement de version au dictionnaire.
 */
export const complementsGouvernance = new Hono<{ Variables: Variables }>();

const FINALITES = ["consultation_personnelle", "suivi_familial", "evaluation", "gestion", "controle", "statistique", "audit"] as const;
const J = schema.journal;

/* ------------------------------------------------------------------ Journal d'audit (DPO) */

/**
 * La consultation du journal est elle-même journalisée. L'écran se rafraîchit toutes les 15 s : pour ne pas
 * noyer le journal sous ses propres lectures, une consultation accordée est inscrite au plus une fois toutes
 * les 5 minutes par personne et par instance. Un refus est toujours inscrit.
 */
const INTERVALLE_TRACE_MS = 5 * 60_000;
const derniereTrace = new Map<string, number>();

async function exigerDpo(profil: Profil, ressource: string) {
  const autorise = profil.habilitations.some((h) => h.role === "dpo");
  if (!autorise) {
    await journaliser(profil, "Consultation du journal d'audit", ressource, "audit", false, "role");
    refuser("Journal réservé au délégué à la protection des données : refus journalisé");
  }
  const t = derniereTrace.get(profil.id) ?? 0;
  if (Date.now() - t > INTERVALLE_TRACE_MS) {
    derniereTrace.set(profil.id, Date.now());
    if (derniereTrace.size > 10_000) derniereTrace.clear();
    await journaliser(profil, "Consultation du journal d'audit", ressource, "audit", true, null);
  }
}

/** Curseur de pagination par clé (horodatage, id) : stable même si de nouvelles lignes arrivent entre deux pages. */
const encoderCurseur = (h: Date, id: string) => Buffer.from(`${h.toISOString()}|${id}`).toString("base64url");
function decoderCurseur(brut: string): { h: string; id: string } {
  const [h, id] = Buffer.from(brut, "base64url").toString().split("|");
  if (!h || !id || Number.isNaN(Date.parse(h)) || !/^AUD-[0-9a-f-]{36}$/.test(id)) throw new HTTPException(422, { message: "Curseur de pagination invalide" });
  return { h, id };
}

const echapperLike = (t: string) => t.replace(/[\\%_]/g, (m) => `\\${m}`);

complementsGouvernance.get("/audit/journal", authentifie, async (c) => {
  const profil = c.get("profil");
  await exigerDpo(profil, "audit.journal");
  const p = z.object({
    limite: z.coerce.number().int().min(1).max(200).catch(50),
    decision: z.enum(["tous", "accordes", "refuses"]).catch("tous"),
    finalite: z.enum(FINALITES).optional().catch(undefined),
    q: z.string().trim().max(80).optional().catch(undefined),
    curseur: z.string().max(200).optional(),
  }).parse(c.req.query());

  const filtres: SQL[] = [];
  if (p.decision !== "tous") filtres.push(eq(J.autorise, p.decision === "accordes"));
  if (p.finalite) filtres.push(eq(J.finalite, p.finalite));
  if (p.q) filtres.push(sql`(${J.profilNom} || ' ' || ${J.action} || ' ' || ${J.ressource}) ilike ${`%${echapperLike(p.q)}%`}`);
  const pagination = p.curseur ? (() => { const k = decoderCurseur(p.curseur); return sql`(${J.horodatage}, ${J.id}) < (${k.h}::timestamptz, ${k.id})`; })() : undefined;

  const [lignes, [total]] = await Promise.all([
    base().select().from(J).where(and(...filtres, pagination)).orderBy(desc(J.horodatage), desc(J.id)).limit(p.limite + 1),
    base().select({ n: sql<number>`count(*)::int` }).from(J).where(and(...filtres)),
  ]);
  const page = lignes.slice(0, p.limite);
  const derniere = page[page.length - 1];
  return c.json({
    lignes: page,
    total: total?.n ?? 0,
    suivant: lignes.length > p.limite && derniere ? encoderCurseur(derniere.horodatage, derniere.id) : null,
  });
});

/** Statistiques des décisions : volumes, refus par critère manquant et par finalité, activité horaire sur 24 h. */
complementsGouvernance.get("/audit/statistiques", authentifie, async (c) => {
  const profil = c.get("profil");
  await exigerDpo(profil, "audit.journal · statistiques");
  const [[totaux], parCritere, parFinalite, parHeure, acteurs] = await Promise.all([
    base().execute<{ total: number; refus: number; jour: number; refus_jour: number; derniere: string | null }>(sql`
      select count(*)::int as total, count(*) filter (where not autorise)::int as refus,
             count(*) filter (where horodatage >= now() - interval '24 hours')::int as jour,
             count(*) filter (where not autorise and horodatage >= now() - interval '24 hours')::int as refus_jour,
             max(horodatage) as derniere
      from audit.journal`),
    base().execute<{ critere: string; n: number }>(sql`
      select coalesce(critere_manquant, 'inconnu') as critere, count(*)::int as n from audit.journal
      where not autorise and horodatage >= now() - interval '30 days' group by 1 order by 2 desc`),
    base().execute<{ finalite: string; total: number; refus: number }>(sql`
      select finalite, count(*)::int as total, count(*) filter (where not autorise)::int as refus from audit.journal
      where horodatage >= now() - interval '30 days' group by 1 order by 2 desc`),
    base().execute<{ heure: string; accordes: number; refus: number }>(sql`
      select to_char(date_trunc('hour', horodatage), 'YYYY-MM-DD"T"HH24:00') as heure,
             count(*) filter (where autorise)::int as accordes, count(*) filter (where not autorise)::int as refus
      from audit.journal where horodatage >= now() - interval '24 hours' group by 1 order by 1`),
    base().execute<{ profil_id: string; profil_nom: string; refus: number }>(sql`
      select profil_id, max(profil_nom) as profil_nom, count(*)::int as refus from audit.journal
      where not autorise and horodatage >= now() - interval '30 days' group by 1 order by 3 desc limit 5`),
  ]);
  return c.json({
    horodatage: new Date().toISOString(),
    totaux: { total: totaux?.total ?? 0, refus: totaux?.refus ?? 0, jour: totaux?.jour ?? 0, refusJour: totaux?.refus_jour ?? 0, derniere: totaux?.derniere ? new Date(totaux.derniere).toISOString() : null },
    refusParCritere: parCritere,
    parFinalite,
    activite24h: parHeure,
    acteursLesPlusRefuses: acteurs.map((a) => ({ profilId: a.profil_id, profilNom: a.profil_nom, refus: a.refus })),
  });
});

/* ------------------------------------------------------------------ Suivi des relances de transmission */

/** Relances ouvertes ou traitées, sous le périmètre de l'utilisateur, avec l'état de transmission actuel. */
complementsGouvernance.get("/plateforme/relances", authentifie, async (c) => {
  const profil = c.get("profil");
  const perimetre = profil.habilitations.some((h) => ["administrateur", "dpo"].includes(h.role)) ? { niveau: "national" as const } : perimetrePilotage(profil);
  const autorisees = communesDuPerimetre(perimetre);
  const E = schema.etablissements, D = schema.demandes;
  const filtre = autorisees ? sql`${E.communeId} in (select jsonb_array_elements_text(${JSON.stringify([...autorisees])}::jsonb))` : undefined;
  const lignes = await base()
    .select({ id: D.id, etablissementId: E.id, nom: E.nom, communeId: E.communeId, cycle: E.cycle, statut: D.statut, etape: D.etapeCourante, creeeLe: D.creeeLe, echeance: D.echeance, transmis: E.transmis })
    .from(D).innerJoin(E, eq(E.id, D.ressource))
    .where(and(eq(D.modele, "RELANCE_TRANSMISSION"), filtre))
    .orderBy(desc(D.creeeLe)).limit(200);
  return c.json(lignes.map((l) => ({ ...l, commune: COMMUNES.find((x) => x.id === l.communeId)?.nom ?? l.communeId })));
});

/* ------------------------------------------------------------------ Dictionnaire : effet d'un changement de version */

/**
 * Réussite à l'examen selon la définition v2.x (admis ÷ inscrits) et selon la v3.x en vigueur (admis ÷ présents),
 * calculée sur les mêmes données nationales : montre pourquoi chaque chiffre publié porte sa version.
 */
complementsGouvernance.get("/dictionnaire/:code/impact", authentifie, async (c) => {
  if (c.req.param("code") !== "taux_reussite_examen") throw new HTTPException(404, { message: "Aucune comparaison de versions publiée pour cet indicateur" });
  const examen = z.enum(["CEP", "BEPC", "BAC"]).catch("BEPC").parse(c.req.query("examen"));
  const couches = await chargerCouches(base());
  return c.json(memo(couches, `impact-version:${examen}`, () => {
    let inscrits = 0, presents = 0, admis = 0;
    for (const commune of couches.communes.values()) {
      const e = commune.examens[ANNEE_COURANTE][examen];
      inscrits += e.inscrits; presents += e.presents; admis += e.admis;
    }
    return { code: "taux_reussite_examen", examen, annee: ANNEE_COURANTE, inscrits, presents, admis, selonV2: inscrits ? (admis / inscrits) * 100 : null, selonV3: presents ? (admis / presents) * 100 : null };
  }));
});
