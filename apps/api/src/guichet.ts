import { randomUUID } from "node:crypto";
import type {
  AttestationScolarite, DelaisConstates, DemandeActe, DossierAllocation, EcheanceDepot, PassageConstate,
  VerificationActe,
} from "@beile/contracts";
import {
  BAREME_DELAI, DecisionGuichet, LIBELLE_ACTE, precedenceDe, StatutCompte, StatutDemande, TypeActe,
  TypeDecisionAllocation, transitionValide,
} from "@beile/contracts";
import { schema } from "@beile/db";
import { empreinteContenu } from "@beile/db/securite";
import { aujourdhui } from "@beile/simulation/scolarite";
import { communesDuPerimetre } from "@beile/simulation/semantique";
import { and, asc, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authentifie, base, cleUtilisateur, corps, journaliser, limiteDebit, type Variables } from "./commun";
import { lireEnv } from "./env";
import { dejaSaisi, ID_SAISIE, inscrireAuRegistre } from "./ecriture";
import { inscriptionDe } from "./etudiants-superieur";
import { accesEtablissement, bureauSup, ID_ETAB, monApprenant } from "./superieur";
import { perimetrePilotage } from "./pilotage";

/**
 * Guichet de l'étudiant — délivrer les actes administratifs, et dater qui les retarde.
 *
 * Doctrine, identique au reste du supérieur et non négociable :
 *  - AUCUN NOUVEAU RÔLE. Quatre portes, toutes préexistantes : `monApprenant` (l'étudiant ne voit et ne
 *    dépose que pour lui), `accesEtablissement` (le guichet d'un chef d'établissement, et la lecture
 *    seule de l'inspecteur de sa circonscription), `bureauSup` (l'État qui déclare un calendrier de
 *    dépôt, statue sur une allocation, ou clos une demande restée sans guichet), `perimetrePilotage`
 *    (des effectifs et des médianes, jamais une ligne nominative).
 *  - LE REGISTRE SEUL ÉCRIT L'ÉTAT. Demande, prise en charge, mise à disposition, remise, refus, retrait,
 *    décision d'allocation et échéance déclarée sont huit faits ; `core.demandes_acte`,
 *    `core.echeances_depot` et `core.allocations_etudiantes` n'en sont que les projections (`ecriture.ts`).
 *  - LE DÉLAI N'EST PAS UNE OPINION. Il est copié du barème publié (`BAREME_DELAI`, fiches CatIS) au jour
 *    du dépôt, avec sa source citée, et l'autorité qui doit signer est nommée sur la ligne. « Ça tarde »
 *    ne se soigne pas ; « la DEC retarde de quarante jours sur les diplômes de telle université » oui.
 *  - LA CHAÎNE EST OPPOSABLE. Un acte ne se délivre que si son préalable administratif a été REMIS
 *    (`precedenceDe`) ET si les faits qu'il certifie existent (une inscription, des notes, des crédits,
 *    une délibération). Un refus sans motif, une remise sans mode de retrait ni pièce nommée n'existent
 *    pas dans ce modèle : ils ne se prouveraient à personne.
 *  - L'ARGENT RESTE AILLEURS. Une allocation est un statut daté, signé par une autorité nommée, avec
 *    référence du texte : aucun montant, aucun échéancier, aucun RIB. Une quittance n'entre ici que
 *    comme référence.
 *  - LES AGRÉGATS NE RÉIDENT PAS. Un délai national se lit par établissement et par autorité, à la
 *    médiane et non à la moyenne, avec le drapeau `petiteUnite` sous le seuil de publication national.
 */
export const guichet = new Hono<{ Variables: Variables }>();

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ANNEE = z.string().regex(/^\d{4}-\d{4}$/);
const ID_PERIODE = z.string().regex(/^PRI-[A-Za-z0-9-]+$/);
const ID_APPRENANT = z.string().regex(/^APP-\d{6}$/);
const ID_DEMANDE = z.string().regex(/^ACTE-[A-Za-z0-9-]+$/);
const ID_ECHEANCE = z.string().regex(/^ECH-[A-Za-z0-9-]+$/);
/** Sous dix demandes, une ligne de délai par établissement devient un annuaire de demandeurs. */
const SEUIL_PUBLICATION = 10;

const jours = (de: string, vers: string) => Math.round((Date.parse(vers) - Date.parse(de)) / 86_400_000);
const arrondi = (n: number) => Math.round(n * 100) / 100;

type DemandeLue = typeof schema.demandesActe.$inferSelect;
/** L'inscription au titre de l'année demandée — lue dans la projection, jamais fournie par le client. */
async function inscriptionCourante(apprenantId: string, anneeUniversitaire: string | null) {
  return anneeUniversitaire
    ? await inscriptionDe(apprenantId, undefined, anneeUniversitaire)
    : await inscriptionDe(apprenantId);
}
type InscriptionLue = NonNullable<Awaited<ReturnType<typeof inscriptionCourante>>>;

/* ------------------------------------------------------------------ Sceau et lecture enrichie */

/**
 * Empreinte d'un acte prêt : les champs qu'un tiers peut recompter sans notre base. Elle est posée à la
 * mise à disposition — le document scellé est celui de ce jour-là, pas une moyenne mobile.
 * Avec `BEILE_CLE_SEAU`, le sceau devient un MAC : le rôle qui écrit dans la base ne connaît pas la
 * clef, donc avancer en base une date de mise à disposition ne produirait plus un sceau valide.
 */
const sceau = (d: { id: string; apprenantId: string; typeActe: string; anneeUniversitaire: string | null; periodeId: string | null; disponibleLe: string | null }) =>
  empreinteContenu(["acte", d.id, d.apprenantId, d.typeActe, d.anneeUniversitaire, d.periodeId, d.disponibleLe], lireEnv().CLE_SEAU);

/**
 * Jours écoulés et retard sur le délai publié, calculés à la lecture et jamais stockés : un retard figé
 * dans une colonne mentirait dès le lendemain. Un acte disponible se juge à sa mise à disposition (le
 * retrait relève de l'étudiant), une demande encore ouverte à aujourd'hui.
 */
