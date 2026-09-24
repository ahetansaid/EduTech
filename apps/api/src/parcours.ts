import { randomUUID } from "node:crypto";
import type { Finalite, Matiere, Profil } from "@beile/contracts";
import { MATIERES } from "@beile/contracts";
import { schema } from "@beile/db";
import { decider } from "@beile/simulation/abac";
import { indexer, situationApprenant } from "@beile/simulation/projections";
import { and, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authentifie, corps, db, journaliser, refuser, type Variables } from "./commun";
import { contexteApprenant, enEvenement } from "./donnees";

/**
 * Parcours individuels : espace famille, passeport de l'apprenant, notes, inscription.
 * Règle unique : toute lecture ou écriture d'une donnée individuelle est décidée ici (ABAC), puis journalisée.
 */
export const parcours = new Hono<{ Variables: Variables }>();

const ID_APPRENANT = z.string().regex(/^APP-\d{6}$/);
const ID_CLASSE = z.string().regex(/^CLS-[A-Za-z0-9-]+$/);

/* ------------------------------------------------------------------ Lecture d'un dossier complet */

async function dossier(profil: Profil, apprenantId: string, finalite: Finalite, action: string) {
  const ctx = await contexteApprenant(db, apprenantId, profil);
  const decision = decider(profil, { ressource: { type: "dossier_apprenant", apprenantId }, finalite }, { monde: ctx.monde, evenements: ctx.evenements });
  await journaliser(profil, action, apprenantId, finalite, decision.autorise, decision.criteres.find((x) => !x.satisfait)?.critere ?? null);
  if (!decision.autorise || !ctx.apprenant) return { decision, dossier: null };
  const situation = situationApprenant(ctx.monde, ctx.evenements, apprenantId);
  const certificats = await db.select().from(schema.certificats).where(eq(schema.certificats.apprenantId, apprenantId));
  const idsEtab = [...new Set([situation.etablissementId, ...ctx.evenements.flatMap((e) => [e.etablissementId, "deEtablissementId" in e ? e.deEtablissementId : null, "versEtablissementId" in e ? e.versEtablissementId : null])].filter((x): x is string => !!x))];
  const etabs = idsEtab.length ? await db.select({ id: schema.etablissements.id, nom: schema.etablissements.nom }).from(schema.etablissements).where(inArray(schema.etablissements.id, idsEtab)) : [];
  return {
    decision,
    dossier: {
      apprenant: ctx.apprenant,
      situation: { classe: situation.classe, etablissementId: situation.etablissementId, statut: situation.statut },
      evenements: ctx.evenements,
      certificats,
      etablissements: Object.fromEntries(etabs.map((e) => [e.id, e.nom])),
    },
  };
}

/** Espace famille : uniquement les enfants rattachés par un lien de filiation VÉRIFIÉ au registre national. */
parcours.get("/famille/enfants", authentifie, async (c) => {
  const profil = c.get("profil");
  if (!profil.npi || !profil.habilitations.some((h) => h.role === "parent")) refuser("Aucune habilitation « parent »");
  const liens = await db.select().from(schema.liensFamiliaux).where(and(eq(schema.liensFamiliaux.responsableNpi, profil.npi!), eq(schema.liensFamiliaux.verifie, true)));
  const dossiers = [];
  for (const l of liens) {
    const r = await dossier(profil, l.apprenantId, "suivi_familial", "Consultation familiale");
    if (r.dossier) dossiers.push(r.dossier);
  }
  return c.json(dossiers);
});

/** Passeport éducatif : l'apprenant consulte son propre parcours. */
parcours.get("/moi/passeport", authentifie, async (c) => {
  const profil = c.get("profil");
  const h = profil.habilitations.find((x) => x.role === "apprenant" && x.perimetre.niveau === "personnel");
  if (!h || h.perimetre.niveau !== "personnel") return refuser("Aucune habilitation « apprenant »");
  const r = await dossier(profil, h.perimetre.apprenantId, "consultation_personnelle", "Consultation du passeport éducatif");
  if (!r.dossier) return c.json({ decision: r.decision }, 403);
  return c.json(r.dossier);
});

/* ------------------------------------------------------------------ Notes */

async function enseignantDe(profil: Profil) {
  if (!profil.npi || !profil.habilitations.some((h) => h.role === "enseignant")) return null;
  const [e] = await db.select().from(schema.enseignants).where(eq(schema.enseignants.npi, profil.npi));
  return e ?? null;
}

