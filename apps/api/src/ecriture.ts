import { randomUUID } from "node:crypto";
import type {
  AutoriteDelivrance, Composante, DecisionDiplome, Diplome, DiplomeAtteste, Mention, ModeDeliberation, ModeRetrait, PieceIdentite,
  OfficeDeliberant, RegimePedagogique, SessionEvaluation, StatutCompte, StatutInscriptionUE, StatutJury,
  TypeActe, TypeDecisionAllocation, VoieAcquisition,
} from "@beile/contracts";
import { Evenement } from "@beile/contracts";
import { schema } from "@beile/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { base } from "./commun";
import { notifierFaits } from "./notifications";

/**
 * Point d'écriture unique au registre d'événements.
 * Dans UNE transaction : ajout des événements (table en ajout seul) + mise à jour des projections de
 * lecture (core.scolarites et core.notes pour le K-12, `core.certificats` pour la certification des deux
 * volets, les tables de scolarité du supérieur pour les faits de gestion étudiante,
 * `core.demandes_acte` et `core.allocations_etudiantes` pour le guichet).
 * Puis, hors transaction, génération des notifications aux familles.
 *
 * Une projection ne prend que ce que le fait contient déjà : rejouer `ledger.evenements` doit suffire
 * à reconstruire l'état, sinon le registre n'est qu'un journal d'appoint contourné par la lecture.
 */
/**
 * Une transition d'acte touche exactement une ligne, ou elle n'a pas eu lieu. Levée DANS la
 * transaction, l'erreur annule aussi le fait : le registre ne garde jamais une transition que l'état
 * a refusée (deux guichets qui scelleraient le même acte, une remise d'acte jamais préparé…).
 */
const transitionUnique = (touchees: unknown[], demandeId: string, vers: string) => {
  if (touchees.length !== 1) throw new HTTPException(409, { message: `Demande ${demandeId} : passage à « ${vers} » impossible depuis son état actuel (déjà traitée entre-temps ?)` });
};

export interface NouveauFait {
  type: string;
  apprenantId: string | null;
  enseignantId?: string | null;
  etablissementId: string | null;
  auteurId: string;
  source?: "beile" | "registre_national" | "educmaster" | "examens";
  donnees: Record<string, unknown>;
}

const PLACEMENT = new Set(["INSCRIPTION", "REPRISE", "TRANSFERT", "ABANDON"]);

/** Colonne `date` calendaire, à partir de l'horodatage d'enregistrement du fait. */
const auJour = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Projections du supérieur : la charge utile du fait suffit à reconstruire la ligne, sans accessoire
 * passé au point d'écriture. C'est ce qui rend `ledger.evenements` réellement source de vérité pour
 * ces tables — et non un journal d'appoint que la lecture contourne.
 *
 * Les types de charge utile sont des déclarations locales, pas une revalidation : le contrat zod
 * `Evenement` a validé la forme AVANT l'écriture au registre (`inscrireAuRegistre`). Ils portent les mêmes noms que les
 * membres de l'union pour qu'une divergence saute aux yeux à la relecture des deux fichiers.
 */