function enActe(d: DemandeLue): DemandeActe {
  const fin = d.disponibleLe ?? (d.statut === "remise" ? d.remisLe : d.statut === "refusee" || d.statut === "retiree" ? null : aujourdhui());
  const ecoules = fin ? jours(d.demandeeLe, fin) : null;
  return { ...d, joursEcoules: ecoules, retardJours: ecoules === null ? null : Math.max(0, ecoules - d.delaiContractuelJours) };
}

type StatutVise = DecisionGuichet["statut"];
const FAIT_TRANSITION: Record<StatutVise, string> = {
  en_instruction: "ACTE_EN_INSTRUCTION", disponible: "ACTE_DISPONIBLE", remise: "ACTE_REMIS", refusee: "ACTE_REFUSE",
};

/* ------------------------------------------------------------------ Ce que l'acte doit certifier */

async function periodesDeAnnee(filiereId: string, annee: string) {
  return base().select({ id: schema.periodes.id, creditsAttendus: schema.periodes.creditsAttendus }).from(schema.periodes)
    .where(and(eq(schema.periodes.filiereId, filiereId), eq(schema.periodes.anneeUniversitaire, annee)));
}

/**
 * Les faits que l'acte atteste, vérifiés avant le dépôt : un relevé sans note, une progression sans
 * crédit, un diplôme sans délibération seraient des documents faux délivrés sur demande. Le motif
 * renvoyé est celui que l'étudiant lit — il dit quoi faire, pas seulement que c'est refusé.
 */
async function empechements(apprenantId: string, insc: InscriptionLue, typeActe: TypeActe, periodeIds: string[]) {
  switch (typeActe) {
    case "releve_de_notes": {
      if (!periodeIds.length) return ["aucune période déclarée pour cette année dans votre filière : le relevé n'aurait rien à dater"];
      const [{ n } = { n: 0 }] = await base().select({ n: count() }).from(schema.notesUe)
        .innerJoin(schema.offresUe, eq(schema.offresUe.id, schema.notesUe.offreUeId))
        .where(and(eq(schema.notesUe.apprenantId, apprenantId), inArray(schema.offresUe.periodeId, periodeIds)));
      return Number(n) ? [] : ["aucune note saisie au titre de cette année : un relevé ne se fabrique pas à partir de rien"];
    }
    case "attestation_de_progression": {
      if (!periodeIds.length) return ["aucune période déclarée pour cette année : la progression ne peut être constatée"];
      const [{ c } = { c: 0 }] = await base().select({ c: sql<number>`coalesce(sum(${schema.validationsUe.creditsAcquis}), 0)` }).from(schema.validationsUe)
        .where(and(
          eq(schema.validationsUe.apprenantId, apprenantId), eq(schema.validationsUe.etablissementId, insc.etablissementId),
          inArray(schema.validationsUe.periodeId, periodeIds),
        ));
      return Number(c) ? [] : ["aucun crédit validé cette année : l'attestation affirmerait un passage qu'aucun acquis n'enregistre"];
    }
    case "attestation_reussite_provisoire":
    case "attestation_reussite_definitive":
    case "diplome":
    case "duplicata_de_diplome": {
      const [delib] = await base().select().from(schema.deliberationsDiplome)
        .where(and(
          eq(schema.deliberationsDiplome.apprenantId, apprenantId), eq(schema.deliberationsDiplome.etablissementId, insc.etablissementId),
          eq(schema.deliberationsDiplome.filiereId, insc.filiereId),
        ))
        .orderBy(desc(schema.deliberationsDiplome.delibereLe));
      if (!delib) return ["aucune délibération enregistrée pour votre filière : c'est elle qui tarde, et le fait du jury en est la seule preuve"];
      const exigees: string[] = typeActe === "attestation_reussite_provisoire" ? ["admis", "admis_sous_reserve"] : ["admis"];
      if (!exigees.includes(delib.decision)) return [`le jury a rendu « ${delib.decision} » le ${delib.delibereLe} : cet acte exige ${exigees.join(" ou ")}`];
      return [];
    }
    default:
      // Une attestation de scolarité n'atteste que l'inscription, déjà vérifiée par le demandeur.
      return [];
  }
}

/**
 * Le préalable administratif, tel que les fiches le formulent (`PS00941` exige l'originale de l'attestation
 * provisoire, `PS00940` la définitive) : l'acte antérieur doit avoir été REMIS, pas seulement préparé.
 */
async function verifierPrealable(apprenantId: string, typeActe: TypeActe, annee: string) {
  const prealable = precedenceDe(typeActe);
  if (!prealable) return;
  const [obtenu] = await base().select({ id: schema.demandesActe.id }).from(schema.demandesActe)
    .where(and(
      eq(schema.demandesActe.apprenantId, apprenantId), eq(schema.demandesActe.typeActe, prealable),
      eq(schema.demandesActe.statut, "remise"), eq(schema.demandesActe.anneeUniversitaire, annee),
    )).limit(1);
  if (!obtenu) {
    throw new HTTPException(409, { message: `« ${LIBELLE_ACTE[typeActe]} » exige l'original du « ${LIBELLE_ACTE[prealable]} » pour ${annee} : demandez d'abord celui-là` });
  }
}

/* ================================================================== L'étudiant : ses démarches */

/** Ses demandes, enrichies de ce qu'il veut savoir : est-ce prêt, est-ce en retard, de combien de jours. */
guichet.get("/moi/actes", authentifie, async (c) => {
  const profil = c.get("profil");
  const apprenantId = monApprenant(profil);
  const statut = c.req.query("statut") ? StatutDemande.parse(c.req.query("statut")) : null;
  const typeActe = c.req.query("typeActe") ? TypeActe.parse(c.req.query("typeActe")) : null;
  const lignes = await base().select().from(schema.demandesActe)
    .where(and(
      eq(schema.demandesActe.apprenantId, apprenantId),
      ...(statut ? [eq(schema.demandesActe.statut, statut)] : []),
      ...(typeActe ? [eq(schema.demandesActe.typeActe, typeActe)] : []),
    ))
    .orderBy(desc(schema.demandesActe.demandeeLe));
  await journaliser(profil, "Consultation de ses démarches administratives", `${lignes.length} demande(s)`, "consultation_personnelle", true, null);
  return c.json(lignes.map(enActe));
});

