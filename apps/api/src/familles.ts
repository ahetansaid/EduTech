import { randomBytes, randomUUID } from "node:crypto";
import type { Habilitation, Profil } from "@beile/contracts";
import { schema } from "@beile/db";
import { hacherMotDePasse } from "@beile/db/securite";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { proposerIdentifiant } from "./administration";
import { authentifie, base, cleUtilisateur, corps, journaliser, limiteDebit, refuser, revoquerSessionsDuCompte, type Variables } from "./commun";

/**
 * Responsable légal SANS NPI (D5). Le NPI est la clé du lien parent-enfant ; une famille qui ne l'a pas encore
 * restait hors plateforme. L'établissement où l'enfant est scolarisé atteste le lien sur pièce vue au guichet et
 * délivre un identifiant PROVISOIRE de responsable (`PRV-…`), utilisé là où le NPI l'est (lien familial, périmètre
 * famille, notifications) : le contrôle d'accès ne change pas. Le compte s'active par code SMS au numéro donné ;
 * personne d'autre ne connaît le mot de passe. Quand le parent obtient son NPI, il remplace l'identifiant provisoire
 * partout, d'un seul geste.
 */
export const familles = new Hono<{ Variables: Variables }>();

const ID_ETAB = z.string().regex(/^ETB-[A-Za-z0-9-]+$/);
const ID_PRV = z.string().regex(/^PRV-[A-Z0-9]{10}$/);
const TELEPHONE = z.string().trim().transform((t) => t.replace(/[\s.-]/g, "")).pipe(z.string().regex(/^\+\d{8,15}$/, "numéro au format international (+229…)"));
const MAX_PROVISOIRES_PAR_ENFANT = 2;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const identifiantProvisoire = () => `PRV-${Array.from(randomBytes(10), (b) => ALPHABET[b % ALPHABET.length]).join("")}`;

/** Le chef d'établissement de CET établissement, ou refus journalisé. */
async function chefDe(profil: Profil, etablissementId: string, action: string) {
  if (!profil.habilitations.some((h) => h.role === "chef_etablissement" && h.perimetre.niveau === "etablissement" && h.perimetre.etablissementId === etablissementId)) {
    await journaliser(profil, action, etablissementId, "gestion", false, "perimetre");
    refuser("Réservé au chef de l'établissement où l'enfant est scolarisé : refus journalisé");
  }
}

