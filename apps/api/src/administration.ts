import { randomBytes } from "node:crypto";
import { Habilitation, type Profil, type Role } from "@beile/contracts";
import { schema } from "@beile/db";
import { genererMotDePasse, hacherMotDePasse } from "@beile/db/securite";
import { and, asc, count, desc, eq, ilike, inArray, like, ne, or, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authentifie, base, cleUtilisateur, corps, journaliser, limiteDebit, oublierSession, refuser, type Variables } from "./commun";

/**
 * Administration des utilisateurs et assistance.
 *
 * - Gestion des utilisateurs (administrateur uniquement) : création d'un profil + compte avec des habilitations
 *   validées par le contrat ET cohérentes avec les référentiels (établissement, circonscription, département,
 *   registre national des personnes) ; modification ; révocation des sessions ; déverrouillage.
 *   Tout est journalisé, refus compris. L'administrateur ne peut ni retirer son propre rôle ni se désactiver.
 * - Assistance : tout utilisateur connecté ouvre une demande, la suit et y répond ; l'administration traite
 *   la file (statut, prise en charge, réponses). Le texte est borné et stocké brut : jamais interprété en HTML.
 */
export const administration = new Hono<{ Variables: Variables }>();
type Ctx = Context<{ Variables: Variables }>;

/* ================================================================== Briques */

const ID_COMPTE = z.string().regex(/^CPT-[a-z]{2,40}$/);
const NPI = z.string().regex(/^\d{10}$/, "le NPI comporte exactement 10 chiffres");
const IDENTIFIANT = z.string().trim().toLowerCase().max(80).regex(/^[a-z][a-z0-9-]{0,39}(\.[a-z0-9-]{1,40}){1,2}$/, "format attendu : prenom.nom (lettres minuscules, chiffres, tirets)");

/** Retire les caractères de contrôle (sauf saut de ligne et tabulation si multiligne). */
const nettoyer = (multiligne: boolean) => (s: string) =>
  (multiligne ? s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\r\n?/g, "\n") : s.replace(/[\u0000-\u001F\u007F]/g, " ")).trim();
const texte = (min: number, max: number, multiligne = false) => z.string().transform(nettoyer(multiligne)).pipe(z.string().min(min, `${min} caractères minimum`).max(max, `${max} caractères maximum`));

const estAdmin = (p: Profil) => p.habilitations.some((h) => h.role === "administrateur");

async function exigerAdmin(c: Ctx, action: string, ressource: string) {
  const profil = c.get("profil");
  if (estAdmin(profil)) return;
  await journaliser(profil, action, ressource, "gestion", false, "role");
  refuser("Réservé à l'administrateur de la plateforme : refus journalisé");
}

const erreur422 = (message: string): never => { throw new HTTPException(422, { message }); };

/* ================================================================== Cohérence des habilitations */

type Niveau = Habilitation["perimetre"]["niveau"];
/** Périmètre attendu pour chaque rôle : une habilitation hors de cette table est incohérente. */
const NIVEAU_DU_ROLE: Record<Role, Niveau> = {
  apprenant: "personnel",
  parent: "famille",
  enseignant: "etablissement",
  chef_etablissement: "etablissement",
  inspecteur: "circonscription",
  direction_departementale: "departement",
  administration_centrale: "national",
  chercheur: "national",
  dpo: "national",
  administrateur: "national",
};
const ROLES_AVEC_NPI: Role[] = ["apprenant", "parent", "enseignant"];

/**
 * Vérifie qu'un ensemble d'habilitations est cohérent : niveau de périmètre attendu, référentiels existants,
 * NPI présent et connu du registre national lorsqu'il est requis, identité liée (enseignant affecté, apprenant
 * titulaire du NPI). Lève 422 avec la liste des incohérences ; 409 si le NPI appartient déjà à un autre profil.
 */