/**
 * Déposer une demande d'acte. Le client ne choisit NI l'autorité NI le délai NI l'établissement :
 * autorité et barème viennent du barème publié, l'établissement de l'inscription. Un délai laissé à la
 * main du demandeur serait un délai qu'aucun guichet ne devrait respecter.
 */
guichet.post("/moi/actes/demande", authentifie, limiteDebit(20, 60_000, cleUtilisateur), async (c) => {
  const profil = c.get("profil");
  const apprenantId = monApprenant(profil);
  const saisie = await corps(c, z.object({
    typeActe: TypeActe,
    anneeUniversitaire: ANNEE.nullable().default(null),
    periodeId: ID_PERIODE.nullable().default(null),
    motifDemande: z.string().trim().max(200).nullable().default(null),
    idSaisie: ID_SAISIE,
  }).strict());
  const deja = await dejaSaisi(saisie.idSaisie, "DEMANDE_ACTE");
  if (deja) return c.json({ demandeId: null, evenementId: deja[0], deja: true }, 200);

  const insc = await inscriptionCourante(apprenantId, saisie.anneeUniversitaire);
  if (!insc) {
    throw new HTTPException(404, { message: `Aucune inscription dans l'enseignement supérieur${saisie.anneeUniversitaire ? ` pour ${saisie.anneeUniversitaire}` : ""} : hors scolarité, aucun acte ne se délivre` });
  }
  const annee = insc.anneeUniversitaire;
  const bareme = BAREME_DELAI[saisie.typeActe];
  if (saisie.typeActe === "duplicata_de_diplome" && !saisie.motifDemande) {
    throw new HTTPException(422, { message: "Un duplicata doit dire pourquoi : sans trace de la perte, ce serait un second original" });
  }
  const periodes = await periodesDeAnnee(insc.filiereId, annee);
  if (saisie.periodeId && !periodes.some((p) => p.id === saisie.periodeId)) {
    throw new HTTPException(422, { message: "Période étrangère à votre filière ou à cette année universitaire" });
  }
  const idsPeriode = saisie.periodeId ? [saisie.periodeId] : periodes.map((p) => p.id);
  // Une demande déjà ouverte au même titre : la file du guichet ne se double pas.
  const [ouverte] = await base().select({ id: schema.demandesActe.id }).from(schema.demandesActe)
    .where(and(
      eq(schema.demandesActe.apprenantId, apprenantId), eq(schema.demandesActe.typeActe, saisie.typeActe),
      eq(schema.demandesActe.anneeUniversitaire, annee),
      inArray(schema.demandesActe.statut, ["demandee", "en_instruction", "disponible"]),
    )).limit(1);
  if (ouverte) throw new HTTPException(409, { message: `Une demande de « ${LIBELLE_ACTE[saisie.typeActe]} » est déjà en cours (${ouverte.id})` });

  await verifierPrealable(apprenantId, saisie.typeActe, annee);
  const empeche = await empechements(apprenantId, insc, saisie.typeActe, idsPeriode);
  if (empeche.length) throw new HTTPException(409, { message: `« ${LIBELLE_ACTE[saisie.typeActe]} » impossible : ${empeche.join(" ; ")}` });

  const demandeId = `ACTE-${randomUUID()}`;
  const [evenementId] = await inscrireAuRegistre([{
    type: "DEMANDE_ACTE", auteurId: profil.id, etablissementId: insc.etablissementId, apprenantId,
    donnees: {
      apprenantId, demandeId, typeActe: saisie.typeActe, autorite: bareme.autorite, anneeUniversitaire: annee,
      periodeId: saisie.periodeId, delaiContractuelJours: bareme.jours, delaiSource: bareme.source,
      motifDemande: saisie.motifDemande, demandeeLe: aujourdhui(), ...(saisie.idSaisie ? { idSaisie: saisie.idSaisie } : {}),
    },
  }]);
  await journaliser(profil, "Dépôt d'une demande d'acte administratif", `${saisie.typeActe} · ${annee}`, "consultation_personnelle", true, null);
  return c.json({
    demandeId, evenementId, statut: "demandee", autorite: bareme.autorite,
    delaiContractuelJours: bareme.jours, delaiSource: bareme.source,
    attenduLe: new Date(Date.parse(aujourdhui()) + bareme.jours * 86_400_000).toISOString().slice(0, 10),
  }, 201);
});

/** Retirer sa propre demande : elle reste lisible, un dépôt qui n'aurait jamais existé ne se prouverait plus. */
guichet.post("/moi/actes/:demandeId/retirer", authentifie, async (c) => {
  const profil = c.get("profil");
  const apprenantId = monApprenant(profil);
  const demandeId = ID_DEMANDE.parse(c.req.param("demandeId"));
  const [d] = await base().select().from(schema.demandesActe).where(eq(schema.demandesActe.id, demandeId));
  if (!d || d.apprenantId !== apprenantId) throw new HTTPException(404, { message: "Demande introuvable" });
  if (!transitionValide(d.statut, "retiree")) {
    throw new HTTPException(409, { message: `Une demande « ${d.statut} » ne se retire pas : dès la prise en charge, c'est au guichet de statuer` });
  }
  const [evenementId] = await inscrireAuRegistre([{
    type: "ACTE_RETIRE", auteurId: profil.id, etablissementId: d.etablissementId, apprenantId,
    donnees: { apprenantId, demandeId, retireLe: aujourdhui() },
  }]);
  await journaliser(profil, "Retrait d'une demande d'acte", demandeId, "consultation_personnelle", true, null);
  return c.json({ demandeId, statut: "retiree", evenementId });
});

/**
 * Couche A — l'attestation de scolarité et de progression, recalculée depuis les faits d'inscription,
 * d'acquis et de délibération. C'est la pièce que la DBAU réclame (`PS01179`, `PS01180`) : saisie à la
 * main, elle ne certifierait plus rien. La moyenne vient du jury qui l'a arrêtée, jamais d'un calcul
 * parallèle qui produirait une moyenne que personne n'a jugée.
 */
