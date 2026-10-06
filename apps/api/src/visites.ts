import type { Perimetre, Profil } from "@beile/contracts";
import { schema } from "@beile/db";
import { communesDuPerimetre } from "@beile/simulation/semantique";
import { aujourdhui } from "@beile/simulation/scolarite";
import { communeById, departementById } from "@beile/simulation/territoire";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authentifie, base, cleUtilisateur, corps, dateCalendaire, journaliser, limiteDebit, refuser, type Variables } from "./commun";
import { dejaSaisi, inscrireAuRegistre } from "./ecriture";
import { perimetrePilotage } from "./pilotage";

/**
 * Visites d'inspection : ce que l'agent de tutelle a vu, dans quelle école, ce qu'il recommande, et si la
 * visite annoncée a bien eu lieu. L'objet manquait aux deux métiers qui en vivent — l'inspecteur rend
 * compte, la direction départementale mesure la couverture de son territoire — et rien au registre ne le
 * portait : les faits du K-12 décrivent un apprenant, ceux du supérieur une scolarité.
 *
 * Un fait sur un établissement, jamais sur une personne. Pas de projection, pas de table nouvelle :
 * `ledger.evenements` est en ajout seul et l'écran relit les faits, comme la console territoriale relit les
 * absences du jour. Une visite ne se modifie pas : une correction est une nouvelle visite qui cite la
 * précédente dans ses constats, sinon le registre ne dirait plus ce que l'agent a vu sur le moment.
 */
export const visites = new Hono<{ Variables: Variables }>();

const ROLES_VISITE = ["inspecteur", "direction_departementale", "administration_centrale"] as const;

/**
 * Périmètre de TUTELLE, réservé aux agents de tutelle : un chercheur ne lit pas les constats d'une visite. Le
 * périmètre retenu est celui d'une habilitation de tutelle — jamais celui d'un autre rôle cumulé (un profil
 * chercheur national ET inspecteur d'une circonscription n'inspecte que sa circonscription).
 */
async function habilitation(profil: Profil): Promise<Perimetre> {
  const tutelle = profil.habilitations.filter((h) => (ROLES_VISITE as readonly string[]).includes(h.role));
  if (!tutelle.length) {
    // Porte fermée = trace : le journal promet le critère manquant pour tout accès, accordé ou refusé.
    await journaliser(profil, "Ouverture des visites d'inspection", "périmètre de tutelle", "controle", false, "role");
    refuser("Les visites d'inspection s'écrivent et se lisent entre agents de tutelle");
  }
  return perimetrePilotage({ ...profil, habilitations: tutelle });
}

const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RE_ETB = /^ETB-[A-Za-z0-9-]+$/;
/** Date du CALENDRIER (le 31 février est refusé) : une date impossible inscrite au registre, où rien ne s'efface, casserait toute lecture. */
const dateValide = dateCalendaire;
const DATE = z.string().refine(dateValide, "date du calendrier attendue (AAAA-MM-JJ)");
const ETB = z.string().regex(RE_ETB);

/**
 * « Les établissements du périmètre », rendus comme une sous-requête : une liste de communes ne devient
 * jamais une liste d'identifiants collée dans la requête, et le même filtre s'applique au fait et à sa source.
 * Un inspecteur est borné à SA circonscription (comme partout ailleurs dans l'API), pas à toute sa commune.
 */
function etablissementsDuPerimetre(perimetre: Perimetre) {
  const autorisees = communesDuPerimetre(perimetre);
  if (!autorisees) return null;
  const circonscription = perimetre.niveau === "circonscription" ? sql` and circonscription = ${perimetre.circonscription}` : sql``;
  return sql`select id from core.etablissements where commune_id in (select jsonb_array_elements_text(${JSON.stringify([...autorisees])}::jsonb))${circonscription}`;
}

/** Fait déjà inscrit (même clé de saisie), découvert dans la transaction : on rend la visite existante. */
class VisiteDejaInscrite extends Error { constructor(public id: string) { super("deja"); } }

