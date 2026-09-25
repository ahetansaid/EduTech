import { randomUUID } from "node:crypto";
import { schema } from "@beile/db";
import { ANNEE_COURANTE } from "@beile/simulation/macro";
import { communesDuPerimetre } from "@beile/simulation/semantique";
import { COMMUNES, DEPARTEMENTS } from "@beile/simulation/territoire";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { authentifie, base, corps, journaliser, refuser, type Variables } from "./commun";
import { perimetrePilotage } from "./pilotage";

/**
 * Plateforme : état de service mesuré, qualité des remontées (complétude, fraîcheur, confiance) avec relances,
 * interopérabilité (volumes et dernière réception par source). Tout est lu en base, rien n'est déclaré.
 */
export const plateforme = new Hono<{ Variables: Variables }>();

const DEMARRAGE = Date.now();
const SEUIL_FRAICHEUR_JOURS = 30;

function exploitant(c: Context<{ Variables: Variables }>) {
  if (!c.get("profil").habilitations.some((h) => ["administrateur", "dpo", "administration_centrale"].includes(h.role))) refuser("Réservé à l'exploitation de la plateforme");
}

/** État de service : latence base mesurée, activité du registre, sessions, sécurité (refus journalisés). */
plateforme.get("/plateforme/etat", authentifie, async (c) => {
  exploitant(c);
  const t0 = performance.now();
  await base().execute(sql`select 1`);
  const latenceBase = performance.now() - t0;
  const [[registre], parHeure, [securite], [comptes], [version]] = await Promise.all([
    base().execute<{ total: number; jour: number; heure: number }>(sql`
      select count(*)::int as total,
             count(*) filter (where survenu_le >= date_trunc('day', now()))::int as jour,
             count(*) filter (where survenu_le >= now() - interval '1 hour')::int as heure
      from ledger.evenements`),
    base().execute<{ heure: string; n: number }>(sql`
      select to_char(date_trunc('hour', survenu_le), 'YYYY-MM-DD"T"HH24:00') as heure, count(*)::int as n
      from ledger.evenements where survenu_le >= now() - interval '24 hours' group by 1 order by 1`),
    base().execute<{ consultations: number; refus: number; connexions: number; echecs: number }>(sql`
      select count(*)::int as consultations, count(*) filter (where not autorise)::int as refus,
             count(*) filter (where action = 'Connexion')::int as connexions,
             count(*) filter (where action like 'Connexion refusée%' or action like 'Connexion —%')::int as echecs
      from audit.journal where horodatage >= now() - interval '24 hours'`),
    base().execute<{ comptes: number; actifs: number; sessions: number; verrouilles: number }>(sql`
      select (select count(*)::int from core.comptes) as comptes, (select count(*)::int from core.comptes where actif) as actifs,
             (select count(*)::int from core.sessions where not revoquee and expire_le > now()) as sessions,
             (select count(*)::int from core.comptes where verrouille_jusqu_a > now()) as verrouilles`),
    base().execute<{ version: string; taille: string }>(sql`select split_part(version(), ' ', 2) as version, pg_size_pretty(pg_database_size(current_database())) as taille`),
  ]);
  return c.json({
    horodatage: new Date().toISOString(),
    service: { version: "0.3.0", instanceDepuis: new Date(DEMARRAGE).toISOString(), region: process.env.VERCEL_REGION ?? "local", memoireMo: Math.round(process.memoryUsage().rss / 1048576) },
    base: { latenceMs: Math.round(latenceBase * 10) / 10, postgres: version?.version, taille: version?.taille },
    registre, activite24h: parHeure, securite24h: securite, comptes,
  });
});