/** Classe courante de chaque apprenant, reconstruite depuis le registre. */
async function classesCourantes(apprenantIds: string[]) {
  if (!apprenantIds.length) return new Map<string, string | null>();
  const evts = (await db.select().from(schema.evenements).where(inArray(schema.evenements.apprenantId, apprenantIds))).map(enEvenement);
  return indexer(evts).classeCourante;
}

parcours.post("/evenements/evaluations", authentifie, async (c) => {
  const profil = c.get("profil");
  const saisie = await corps(c, z.object({
    classeId: ID_CLASSE,
    matiere: z.enum(MATIERES),
    trimestre: z.number().int().min(1).max(3),
    notes: z.array(z.object({ apprenantId: ID_APPRENANT, note: z.number().min(0).max(20).refine((n) => Number.isInteger(n * 4), "au quart de point") })).min(1).max(80),
  }).strict());
  const enseignant = await enseignantDe(profil);
  const [relation] = enseignant ? await db.select().from(schema.enseignements).where(and(eq(schema.enseignements.enseignantId, enseignant.id), eq(schema.enseignements.classeId, saisie.classeId), eq(schema.enseignements.matiere, saisie.matiere))).limit(1) : [];
  if (!enseignant || !relation) {
    await journaliser(profil, "Saisie de notes", `${saisie.classeId} · ${saisie.matiere}`, "evaluation", false, !enseignant ? "role" : "relation");
    refuser("Vous n'enseignez pas cette matière dans cette classe : saisie refusée et journalisée");
  }
  const courantes = await classesCourantes(saisie.notes.map((n) => n.apprenantId));
  const hors = saisie.notes.filter((n) => courantes.get(n.apprenantId) !== saisie.classeId).map((n) => n.apprenantId);
  if (hors.length) throw new HTTPException(422, { message: `Apprenants hors de la classe : ${hors.join(", ")}` });
  const [classe] = await db.select().from(schema.classes).where(eq(schema.classes.id, saisie.classeId));
  const lignes = saisie.notes.map((n) => ({
    id: `EVT-${randomUUID()}`, type: "EVALUATION", survenuLe: new Date(), auteurId: enseignant!.id, source: "beile" as const,
    etablissementId: classe!.etablissementId, apprenantId: n.apprenantId, enseignantId: null,
    donnees: { apprenantId: n.apprenantId, classeId: saisie.classeId, matiere: saisie.matiere as Matiere, note: n.note, trimestre: saisie.trimestre, anneeScolaire: classe!.anneeScolaire },
  }));
  await db.insert(schema.evenements).values(lignes);
  await journaliser(profil, "Saisie de notes", `${saisie.classeId} · ${saisie.matiere} (${lignes.length})`, "evaluation", true, null);
  return c.json({ enregistres: lignes.map((l) => l.id) }, 201);
});

/** Correction : la note d'origine reste au registre ; un événement correctif est ajouté, avec son motif. */
parcours.post("/evenements/corrections", authentifie, async (c) => {
  const profil = c.get("profil");
  const saisie = await corps(c, z.object({
    evenementCorrigeId: z.string().regex(/^EVT-[A-Za-z0-9-]+$/),
    nouvelleNote: z.number().min(0).max(20).refine((n) => Number.isInteger(n * 4), "au quart de point"),
    motif: z.string().trim().min(5).max(140),
  }).strict());
  const [origine] = await db.select().from(schema.evenements).where(and(eq(schema.evenements.id, saisie.evenementCorrigeId), eq(schema.evenements.type, "EVALUATION")));
  if (!origine) throw new HTTPException(404, { message: "Évaluation introuvable" });
  const d = origine.donnees as { classeId: string; matiere: string; apprenantId: string };
  const enseignant = await enseignantDe(profil);
  const [relation] = enseignant ? await db.select().from(schema.enseignements).where(and(eq(schema.enseignements.enseignantId, enseignant.id), eq(schema.enseignements.classeId, d.classeId), eq(schema.enseignements.matiere, d.matiere))).limit(1) : [];
  if (!enseignant || !relation) {
    await journaliser(profil, "Correction de note", saisie.evenementCorrigeId, "evaluation", false, !enseignant ? "role" : "relation");
    refuser("Correction réservée à l'enseignant de la matière dans cette classe");
  }
  const id = `EVT-${randomUUID()}`;
  await db.insert(schema.evenements).values({
    id, type: "CORRECTION_EVALUATION", survenuLe: new Date(), auteurId: enseignant!.id, source: "beile", etablissementId: origine.etablissementId, apprenantId: d.apprenantId, enseignantId: null,
    donnees: { apprenantId: d.apprenantId, evenementCorrigeId: saisie.evenementCorrigeId, nouvelleNote: saisie.nouvelleNote, motif: saisie.motif },
  });
  await journaliser(profil, "Correction de note", `${saisie.evenementCorrigeId} → ${saisie.nouvelleNote}`, "evaluation", true, null);
  return c.json({ enregistre: id }, 201);
});

