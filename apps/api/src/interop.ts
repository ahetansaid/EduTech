import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Mention, SourceDonnee } from "@beile/contracts";
import { CODE_CERTIFICAT, Examen, homologationOperante, StatutCompte, TypeDecisionAllocation } from "@beile/contracts";
import { schema } from "@beile/db";
import { aujourdhui } from "@beile/simulation/scolarite";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { sceauCertificat } from "./certification";
import { base, journaliser, limiteDebitPartage, type Variables } from "./commun";
import { classesCourantes, dejaSaisi, inscrireAuRegistre, type NouveauFait } from "./ecriture";
import { lireEnv } from "./env";
import { LigneVerdict, mentionDe, publierSession, recevoirPv, sessionParLibelle } from "./examens";

/**
 * Interopérabilité : BEILE est la couche NATIONALE, pas un logiciel de gestion de plus. Les systèmes qui
 * produisent les faits les lui transmettent, dans l'esprit de la plateforme nationale X-Road :
 *   - EducMaster (MEMP · MESTFP)  → la vie scolaire (absences) ;
 *   - eRESULTATS (DEC-MEMP pour le CEP, DEC-MESTFP pour le BEPC et le BAC) → le procès-verbal des
 *     examens, puis la publication ;
 *   - l'université (SI de scolarité) → le PV de délibération d'un diplôme national ;
 *   - la DBAU → les décisions d'allocation.
 * BEILE contrôle (mêmes règles que la saisie : homologation, crédits, scolarité réelle), rattache la
 * personne par son NPI, inscrit au registre AVEC SA SOURCE et scelle. Les écrans de saisie ne sont plus
 * que le mode secours d'un établissement non connecté.
 *
 * Authentification d'un système, pas d'une personne : chaque partenaire signe le corps exact de sa
 * requête (HMAC-SHA256 d'un secret partagé, `BEILE_PARTENAIRES`), avec un horodatage (±5 min, anti-rejeu)
 * et un identifiant de lot (idempotence : un lot rejoué ne double rien). Chaque partenaire n'envoie que
 * ses types de messages ; l'université n'engage que ses propres établissements.
 */
export const interop = new Hono<{ Variables: Variables }>();

type IdPartenaire = "educmaster" | "eresultats" | "uac" | "dbau";
export const PARTENAIRES: Readonly<Record<IdPartenaire, { nom: string; source: SourceDonnee; messages: string[]; racine?: string }>> = {
  educmaster: { nom: "EducMaster (MEMP · MESTFP)", source: "educmaster", messages: ["absences"] },
  eresultats: { nom: "eRESULTATS (DEC-MEMP · DEC-MESTFP)", source: "examens", messages: ["pv-examen", "publication"] },
  uac: { nom: "Université d'Abomey-Calavi (SI de scolarité)", source: "universite", messages: ["pv-diplome"], racine: "ETB-SUP-UAC" },
  dbau: { nom: "DBAU (MESRS)", source: "dbau", messages: ["allocations"] },
};

const FENETRE_MS = 5 * 60_000;
const ENTETES = z.object({
  partenaire: z.enum(["educmaster", "eresultats", "uac", "dbau"]),
  horodatage: z.coerce.number().int(),
  lot: z.string().regex(/^[A-Za-z0-9-]{8,48}$/),
  signature: z.string().regex(/^[0-9a-f]{64}$/),
});

/** Signature attendue d'une requête : HMAC-SHA256(secret, horodatage.lot.corps). Exposée pour les clients. */
export const signer = (secret: string, horodatage: number, lot: string, corps: string) =>
  createHmac("sha256", secret).update(`${horodatage}.${lot}.${corps}`).digest("hex");