type Donnees = Record<string, unknown>;
const vue = <T>(d: Donnees) => d as unknown as T;
interface FaitInscriptionSuperieure { inscriptionId: string; filiereId: string; composante: Composante | null; numeroEtudiant: string | null; anneeUniversitaire: string; regimePedagogique: RegimePedagogique; statutCompte: StatutCompte }
interface FaitInscriptionUe { inscriptionUeId: string; inscriptionSuperieureId: string; apprenantId: string; offreUeId: string; groupeId: string | null; statut: StatutInscriptionUE; motifRefus: string | null }
interface FaitEvaluationUe { offreUeId: string; ueId: string; session: SessionEvaluation; note: number; creditsEcts: number; coefficient: number }
interface FaitValidationUe { validationId: string; ueId: string; offreUeId: string | null; periodeId: string | null; voie: VoieAcquisition; session: SessionEvaluation; creditsAcquis: number; moyenne: number | null; regleValidationId: string; justification: string }
interface FaitJury { juryId: string; autorite: ModeDeliberation; office: OfficeDeliberant | null; diplome: Diplome; periodeId: string | null; filiereId: string | null; sessionExamenId: string | null; statut: StatutJury; president: string; membres: string[]; quorum: number; pvReference: string | null }
interface FaitDeliberation { deliberationId: string; juryId: string; filiereId: string; diplome: Diplome; decision: DecisionDiplome; creditsValides: number; creditsRequis: number; moyenneGenerale: number | null; mention: Mention | null; ueManquantes: string[]; certificatId: string | null }
interface FaitCertification { certificatId: string; examen: DiplomeAtteste; filiereId: string | null; delivrePar: string | null; office: OfficeDeliberant | null; session: string; mention: Mention | null; moyenne: number | null; delivreLe: string; empreinte: string }
interface FaitTransfert { deInscriptionSuperieureId: string; versInscriptionSuperieureId: string; versEtablissementId: string; ueIds: string[] }
interface FaitAbandon { inscriptionSuperieureId: string; anneeUniversitaire: string; motif: string | null }
interface FaitDemandeActe { demandeId: string; typeActe: TypeActe; autorite: AutoriteDelivrance; anneeUniversitaire: string | null; periodeId: string | null; delaiContractuelJours: number; delaiSource: string; motifDemande: string | null; demandeeLe: string }
interface FaitActeInstruction { demandeId: string; prisEnChargeLe: string }
interface FaitActeDisponible { demandeId: string; disponibleLe: string; empreinte: string }
interface FaitActeRemis { demandeId: string; remisLe: string; modeRetrait: ModeRetrait; piecePresentee: PieceIdentite | null; remisA: string | null; referenceQuittance: string | null }
interface FaitActeRefuse { demandeId: string; motif: string; refuseLe: string }
interface FaitActeRetire { demandeId: string; retireLe: string }
interface FaitEcheance { echeanceId: string; anneeUniversitaire: string; typeDecision: TypeDecisionAllocation; dateLimite: string; actesExiges: string[]; autorite: "dbau" | "mesrs"; intitule: string }
interface FaitAllocation { allocationId: string; anneeUniversitaire: string; typeDecision: TypeDecisionAllocation; statutCompte: StatutCompte; autorite: "dbau" | "mesrs" | "etablissement"; referenceActe: string | null; echeanceId: string | null; motif: string | null; decideLe: string }