/* ------------------------------------------------------------------ Inscription (registre national) */

function etablissementDe(profil: Profil) {
  const h = profil.habilitations.find((x) => x.role === "chef_etablissement" && x.perimetre.niveau === "etablissement");
  return h && h.perimetre.niveau === "etablissement" ? h.perimetre.etablissementId : null;
}

/**
 * Recherche au registre national (simulé ; en production : ANIP via la plateforme d'interopérabilité).
 * Minimisation : seuls les enfants en âge scolaire sont renvoyés, avec le strict nécessaire à l'inscription.
 */
parcours.get("/registre/personnes", authentifie, async (c) => {
  const profil = c.get("profil");
  const etab = etablissementDe(profil);
  const nom = z.string().trim().max(40).catch("").parse(c.req.query("nom"));
  const prenoms = z.string().trim().max(40).catch("").parse(c.req.query("prenoms"));
  await journaliser(profil, "Recherche au registre national", `${nom} ${prenoms}`.trim() || "(vide)", "gestion", !!etab, etab ? null : "role");
  if (!etab) refuser("Recherche au registre réservée aux chefs d'établissement");
  if (nom.length + prenoms.length < 2) throw new HTTPException(422, { message: "Saisir au moins deux caractères" });
  const conditions = [gte(schema.personnes.dateNaissance, "2008-01-01")];
  if (nom) conditions.push(ilike(schema.personnes.nom, `%${nom.replace(/[%_]/g, "")}%`));
  if (prenoms) conditions.push(ilike(schema.personnes.prenoms, `%${prenoms.replace(/[%_]/g, "")}%`));
  const personnes = await db.select().from(schema.personnes).where(and(...conditions)).limit(8);
  const parents = personnes.flatMap((p) => p.parentsNpi);
  const nomsParents = parents.length ? await db.select({ npi: schema.personnes.npi, nom: schema.personnes.nom, prenoms: schema.personnes.prenoms, sexe: schema.personnes.sexe }).from(schema.personnes).where(inArray(schema.personnes.npi, parents)) : [];
  const deja = personnes.length ? await db.select({ npi: schema.apprenants.npi, id: schema.apprenants.id }).from(schema.apprenants).where(inArray(schema.apprenants.npi, personnes.map((p) => p.npi))) : [];
  const courantes = await classesCourantes(deja.map((d) => d.id));
  return c.json(personnes.map((p) => {
    const inscrit = deja.find((d) => d.npi === p.npi);
    return {
      npi: p.npi, nom: p.nom, prenoms: p.prenoms, dateNaissance: p.dateNaissance, sexe: p.sexe,
      parents: nomsParents.filter((x) => p.parentsNpi.includes(x.npi)).map((x) => ({ nom: x.nom, prenoms: x.prenoms, sexe: x.sexe })),
      dejaInscrit: inscrit && courantes.get(inscrit.id) ? true : false,
    };
  }));
});