/** Authentifie le système appelant et rend son corps JSON. Tout refus est journalisé, sans détail exploitable. */
async function partenaire(c: Context<{ Variables: Variables }>, message: string) {
  const brut = await c.req.text();
  const h = ENTETES.safeParse({
    partenaire: c.req.header("x-beile-partenaire"), horodatage: c.req.header("x-beile-horodatage"),
    lot: c.req.header("x-beile-lot"), signature: c.req.header("x-beile-signature")?.toLowerCase(),
  });
  const refus = async (motif: string) => {
    await journaliser({ id: `partenaire:${h.success ? h.data.partenaire : "inconnu"}`, nomAffiche: "Connecteur d'interopérabilité" }, `Message « ${message} » refusé`, motif, "controle", false, "authentification");
    return new HTTPException(401, { message: "Partenaire non authentifié" });
  };
  if (!h.success) throw await refus("en-têtes d'authentification absents ou mal formés");
  const { partenaire: id, horodatage, lot, signature } = h.data;
  const secret = lireEnv().PARTENAIRES[id];
  if (!secret) throw await refus("partenaire non provisionné");
  if (Math.abs(Date.now() - horodatage) > FENETRE_MS) throw await refus("horodatage hors fenêtre (rejeu ?)");
  const attendue = Buffer.from(signer(secret, horodatage, lot, brut), "hex");
  const recue = Buffer.from(signature, "hex");
  if (attendue.length !== recue.length || !timingSafeEqual(attendue, recue)) throw await refus("signature invalide");
  const conf = PARTENAIRES[id];
  if (!conf.messages.includes(message)) {
    await journaliser({ id: `partenaire:${id}`, nomAffiche: conf.nom }, `Message « ${message} » hors habilitation`, lot, "controle", false, "role");
    throw new HTTPException(403, { message: `Le partenaire « ${id} » n'est pas habilité à transmettre « ${message} »` });
  }
  let json: unknown;
  try { json = JSON.parse(brut); } catch { throw new HTTPException(400, { message: "Corps JSON invalide" }); }
  return { id, conf, lot, json, auteur: { id: `partenaire:${id}`, nomAffiche: conf.nom } };
}

const valider = <T>(schemaZod: z.ZodType<T>, v: unknown): T => {
  const r = schemaZod.safeParse(v);
  if (!r.success) throw new HTTPException(422, { message: `Message non conforme : ${r.error.issues.map((i) => `${i.path.join(".") || "corps"} ${i.message}`).join(" ; ").slice(0, 400)}` });
  return r.data;
};

/** Personnes désignées par leur NPI (identifiant national, ANIP) → apprenants du registre. */
async function parNpi(npis: string[]) {
  const lignes = npis.length ? await base().select({ id: schema.apprenants.id, npi: schema.apprenants.npi, prenoms: schema.apprenants.prenoms, nom: schema.apprenants.nom })
    .from(schema.apprenants).where(inArray(schema.apprenants.npi, [...new Set(npis)])) : [];
  return new Map(lignes.map((l) => [l.npi!, l]));
}
const NPI = z.string().regex(/^\d{10}$/);
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ANNEE = z.string().regex(/^\d{4}-\d{4}$/);

interop.use("/interop/*", limiteDebitPartage("interop", 600, 60_000, (c) => String(c.req.header("x-beile-partenaire") ?? "inconnu")));

/* ------------------------------------------------------------------ EducMaster : vie scolaire */