async function verifierCoherence(habilitations: Habilitation[], npi: string | null, profilIdExclu: string | null) {
  const problemes: string[] = [];
  const cles = new Set<string>();
  for (const [i, h] of habilitations.entries()) {
    const cle = JSON.stringify([h.role, h.perimetre]);
    if (cles.has(cle)) problemes.push(`habilitation ${i + 1} en double`);
    cles.add(cle);
    if (h.perimetre.niveau !== NIVEAU_DU_ROLE[h.role]) problemes.push(`« ${h.role} » s'exerce sur un périmètre « ${NIVEAU_DU_ROLE[h.role]} », pas « ${h.perimetre.niveau} »`);
    if (ROLES_AVEC_NPI.includes(h.role) && !npi) problemes.push(`le rôle « ${h.role} » exige le NPI de la personne`);
  }
  if (problemes.length) erreur422(`Habilitations incohérentes : ${problemes.join(" ; ")}`);

  const db = base();
  if (npi) {
    const [personne] = await db.select({ npi: schema.personnes.npi }).from(schema.personnes).where(eq(schema.personnes.npi, npi));
    if (!personne) problemes.push("NPI inconnu du registre national des personnes");
    const [autre] = await db.select({ id: schema.profils.id, nom: schema.profils.nomAffiche }).from(schema.profils)
      .where(profilIdExclu ? and(eq(schema.profils.npi, npi), ne(schema.profils.id, profilIdExclu)) : eq(schema.profils.npi, npi));
    if (autre) throw new HTTPException(409, { message: `Ce NPI est déjà rattaché au profil de ${autre.nom}` });
  }

  const etabIds = [...new Set(habilitations.flatMap((h) => (h.perimetre.niveau === "etablissement" ? [h.perimetre.etablissementId] : [])))];
  const circos = [...new Set(habilitations.flatMap((h) => (h.perimetre.niveau === "circonscription" ? [h.perimetre.circonscription] : [])))];
  const deps = [...new Set(habilitations.flatMap((h) => (h.perimetre.niveau === "departement" ? [h.perimetre.departementId] : [])))];
  const [etabs, circosConnues, depsConnus] = await Promise.all([
    etabIds.length ? db.select({ id: schema.etablissements.id }).from(schema.etablissements).where(inArray(schema.etablissements.id, etabIds)) : [],
    circos.length ? db.selectDistinct({ c: schema.etablissements.circonscription }).from(schema.etablissements).where(inArray(schema.etablissements.circonscription, circos)) : [],
    deps.length ? db.select({ id: schema.departements.id }).from(schema.departements).where(inArray(schema.departements.id, deps)) : [],
  ]);
  for (const id of etabIds) if (!etabs.some((e) => e.id === id)) problemes.push(`établissement « ${id} » inexistant`);
  for (const c of circos) if (!circosConnues.some((x) => x.c === c)) problemes.push(`circonscription « ${c} » inexistante`);
  for (const d of deps) if (!depsConnus.some((x) => x.id === d)) problemes.push(`département « ${d} » inexistant`);

  for (const h of habilitations) {
    const p = h.perimetre;
    if (h.role === "parent" && p.niveau === "famille" && p.responsableNpi !== npi) problemes.push("le périmètre « famille » doit porter le NPI de la personne elle-même");
    if (h.role === "enseignant" && p.niveau === "etablissement" && npi) {
      const [ens] = await db.select({ etablissementId: schema.enseignants.etablissementId }).from(schema.enseignants).where(eq(schema.enseignants.npi, npi));
      if (!ens) problemes.push("ce NPI ne figure pas au fichier des personnels enseignants");
      else if (ens.etablissementId !== p.etablissementId) problemes.push(`l'enseignant est affecté à « ${ens.etablissementId} », pas à « ${p.etablissementId} »`);
    }
    if (h.role === "apprenant" && p.niveau === "personnel") {
      const [app] = await db.select({ npi: schema.apprenants.npi }).from(schema.apprenants).where(eq(schema.apprenants.id, p.apprenantId));
      if (!app) problemes.push(`apprenant « ${p.apprenantId} » inexistant`);
      else if (app.npi !== npi) problemes.push("le dossier apprenant ne correspond pas au NPI de la personne");
    }
  }
  if (problemes.length) erreur422(`Habilitations incohérentes : ${problemes.join(" ; ")}`);
}

/** Libellés lisibles des périmètres (établissement, département) pour l'affichage. */
async function libellesPerimetres(habilitations: Habilitation[]) {
  const etabIds = habilitations.flatMap((h) => (h.perimetre.niveau === "etablissement" ? [h.perimetre.etablissementId] : []));
  const appIds = habilitations.flatMap((h) => (h.perimetre.niveau === "personnel" ? [h.perimetre.apprenantId] : []));
  const [etabs, deps, apps] = await Promise.all([
    etabIds.length ? base().select({ id: schema.etablissements.id, nom: schema.etablissements.nom }).from(schema.etablissements).where(inArray(schema.etablissements.id, etabIds)) : [],
    base().select({ id: schema.departements.id, nom: schema.departements.nom }).from(schema.departements),
    appIds.length ? base().select({ id: schema.apprenants.id, nom: schema.apprenants.nom, prenoms: schema.apprenants.prenoms }).from(schema.apprenants).where(inArray(schema.apprenants.id, appIds)) : [],
  ]);
  const libelles: Record<string, string> = {};
  for (const e of etabs) libelles[e.id] = e.nom;
  for (const d of deps) libelles[d.id] = d.nom;
  for (const a of apps) libelles[a.id] = `${a.prenoms} ${a.nom}`;
  return libelles;
}

/* ================================================================== Identifiants */

const sansAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const TITRES = new Set(["dr", "pr", "m", "mme", "mlle", "me"]);

/** prenom.nom à partir du nom affiché (« Aïcha ZANNOU » → aicha.zannou), suffixe numérique en cas de collision. */
async function proposerIdentifiant(nomAffiche: string) {
  const mots = sansAccents(nomAffiche).replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((m) => m && !TITRES.has(m));
  if (!mots.length) return null;
  const tronque = (s: string) => s.replace(/^-+|-+$/g, "").slice(0, 38) || "x";
  const racine = mots.length === 1 ? `${tronque(mots[0]!)}.beile` : `${tronque(mots[0]!)}.${tronque(mots.slice(1).join("-"))}`;
  const pris = new Set((await base().select({ i: schema.comptes.identifiant }).from(schema.comptes).where(like(schema.comptes.identifiant, `${racine}%`))).map((x) => x.i));
  if (!pris.has(racine)) return racine;
  for (let n = 2; n < 1000; n++) if (!pris.has(`${racine}${n}`)) return `${racine}${n}`;
  return null;
}