async function attestationDe(apprenantId: string, annee: string | null): Promise<AttestationScolarite> {
  const insc = await inscriptionCourante(apprenantId, annee);
  if (!insc) throw new HTTPException(404, { message: "Aucune inscription dans l'enseignement supérieur : rien à attester" });
  const [filiere, etab] = await Promise.all([
    base().select().from(schema.filiereSuperieure).where(eq(schema.filiereSuperieure.id, insc.filiereId)).then((x) => x[0]),
    base().select().from(schema.etablissements).where(eq(schema.etablissements.id, insc.etablissementId)).then((x) => x[0]),
  ]);
  if (!filiere || !etab) throw new HTTPException(404, { message: "Filière ou établissement d'attache introuvable" });
  const periodes = await periodesDeAnnee(insc.filiereId, insc.anneeUniversitaire);
  const idsPeriode = periodes.map((p) => p.id);
  const [validations, delib] = await Promise.all([
    idsPeriode.length ? base().select({ credits: schema.validationsUe.creditsAcquis }).from(schema.validationsUe)
      .where(and(
        eq(schema.validationsUe.apprenantId, apprenantId), eq(schema.validationsUe.etablissementId, insc.etablissementId),
        inArray(schema.validationsUe.periodeId, idsPeriode),
      )) : [],
    base().select().from(schema.deliberationsDiplome)
      .where(and(
        eq(schema.deliberationsDiplome.apprenantId, apprenantId), eq(schema.deliberationsDiplome.etablissementId, insc.etablissementId),
        eq(schema.deliberationsDiplome.filiereId, insc.filiereId),
      ))
      .orderBy(desc(schema.deliberationsDiplome.delibereLe)).limit(1),
  ]);
  const [porteuse] = await base().select().from(schema.demandesActe)
    .where(and(
      eq(schema.demandesActe.apprenantId, apprenantId),
      inArray(schema.demandesActe.typeActe, ["attestation_de_scolarite", "attestation_de_progression"]),
      eq(schema.demandesActe.anneeUniversitaire, insc.anneeUniversitaire),
    ))
    .orderBy(desc(schema.demandesActe.disponibleLe), desc(schema.demandesActe.demandeeLe));
  const decision = delib[0] ?? null;
  const passage = (decision ? decision.decision : "non_delibere") as PassageConstate;
  const creditsAcquisAnnee = validations.reduce((s, v) => s + v.credits, 0);
  const creditsAttendusAnnee = periodes.reduce((s, p) => s + p.creditsAttendus, 0);
  const moyenne = decision?.moyenneGenerale ?? null;
  return {
    apprenantId,
    numeroEtudiant: insc.numeroEtudiant,
    etablissementId: insc.etablissementId,
    etablissementNom: etab.nom,
    filiereIntitule: filiere.nom,
    diplomeVise: filiere.diplomeVise,
    composante: insc.composante,
    anneeUniversitaire: insc.anneeUniversitaire,
    regimePedagogique: insc.regimePedagogique,
    inscriteLe: insc.inscriteLe,
    creditsAcquisAnnee,
    creditsAcquisCumules: insc.creditsAcquisCumules,
    creditsAttendusAnnee,
    moyennePonderee: moyenne === null ? null : arrondi(moyenne),
    passage,
    delibereLe: decision?.delibereLe ?? null,
    delivreLe: porteuse?.disponibleLe ?? aujourdhui(),
    // Un aperçu non délivré porte une empreinte de contenu, pas un sceau : `delivre: false` le dit à
    // l'écran plutôt que de laisser croire à un document signé.
    empreinte: porteuse?.empreinte
      ?? empreinteContenu(["apercu", apprenantId, insc.etablissementId, insc.filiereId, insc.anneeUniversitaire, creditsAcquisAnnee, insc.creditsAcquisCumules, creditsAttendusAnnee, passage]),
    demandeId: porteuse?.id ?? null,
    delivre: !!porteuse?.disponibleLe,
  };
}

guichet.get("/moi/attestation-scolarite", authentifie, async (c) => {
  const profil = c.get("profil");
  const apprenantId = monApprenant(profil);
  const annee = c.req.query("annee") ? ANNEE.parse(c.req.query("annee")) : null;
  const attestation = await attestationDe(apprenantId, annee);
  await journaliser(profil, "Consultation de son attestation de scolarité", `${attestation.anneeUniversitaire} · ${attestation.delivre ? "délivrée" : "aperçu"}`, "consultation_personnelle", true, null);
  return c.json(attestation);
});

/** Ses décisions d'allocation (couche B) : statut, autorité, référence du texte, date. Jamais un montant. */
guichet.get("/moi/allocations", authentifie, async (c) => {
  const profil = c.get("profil");
  const apprenantId = monApprenant(profil);
  const lignes = await base().select().from(schema.allocationsEtudiantes)
    .where(eq(schema.allocationsEtudiantes.apprenantId, apprenantId))
    .orderBy(desc(schema.allocationsEtudiantes.anneeUniversitaire), desc(schema.allocationsEtudiantes.decideLe));
  await journaliser(profil, "Consultation de ses décisions d'allocation", `${lignes.length} décision(s)`, "consultation_personnelle", true, null);
  return c.json(lignes);
});

/**
 * Couche C — son dossier au regard du calendrier de dépôt : ce qui est exigé, ce que le registre a déjà
 * produit, dans combien de jours ça ferme. Une pièce prête au guichet mais non retirée compte manquante,
 * et `statutDemande` le dit : c'est l'action qui reste à faire, donc l'information qui sert.
 */