interop.post("/interop/educmaster/absences", async (c) => {
  const p = await partenaire(c, "absences");
  const m = valider(z.object({
    etablissementId: z.string().regex(/^ETB-[A-Za-z0-9-]+$/), classeId: z.string().regex(/^CLS-[A-Za-z0-9-]+$/),
    date: DATE, absents: z.array(NPI).min(1).max(120),
  }).strict(), p.json);
  const idSaisie = `LOT-${p.lot}`;
  const deja = await dejaSaisi(idSaisie, "ABSENCE");
  if (deja) return c.json({ lot: p.lot, deja: true, enregistres: deja.length });
  const [classe] = await base().select().from(schema.classes).where(eq(schema.classes.id, m.classeId));
  if (!classe || classe.etablissementId !== m.etablissementId) throw new HTTPException(422, { message: "Classe inconnue ou hors de cet établissement" });
  const personnes = await parNpi(m.absents);
  const ids = [...personnes.values()].map((x) => x.id);
  const [courantes, dejaAbsents] = await Promise.all([
    classesCourantes(ids),
    // Une absence déjà inscrite (appel fait dans BEILE, ou lot précédent) ne se compte pas deux fois.
    ids.length ? base().select({ a: schema.evenements.apprenantId }).from(schema.evenements).where(and(
      eq(schema.evenements.type, "ABSENCE"), inArray(schema.evenements.apprenantId, ids), sql`${schema.evenements.donnees}->>'date' = ${m.date}`)) : [],
  ]);
  const dejaLe = new Set(dejaAbsents.map((x) => x.a));
  const rejets: { npi: string; motif: string }[] = [];
  const faits: NouveauFait[] = [];
  for (const npi of new Set(m.absents)) {
    const a = personnes.get(npi);
    if (!a) { rejets.push({ npi, motif: "NPI inconnu du registre" }); continue; }
    if (courantes.get(a.id) !== m.classeId) { rejets.push({ npi, motif: "Non scolarisé dans cette classe" }); continue; }
    if (dejaLe.has(a.id)) { rejets.push({ npi, motif: "Absence déjà inscrite pour cette date" }); continue; }
    faits.push({ type: "ABSENCE", auteurId: p.auteur.id, etablissementId: m.etablissementId, apprenantId: a.id, source: "educmaster",
      donnees: { apprenantId: a.id, classeId: m.classeId, date: m.date, justifiee: false, anneeScolaire: classe.anneeScolaire, idSaisie } });
  }
  const enregistres = faits.length ? await inscrireAuRegistre(faits) : [];
  await journaliser(p.auteur, "Réception d'absences (EducMaster)", `${m.classeId} · ${m.date} · ${enregistres.length} absence(s), ${rejets.length} rejet(s)`, "gestion", true, null);
  return c.json({ lot: p.lot, enregistres: enregistres.length, rejets }, 201);
});

/* ------------------------------------------------------------------ eRESULTATS : examens nationaux */

interop.post("/interop/eresultats/pv-examen", async (c) => {
  const p = await partenaire(c, "pv-examen");
  const m = valider(z.object({
    examen: Examen, session: z.string().trim().min(3).max(40), pvReference: z.string().trim().min(3).max(80),
    decisions: z.array(LigneVerdict).min(1).max(5000),
  }).strict(), p.json);
  return c.json({ lot: p.lot, ...(await recevoirPv(await sessionParLibelle(m.examen, m.session), m.decisions, m.pvReference, p.auteur)) });
});

interop.post("/interop/eresultats/publication", async (c) => {
  const p = await partenaire(c, "publication");
  const m = valider(z.object({ examen: Examen, session: z.string().trim().min(3).max(40) }).strict(), p.json);
  return c.json({ lot: p.lot, ...(await publierSession(await sessionParLibelle(m.examen, m.session), p.auteur, "examens")) });
});

/* ------------------------------------------------------------------ Université : PV de délibération d'un diplôme */

/**
 * L'université délibère (jury de capitalisation, dans son propre SI) et transmet le PV signé. BEILE
 * contrôle ce qui relève de l'État — établissement public de son périmètre, filière homologuée,
 * inscription réelle de l'étudiant dans la filière, crédits au moins égaux au volume du diplôme — puis
 * certifie au nom de l'établissement, sceau à clef. Un ajournement est enregistré par le PV, pas certifié.
 */