const suffixeAleatoire = (n = 12) => Array.from(randomBytes(n), (b) => "abcdefghijklmnopqrstuvwxyz"[b % 26]).join("");

/* ================================================================== Référentiels des formulaires */

administration.get("/admin/identifiant", authentifie, async (c) => {
  await exigerAdmin(c, "Proposition d'identifiant", "core.comptes");
  const nom = texte(2, 80).parse(c.req.query("nom") ?? "");
  return c.json({ identifiant: await proposerIdentifiant(nom) });
});

administration.get("/admin/referentiels/departements", authentifie, async (c) => {
  await exigerAdmin(c, "Consultation des référentiels", "core.departements");
  return c.json(await base().select({ id: schema.departements.id, nom: schema.departements.nom }).from(schema.departements).orderBy(asc(schema.departements.nom)));
});

administration.get("/admin/referentiels/circonscriptions", authentifie, async (c) => {
  await exigerAdmin(c, "Consultation des référentiels", "circonscriptions");
  const lignes = await base()
    .select({ circonscription: schema.etablissements.circonscription, departementId: schema.communes.departementId, departement: schema.departements.nom, etablissements: count() })
    .from(schema.etablissements)
    .innerJoin(schema.communes, eq(schema.communes.id, schema.etablissements.communeId))
    .innerJoin(schema.departements, eq(schema.departements.id, schema.communes.departementId))
    .groupBy(schema.etablissements.circonscription, schema.communes.departementId, schema.departements.nom)
    .orderBy(asc(schema.etablissements.circonscription));
  return c.json(lignes);
});

administration.get("/admin/referentiels/etablissements", authentifie, async (c) => {
  await exigerAdmin(c, "Consultation des référentiels", "core.etablissements");
  const q = z.string().trim().max(80).catch("").parse(c.req.query("q") ?? "").replace(/[%_\\]/g, "");
  const motif = `%${q}%`;
  const lignes = await base()
    .select({ id: schema.etablissements.id, nom: schema.etablissements.nom, typeInstitution: schema.etablissements.typeInstitution, circonscription: schema.etablissements.circonscription, commune: schema.communes.nom, departementId: schema.communes.departementId })
    .from(schema.etablissements)
    .innerJoin(schema.communes, eq(schema.communes.id, schema.etablissements.communeId))
    .where(q ? or(ilike(schema.etablissements.nom, motif), ilike(schema.etablissements.id, motif), ilike(schema.communes.nom, motif)) : undefined)
    .orderBy(asc(schema.etablissements.nom))
    .limit(20);
  return c.json(lignes);
});

/** Ce que le registre et les fichiers savent d'un NPI : pré-remplit l'identité et guide les habilitations. */
administration.get("/admin/referentiels/npi/:npi", authentifie, async (c) => {
  await exigerAdmin(c, "Consultation du registre (NPI)", "registre_simule.personnes");
  const npi = NPI.parse(c.req.param("npi"));
  const db = base();
  const [[personne], [apprenant], [enseignant], [enfants], [profil]] = await Promise.all([
    db.select({ nom: schema.personnes.nom, prenoms: schema.personnes.prenoms }).from(schema.personnes).where(eq(schema.personnes.npi, npi)),
    db.select({ id: schema.apprenants.id, nom: schema.apprenants.nom, prenoms: schema.apprenants.prenoms }).from(schema.apprenants).where(eq(schema.apprenants.npi, npi)),
    db.select({ id: schema.enseignants.id, etablissementId: schema.enseignants.etablissementId, etablissement: schema.etablissements.nom }).from(schema.enseignants).innerJoin(schema.etablissements, eq(schema.etablissements.id, schema.enseignants.etablissementId)).where(eq(schema.enseignants.npi, npi)),
    db.select({ n: count() }).from(schema.liensFamiliaux).where(and(eq(schema.liensFamiliaux.responsableNpi, npi), eq(schema.liensFamiliaux.verifie, true))),
    db.select({ id: schema.profils.id, nomAffiche: schema.profils.nomAffiche }).from(schema.profils).where(eq(schema.profils.npi, npi)),
  ]);
  await journaliser(c.get("profil"), "Consultation du registre (NPI)", npi, "gestion", true, null);
  return c.json({ npi, personne: personne ?? null, apprenant: apprenant ?? null, enseignant: enseignant ?? null, enfantsLies: enfants?.n ?? 0, profilExistant: profil ?? null });
});

/* ================================================================== Utilisateurs */