guichet.get("/moi/dossier-allocation", authentifie, async (c) => {
  const profil = c.get("profil");
  const apprenantId = monApprenant(profil);
  const insc = await inscriptionCourante(apprenantId, c.req.query("annee") ? ANNEE.parse(c.req.query("annee")) : null);
  if (!insc) throw new HTTPException(404, { message: "Aucune inscription dans l'enseignement supérieur" });
  const anneeUniversitaire = insc.anneeUniversitaire;
  const [decisions, echeances] = await Promise.all([
    base().select().from(schema.allocationsEtudiantes)
      .where(and(eq(schema.allocationsEtudiantes.apprenantId, apprenantId), eq(schema.allocationsEtudiantes.anneeUniversitaire, anneeUniversitaire)))
      .orderBy(desc(schema.allocationsEtudiantes.decideLe)),
    base().select().from(schema.echeancesDepot).where(eq(schema.echeancesDepot.anneeUniversitaire, anneeUniversitaire)),
  ]);
  // Sans décision enregistrée, l'échéance qui concerne l'intéressé est celle d'une première demande.
  const typeDecision: TypeDecisionAllocation = c.req.query("typeDecision")
    ? TypeDecisionAllocation.parse(c.req.query("typeDecision"))
    : decisions[0]?.typeDecision ?? "attribution";
  const echeance = echeances.find((e) => e.typeDecision === typeDecision) ?? null;
  const pieces: DossierAllocation["pieces"] = [];
  for (const typeActe of TypeActe.array().parse(echeance?.actesExiges ?? [])) {
    const [d] = await base().select().from(schema.demandesActe)
      .where(and(
        eq(schema.demandesActe.apprenantId, apprenantId), eq(schema.demandesActe.typeActe, typeActe),
        eq(schema.demandesActe.anneeUniversitaire, anneeUniversitaire),
      ))
      .orderBy(desc(schema.demandesActe.remisLe), desc(schema.demandesActe.disponibleLe), desc(schema.demandesActe.demandeeLe));
    pieces.push({ typeActe, produiteLe: d?.remisLe ?? null, statutDemande: d?.statut ?? null });
  }
  const today = aujourdhui();
  const incomplete = pieces.some((p) => !p.produiteLe);
  const dossier: DossierAllocation = {
    apprenantId, anneeUniversitaire, typeDecision,
    echeance: echeance ? { ...echeance, actesExiges: TypeActe.array().parse(echeance.actesExiges) } : null,
    joursRestants: echeance ? jours(today, echeance.dateLimite) : null,
    pieces,
    statut: !echeance ? "sans_echeance" : !incomplete ? "complet" : echeance.dateLimite < today ? "hors_delai" : "incomplet",
  };
  await journaliser(profil, "Consultation de son dossier d'allocation", `${anneeUniversitaire} · ${dossier.statut}`, "consultation_personnelle", true, null);
  return c.json(dossier);
});

/* ================================================================== Le guichet d'un établissement */

/** File du guichet : nominative, donc sous la porte établissement — jamais sous `perimetrePilotage`.
 *  Le nom accompagne la ligne : un agent qui statue sur `APP-004218` sans le lire statuerait au hasard. */
guichet.get("/etablissements/:id/actes", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil, finalite } = await accesEtablissement(c, id);
  const statut = c.req.query("statut") ? StatutDemande.parse(c.req.query("statut")) : null;
  const typeActe = c.req.query("typeActe") ? TypeActe.parse(c.req.query("typeActe")) : null;
  const annee = c.req.query("annee") ? ANNEE.parse(c.req.query("annee")) : null;
  // Le retard ne se juge que sur une demande encore ouverte : un acte disponible a son retard clos.
  const enRetard = c.req.query("retard") === "1";
  const lignes = await base().select({
    demande: schema.demandesActe,
    apprenant: { id: schema.apprenants.id, nom: schema.apprenants.nom, prenoms: schema.apprenants.prenoms },
  }).from(schema.demandesActe)
    .innerJoin(schema.apprenants, eq(schema.apprenants.id, schema.demandesActe.apprenantId))
    .where(and(
      eq(schema.demandesActe.etablissementId, id),
      ...(statut ? [eq(schema.demandesActe.statut, statut)] : []),
      ...(typeActe ? [eq(schema.demandesActe.typeActe, typeActe)] : []),
      ...(annee ? [eq(schema.demandesActe.anneeUniversitaire, annee)] : []),
      ...(enRetard ? [inArray(schema.demandesActe.statut, ["demandee", "en_instruction"])] : []),
    ))
    .orderBy(asc(schema.demandesActe.demandeeLe));
  const vues = lignes
    .map((l) => ({ ...enActe(l.demande), apprenant: l.apprenant }))
    .filter((d) => !enRetard || (d.retardJours ?? 0) > 0);
  await journaliser(profil, "Consultation de la file du guichet", `${vues.length} demande(s)`, finalite, true, null);
  return c.json(vues);
});

/**
 * Décision du guichet : une seule route, le statut visé porté par le corps, et les transitions du
 * contrat qui décident des champs obligatoires. La clause d'état de la projection (`ecriture.ts`) fait
 * le reste : une remise ne peut exister que sur un acte déclaré disponible.
 */
