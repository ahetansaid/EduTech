import { MATIERES } from "@beile/contracts";
import { schema } from "@beile/db";
import { aujourdhui } from "@beile/simulation/scolarite";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authentifie, base, comparerFr, corps, journaliser, refuser, type Variables } from "./commun";
import { inscrireAuRegistre } from "./ecriture";
import { enseignantDe } from "./parcours";

/**
 * Espace enseignant et notifications personnelles.
 * L'enseignant ne voit que les classes où il a une relation pédagogique (core.enseignements) ;
 * chaque carnet ouvert est journalisé avec la finalité « évaluation ».
 */
export const enseignant = new Hono<{ Variables: Variables }>();

const ID_CLASSE = z.string().regex(/^CLS-[A-Za-z0-9-]+$/);
const TRIMESTRE_COURANT = 2;

/** Catalogue de formation continue ouvert à l'inscription (la première est obligatoire cette année). */
export const CATALOGUE_FORMATIONS = [
  { code: "EVAL-FORM-MATHS", intitule: "Évaluation formative en mathématiques", obligatoire: true, duree: "3 jours", modalite: "Présentiel · CS" },
  { code: "PEDA-DIFF", intitule: "Pédagogie différenciée en classe à grand effectif", obligatoire: false, duree: "2 jours", modalite: "Hybride" },
  { code: "NUM-CLASSE", intitule: "Outils numériques pour la classe", obligatoire: false, duree: "20 h", modalite: "En ligne" },
  { code: "INCLUSION", intitule: "Inclusion des élèves à besoins particuliers", obligatoire: false, duree: "2 jours", modalite: "Présentiel" },
] as const;

async function enseignantRequis(profil: Variables["profil"]) {
  const e = await enseignantDe(profil);
  if (!e) refuser("Aucune habilitation « enseignant » rattachée à un personnel du registre");
  return e!;
}

/** Mes classes : relation pédagogique, effectif courant, absents du jour, moyenne de ma matière au trimestre. */
enseignant.get("/moi/classes", authentifie, async (c) => {
  const e = await enseignantRequis(c.get("profil"));
  const liens = await base().select({ classeId: schema.enseignements.classeId, matiere: schema.enseignements.matiere, classe: schema.classes })
    .from(schema.enseignements).innerJoin(schema.classes, eq(schema.classes.id, schema.enseignements.classeId))
    .where(eq(schema.enseignements.enseignantId, e.id));
  const ids = [...new Set(liens.map((l) => l.classeId))];
  if (!ids.length) return c.json({ enseignant: e, classes: [] });
  const jour = aujourdhui();
  const stats = await base().execute<{ classe_id: string; effectif: number; absents: number; moyenne: number | null }>(sql`
    with el as (select apprenant_id, classe_id from core.scolarites where statut = 'scolarise' and classe_id in (select jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb))),
    ma as (select classe_id, matiere from core.enseignements where enseignant_id = ${e.id}),
    notes as (
      select n.classe_id, n.note as n from core.notes n
      join el on el.apprenant_id = n.apprenant_id and el.classe_id = n.classe_id
      join ma on ma.classe_id = n.classe_id and ma.matiere = n.matiere
      where n.trimestre = ${TRIMESTRE_COURANT}
    ),
    ev as (select apprenant_id, donnees from ledger.evenements where type = 'ABSENCE' and apprenant_id in (select apprenant_id from el) and donnees->>'date' = ${jour})
    select k.classe_id,
      (select count(*)::int from el where el.classe_id = k.classe_id) as effectif,
      (select count(distinct apprenant_id)::int from ev where donnees->>'classeId' = k.classe_id) as absents,
      (select avg(n) from notes where notes.classe_id = k.classe_id) as moyenne
    from (select distinct classe_id from ma) k
  `);
  const parClasse = new Map(stats.map((s) => [s.classe_id, s]));
  const etabs = await base().select({ id: schema.etablissements.id, nom: schema.etablissements.nom }).from(schema.etablissements)
    .where(inArray(schema.etablissements.id, [...new Set(liens.map((l) => l.classe.etablissementId))]));
  return c.json({
    enseignant: { id: e.id, nom: e.nom, prenoms: e.prenoms, grade: e.grade, matieres: e.matieres, etablissementId: e.etablissementId },
    trimestre: TRIMESTRE_COURANT, date: jour,
    classes: ids.map((id) => {
      const l = liens.filter((x) => x.classeId === id);
      const s = parClasse.get(id);
      return {
        id, libelle: l[0]!.classe.libelle, niveau: l[0]!.classe.niveau, capacite: l[0]!.classe.capacite,
        etablissement: etabs.find((x) => x.id === l[0]!.classe.etablissementId)?.nom ?? null,
        matieres: l.map((x) => x.matiere), principal: l[0]!.classe.enseignantPrincipalId === e.id,
        effectif: s?.effectif ?? 0, absentsDuJour: s?.absents ?? 0, moyenne: s?.moyenne ?? null,
      };
    }).sort((a, b) => comparerFr(a.libelle, b.libelle)),
  });
});

