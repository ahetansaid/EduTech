import { schema } from "@beile/db";
import { calculer } from "@beile/simulation/semantique";
import { communeById, departementById } from "@beile/simulation/territoire";
import { and, count, eq, ilike, inArray, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { base, limiteDebit, type Variables } from "./commun";
import { chargerCouches, memo } from "./donnees";

/**
 * Services publics, sans compte : annuaire des établissements et chiffres agrégés de l'éducation.
 * Lecture seule, aucune donnée personnelle (établissements et agrégats uniquement), débit limité par adresse.
 */
export const publique = new Hono<{ Variables: Variables }>();
publique.use("/public/*", limiteDebit(120, 60_000));

/** Niveaux lisibles par les familles → types d'institution du référentiel. */
const NIVEAUX = {
  maternelle: ["ecole_maternelle"],
  primaire: ["ecole_primaire"],
  secondaire: ["college", "lycee_general"],
  technique: ["lycee_technique", "centre_formation_professionnelle"],
  superieur: ["universite", "ecole_superieure"],
  alphabetisation: ["centre_alphabetisation"],
} as const;
const LIBELLE_TYPE: Record<string, string> = {
  ecole_maternelle: "École maternelle", ecole_primaire: "École primaire", college: "Collège", lycee_general: "Lycée général",
  lycee_technique: "Lycée technique", centre_formation_professionnelle: "Centre de formation professionnelle",
  centre_alphabetisation: "Centre d'alphabétisation", universite: "Université", ecole_superieure: "École supérieure", centre_examen: "Centre d'examen",
};
const typesPublics = Object.values(NIVEAUX).flat() as string[];

const lat = sql<number>`ST_Y(${schema.etablissements.position})`;
const lng = sql<number>`ST_X(${schema.etablissements.position})`;
const libelleLieu = (communeId: string) => {
  const c = communeById.get(communeId);
  return { commune: c?.nom ?? communeId, departementId: c?.departementId ?? null, departement: c ? departementById.get(c.departementId)?.nom ?? null : null };
};

/** Annuaire : recherche par nom, lieu, niveau, statut ; ou « autour de moi » (distance PostGIS, index GiST). */
publique.get("/public/etablissements", async (c) => {
  const f = z.object({
    q: z.string().trim().max(60).optional(),
    departement: z.string().regex(/^[a-z-]+$/).optional(),
    commune: z.string().regex(/^[a-z0-9-]+$/).optional(),
    niveau: z.enum(Object.keys(NIVEAUX) as [keyof typeof NIVEAUX, ...(keyof typeof NIVEAUX)[]]).optional(),
    statut: z.enum(["public", "prive", "confessionnel", "communautaire"]).optional(),
    lat: z.coerce.number().min(5.5).max(13).optional(),
    lng: z.coerce.number().min(0.5).max(4.2).optional(),
    page: z.coerce.number().int().min(1).max(200).default(1),
  }).parse(c.req.query());
  const pres = f.lat !== undefined && f.lng !== undefined;
  const communesDep = f.departement ? [...communeById.values()].filter((x) => x.departementId === f.departement).map((x) => x.id) : null;
  const conditions: (SQL | undefined)[] = [
    inArray(schema.etablissements.typeInstitution, (f.niveau ? [...NIVEAUX[f.niveau]] : typesPublics) as (typeof schema.etablissements.typeInstitution.enumValues)[number][]),
    f.q ? ilike(schema.etablissements.nom, `%${f.q.replace(/[%_\\]/g, "")}%`) : undefined,
    f.commune ? eq(schema.etablissements.communeId, f.commune) : undefined,
    communesDep ? inArray(schema.etablissements.communeId, communesDep.length ? communesDep : ["-"]) : undefined,
    f.statut ? eq(schema.etablissements.statut, f.statut) : undefined,
  ];
  const where = and(...conditions);
  const PAR_PAGE = 24;
  const ici = pres ? sql`ST_SetSRID(ST_MakePoint(${f.lng}, ${f.lat}), 4326)` : null;
  const [lignes, [{ n: total } = { n: 0 }]] = await Promise.all([
    base()
      .select({
        id: schema.etablissements.id, nom: schema.etablissements.nom, type: schema.etablissements.typeInstitution, statut: schema.etablissements.statut,
        cycle: schema.etablissements.cycle, communeId: schema.etablissements.communeId, lat, lng,
        distanceKm: ici ? sql<number>`round((ST_Distance(${schema.etablissements.position}::geography, ${ici}::geography) / 1000)::numeric, 1)::float8` : sql<null>`null`,
      })
      .from(schema.etablissements)
      .where(where)
      .orderBy(ici ? sql`${schema.etablissements.position} <-> ${ici}` : schema.etablissements.nom)
      .limit(PAR_PAGE)
      .offset((f.page - 1) * PAR_PAGE),
    base().select({ n: count() }).from(schema.etablissements).where(where),
  ]);
  c.header("Cache-Control", "public, max-age=60, s-maxage=300");
  return c.json({
    total, page: f.page, parPage: PAR_PAGE,
    etablissements: lignes.map((e) => ({ ...e, typeLibelle: LIBELLE_TYPE[e.type] ?? e.type, ...libelleLieu(e.communeId) })),
  });
});

/** Fiche publique d'un établissement : identité, lieu, capacité d'accueil, équipements. */
publique.get("/public/etablissements/:id", async (c) => {
  const id = z.string().regex(/^ETB-[A-Z0-9-]+$/).parse(c.req.param("id"));
  const [e] = await base()
    .select({
      id: schema.etablissements.id, nom: schema.etablissements.nom, type: schema.etablissements.typeInstitution, statut: schema.etablissements.statut,
      cycle: schema.etablissements.cycle, gestionnaire: schema.etablissements.gestionnaire, communeId: schema.etablissements.communeId,
      circonscription: schema.etablissements.circonscription, capacite: schema.etablissements.capacite, salles: schema.etablissements.sallesDeClasse,
      infrastructures: schema.etablissements.infrastructures, lat, lng,
    })
    .from(schema.etablissements)
    .where(and(eq(schema.etablissements.id, id), inArray(schema.etablissements.typeInstitution, typesPublics as (typeof schema.etablissements.typeInstitution.enumValues)[number][])));
  if (!e) throw new HTTPException(404, { message: "Établissement introuvable" });
  c.header("Cache-Control", "public, max-age=300, s-maxage=900");
  return c.json({ ...e, typeLibelle: LIBELLE_TYPE[e.type] ?? e.type, ...libelleLieu(e.communeId) });
});

/** L'éducation en chiffres : quelques indicateurs par département, avec définition, source et indice de confiance. */
publique.get("/public/chiffres", async (c) => {
  const couches = await chargerCouches(base());
  c.header("Cache-Control", "public, max-age=300, s-maxage=900");
  return c.json(memo(couches, "public:chiffres", () => {
    const INDICATEURS = [
      { cle: "effectif", requete: { indicateur: "effectif_apprenants", filtres: {} } },
      { cle: "ratio", requete: { indicateur: "ratio_apprenants_enseignant", filtres: {} } },
      { cle: "occupation", requete: { indicateur: "taux_occupation", filtres: {} } },
      { cle: "bepc", requete: { indicateur: "taux_reussite_examen", filtres: { niveau: "3e" } } },
    ] as const;
    return {
      indicateurs: INDICATEURS.map(({ cle, requete }) => {
        const national = calculer(couches, { ...requete, ventilation: [] } as never);
        const parDep = calculer(couches, { ...requete, ventilation: ["departement"] } as never);
        return {
          cle, nom: national.definition.nom, definition: national.definition.definition, unite: national.definition.unite,
          periode: national.periode, source: national.definition.source, confiance: national.confiance.score, valeur: national.valeur,
          departements: parDep.lignes.map((l) => ({ id: l.cle, nom: departementById.get(l.cle)?.nom ?? l.libelle, valeur: l.valeur })),
        };
      }),
    };
  }));
});
