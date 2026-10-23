import { randomUUID } from "node:crypto";
import type { Profil } from "@beile/contracts";
import { schema } from "@beile/db";
import { and, count, desc, eq, gt, inArray, ne, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { etatAnnee } from "./annees";
import { authentifie, base, comparerFr, corps, journaliser, limiteDebitPartage, refuser, type Variables } from "./commun";
import { inscrireAuRegistre } from "./ecriture";
import { couvreEtab } from "./etablissement";
import { chefDe, cleProfil } from "./import-eleves";
import { notifierFamille } from "./notifications";

/**
 * Mouvements d'élèves en cours d'année (docs/cadrage/TRANSFERTS.md).
 *
 * - Changement de classe : l'administration de l'école, seule, dans la même année et le même niveau.
 * - Transfert entre écoles : circuit TRANSFERT du moteur de workflow. L'école de départ DEMANDE, l'école d'accueil
 *   ACCEPTE (en choisissant la classe) ou REFUSE en motivant ; sans réponse sous 15 jours, la demande expire.
 *   L'élève reste dans son école tant que l'accueil n'a pas accepté. L'inspection de la circonscription d'accueil
 *   peut imposer le transfert (refus ou silence de l'école), motif obligatoire.
 *
 * Dans tous les cas, l'écriture au registre se fait sous verrou de l'élève puis de la classe d'arrivée : la situation
 * de l'élève et les places restantes sont relues DANS la transaction, jamais sur un état lu avant.
 */
export const transferts = new Hono<{ Variables: Variables }>();

const ID_APPRENANT = z.string().regex(/^APP-\d{6}$/);
const ID_CLASSE = z.string().regex(/^CLS-[A-Za-z0-9-]+$/);
const ID_ETAB = z.string().regex(/^ETB-[A-Za-z0-9-]+$/);
const ID_DEMANDE = z.string().regex(/^DEM-[A-Za-z0-9-]+$/);
const MOTIF = z.string().trim().min(10, "Motif : 10 caractères au moins").max(200);
const DELAI_JOURS = 15;
const MODELE = {
  code: "TRANSFERT", libelle: "Transfert d'établissement", version: "2.0",
  etapes: [{ ordre: 1, code: "DEMANDE", role: "chef_etablissement", delaiJours: 0 }, { ordre: 2, code: "ACCORD_ACCUEIL", role: "chef_etablissement", delaiJours: DELAI_JOURS }],
};

type Tx = Parameters<Parameters<ReturnType<typeof base>["transaction"]>[0]>[0];
type Classe = typeof schema.classes.$inferSelect;
type Demande = typeof schema.demandes.$inferSelect;
interface DonneesTransfert { apprenantId: string; deEtablissementId: string; versEtablissementId: string; versClasseId: string; niveau: string; anneeScolaire: string; motif: string }
export type EtatTransfert = "en_attente" | "expiree" | "acceptee" | "refusee" | "retiree";

// Un usage normal reste loin de 60 mouvements par heure et par compte ; au-delà, c'est un script.
const plafond = limiteDebitPartage("transferts", 60, 3_600_000, cleProfil);

export function etatTransfert(d: Pick<Demande, "statut" | "echeance">): EtatTransfert {
  if (d.statut === "acceptee") return "acceptee";
  if (d.statut === "refusee") return "refusee";
  if (d.statut === "close") return "retiree";
  return d.echeance && d.echeance.getTime() <= Date.now() ? "expiree" : "en_attente";
}

const classeDe = async (id: string) => (await base().select().from(schema.classes).where(eq(schema.classes.id, id)))[0];
const inspecteurDe = (profil: Profil, etab: { id: string; communeId: string; circonscription: string }) =>
  profil.habilitations.some((h) => h.role === "inspecteur" && couvreEtab(h, etab));

/** Refus métier (404, 409, 422) journalisé avec sa cible, comme un refus de périmètre. */
async function tracerRefus<T>(profil: Profil, action: string, cible: string, f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (err) {
    if (err instanceof HTTPException && [404, 409, 422].includes(err.status)) {
      await journaliser(profil, action, `${cible} · ${err.message}`.slice(0, 200), "gestion", false, err.status === 404 ? "perimetre" : "controle");
    }
    throw err;
  }
}

/** Une classe d'arrivée doit appartenir à une année ouverte de son établissement. */
async function anneeOuverteOuRefus(profil: Profil, action: string, cible: string, classe: Classe) {
  const etat = await etatAnnee(classe.etablissementId, classe.anneeScolaire);
  if (!etat.ouverte) {
    await journaliser(profil, action, `${cible} (${classe.anneeScolaire})`, "gestion", false, "annee");
    throw new HTTPException(422, { message: `Classe d'une année close (${classe.anneeScolaire}) : choisissez une classe de l'année en cours` });
  }
}

/**
 * Dans la transaction d'écriture : verrou de l'élève puis de la classe d'arrivée (toujours dans cet ordre), relecture
 * de sa situation et des places restantes. Deux acceptations simultanées ne remplissent pas une classe au-delà de sa
 * capacité, et un élève sorti ou déjà déplacé entre-temps n'est pas déplacé une seconde fois.
 */
async function verifierPlacement(tx: Tx, apprenantId: string, attendu: { etablissementId: string; classeId?: string }, cible: Classe) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`placement:${apprenantId}`}))`);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`classe:${cible.id}`}))`);
  const [sco] = await tx.select().from(schema.scolarites).where(eq(schema.scolarites.apprenantId, apprenantId));
  if (sco?.statut !== "scolarise" || sco.etablissementId !== attendu.etablissementId || (attendu.classeId && sco.classeId !== attendu.classeId)) {
    throw new HTTPException(409, { message: "La situation de l'élève a changé entre-temps (autre classe, transfert ou sortie) : rechargez la page" });
  }
  const [r] = await tx.select({ n: count() }).from(schema.scolarites).where(and(eq(schema.scolarites.classeId, cible.id), eq(schema.scolarites.statut, "scolarise")));
  const effectif = Number(r?.n ?? 0);
  if (effectif >= cible.capacite) throw new HTTPException(409, { message: `Classe ${cible.libelle} complète (${effectif}/${cible.capacite}) : choisissez une autre classe` });
}

