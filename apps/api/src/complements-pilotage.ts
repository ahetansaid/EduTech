import type { Perimetre } from "@beile/contracts";
import type { CouchesNationales } from "@beile/simulation/macro";
import { schema } from "@beile/db";
import { aujourdhui } from "@beile/simulation/scolarite";
import { calculer, communesDuPerimetre, priorites } from "@beile/simulation/semantique";
import { detecterAlertes } from "@beile/simulation/alertes";
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authentifie, base, corps, journaliser, refuser, type Variables } from "./commun";
import { chargerCouches, memo } from "./donnees";
import { filtreFluxDuProfil, perimetrePilotage, ROLES_TUTELLE } from "./pilotage";

/**
 * Routes complémentaires de l'espace « pilotage » (ajoutées pendant le branchement du front).
 * Mêmes règles que pilotage.ts : périmètre de l'habilitation, agrégats seulement, refus journalisés,
 * calculs dérivés du cube mémoïsés par version du cube.
 */
export const complementsPilotage = new Hono<{ Variables: Variables }>();

const clePerimetre = (p: Perimetre) => JSON.stringify(p);
/** Même clé de mémo que pilotage.ts : le calcul des priorités est partagé. */
const prioritesDe = (couches: CouchesNationales) => memo(couches, "priorites", () => priorites(couches));

/**
 * Alertes territoriales détectées automatiquement (écarts nets aux pairs, décrochages d'une année sur
 * l'autre), dans le sens défavorable de chaque indicateur, restreintes au périmètre de l'habilitation.
 * Fonction pure du cube : mémoïsée par version du cube et périmètre.
 */
complementsPilotage.get("/pilotage/alertes", authentifie, async (c) => {
  const profil = c.get("profil");
  const perimetre = perimetrePilotage(profil);
  const couches = await chargerCouches(base());
  const reponse = memo(couches, `alertes:${clePerimetre(perimetre)}`, () => detecterAlertes(couches, perimetre));
  // Le suivi n'est pas mémoïsé : il change à chaque prise en charge, et il est propre à la base, pas au cube.
  const ids = reponse.alertes.map((a) => a.id);
  const suivis = ids.length ? await base().select({ d: schema.demandes, par: schema.profils.nomAffiche }).from(schema.demandes)
    .leftJoin(schema.profils, eq(schema.profils.id, schema.demandes.demandeurId))
    .where(and(eq(schema.demandes.modele, "SUIVI_ALERTE"), inArray(schema.demandes.ressource, ids)))
    .orderBy(desc(schema.demandes.creeeLe)) : [];
  const parAlerte = new Map<string, (typeof suivis)[number]>();
  for (const s of suivis) if (s.d.ressource && !parAlerte.has(s.d.ressource)) parAlerte.set(s.d.ressource, s);
  const maintenant = Date.now();
  const peutSuivre = profil.habilitations.some((h) => (ROLES_TUTELLE as readonly string[]).includes(h.role));
  return c.json({
    ...reponse,
    peutSuivre,
    // Hors tutelle (chercheur), seul l'état du suivi est rendu : la note d'intention (« visite prévue au CEG X »)
    // et le nom de l'agent relèvent de la tutelle, comme les visites retirées de son flux.
    suivis: Object.fromEntries([...parAlerte].map(([id, s]) => [id, {
      demandeId: peutSuivre ? s.d.id : null, statut: s.d.statut, priseEnChargePar: peutSuivre ? s.par ?? null : null, le: s.d.creeeLe.toISOString(),
      echeance: s.d.echeance?.toISOString() ?? null,
      enRetard: ["ouverte", "en_cours"].includes(s.d.statut) && !!s.d.echeance && s.d.echeance.getTime() < maintenant,
      note: peutSuivre ? (s.d.donnees as { note?: string } | null)?.note ?? null : null,
    }])),
  });
});

/* ------------------------------------------------------------------ Suivi d'une alerte : voir → agir → suivre */

