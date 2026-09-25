import { randomUUID } from "node:crypto";
import type { Certificat } from "@beile/contracts";
import { schema } from "@beile/db";
import { empreinteCertificat } from "@beile/simulation/micro";
import { aujourdhui } from "@beile/simulation/scolarite";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authentifie, base, comparerFr, corps, journaliser, refuser, type Variables } from "./commun";
import { inscrireAuRegistre } from "./ecriture";
import { bilans, enBaisse, scolarisesEtablissement } from "./lectures";

/**
 * Espace établissement : tableau de bord, apprenants, transitions, examens, accompagnement.
 * Accès : le chef de l'établissement (gestion) ; l'inspecteur de la circonscription (lecture, contrôle).
 * Toutes les lectures passent par la projection core.scolarites et des agrégats SQL : coût constant par écran.
 */
export const etablissement = new Hono<{ Variables: Variables }>();

const ID_ETAB = z.string().regex(/^ETB-[A-Z0-9-]+$/);
const TRIMESTRE_COURANT = 2;
const FORMATION_OBLIGATOIRE = "Évaluation formative en mathématiques";
const moyenneDe = (v: (number | null)[]) => { const x = v.filter((n): n is number => n != null); return x.length ? x.reduce((s, n) => s + n, 0) / x.length : null; };

async function acces(c: Context<{ Variables: Variables }>, etablissementId: string, ecriture = false) {
  const profil = c.get("profil");
  const [etab] = await base().select().from(schema.etablissements).where(eq(schema.etablissements.id, etablissementId));
  if (!etab) throw new HTTPException(404, { message: "Établissement inconnu" });
  const chef = profil.habilitations.some((h) => h.role === "chef_etablissement" && h.perimetre.niveau === "etablissement" && h.perimetre.etablissementId === etablissementId);
  const inspecteur = !ecriture && profil.habilitations.some((h) => h.role === "inspecteur" && h.perimetre.niveau === "circonscription" && h.perimetre.circonscription === etab.circonscription);
  if (!chef && !inspecteur) {
    await journaliser(profil, ecriture ? "Action sur un établissement" : "Consultation d'un établissement", etablissementId, ecriture ? "gestion" : "controle", false, "perimetre");
    refuser("Établissement hors de votre périmètre : refus journalisé");
  }
  return { profil, etab, finalite: chef ? ("gestion" as const) : ("controle" as const) };
}

