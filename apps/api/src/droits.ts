import { randomUUID } from "node:crypto";
import { schema } from "@beile/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authentifie, base, cleUtilisateur, corps, journaliser, limiteDebit, refuser, type Variables } from "./commun";

/**
 * Exercice des droits sur les données personnelles (accès, rectification, limitation, opposition).
 * La personne dépose sa demande depuis son espace ; le délégué à la protection des données l'instruit dans
 * la file « Demandes à traiter », avec une échéance de 30 jours, et y répond toujours par écrit (circuit
 * DROITS du moteur de circuits : décisions en ajout seul, notification au demandeur, journal).
 *
 * Le sujet d'une demande est la personne elle-même (« compte ») ou un apprenant avec lequel elle a une
 * relation vérifiée : son propre dossier d'élève, ou celui d'un enfant dont elle est responsable légal.
 */
export const droits = new Hono<{ Variables: Variables }>();

export const DROITS = ["acces", "rectification", "limitation", "opposition"] as const;
const LIBELLE_DROIT: Record<(typeof DROITS)[number], string> = {
  acces: "Accès à mes données", rectification: "Rectification d'une donnée", limitation: "Limitation d'un traitement", opposition: "Opposition à un traitement",
};
const DELAI_JOURS = 30;
const OUVERTES_MAX = 5;
const MODELE = {
  code: "DROITS",
  libelle: "Exercice des droits sur les données",
  etapes: [
    { ordre: 1, code: "DEPOT", role: "demandeur", delaiJours: 0 },
    { ordre: 2, code: "INSTRUCTION", role: "dpo", delaiJours: DELAI_JOURS },
  ],
  version: "1.0",
};

/** Apprenants sur lesquels la personne peut exercer un droit : son propre dossier, ses enfants (lien vérifié). */
async function sujetsAutorises(profil: Variables["profil"]): Promise<Set<string>> {
  const propres = profil.habilitations.flatMap((h) => (h.perimetre.niveau === "personnel" ? [h.perimetre.apprenantId] : []));
  const npi = (profil as { npi?: string | null }).npi ?? null;
  const [p] = npi ? [{ npi }] : await base().select({ npi: schema.profils.npi }).from(schema.profils).where(eq(schema.profils.id, profil.id));
  const enfants = p?.npi
    ? (await base().select({ id: schema.liensFamiliaux.apprenantId }).from(schema.liensFamiliaux)
      .where(and(eq(schema.liensFamiliaux.responsableNpi, p.npi), eq(schema.liensFamiliaux.verifie, true)))).map((x) => x.id)
    : [];
  return new Set([...propres, ...enfants]);
}

droits.post("/droits/demandes", authentifie, limiteDebit(10, 60 * 60_000, cleUtilisateur), async (c) => {
  const profil = c.get("profil");
  const saisie = await corps(c, z.object({
    droit: z.enum(DROITS),
    sujet: z.union([z.literal("compte"), z.string().regex(/^APP-\d{6}$/)]),
    precision: z.string().trim().min(10).max(500),
  }).strict());

  if (saisie.sujet !== "compte" && !(await sujetsAutorises(profil)).has(saisie.sujet)) {
    await journaliser(profil, "Exercice d'un droit — dépôt refusé", saisie.sujet, "consultation_personnelle", false, "relation");
    refuser("Vous ne pouvez exercer un droit que sur vos propres données ou celles d'un enfant dont vous êtes responsable : demande refusée et journalisée");
  }
  const ouvertes = await base().select({ id: schema.demandes.id }).from(schema.demandes)
    .where(and(eq(schema.demandes.modele, "DROITS"), eq(schema.demandes.demandeurId, profil.id), inArray(schema.demandes.statut, ["ouverte", "en_cours"])));
  if (ouvertes.length >= OUVERTES_MAX) throw new HTTPException(429, { message: `Vous avez déjà ${OUVERTES_MAX} demandes en cours d'instruction : attendez une réponse avant d'en déposer une autre.` });

  await base().insert(schema.modelesCircuit).values(MODELE).onConflictDoUpdate({ target: schema.modelesCircuit.code, set: { libelle: MODELE.libelle, etapes: MODELE.etapes, version: MODELE.version } });
  const id = `DEM-${randomUUID()}`;
  const echeance = new Date(Date.now() + DELAI_JOURS * 86_400_000);
  await base().insert(schema.demandes).values({
    id, modele: "DROITS",
    objet: `${LIBELLE_DROIT[saisie.droit]} — ${saisie.sujet === "compte" ? "mon compte" : `dossier ${saisie.sujet}`}`,
    demandeurId: profil.id, ressource: null,
    donnees: { droit: saisie.droit, sujet: saisie.sujet, precision: saisie.precision },
    etapeCourante: "INSTRUCTION", statut: "en_cours", echeance,
  });
  await base().insert(schema.decisions).values({ id: `DEC-${randomUUID()}`, demandeId: id, etape: "DEPOT", auteurId: profil.id, decision: "valide", motif: null });
  await journaliser(profil, "Exercice d'un droit — demande déposée", `${id} · ${saisie.droit}`, "consultation_personnelle", true, null);
  return c.json({ id, echeance: echeance.toISOString() }, 201);
});

/** Mes demandes d'exercice des droits, avec la réponse écrite du délégué quand elle existe. */
droits.get("/droits/mes-demandes", authentifie, async (c) => {
  const profil = c.get("profil");
  const demandes = await base().select().from(schema.demandes)
    .where(and(eq(schema.demandes.modele, "DROITS"), eq(schema.demandes.demandeurId, profil.id)))
    .orderBy(desc(schema.demandes.creeeLe));
  const decisions = demandes.length
    ? await base().select().from(schema.decisions).where(and(inArray(schema.decisions.demandeId, demandes.map((d) => d.id)), eq(schema.decisions.etape, "INSTRUCTION")))
    : [];
  return c.json(demandes.map((d) => {
    const reponse = decisions.filter((x) => x.demandeId === d.id).sort((a, b) => b.horodatage.getTime() - a.horodatage.getTime())[0];
    const donnees = d.donnees as { droit?: string; sujet?: string; precision?: string } | null;
    return {
      id: d.id, objet: d.objet, droit: donnees?.droit ?? null, sujet: donnees?.sujet ?? null, precision: donnees?.precision ?? null,
      statut: d.statut, deposeeLe: d.creeeLe.toISOString(), echeance: d.echeance?.toISOString() ?? null,
      reponse: reponse ? { decision: reponse.decision, texte: reponse.motif, le: reponse.horodatage.toISOString() } : null,
    };
  }));
});