const MODELE_SUIVI = {
  code: "SUIVI_ALERTE", libelle: "Suivi d'une alerte territoriale", version: "1.0",
  etapes: [{ ordre: 1, code: "TRAITEMENT", role: "inspecteur", delaiJours: 30 }],
};

/** Habilitation de tutelle qui couvre cette commune, ou rien : le chercheur lit les alertes, il ne les traite pas. */
function tutelleSur(profil: Variables["profil"], communeId: string) {
  return profil.habilitations.find((h) => {
    if (!(ROLES_TUTELLE as readonly string[]).includes(h.role)) return false;
    const autorisees = communesDuPerimetre(h.perimetre);
    return autorisees ? autorisees.has(communeId) : h.perimetre.niveau === "national";
  });
}

/**
 * Prendre une alerte en charge : un suivi daté, avec une note d'intention et une échéance, au nom de l'agent.
 * L'alerte doit figurer parmi celles que le cube détecte AUJOURD'HUI dans le périmètre (on ne suit pas une
 * alerte inventée), et une seule prise en charge reste ouverte par alerte.
 */
complementsPilotage.post("/pilotage/alertes/suivi", authentifie, async (c) => {
  const profil = c.get("profil");
  const s = await corps(c, z.object({
    alerteId: z.string().regex(/^[a-z0-9_]+\|[a-z0-9-]+\|(ecart|rupture)$/),
    note: z.string().trim().min(5).max(500),
    echeanceJours: z.number().int().min(7).max(90).default(30),
  }).strict());
  const perimetre = perimetrePilotage(profil);
  const couches = await chargerCouches(base());
  const alerte = memo(couches, `alertes:${clePerimetre(perimetre)}`, () => detecterAlertes(couches, perimetre)).alertes.find((a) => a.id === s.alerteId);
  if (!alerte) throw new HTTPException(404, { message: "Alerte introuvable dans votre périmètre (elle a pu disparaître avec la dernière mise à jour des données)" });
  if (!tutelleSur(profil, alerte.communeId)) {
    await journaliser(profil, "Prise en charge d'une alerte", s.alerteId, "controle", false, "role");
    refuser("Le suivi d'une alerte relève de la tutelle de la commune : refus journalisé");
  }
  const id = `DEM-${randomUUID()}`;
  await base().insert(schema.modelesCircuit).values(MODELE_SUIVI).onConflictDoNothing();
  await base().transaction(async (tx) => {
    // Une seule prise en charge ouverte par alerte, même sous deux clics simultanés.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`suivi:${s.alerteId}`}))`);
    const [ouverte] = await tx.select({ id: schema.demandes.id }).from(schema.demandes)
      .where(and(eq(schema.demandes.modele, "SUIVI_ALERTE"), eq(schema.demandes.ressource, s.alerteId), inArray(schema.demandes.statut, ["ouverte", "en_cours"])));
    if (ouverte) throw new HTTPException(409, { message: "Cette alerte est déjà prise en charge" });
    await tx.insert(schema.demandes).values({
      id, modele: "SUIVI_ALERTE", objet: `${alerte.indicateur} · ${alerte.commune}`, demandeurId: profil.id, ressource: s.alerteId,
      donnees: { communeId: alerte.communeId, indicateur: alerte.indicateur, type: alerte.type, valeur: alerte.valeur, reference: alerte.reference, note: s.note },
      etapeCourante: "TRAITEMENT", statut: "en_cours", echeance: new Date(Date.now() + s.echeanceJours * 86_400_000),
    });
  });
  await journaliser(profil, "Prise en charge d'une alerte", `${s.alerteId} · échéance ${s.echeanceJours} j`, "controle", true, null);
  return c.json({ demandeId: id }, 201);
});