/** Tableau de bord : chiffres clés, classes, alertes utiles à la direction, absences du jour. */
etablissement.get("/etablissements/:id/tableau", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil, etab, finalite } = await acces(c, id);
  const jour = aujourdhui();
  const [classes, eleves, enseignants, formes, absentsDuJour] = await Promise.all([
    base().select().from(schema.classes).where(eq(schema.classes.etablissementId, id)),
    scolarisesEtablissement(id),
    base().select({ id: schema.enseignants.id, nom: schema.enseignants.nom, prenoms: schema.enseignants.prenoms }).from(schema.enseignants).where(eq(schema.enseignants.etablissementId, id)),
    base().selectDistinct({ id: schema.evenements.enseignantId }).from(schema.evenements)
      .where(and(eq(schema.evenements.type, "FORMATION_ENSEIGNANT"), eq(schema.evenements.etablissementId, id), sql`${schema.evenements.donnees}->>'formation' like ${FORMATION_OBLIGATOIRE + "%"}`)),
    base().select({ id: schema.evenements.id, apprenantId: schema.evenements.apprenantId, classeId: sql<string>`${schema.evenements.donnees}->>'classeId'`, enregistreLe: schema.evenements.survenuLe })
      .from(schema.evenements)
      .where(and(eq(schema.evenements.type, "ABSENCE"), eq(schema.evenements.etablissementId, id), sql`${schema.evenements.donnees}->>'date' = ${jour}`)),
  ]);
  const b = await bilans(eleves.map((e) => e.id), TRIMESTRE_COURANT);
  const nom = new Map(eleves.map((a) => [a.id, `${a.prenoms} ${a.nom}`]));
  const formesIds = new Set(formes.map((f) => f.id));
  const lignesClasses = classes.map((cl) => {
    const membres = eleves.filter((e) => e.classeId === cl.id);
    const principal = enseignants.find((e) => e.id === cl.enseignantPrincipalId);
    return {
      id: cl.id, libelle: cl.libelle, niveau: cl.niveau, capacite: cl.capacite, effectif: membres.length,
      moyenne: moyenneDe(membres.map((m) => b.get(m.id)?.moyenneTrimestre ?? null)),
      absentsDuJour: absentsDuJour.filter((x) => x.classeId === cl.id).length,
      professeurPrincipal: principal ? `${principal.prenoms} ${principal.nom}` : null,
    };
  }).sort((x, y) => comparerFr(x.libelle, y.libelle));
  const baisse = eleves.map((e) => ({ apprenantId: e.id, nom: nom.get(e.id), notes: b.get(e.id)?.dernieresMaths ?? [], baisse: enBaisse(b.get(e.id)) }))
    .filter((x) => x.baisse != null).sort((x, y) => y.baisse! - x.baisse!);
  await journaliser(profil, "Consultation du tableau de bord", id, finalite, true, null);
  return c.json({
    etablissement: { id: etab.id, nom: etab.nom, communeId: etab.communeId, circonscription: etab.circonscription, capacite: etab.capacite, cycle: etab.cycle },
    date: jour,
    trimestre: TRIMESTRE_COURANT,
    chiffres: { apprenants: eleves.length, capacite: etab.capacite, enseignants: enseignants.length, moyenne: moyenneDe(eleves.map((e) => b.get(e.id)?.moyenneTrimestre ?? null)), absentsDuJour: absentsDuJour.length },
    classes: lignesClasses,
    alertes: {
      baisse,
      regularisations: eleves.filter((a) => a.statutIdentite === "regularisation_en_cours").map((a) => ({ id: a.id, nom: nom.get(a.id) })),
      enseignantsSansFormation: enseignants.filter((e) => !formesIds.has(e.id)).length,
      formationObligatoire: FORMATION_OBLIGATOIRE,
      surcharges: lignesClasses.filter((x) => x.effectif > x.capacite).map((x) => ({ classe: x.libelle, effectif: x.effectif, capacite: x.capacite })),
    },
    absencesDuJour: absentsDuJour.map((x) => ({ id: x.id, apprenantId: x.apprenantId, nom: x.apprenantId ? nom.get(x.apprenantId) : null, classe: classes.find((cl) => cl.id === x.classeId)?.libelle, enregistreLe: x.enregistreLe }))
      .sort((x, y) => y.enregistreLe.getTime() - x.enregistreLe.getTime()),
  });
});

/** Liste des apprenants scolarisés, avec les signaux utiles (baisse, identité à régulariser). */
etablissement.get("/etablissements/:id/eleves", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil, finalite } = await acces(c, id);
  const eleves = await scolarisesEtablissement(id);
  const b = await bilans(eleves.map((e) => e.id), TRIMESTRE_COURANT);
  await journaliser(profil, "Consultation de la liste des apprenants", id, finalite, true, null);
  return c.json(eleves.map((a) => {
    const x = b.get(a.id);
    return { id: a.id, nom: a.nom, prenoms: a.prenoms, sexe: a.sexe, dateNaissance: a.dateNaissance, statutIdentite: a.statutIdentite, classeId: a.classeId, classe: a.classe, moyenne: x?.moyenneTrimestre ?? null, absences: x?.absences ?? 0, baisseMaths: enBaisse(x) != null ? x!.dernieresMaths : null };
  }).sort((x, y) => comparerFr(x.classe, y.classe) || comparerFr(x.nom, y.nom)));
});

/* ------------------------------------------------------------------ Transitions */

async function chefDeLApprenant(c: Context<{ Variables: Variables }>, apprenantId: string) {
  const profil = c.get("profil");
  const [sco] = await base().select().from(schema.scolarites).where(eq(schema.scolarites.apprenantId, apprenantId));
  const chef = !!sco?.etablissementId && profil.habilitations.some((h) => h.role === "chef_etablissement" && h.perimetre.niveau === "etablissement" && h.perimetre.etablissementId === sco.etablissementId);
  if (!chef || sco?.statut !== "scolarise") {
    await journaliser(profil, "Transition d'un apprenant", apprenantId, "gestion", false, "perimetre");
    refuser("Seul le chef de l'établissement où l'apprenant est scolarisé peut enregistrer cette transition");
  }
  return { profil, sco: sco! };
}