familles.post("/etablissements/:id/familles/responsable-provisoire", authentifie, limiteDebit(20, 60 * 60_000, cleUtilisateur), async (c) => {
  const profil = c.get("profil");
  const etablissementId = ID_ETAB.parse(c.req.param("id"));
  await chefDe(profil, etablissementId, "Responsable légal sans NPI");
  const s = await corps(c, z.object({
    apprenantId: z.string().regex(/^APP-\d{6}$/),
    nomAffiche: z.string().trim().min(3).max(80),
    telephone: TELEPHONE,
    nature: z.enum(["parent", "tuteur"]),
    pieceVue: z.string().trim().min(5).max(160),
  }).strict());
  const [sco] = await base().select({ id: schema.scolarites.apprenantId }).from(schema.scolarites)
    .where(and(eq(schema.scolarites.apprenantId, s.apprenantId), eq(schema.scolarites.etablissementId, etablissementId), eq(schema.scolarites.statut, "scolarise")));
  if (!sco) throw new HTTPException(422, { message: "Cet enfant n'est pas scolarisé dans votre établissement" });
  const [{ n } = { n: 0 }] = await base().execute<{ n: number }>(sql`
    select count(*)::int as n from core.liens_familiaux where apprenant_id = ${s.apprenantId} and responsable_npi like 'PRV-%'`);
  if (n >= MAX_PROVISOIRES_PAR_ENFANT) throw new HTTPException(409, { message: `Cet enfant a déjà ${MAX_PROVISOIRES_PAR_ENFANT} responsables sans NPI : rattachez d'abord un NPI` });
  const identifiant = await proposerIdentifiant(s.nomAffiche);
  if (!identifiant) throw new HTTPException(422, { message: "Nom inexploitable pour proposer un identifiant" });

  const prv = identifiantProvisoire();
  const profilId = `p-${randomUUID()}`;
  const habilitations: Habilitation[] = [{ role: "parent", perimetre: { niveau: "famille", responsableNpi: prv } }];
  // Mot de passe initial aléatoire, jamais communiqué : le compte ne s'ouvre que par le code SMS d'activation.
  const hash = await hacherMotDePasse(randomBytes(32).toString("base64url"));
  await base().transaction(async (tx) => {
    await tx.insert(schema.liensFamiliaux).values({ responsableNpi: prv, apprenantId: s.apprenantId, nature: s.nature, verifie: true });
    await tx.insert(schema.profils).values({ id: profilId, nomAffiche: s.nomAffiche, fonction: s.nature === "parent" ? "Parent" : "Tuteur", npi: prv, habilitations });
    await tx.insert(schema.comptes).values({ id: `CPT-${randomBytes(9).toString("hex").replace(/\d/g, (d) => "abcdefghij"[Number(d)]!)}`, identifiant, motDePasseHash: hash, profilId, doitChangerMotDePasse: true, telephone: s.telephone });
  });
  await journaliser(profil, "Responsable légal sans NPI", `${s.apprenantId} · ${prv} · ${identifiant} · pièce ${s.pieceVue}`, "gestion", true, null);
  return c.json({ identifiant, responsableProvisoire: prv, activation: "Le responsable active son compte depuis « Première connexion » : un code lui est envoyé par SMS." }, 201);
});

/** Responsables sans NPI attestés pour les enfants de l'établissement (à rattacher quand le NPI arrive). */
familles.get("/etablissements/:id/familles/responsables-provisoires", authentifie, limiteDebit(30, 60_000, cleUtilisateur), async (c) => {
  const profil = c.get("profil");
  const etablissementId = ID_ETAB.parse(c.req.param("id"));
  await chefDe(profil, etablissementId, "Responsables sans NPI de l'établissement");
  const lignes = await base().execute<{ prv: string; apprenant_id: string; eleve: string; nom: string | null; identifiant: string | null; active: boolean | null }>(sql`
    select l.responsable_npi as prv, l.apprenant_id, a.prenoms || ' ' || a.nom as eleve, p.nom_affiche as nom, k.identifiant, not k.doit_changer_mot_de_passe as active
    from core.liens_familiaux l
    join core.apprenants a on a.id = l.apprenant_id
    join core.scolarites s on s.apprenant_id = l.apprenant_id and s.etablissement_id = ${etablissementId} and s.statut = 'scolarise'
    left join core.profils p on p.npi = l.responsable_npi
    left join core.comptes k on k.profil_id = p.id
    where l.responsable_npi like 'PRV-%' order by a.nom limit 500`);
  await journaliser(profil, "Responsables sans NPI de l'établissement", `${lignes.length}`, "gestion", true, null);
  return c.json(lignes.map((l) => ({ responsableProvisoire: l.prv, apprenantId: l.apprenant_id, eleve: l.eleve, nom: l.nom, identifiant: l.identifiant, active: !!l.active })));
});