interop.post("/interop/uac/pv-diplome", async (c) => {
  const p = await partenaire(c, "pv-diplome");
  const m = valider(z.object({
    pvReference: z.string().trim().min(3).max(80), filiereId: z.string().regex(/^FIL-[A-Za-z0-9-]+$/), anneeUniversitaire: ANNEE,
    decisions: z.array(z.object({
      npi: NPI, decision: z.enum(["admis", "ajourne"]), creditsValides: z.number().int().min(0).max(600), moyenne: z.number().min(0).max(20).nullable(),
    }).strict()).min(1).max(500),
  }).strict(), p.json);
  const idSaisie = `LOT-${p.lot}`;
  const deja = await dejaSaisi(idSaisie, "CERTIFICATION");
  if (deja) return c.json({ lot: p.lot, deja: true, certifies: deja.length });

  const [filiere] = await base().select().from(schema.filiereSuperieure).where(eq(schema.filiereSuperieure.id, m.filiereId));
  if (!filiere) throw new HTTPException(404, { message: "Filière inconnue du registre" });
  const [etab] = await base().select().from(schema.etablissements).where(and(
    eq(schema.etablissements.id, filiere.etablissementId),
    or(eq(schema.etablissements.id, p.conf.racine!), eq(schema.etablissements.rattachementId, p.conf.racine!)),
  ));
  if (!etab) {
    await journaliser(p.auteur, "PV de diplôme hors périmètre", `${m.filiereId}`, "controle", false, "perimetre");
    throw new HTTPException(403, { message: "Cette filière ne relève pas de votre établissement" });
  }
  if (etab.statut !== "public") throw new HTTPException(403, { message: "Un établissement privé présente ses étudiants à l'examen national de l'État" });
  const [hmg] = await base().select().from(schema.homologationsFiliere)
    .where(and(eq(schema.homologationsFiliere.etablissementId, etab.id), eq(schema.homologationsFiliere.filiereId, filiere.id)));
  const porte = hmg ? homologationOperante(hmg, aujourdhui()) : { operante: false, motif: "Aucune homologation enregistrée pour cette filière." };
  if (!porte.operante) {
    await journaliser(p.auteur, "PV de diplôme sur une filière non homologuée", `${filiere.id} · ${porte.motif}`, "controle", false, "homologation");
    throw new HTTPException(409, { message: `Certification refusée : ${porte.motif}` });
  }
  const personnes = await parNpi(m.decisions.map((d) => d.npi));
  const inscrits = new Set((await base().select({ a: schema.inscriptionsSuperieures.apprenantId }).from(schema.inscriptionsSuperieures)
    .where(and(eq(schema.inscriptionsSuperieures.filiereId, filiere.id), inArray(schema.inscriptionsSuperieures.apprenantId, [...personnes.values()].map((x) => x.id).concat("—"))))).map((x) => x.a));
  const annee = m.anneeUniversitaire.slice(5);
  const delivreLe = aujourdhui();
  const faits: NouveauFait[] = [];
  const certifies: string[] = [];
  const rejets: { npi: string; motif: string }[] = [];
  let ajournes = 0;
  const existants = new Set((await base().select({ id: schema.certificats.id }).from(schema.certificats)
    .where(inArray(schema.certificats.apprenantId, [...personnes.values()].map((x) => x.id).concat("—")))).map((x) => x.id));
  for (const d of m.decisions) {
    const a = personnes.get(d.npi);
    if (!a) { rejets.push({ npi: d.npi, motif: "NPI inconnu du registre" }); continue; }
    if (!inscrits.has(a.id)) { rejets.push({ npi: d.npi, motif: "Aucune inscription dans cette filière au registre" }); continue; }
    if (d.decision === "ajourne") { ajournes++; continue; }
    if (d.creditsValides < filiere.creditsEcts) { rejets.push({ npi: d.npi, motif: `Crédits insuffisants (${d.creditsValides}/${filiere.creditsEcts})` }); continue; }
    const id = `CERT-${CODE_CERTIFICAT[filiere.diplomeVise]}-${annee}-${a.id.slice(4)}`;
    if (existants.has(id)) { rejets.push({ npi: d.npi, motif: `Diplôme déjà délivré (${id})` }); continue; }
    const moyenne = d.moyenne === null ? null : Math.round(d.moyenne * 100) / 100;
    const brut = {
      id, apprenantId: a.id, examen: filiere.diplomeVise, session: m.anneeUniversitaire,
      mention: (moyenne === null ? null : mentionDe(Math.max(moyenne, 10))) as Mention | null, moyenne, delivreLe,
      filiereId: filiere.id, etablissementId: etab.id, office: "etablissement" as const,
    };
    faits.push({ type: "CERTIFICATION", auteurId: p.auteur.id, etablissementId: etab.id, apprenantId: a.id, source: "universite",
      donnees: { ...brut, certificatId: id, delivrePar: etab.id, empreinte: sceauCertificat(brut, `${a.prenoms} ${a.nom}`), idSaisie } });
    certifies.push(id);
  }
  if (faits.length) await inscrireAuRegistre(faits);
  await journaliser(p.auteur, "Réception d'un PV de diplôme", `${filiere.id} · PV ${m.pvReference} · ${certifies.length} certifié(s), ${ajournes} ajourné(s), ${rejets.length} rejet(s)`, "gestion", true, null);
  return c.json({ lot: p.lot, certifies, ajournes, rejets }, 201);
});