etablissement.post("/apprenants/:id/transfert", authentifie, async (c) => {
  const apprenantId = z.string().regex(/^APP-\d{6}$/).parse(c.req.param("id"));
  const { versClasseId } = await corps(c, z.object({ versClasseId: z.string().regex(/^CLS-[A-Za-z0-9-]+$/) }).strict());
  const { profil, sco } = await chefDeLApprenant(c, apprenantId);
  const [classe] = await base().select().from(schema.classes).where(eq(schema.classes.id, versClasseId));
  if (!classe || classe.etablissementId === sco.etablissementId) throw new HTTPException(422, { message: "Classe d'accueil invalide (autre établissement requis)" });
  const [id] = await inscrireAuRegistre([{ type: "TRANSFERT", auteurId: profil.id, etablissementId: classe.etablissementId, apprenantId, donnees: { apprenantId, deEtablissementId: sco.etablissementId, versEtablissementId: classe.etablissementId, versClasseId, anneeScolaire: classe.anneeScolaire } }]);
  await journaliser(profil, "Transfert d'un apprenant", `${apprenantId} → ${versClasseId}`, "gestion", true, null);
  return c.json({ enregistre: id }, 201);
});

etablissement.post("/apprenants/:id/abandon", authentifie, async (c) => {
  const apprenantId = z.string().regex(/^APP-\d{6}$/).parse(c.req.param("id"));
  const { motif } = await corps(c, z.object({ motif: z.string().trim().min(5).max(200) }).strict());
  const { profil, sco } = await chefDeLApprenant(c, apprenantId);
  const [classe] = await base().select().from(schema.classes).where(eq(schema.classes.id, sco.classeId!));
  const [id] = await inscrireAuRegistre([{ type: "ABANDON", auteurId: profil.id, etablissementId: sco.etablissementId, apprenantId, donnees: { apprenantId, anneeScolaire: classe?.anneeScolaire ?? "", motif } }]);
  await journaliser(profil, "Déclaration d'abandon", apprenantId, "gestion", true, null);
  return c.json({ enregistre: id }, 201);
});

/* ------------------------------------------------------------------ Examens et certification */

const SESSION_BEPC = "Juin 2026";

async function candidatsBepc(etablissementId: string) {
  const eleves = (await scolarisesEtablissement(etablissementId)).filter((e) => e.niveau === "3e");
  const b = await bilans(eleves.map((e) => e.id));
  return eleves.map((e) => ({ ...e, moyenne: b.get(e.id)?.moyenne ?? null }));
}

etablissement.get("/etablissements/:id/examens", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil, finalite } = await acces(c, id);
  const [candidats, certificats] = await Promise.all([
    candidatsBepc(id),
    // Diplômes délivrés aux apprenants passés par l'établissement (registre), y compris ceux qui l'ont quitté.
    base().select({ c: schema.certificats, titulaire: sql<string>`${schema.apprenants.prenoms} || ' ' || ${schema.apprenants.nom}` })
      .from(schema.certificats).innerJoin(schema.apprenants, eq(schema.apprenants.id, schema.certificats.apprenantId))
      .where(sql`${schema.certificats.apprenantId} in (select apprenant_id from ledger.evenements where etablissement_id = ${id} and type in ('INSCRIPTION', 'TRANSFERT', 'REPRISE'))`),
  ]);
  await journaliser(profil, "Consultation des examens", id, finalite, true, null);
  return c.json({
    session: SESSION_BEPC,
    classes: [...new Set(candidats.map((x) => x.classe))].sort(),
    candidats: candidats.map((x) => ({ id: x.id, nom: `${x.prenoms} ${x.nom}`, classe: x.classe, moyenne: x.moyenne })).sort((x, y) => comparerFr(x.nom, y.nom)),
    deliberee: certificats.some((x) => x.c.examen === "BEPC" && x.c.session === SESSION_BEPC),
    certificats: certificats.map((x) => ({ ...x.c, titulaire: x.titulaire })).sort((x, y) => y.delivreLe.localeCompare(x.delivreLe)),
  });
});

