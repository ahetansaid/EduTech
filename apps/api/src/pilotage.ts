import type { Perimetre, Profil, RequeteSemantique } from "@beile/contracts";
import type { CouchesNationales } from "@beile/simulation/macro";
import { NIVEAUX } from "@beile/contracts";
import { schema } from "@beile/db";
import { ANNEE_COURANTE, ANNEES } from "@beile/simulation/macro";
import { aujourdhui } from "@beile/simulation/scolarite";
import { calculer, communesDuPerimetre, priorites } from "@beile/simulation/semantique";
import { communeById, departementById } from "@beile/simulation/territoire";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authentifie, base, journaliser, refuser, type Variables } from "./commun";
import { chargerCouches, memo } from "./donnees";

/**
 * Pilotage : cockpit national, console territoriale, fiche commune, planification.
 * Tout est calculé par la couche sémantique sous le PÉRIMÈTRE de l'habilitation (national, département,
 * circonscription). Aucune donnée individuelle : seulement des agrégats et des faits anonymes.
 */
export const pilotage = new Hono<{ Variables: Variables }>();

const ROLES_PILOTAGE = ["administration_centrale", "direction_departementale", "inspecteur", "chercheur"] as const;

export function perimetrePilotage(profil: Profil): Perimetre {
  const h = profil.habilitations.find((x) => (ROLES_PILOTAGE as readonly string[]).includes(x.role));
  if (!h) return refuser("Aucune habilitation de pilotage");
  return h.perimetre;
}

/** Filtre SQL « événement d'un établissement situé dans ces communes » (sous-requête, pas de liste géante de paramètres). */
const dansCommunes = (communes: Set<string>) =>
  sql`${schema.evenements.etablissementId} in (select id from core.etablissements where commune_id in (select jsonb_array_elements_text(${JSON.stringify([...communes])}::jsonb)))`;

const clePerimetre = (p: Perimetre) => JSON.stringify(p);
const prioritesDe = (couches: CouchesNationales) => memo(couches, "priorites", () => priorites(couches));

function communeAutorisee(perimetre: Perimetre, communeId: string) {
  const autorisees = communesDuPerimetre(perimetre);
  return !autorisees || autorisees.has(communeId);
}

const libellePerimetre = (p: Perimetre) =>
  p.niveau === "national" ? "National" : p.niveau === "departement" ? `Département ${departementById.get(p.departementId)?.nom ?? ""}` : p.niveau === "circonscription" ? p.circonscription : "—";