/* ------------------------------------------------------------------ DBAU : allocations */

interop.post("/interop/dbau/allocations", async (c) => {
  const p = await partenaire(c, "allocations");
  const m = valider(z.object({
    anneeUniversitaire: ANNEE,
    decisions: z.array(z.object({
      npi: NPI, typeDecision: TypeDecisionAllocation, statutCompte: StatutCompte,
      referenceActe: z.string().trim().min(3).max(120), decideLe: DATE,
    }).strict()).min(1).max(2000),
  }).strict(), p.json);
  const idSaisie = `LOT-${p.lot}`;
  const deja = await dejaSaisi(idSaisie, "ALLOCATION_DECIDEE");
  if (deja) return c.json({ lot: p.lot, deja: true, enregistres: deja.length });
  const personnes = await parNpi(m.decisions.map((d) => d.npi));
  const [echeances, inscriptions] = await Promise.all([
    base().select().from(schema.echeancesDepot).where(eq(schema.echeancesDepot.anneeUniversitaire, m.anneeUniversitaire)),
    base().select({ a: schema.inscriptionsSuperieures.apprenantId, e: schema.inscriptionsSuperieures.etablissementId }).from(schema.inscriptionsSuperieures)
      .where(and(eq(schema.inscriptionsSuperieures.anneeUniversitaire, m.anneeUniversitaire), inArray(schema.inscriptionsSuperieures.apprenantId, [...personnes.values()].map((x) => x.id).concat("—")))),
  ]);
  const etabDe = new Map(inscriptions.map((x) => [x.a, x.e]));
  const faits: NouveauFait[] = [];
  const rejets: { npi: string; motif: string }[] = [];
  for (const d of m.decisions) {
    const a = personnes.get(d.npi);
    if (!a) { rejets.push({ npi: d.npi, motif: "NPI inconnu du registre" }); continue; }
    if ((d.typeDecision === "secours") !== (d.statutCompte === "secours")) { rejets.push({ npi: d.npi, motif: "Un secours se statue « secours », une bourse jamais" }); continue; }
    faits.push({ type: "ALLOCATION_DECIDEE", auteurId: p.auteur.id, etablissementId: etabDe.get(a.id) ?? null, apprenantId: a.id, source: "dbau",
      donnees: {
        apprenantId: a.id, allocationId: `ALO-${randomUUID()}`, anneeUniversitaire: m.anneeUniversitaire, typeDecision: d.typeDecision,
        statutCompte: d.statutCompte, autorite: "dbau", referenceActe: d.referenceActe,
        echeanceId: echeances.find((e) => e.typeDecision === d.typeDecision)?.id ?? null, motif: null, decideLe: d.decideLe, idSaisie,
      } });
  }
  const enregistres = faits.length ? await inscrireAuRegistre(faits) : [];
  await journaliser(p.auteur, "Réception de décisions d'allocation (DBAU)", `${m.anneeUniversitaire} · ${enregistres.length} décision(s), ${rejets.length} rejet(s)`, "gestion", true, null);
  return c.json({ lot: p.lot, enregistres: enregistres.length, rejets }, 201);
});