/** Le NPI est arrivé : il remplace l'identifiant provisoire partout (lien, profil, périmètre, notifications). */
familles.post("/etablissements/:id/familles/:prv/rattacher-npi", authentifie, limiteDebit(20, 60 * 60_000, cleUtilisateur), async (c) => {
  const profil = c.get("profil");
  const etablissementId = ID_ETAB.parse(c.req.param("id"));
  const prv = ID_PRV.parse(c.req.param("prv"));
  await chefDe(profil, etablissementId, "Rattachement du NPI d'un responsable");
  const { npi } = await corps(c, z.object({ npi: z.string().regex(/^\d{10}$/, "le NPI comporte exactement 10 chiffres") }).strict());
  // Le provisoire doit concerner un enfant de CET établissement.
  const [lien] = await base().execute<{ n: number }>(sql`
    select 1 as n from core.liens_familiaux l join core.scolarites s on s.apprenant_id = l.apprenant_id
    where l.responsable_npi = ${prv} and s.etablissement_id = ${etablissementId} and s.statut = 'scolarise' limit 1`);
  if (!lien) throw new HTTPException(404, { message: "Responsable provisoire inconnu dans votre établissement" });
  // Le NPI doit être CELUI de la personne attestée : connu du registre national, et son identité doit correspondre
  // au nom du responsable. Sans cela, un NPI d'autrui rattaché ici hériterait demain de ses enfants ailleurs.
  const [personne] = await base().select({ nom: schema.personnes.nom, prenoms: schema.personnes.prenoms }).from(schema.personnes).where(eq(schema.personnes.npi, npi));
  const [provisoire] = await base().select({ nomAffiche: schema.profils.nomAffiche }).from(schema.profils).where(eq(schema.profils.npi, prv));
  const norme = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim();
  const nomAtteste = ` ${norme(provisoire?.nomAffiche ?? "")} `;
  const correspond = !!personne && nomAtteste.includes(` ${norme(personne.nom)} `) && nomAtteste.includes(` ${norme(personne.prenoms).split(" ")[0]} `);
  if (!correspond) {
    await journaliser(profil, "Rattachement du NPI d'un responsable", `${prv} → NPI refusé (registre)`, "gestion", false, "identite");
    throw new HTTPException(422, { message: "Ce NPI n'est pas celui du responsable attesté (inconnu du registre national ou identité différente) : rattachement refusé" });
  }
  await base().transaction(async (tx) => {
    // Sous verrou sur ce NPI : deux rattachements simultanés ne peuvent pas l'attribuer deux fois.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`npi:${npi}`}))`);
    const [deja] = await tx.select({ id: schema.profils.id }).from(schema.profils).where(eq(schema.profils.npi, npi));
    if (deja) throw new HTTPException(409, { message: "Ce NPI appartient déjà à un autre profil : la fusion de comptes passe par l'administration" });
    const [conflit] = await tx.select({ a: schema.liensFamiliaux.apprenantId }).from(schema.liensFamiliaux).where(eq(schema.liensFamiliaux.responsableNpi, npi)).limit(1);
    if (conflit) throw new HTTPException(409, { message: "Ce NPI est déjà responsable d'un enfant : la fusion passe par l'administration" });
    await tx.update(schema.liensFamiliaux).set({ responsableNpi: npi }).where(eq(schema.liensFamiliaux.responsableNpi, prv));
    const [p] = await tx.select().from(schema.profils).where(eq(schema.profils.npi, prv));
    if (p) {
      const habs = (p.habilitations as Habilitation[]).map((h) => (h.perimetre.niveau === "famille" && h.perimetre.responsableNpi === prv ? { ...h, perimetre: { niveau: "famille" as const, responsableNpi: npi } } : h));
      await tx.update(schema.profils).set({ npi, habilitations: habs }).where(eq(schema.profils.id, p.id));
    }
    await tx.update(schema.notifications).set({ destinataireNpi: npi }).where(eq(schema.notifications.destinataireNpi, prv));
  });
  // Les sessions ouvertes gardaient l'ancien identifiant en cache : elles sont fermées, la prochaine connexion relit le profil.
  const [cpt] = await base().select({ id: schema.comptes.id }).from(schema.comptes).innerJoin(schema.profils, eq(schema.profils.id, schema.comptes.profilId)).where(eq(schema.profils.npi, npi));
  if (cpt) await revoquerSessionsDuCompte(cpt.id);
  await journaliser(profil, "Rattachement du NPI d'un responsable", `${prv} → NPI ${npi.slice(0, 2)}••••••${npi.slice(-2)}`, "gestion", true, null);
  return c.json({ rattache: true });
});