/** Synthèse du cockpit : chiffres clés, séries, parité, classement territorial, zones prioritaires, flux. */
pilotage.get("/pilotage/synthese", authentifie, async (c) => {
  const profil = c.get("profil");
  const perimetre = perimetrePilotage(profil);
  const couches = await chargerCouches(base());
  const autorisees = communesDuPerimetre(perimetre);
  // Agrégats : calculés une fois par périmètre et par version du cube, puis servis depuis la mémoire.
  const agregats = memo(couches, `synthese:${clePerimetre(perimetre)}`, () => {
    const calc = (r: Omit<RequeteSemantique, "filtres"> & { filtres?: RequeteSemantique["filtres"] }) => calculer(couches, { filtres: {}, ...r }, perimetre);
    const communes = [...couches.communes.values()].filter((x) => !autorisees || autorisees.has(x.communeId));
    const etabs = couches.etablissements.filter((e) => !autorisees || autorisees.has(e.communeId));
    return {
      nomsEtab: new Map(etabs.map((e) => [e.id, e.nom])),
      corps: {
        effectif: calc({ indicateur: "effectif_apprenants", ventilation: ["annee"] }),
        etablissements: { total: etabs.length, transmis: etabs.filter((e) => e.transmis).length },
        enseignants: communes.reduce((s, x) => s + (x.annees[ANNEE_COURANTE]?.enseignants ?? 0), 0),
        ratio: calc({ indicateur: "ratio_apprenants_enseignant", ventilation: ["annee"] }),
        bepc: calc({ indicateur: "taux_reussite_examen", filtres: { niveau: "3e" }, ventilation: ["annee"] }),
        maths: calc({ indicateur: "taux_seuil_moyenne", filtres: { matiere: "Mathématiques", seuil: 15 }, ventilation: ["annee"] }),
        mathsSexe: calc({ indicateur: "taux_seuil_moyenne", filtres: { matiere: "Mathématiques", seuil: 15 }, ventilation: ["annee", "sexe"] }),
        mathsTerritoire: calc({ indicateur: "taux_seuil_moyenne", filtres: { matiere: "Mathématiques", seuil: 15 }, ventilation: [perimetre.niveau === "national" ? "departement" : "commune"] }),
        abandon: calc({ indicateur: "taux_abandon", ventilation: ["annee"] }),
        priorites: Object.fromEntries([...prioritesDe(couches).entries()].filter(([id]) => !autorisees || autorisees.has(id))),
      },
    };
  });
  const { nomsEtab } = agregats;

  // Flux des faits enregistrés aujourd'hui dans le périmètre (anonymes : type, établissement, heure) — lu en direct.
  const debut = new Date(`${aujourdhui()}T00:00:00Z`);
  const dansPerimetre = autorisees ? dansCommunes(autorisees) : undefined;
  const [flux, [{ n: faitsDuJour } = { n: 0 }]] = await Promise.all([
    base()
      .select({ id: schema.evenements.id, type: schema.evenements.type, etablissementId: schema.evenements.etablissementId, enregistreLe: schema.evenements.enregistreLe })
      .from(schema.evenements)
      .where(and(gte(schema.evenements.enregistreLe, debut), dansPerimetre))
      .orderBy(desc(schema.evenements.enregistreLe))
      .limit(12),
    base().select({ n: sql<number>`count(*)::int` }).from(schema.evenements).where(and(gte(schema.evenements.enregistreLe, debut), dansPerimetre)),
    journaliser(profil, "Consultation du cockpit", libellePerimetre(perimetre), "statistique", true, null),
  ]);
  return c.json({
    perimetre: { ...perimetre, libelle: libellePerimetre(perimetre) },
    date: new Date().toISOString(),
    anneeScolaire: ANNEE_COURANTE,
    ...agregats.corps,
    flux: { total: faitsDuJour, derniers: flux.map((f) => ({ ...f, etablissement: f.etablissementId ? nomsEtab.get(f.etablissementId) ?? null : null })) },
  });
});

/** Valeurs d'un indicateur par commune (couches de la carte). */
pilotage.get("/pilotage/carte", authentifie, async (c) => {
  const perimetre = perimetrePilotage(c.get("profil"));
  const couche = z.enum(["maths", "ratio", "occupation", "absenteisme", "abandon"]).parse(c.req.query("couche") ?? "maths");
  const ind = { maths: "taux_seuil_moyenne", ratio: "ratio_apprenants_enseignant", occupation: "taux_occupation", absenteisme: "taux_absenteisme", abandon: "taux_abandon" } as const;
  const couches = await chargerCouches(base());
  return c.json(memo(couches, `carte:${couche}:${clePerimetre(perimetre)}`, () => {
    const r = calculer(couches, { indicateur: ind[couche], filtres: couche === "maths" ? { matiere: "Mathématiques", seuil: 15 } : {}, ventilation: ["commune"] }, perimetre);
    return { couche, definition: r.definition, confiance: r.confiance, valeurs: Object.fromEntries(r.lignes.map((l) => [l.cle, l.valeur])) };
  }));
});

