import { MATIERES, TYPES_EVALUATION, type Matiere, type Profil } from "@beile/contracts";
import { schema } from "@beile/db";
import { aujourdhui } from "@beile/simulation/scolarite";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authentifie, base, cleUtilisateur, corps, dateCalendaire, journaliser, limiteDebit, refuser, type Variables } from "./commun";
import { classesCourantes, dejaSaisi, ID_SAISIE, inscrireAuRegistre } from "./ecriture";
import { ouvertureDuTrimestre, trimestreAuCalendrier } from "./periode";

/**
 * Saisie « pour le compte de » : l'inspection de la circonscription saisit l'appel et les notes d'une école NON
 * CONNECTÉE (aucun chef d'établissement actif sur la plateforme), à partir d'une pièce papier (feuille d'appel,
 * relevé de notes). Mêmes contrôles que la saisie de l'établissement ; chaque fait porte la marque `saisiePour`
 * et la pièce, à jamais visibles au registre. Dès que l'école a un chef connecté, la saisie lui revient (409).
 */
export const saisieTutelle = new Hono<{ Variables: Variables }>();

const ID_ETAB = z.string().regex(/^ETB-[A-Za-z0-9-]+$/);
const ID_CLASSE = z.string().regex(/^CLS-[A-Za-z0-9-]+$/);
const ID_APPRENANT = z.string().regex(/^APP-\d{6}$/);
const PIECE = z.string().trim().min(3).max(120);

/** L'inspecteur de la circonscription de cet établissement, l'école non connectée, et la classe qui en relève. */
async function porteSaisie(profil: Profil, etablissementId: string, classeId: string, action: string) {
  const [etab] = await base().select({ id: schema.etablissements.id, circonscription: schema.etablissements.circonscription }).from(schema.etablissements).where(eq(schema.etablissements.id, etablissementId));
  if (!etab) throw new HTTPException(404, { message: "Établissement inconnu" });
  const inspecteur = profil.habilitations.some((h) => h.role === "inspecteur" && h.perimetre.niveau === "circonscription" && h.perimetre.circonscription === etab.circonscription);
  if (!inspecteur) {
    await journaliser(profil, action, etablissementId, "controle", false, "perimetre");
    refuser("La saisie pour le compte d'une école relève de l'inspection de SA circonscription : refus journalisé");
  }
  const [connecte] = await base().execute<{ n: number }>(sql`
    select 1 as n from core.comptes k join core.profils p on p.id = k.profil_id, jsonb_array_elements(p.habilitations) h
    where k.actif and h->>'role' = 'chef_etablissement' and h->'perimetre'->>'etablissementId' = ${etablissementId} limit 1`);
  if (connecte) throw new HTTPException(409, { message: "Cette école est connectée : la saisie revient à son établissement" });
  const [classe] = await base().select().from(schema.classes).where(eq(schema.classes.id, classeId));
  if (!classe || classe.etablissementId !== etablissementId) throw new HTTPException(422, { message: "Classe inconnue ou hors de cet établissement" });
  return classe;
}

async function elevesDeLaClasse(apprenantIds: string[], classeId: string) {
  const courantes = await classesCourantes(apprenantIds);
  const hors = apprenantIds.filter((id) => courantes.get(id) !== classeId);
  if (hors.length) throw new HTTPException(422, { message: `Apprenants hors de la classe : ${hors.join(", ")}` });
}

