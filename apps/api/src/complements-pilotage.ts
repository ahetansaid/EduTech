import type { Perimetre } from "@beile/contracts";
import type { CouchesNationales } from "@beile/simulation/macro";
import { schema } from "@beile/db";
import { ANNEE_COURANTE } from "@beile/simulation/macro";
import { aujourdhui } from "@beile/simulation/scolarite";
import { calculer, communesDuPerimetre, priorites } from "@beile/simulation/semantique";
import { communeById } from "@beile/simulation/territoire";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authentifie, base, journaliser, refuser, type Variables } from "./commun";
import { chargerCouches, memo } from "./donnees";
import { perimetrePilotage } from "./pilotage";

/**
 * Routes complémentaires de l'espace « pilotage » (ajoutées pendant le branchement du front).
 * Mêmes règles que pilotage.ts : périmètre de l'habilitation, agrégats seulement, refus journalisés,
 * calculs dérivés du cube mémoïsés par version du cube.
 */
export const complementsPilotage = new Hono<{ Variables: Variables }>();

const clePerimetre = (p: Perimetre) => JSON.stringify(p);
/** Même clé de mémo que pilotage.ts : le calcul des priorités est partagé. */
const prioritesDe = (couches: CouchesNationales) => memo(couches, "priorites", () => priorites(couches));
const IdCommune = z.string().regex(/^[a-z0-9-]{2,60}$/);

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
  const perimetre = perimetrePilotage(c.get("profil"));
  const limite = z.coerce.number().int().min(1).max(30).catch(12).parse(c.req.query("limite"));
  const autorisees = communesDuPerimetre(perimetre);
  const debut = new Date(`${aujourdhui()}T00:00:00Z`);
  const dansPerimetre = autorisees
    ? sql`${schema.evenements.etablissementId} in (select id from core.etablissements where commune_id in (select jsonb_array_elements_text(${JSON.stringify([...autorisees])}::jsonb)))`
    : undefined;
  const filtre = and(gte(schema.evenements.enregistreLe, debut), dansPerimetre);
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

/** Qualité des données de base d'une commune (planification « et si ? ») : confiance, couverture, source. */
complementsPilotage.get("/pilotage/communes/:id/contexte", authentifie, async (c) => {
  const profil = c.get("profil");
  const perimetre = perimetrePilotage(profil);
  const id = IdCommune.parse(c.req.param("id"));
  const commune = communeById.get(id);
  if (!commune) throw new HTTPException(404, { message: "Commune inconnue" });
  const autorisees = communesDuPerimetre(perimetre);
  if (autorisees && !autorisees.has(id)) {
    await journaliser(profil, "Consultation d'une commune", id, "statistique", false, "perimetre");
    refuser("Commune hors de votre périmètre : refus journalisé");
  }
  const couches = await chargerCouches(base());
  return c.json(memo(couches, `contexte-commune:${id}`, () => {
    const a = couches.communes.get(id)!.annees[ANNEE_COURANTE];
    const effectif = calculer(couches, { indicateur: "effectif_apprenants", filtres: { communeId: id }, ventilation: [] });
    return {
      communeId: id,
      annee: ANNEE_COURANTE,
      populationScolarisable: a.populationScolarisable,
      enseignantsQualifies: a.enseignantsQualifies,
      confiance: effectif.confiance,
      couverture: effectif.couverture,
      source: effectif.definition.source,
    };
  }));
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