/** Classes d'un établissement pour un niveau et une année, avec les places restantes. */
async function classesAvecPlaces(etablissementId: string, niveau: string, anneeScolaire: string, sauf?: string) {
  const lignes = await base()
    .select({
      id: schema.classes.id, libelle: schema.classes.libelle, capacite: schema.classes.capacite,
      effectif: sql<number>`(select count(*)::int from ${schema.scolarites} s where s.classe_id = ${schema.classes.id} and s.statut = 'scolarise')`,
    })
    .from(schema.classes)
    .where(and(eq(schema.classes.etablissementId, etablissementId), eq(schema.classes.niveau, niveau), eq(schema.classes.anneeScolaire, anneeScolaire), ...(sauf ? [ne(schema.classes.id, sauf)] : [])));
  return lignes.map((l) => ({ ...l, places: Math.max(0, l.capacite - l.effectif) })).sort((a, b) => comparerFr(a.libelle, b.libelle));
}

/** Situation scolaire de l'élève et refus journalisé si l'utilisateur n'administre pas son école. */
async function eleveDeMonEcole(profil: Profil, apprenantId: string, action: string) {
  const [sco] = await base().select().from(schema.scolarites).where(eq(schema.scolarites.apprenantId, apprenantId));
  if (!sco?.etablissementId || sco.statut !== "scolarise" || !sco.classeId || !chefDe(profil, sco.etablissementId)) {
    await journaliser(profil, action, apprenantId, "gestion", false, "perimetre");
    refuser("Seule l'administration de l'établissement où l'élève est scolarisé peut le faire : refus journalisé");
  }
  const origine = await classeDe(sco!.classeId!);
  if (!origine) throw new HTTPException(404, { message: "Classe actuelle introuvable" });
  return { sco: sco!, origine };
}

/* ================================================================== Changement de classe (même école) */