async function decider(c: Context<{ Variables: Variables }>, demandeId: string, decision: DecisionGuichet, etablissementId: string | null, action: string, habilitationEtat = false) {
  const profil = c.get("profil");
  const [d] = await base().select().from(schema.demandesActe).where(eq(schema.demandesActe.id, demandeId));
  if (!d) throw new HTTPException(404, { message: "Demande d'acte introuvable" });
  if (etablissementId && d.etablissementId !== etablissementId) {
    await journaliser(profil, action, `${demandeId} · hors de votre guichet`, "gestion", false, "perimetre");
    throw new HTTPException(403, { message: "Acte déposé dans un autre établissement : refus journalisé" });
  }
  /**
   * Marquer un acte « prêt », c'est attester qu'il est signé. Or un diplôme se signe à la DEC, un
   * duplicata de diplôme national à la DGES : laisser le guichet d'établissement sceller ces
   * actes-là, ce serait publier via le service de vérification « authentique · autorité DEC » sans
   * que la DEC ait agi. Le guichet garde la préparation et la remise (c'est son rôle physique), pas la
   * signature d'autrui.
   */
  if (decision.statut === "disponible" && d.autorite !== "etablissement" && !habilitationEtat) {
    await journaliser(profil, action, `${demandeId} · signature d'un acte relevant de ${d.autorite}`, "gestion", false, "autorite");
    throw new HTTPException(403, { message: `« ${LIBELLE_ACTE[d.typeActe]} » se signe auprès de l'autorité ${d.autorite} : le guichet d'établissement prépare et remet, il ne scelle pas` });
  }
  // Symétrique : sceller l'acte d'un guichet depuis l'écran national produirait la même fausse attestation.
  if (decision.statut === "disponible" && habilitationEtat && d.autorite === "etablissement") {
    await journaliser(profil, action, `${demandeId} · signature à la place du guichet d'établissement`, "gestion", false, "autorite");
    throw new HTTPException(403, { message: "Cet acte relève du guichet de l'établissement : l'écran national ne signe pas à sa place" });
  }
  if (!transitionValide(d.statut, decision.statut)) {
    await journaliser(profil, action, `${demandeId} · ${d.statut} vers ${decision.statut}`, "gestion", false, "transition");
    throw new HTTPException(409, { message: `Un acte « ${d.statut} » ne devient pas « ${decision.statut} »` });
  }
  const date = decision.date ?? aujourdhui();
  if (date > aujourdhui()) throw new HTTPException(422, { message: "Une date future ne peut certifier un acte déjà accompli" });
  if (date < d.demandeeLe) throw new HTTPException(422, { message: `Date antérieure au dépôt (${d.demandeeLe}) : la chaîne de dates serait fausse` });

  const donnees: Record<string, unknown> = { apprenantId: d.apprenantId, demandeId };
  if (decision.statut === "refusee") {
    if (!decision.motif) throw new HTTPException(422, { message: "Un refus sans motif ne se conteste pas : il n'existe pas dans ce modèle" });
    Object.assign(donnees, { motif: decision.motif, refuseLe: date });
  } else if (decision.statut === "disponible") {
    Object.assign(donnees, { disponibleLe: date, empreinte: sceau({ ...d, disponibleLe: date }) });
  } else if (decision.statut === "en_instruction") {
    Object.assign(donnees, { prisEnChargeLe: date });
  } else {
    if (!decision.modeRetrait) throw new HTTPException(422, { message: "Une remise doit nommer son mode de retrait (fiche CatIS PS00189)" });
    if (decision.modeRetrait !== "dematerialise" && !decision.piecePresentee) {
      throw new HTTPException(422, { message: "Au guichet, la pièce présentée est obligatoire : sans elle, la remise n'est pas prouvée" });
    }
    if (decision.modeRetrait === "mandataire" && decision.piecePresentee !== "procuration_notariee" && decision.piecePresentee !== "procuration_tribunal") {
      throw new HTTPException(422, { message: "Un mandataire doit présenter une procuration notariée ou établie au tribunal" });
    }
    if (decision.modeRetrait !== "titulaire" && decision.modeRetrait !== "dematerialise" && !decision.remisA) {
      throw new HTTPException(422, { message: "L'acte est remis à autrui : nommer le réceptionnaire" });
    }
    Object.assign(donnees, {
      remisLe: date, modeRetrait: decision.modeRetrait,
      piecePresentee: decision.piecePresentee ?? null,
      // Un titulaire ne « reçoit » pas son propre nom : la colonne reste vide plutôt que dupliquée.
      remisA: decision.modeRetrait === "titulaire" || decision.modeRetrait === "dematerialise" ? null : decision.remisA ?? null,
      referenceQuittance: decision.referenceQuittance ?? null,
    });
  }
  const [evenementId] = await inscrireAuRegistre([{
    type: FAIT_TRANSITION[decision.statut], auteurId: profil.id, etablissementId: d.etablissementId, apprenantId: d.apprenantId, donnees,
  }]);
  // La projection porte une clause d'état : si elle n'a pas bougé, un autre agent a clos la ligne entre
  // notre lecture et l'écriture. Le fait reste au registre (la tentative est tracée), l'état ne s'invente pas.
  const [apres] = await base().select({ statut: schema.demandesActe.statut }).from(schema.demandesActe).where(eq(schema.demandesActe.id, demandeId));
  if (apres?.statut !== decision.statut) {
    await journaliser(profil, action, `${demandeId} · déjà ${apres?.statut ?? "clos"} entre-temps`, "gestion", false, "concurrence");
    throw new HTTPException(409, { message: `La demande est passée à « ${apres?.statut ?? "clos"} » entre-temps : aucune seconde écriture` });
  }
  await journaliser(profil, action, `${demandeId} · ${decision.statut}`, "gestion", true, null);
  const [ligne] = await base().select().from(schema.demandesActe).where(eq(schema.demandesActe.id, demandeId));
  return { acte: enActe(ligne!), evenementId };
}

guichet.post("/etablissements/:id/actes/:demandeId/decision", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const demandeId = ID_DEMANDE.parse(c.req.param("demandeId"));
  await accesEtablissement(c, id, true);
  const decision = await corps(c, DecisionGuichet);
  const { acte, evenementId } = await decider(c, demandeId, decision, id, "Décision du guichet sur une demande d'acte");
  return c.json({ acte, evenementId });
});

/* ------------------------------------------------------------------ Délais constatés : médiane, pas moyenne */

/**
 * Une ligne par (établissement, acte, autorité, délai applicable) : si le barème bouge en cours de route,
 * deux lignes coexistent plutôt qu'un mélange qui jugerait une promotion sur une règle nouvelle. La
 * médiane mesure `demande → mise à disposition`, seul tronçon imputable à l'administration.
 */
async function delaisParUnite(etablissementIds: Set<string> | null) {
  const d = schema.demandesActe;
  if (etablissementIds && !etablissementIds.size) return [];
  const lignes = await base().select({
    etablissementId: d.etablissementId,
    etablissementNom: schema.etablissements.nom,
    typeActe: d.typeActe,
    autorite: d.autorite,
    delaiContractuelJours: d.delaiContractuelJours,
    demandes: count(),
    remises: sql<number>`count(*) filter (where ${d.statut} = 'remise')`,
    dansDelai: sql<number>`count(*) filter (where ${d.disponibleLe} is not null and ${d.disponibleLe} - ${d.demandeeLe} <= ${d.delaiContractuelJours})`,
    medianeJours: sql<number | null>`round(percentile_cont(0.5) within group (order by ${d.disponibleLe} - ${d.demandeeLe}))::int`,
  }).from(d)
    .innerJoin(schema.etablissements, eq(schema.etablissements.id, d.etablissementId))
    .where(and(isNotNull(d.etablissementId), ...(etablissementIds ? [inArray(d.etablissementId, [...etablissementIds])] : [])))
    .groupBy(d.etablissementId, schema.etablissements.nom, d.typeActe, d.autorite, d.delaiContractuelJours)
    .orderBy(asc(schema.etablissements.nom), asc(d.typeActe));
  return lignes.map((l): DelaisConstates => ({
    etablissementId: l.etablissementId!,
    etablissementNom: l.etablissementNom,
    typeActe: l.typeActe,
    autorite: l.autorite,
    delaiContractuelJours: l.delaiContractuelJours,
    demandes: Number(l.demandes),
    remises: Number(l.remises),
    dansDelai: Number(l.dansDelai),
    medianeJours: l.medianeJours === null ? null : Number(l.medianeJours),
    petiteUnite: Number(l.demandes) < SEUIL_PUBLICATION,
  }));
}