/** Carnet d'une classe : élèves, notes effectives de mes matières (corrections comprises), absences. */
enseignant.get("/classes/:id", authentifie, async (c) => {
  const profil = c.get("profil");
  const classeId = ID_CLASSE.parse(c.req.param("id"));
  const [classe] = await base().select().from(schema.classes).where(eq(schema.classes.id, classeId));
  if (!classe) throw new HTTPException(404, { message: "Classe inconnue" });
  const e = await enseignantDe(profil);
  const matieres = e ? (await base().select({ m: schema.enseignements.matiere }).from(schema.enseignements).where(and(eq(schema.enseignements.enseignantId, e.id), eq(schema.enseignements.classeId, classeId)))).map((x) => x.m) : [];
  const chef = profil.habilitations.some((h) => h.role === "chef_etablissement" && h.perimetre.niveau === "etablissement" && h.perimetre.etablissementId === classe.etablissementId);
  if (!matieres.length && !chef) {
    await journaliser(profil, "Consultation d'un carnet de classe", classeId, "evaluation", false, e ? "relation" : "role");
    refuser("Aucune relation pédagogique avec cette classe : consultation refusée et journalisée");
  }
  const visibles = matieres.length ? matieres : [...MATIERES];
  const lignes = await base().execute<{ id: string; apprenant_id: string; type: string; survenu_le: string; matiere: string | null; trimestre: number | null; note: number | null; corrigee: boolean; date: string | null; justifiee: boolean | null }>(sql`
    with el as (select apprenant_id from core.scolarites where statut = 'scolarise' and classe_id = ${classeId})
    select n.evenement_id as id, n.apprenant_id, 'EVALUATION' as type, n.survenu_le, n.matiere, n.trimestre, n.note, n.corrigee, null as date, null::boolean as justifiee
    from core.notes n
    where n.classe_id = ${classeId} and n.apprenant_id in (select apprenant_id from el)
      and n.matiere in (select jsonb_array_elements_text(${JSON.stringify(visibles)}::jsonb))
    union all
    select e.id, e.apprenant_id, 'ABSENCE', e.survenu_le, null, null, null, false, e.donnees->>'date', (e.donnees->>'justifiee')::boolean
    from ledger.evenements e
    where e.type = 'ABSENCE' and e.apprenant_id in (select apprenant_id from el) and e.donnees->>'classeId' = ${classeId}
    order by 4
  `);
  const eleves = await base().select({ id: schema.apprenants.id, nom: schema.apprenants.nom, prenoms: schema.apprenants.prenoms, sexe: schema.apprenants.sexe, besoinsParticuliers: schema.apprenants.besoinsParticuliers })
    .from(schema.scolarites).innerJoin(schema.apprenants, eq(schema.apprenants.id, schema.scolarites.apprenantId))
    .where(and(eq(schema.scolarites.classeId, classeId), eq(schema.scolarites.statut, "scolarise")));
  const jour = aujourdhui();
  await journaliser(profil, "Consultation d'un carnet de classe", classeId, chef && !matieres.length ? "gestion" : "evaluation", true, null);
  return c.json({
    classe: { id: classe.id, libelle: classe.libelle, niveau: classe.niveau, capacite: classe.capacite, etablissementId: classe.etablissementId, anneeScolaire: classe.anneeScolaire },
    matieres: visibles, lecture: !matieres.length, trimestre: TRIMESTRE_COURANT, date: jour,
    eleves: eleves.map((a) => {
      const miens = lignes.filter((l) => l.apprenant_id === a.id);
      const notes = miens.filter((l) => l.type === "EVALUATION").map((l) => ({ id: l.id, matiere: l.matiere!, trimestre: l.trimestre!, note: Number(l.note), corrigee: l.corrigee, le: l.survenu_le }));
      const abs = miens.filter((l) => l.type === "ABSENCE").map((l) => ({ id: l.id, date: l.date!, justifiee: !!l.justifiee }));
      const duTrimestre = notes.filter((n) => n.trimestre === TRIMESTRE_COURANT);
      return {
        ...a, notes, absences: abs.length, absentAujourdhui: abs.some((x) => x.date === jour),
        moyenneTrimestre: duTrimestre.length ? duTrimestre.reduce((s, n) => s + n.note, 0) / duTrimestre.length : null,
      };
    }).sort((x, y) => comparerFr(x.nom, y.nom) || comparerFr(x.prenoms, y.prenoms)),
  });
});