/** Classes de la même école, même niveau et même année, vers lesquelles l'élève peut changer. */
transferts.get("/apprenants/:id/classes-ecole", authentifie, async (c) => {
  const profil = c.get("profil");
  const apprenantId = ID_APPRENANT.parse(c.req.param("id"));
  const { origine } = await eleveDeMonEcole(profil, apprenantId, "Recherche d'une classe (changement)");
  return c.json({ niveau: origine.niveau, anneeScolaire: origine.anneeScolaire, classes: await classesAvecPlaces(origine.etablissementId, origine.niveau, origine.anneeScolaire, origine.id) });
});

transferts.post("/apprenants/:id/changement-classe", authentifie, plafond, async (c) => {
  const profil = c.get("profil");
  const apprenantId = ID_APPRENANT.parse(c.req.param("id"));
  const { versClasseId, motif } = await corps(c, z.object({ versClasseId: ID_CLASSE, motif: MOTIF }).strict());
  const action = "Changement de classe";
  const { sco, origine } = await eleveDeMonEcole(profil, apprenantId, action);
  const cible = `${apprenantId} · ${origine.id} → ${versClasseId}`;
  const ids = await tracerRefus(profil, action, cible, async () => {
    const classe = await classeDe(versClasseId);
    if (!classe || classe.etablissementId !== origine.etablissementId) throw new HTTPException(422, { message: "Classe d'arrivée inconnue ou d'un autre établissement : pour une autre école, demandez un transfert" });
    if (classe.id === origine.id) throw new HTTPException(422, { message: "L'élève est déjà dans cette classe" });
    if (classe.niveau !== origine.niveau || classe.anneeScolaire !== origine.anneeScolaire) {
      throw new HTTPException(422, { message: `Changement possible vers une classe de ${origine.niveau} de l'année ${origine.anneeScolaire} seulement (le niveau se décide en conseil de passage)` });
    }
    await anneeOuverteOuRefus(profil, action, cible, classe);
    return inscrireAuRegistre([{
      type: "CHANGEMENT_CLASSE", auteurId: profil.id, etablissementId: origine.etablissementId, apprenantId,
      donnees: { apprenantId, deClasseId: origine.id, versClasseId: classe.id, anneeScolaire: classe.anneeScolaire, motif },
    }], (tx) => verifierPlacement(tx, apprenantId, { etablissementId: sco.etablissementId!, classeId: origine.id }, classe));
  });
  await journaliser(profil, action, `${cible} · ${motif}`.slice(0, 200), "gestion", true, null);
  return c.json({ enregistre: ids[0] }, 201);
});

/* ================================================================== Transfert entre écoles (circuit) */