saisieTutelle.post("/inspection/etablissements/:id/absences", authentifie, limiteDebit(60, 60_000, cleUtilisateur), async (c) => {
  const profil = c.get("profil");
  const etablissementId = ID_ETAB.parse(c.req.param("id"));
  const s = await corps(c, z.object({
    classeId: ID_CLASSE,
    date: z.string().refine(dateCalendaire, "date du calendrier attendue (AAAA-MM-JJ)").refine((d) => d <= aujourdhui(), "un appel ne se fait pas pour un jour à venir"),
    apprenantIds: z.array(ID_APPRENANT).min(1).max(80),
    piece: PIECE,
    idSaisie: ID_SAISIE,
  }).strict());
  const classe = await porteSaisie(profil, etablissementId, s.classeId, "Saisie d'absences pour le compte d'une école");
  await elevesDeLaClasse(s.apprenantIds, s.classeId);
  const deja = await dejaSaisi(s.idSaisie, "ABSENCE", { auteurId: profil.id });
  if (deja) return c.json({ enregistres: deja, deja: true }, 200);
  const saisiePour = { autorite: "inspection" as const, piece: s.piece };
  const enregistres = await inscrireAuRegistre(s.apprenantIds.map((apprenantId) => ({
    type: "ABSENCE", auteurId: profil.id, etablissementId, apprenantId,
    donnees: { apprenantId, classeId: s.classeId, date: s.date, justifiee: false, anneeScolaire: classe.anneeScolaire, saisiePour, ...(s.idSaisie ? { idSaisie: s.idSaisie } : {}) },
  })));
  await journaliser(profil, "Saisie d'absences pour le compte d'une école", `${etablissementId} · ${s.classeId} · ${s.date} (${enregistres.length}) · pièce ${s.piece}`, "controle", true, null);
  return c.json({ enregistres }, 201);
});

saisieTutelle.post("/inspection/etablissements/:id/evaluations", authentifie, limiteDebit(60, 60_000, cleUtilisateur), async (c) => {
  const profil = c.get("profil");
  const etablissementId = ID_ETAB.parse(c.req.param("id"));
  const s = await corps(c, z.object({
    classeId: ID_CLASSE,
    matiere: z.enum(MATIERES),
    trimestre: z.number().int().min(1).max(3),
    typeEvaluation: z.enum(TYPES_EVALUATION).optional(),
    notes: z.array(z.object({ apprenantId: ID_APPRENANT, note: z.number().min(0).max(20).refine((n) => Number.isInteger(n * 4), "au quart de point") }).strict()).min(1).max(80),
    piece: PIECE,
    idSaisie: ID_SAISIE,
  }).strict());
  const classe = await porteSaisie(profil, etablissementId, s.classeId, "Saisie de notes pour le compte d'une école");
  await elevesDeLaClasse(s.notes.map((n) => n.apprenantId), s.classeId);
  const enCours = await trimestreAuCalendrier(classe.anneeScolaire);
  if (enCours != null && s.trimestre > enCours) {
    const ouverture = await ouvertureDuTrimestre(classe.anneeScolaire, s.trimestre);
    throw new HTTPException(422, { message: `Ce trimestre n'est pas ouvert${ouverture ? ` (calendrier officiel : ${ouverture})` : ""} : la note se saisit au trimestre ${enCours}.` });
  }
  const deja = await dejaSaisi(s.idSaisie, "EVALUATION", { auteurId: profil.id });
  if (deja) return c.json({ enregistres: deja, deja: true }, 200);
  const saisiePour = { autorite: "inspection" as const, piece: s.piece };
  const enregistres = await inscrireAuRegistre(s.notes.map((n) => ({
    type: "EVALUATION", auteurId: profil.id, etablissementId, apprenantId: n.apprenantId,
    donnees: {
      apprenantId: n.apprenantId, classeId: s.classeId, matiere: s.matiere as Matiere, note: n.note, trimestre: s.trimestre, anneeScolaire: classe.anneeScolaire,
      ...(s.typeEvaluation ? { typeEvaluation: s.typeEvaluation } : {}), saisiePour, ...(s.idSaisie ? { idSaisie: s.idSaisie } : {}),
    },
  })));
  await journaliser(profil, "Saisie de notes pour le compte d'une école", `${etablissementId} · ${s.classeId} · ${s.matiere} T${s.trimestre} (${enregistres.length}) · pièce ${s.piece}`, "controle", true, null);
  return c.json({ enregistres }, 201);
});