const HABILITATIONS = z.array(Habilitation).min(1, "au moins une habilitation").max(6, "6 habilitations au plus");
/** Nom de personne : lettres (accentuées), espaces, apostrophes, tirets, points — rien d'autre (ni caractère de remplacement). */
const NOM_AFFICHE = texte(3, 80).pipe(z.string().regex(/^\p{L}[\p{L}\p{M}' .’-]*$/u, "lettres, espaces, apostrophes et tirets uniquement"));
const FONCTION = texte(3, 120).pipe(z.string().refine((v) => !v.includes("�"), "caractère invalide (encodage)"));

administration.post("/admin/utilisateurs", authentifie, limiteDebit(30, 60_000, cleUtilisateur), async (c) => {
  await exigerAdmin(c, "Création d'un utilisateur", "core.comptes");
  const saisie = await corps(c, z.object({
    nomAffiche: NOM_AFFICHE,
    fonction: FONCTION,
    npi: NPI.nullable().optional(),
    identifiant: IDENTIFIANT.optional(),
    habilitations: HABILITATIONS,
  }).strict());
  const npi = saisie.npi ?? null;
  await verifierCoherence(saisie.habilitations, npi, null);

  const identifiant = saisie.identifiant ?? (await proposerIdentifiant(saisie.nomAffiche)) ?? erreur422("Impossible de proposer un identifiant : saisissez-le");
  const [pris] = await base().select({ id: schema.comptes.id }).from(schema.comptes).where(eq(schema.comptes.identifiant, identifiant));
  if (pris) throw new HTTPException(409, { message: `L'identifiant « ${identifiant} » est déjà attribué` });

  const suffixe = suffixeAleatoire();
  const profilId = `p-${suffixe}`;
  const compteId = `CPT-${suffixe}`;
  const temporaire = genererMotDePasse();
  const hash = await hacherMotDePasse(temporaire);
  await base().transaction(async (tx) => {
    await tx.insert(schema.profils).values({ id: profilId, nomAffiche: saisie.nomAffiche, fonction: saisie.fonction, npi, habilitations: saisie.habilitations });
    await tx.insert(schema.comptes).values({ id: compteId, identifiant, motDePasseHash: hash, profilId, doitChangerMotDePasse: true });
  });
  await journaliser(c.get("profil"), "Création d'un utilisateur", `${compteId} · ${identifiant} · ${saisie.habilitations.map((h) => h.role).join(", ")}`, "gestion", true, null);
  // Le mot de passe temporaire n'est renvoyé qu'ici, une seule fois ; seule son empreinte est conservée.
  return c.json({ compte: { id: compteId, identifiant }, profil: { id: profilId, nomAffiche: saisie.nomAffiche, fonction: saisie.fonction, npi, habilitations: saisie.habilitations }, motDePasseTemporaire: temporaire }, 201);
});

async function compteEtProfil(id: string) {
  const [ligne] = await base().select({ compte: schema.comptes, profil: schema.profils }).from(schema.comptes).innerJoin(schema.profils, eq(schema.profils.id, schema.comptes.profilId)).where(eq(schema.comptes.id, id));
  if (!ligne) throw new HTTPException(404, { message: "Compte introuvable" });
  return { compte: ligne.compte, profil: { ...ligne.profil, habilitations: ligne.profil.habilitations as Habilitation[] } };
}

administration.get("/admin/comptes/:id", authentifie, async (c) => {
  await exigerAdmin(c, "Consultation d'un compte", c.req.param("id"));
  const id = ID_COMPTE.parse(c.req.param("id"));
  const { compte, profil } = await compteEtProfil(id);
  const sessions = await base().select({ creeLe: schema.sessions.creeLe, derniereActivite: schema.sessions.derniereActivite, agent: schema.sessions.agent })
    .from(schema.sessions).where(and(eq(schema.sessions.compteId, id), eq(schema.sessions.revoquee, false), sql`${schema.sessions.expireLe} > now()`)).orderBy(desc(schema.sessions.derniereActivite));
  await journaliser(c.get("profil"), "Consultation d'un compte", id, "gestion", true, null);
  return c.json({
    compte: { id: compte.id, identifiant: compte.identifiant, actif: compte.actif, doitChangerMotDePasse: compte.doitChangerMotDePasse, echecs: compte.echecsConsecutifs, verrouilleJusquA: compte.verrouilleJusquA, derniereConnexion: compte.derniereConnexion, creeLe: compte.creeLe },
    profil,
    sessions,
    libelles: await libellesPerimetres(profil.habilitations),
  });
});

/** Révoque les sessions d'un compte (sauf éventuellement la session courante) et purge le cache de session. */
async function revoquerSessions(compteId: string, sauf: string | null) {
  const cibles = await base().select({ e: schema.sessions.empreinte }).from(schema.sessions).where(and(eq(schema.sessions.compteId, compteId), eq(schema.sessions.revoquee, false), sauf ? ne(schema.sessions.empreinte, sauf) : undefined));
  if (cibles.length) await base().update(schema.sessions).set({ revoquee: true }).where(inArray(schema.sessions.empreinte, cibles.map((x) => x.e)));
  for (const x of cibles) oublierSession(x.e);
  if (sauf) oublierSession(sauf); // la session conservée relira son profil à jour
  return cibles.length;
}

administration.post("/admin/comptes/:id/profil", authentifie, async (c) => {
  await exigerAdmin(c, "Modification d'un utilisateur", c.req.param("id"));
  const id = ID_COMPTE.parse(c.req.param("id"));
  const saisie = await corps(c, z.object({ nomAffiche: NOM_AFFICHE.optional(), fonction: FONCTION.optional(), npi: NPI.nullable().optional(), habilitations: HABILITATIONS.optional() }).strict());
  const { compte, profil } = await compteEtProfil(id);
  const soiMeme = id === c.get("compte").id;
  const habilitations = saisie.habilitations ?? profil.habilitations;
  const npi = saisie.npi === undefined ? profil.npi : saisie.npi;
  if (soiMeme && !habilitations.some((h) => h.role === "administrateur" && h.perimetre.niveau === "national")) {
    await journaliser(c.get("profil"), "Modification d'un utilisateur — auto-rétrogradation", id, "gestion", false, "role");
    erreur422("Vous ne pouvez pas retirer votre propre rôle d'administrateur : demandez-le à un autre administrateur");
  }
  const droitsModifies = saisie.habilitations !== undefined && JSON.stringify(saisie.habilitations) !== JSON.stringify(profil.habilitations);
  const npiModifie = npi !== profil.npi;
  if (droitsModifies || npiModifie) await verifierCoherence(habilitations, npi, profil.id);

  await base().update(schema.profils).set({ nomAffiche: saisie.nomAffiche ?? profil.nomAffiche, fonction: saisie.fonction ?? profil.fonction, npi, habilitations }).where(eq(schema.profils.id, profil.id));
  // Nouvelles habilitations : les sessions ouvertes portaient les anciennes. Elles sont révoquées (reconnexion) ;
  // pour soi-même, seule la session courante est conservée et relit son profil.
  const revoquees = droitsModifies || npiModifie ? await revoquerSessions(compte.id, soiMeme ? c.get("compte").empreinteSession : null) : 0;
  if (!droitsModifies && !npiModifie) for (const s of await base().select({ e: schema.sessions.empreinte }).from(schema.sessions).where(eq(schema.sessions.compteId, compte.id))) oublierSession(s.e);
  const changements = [saisie.nomAffiche !== undefined && saisie.nomAffiche !== profil.nomAffiche && "nom", saisie.fonction !== undefined && saisie.fonction !== profil.fonction && "fonction", npiModifie && "NPI", droitsModifies && `habilitations (${habilitations.map((h) => h.role).join(", ")})`].filter(Boolean).join(", ");
  await journaliser(c.get("profil"), "Modification d'un utilisateur", `${id} · ${changements || "aucun changement"}${revoquees ? ` · ${revoquees} session(s) révoquée(s)` : ""}`, "gestion", true, null);
  return c.json({ ok: true, sessionsRevoquees: revoquees });
});

administration.post("/admin/comptes/:id/sessions/revoquer", authentifie, async (c) => {
  await exigerAdmin(c, "Révocation des sessions", c.req.param("id"));
  const id = ID_COMPTE.parse(c.req.param("id"));
  await compteEtProfil(id);
  // Pour son propre compte : toutes les autres sessions, jamais celle qui fait la demande.
  const n = await revoquerSessions(id, id === c.get("compte").id ? c.get("compte").empreinteSession : null);
  await journaliser(c.get("profil"), "Révocation des sessions", `${id} · ${n} session(s)`, "gestion", true, null);
  return c.json({ sessionsRevoquees: n });
});

administration.post("/admin/comptes/:id/deverrouiller", authentifie, async (c) => {
  await exigerAdmin(c, "Déverrouillage d'un compte", c.req.param("id"));
  const id = ID_COMPTE.parse(c.req.param("id"));
  const [maj] = await base().update(schema.comptes).set({ echecsConsecutifs: 0, verrouilleJusquA: null }).where(eq(schema.comptes.id, id)).returning({ id: schema.comptes.id });
  if (!maj) throw new HTTPException(404, { message: "Compte introuvable" });
  await journaliser(c.get("profil"), "Déverrouillage d'un compte", id, "gestion", true, null);
  return c.json({ ok: true });
});

/* ================================================================== Assistance */

const CATEGORIES = ["connexion", "donnees", "acces", "bug", "autre"] as const;
const PRIORITES = ["basse", "normale", "haute", "critique"] as const;
const STATUTS = ["ouvert", "en_cours", "resolu", "clos"] as const;
const ID_TICKET = z.string().regex(/^AST-[A-Z2-9]{8}$/);
const ALPHABET_TICKET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const nouvelIdTicket = () => `AST-${Array.from(randomBytes(8), (b) => ALPHABET_TICKET[b % ALPHABET_TICKET.length]).join("")}`;
const MESSAGE = texte(1, 4000, true);

const nbMessages = sql<number>`(select count(*)::int from core.tickets_messages m where m.ticket_id = ${schema.tickets.id})`;
const derniereReponseAdmin = sql<boolean>`coalesce((select m.de_l_administration from core.tickets_messages m where m.ticket_id = ${schema.tickets.id} order by m.cree_le desc limit 1), false)`;

/** Vue d'une demande (liste et détail) : auteur et personne assignée résolus par jointure. */
async function lireTickets(condition: ReturnType<typeof and> | undefined, limite: number, moiId: string) {
  const assigneCompte = sql`(select p.nom_affiche from core.comptes c join core.profils p on p.id = c.profil_id where c.id = ${schema.tickets.assigneCompteId})`;
  return base()
    .select({
      id: schema.tickets.id, categorie: schema.tickets.categorie, priorite: schema.tickets.priorite, sujet: schema.tickets.sujet, description: schema.tickets.description,
      statut: schema.tickets.statut, creeLe: schema.tickets.creeLe, majLe: schema.tickets.majLe, resoluLe: schema.tickets.resoluLe,
      auteurCompteId: schema.tickets.auteurCompteId, auteurNom: schema.profils.nomAffiche, auteurIdentifiant: schema.comptes.identifiant, auteurFonction: schema.profils.fonction,
      assigneCompteId: schema.tickets.assigneCompteId, assigneNom: sql<string | null>`${assigneCompte}`, assigneAMoi: sql<boolean>`coalesce(${schema.tickets.assigneCompteId} = ${moiId}, false)`,
      messages: nbMessages, reponseAdministration: derniereReponseAdmin,
    })
    .from(schema.tickets)
    .innerJoin(schema.comptes, eq(schema.comptes.id, schema.tickets.auteurCompteId))
    .innerJoin(schema.profils, eq(schema.profils.id, schema.comptes.profilId))
    .where(condition)
    .orderBy(desc(schema.tickets.majLe))
    .limit(limite);
}

/** Accès à une demande : son auteur ou l'administration. Sinon 404 (l'existence n'est pas révélée), refus journalisé. */
async function ticketAccessible(c: Ctx, id: string, action: string) {
  const [ticket] = await lireTickets(eq(schema.tickets.id, id), 1, c.get("compte").id);
  const admin = estAdmin(c.get("profil"));
  if (!ticket || (!admin && ticket.auteurCompteId !== c.get("compte").id)) {
    await journaliser(c.get("profil"), action, id, "gestion", false, ticket ? "relation" : null);
    throw new HTTPException(404, { message: "Demande introuvable" });
  }
  return { ticket, admin };
}

async function notifierAuteur(ticketId: string, titre: string, texteNotif: string) {
  const [dest] = await base().select({ npi: schema.profils.npi }).from(schema.tickets)
    .innerJoin(schema.comptes, eq(schema.comptes.id, schema.tickets.auteurCompteId))
    .innerJoin(schema.profils, eq(schema.profils.id, schema.comptes.profilId))
    .where(eq(schema.tickets.id, ticketId));
  if (!dest?.npi) return;
  await base().insert(schema.notifications).values({ id: `NOT-${randomBytes(12).toString("hex")}`, destinataireNpi: dest.npi, titre, texte: texteNotif.length > 180 ? `${texteNotif.slice(0, 177)}…` : texteNotif });
}

administration.post("/assistance/tickets", authentifie, limiteDebit(5, 10 * 60_000, cleUtilisateur), async (c) => {
  const saisie = await corps(c, z.object({
    categorie: z.enum(CATEGORIES),
    priorite: z.enum(PRIORITES).default("normale"),
    sujet: texte(5, 140),
    description: texte(10, 4000, true),
  }).strict());
  const id = nouvelIdTicket();
  await base().insert(schema.tickets).values({ id, auteurCompteId: c.get("compte").id, ...saisie });
  await journaliser(c.get("profil"), "Création d'une demande d'assistance", `${id} · ${saisie.categorie}`, "gestion", true, null);
  const [ticket] = await lireTickets(eq(schema.tickets.id, id), 1, c.get("compte").id);
  return c.json(ticket, 201);
});

administration.get("/assistance/tickets", authentifie, async (c) => {
  return c.json(await lireTickets(eq(schema.tickets.auteurCompteId, c.get("compte").id), 100, c.get("compte").id));
});

administration.get("/assistance/tickets/:id", authentifie, async (c) => {
  const id = ID_TICKET.parse(c.req.param("id"));
  const { ticket } = await ticketAccessible(c, id, "Consultation d'une demande d'assistance");
  const messages = await base()
    .select({ id: schema.ticketsMessages.id, auteurNom: schema.ticketsMessages.auteurNom, deLAdministration: schema.ticketsMessages.deLAdministration, contenu: schema.ticketsMessages.contenu, creeLe: schema.ticketsMessages.creeLe, deMoi: sql<boolean>`${schema.ticketsMessages.auteurCompteId} = ${c.get("compte").id}` })
    .from(schema.ticketsMessages).where(eq(schema.ticketsMessages.ticketId, id)).orderBy(asc(schema.ticketsMessages.creeLe));
  await journaliser(c.get("profil"), "Consultation d'une demande d'assistance", id, "gestion", true, null);
  return c.json({ ticket, messages });
});

administration.post("/assistance/tickets/:id/messages", authentifie, limiteDebit(30, 10 * 60_000, cleUtilisateur), async (c) => {
  const id = ID_TICKET.parse(c.req.param("id"));
  const { contenu } = await corps(c, z.object({ contenu: MESSAGE }).strict());
  const { ticket, admin } = await ticketAccessible(c, id, "Réponse à une demande d'assistance");
  if (ticket.statut === "clos") erreur422("Demande close : ouvrez une nouvelle demande si le problème persiste");
  const deLAdministration = admin && ticket.auteurCompteId !== c.get("compte").id;
  // Réponse de l'administration : la demande passe « en cours » ; réponse de l'auteur sur une demande résolue : réouverture.
  const statut = deLAdministration ? (ticket.statut === "ouvert" ? "en_cours" : ticket.statut) : ticket.statut === "resolu" ? "ouvert" : ticket.statut;
  await base().transaction(async (tx) => {
    await tx.insert(schema.ticketsMessages).values({ id: `MSG-${randomBytes(12).toString("hex")}`, ticketId: id, auteurCompteId: c.get("compte").id, auteurNom: c.get("profil").nomAffiche, deLAdministration, contenu });
    await tx.update(schema.tickets).set({ statut, majLe: new Date(), ...(statut !== "resolu" && ticket.statut === "resolu" ? { resoluLe: null } : {}) }).where(eq(schema.tickets.id, id));
  });
  if (deLAdministration) await notifierAuteur(id, `Réponse à votre demande ${id}`, `${ticket.sujet} — ${contenu}`);
  await journaliser(c.get("profil"), "Réponse à une demande d'assistance", `${id}${deLAdministration ? " · administration" : ""}`, "gestion", true, null);
  return c.json({ ok: true, statut }, 201);
});

/** L'auteur clôt sa propre demande (problème réglé de son côté). */
administration.post("/assistance/tickets/:id/clore", authentifie, async (c) => {
  const id = ID_TICKET.parse(c.req.param("id"));
  const { ticket } = await ticketAccessible(c, id, "Clôture d'une demande d'assistance");
  if (ticket.statut === "clos") return c.json({ ok: true, statut: "clos" });
  await base().update(schema.tickets).set({ statut: "clos", majLe: new Date(), resoluLe: ticket.resoluLe ?? new Date() }).where(eq(schema.tickets.id, id));
  await journaliser(c.get("profil"), "Clôture d'une demande d'assistance", id, "gestion", true, null);
  return c.json({ ok: true, statut: "clos" });
});

/* ------------------------------------------------------------------ File de l'administration */

administration.get("/admin/tickets", authentifie, async (c) => {
  await exigerAdmin(c, "Consultation des demandes d'assistance", "core.tickets");
  const f = z.object({
    statut: z.enum([...STATUTS, "actifs"]).optional().catch(undefined),
    categorie: z.enum(CATEGORIES).optional().catch(undefined),
    priorite: z.enum(PRIORITES).optional().catch(undefined),
    assigne: z.enum(["moi", "personne"]).optional().catch(undefined),
    q: z.string().trim().max(80).optional().catch(undefined),
  }).parse(c.req.query());
  const q = f.q?.replace(/[%_\\]/g, "");
  const condition = and(
    f.statut === "actifs" ? inArray(schema.tickets.statut, ["ouvert", "en_cours"]) : f.statut ? eq(schema.tickets.statut, f.statut) : undefined,
    f.categorie ? eq(schema.tickets.categorie, f.categorie) : undefined,
    f.priorite ? eq(schema.tickets.priorite, f.priorite) : undefined,
    f.assigne === "moi" ? eq(schema.tickets.assigneCompteId, c.get("compte").id) : f.assigne === "personne" ? sql`${schema.tickets.assigneCompteId} is null` : undefined,
    q ? or(ilike(schema.tickets.sujet, `%${q}%`), ilike(schema.tickets.id, `%${q}%`), ilike(schema.profils.nomAffiche, `%${q}%`)) : undefined,
  );
  const [tickets, parStatut] = await Promise.all([
    lireTickets(condition, 200, c.get("compte").id),
    base().select({ statut: schema.tickets.statut, n: count() }).from(schema.tickets).groupBy(schema.tickets.statut),
  ]);
  await journaliser(c.get("profil"), "Consultation des demandes d'assistance", "core.tickets", "gestion", true, null);
  const compteurs = Object.fromEntries(STATUTS.map((s) => [s, parStatut.find((x) => x.statut === s)?.n ?? 0])) as Record<(typeof STATUTS)[number], number>;
  return c.json({ tickets, compteurs });
});

administration.post("/admin/tickets/:id/statut", authentifie, async (c) => {
  await exigerAdmin(c, "Changement de statut d'une demande", c.req.param("id"));
  const id = ID_TICKET.parse(c.req.param("id"));
  const { statut } = await corps(c, z.object({ statut: z.enum(STATUTS) }).strict());
  const [avant] = await base().select({ statut: schema.tickets.statut, sujet: schema.tickets.sujet, assigne: schema.tickets.assigneCompteId }).from(schema.tickets).where(eq(schema.tickets.id, id));
  if (!avant) throw new HTTPException(404, { message: "Demande introuvable" });
  if (avant.statut === statut) return c.json({ ok: true, statut });
  await base().update(schema.tickets).set({
    statut, majLe: new Date(),
    resoluLe: statut === "resolu" || statut === "clos" ? new Date() : null,
    // Passer « en cours » sans personne assignée : l'administrateur qui agit prend la demande.
    ...(statut === "en_cours" && !avant.assigne ? { assigneCompteId: c.get("compte").id } : {}),
  }).where(eq(schema.tickets.id, id));
  if (statut === "resolu") await notifierAuteur(id, `Demande ${id} résolue`, `${avant.sujet} — répondez dans le fil si le problème persiste.`);
  await journaliser(c.get("profil"), "Changement de statut d'une demande", `${id} · ${avant.statut} → ${statut}`, "gestion", true, null);
  return c.json({ ok: true, statut });
});

administration.post("/admin/tickets/:id/assignation", authentifie, async (c) => {
  await exigerAdmin(c, "Prise en charge d'une demande", c.req.param("id"));
  const id = ID_TICKET.parse(c.req.param("id"));
  const { assigner } = await corps(c, z.object({ assigner: z.boolean() }).strict());
  const [maj] = await base().update(schema.tickets).set({ assigneCompteId: assigner ? c.get("compte").id : null, majLe: new Date() }).where(eq(schema.tickets.id, id)).returning({ id: schema.tickets.id });
  if (!maj) throw new HTTPException(404, { message: "Demande introuvable" });
  await journaliser(c.get("profil"), assigner ? "Prise en charge d'une demande" : "Libération d'une demande", id, "gestion", true, null);
  return c.json({ ok: true });
});

/* ================================================================== Calendrier scolaire */

const ANNEE_SCOLAIRE = z.string().regex(/^(\d{4})-(\d{4})$/).refine((a) => Number(a.slice(5)) === Number(a.slice(0, 4)) + 1, "année scolaire attendue : AAAA-AAAA+1");
const DATE_ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date attendue : AAAA-MM-JJ").refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), "date invalide");
const ECHEANCE = z.object({
  annee: ANNEE_SCOLAIRE,
  titre: z.string().trim().min(3).max(90),
  categorie: z.enum(["rentree", "trimestre", "conges", "ferie", "examen", "evaluation", "fin", "autre"]),
  debut: DATE_ISO,
  fin: DATE_ISO,
  statut: z.enum(["officiel", "provisoire"]),
  note: z.string().trim().max(200).nullable().optional(),
}).strict().refine((e) => e.fin >= e.debut, { message: "la fin précède le début", path: ["fin"] })
  .refine((e) => e.debut >= `${e.annee.slice(0, 4)}-08-01` && e.fin <= `${e.annee.slice(5)}-09-30`, { message: "les dates doivent appartenir à l'année scolaire (d'août à la fin des grandes vacances)", path: ["debut"] });

administration.get("/admin/calendrier", authentifie, async (c) => {
  await exigerAdmin(c, "Consultation du calendrier", "core.calendrier");
  return c.json(await base().select().from(schema.calendrier).orderBy(desc(schema.calendrier.annee), asc(schema.calendrier.debut)));
});

administration.post("/admin/calendrier", authentifie, async (c) => {
  await exigerAdmin(c, "Ajout d'une échéance au calendrier", "core.calendrier");
  const e = await corps(c, ECHEANCE);
  const id = `CAL-${randomBytes(6).toString("hex")}`;
  await base().insert(schema.calendrier).values({ id, ...e, note: e.note ?? null, majPar: c.get("profil").nomAffiche });
  await journaliser(c.get("profil"), "Ajout d'une échéance au calendrier", `${id} · ${e.titre} · ${e.debut} · ${e.statut}`, "gestion", true, null);
  return c.json({ id }, 201);
});

administration.post("/admin/calendrier/:id", authentifie, async (c) => {
  await exigerAdmin(c, "Modification du calendrier", c.req.param("id"));
  const id = z.string().regex(/^CAL-[A-Za-z0-9-]{2,24}$/).parse(c.req.param("id"));
  const e = await corps(c, ECHEANCE);
  const [maj] = await base().update(schema.calendrier).set({ ...e, note: e.note ?? null, majLe: new Date(), majPar: c.get("profil").nomAffiche }).where(eq(schema.calendrier.id, id)).returning({ id: schema.calendrier.id });
  if (!maj) throw new HTTPException(404, { message: "Échéance introuvable" });
  await journaliser(c.get("profil"), "Modification du calendrier", `${id} · ${e.titre} · ${e.debut} → ${e.fin} · ${e.statut}`, "gestion", true, null);
  return c.json({ ok: true });
});

administration.post("/admin/calendrier/:id/supprimer", authentifie, async (c) => {
  await exigerAdmin(c, "Suppression d'une échéance", c.req.param("id"));
  const id = z.string().regex(/^CAL-[A-Za-z0-9-]{2,24}$/).parse(c.req.param("id"));
  const [sup] = await base().delete(schema.calendrier).where(eq(schema.calendrier.id, id)).returning({ titre: schema.calendrier.titre });
  if (!sup) throw new HTTPException(404, { message: "Échéance introuvable" });
  await journaliser(c.get("profil"), "Suppression d'une échéance", `${id} · ${sup.titre}`, "gestion", true, null);
  return c.json({ ok: true });
});