export async function inscrireAuRegistre(faits: NouveauFait[], avant?: (tx: Parameters<Parameters<ReturnType<typeof base>["transaction"]>[0]>[0]) => Promise<void>) {
  const maintenant = new Date();
  const lignes = faits.map((f) => ({
    id: `EVT-${randomUUID()}`, type: f.type, survenuLe: maintenant, auteurId: f.auteurId, source: f.source ?? ("beile" as const),
    etablissementId: f.etablissementId, apprenantId: f.apprenantId, enseignantId: f.enseignantId ?? null, donnees: f.donnees,
  }));
  // Le contrat avant le registre : chaque fait doit avoir la forme exacte que l'union `Evenement`
  // déclare (base + charge utile). Un écart est une erreur de programmation, jamais une donnée à
  // enregistrer — le registre est la source de vérité de toutes les projections.
  for (const l of lignes) {
    const r = Evenement.safeParse({
      ...l.donnees, id: l.id, type: l.type, survenuLe: maintenant.toISOString(), enregistreLe: maintenant.toISOString(),
      auteurId: l.auteurId, source: l.source, etablissementId: l.etablissementId,
      ...(l.apprenantId ? { apprenantId: l.apprenantId } : {}), ...(l.enseignantId ? { enseignantId: l.enseignantId } : {}),
    });
    if (!r.success) throw new Error(`Fait ${l.type} non conforme au contrat : ${r.error.issues.map((i) => `${i.path.join(".") || "(racine)"} ${i.message}`).join(" ; ").slice(0, 300)}`);
  }
  await base().transaction(async (tx) => {
    if (avant) await avant(tx);
    await tx.insert(schema.evenements).values(lignes);
    // Projection : classe et statut courants, pour les événements de placement.
    const placements = lignes.filter((l) => PLACEMENT.has(l.type) && l.apprenantId);
    if (placements.length) {
      const classeIds = placements.map((p) => (p.donnees.classeId ?? p.donnees.versClasseId) as string | undefined).filter((x): x is string => !!x);
      const classes = classeIds.length ? await tx.select().from(schema.classes).where(inArray(schema.classes.id, classeIds)) : [];
      for (const p of placements) {
        const classeId = p.type === "ABANDON" ? null : ((p.donnees.classeId ?? p.donnees.versClasseId) as string);
        const etablissementId = classeId ? classes.find((c) => c.id === classeId)?.etablissementId ?? null : null;
        const valeurs = { classeId, etablissementId, statut: (p.type === "ABANDON" ? "abandon" : "scolarise") as "abandon" | "scolarise", majLe: maintenant };
        await tx.insert(schema.scolarites).values({ apprenantId: p.apprenantId!, ...valeurs }).onConflictDoUpdate({ target: schema.scolarites.apprenantId, set: valeurs });
      }
    }
    // Projection des notes effectives : chaque évaluation ajoutée, chaque correction appliquée.
    const evaluations = lignes.filter((l) => l.type === "EVALUATION" && l.apprenantId);
    if (evaluations.length) {
      await tx.insert(schema.notes).values(evaluations.map((l) => ({
        evenementId: l.id, apprenantId: l.apprenantId!, classeId: String(l.donnees.classeId), matiere: String(l.donnees.matiere),
        trimestre: Number(l.donnees.trimestre), note: Number(l.donnees.note), noteInitiale: Number(l.donnees.note), survenuLe: maintenant,
      })));
    }
    for (const l of lignes.filter((x) => x.type === "CORRECTION_EVALUATION")) {
      await tx.update(schema.notes).set({ note: Number(l.donnees.nouvelleNote), corrigee: true }).where(eq(schema.notes.evenementId, String(l.donnees.evenementCorrigeId)));
    }

    /* -- Enseignement supérieur : une projection par fait, dans la même transaction. */

    const inscriptions = lignes.filter((l) => l.type === "INSCRIPTION_SUPERIEURE" && l.apprenantId);
    if (inscriptions.length) {
      await tx.insert(schema.inscriptionsSuperieures).values(inscriptions.map((l) => {
        const d = vue<FaitInscriptionSuperieure>(l.donnees);
        return {
          id: d.inscriptionId, apprenantId: l.apprenantId!, etablissementId: l.etablissementId!, filiereId: d.filiereId,
          composante: d.composante, anneeUniversitaire: d.anneeUniversitaire, regimePedagogique: d.regimePedagogique,
          numeroEtudiant: d.numeroEtudiant,
          // Le fait « inscrit » ouvre la promotion : les autres statuts sont portés par leurs propres faits.
          statut: "inscrit" as const, statutCompte: d.statutCompte, inscriteLe: auJour(l.survenuLe),
        };
      }));
    }

    // Contrat d'UE : le même fait peut le faire avancer (proposée → signée → validée), d'où l'upsert
    // sur la clé d'unicité (inscription, offre) plutôt qu'un simple ajout.
    for (const l of lignes.filter((x) => x.type === "INSCRIPTION_UE" && x.apprenantId)) {
      const d = vue<FaitInscriptionUe>(l.donnees);
      const maj = { apprenantId: d.apprenantId, groupeId: d.groupeId, statut: d.statut, motifRefus: d.motifRefus, ...(d.statut === "signee" ? { signeeLe: auJour(l.survenuLe) } : {}) };
      await tx.insert(schema.inscriptionsUe)
        .values({ id: d.inscriptionUeId, inscriptionSuperieureId: d.inscriptionSuperieureId, offreUeId: d.offreUeId, ...maj })
        .onConflictDoUpdate({ target: [schema.inscriptionsUe.inscriptionSuperieureId, schema.inscriptionsUe.offreUeId], set: maj });
    }

    const evalues = lignes.filter((l) => l.type === "EVALUATION_UE" && l.apprenantId);
    if (evalues.length) {
      await tx.insert(schema.notesUe).values(evalues.map((l) => {
        const d = vue<FaitEvaluationUe>(l.donnees);
        return { evenementId: l.id, apprenantId: l.apprenantId!, offreUeId: d.offreUeId, ueId: d.ueId, session: d.session, note: d.note, creditsEcts: d.creditsEcts, coefficient: d.coefficient, survenuLe: l.survenuLe };
      }));
    }

    const validees = lignes.filter((l) => l.type === "VALIDATION_UE" && l.apprenantId && l.etablissementId);
    if (validees.length) {
      await tx.insert(schema.validationsUe).values(validees.map((l) => {
        const d = vue<FaitValidationUe>(l.donnees);
        return {
          id: d.validationId, apprenantId: l.apprenantId!, ueId: d.ueId, offreUeId: d.offreUeId, periodeId: d.periodeId,
          etablissementId: l.etablissementId!, voie: d.voie, creditsAcquis: d.creditsAcquis, moyenne: d.moyenne,
          session: d.session, regleValidationId: d.regleValidationId, justification: d.justification,
          acquiseLe: auJour(l.survenuLe), definitive: true, evenementId: l.id,
        };
      }));
      for (const l of validees) {
        const d = vue<FaitValidationUe>(l.donnees);
        // Le contrat suivi devient « validé » : la note seule ne clos rien, l'acquis oui.
        if (d.offreUeId) {
          await tx.update(schema.inscriptionsUe).set({ statut: "validee" })
            .where(and(eq(schema.inscriptionsUe.apprenantId, l.apprenantId!), eq(schema.inscriptionsUe.offreUeId, d.offreUeId)));
        }
      }
      // Cumul : une somme d'acquis DÉJÀ matérialisés, jamais un recalcul de la décision d'acquisition.
      const cibles = new Map<string, [string, string]>();
      for (const l of validees) cibles.set(`${l.apprenantId}|${l.etablissementId}`, [l.apprenantId!, l.etablissementId!]);
      for (const [apprenantId, etablissementId] of cibles.values()) {
        const [cumul] = await tx.select({ credits: sql<number>`coalesce(sum(${schema.validationsUe.creditsAcquis}), 0)` })
          .from(schema.validationsUe)
          .where(and(eq(schema.validationsUe.apprenantId, apprenantId), eq(schema.validationsUe.etablissementId, etablissementId)));
        const [promotion] = await tx.select({ id: schema.inscriptionsSuperieures.id }).from(schema.inscriptionsSuperieures)
          .where(and(eq(schema.inscriptionsSuperieures.apprenantId, apprenantId), eq(schema.inscriptionsSuperieures.etablissementId, etablissementId)))
          .orderBy(desc(schema.inscriptionsSuperieures.anneeUniversitaire)).limit(1);
        if (promotion) {
          await tx.update(schema.inscriptionsSuperieures).set({ creditsAcquisCumules: Number(cumul?.credits ?? 0) }).where(eq(schema.inscriptionsSuperieures.id, promotion.id));
        }
      }
    }

    // Vie du jury : un fait par transition, la composition complète est rejouée à chaque fois.
    for (const l of lignes.filter((x) => x.type === "JURY_PERIODE")) {
      const d = vue<FaitJury>(l.donnees);
      const maj = {
        autorite: d.autorite, office: d.office, sessionExamenId: d.sessionExamenId, filiereId: d.filiereId,
        periodeId: d.periodeId, diplome: d.diplome, president: d.president, membres: d.membres, quorum: d.quorum,
        statut: d.statut, pvReference: d.pvReference, ...(d.statut === "reuni" ? { reuniLe: auJour(l.survenuLe) } : {}),
      };
      await tx.insert(schema.jurys).values({ id: d.juryId, ...maj }).onConflictDoUpdate({ target: schema.jurys.id, set: maj });
    }

    /* -- Certification : la ligne `core.certificats` est une projection du fait, reconstruisible par son
       seul payload — sceau compris, sinon rejouer le registre produirait un diplôme dont l'empreinte
       diffère de celle qui a été vérifiée le jour de la délivrance. Insérée avant la délibération, qui
       la cite par `certificat_id`. */
    const certifies = lignes.filter((l) => l.type === "CERTIFICATION" && l.apprenantId);
    if (certifies.length) {
      await tx.insert(schema.certificats).values(certifies.map((l) => {
        const d = vue<FaitCertification>(l.donnees);
        return {
          id: d.certificatId, apprenantId: l.apprenantId!, examen: d.examen, session: d.session,
          filiereId: d.filiereId, etablissementId: d.delivrePar, office: d.office,
          mention: d.mention, moyenne: d.moyenne, delivreLe: d.delivreLe, empreinte: d.empreinte,
          revoque: false,
        };
      }));
    }

    const deliberees = lignes.filter((l) => l.type === "DELIBERATION_DIPLOME" && l.apprenantId && l.etablissementId);
    if (deliberees.length) {
      await tx.insert(schema.deliberationsDiplome).values(deliberees.map((l) => {
        const d = vue<FaitDeliberation>(l.donnees);
        return {
          id: d.deliberationId, apprenantId: l.apprenantId!, juryId: d.juryId, etablissementId: l.etablissementId!,
          filiereId: d.filiereId, diplome: d.diplome, decision: d.decision, creditsValides: d.creditsValides,
          creditsRequis: d.creditsRequis, moyenneGenerale: d.moyenneGenerale, mention: d.mention,
          ueManquantes: d.ueManquantes, delibereLe: auJour(l.survenuLe), certificatId: d.certificatId,
        };
      }));
      // Seule l'admission closes la promotion ; « admis sous réserve » laisse l'inscription ouverte.
      for (const l of deliberees.filter((x) => vue<FaitDeliberation>(x.donnees).decision === "admis")) {
        const d = vue<FaitDeliberation>(l.donnees);
        await tx.update(schema.inscriptionsSuperieures).set({ statut: "diplome" })
          .where(and(
            eq(schema.inscriptionsSuperieures.apprenantId, l.apprenantId!),
            eq(schema.inscriptionsSuperieures.etablissementId, l.etablissementId!),
            eq(schema.inscriptionsSuperieures.filiereId, d.filiereId),
          ));
      }
    }

    // Transfert de crédits : le fait rend l'acquis ANTÉRIEUR reconnu, pas acquis une seconde fois.
    // La validation par l'établissement d'accueil reste un fait distinct (`voie: "equivalence"`), sinon
    // le même crédit compterait deux fois dans les effectifs nationaux.
    for (const l of lignes.filter((x) => x.type === "TRANSFERT_CREDITS" && x.apprenantId)) {
      const d = vue<FaitTransfert>(l.donnees);
      if (!d.ueIds.length) continue;
      const ues = await tx.select({ id: schema.unitesEnseignement.id, creditsEcts: schema.unitesEnseignement.creditsEcts })
        .from(schema.unitesEnseignement).where(inArray(schema.unitesEnseignement.id, d.ueIds));
      await tx.insert(schema.equivalences).values(ues.map((ue) => ({
        // Identifiant dérivé du fait et de l'UE : une reconstruction du registre ne doit pas créer
        // une reconnaissance différente à chaque passage.
        id: `EQC-${l.id.slice(4)}-${ue.id}`,
        apprenantId: l.apprenantId!, etablissementId: d.versEtablissementId, ueId: ue.id,
        titreOrigine: `Report de crédits depuis l'inscription ${d.deInscriptionSuperieureId}`,
        etablissementOrigine: null, anneeOrigine: null, creditsReconnus: ue.creditsEcts,
        statut: "accordee" as const, autorite: "etablissement" as const,
        motif: `Transfert de crédits enregistré par le fait ${l.id}`, decidePar: l.auteurId, decideLe: auJour(l.survenuLe),
      })));
    }

    for (const l of lignes.filter((x) => x.type === "ABANDON_SUPERIEUR" && x.apprenantId)) {
      const d = vue<FaitAbandon>(l.donnees);
      // Double clause : un identifiant d'inscription deviné ne peut fermer la promotion d'autrui.
      await tx.update(schema.inscriptionsSuperieures).set({ statut: "abandon" })
        .where(and(eq(schema.inscriptionsSuperieures.id, d.inscriptionSuperieureId), eq(schema.inscriptionsSuperieures.apprenantId, l.apprenantId!)));
    }

    /* -- Guichet de l'étudiant : la demande d'acte est une ligne de suivi, son cycle de vie un fait.
       Les dates viennent du payload (`demandeeLe`, `disponibleLe`, `remisLe`) et non de `survenuLe` :
       un guichet qui enregistre le lendemain ne doit pas fabriquer un jour de retard. */

    for (const l of lignes.filter((x) => x.type === "DEMANDE_ACTE" && x.apprenantId)) {
      const d = vue<FaitDemandeActe>(l.donnees);
      await tx.insert(schema.demandesActe).values({
        id: d.demandeId, apprenantId: l.apprenantId!, etablissementId: l.etablissementId, typeActe: d.typeActe,
        autorite: d.autorite, anneeUniversitaire: d.anneeUniversitaire, periodeId: d.periodeId,
        statut: "demandee", delaiContractuelJours: d.delaiContractuelJours, delaiSource: d.delaiSource,
        motifDemande: d.motifDemande, demandeeLe: d.demandeeLe,
      });
    }
    for (const l of lignes.filter((x) => x.type === "ACTE_EN_INSTRUCTION")) {
      const d = vue<FaitActeInstruction>(l.donnees);
      await tx.update(schema.demandesActe).set({ statut: "en_instruction" }).where(and(
        eq(schema.demandesActe.id, d.demandeId),
        eq(schema.demandesActe.apprenantId, l.apprenantId ?? ""),
        eq(schema.demandesActe.statut, "demandee"),
      )).returning({ id: schema.demandesActe.id }).then((r) => transitionUnique(r, d.demandeId, "en instruction"));
    }
    for (const l of lignes.filter((x) => x.type === "ACTE_DISPONIBLE")) {
      const d = vue<FaitActeDisponible>(l.donnees);
      await tx.update(schema.demandesActe).set({ statut: "disponible", disponibleLe: d.disponibleLe, empreinte: d.empreinte }).where(and(
        eq(schema.demandesActe.id, d.demandeId),
        eq(schema.demandesActe.apprenantId, l.apprenantId ?? ""),
        // Un acte déjà scellé ne se rescelle pas (le premier document remis deviendrait « altéré »),
        // et un acte remis ne se « redispose » pas : la remise clôt le cycle.
        sql`${schema.demandesActe.statut} in ('demandee', 'en_instruction')`,
      )).returning({ id: schema.demandesActe.id }).then((r) => transitionUnique(r, d.demandeId, "disponible"));
    }
    for (const l of lignes.filter((x) => x.type === "ACTE_REMIS")) {
      const d = vue<FaitActeRemis>(l.donnees);
      await tx.update(schema.demandesActe).set({
        statut: "remise", remisLe: d.remisLe, modeRetrait: d.modeRetrait, piecePresentee: d.piecePresentee,
        remisA: d.remisA, referenceQuittance: d.referenceQuittance,
      }).where(and(
        eq(schema.demandesActe.id, d.demandeId),
        eq(schema.demandesActe.apprenantId, l.apprenantId ?? ""),
        // La remise suppose l'acte prêt : sans cette clause, on pourrait remettre un acte jamais préparé.
        eq(schema.demandesActe.statut, "disponible"),
      )).returning({ id: schema.demandesActe.id }).then((r) => transitionUnique(r, d.demandeId, "remise"));
    }
    for (const l of lignes.filter((x) => x.type === "ACTE_REFUSE")) {
      const d = vue<FaitActeRefuse>(l.donnees);
      // Un refus retire l'acte du circuit : la date de mise à disposition ET son sceau disparaissent,
      // sinon le service public vérifierait un document que l'administration a pourtant retiré.
      await tx.update(schema.demandesActe).set({ statut: "refusee", motifRefus: d.motif, disponibleLe: null, empreinte: null }).where(and(
        eq(schema.demandesActe.id, d.demandeId),
        eq(schema.demandesActe.apprenantId, l.apprenantId ?? ""),
        sql`${schema.demandesActe.statut} in ('demandee', 'en_instruction', 'disponible')`,
      )).returning({ id: schema.demandesActe.id }).then((r) => transitionUnique(r, d.demandeId, "refusée"));
    }
    for (const l of lignes.filter((x) => x.type === "ACTE_RETIRE")) {
      const d = vue<FaitActeRetire>(l.donnees);
      await tx.update(schema.demandesActe).set({ statut: "retiree" }).where(and(
        eq(schema.demandesActe.id, d.demandeId),
        eq(schema.demandesActe.apprenantId, l.apprenantId ?? ""),
        // Seul le dépôt n'a personne à prévenir : dès l'instruction, c'est au guichet de statuer.
        eq(schema.demandesActe.statut, "demandee"),
      )).returning({ id: schema.demandesActe.id }).then((r) => transitionUnique(r, d.demandeId, "retirée"));
    }

    /* -- Allocations : une échéance déclarée, une décision datée. Aucun montant ne passe par ici. */

    /** Conflit jugé sur la CLÉ NATURELLE et non sur l'identifiant : un fait dont l'identifiant aurait
     *  été choisi par le client ne doit jamais pouvoir réécrire la ligne d'un autre. La ligne déjà
     *  ouverte garde son identité — c'est elle qu'une allocation cite par `echeance_id`. */
    for (const l of lignes.filter((x) => x.type === "ECHEANCE_DEPOT")) {
      const d = vue<FaitEcheance>(l.donnees);
      const cles = { anneeUniversitaire: d.anneeUniversitaire, typeDecision: d.typeDecision };
      const valeurs = { dateLimite: d.dateLimite, actesExiges: d.actesExiges, autorite: d.autorite, intitule: d.intitule };
      await tx.insert(schema.echeancesDepot).values({ id: d.echeanceId, ...cles, ...valeurs })
        .onConflictDoUpdate({
          target: [schema.echeancesDepot.anneeUniversitaire, schema.echeancesDepot.typeDecision],
          set: valeurs,
        });
    }
    for (const l of lignes.filter((x) => x.type === "ALLOCATION_DECIDEE" && x.apprenantId)) {
      const d = vue<FaitAllocation>(l.donnees);
      const cles = { apprenantId: l.apprenantId!, anneeUniversitaire: d.anneeUniversitaire, typeDecision: d.typeDecision };
      const valeurs = {
        etablissementId: l.etablissementId, statut: d.statutCompte, autorite: d.autorite, referenceActe: d.referenceActe,
        decideLe: d.decideLe, echeanceId: d.echeanceId, motif: d.motif,
      };
      await tx.insert(schema.allocationsEtudiantes).values({ id: d.allocationId, ...cles, ...valeurs })
        .onConflictDoUpdate({
          target: [schema.allocationsEtudiantes.apprenantId, schema.allocationsEtudiantes.anneeUniversitaire, schema.allocationsEtudiantes.typeDecision],
          set: valeurs,
        });
      // Le décompte national d'une promotion suit la décision : c'est la projection de `statut_compte`,
      // et rien d'autre — la ligne d'allocation garde l'autorité et la référence du texte.
      await tx.update(schema.inscriptionsSuperieures).set({ statutCompte: d.statutCompte }).where(and(
        eq(schema.inscriptionsSuperieures.apprenantId, l.apprenantId!),
        eq(schema.inscriptionsSuperieures.anneeUniversitaire, d.anneeUniversitaire),
        ...(l.etablissementId ? [eq(schema.inscriptionsSuperieures.etablissementId, l.etablissementId)] : []),
      ));
    }
  });
  // Les notifications ne doivent jamais faire échouer l'écriture au registre.
  await notifierFaits(lignes.filter((l) => l.apprenantId).map((l) => ({ id: l.id, type: l.type, apprenantId: l.apprenantId!, donnees: l.donnees }))).catch((e) => console.error("Notifications :", e));
  return lignes.map((l) => l.id);
}