/** Délibération du BEPC (déléguée au centre d'examen) : résultats et diplômes vérifiables, en une transaction. */
etablissement.post("/etablissements/:id/examens/deliberation", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil } = await acces(c, id, true);
  const candidats = await candidatsBepc(id);
  if (!candidats.length) throw new HTTPException(422, { message: "Aucun candidat en classe de 3e" });
  const [deja] = await base().select({ id: schema.certificats.id }).from(schema.certificats)
    .where(and(eq(schema.certificats.examen, "BEPC"), eq(schema.certificats.session, SESSION_BEPC), inArray(schema.certificats.apprenantId, candidats.map((a) => a.id)))).limit(1);
  if (deja) throw new HTTPException(409, { message: "Session déjà délibérée" });
  const delivreLe = aujourdhui();
  const certs: Certificat[] = [];
  const faits = candidats.flatMap((a) => {
    // Note d'examen : moyenne de l'année, bornée (le centre d'examen transmet la note réelle en production).
    const moyenne = Number(Math.min(18.5, Math.max(6, (a.moyenne ?? 10) + 0.4)).toFixed(2));
    const admis = moyenne >= 10;
    const f = [{ type: "RESULTAT_EXAMEN", auteurId: profil.id, etablissementId: id, apprenantId: a.id, source: "examens" as const, donnees: { apprenantId: a.id, examen: "BEPC", session: SESSION_BEPC, moyenne, admis } as Record<string, unknown> }];
    if (admis) {
      const mention = moyenne >= 16 ? "Très bien" : moyenne >= 14 ? "Bien" : moyenne >= 12 ? "Assez bien" : "Passable";
      const brut = { id: `CERT-BEPC-2026-${a.id.slice(4)}`, apprenantId: a.id, examen: "BEPC" as const, session: SESSION_BEPC, mention, moyenne, delivreLe };
      certs.push({ ...brut, empreinte: empreinteCertificat(brut, `${a.prenoms} ${a.nom}`), revoque: false });
      f.push({ type: "CERTIFICATION", auteurId: profil.id, etablissementId: id, apprenantId: a.id, source: "examens" as const, donnees: { apprenantId: a.id, certificatId: brut.id, examen: "BEPC", session: SESSION_BEPC, mention } });
    }
    return f;
  });
  await inscrireAuRegistre(faits, async (tx) => { if (certs.length) await tx.insert(schema.certificats).values(certs); });
  await journaliser(profil, "Délibération du BEPC", `${id} · ${candidats.length} candidats`, "gestion", true, null);
  return c.json({ candidats: candidats.length, diplomes: certs.length }, 201);
});

/* ------------------------------------------------------------------ Accompagnement (moteur de workflow) */

/** Proposition d'accompagnement : une demande suit le circuit ACCOMPAGNEMENT ; aucune mesure sans décision humaine. */
etablissement.post("/etablissements/:id/accompagnement", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil } = await acces(c, id, true);
  const { apprenantIds, objet } = await corps(c, z.object({ apprenantIds: z.array(z.string().regex(/^APP-\d{6}$/)).min(1).max(80), objet: z.string().trim().min(5).max(200) }).strict());
  await base().insert(schema.modelesCircuit).values({ code: "ACCOMPAGNEMENT", libelle: "Accompagnement pédagogique", version: "1.0", etapes: [{ ordre: 1, code: "PROPOSITION", role: "chef_etablissement", delaiJours: 0 }, { ordre: 2, code: "VALIDATION_CONSEIL", role: "conseil_pedagogique", delaiJours: 7 }, { ordre: 3, code: "INFORMATION_FAMILLES", role: "chef_etablissement", delaiJours: 3 }] }).onConflictDoNothing();
  const demandeId = `DEM-${randomUUID()}`;
  await base().insert(schema.demandes).values({ id: demandeId, modele: "ACCOMPAGNEMENT", objet: `${objet} (${apprenantIds.length} apprenants)`, demandeurId: profil.id, ressource: id, etapeCourante: "VALIDATION_CONSEIL", statut: "en_cours", echeance: new Date(Date.now() + 7 * 86_400_000) });
  await base().insert(schema.decisions).values({ id: `DEC-${randomUUID()}`, demandeId, etape: "PROPOSITION", auteurId: profil.id, decision: "valide", motif: apprenantIds.join(",") });
  await journaliser(profil, "Proposition d'accompagnement", `${demandeId} · ${apprenantIds.length} apprenants`, "gestion", true, null);
  return c.json({ demandeId, etape: "VALIDATION_CONSEIL" }, 201);
});

etablissement.get("/etablissements/:id/demandes", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  await acces(c, id);
  return c.json(await base().select().from(schema.demandes).where(eq(schema.demandes.ressource, id)));
});