/** Demande de transfert par l'école de départ : rien ne bouge avant l'accord de l'école d'accueil. */
transferts.post("/apprenants/:id/transfert", authentifie, plafond, async (c) => {
  const profil = c.get("profil");
  const apprenantId = ID_APPRENANT.parse(c.req.param("id"));
  const { versClasseId, motif } = await corps(c, z.object({ versClasseId: ID_CLASSE, motif: MOTIF }).strict());
  const action = "Demande de transfert";
  const { sco, origine } = await eleveDeMonEcole(profil, apprenantId, action);
  const cible = `${apprenantId} → ${versClasseId}`;
  const r = await tracerRefus(profil, action, cible, async () => {
    const classe = await classeDe(versClasseId);
    if (!classe || classe.etablissementId === sco.etablissementId) throw new HTTPException(422, { message: "Classe d'accueil invalide (autre établissement requis ; dans la même école, changez de classe)" });
    if (classe.niveau !== origine.niveau || classe.anneeScolaire !== origine.anneeScolaire) {
      throw new HTTPException(422, { message: `Classe d'accueil de ${origine.niveau}, année ${origine.anneeScolaire}, requise` });
    }
    await anneeOuverteOuRefus(profil, action, cible, classe);
    const [de, vers] = await Promise.all([sco.etablissementId!, classe.etablissementId].map(async (id) => (await base().select({ nom: schema.etablissements.nom }).from(schema.etablissements).where(eq(schema.etablissements.id, id)))[0]?.nom ?? id));
    // Le circuit se déclare une fois : une demande en usage ne réécrit pas le modèle, qui pourrait porter une
    // version ajustée par ailleurs.
    await base().insert(schema.modelesCircuit).values(MODELE).onConflictDoNothing({ target: schema.modelesCircuit.code });
    const demandeId = `DEM-${randomUUID()}`;
    const echeance = new Date(Date.now() + DELAI_JOURS * 86_400_000);
    const donnees: DonneesTransfert = { apprenantId, deEtablissementId: sco.etablissementId!, versEtablissementId: classe.etablissementId, versClasseId: classe.id, niveau: classe.niveau, anneeScolaire: classe.anneeScolaire, motif };
    await base().transaction(async (tx) => {
      // Une seule demande en attente par élève : sous le verrou de l'élève, deux clics ne créent pas deux demandes.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`placement:${apprenantId}`}))`);
      const [ouverte] = await tx.select({ id: schema.demandes.id }).from(schema.demandes)
        .where(and(eq(schema.demandes.modele, "TRANSFERT"), eq(schema.demandes.statut, "en_cours"), gt(schema.demandes.echeance, new Date()), sql`${schema.demandes.donnees}->>'apprenantId' = ${apprenantId}`)).limit(1);
      if (ouverte) throw new HTTPException(409, { message: "Une demande de transfert est déjà en attente pour cet élève : retirez-la avant d'en adresser une autre" });
      // Les demandes expirées de l'élève sont closes : une seule demande vivante, que l'inspection ne peut pas confondre.
      const expirees = await tx.update(schema.demandes).set({ statut: "close" })
        .where(and(eq(schema.demandes.modele, "TRANSFERT"), eq(schema.demandes.statut, "en_cours"), sql`${schema.demandes.donnees}->>'apprenantId' = ${apprenantId}`)).returning({ id: schema.demandes.id });
      if (expirees.length) await tx.insert(schema.decisions).values(expirees.map((x) => ({ id: `DEC-${randomUUID()}`, demandeId: x.id, etape: "EXPIRATION", auteurId: profil.id, decision: "refuse" as const, motif: "Expirée sans réponse : remplacée par une nouvelle demande" })));
      // L'objet s'affiche dans les files : jamais nominatif.
      await tx.insert(schema.demandes).values({ id: demandeId, modele: "TRANSFERT", objet: `Transfert entrant (${classe.niveau}) depuis ${de}`, demandeurId: profil.id, ressource: classe.etablissementId, donnees: { ...donnees }, etapeCourante: "ACCORD_ACCUEIL", statut: "en_cours", echeance });
      await tx.insert(schema.decisions).values({ id: `DEC-${randomUUID()}`, demandeId, etape: "DEMANDE", auteurId: profil.id, decision: "valide", motif });
    });
    return { demandeId, echeance, vers };
  });
  await journaliser(profil, action, `${cible} · ${r.demandeId}`, "gestion", true, null);
  await notifierFamille(apprenantId, (p) => [`Demande de transfert de ${p}`, `L'établissement a demandé le transfert de ${p} vers ${r.vers}. L'établissement d'accueil a ${DELAI_JOURS} jours pour répondre ; d'ici là, ${p} reste inscrit·e dans son école actuelle.`]);
  return c.json({ demandeId: r.demandeId, statut: "en_attente", echeance: r.echeance.toISOString(), versEtablissement: r.vers }, 201);
});

async function demandeTransfert(demandeId: string) {
  const [d] = await base().select().from(schema.demandes).where(and(eq(schema.demandes.id, demandeId), eq(schema.demandes.modele, "TRANSFERT")));
  if (!d) throw new HTTPException(404, { message: "Demande de transfert introuvable" });
  return { d, don: d.donnees as unknown as DonneesTransfert };
}

/** Classe retenue à l'accueil : celle proposée par défaut, sinon une autre du même établissement, niveau et année. */
async function classeRetenue(don: DonneesTransfert, versClasseId: string | undefined) {
  const classe = await classeDe(versClasseId ?? don.versClasseId);
  if (!classe || classe.etablissementId !== don.versEtablissementId || classe.niveau !== don.niveau || classe.anneeScolaire !== don.anneeScolaire) {
    throw new HTTPException(422, { message: `Classe d'accueil : une classe de ${don.niveau} (${don.anneeScolaire}) de l'établissement d'accueil` });
  }
  return classe;
}