/** Identifiant de saisie côté client (file hors connexion) : clé d'idempotence des écritures rejouées. */
export const ID_SAISIE = z.string().regex(/^[A-Za-z0-9-]{8,64}$/).optional();

/** Événements déjà enregistrés pour cette saisie (rejeu après une réponse perdue) : on les renvoie sans rien réécrire. */
/**
 * Rejeu d'une saisie déjà enregistrée. Un lot qui écrit plusieurs faits pour un même apprenant suffixe
 * son identifiant (`idSaisie:ue`, `idSaisie:apprenant`) : on passe alors la liste exacte des clés
 * attendues. Égalité sur l'expression indexée et prédicat de l'index partiel : la recherche reste une
 * lecture d'index, jamais un parcours de tous les faits du type.
 */
export async function dejaSaisi(idSaisie: string | readonly string[] | undefined, type: string, apprenantId?: string) {
  const cles = typeof idSaisie === "string" ? [idSaisie] : [...(idSaisie ?? [])];
  if (!cles.length) return null;
  const lignes = await base().select({ id: schema.evenements.id }).from(schema.evenements)
    .where(and(
      eq(schema.evenements.type, type),
      sql`${schema.evenements.donnees} ? 'idSaisie'`,
      sql`${schema.evenements.donnees}->>'idSaisie' in (${sql.join(cles.map((c) => sql`${c}`), sql`, `)})`,
      ...(apprenantId ? [eq(schema.evenements.apprenantId, apprenantId)] : []),
    ));
  return lignes.length ? lignes.map((l) => l.id) : null;
}

/** Classe courante d'un ensemble d'apprenants, lue dans la projection (lecture indexée). */
export async function classesCourantes(apprenantIds: string[]) {
  if (!apprenantIds.length) return new Map<string, string | null>();
  const lignes = await base().select().from(schema.scolarites).where(inArray(schema.scolarites.apprenantId, apprenantIds));
  return new Map(lignes.map((l) => [l.apprenantId, l.statut === "scolarise" ? l.classeId : null]));
}

export async function effectifClasse(classeId: string) {
  return (await base().select({ id: schema.scolarites.apprenantId }).from(schema.scolarites).where(eq(schema.scolarites.classeId, classeId))).length;
}