/** Clore un suivi : traité (avec le constat de ce qui a été fait) ou sans suite (motivé). Ajout seul. */
complementsPilotage.post("/pilotage/alertes/suivi/:id/cloture", authentifie, async (c) => {
  const profil = c.get("profil");
  const demandeId = z.string().regex(/^DEM-[A-Za-z0-9-]+$/).parse(c.req.param("id"));
  const s = await corps(c, z.object({ issue: z.enum(["traitee", "sans_suite"]), constat: z.string().trim().min(10).max(1000) }).strict());
  const [d] = await base().select().from(schema.demandes).where(and(eq(schema.demandes.id, demandeId), eq(schema.demandes.modele, "SUIVI_ALERTE")));
  if (!d) throw new HTTPException(404, { message: "Suivi introuvable" });
  const communeId = (d.donnees as { communeId?: string } | null)?.communeId ?? "";
  if (!tutelleSur(profil, communeId)) {
    await journaliser(profil, "Clôture du suivi d'une alerte", demandeId, "controle", false, "perimetre");
    refuser("Ce suivi relève de la tutelle d'une autre commune : refus journalisé");
  }
  const [clos] = await base().update(schema.demandes).set({ statut: s.issue === "traitee" ? "acceptee" : "refusee" })
    .where(and(eq(schema.demandes.id, demandeId), inArray(schema.demandes.statut, ["ouverte", "en_cours"]))).returning({ id: schema.demandes.id });
  if (!clos) throw new HTTPException(409, { message: "Ce suivi est déjà clos" });
  await base().insert(schema.decisions).values({ id: `DEC-${randomUUID()}`, demandeId, etape: "TRAITEMENT", auteurId: profil.id, decision: s.issue === "traitee" ? "valide" : "refuse", motif: s.constat });
  await journaliser(profil, "Clôture du suivi d'une alerte", `${demandeId} · ${s.issue}`, "controle", true, null);
  return c.json({ demandeId, statut: s.issue === "traitee" ? "acceptee" : "refusee" });
});

/** Niveaux d'alerte et facteurs, restreints aux communes du périmètre (la carte « Où agir ? » n'affiche que ce qu'on peut ouvrir). */
complementsPilotage.get("/pilotage/priorites", authentifie, async (c) => {
  const perimetre = perimetrePilotage(c.get("profil"));
  const couches = await chargerCouches(base());
  return c.json(memo(couches, `priorites-perimetre:${clePerimetre(perimetre)}`, () => {
    const autorisees = communesDuPerimetre(perimetre);
    return {
      perimetre,
      communes: Object.fromEntries([...prioritesDe(couches).entries()].filter(([id]) => !autorisees || autorisees.has(id))),
    };
  }));
});

/**
 * Flux des faits du jour (léger, rafraîchi toutes les 15 s par le cockpit) : aucun agrégat du cube,
 * seulement des faits anonymes du registre (type, établissement, heure), sous le périmètre.
 */
complementsPilotage.get("/pilotage/flux", authentifie, async (c) => {
  const profil = c.get("profil");
  const perimetre = perimetrePilotage(profil);
  const limite = z.coerce.number().int().min(1).max(30).catch(12).parse(c.req.query("limite"));
  const autorisees = communesDuPerimetre(perimetre);
  const debut = new Date(`${aujourdhui()}T00:00:00Z`);
  const dansPerimetre = autorisees
    ? sql`${schema.evenements.etablissementId} in (select id from core.etablissements where commune_id in (select jsonb_array_elements_text(${JSON.stringify([...autorisees])}::jsonb)))`
    : undefined;
  const filtre = and(gte(schema.evenements.enregistreLe, debut), dansPerimetre, filtreFluxDuProfil(profil));
  const [derniers, parType] = await Promise.all([
    base()
      .select({ id: schema.evenements.id, type: schema.evenements.type, etablissementId: schema.evenements.etablissementId, etablissement: schema.etablissements.nom, source: schema.evenements.source, enregistreLe: schema.evenements.enregistreLe })
      .from(schema.evenements)
      .leftJoin(schema.etablissements, eq(schema.etablissements.id, schema.evenements.etablissementId))
      .where(filtre)
      .orderBy(desc(schema.evenements.enregistreLe))
      .limit(limite),
    base()
      .select({ type: schema.evenements.type, n: sql<number>`count(*)::int` })
      .from(schema.evenements)
      .where(filtre)
      .groupBy(schema.evenements.type),
  ]);
  return c.json({
    date: aujourdhui(),
    horodatage: new Date().toISOString(),
    total: parType.reduce((s, x) => s + x.n, 0),
    parType: parType.sort((a, b) => b.n - a.n),
    derniers,
  });
});