/** Ce que le guichet doit à SES usagers : porte établissement, donc détail assumé. */
guichet.get("/etablissements/:id/actes/delais", authentifie, async (c) => {
  const id = ID_ETAB.parse(c.req.param("id"));
  const { profil, finalite } = await accesEtablissement(c, id);
  const lignes = await delaisParUnite(new Set([id]));
  await journaliser(profil, "Consultation des délais de son guichet", `${lignes.length} ligne(s)`, finalite, true, null);
  return c.json(lignes);
});

/** Comparateur national : sous périmètre de pilotage, donc borné aux communes de l'agent. */
guichet.get("/enseignement-superieur/actes/delais", authentifie, async (c) => {
  const profil = c.get("profil");
  const communes = communesDuPerimetre(perimetrePilotage(profil));
  const idsEtab = communes === null ? null : new Set((await base().select({ id: schema.etablissements.id }).from(schema.etablissements)
    .where(and(eq(schema.etablissements.cycle, "superieur"), inArray(schema.etablissements.communeId, [...communes])))).map((e) => e.id));
  const lignes = await delaisParUnite(idsEtab);
  await journaliser(profil, "Consultation nationale des délais de délivrance", `${lignes.length} ligne(s)`, "statistique", true, null);
  return c.json(lignes);
});

/* ================================================================== L'État : calendrier, allocations, actes sans guichet */

/**
 * Déclarer une échéance nationale de dépôt. Une date d'administration n'est pas une constante de code :
 * elle bouge chaque année et c'est l'autorité qui la fixe. Sans déclaration, l'étudiant lit
 * `sans_echeance` — l'aveu d'un trou de règle, mieux qu'une date inventée.
 */
guichet.post("/enseignement-superieur/echeances", authentifie, async (c) => {
  const profil = await bureauSup(c, "Déclaration d'une échéance nationale de dépôt");
  const saisie = await corps(c, z.object({
    anneeUniversitaire: ANNEE, typeDecision: TypeDecisionAllocation, dateLimite: DATE,
    actesExiges: z.array(TypeActe).max(7).default([]),
    autorite: z.enum(["dbau", "mesrs"]),
    intitule: z.string().trim().min(3).max(120),
  }).strict());
  /** L'identité de la ligne se joue sur la clé naturelle (année, type de décision), pas sur un
   *  identifiant venu du client : avec le sien, l'agent pourrait réécrire une autre ligne. */
  const echeanceId = `ECH-${randomUUID()}`;
  const [evenementId] = await inscrireAuRegistre([{
    type: "ECHEANCE_DEPOT", auteurId: profil.id, etablissementId: null, apprenantId: null,
    donnees: {
      echeanceId, anneeUniversitaire: saisie.anneeUniversitaire, typeDecision: saisie.typeDecision,
      dateLimite: saisie.dateLimite, actesExiges: saisie.actesExiges, autorite: saisie.autorite, intitule: saisie.intitule,
    },
  }]);
  await journaliser(profil, "Déclaration d'une échéance nationale de dépôt", `${saisie.anneeUniversitaire} · ${saisie.typeDecision} → ${saisie.dateLimite}`, "controle", true, null);
  return c.json({ echeanceId, evenementId }, 201);
});

/** Le calendrier tel que déclaré : une date administrative n'est pas une donnée sensible. */
guichet.get("/enseignement-superieur/echeances", authentifie, async (c) => {
  const profil = c.get("profil");
  perimetrePilotage(profil);
  const annee = c.req.query("annee") ? ANNEE.parse(c.req.query("annee")) : null;
  const lignes = await base().select().from(schema.echeancesDepot)
    .where(annee ? eq(schema.echeancesDepot.anneeUniversitaire, annee) : undefined)
    .orderBy(asc(schema.echeancesDepot.dateLimite));
  await journaliser(profil, "Consultation du calendrier national des dépôts", `${lignes.length} échéance(s)`, "statistique", true, null);
  return c.json(lignes.map((l): EcheanceDepot => ({ ...l, actesExiges: TypeActe.array().parse(l.actesExiges) })));
});

/**
 * Statuer une allocation : un statut, une autorité nommée, une référence de texte, une date. La
 * projection retourne `inscriptions_superieures.statut_compte`, qui n'est que la lecture de ce fait —
 * un décompte national saisi à la main dans la colonne serait un décompte libre.
 */
