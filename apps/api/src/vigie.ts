import { randomUUID } from "node:crypto";
import { schema } from "@beile/db";
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authentifie, base, corps, journaliser, refuser, type Variables } from "./commun";

/**
 * Vigie : détection d'anomalies par règles simples et explicables, évaluées au fil de l'eau aux points
 * sensibles (refus, verrouillage, connexion d'un administrateur, élévation, créations de comptes). Une
 * alerte est dédupliquée par une clé (type, sujet, heure) : une rafale produit une alerte, pas cent.
 * Les alertes sont lues et traitées par le DPO et l'administrateur de la plateforme (/securite/alertes).
 */
export type Gravite = "info" | "moyenne" | "haute";

const heure = () => new Date().toISOString().slice(0, 13);
/** Heure légale du Bénin (UTC+1, sans heure d'été). */
const heureBenin = () => (new Date().getUTCHours() + 1) % 24;

export async function signaler(type: string, gravite: Gravite, profilId: string | null, sujet: string, detail: string) {
  await base().insert(schema.alertesSecurite).values({
    id: `SEC-${randomUUID()}`, type, gravite, profilId, cle: `${type}|${sujet}|${heure()}`, detail: detail.slice(0, 500),
  }).onConflictDoNothing().catch(() => {});
}

/** Refus en rafale : 8 refus ou plus en 10 minutes pour un même profil (exploration hors périmètre). */
export async function surRefus(profilId: string, nom: string) {
  const [r] = (await base().execute(sql`select count(*)::int n from audit.journal where profil_id = ${profilId} and not autorise and horodatage > now() - interval '10 minutes'`)) as unknown as { n: number }[];
  if ((r?.n ?? 0) >= 8) await signaler("refus_en_rafale", "moyenne", profilId, profilId, `${nom} : ${r!.n} refus d'accès en 10 minutes — exploration hors de son périmètre ?`);
}

export async function surVerrouillage(profilId: string, identifiant: string) {
  await signaler("verrouillage", "info", profilId, identifiant, `Compte ${identifiant} verrouillé après 5 échecs de connexion consécutifs.`);
}

/**
 * Connexion d'un administrateur (appelée AVANT la création de sa session) : adresse jamais vue sur ses
 * sessions des 60 derniers jours alors qu'il en avait d'autres, ou connexion entre minuit et 5 h.
 */
export async function surConnexionAdministrateur(profilId: string, compteId: string, identifiant: string, ip: string) {
  const [anterieure] = await base().select({ e: schema.sessions.empreinte }).from(schema.sessions).where(eq(schema.sessions.compteId, compteId)).limit(1);
  const [vue] = await base().select({ e: schema.sessions.empreinte }).from(schema.sessions)
    .where(and(eq(schema.sessions.compteId, compteId), eq(schema.sessions.adresseIp, ip), gt(schema.sessions.creeLe, new Date(Date.now() - 60 * 86_400_000)))).limit(1);
  if (anterieure && !vue) await signaler("nouvel_appareil_administrateur", "moyenne", profilId, `${identifiant}|${ip}`, `Administrateur ${identifiant} connecté depuis une adresse nouvelle (${ip}).`);
  const h = heureBenin();
  if (h < 5) await signaler("activite_hors_horaires", "info", profilId, identifiant, `Connexion d'administrateur à ${h} h (heure du Bénin) : ${identifiant}.`);
}

/** Créations de comptes en série : 20 ou plus en une heure par un même administrateur. */
export async function surCreationCompte(profilId: string, nom: string) {
  const [r] = (await base().execute(sql`select count(*)::int n from audit.journal where profil_id = ${profilId} and action = 'Création d''un compte délégué' and autorise and horodatage > now() - interval '1 hour'`)) as unknown as { n: number }[];
  if ((r?.n ?? 0) >= 20) await signaler("creation_en_serie", "haute", profilId, profilId, `${nom} a créé ${r!.n} comptes en une heure.`);
}

export async function surEchecsSecondFacteur(profilId: string, identifiant: string) {
  await signaler("second_facteur_echoue", "haute", profilId, identifiant, `5 échecs du second facteur pour ${identifiant} : session coupée.`);
}

/* ------------------------------------------------------------------ Consultation et traitement */

export const vigie = new Hono<{ Variables: Variables }>();

function exigerVigie(c: Context<{ Variables: Variables }>) {
  if (!c.get("profil").habilitations.some((h) => h.role === "dpo" || h.role === "administrateur")) refuser("Réservé au délégué à la protection des données et à l'administrateur de la plateforme");
}

vigie.get("/securite/alertes", authentifie, async (c) => {
  exigerVigie(c);
  const statut = z.enum(["ouvertes", "toutes"]).catch("ouvertes").parse(c.req.query("statut"));
  const lignes = await base().select().from(schema.alertesSecurite)
    .where(statut === "ouvertes" ? isNull(schema.alertesSecurite.traiteeLe) : undefined)
    .orderBy(desc(schema.alertesSecurite.creeLe)).limit(200);
  await journaliser(c.get("profil"), "Consultation des alertes de sécurité", statut, "gestion", true, null);
  return c.json(lignes);
});

vigie.post("/securite/alertes/:id/traiter", authentifie, async (c) => {
  exigerVigie(c);
  const id = z.string().regex(/^SEC-[0-9a-f-]{36}$/).parse(c.req.param("id"));
  const { suite } = await corps(c, z.object({ suite: z.string().trim().min(5).max(300) }).strict());
  const [maj] = await base().update(schema.alertesSecurite).set({ traiteeLe: new Date(), traiteePar: c.get("profil").id, suite })
    .where(and(eq(schema.alertesSecurite.id, id), isNull(schema.alertesSecurite.traiteeLe))).returning({ id: schema.alertesSecurite.id });
  if (!maj) throw new HTTPException(404, { message: "Alerte introuvable ou déjà traitée" });
  await journaliser(c.get("profil"), "Traitement d'une alerte de sécurité", `${id} · ${suite}`, "gestion", true, null);
  return c.json({ ok: true });
});

/**
 * Export pour notification d'incident (bjCSIRT) : alertes de gravité « haute » ou « moyenne » d'une
 * période, sans donnée nominative d'élève — identifiants de comptes et adresses seulement.
 */
vigie.get("/securite/alertes/export", authentifie, async (c) => {
  exigerVigie(c);
  const depuis = z.coerce.date().catch(new Date(Date.now() - 7 * 86_400_000)).parse(c.req.query("depuis"));
  const lignes = await base().select().from(schema.alertesSecurite)
    .where(and(gt(schema.alertesSecurite.creeLe, depuis), inArray(schema.alertesSecurite.gravite, ["moyenne", "haute"])))
    .orderBy(desc(schema.alertesSecurite.creeLe));
  await journaliser(c.get("profil"), "Export des alertes pour notification d'incident", depuis.toISOString(), "gestion", true, null);
  return c.json({
    emetteur: "Plateforme BEILE", genereLe: new Date().toISOString(), periode: { depuis: depuis.toISOString(), jusqua: new Date().toISOString() },
    evenements: lignes.map((a) => ({ reference: a.id, type: a.type, gravite: a.gravite, detecteLe: a.creeLe, description: a.detail, traite: !!a.traiteeLe, suite: a.suite })),
  });
});
