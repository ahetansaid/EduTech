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
  superieur: ["universite", "ecole_superieure", "institut", "ecole_nationale"],
  alphabetisation: ["centre_alphabetisation"],
} as const;
const LIBELLE_TYPE: Record<string, string> = {
  ecole_maternelle: "École maternelle", ecole_primaire: "École primaire", college: "Collège", lycee_general: "Lycée général",
  lycee_technique: "Lycée technique", centre_formation_professionnelle: "Centre de formation professionnelle",
  centre_alphabetisation: "Centre d'alphabétisation", universite: "Université", ecole_superieure: "École supérieure", centre_examen: "Centre d'examen",
  institut: "Institut", ecole_nationale: "École nationale",
};
const typesPublics = Object.values(NIVEAUX).flat() as string[];

const lat = sql<number>`ST_Y(${schema.etablissements.position})`;
const lng = sql<number>`ST_X(${schema.etablissements.position})`;
const libelleLieu = (communeId: string) => {
  const c = communeById.get(communeId);
  return { commune: c?.nom ?? communeId, departementId: c?.departementId ?? null, departement: c ? departementById.get(c.departementId)?.nom ?? null : null };
};

/**
 * Annuaire public : le référentiel RÉEL des établissements (sources officielles des ministères et
 * cartographie OpenStreetMap), jamais le jeu de démonstration du pilotage. Recherche par nom ou sigle,
 * lieu, niveau, statut ; ou « autour de moi » (distance PostGIS, index GiST) — seuls les établissements
 * dont la position est connue ont une distance.
 */
const R = schema.referentielEtablissements;
const latR = sql<number | null>`ST_Y(${R.position})`;
const lngR = sql<number | null>`ST_X(${R.position})`;
const NIVEAUX_REF = ["maternelle", "primaire", "secondaire", "technique", "superieur"] as const;
const cycleDe = (niveaux: string[]) => (niveaux.includes("superieur") ? "superieur" : niveaux.includes("secondaire") || niveaux.includes("technique") ? "secondaire" : niveaux.length ? "primaire" : null);
const lieu = (communeId: string | null) => (communeId ? libelleLieu(communeId) : { commune: null, departementId: null, departement: null });

publique.get("/public/etablissements", async (c) => {
  const f = z.object({
    q: z.string().trim().max(60).optional(),
    departement: z.string().regex(/^[a-z-]+$/).optional(),
    commune: z.string().regex(/^[a-z0-9-]+$/).optional(),
    niveau: z.enum([...NIVEAUX_REF, "alphabetisation"]).optional(),
    statut: z.enum(["public", "prive", "confessionnel", "communautaire"]).optional(),
    lat: z.coerce.number().min(5.5).max(13).optional(),
    lng: z.coerce.number().min(0.5).max(4.2).optional(),
    page: z.coerce.number().int().min(1).max(200).default(1),
  }).parse(c.req.query());
  const pres = f.lat !== undefined && f.lng !== undefined;
  const communesDep = f.departement ? [...communeById.values()].filter((x) => x.departementId === f.departement).map((x) => x.id) : null;
  const motif = f.q ? `%${f.q.replace(/[%_\\]/g, "")}%` : null;
  const conditions: (SQL | undefined)[] = [
    f.niveau ? sql`${f.niveau} = any(${R.niveaux})` : undefined,
    motif ? sql`(${R.nom} ilike ${motif} or coalesce(${R.sigle}, '') ilike ${motif})` : undefined,
    f.commune ? eq(R.communeId, f.commune) : undefined,
    communesDep ? inArray(R.communeId, communesDep.length ? communesDep : ["-"]) : undefined,
    f.statut ? eq(R.statut, f.statut) : undefined,
    pres ? sql`${R.position} is not null` : undefined,
  ];
  const where = and(...conditions);
  const PAR_PAGE = 24;
  const ici = pres ? sql`ST_SetSRID(ST_MakePoint(${f.lng}, ${f.lat}), 4326)` : null;
  const [lignes, [{ n: total } = { n: 0 }]] = await Promise.all([
    base()
      .select({
        id: R.id, nom: R.nom, sigle: R.sigle, type: R.type, typeLibelle: R.typeLibelle, niveaux: R.niveaux, statut: R.statut,
        communeId: R.communeId, preuve: R.preuve, lat: latR, lng: lngR,
        distanceKm: ici ? sql<number>`round((ST_Distance(${R.position}::geography, ${ici}::geography) / 1000)::numeric, 1)::float8` : sql<null>`null`,
      })
      .from(R)
      .where(where)
      .orderBy(ici ? sql`${R.position} <-> ${ici}` : R.nom)
      .limit(PAR_PAGE)
      .offset((f.page - 1) * PAR_PAGE),
    base().select({ n: count() }).from(R).where(where),
  ]);
  c.header("Cache-Control", "public, max-age=60, s-maxage=300");
  return c.json({
    total, page: f.page, parPage: PAR_PAGE,
    etablissements: lignes.map((e) => ({ ...e, cycle: cycleDe(e.niveaux), ...lieu(e.communeId) })),
  });
});