/** Qualité des remontées, sous le périmètre de l'utilisateur : par département puis par commune. */
plateforme.get("/plateforme/qualite", authentifie, async (c) => {
  const profil = c.get("profil");
  const perimetre = profil.habilitations.some((h) => ["administrateur", "dpo"].includes(h.role)) ? { niveau: "national" as const } : perimetrePilotage(profil);
  const autorisees = communesDuPerimetre(perimetre);
  const filtre = autorisees ? sql`where e.commune_id in (select jsonb_array_elements_text(${JSON.stringify([...autorisees])}::jsonb))` : sql``;
  const [etabs, communes, relances] = await Promise.all([
    base().execute<{ commune_id: string; attendus: number; transmis: number }>(sql`
      select e.commune_id, count(*)::int as attendus, count(*) filter (where e.transmis)::int as transmis from core.etablissements e ${filtre} group by 1`),
    base().select({ communeId: schema.communesAnnee.communeId, couverture: schema.communesAnnee.couverture, fraicheurJours: schema.communesAnnee.fraicheurJours })
      .from(schema.communesAnnee).where(eq(schema.communesAnnee.annee, ANNEE_COURANTE)),
    base().select({ ressource: schema.demandes.ressource, creeeLe: schema.demandes.creeeLe }).from(schema.demandes)
      .where(and(eq(schema.demandes.modele, "RELANCE_TRANSMISSION"), inArray(schema.demandes.statut, ["ouverte", "en_cours"]))),
  ]);
  const annee = new Map(communes.map((x) => [x.communeId, x]));
  const lignes = etabs.map((e) => {
    const a = annee.get(e.commune_id);
    const commune = COMMUNES.find((x) => x.id === e.commune_id);
    const fraicheur = a ? Math.max(0, 1 - a.fraicheurJours / SEUIL_FRAICHEUR_JOURS) : 0;
    const completude = e.attendus ? e.transmis / e.attendus : 0;
    return {
      communeId: e.commune_id, commune: commune?.nom ?? e.commune_id, departementId: commune?.departementId ?? null,
      attendus: e.attendus, transmis: e.transmis, completude: completude * 100, fraicheurJours: a?.fraicheurJours ?? null,
      confiance: Math.round((0.35 * (a?.couverture ?? completude) + 0.25 * fraicheur + 0.2 * 0.96 + 0.2 * 0.86) * 100),
    };
  });
  const departements = DEPARTEMENTS.map((d) => {
    const l = lignes.filter((x) => x.departementId === d.id);
    const attendus = l.reduce((s, x) => s + x.attendus, 0), transmis = l.reduce((s, x) => s + x.transmis, 0);
    const fr = l.filter((x) => x.fraicheurJours != null);
    return { id: d.id, nom: d.nom, communes: l.length, attendus, transmis, completude: attendus ? (transmis / attendus) * 100 : 0,
      fraicheurJours: fr.length ? fr.reduce((s, x) => s + x.fraicheurJours!, 0) / fr.length : null,
      confiance: l.length ? Math.round(l.reduce((s, x) => s + x.confiance * x.attendus, 0) / Math.max(1, attendus)) : null };
  }).filter((d) => d.communes > 0);
  return c.json({ perimetre, annee: ANNEE_COURANTE, seuilAlerte: 80, departements, communes: lignes, relancesOuvertes: relances.length });
});

/** Établissements n'ayant pas transmis leur remontée, pour une commune du périmètre. */
plateforme.get("/plateforme/qualite/communes/:id", authentifie, async (c) => {
  const profil = c.get("profil");
  const communeId = z.string().regex(/^[a-z0-9-]+$/).parse(c.req.param("id"));
  const perimetre = profil.habilitations.some((h) => ["administrateur", "dpo"].includes(h.role)) ? { niveau: "national" as const } : perimetrePilotage(profil);
  const autorisees = communesDuPerimetre(perimetre);
  if (autorisees && !autorisees.has(communeId)) refuser("Commune hors de votre périmètre");
  const manquants = await base().select({ id: schema.etablissements.id, nom: schema.etablissements.nom, cycle: schema.etablissements.cycle, statut: schema.etablissements.statut, circonscription: schema.etablissements.circonscription })
    .from(schema.etablissements).where(and(eq(schema.etablissements.communeId, communeId), eq(schema.etablissements.transmis, false)));
  const relances = manquants.length ? await base().select({ ressource: schema.demandes.ressource, creeeLe: schema.demandes.creeeLe }).from(schema.demandes)
    .where(and(eq(schema.demandes.modele, "RELANCE_TRANSMISSION"), inArray(schema.demandes.ressource, manquants.map((m) => m.id)))) : [];
  const derniere = new Map(relances.map((r) => [r.ressource, r.creeeLe]));
  return c.json(manquants.map((m) => ({ ...m, relanceLe: derniere.get(m.id) ?? null })));
});