/** Effet du transfert accepté ou imposé : le fait TRANSFERT et la clôture de la demande, dans la même transaction. */
async function appliquerTransfert(profil: Profil, d: Demande, don: DonneesTransfert, classe: Classe, o: { impose: boolean; motif: string }) {
  return inscrireAuRegistre([{
    type: "TRANSFERT", auteurId: profil.id, etablissementId: classe.etablissementId, apprenantId: don.apprenantId,
    donnees: { apprenantId: don.apprenantId, deEtablissementId: don.deEtablissementId, versEtablissementId: classe.etablissementId, versClasseId: classe.id, anneeScolaire: classe.anneeScolaire, demandeId: d.id, ...(o.impose ? { impose: true } : {}) },
  }], async (tx) => {
    await verifierPlacement(tx, don.apprenantId, { etablissementId: don.deEtablissementId }, classe);
    // L'école d'accueil répond à une demande en attente et non échue ; l'inspection peut aussi passer outre un refus ou un silence.
    const admis = o.impose ? inArray(schema.demandes.statut, ["en_cours", "refusee"]) : and(eq(schema.demandes.statut, "en_cours"), gt(schema.demandes.echeance, new Date()));
    const maj = await tx.update(schema.demandes).set({ statut: "acceptee" }).where(and(eq(schema.demandes.id, d.id), admis)).returning({ id: schema.demandes.id });
    if (maj.length !== 1) throw new HTTPException(409, { message: "Demande déjà traitée, retirée ou expirée entre-temps : rechargez la page" });
    // L'étape dit d'où vient la décision : l'accord de l'école d'accueil, ou l'imposition par l'inspection.
    await tx.insert(schema.decisions).values({ id: `DEC-${randomUUID()}`, demandeId: d.id, etape: o.impose ? "IMPOSITION" : "ACCORD_ACCUEIL", auteurId: profil.id, decision: "valide", motif: o.motif });
  });
}

/** Réponse de l'école d'accueil : accepter (classe au choix, places contrôlées) ou refuser en motivant. */
transferts.post("/transferts/:demandeId/decision", authentifie, plafond, async (c) => {
  const profil = c.get("profil");
  const demandeId = ID_DEMANDE.parse(c.req.param("demandeId"));
  const saisie = await corps(c, z.object({
    decision: z.enum(["accepte", "refuse"]),
    versClasseId: ID_CLASSE.optional(),
    motif: z.string().trim().max(200).optional(),
  }).strict().refine((s) => s.decision === "accepte" || (s.motif ?? "").length >= 10, "Un refus se motive (10 caractères au moins)"));
  const { d, don } = await demandeTransfert(demandeId);
  const action = saisie.decision === "accepte" ? "Accord d'un transfert" : "Refus d'un transfert";
  if (!chefDe(profil, don.versEtablissementId)) {
    await journaliser(profil, action, demandeId, "gestion", false, "perimetre");
    refuser("Seule l'administration de l'établissement d'accueil répond à une demande de transfert : refus journalisé");
  }
  const r = await tracerRefus(profil, action, demandeId, async () => {
    const etat = etatTransfert(d);
    if (etat !== "en_attente") throw new HTTPException(409, { message: etat === "expiree" ? "Demande expirée : l'école de départ doit en adresser une nouvelle" : "Cette demande a déjà été traitée" });
    if (saisie.decision === "refuse") {
      await base().transaction(async (tx) => {
        const maj = await tx.update(schema.demandes).set({ statut: "refusee" }).where(and(eq(schema.demandes.id, demandeId), eq(schema.demandes.statut, "en_cours"))).returning({ id: schema.demandes.id });
        if (maj.length !== 1) throw new HTTPException(409, { message: "Demande déjà traitée entre-temps : rechargez la page" });
        await tx.insert(schema.decisions).values({ id: `DEC-${randomUUID()}`, demandeId, etape: "ACCORD_ACCUEIL", auteurId: profil.id, decision: "refuse", motif: saisie.motif! });
      });
      return { statut: "refusee" as const, classe: null };
    }
    const classe = await classeRetenue(don, saisie.versClasseId);
    await anneeOuverteOuRefus(profil, action, demandeId, classe);
    const ids = await appliquerTransfert(profil, d, don, classe, { impose: false, motif: saisie.motif || "Accord de l'établissement d'accueil" });
    return { statut: "acceptee" as const, classe: classe.libelle, enregistre: ids[0] };
  });
  await journaliser(profil, action, `${demandeId} · ${don.apprenantId}${r.classe ? ` → ${r.classe}` : ` · ${saisie.motif}`}`.slice(0, 200), "gestion", true, null);
  if (r.statut === "refusee") await notifierFamille(don.apprenantId, (p) => [`Transfert de ${p} refusé`, `L'établissement d'accueil a refusé le transfert de ${p} — motif : ${saisie.motif}. ${p} reste inscrit·e dans son école actuelle.`]);
  return c.json(r);
});