/** Carrière : affectations datées, formations suivies, catalogue et obligation de l'année. */
enseignant.get("/moi/carriere", authentifie, async (c) => {
  const e = await enseignantRequis(c.get("profil"));
  const [affectations, formations, charge] = await Promise.all([
    base().select({ a: schema.affectations, etablissement: schema.etablissements.nom }).from(schema.affectations)
      .innerJoin(schema.etablissements, eq(schema.etablissements.id, schema.affectations.etablissementId))
      .where(eq(schema.affectations.enseignantId, e.id)),
    base().select({ id: schema.evenements.id, le: schema.evenements.survenuLe, donnees: schema.evenements.donnees }).from(schema.evenements)
      .where(and(eq(schema.evenements.type, "FORMATION_ENSEIGNANT"), eq(schema.evenements.enseignantId, e.id))).orderBy(desc(schema.evenements.survenuLe)),
    base().select({ classeId: schema.enseignements.classeId, matiere: schema.enseignements.matiere }).from(schema.enseignements).where(eq(schema.enseignements.enseignantId, e.id)),
  ]);
  const suivies = formations.map((f) => ({ id: f.id, le: f.le, formation: String((f.donnees as { formation?: string }).formation ?? ""), statut: String((f.donnees as { statut?: string }).statut ?? "inscrit") }));
  return c.json({
    enseignant: e,
    affectations: affectations.map((x) => ({ ...x.a, etablissement: x.etablissement })),
    formations: suivies,
    catalogue: CATALOGUE_FORMATIONS.map((f) => ({ ...f, statut: suivies.find((s) => s.formation === f.intitule)?.statut ?? null })),
    charge: { classes: new Set(charge.map((x) => x.classeId)).size, enseignements: charge.length },
  });
});

enseignant.post("/moi/formations", authentifie, async (c) => {
  const profil = c.get("profil");
  const e = await enseignantRequis(profil);
  const { code } = await corps(c, z.object({ code: z.enum(CATALOGUE_FORMATIONS.map((f) => f.code) as [string, ...string[]]) }).strict());
  const f = CATALOGUE_FORMATIONS.find((x) => x.code === code)!;
  const [deja] = await base().select({ id: schema.evenements.id }).from(schema.evenements)
    .where(and(eq(schema.evenements.type, "FORMATION_ENSEIGNANT"), eq(schema.evenements.enseignantId, e.id), sql`${schema.evenements.donnees}->>'formation' = ${f.intitule}`)).limit(1);
  if (deja) throw new HTTPException(409, { message: "Déjà inscrit à cette formation" });
  const [id] = await inscrireAuRegistre([{ type: "FORMATION_ENSEIGNANT", auteurId: profil.id, enseignantId: e.id, etablissementId: e.etablissementId, apprenantId: null, donnees: { enseignantId: e.id, formation: f.intitule, statut: "inscrit" } }]);
  await journaliser(profil, "Inscription à une formation", f.intitule, "gestion", true, null);
  return c.json({ enregistre: id, formation: f.intitule, statut: "inscrit" }, 201);
});

/* ------------------------------------------------------------------ Notifications personnelles */

enseignant.get("/moi/notifications", authentifie, async (c) => {
  const profil = c.get("profil");
  if (!profil.npi) return c.json({ nonLues: 0, notifications: [] });
  const [liste, [compte]] = await Promise.all([
    base().select().from(schema.notifications).where(eq(schema.notifications.destinataireNpi, profil.npi)).orderBy(desc(schema.notifications.creeLe)).limit(60),
    base().select({ n: sql<number>`count(*)::int` }).from(schema.notifications).where(and(eq(schema.notifications.destinataireNpi, profil.npi), eq(schema.notifications.lue, false))),
  ]);
  return c.json({ nonLues: compte?.n ?? 0, notifications: liste });
});

enseignant.post("/moi/notifications/lues", authentifie, async (c) => {
  const profil = c.get("profil");
  const { ids } = await corps(c, z.object({ ids: z.array(z.string().max(80)).max(200).optional() }).strict());
  if (!profil.npi) return c.json({ ok: true });
  await base().update(schema.notifications).set({ lue: true })
    .where(and(eq(schema.notifications.destinataireNpi, profil.npi), ids?.length ? inArray(schema.notifications.id, ids) : sql`true`));
  return c.json({ ok: true });
});