/** Fiche publique : identité, lieu, rattachement, et d'où vient l'information (source, niveau de preuve). */
publique.get("/public/etablissements/:id", async (c) => {
  const id = z.string().regex(/^REF-[A-Za-z0-9-]+$/).parse(c.req.param("id"));
  const [e] = await base()
    .select({
      id: R.id, nom: R.nom, sigle: R.sigle, type: R.type, typeLibelle: R.typeLibelle, niveaux: R.niveaux, statut: R.statut,
      communeId: R.communeId, rattachement: R.rattachement, source: R.source, preuve: R.preuve, remarque: R.remarque, lat: latR, lng: lngR,
    })
    .from(R).where(eq(R.id, id));
  if (!e) throw new HTTPException(404, { message: "Établissement introuvable" });
  c.header("Cache-Control", "public, max-age=300, s-maxage=900");
  return c.json({ ...e, cycle: cycleDe(e.niveaux), ...lieu(e.communeId) });
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

/**
 * Calendrier scolaire public. Sans paramètre : l'année en cours (celle qui contient aujourd'hui),
 * sinon la prochaine, sinon la plus récente. Les dates provisoires sont signalées comme telles.
 */
publique.get("/public/calendrier", async (c) => {
  const annee = z.string().regex(/^\d{4}-\d{4}$/).optional().parse(c.req.query("annee"));
  const toutes = await base().select().from(schema.calendrier).orderBy(schema.calendrier.debut);
  const annees = [...new Set(toutes.map((e) => e.annee))].sort();
  const auj = new Date().toISOString().slice(0, 10);
  const bornes = (a: string) => { const l = toutes.filter((e) => e.annee === a); return { debut: l[0]?.debut ?? "", fin: l.reduce((m, e) => (e.fin > m ? e.fin : m), "") }; };
  const choisie = annee && annees.includes(annee) ? annee
    : annees.find((a) => { const b = bornes(a); return b.debut <= auj && auj <= b.fin; })
      ?? annees.find((a) => bornes(a).debut > auj) ?? annees[annees.length - 1] ?? null;
  c.header("Cache-Control", "public, max-age=120, s-maxage=300");
  return c.json({
    aujourdhui: auj, annees, annee: choisie,
    evenements: toutes.filter((e) => e.annee === choisie).map(({ majPar: _m, ...e }) => e),
  });
});

/* ------------------------------------------------------------------ Catalogue public du supérieur
 * L'offre de formation est une information publique : un élève de terminale s'oriente dessus, une
 * famille vérifie qu'une filière est habilitée avant d'y inscrire son enfant. Référentiel seul, aucune
 * donnée nominative ; le détail d'un effectif reste sous la porte de l'établissement.
 */

publique.get("/public/superieur/filieres", async (c) => {
  const f = z.object({
    voie: z.string().max(30).optional(), domaine: z.string().max(40).optional(), etablissementId: z.string().regex(/^ETB-[A-Za-z0-9-]+$/).optional(),
  }).parse(c.req.query());
  const lignes = await base().select({
    filiere: schema.filiereSuperieure,
    etablissement: { id: schema.etablissements.id, nom: schema.etablissements.nom, sigle: schema.etablissements.sigle, communeId: schema.etablissements.communeId, statut: schema.etablissements.statut, rattachementId: schema.etablissements.rattachementId },
    homologation: schema.homologationsFiliere.statut,
  }).from(schema.filiereSuperieure)
    .innerJoin(schema.etablissements, eq(schema.etablissements.id, schema.filiereSuperieure.etablissementId))
    .leftJoin(schema.homologationsFiliere, and(eq(schema.homologationsFiliere.filiereId, schema.filiereSuperieure.id), eq(schema.homologationsFiliere.etablissementId, schema.filiereSuperieure.etablissementId)))
    .where(and(
      ...(f.voie ? [eq(schema.filiereSuperieure.voie, f.voie as never)] : []),
      ...(f.domaine ? [eq(schema.filiereSuperieure.domaine, f.domaine as never)] : []),
      ...(f.etablissementId ? [eq(schema.filiereSuperieure.etablissementId, f.etablissementId)] : []),
    ))
    .orderBy(schema.filiereSuperieure.nom);
  c.header("Cache-Control", "public, max-age=300");
  return c.json(lignes.map(({ filiere, etablissement, homologation }) => ({
    ...filiere,
    etablissement: { ...etablissement, ...libelleLieu(etablissement.communeId) },
    // Habilitée = homologation accordée : sans elle, le diplôme national n'est pas opposable.
    habilitee: homologation === "accordee",
  })));
});

publique.get("/public/superieur/etablissements", async (c) => {
  const lignes = await base().select({
    id: schema.etablissements.id, nom: schema.etablissements.nom, sigle: schema.etablissements.sigle, type: schema.etablissements.typeInstitution,
    statut: schema.etablissements.statut, tutelles: schema.etablissements.tutelles, rattachementId: schema.etablissements.rattachementId,
    communeId: schema.etablissements.communeId, lat, lng, // Colonne extérieure qualifiée : non qualifiée, `id` se résoudrait sur la table de la sous-requête.
    filieres: sql<number>`(select count(*)::int from core.filiere_superieure f where f.etablissement_id = "etablissements"."id")`,
  }).from(schema.etablissements).where(eq(schema.etablissements.cycle, "superieur")).orderBy(schema.etablissements.nom);
  c.header("Cache-Control", "public, max-age=300");
  return c.json(lignes.map((e) => ({ ...e, lat: Number(e.lat), lng: Number(e.lng), libelleType: LIBELLE_TYPE[e.type] ?? e.type, ...libelleLieu(e.communeId) })));
});

publique.get("/public/superieur/concours", async (c) => {
  const lignes = await base().select({
    concours: schema.concoursSession, filiere: { id: schema.filiereSuperieure.id, nom: schema.filiereSuperieure.nom },
    etablissement: { id: schema.etablissements.id, nom: schema.etablissements.nom, sigle: schema.etablissements.sigle },
  }).from(schema.concoursSession)
    .innerJoin(schema.filiereSuperieure, eq(schema.filiereSuperieure.id, schema.concoursSession.filiereId))
    .innerJoin(schema.etablissements, eq(schema.etablissements.id, schema.filiereSuperieure.etablissementId))
    .orderBy(sql`${schema.concoursSession.session} desc`, schema.concoursSession.nom);
  c.header("Cache-Control", "public, max-age=300");
  return c.json(lignes.map(({ concours, filiere, etablissement }) => ({ ...concours, filiere, etablissement })));
});
