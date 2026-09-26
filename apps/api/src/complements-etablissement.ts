import { schema } from "@beile/db";
import { notesApprenant } from "@beile/simulation/projections";
import { and, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authentifie, base, comparerFr, journaliser, refuser, type Variables } from "./commun";
import { dossier } from "./parcours";

/** Routes complémentaires de l'espace « etablissement » (ajoutées pendant le branchement du front). */
export const complementsEtablissement = new Hono<{ Variables: Variables }>();

const ID_APPRENANT = z.string().regex(/^APP-\d{6}$/);
const TRIMESTRE_COURANT = 2;

/**
 * Dossier de gestion d'un apprenant : décision ABAC (rôle, périmètre, relation, finalité) prise et journalisée
 * par `dossier()`, puis ce dont la direction a besoin sur un seul écran : moyennes du trimestre, absences,
 * parcours détaillé (libellés des classes et établissements résolus), diplômes, actions permises.
 */
complementsEtablissement.get("/apprenants/:id/dossier-gestion", authentifie, async (c) => {
  const profil = c.get("profil");
  const apprenantId = ID_APPRENANT.parse(c.req.param("id"));
  const r = await dossier(profil, apprenantId, "gestion", "Ouverture d'un dossier apprenant");
  if (!r.dossier) return c.json({ decision: r.decision }, 403);
  const d = r.dossier;

  const notes = notesApprenant(d.evenements, apprenantId);
  const parMatiere = new Map<string, number[]>();
  for (const n of notes) if (n.trimestre === TRIMESTRE_COURANT) parMatiere.set(n.matiere, [...(parMatiere.get(n.matiere) ?? []), n.note]);

  // Historique longitudinal : les mêmes notes déjà chargées pour ce dossier, agrégées par année et trimestre.
  // Moyenne générale = moyenne non pondérée des moyennes de matière (aucun coefficient transmis), comme la tuile du trimestre courant.
  const moy = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);
  const parPeriode = new Map<string, typeof notes>();
  for (const n of notes) {
    const k = `${n.anneeScolaire}¦${n.trimestre}`;
    const g = parPeriode.get(k);
    if (g) g.push(n); else parPeriode.set(k, [n]);
  }
  const historique = [...parPeriode.entries()].map(([k, ns]) => {
    const [anneeScolaire, t] = k.split("¦") as [string, string];
    const par = new Map<string, number[]>();
    for (const n of ns) par.set(n.matiere, [...(par.get(n.matiere) ?? []), n.note]);
    const matieres = [...par].map(([matiere, v]) => ({ matiere, moyenne: moy(v)!, nombre: v.length })).sort((a, b) => comparerFr(a.matiere, b.matiere));
    return { anneeScolaire, trimestre: Number(t), moyenne: moy(matieres.map((m) => m.moyenne)), matieres };
  }).sort((a, b) => a.anneeScolaire.localeCompare(b.anneeScolaire) || a.trimestre - b.trimestre);

  const classeIds = [...new Set(d.evenements.flatMap((e) => ("classeId" in e ? [e.classeId] : "versClasseId" in e ? [e.versClasseId] : [])).filter((x): x is string => !!x))];
  const classes = classeIds.length ? await base().select({ id: schema.classes.id, libelle: schema.classes.libelle }).from(schema.classes).where(inArray(schema.classes.id, classeIds)) : [];

  const chefIci = !!d.situation.etablissementId && profil.habilitations.some((h) => h.role === "chef_etablissement" && h.perimetre.niveau === "etablissement" && h.perimetre.etablissementId === d.situation.etablissementId);
  const a = d.apprenant;
  return c.json({
    decision: r.decision,
    apprenant: { id: a.id, nom: a.nom, prenoms: a.prenoms, sexe: a.sexe, dateNaissance: a.dateNaissance, statutIdentite: a.statutIdentite, besoinsParticuliers: a.besoinsParticuliers },
    situation: {
      statut: d.situation.statut,
      etablissementId: d.situation.etablissementId,
      etablissement: d.situation.etablissementId ? d.etablissements[d.situation.etablissementId] ?? null : null,
      classeId: d.situation.classe?.id ?? null,
      classe: d.situation.classe?.libelle ?? null,
      niveau: d.situation.classe?.niveau ?? null,
      anneeScolaire: d.situation.classe?.anneeScolaire ?? null,
    },
    trimestre: TRIMESTRE_COURANT,
    moyennes: [...parMatiere].map(([matiere, notes]) => ({ matiere, moyenne: notes.reduce((s, x) => s + x, 0) / notes.length, nombre: notes.length })).sort((x, y) => comparerFr(x.matiere, y.matiere)),
    historique,
    absences: d.evenements.filter((e) => e.type === "ABSENCE").length,
    evenements: d.evenements.filter((e) => e.type !== "EVALUATION" && e.type !== "ABSENCE").reverse(),
    certificats: d.certificats,
    etablissements: d.etablissements,
    classes: Object.fromEntries(classes.map((x) => [x.id, x.libelle])),
    actions: { transfert: chefIci && d.situation.statut === "scolarise", abandon: chefIci && d.situation.statut === "scolarise" },
  });
});