/** Fiche commune : indicateurs, facteurs de priorité, établissements (localisation, capacité, transmission). */
pilotage.get("/pilotage/communes/:id", authentifie, async (c) => {
  const profil = c.get("profil");
  const perimetre = perimetrePilotage(profil);
  const id = c.req.param("id");
  const commune = communeById.get(id);
  if (!commune) throw new HTTPException(404, { message: "Commune inconnue" });
  if (!communeAutorisee(perimetre, id)) {
    await journaliser(profil, "Consultation d'une commune", id, "statistique", false, "perimetre");
    refuser("Commune hors de votre périmètre : refus journalisé");
  }
  const couches = await chargerCouches(base());
  const stats = couches.communes.get(id)!;
  const a = stats.annees[ANNEE_COURANTE];
  const effectif = NIVEAUX.reduce((s, n) => s + a.niveaux[n].effectifF + a.niveaux[n].effectifM, 0);
  const effectifs = ANNEES.map((an) => ({ annee: an, effectif: NIVEAUX.reduce((s, n) => s + stats.annees[an].niveaux[n].effectifF + stats.annees[an].niveaux[n].effectifM, 0), capacite: stats.annees[an].capacite }));
  const etabs = (couches.etablissementsParCommune.get(id) ?? []).map((e) => ({
    id: e.id, nom: e.nom, cycle: e.cycle, statut: e.statut, lat: e.lat, lng: e.lng, capacite: e.capacite, effectif: e.effectif, enseignants: e.enseignants,
    infrastructures: e.infrastructures, transmis: e.transmis, pilote: e.id.includes("PILOTE"),
  }));
  await journaliser(profil, "Consultation d'une commune", commune.nom, "statistique", true, null);
  return c.json({
    commune: { id, nom: commune.nom, departementId: commune.departementId, departement: departementById.get(commune.departementId)?.nom, milieu: commune.milieu },
    indicateurs: {
      effectif, capacite: a.capacite, occupation: (effectif / a.capacite) * 100, enseignants: a.enseignants, ratio: effectif / a.enseignants,
      enseignantsQualifies: a.enseignantsQualifies, absenteisme: a.tauxAbsenteisme * 100, abandon: a.tauxAbandon * 100,
      populationScolarisable: a.populationScolarisable, couverture: a.couverture * 100,
    },
    effectifs,
    priorite: prioritesDe(couches).get(id) ?? null,
    etablissements: etabs,
  });
});

/**
 * Console territoriale : indicateurs sous périmètre, classement des communes, établissements de la
 * circonscription (retardataires en tête) et taux d'absence du jour, calculé sur le registre.
 */