parcours.post("/inscriptions", authentifie, async (c) => {
  const profil = c.get("profil");
  const saisie = await corps(c, z.object({
    classeId: ID_CLASSE,
    npi: z.string().regex(/^\d{10}$/).optional(),
    sansActe: z.object({
      nom: z.string().trim().min(2).max(40), prenoms: z.string().trim().min(2).max(60), sexe: z.enum(["F", "M"]),
      dateNaissance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), responsable: z.string().trim().max(80),
    }).strict().optional(),
  }).strict().refine((s) => !!s.npi !== !!s.sansActe, "Fournir soit un NPI, soit une identité déclarative (sans acte)"));
  const etab = etablissementDe(profil);
  const [classe] = await db.select().from(schema.classes).where(eq(schema.classes.id, saisie.classeId));
  if (!etab || !classe || classe.etablissementId !== etab) {
    await journaliser(profil, "Inscription d'un apprenant", saisie.classeId, "gestion", false, !etab ? "role" : "perimetre");
    refuser("Inscription possible uniquement dans une classe de votre établissement");
  }

  // Capacité de la classe, reconstituée depuis le registre.
  const places = await db.select({ a: schema.evenements.apprenantId }).from(schema.evenements).where(or(sql`${schema.evenements.donnees}->>'classeId' = ${saisie.classeId}`, sql`${schema.evenements.donnees}->>'versClasseId' = ${saisie.classeId}`));
  const courantes = await classesCourantes([...new Set(places.map((p) => p.a).filter((x): x is string => !!x))]);
  const effectif = [...courantes.values()].filter((x) => x === saisie.classeId).length;
  if (effectif >= classe!.capacite) throw new HTTPException(409, { message: `Classe complète (${effectif}/${classe!.capacite})` });

  let identite: { npi: string | null; nom: string; prenoms: string; sexe: "F" | "M"; dateNaissance: string; parentsNpi: string[] };
  if (saisie.npi) {
    const [p] = await db.select().from(schema.personnes).where(eq(schema.personnes.npi, saisie.npi));
    if (!p) throw new HTTPException(404, { message: "Personne introuvable au registre national" });
    const [existant] = await db.select().from(schema.apprenants).where(eq(schema.apprenants.npi, saisie.npi));
    if (existant && (await classesCourantes([existant.id])).get(existant.id)) throw new HTTPException(409, { message: "Déjà inscrit·e dans un établissement : procéder par transfert" });
    identite = { npi: p.npi, nom: p.nom, prenoms: p.prenoms, sexe: p.sexe, dateNaissance: p.dateNaissance, parentsNpi: p.parentsNpi };
  } else {
    const s = saisie.sansActe!;
    identite = { npi: null, nom: s.nom.toUpperCase(), prenoms: s.prenoms, sexe: s.sexe, dateNaissance: s.dateNaissance, parentsNpi: [] };
  }

  const [{ max } = { max: null }] = await db.select({ max: sql<string | null>`max(${schema.apprenants.id})` }).from(schema.apprenants);
  const id = `APP-${String(Number(String(max ?? "APP-0").slice(4)) + 1).padStart(6, "0")}`;
  const maintenant = new Date();
  const evenements: (typeof schema.evenements.$inferInsert)[] = [{
    id: `EVT-${randomUUID()}`, type: "INSCRIPTION", survenuLe: maintenant, auteurId: profil.id, source: "beile", etablissementId: etab, apprenantId: id, enseignantId: null,
    donnees: { apprenantId: id, classeId: saisie.classeId, anneeScolaire: classe!.anneeScolaire },
  }];
  if (!identite.npi) evenements.push({
    id: `EVT-${randomUUID()}`, type: "REGULARISATION_IDENTITE_DEMANDEE", survenuLe: maintenant, auteurId: profil.id, source: "beile", etablissementId: etab, apprenantId: id, enseignantId: null,
    donnees: { apprenantId: id, motif: `Absence d'acte de naissance — responsable déclaré : ${saisie.sansActe?.responsable || "non renseigné"}` },
  });

  await db.transaction(async (tx) => {
    await tx.insert(schema.apprenants).values({ id, npi: identite.npi, statutIdentite: identite.npi ? "verifiee" : "regularisation_en_cours", nom: identite.nom, prenoms: identite.prenoms, dateNaissance: identite.dateNaissance, sexe: identite.sexe, besoinsParticuliers: false });
    if (identite.parentsNpi.length) await tx.insert(schema.liensFamiliaux).values(identite.parentsNpi.map((npi) => ({ responsableNpi: npi, apprenantId: id, nature: "parent" as const, verifie: true })));
    await tx.insert(schema.parcours).values({ id: `PRC-${id}`, apprenantId: id, type: "scolaire", institutionId: etab, intitule: "Scolarité", statut: "en_cours" });
    await tx.insert(schema.evenements).values(evenements);
  });
  await journaliser(profil, "Inscription d'un apprenant", `${id} → ${saisie.classeId}`, "gestion", true, null);
  return c.json({ apprenantId: id, statutIdentite: identite.npi ? "verifiee" : "regularisation_en_cours", evenements: evenements.map((e) => `${e.id} · ${e.type}`) }, 201);
});