/** Retrait par l'école de départ (famille qui renonce, erreur) : la demande se clôt, l'élève ne bouge pas. */
transferts.post("/transferts/:demandeId/retrait", authentifie, plafond, async (c) => {
  const profil = c.get("profil");
  const demandeId = ID_DEMANDE.parse(c.req.param("demandeId"));
  const { motif } = await corps(c, z.object({ motif: MOTIF }).strict());
  const { d, don } = await demandeTransfert(demandeId);
  if (!chefDe(profil, don.deEtablissementId)) {
    await journaliser(profil, "Retrait d'une demande de transfert", demandeId, "gestion", false, "perimetre");
    refuser("Seule l'administration de l'établissement de départ retire sa demande : refus journalisé");
  }
  await tracerRefus(profil, "Retrait d'une demande de transfert", demandeId, async () => {
    if (!["en_attente", "expiree"].includes(etatTransfert(d))) throw new HTTPException(409, { message: "Cette demande a déjà été traitée" });
    await base().transaction(async (tx) => {
      const maj = await tx.update(schema.demandes).set({ statut: "close" }).where(and(eq(schema.demandes.id, demandeId), eq(schema.demandes.statut, "en_cours"))).returning({ id: schema.demandes.id });
      if (maj.length !== 1) throw new HTTPException(409, { message: "Demande déjà traitée entre-temps : rechargez la page" });
      await tx.insert(schema.decisions).values({ id: `DEC-${randomUUID()}`, demandeId, etape: "DEMANDE", auteurId: profil.id, decision: "refuse", motif: `Retrait : ${motif}` });
    });
  });
  await journaliser(profil, "Retrait d'une demande de transfert", `${demandeId} · ${motif}`.slice(0, 200), "gestion", true, null);
  await notifierFamille(don.apprenantId, (p) => [`Demande de transfert de ${p} retirée`, `L'établissement a retiré sa demande de transfert. ${p} reste inscrit·e dans son école actuelle.`]);
  return c.json({ statut: "retiree" });
});

/**
 * Décision de l'inspection de la circonscription D'ACCUEIL : elle passe outre le refus ou le silence de l'école
 * (affectation décidée par l'autorité). Motif obligatoire ; places et année ouverte restent contrôlées.
 */
transferts.post("/transferts/:demandeId/imposer", authentifie, plafond, async (c) => {
  const profil = c.get("profil");
  const demandeId = ID_DEMANDE.parse(c.req.param("demandeId"));
  const saisie = await corps(c, z.object({ versClasseId: ID_CLASSE.optional(), motif: MOTIF }).strict());
  const { d, don } = await demandeTransfert(demandeId);
  const action = "Transfert imposé par l'inspection";
  const [accueil] = await base().select().from(schema.etablissements).where(eq(schema.etablissements.id, don.versEtablissementId));
  if (!accueil || !inspecteurDe(profil, accueil)) {
    await journaliser(profil, action, demandeId, "controle", false, "role");
    refuser("Seule l'inspection de la circonscription d'accueil peut imposer un transfert : refus journalisé");
  }
  const r = await tracerRefus(profil, action, demandeId, async () => {
    if (!["en_attente", "expiree", "refusee"].includes(etatTransfert(d))) throw new HTTPException(409, { message: "Cette demande a déjà abouti ou a été retirée" });
    const classe = await classeRetenue(don, saisie.versClasseId);
    await anneeOuverteOuRefus(profil, action, demandeId, classe);
    const ids = await appliquerTransfert(profil, d, don, classe, { impose: true, motif: `Décision de l'inspection : ${saisie.motif}` });
    return { statut: "acceptee" as const, classe: classe.libelle, enregistre: ids[0] };
  });
  await journaliser(profil, action, `${demandeId} · ${don.apprenantId} → ${r.classe} · ${saisie.motif}`.slice(0, 200), "controle", true, null);
  return c.json(r);
});