pilotage.get("/pilotage/territoire", authentifie, async (c) => {
  const profil = c.get("profil");
  const perimetre = perimetrePilotage(profil);
  if (perimetre.niveau === "national") return refuser("La console territoriale concerne un département ou une circonscription");
  const couches = await chargerCouches(base());
  const autorisees = communesDuPerimetre(perimetre)!;
  // Partie issue du cube : calculée une fois par périmètre et par version du cube.
  const statique = memo(couches, `territoire:${clePerimetre(perimetre)}`, () => {
    const calc = (r: RequeteSemantique) => calculer(couches, r, perimetre);
    const prio = prioritesDe(couches);
    const etabs = couches.etablissements.filter((e) => autorisees.has(e.communeId));
    return {
      nom: new Map(etabs.map((e) => [e.id, e.nom])),
      corps: {
        perimetre: { ...perimetre, libelle: libellePerimetre(perimetre) },
        departementId: [...autorisees].map((id) => communeById.get(id)?.departementId).find(Boolean) ?? null,
        indicateurs: {
          effectif: calc({ indicateur: "effectif_apprenants", filtres: {}, ventilation: [] }),
          occupation: calc({ indicateur: "taux_occupation", filtres: {}, ventilation: [] }),
          ratio: calc({ indicateur: "ratio_apprenants_enseignant", filtres: {}, ventilation: [] }),
          maths: calc({ indicateur: "taux_seuil_moyenne", filtres: { matiere: "Mathématiques", seuil: 15 }, ventilation: [] }),
          absenteisme: calc({ indicateur: "taux_absenteisme", filtres: {}, ventilation: [] }),
          abandon: calc({ indicateur: "taux_abandon", filtres: {}, ventilation: [] }),
        },
        communes: [...autorisees].map((id) => ({ id, nom: communeById.get(id)?.nom, priorite: prio.get(id)?.niveau ?? "favorable" })),
        etablissements: etabs
          .map((e) => ({ id: e.id, nom: e.nom, communeId: e.communeId, cycle: e.cycle, statut: e.statut, effectif: e.effectif, capacite: e.capacite, enseignants: e.enseignants, transmis: e.transmis, pilote: e.id.includes("PILOTE") }))
          .sort((a, b) => Number(a.transmis) - Number(b.transmis) || b.effectif / b.capacite - a.effectif / a.capacite)
          .slice(0, 400),
      },
    };
  });

  // Absences du jour par établissement (registre, en direct), rapportées aux effectifs de la projection.
  const jour = aujourdhui();
  const [absences, suivis] = await Promise.all([
    base()
      .select({ etablissementId: schema.evenements.etablissementId, n: sql<number>`count(*)::int`, derniere: sql<string>`max(${schema.evenements.enregistreLe})` })
      .from(schema.evenements)
      .where(and(eq(schema.evenements.type, "ABSENCE"), sql`${schema.evenements.donnees}->>'date' = ${jour}`, dansCommunes(autorisees)))
      .groupBy(schema.evenements.etablissementId),
    base()
      .select({ etablissementId: schema.scolarites.etablissementId, n: sql<number>`count(*)::int` })
      .from(schema.scolarites)
      .where(and(eq(schema.scolarites.statut, "scolarise"), sql`${schema.scolarites.etablissementId} in (select id from core.etablissements where commune_id in (select jsonb_array_elements_text(${JSON.stringify([...autorisees])}::jsonb)))`))
      .groupBy(schema.scolarites.etablissementId),
    journaliser(profil, "Consultation de la console territoriale", libellePerimetre(perimetre), "controle", true, null),
  ]);
  const parEtab = new Map(absences.map((a) => [a.etablissementId, a]));
  return c.json({
    ...statique.corps,
    absencesDuJour: suivis.filter((x) => x.etablissementId).map((x) => {
      const a = parEtab.get(x.etablissementId);
      return { etablissementId: x.etablissementId, etablissement: statique.nom.get(x.etablissementId!) ?? x.etablissementId, suivis: x.n, absents: a?.n ?? 0, taux: ((a?.n ?? 0) / Math.max(1, x.n)) * 100, derniereSaisie: a?.derniere ?? null };
    }),
    date: jour,
  });
});

/** Données de base de la planification « et si ? » d'une commune (le calcul des scénarios est explicite côté interface). */
pilotage.get("/pilotage/planification/:id", authentifie, async (c) => {
  const perimetre = perimetrePilotage(c.get("profil"));
  const id = c.req.param("id");
  if (!communeById.get(id) || !communeAutorisee(perimetre, id)) return refuser("Commune hors de votre périmètre");
  const couches = await chargerCouches(base());
  const stats = couches.communes.get(id)!;
  const serie = ANNEES.map((an) => NIVEAUX.reduce((s, n) => s + stats.annees[an].niveaux[n].effectifF + stats.annees[an].niveaux[n].effectifM, 0));
  const a = stats.annees[ANNEE_COURANTE];
  const croissanceAnnuelle = Math.pow(serie[serie.length - 1]! / serie[0]!, 1 / (serie.length - 1)) - 1;
  const saturees = [...couches.communes.values()]
    .filter((x) => communeAutorisee(perimetre, x.communeId))
    .map((x) => ({ id: x.communeId, nom: communeById.get(x.communeId)?.nom, occupation: (NIVEAUX.reduce((s, n) => s + x.annees[ANNEE_COURANTE].niveaux[n].effectifF + x.annees[ANNEE_COURANTE].niveaux[n].effectifM, 0) / x.annees[ANNEE_COURANTE].capacite) * 100 }))
    .sort((p, q) => q.occupation - p.occupation)
    .slice(0, 6);
  return c.json({
    commune: { id, nom: communeById.get(id)?.nom, milieu: stats.milieu },
    effectif: serie[serie.length - 1], capacite: a.capacite, enseignants: a.enseignants,
    etablissements: couches.etablissementsParCommune.get(id)?.length ?? 0,
    croissanceAnnuelle, serie: ANNEES.map((an, i) => ({ annee: an, effectif: serie[i] })),
    communesSaturees: saturees,
  });
});