/**
 * Compléments de la console territoriale : références nationales (pour situer le territoire) et,
 * pour une circonscription, infrastructures déclarées de ses établissements (référentiel).
 */
complementsPilotage.get("/pilotage/territoire/complements", authentifie, async (c) => {
  const perimetre = perimetrePilotage(c.get("profil"));
  if (perimetre.niveau === "national") return refuser("La console territoriale concerne un département ou une circonscription");
  const couches = await chargerCouches(base());
  const references = memo(couches, "references-nationales", () => ({
    maths: calculer(couches, { indicateur: "taux_seuil_moyenne", filtres: { matiere: "Mathématiques", seuil: 15 }, ventilation: [] }).valeur,
    ratio: calculer(couches, { indicateur: "ratio_apprenants_enseignant", filtres: {}, ventilation: [] }).valeur,
    occupation: calculer(couches, { indicateur: "taux_occupation", filtres: {}, ventilation: [] }).valeur,
    absenteisme: calculer(couches, { indicateur: "taux_absenteisme", filtres: {}, ventilation: [] }).valeur,
  }));
  const etablissements = perimetre.niveau === "circonscription"
    ? memo(couches, `territoire-etabs:${clePerimetre(perimetre)}`, () => {
      const autorisees = communesDuPerimetre(perimetre)!;
      return couches.etablissements
        .filter((e) => autorisees.has(e.communeId))
        .map((e) => ({ id: e.id, infrastructures: e.infrastructures }));
    })
    : [];
  return c.json({ references, etablissements });
});

/**
 * Absences du jour par établissement du territoire (registre, en direct) : version légère de la partie
 * « absencesDuJour » de /pilotage/territoire, rafraîchie toutes les 30 s par la console sans rejouer
 * le calcul du cube ni réécrire une ligne de journal à chaque rafraîchissement.
 */
complementsPilotage.get("/pilotage/territoire/absences", authentifie, async (c) => {
  const perimetre = perimetrePilotage(c.get("profil"));
  if (perimetre.niveau === "national") return refuser("La console territoriale concerne un département ou une circonscription");
  const autorisees = JSON.stringify([...communesDuPerimetre(perimetre)!]);
  const jour = aujourdhui();
  const rangs = await base().execute<{ etablissement_id: string; nom: string; suivis: number; absents: number; derniere: string | Date | null }>(sql`
    with suivis as (
      select s.etablissement_id, count(*)::int as n from core.scolarites s
      where s.statut = 'scolarise' and s.etablissement_id in (select id from core.etablissements where commune_id in (select jsonb_array_elements_text(${autorisees}::jsonb)))
      group by 1
    ), absences as (
      select v.etablissement_id, count(*)::int as n, max(v.enregistre_le) as derniere from ledger.evenements v
      where v.type = 'ABSENCE' and v.donnees->>'date' = ${jour}
        and v.etablissement_id in (select id from core.etablissements where commune_id in (select jsonb_array_elements_text(${autorisees}::jsonb)))
      group by 1
    )
    select s.etablissement_id, e.nom, s.n as suivis, coalesce(a.n, 0)::int as absents, a.derniere
    from suivis s join core.etablissements e on e.id = s.etablissement_id left join absences a on a.etablissement_id = s.etablissement_id`);
  return c.json({
    date: jour,
    horodatage: new Date().toISOString(),
    etablissements: [...rangs]
      .map((x) => ({
        etablissementId: x.etablissement_id, etablissement: x.nom, suivis: x.suivis, absents: x.absents,
        taux: (x.absents / Math.max(1, x.suivis)) * 100, derniereSaisie: x.derniere ? new Date(x.derniere).toISOString() : null,
      }))
      .sort((a, b) => b.taux - a.taux || a.etablissement.localeCompare(b.etablissement, "fr")),
  });
});