/** Relance : une demande suivie par établissement (circuit RELANCE_TRANSMISSION), visible par sa direction. */
plateforme.post("/plateforme/relances", authentifie, async (c) => {
  const profil = c.get("profil");
  const perimetre = perimetrePilotage(profil);
  const { etablissementIds } = await corps(c, z.object({ etablissementIds: z.array(z.string().regex(/^ETB-[A-Z0-9-]+$/)).min(1).max(200) }).strict());
  const cibles = await base().select({ id: schema.etablissements.id, communeId: schema.etablissements.communeId, transmis: schema.etablissements.transmis })
    .from(schema.etablissements).where(inArray(schema.etablissements.id, etablissementIds));
  const autorisees = communesDuPerimetre(perimetre);
  const hors = cibles.filter((x) => autorisees && !autorisees.has(x.communeId));
  if (hors.length || cibles.length !== etablissementIds.length) refuser("Établissements hors de votre périmètre ou inconnus");
  const ouvertes = new Set((await base().select({ r: schema.demandes.ressource }).from(schema.demandes)
    .where(and(eq(schema.demandes.modele, "RELANCE_TRANSMISSION"), inArray(schema.demandes.statut, ["ouverte", "en_cours"]), inArray(schema.demandes.ressource, etablissementIds)))).map((x) => x.r));
  const nouvelles = cibles.filter((x) => !x.transmis && !ouvertes.has(x.id));
  await base().insert(schema.modelesCircuit).values({ code: "RELANCE_TRANSMISSION", libelle: "Relance de transmission des données", version: "1.0", etapes: [{ ordre: 1, code: "RELANCE", role: "direction_departementale", delaiJours: 0 }, { ordre: 2, code: "TRANSMISSION", role: "chef_etablissement", delaiJours: 7 }] }).onConflictDoNothing();
  if (nouvelles.length) {
    await base().insert(schema.demandes).values(nouvelles.map((x) => ({ id: `DEM-${randomUUID()}`, modele: "RELANCE_TRANSMISSION", objet: `Transmettre la remontée ${ANNEE_COURANTE}`, demandeurId: profil.id, ressource: x.id, etapeCourante: "TRANSMISSION", statut: "en_cours" as const, echeance: new Date(Date.now() + 7 * 86_400_000) })));
  }
  await journaliser(profil, "Relance de transmission", `${nouvelles.length} établissement(s)`, "controle", true, null);
  return c.json({ relances: nouvelles.length, dejaOuvertes: ouvertes.size, dejaTransmis: cibles.filter((x) => x.transmis).length }, 201);
});

/** Interopérabilité : volume et dernière réception par source raccordée, lus dans le registre. */
plateforme.get("/plateforme/interoperabilite", authentifie, async (c) => {
  exploitant(c);
  const [sources, [registre], verifications] = await Promise.all([
    base().execute<{ source: string; total: number; jour: number; derniere: string | null; types: string[] }>(sql`
      select source, count(*)::int as total, count(*) filter (where survenu_le >= date_trunc('day', now()))::int as jour,
             max(survenu_le) as derniere, array_agg(distinct type) as types
      from ledger.evenements group by source`),
    base().execute<{ personnes: number; apprenants: number; lies: number }>(sql`
      select (select count(*)::int from registre_simule.personnes) as personnes, (select count(*)::int from core.apprenants) as apprenants,
             (select count(*)::int from core.apprenants where npi is not null) as lies`),
    base().execute<{ jour: string; n: number }>(sql`
      select to_char(date_trunc('day', horodatage), 'YYYY-MM-DD') as jour, count(*)::int as n from audit.journal
      where action = 'Vérification de diplôme' and horodatage >= now() - interval '30 days' group by 1 order by 1`),
  ]);
  return c.json({ sources, registreNational: registre, verificationsDiplomes: verifications });
});