guichet.post("/enseignement-superieur/allocations", authentifie, async (c) => {
  const profil = await bureauSup(c, "Décision d'allocation étudiante");
  const saisie = await corps(c, z.object({
    apprenantId: ID_APPRENANT, anneeUniversitaire: ANNEE,
    typeDecision: TypeDecisionAllocation, statutCompte: StatutCompte,
    autorite: z.enum(["dbau", "mesrs", "etablissement"]),
    referenceActe: z.string().trim().max(120).nullable().default(null),
    echeanceId: ID_ECHEANCE.nullable().default(null),
    motif: z.string().trim().max(200).nullable().default(null),
    decideLe: DATE.nullable().default(null),
  }).strict());
  const [apprenant] = await base().select({ id: schema.apprenants.id }).from(schema.apprenants).where(eq(schema.apprenants.id, saisie.apprenantId));
  if (!apprenant) throw new HTTPException(404, { message: "Apprenant inconnu" });
  if (saisie.echeanceId) {
    const [e] = await base().select({ id: schema.echeancesDepot.id }).from(schema.echeancesDepot).where(eq(schema.echeancesDepot.id, saisie.echeanceId));
    if (!e) throw new HTTPException(404, { message: "Échéance de dépôt inconnue" });
  }
  // Un secours n'est pas une bourse : le MESRS les compte à part, et les fondre fausserait le décompte.
  if ((saisie.typeDecision === "secours") !== (saisie.statutCompte === "secours")) {
    throw new HTTPException(422, { message: "Un secours se statue « secours », et une bourse ne se statue pas « secours »" });
  }
  /** Comme pour l'échéance : la ligne d'allocation se joue sur (apprenant, année, type de décision),
   *  et l'identité reste celle de la ligne déjà ouverte plutôt qu'un identifiant fourni. */
  const allocationId = `ALO-${randomUUID()}`;
  const insc = await inscriptionCourante(saisie.apprenantId, saisie.anneeUniversitaire);
  const [evenementId] = await inscrireAuRegistre([{
    type: "ALLOCATION_DECIDEE", auteurId: profil.id, etablissementId: insc?.etablissementId ?? null, apprenantId: saisie.apprenantId,
    donnees: {
      apprenantId: saisie.apprenantId, allocationId, anneeUniversitaire: saisie.anneeUniversitaire,
      typeDecision: saisie.typeDecision, statutCompte: saisie.statutCompte, autorite: saisie.autorite,
      referenceActe: saisie.referenceActe, echeanceId: saisie.echeanceId, motif: saisie.motif,
      decideLe: saisie.decideLe ?? aujourdhui(),
    },
  }]);
  await journaliser(profil, "Décision d'allocation étudiante", `${saisie.apprenantId} · ${saisie.typeDecision} ${saisie.statutCompte}`, "controle", true, null);
  return c.json({ allocationId, statutCompte: saisie.statutCompte, etablissementId: insc?.etablissementId ?? null, evenementId }, 201);
});

/**
 * Combien d'allocataires, par année, nature de décision et autorité qui a statué. Uniquement des
 * comptages : la ligne nominative reste sous la porte établissement, et une répartition par filière
 * d'une petite promotion se lirait comme un annuaire.
 */
guichet.get("/enseignement-superieur/allocations/effectifs", authentifie, async (c) => {
  const profil = c.get("profil");
  perimetrePilotage(profil);
  const annee = c.req.query("annee") ? ANNEE.parse(c.req.query("annee")) : null;
  const where = annee ? eq(schema.allocationsEtudiantes.anneeUniversitaire, annee) : undefined;
  const [parStatut, parDecision, parAutorite] = await Promise.all([
    base().select({ anneeUniversitaire: schema.allocationsEtudiantes.anneeUniversitaire, statut: schema.allocationsEtudiantes.statut, effectif: count() })
      .from(schema.allocationsEtudiantes).where(where)
      .groupBy(schema.allocationsEtudiantes.anneeUniversitaire, schema.allocationsEtudiantes.statut)
      .orderBy(asc(schema.allocationsEtudiantes.anneeUniversitaire)),
    base().select({ anneeUniversitaire: schema.allocationsEtudiantes.anneeUniversitaire, typeDecision: schema.allocationsEtudiantes.typeDecision, effectif: count() })
      .from(schema.allocationsEtudiantes).where(where)
      .groupBy(schema.allocationsEtudiantes.anneeUniversitaire, schema.allocationsEtudiantes.typeDecision),
    base().select({ autorite: schema.allocationsEtudiantes.autorite, effectif: count() })
      .from(schema.allocationsEtudiantes).where(where).groupBy(schema.allocationsEtudiantes.autorite),
  ]);
  const nombres = <T extends { effectif: number }>(lignes: T[]) => lignes.map((l) => ({ ...l, effectif: Number(l.effectif) }));
  await journaliser(profil, "Consultation des effectifs d'allocataires", `${parStatut.length} ligne(s)`, "statistique", true, null);
  return c.json({ parStatut: nombres(parStatut), parDecision: nombres(parDecision), parAutorite: nombres(parAutorite) });
});

/** L'État peut clos une demande restée sans guichet : même code, mêmes clauses, porte différente. */
guichet.post("/enseignement-superieur/actes/:demandeId/decision", authentifie, async (c) => {
  const demandeId = ID_DEMANDE.parse(c.req.param("demandeId"));
  await bureauSup(c, "Décision de l'État sur une demande d'acte");
  const decision = await corps(c, DecisionGuichet);
  const { acte, evenementId } = await decider(c, demandeId, decision, null, "Décision de l'État sur une demande d'acte", true);
  return c.json({ acte, evenementId });
});

/* ================================================================== Service public de vérification */

/**
 * Vérifier un acte sans compte et sans identité révélée : le service dit qu'un acte existe, quand il a
 * été mis à disposition et sous quelle autorité — ni à qui, ni ce qu'il contient. Un annuaire de
 * diplômes consultable par n'importe qui serait une fuite, pas un service.
 */
guichet.get("/actes/:demandeId/verification", limiteDebit(30, 60_000), async (c) => {
  const demandeId = ID_DEMANDE.parse(c.req.param("demandeId"));
  const [d] = await base().select().from(schema.demandesActe).where(eq(schema.demandesActe.id, demandeId));
  let r: VerificationActe;
  if (!d) {
    r = { statut: "introuvable", explication: "Aucun acte délivré ne porte cet identifiant." };
  } else if (d.statut === "retiree") {
    // Le dépôt a existé et son auteur l'a annulé : le dire vaut mieux qu'un « introuvable » qui
    // laisserait croire à un faux, alors qu'aucun document n'a jamais été mis à disposition.
    r = { statut: "retire", demandeId, libelle: LIBELLE_ACTE[d.typeActe], explication: "Cette demande a été retirée par son auteur : aucun document n'a été délivré sous cet identifiant." };
  } else if (!d.empreinte || !d.disponibleLe) {
    r = { statut: "introuvable", explication: "Aucun acte délivré ne porte cet identifiant." };
  } else if (d.empreinte !== sceau(d)) {
    r = { statut: "altere", demandeId, explication: "Le document présenté ne correspond pas à l'acte mis à disposition." };
  } else {
    r = {
      statut: "authentique", demandeId, typeActe: d.typeActe, libelle: LIBELLE_ACTE[d.typeActe],
      autorite: d.autorite, anneeUniversitaire: d.anneeUniversitaire, delivreLe: d.disponibleLe,
    };
  }
  await journaliser({ id: "public", nomAffiche: "Vérification publique" }, "Vérification d'un acte", `${demandeId} · ${r.statut}`, "controle", true, null);
  return c.json(r);
});