/**
 * Classes d'accueil possibles pour un transfert : même niveau, autre établissement, places restantes calculées
 * dans la projection core.scolarites. Réservé au chef de l'établissement où l'apprenant est scolarisé.
 */
complementsEtablissement.get("/apprenants/:id/classes-accueil", authentifie, async (c) => {
  const profil = c.get("profil");
  const apprenantId = ID_APPRENANT.parse(c.req.param("id"));
  const q = z.string().trim().max(60).catch("").parse(c.req.query("q") ?? "").replace(/[%_]/g, "");
  const [sco] = await base().select({ etablissementId: schema.scolarites.etablissementId, classeId: schema.scolarites.classeId, statut: schema.scolarites.statut })
    .from(schema.scolarites).where(eq(schema.scolarites.apprenantId, apprenantId));
  const chef = !!sco?.etablissementId && profil.habilitations.some((h) => h.role === "chef_etablissement" && h.perimetre.niveau === "etablissement" && h.perimetre.etablissementId === sco.etablissementId);
  if (!chef || sco?.statut !== "scolarise" || !sco.classeId) {
    await journaliser(profil, "Recherche d'une classe d'accueil", apprenantId, "gestion", false, "perimetre");
    refuser("Seul le chef de l'établissement où l'apprenant est scolarisé peut préparer son transfert");
  }
  const [origine] = await base().select().from(schema.classes).where(eq(schema.classes.id, sco!.classeId!));
  if (!origine) throw new HTTPException(404, { message: "Classe actuelle introuvable" });
  const conditions = [eq(schema.classes.niveau, origine.niveau), eq(schema.classes.anneeScolaire, origine.anneeScolaire), ne(schema.classes.etablissementId, origine.etablissementId)];
  if (q) conditions.push(or(ilike(schema.etablissements.nom, `%${q}%`), ilike(schema.etablissements.communeId, `%${q}%`), ilike(schema.classes.libelle, `%${q}%`))!);
  const lignes = await base()
    .select({
      id: schema.classes.id, libelle: schema.classes.libelle, capacite: schema.classes.capacite,
      etablissementId: schema.etablissements.id, etablissement: schema.etablissements.nom, communeId: schema.etablissements.communeId,
      effectif: sql<number>`(select count(*)::int from ${schema.scolarites} s where s.classe_id = ${schema.classes.id} and s.statut = 'scolarise')`,
    })
    .from(schema.classes)
    .innerJoin(schema.etablissements, eq(schema.etablissements.id, schema.classes.etablissementId))
    .where(and(...conditions))
    .limit(30);
  await journaliser(profil, "Recherche d'une classe d'accueil", `${apprenantId}${q ? ` · ${q}` : ""}`, "gestion", true, null);
  return c.json({
    niveau: origine.niveau,
    classes: lignes.map((l) => ({ ...l, places: Math.max(0, l.capacite - l.effectif) })).sort((x, y) => comparerFr(x.etablissement, y.etablissement) || comparerFr(x.libelle, y.libelle)),
  });
});