/* ================================================================== Lectures */

/** Lignes lisibles d'un écran : élève, écoles, classe proposée, dernière réponse, actions permises, classes possibles. */
async function decrire(profil: Profil, demandes: Demande[]) {
  if (!demandes.length) return [];
  const dons = demandes.map((d) => ({ d, don: d.donnees as unknown as DonneesTransfert }));
  const apprenantIds = [...new Set(dons.map((x) => x.don.apprenantId))];
  const etabIds = [...new Set(dons.flatMap((x) => [x.don.deEtablissementId, x.don.versEtablissementId]))];
  const classeIds = [...new Set(dons.map((x) => x.don.versClasseId))];
  const [eleves, etabs, classes, decisions] = await Promise.all([
    base().select({ id: schema.apprenants.id, nom: schema.apprenants.nom, prenoms: schema.apprenants.prenoms }).from(schema.apprenants).where(inArray(schema.apprenants.id, apprenantIds)),
    base().select({ id: schema.etablissements.id, nom: schema.etablissements.nom, communeId: schema.etablissements.communeId, circonscription: schema.etablissements.circonscription }).from(schema.etablissements).where(inArray(schema.etablissements.id, etabIds)),
    base().select({ id: schema.classes.id, libelle: schema.classes.libelle }).from(schema.classes).where(inArray(schema.classes.id, classeIds)),
    base().select().from(schema.decisions).where(inArray(schema.decisions.demandeId, demandes.map((d) => d.id))).orderBy(schema.decisions.horodatage),
  ]);
  const etab = new Map(etabs.map((e) => [e.id, e]));
  const possibles = new Map<string, Awaited<ReturnType<typeof classesAvecPlaces>>>();
  const lignes = dons.map(({ d, don }) => {
    const etat = etatTransfert(d);
    const accueil = etab.get(don.versEtablissementId);
    // Dernière réponse : tout sauf la demande initiale (accord, refus, décision de l'inspection ou retrait).
    const reponse = decisions.filter((x) => x.demandeId === d.id && !(x.etape === "DEMANDE" && x.decision === "valide")).at(-1);
    const peutDecider = etat === "en_attente" && chefDe(profil, don.versEtablissementId);
    const peutImposer = ["en_attente", "expiree", "refusee"].includes(etat) && !!accueil && inspecteurDe(profil, accueil);
    return {
      id: d.id, etat, creeeLe: d.creeeLe.toISOString(), echeance: d.echeance?.toISOString() ?? null, motif: don.motif,
      eleve: eleves.find((e) => e.id === don.apprenantId) ?? { id: don.apprenantId, nom: "", prenoms: "" },
      niveau: don.niveau, anneeScolaire: don.anneeScolaire,
      de: { id: don.deEtablissementId, nom: etab.get(don.deEtablissementId)?.nom ?? don.deEtablissementId },
      vers: { id: don.versEtablissementId, nom: accueil?.nom ?? don.versEtablissementId },
      classeProposee: { id: don.versClasseId, libelle: classes.find((x) => x.id === don.versClasseId)?.libelle ?? don.versClasseId },
      reponse: reponse ? { decision: reponse.decision, motif: reponse.motif, le: reponse.horodatage.toISOString() } : null,
      // Une décision lue dans l'étape qui l'a rendue, jamais dans un libellé que le texte du motif pourrait falsifier.
      impose: reponse?.etape === "IMPOSITION",
      peutDecider, peutImposer, peutRetirer: ["en_attente", "expiree"].includes(etat) && chefDe(profil, don.deEtablissementId),
      classesPossibles: [] as Awaited<ReturnType<typeof classesAvecPlaces>>,
    };
  });
  for (const l of lignes.filter((x) => x.peutDecider || x.peutImposer)) {
    const k = `${l.vers.id}|${l.niveau}|${l.anneeScolaire}`;
    if (!possibles.has(k)) possibles.set(k, await classesAvecPlaces(l.vers.id, l.niveau, l.anneeScolaire));
    l.classesPossibles = possibles.get(k)!;
  }
  return lignes;
}