/** Écoles NON CONNECTÉES de la circonscription de l'inspecteur, avec leurs classes : ce qu'il peut saisir. */
saisieTutelle.get("/inspection/ecoles-non-connectees", authentifie, limiteDebit(30, 60_000, cleUtilisateur), async (c) => {
  const profil = c.get("profil");
  const circonscriptions = profil.habilitations.flatMap((h) => (h.role === "inspecteur" && h.perimetre.niveau === "circonscription" ? [h.perimetre.circonscription] : []));
  if (!circonscriptions.length) {
    await journaliser(profil, "Écoles non connectées de la circonscription", "—", "controle", false, "role");
    refuser("Réservé à l'inspection d'une circonscription : refus journalisé");
  }
  const lignes = await base().execute<{ id: string; nom: string; classe_id: string; libelle: string; annee_scolaire: string; effectif: number }>(sql`
    select t.id, t.nom, c.id as classe_id, c.libelle, c.annee_scolaire,
           (select count(*)::int from core.scolarites s where s.classe_id = c.id and s.statut = 'scolarise') as effectif
    from core.etablissements t join core.classes c on c.etablissement_id = t.id
    where t.circonscription in (select jsonb_array_elements_text(${JSON.stringify(circonscriptions)}::jsonb))
      and not exists (
        select 1 from core.comptes k join core.profils p on p.id = k.profil_id, jsonb_array_elements(p.habilitations) h
        where k.actif and h->>'role' = 'chef_etablissement' and h->'perimetre'->>'etablissementId' = t.id)
    order by t.nom, c.libelle limit 1000`);
  const ecoles = new Map<string, { id: string; nom: string; classes: { id: string; libelle: string; anneeScolaire: string; effectif: number }[] }>();
  for (const l of lignes) {
    const e = ecoles.get(l.id) ?? { id: l.id, nom: l.nom, classes: [] };
    e.classes.push({ id: l.classe_id, libelle: l.libelle, anneeScolaire: l.annee_scolaire, effectif: l.effectif });
    ecoles.set(l.id, e);
  }
  await journaliser(profil, "Écoles non connectées de la circonscription", `${ecoles.size} école(s)`, "controle", true, null);
  return c.json({ ecoles: [...ecoles.values()] });
});

/** Élèves d'une classe d'école non connectée, pour reporter une feuille d'appel ou un relevé de notes. */
saisieTutelle.get("/inspection/etablissements/:id/classes/:classeId/eleves", authentifie, limiteDebit(60, 60_000, cleUtilisateur), async (c) => {
  const profil = c.get("profil");
  const etablissementId = ID_ETAB.parse(c.req.param("id"));
  const classeId = ID_CLASSE.parse(c.req.param("classeId"));
  const classe = await porteSaisie(profil, etablissementId, classeId, "Élèves d'une classe pour une saisie de l'inspection");
  const eleves = await base().select({ id: schema.apprenants.id, nom: schema.apprenants.nom, prenoms: schema.apprenants.prenoms })
    .from(schema.scolarites).innerJoin(schema.apprenants, eq(schema.apprenants.id, schema.scolarites.apprenantId))
    .where(sql`${schema.scolarites.classeId} = ${classeId} and ${schema.scolarites.statut} = 'scolarise'`);
  const trimestre = (await trimestreAuCalendrier(classe.anneeScolaire)) ?? null;
  await journaliser(profil, "Élèves d'une classe pour une saisie de l'inspection", classeId, "controle", true, null);
  return c.json({ classe: { id: classe.id, libelle: classe.libelle, anneeScolaire: classe.anneeScolaire }, trimestreCalendrier: trimestre, eleves: eleves.sort((a, b) => a.nom.localeCompare(b.nom, "fr") || a.prenoms.localeCompare(b.prenoms, "fr")) });
});