visites.post("/visites", authentifie, limiteDebit(20, 60_000, cleUtilisateur), async (c) => {
  const profil = c.get("profil");
  const perimetre = await habilitation(profil);
  const m = await corps(c, z.object({
    etablissementId: ETB,
    dateVisite: DATE,
    objet: z.string().trim().min(5).max(200),
    constats: z.string().trim().min(10).max(4000),
    recommandations: z.string().trim().max(4000).nullish(),
    referenceRapport: z.string().trim().max(80).nullish(),
    prochaineVisiteLe: DATE.nullish(),
    /** Clé d'idempotence produite par le formulaire : un double-clic ou une réponse perdue ne double pas la visite. */
    cle: z.string().regex(/^[0-9a-f-]{16,48}$/),
  }).strict());
  if (m.dateVisite > aujourdhui()) throw new HTTPException(422, { message: "Une visite se consigne le jour même ou après : une date future n'est pas un fait" });
  if (m.prochaineVisiteLe && m.prochaineVisiteLe <= m.dateVisite) throw new HTTPException(422, { message: "La visite annoncée doit suivre la visite consignée" });

  const [etab] = await base().select({ id: schema.etablissements.id, nom: schema.etablissements.nom, communeId: schema.etablissements.communeId, circonscription: schema.etablissements.circonscription })
    .from(schema.etablissements).where(eq(schema.etablissements.id, m.etablissementId));
  if (!etab) throw new HTTPException(404, { message: "Établissement inconnu du registre" });
  const autorisees = communesDuPerimetre(perimetre);
  const horsCirconscription = perimetre.niveau === "circonscription" && etab.circonscription !== perimetre.circonscription;
  if ((autorisees && !autorisees.has(etab.communeId)) || horsCirconscription) {
    await journaliser(profil, "Visite refusée — établissement hors périmètre", etab.id, "controle", false, "perimetre");
    refuser("Cet établissement n'est pas dans votre périmètre d'inspection");
  }

  // Clé de saisie liée à l'auteur et à l'école : la même clé renvoyée pour une autre école n'en désigne pas la visite.
  const idSaisie = `VISITE-${profil.id}-${etab.id}-${m.cle}`;
  const deja = await dejaSaisi(idSaisie, "VISITE_D_INSPECTION");
  if (deja) return c.json({ id: deja[0], etablissement: etab.nom, deja: true });

  let id: string;
  try {
    [id] = await inscrireAuRegistre([{
      type: "VISITE_D_INSPECTION", auteurId: profil.id, etablissementId: etab.id, apprenantId: null, source: "beile",
      donnees: {
        etablissementId: etab.id, dateVisite: m.dateVisite, objet: m.objet, constats: m.constats,
        recommandations: m.recommandations ?? null, referenceRapport: m.referenceRapport ?? null,
        prochaineVisiteLe: m.prochaineVisiteLe ?? null, idSaisie,
      },
    }], async (tx) => {
      // Double clic, rejeu simultané : verrou sur la clé, puis contrôle DANS la transaction. L'index d'unicité
      // du registre ne protège pas ce fait (apprenant_id est NULL, et deux NULL ne se valent pas).
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${idSaisie}))`);
      const [l] = (await tx.execute(sql`select id from ledger.evenements where type = 'VISITE_D_INSPECTION' and donnees->>'idSaisie' = ${idSaisie} limit 1`)) as unknown as { id: string }[];
      if (l) throw new VisiteDejaInscrite(l.id);
    }) as [string];
  } catch (e) {
    if (e instanceof VisiteDejaInscrite) return c.json({ id: e.id, etablissement: etab.nom, deja: true });
    throw e;
  }
  await journaliser(profil, "Visite d'inspection consignée", `${etab.id} · ${m.dateVisite}`, "controle", true, null);
  return c.json({ id, etablissement: etab.nom, deja: false }, 201);
});

/**
 * Visites du périmètre, filtrables par établissement, par date et par agent. Le texte des constats ne sort
 * que pour un agent de tutelle : c'est une pièce administrative, pas une publication.
 */
visites.get("/visites", authentifie, limiteDebit(60, 60_000, cleUtilisateur), async (c) => {
  const profil = c.get("profil");
  const perimetre = await habilitation(profil);
  const etablissementId = c.req.query("etablissementId");
  const depuis = c.req.query("depuis");
  const miennes = c.req.query("miennes") === "1";
  const limite = z.coerce.number().int().min(1).max(200).catch(60).parse(c.req.query("limite"));
  if (etablissementId && !RE_ETB.test(etablissementId)) throw new HTTPException(422, { message: "Identifiant d'établissement non conforme" });
  if (depuis && !dateValide(depuis)) throw new HTTPException(422, { message: "Date de départ non conforme" });
  const dansPerimetre = etablissementsDuPerimetre(perimetre);

  const lignes = await base()
    .select({
      id: schema.evenements.id, enregistreLe: schema.evenements.survenuLe, agent: schema.profils.nomAffiche,
      etablissementId: schema.etablissements.id, etablissement: schema.etablissements.nom,
      communeId: schema.etablissements.communeId, cycle: schema.etablissements.cycle, statut: schema.etablissements.statut,
      donnees: schema.evenements.donnees,
    })
    .from(schema.evenements)
    .innerJoin(schema.etablissements, eq(schema.etablissements.id, schema.evenements.etablissementId))
    .innerJoin(schema.profils, eq(schema.profils.id, schema.evenements.auteurId))
    .where(and(
      eq(schema.evenements.type, "VISITE_D_INSPECTION"),
      etablissementId ? eq(schema.etablissements.id, etablissementId) : undefined,
      depuis ? gte(schema.evenements.survenuLe, new Date(`${depuis}T00:00:00Z`)) : undefined,
      miennes ? eq(schema.evenements.auteurId, profil.id) : undefined,
      dansPerimetre ? sql`${schema.evenements.etablissementId} in (${dansPerimetre})` : undefined,
    ))
    .orderBy(desc(schema.evenements.survenuLe))
    .limit(limite);
  // Les constats sont une pièce administrative nominative : leur lecture est tracée comme toute consultation.
  await journaliser(profil, "Consultation des visites d'inspection", etablissementId ?? (miennes ? "mes visites" : "périmètre"), "controle", true, null);
  return c.json({
    perimetre,
    lignes: lignes.map((l) => {
      const { idSaisie: _cle, ...donnees } = l.donnees as Record<string, unknown>; // la clé d'idempotence ne sort pas
      return {
        id: l.id, enregistreLe: l.enregistreLe.toISOString(), agent: l.agent,
        etablissementId: l.etablissementId, etablissement: l.etablissement, communeId: l.communeId, cycle: l.cycle, statut: l.statut,
        ...donnees,
      };
    }),
  });
});

/**
 * Couverture d'inspection : quelles écoles du périmètre ont reçu une visite, depuis quand, et lesquelles
 * attendent. Un taux de visite n'est pas un indicateur national — c'est le travail de l'agent, mesuré sur
 * son territoire ; la question qui compte, « qui n'a jamais été visité », se pose école par école.
 */
visites.get("/visites/couverture", authentifie, limiteDebit(10, 60_000, cleUtilisateur), async (c) => {
  const perimetre = await habilitation(c.get("profil"));
  const dansPerimetre = etablissementsDuPerimetre(perimetre);
  const cycle = z.enum(["tous", "primaire", "secondaire", "superieur"]).catch("tous").parse(c.req.query("cycle"));
  const limite = z.coerce.number().int().min(1).max(500).catch(200).parse(c.req.query("limite"));

  const lignes = await base().execute<{
    id: string; nom: string; commune: string | null; commune_id: string; circonscription: string; cycle: string; statut: string;
    visites: number; derniere: string | null; prochaine: string | null;
  }>(sql`
    with etabs as (
      select e.id, e.nom, e.commune_id, e.circonscription, e.cycle, e.statut, c.nom as commune
      from core.etablissements e
      left join core.communes c on c.id = e.commune_id
      where ${cycle === "tous" ? sql`true` : sql`cycle = ${cycle}`}
        ${dansPerimetre ? sql`and e.id in (${dansPerimetre})` : sql``}
    ), v as (
      select e.etablissement_id, count(*)::int as visites,
             -- Lecture défensive : une date illisible ne casse jamais la couverture (le registre ne s'efface pas).
             max(case when pg_input_is_valid(e.donnees->>'dateVisite', 'date') then (e.donnees->>'dateVisite')::date end) as derniere,
             max(case when pg_input_is_valid(e.donnees->>'prochaineVisiteLe', 'date') then (e.donnees->>'prochaineVisiteLe')::date end) as prochaine
      from ledger.evenements e
      where e.type = 'VISITE_D_INSPECTION' and e.etablissement_id in (select id from etabs)
      group by 1
    )
    select t.id, t.nom, t.commune, t.commune_id, t.circonscription, t.cycle, t.statut, coalesce(v.visites, 0)::int as visites,
           to_char(v.derniere, 'YYYY-MM-DD') as derniere, v.prochaine::text as prochaine
    from etabs t left join v on v.etablissement_id = t.id`);

  const parDepartement = new Map<string, { attendus: number; couverts: number }>();
  for (const x of lignes) {
    const cle = communeById.get(x.commune_id)?.departementId ?? "hors carte";
    const d = parDepartement.get(cle) ?? { attendus: 0, couverts: 0 };
    d.attendus += 1;
    if (x.visites > 0) d.couverts += 1;
    parDepartement.set(cle, d);
  }
  const triees = [...lignes].sort((a, b) => (a.derniere ?? "").localeCompare(b.derniere ?? "") || b.visites - a.visites || a.nom.localeCompare(b.nom, "fr"));
  return c.json({
    perimetre,
    attendus: lignes.length,
    couverts: lignes.filter((x) => x.visites > 0).length,
    visites: lignes.reduce((s, x) => s + x.visites, 0),
    parDepartement: [...parDepartement.entries()]
      .map(([id, d]) => ({ id, departement: departementById.get(id)?.nom ?? id, ...d }))
      .sort((a, b) => (b.attendus - b.couverts) - (a.attendus - a.couverts) || a.departement.localeCompare(b.departement, "fr")),
    tronque: triees.length > limite,
    etablissements: triees.slice(0, limite).map((x) => ({
      id: x.id, nom: x.nom, commune: x.commune, communeId: x.commune_id, circonscription: x.circonscription, cycle: x.cycle, statut: x.statut,
      visites: x.visites, derniereLe: x.derniere, prochaineVisiteLe: x.prochaine,
    })),
  });
});