/** Transferts d'une école : entrants (à accepter ou refuser) et sortants (suivi, retrait). Chef ; inspection en lecture. */
transferts.get("/etablissements/:id/transferts", authentifie, async (c) => {
  const profil = c.get("profil");
  const id = ID_ETAB.parse(c.req.param("id"));
  const [etab] = await base().select().from(schema.etablissements).where(eq(schema.etablissements.id, id));
  if (!etab) throw new HTTPException(404, { message: "Établissement inconnu" });
  const gestion = chefDe(profil, id);
  if (!gestion && !inspecteurDe(profil, etab)) {
    await journaliser(profil, "Consultation des transferts", id, "gestion", false, "perimetre");
    refuser("Établissement hors de votre périmètre : refus journalisé");
  }
  const lignes = await base().select().from(schema.demandes)
    .where(and(eq(schema.demandes.modele, "TRANSFERT"), or(eq(schema.demandes.ressource, id), sql`${schema.demandes.donnees}->>'deEtablissementId' = ${id}`)))
    .orderBy(desc(schema.demandes.creeeLe)).limit(200);
  const decrits = await decrire(profil, lignes);
  await journaliser(profil, "Consultation des transferts", `${id} · ${decrits.length} demande(s)`, gestion ? "gestion" : "controle", true, null);
  return c.json({ entrants: decrits.filter((l) => l.vers.id === id), sortants: decrits.filter((l) => l.de.id === id), tronque: lignes.length === 200 });
});

/** Inspection : transferts vers les écoles de sa circonscription, en attente, expirés ou refusés depuis 90 jours. */
transferts.get("/transferts/inspection", authentifie, async (c) => {
  const profil = c.get("profil");
  const habs = profil.habilitations.filter((h) => h.role === "inspecteur");
  if (!habs.length) {
    await journaliser(profil, "Consultation des transferts à arbitrer", "inspection", "controle", false, "role");
    refuser("Réservé à l'inspection : refus journalisé");
  }
  const lignes = await base().select({ d: schema.demandes, communeId: schema.etablissements.communeId, circonscription: schema.etablissements.circonscription })
    .from(schema.demandes).innerJoin(schema.etablissements, eq(schema.etablissements.id, schema.demandes.ressource))
    .where(and(eq(schema.demandes.modele, "TRANSFERT"), inArray(schema.demandes.statut, ["en_cours", "refusee", "acceptee"]), gt(schema.demandes.creeeLe, new Date(Date.now() - 90 * 86_400_000))))
    .orderBy(desc(schema.demandes.creeeLe)).limit(1000);
  const miennes = lignes.filter((l) => habs.some((h) => couvreEtab(h, { id: l.d.ressource!, communeId: l.communeId, circonscription: l.circonscription }))).map((l) => l.d);
  const decrits = await decrire(profil, miennes);
  await journaliser(profil, "Consultation des transferts à arbitrer", `${decrits.length} demande(s)`, "controle", true, null);
  return c.json({ transferts: decrits, tronque: lignes.length === 1000 });
});

/** Demande de transfert en attente pour un élève (dossier de gestion) — `null` s'il n'y en a pas. */
export async function transfertEnAttente(apprenantId: string) {
  const [d] = await base().select().from(schema.demandes)
    .where(and(eq(schema.demandes.modele, "TRANSFERT"), eq(schema.demandes.statut, "en_cours"), gt(schema.demandes.echeance, new Date()), sql`${schema.demandes.donnees}->>'apprenantId' = ${apprenantId}`)).limit(1);
  if (!d) return null;
  const don = d.donnees as unknown as DonneesTransfert;
  const [vers] = await base().select({ nom: schema.etablissements.nom }).from(schema.etablissements).where(eq(schema.etablissements.id, don.versEtablissementId));
  return { demandeId: d.id, versEtablissement: vers?.nom ?? don.versEtablissementId, echeance: d.echeance!.toISOString() };
}
