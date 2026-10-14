import type { Profil } from "@beile/contracts";
import { schema } from "@beile/db";
import { communesDuPerimetre } from "@beile/simulation/semantique";
import { asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authentifie, base, cleUtilisateur, comparerFr, corps, journaliser, limiteDebit, refuser, type Variables } from "./commun";
import { etablissementsDuPerimetre, habilitation } from "./visites";

/**
 * Personnels enseignants vus par la tutelle : le statut d'emploi (APE, ACE, AME, vacataire) que la plateforme ne
 * connaissait pas. Lecture pour toute la tutelle sous son périmètre ; écriture réservée à la gestion des
 * personnels (direction départementale, administration centrale), motivée et journalisée — jamais déclarée par
 * l'établissement lui-même. Aucune donnée de l'élève ici.
 */
export const personnels = new Hono<{ Variables: Variables }>();

export const STATUTS = ["ape", "ace", "ame", "vacataire"] as const;
const GESTION_PERSONNELS = ["direction_departementale", "administration_centrale"] as const;
const ID_ETAB = z.string().regex(/^ETB-[A-Za-z0-9-]+$/);
const ID_ENS = z.string().regex(/^ENS-[A-Za-z0-9-]+$/);

/** L'habilitation de gestion des personnels qui couvre cet établissement, ou rien. */
function gestionnaireDe(profil: Profil, etab: { communeId: string }) {
  return profil.habilitations.find((h) => {
    if (!(GESTION_PERSONNELS as readonly string[]).includes(h.role)) return false;
    const autorisees = communesDuPerimetre(h.perimetre);
    return autorisees ? autorisees.has(etab.communeId) : h.perimetre.niveau === "national";
  });
}

/** Répartition des statuts, école par école, sur le périmètre de tutelle (les écoles les moins renseignées d'abord). */
personnels.get("/tutelle/personnels", authentifie, limiteDebit(30, 60_000, cleUtilisateur), async (c) => {
  const profil = c.get("profil");
  const perimetre = await habilitation(profil);
  const dans = etablissementsDuPerimetre(perimetre);
  const lignes = await base().execute<{ id: string; nom: string; enseignants: number; ape: number; ace: number; ame: number; vacataire: number; non_renseigne: number }>(sql`
    select t.id, t.nom, count(e.id)::int as enseignants,
           count(*) filter (where e.statut = 'ape')::int as ape, count(*) filter (where e.statut = 'ace')::int as ace,
           count(*) filter (where e.statut = 'ame')::int as ame, count(*) filter (where e.statut = 'vacataire')::int as vacataire,
           count(e.id) filter (where e.statut is null)::int as non_renseigne
    from core.etablissements t join core.enseignants e on e.etablissement_id = t.id
    ${dans ? sql`where t.id in (${dans})` : sql``}
    group by t.id, t.nom order by non_renseigne desc, t.nom limit 300`);
  const total = lignes.reduce((s, l) => ({ enseignants: s.enseignants + l.enseignants, ape: s.ape + l.ape, ace: s.ace + l.ace, ame: s.ame + l.ame, vacataire: s.vacataire + l.vacataire, nonRenseigne: s.nonRenseigne + l.non_renseigne }),
    { enseignants: 0, ape: 0, ace: 0, ame: 0, vacataire: 0, nonRenseigne: 0 });
  await journaliser(profil, "Consultation des statuts des personnels", `${lignes.length} établissement(s)`, "controle", true, null);
  return c.json({
    perimetre, total, tronque: lignes.length === 300,
    peutModifier: profil.habilitations.some((h) => (GESTION_PERSONNELS as readonly string[]).includes(h.role)),
    etablissements: lignes.map((l) => ({ id: l.id, nom: l.nom, enseignants: l.enseignants, ape: l.ape, ace: l.ace, ame: l.ame, vacataire: l.vacataire, nonRenseigne: l.non_renseigne })),
  });
});

/** Les enseignants d'une école du périmètre, avec leur statut. */
personnels.get("/tutelle/personnels/:etablissementId", authentifie, limiteDebit(60, 60_000, cleUtilisateur), async (c) => {
  const profil = c.get("profil");
  const etablissementId = ID_ETAB.parse(c.req.param("etablissementId"));
  const perimetre = await habilitation(profil);
  const dans = etablissementsDuPerimetre(perimetre);
  const [etab] = await base().execute<{ id: string; nom: string; commune_id: string }>(sql`
    select id, nom, commune_id from core.etablissements where id = ${etablissementId} ${dans ? sql`and id in (${dans})` : sql``}`);
  if (!etab) {
    await journaliser(profil, "Consultation des personnels d'un établissement", etablissementId, "controle", false, "perimetre");
    refuser("Établissement hors de votre périmètre : refus journalisé");
  }
  const lignes = await base().select({ id: schema.enseignants.id, nom: schema.enseignants.nom, prenoms: schema.enseignants.prenoms, grade: schema.enseignants.grade, matieres: schema.enseignants.matieres, statut: schema.enseignants.statut })
    .from(schema.enseignants).where(eq(schema.enseignants.etablissementId, etablissementId)).orderBy(asc(schema.enseignants.nom));
  await journaliser(profil, "Consultation des personnels d'un établissement", etablissementId, "controle", true, null);
  return c.json({
    etablissement: { id: etab!.id, nom: etab!.nom },
    peutModifier: !!gestionnaireDe(profil, { communeId: etab!.commune_id }),
    enseignants: lignes.sort((a, b) => comparerFr(a.nom, b.nom) || comparerFr(a.prenoms, b.prenoms)),
  });
});

/** Fixer le statut d'emploi d'un enseignant : gestion des personnels couvrant son établissement, motif obligatoire. */
personnels.post("/enseignants/:id/statut", authentifie, limiteDebit(60, 60_000, cleUtilisateur), async (c) => {
  const profil = c.get("profil");
  const id = ID_ENS.parse(c.req.param("id"));
  const s = await corps(c, z.object({ statut: z.enum(STATUTS).nullable(), motif: z.string().trim().min(5).max(300) }).strict());
  const [ens] = await base().select({ id: schema.enseignants.id, statut: schema.enseignants.statut, communeId: schema.etablissements.communeId })
    .from(schema.enseignants).innerJoin(schema.etablissements, eq(schema.etablissements.id, schema.enseignants.etablissementId))
    .where(eq(schema.enseignants.id, id));
  if (!ens) throw new HTTPException(404, { message: "Enseignant inconnu" });
  if (!gestionnaireDe(profil, ens)) {
    await journaliser(profil, "Statut d'emploi d'un enseignant", id, "gestion", false, "role");
    refuser("Le statut d'emploi relève de la gestion des personnels (direction départementale, administration centrale) du territoire : refus journalisé");
  }
  await base().update(schema.enseignants).set({ statut: s.statut }).where(eq(schema.enseignants.id, id));
  await journaliser(profil, "Statut d'emploi d'un enseignant", `${id} · ${ens.statut ?? "non renseigné"} → ${s.statut ?? "non renseigné"} · ${s.motif}`, "gestion", true, null);
  return c.json({ id, statut: s.statut });
});
