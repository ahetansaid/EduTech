import { Habilitation, type Profil, type Role } from "@beile/contracts";
import { schema } from "@beile/db";
import { genererMotDePasse, hacherMotDePasse } from "@beile/db/securite";
import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { proposerIdentifiant, suffixeAleatoire, verifierCoherence } from "./administration";
import { authentifie, base, exigerElevation, cleUtilisateur, corps, journaliser, limiteDebit, oublierSession, refuser, type Variables } from "./commun";
import { masquer } from "./cryptographie";
import { canauxDisponibles, envoyer } from "./messagerie";
import { surCreationCompte } from "./vigie";

/**
 * Administration déléguée en cascade.
 *
 * Chaque administrateur porte une délégation (niveau 0 à 4) sur une organisation de l'arbre de l'État et
 * n'agit que dans son sous-arbre, sur des niveaux strictement inférieurs. Règles vérifiées ICI, jamais
 * dans le navigateur :
 *   1. Portée : l'organisation visée est dans le sous-arbre d'une délégation active de l'acteur.
 *   2. Plafond : on n'attribue que des rôles que sa délégation permet d'attribuer, jamais au-delà de sa propre
 *      date de fin ; on ne nomme un administrateur qu'avec un sous-ensemble de ses propres rôles délégables.
 *   3. Nul ne s'attribue rien, nul ne valide sa propre nomination ni celle qu'il a demandée.
 *   4. Cumul encadré : combinaisons interdites (niveau 0 + métier, DPO + administration, chercheur + gestion).
 *   5. Double validation : la nomination d'un administrateur de niveau 2 ou moins attend une seconde personne.
 *   6. Tout droit est daté ; à l'échéance il tombe (commun.ts, au chargement de la session).
 */
export const delegation = new Hono<{ Variables: Variables }>();

const UN_AN = 365 * 86_400_000;
const ROLES_METIER = ["administration_centrale", "direction_departementale", "inspecteur", "chef_etablissement", "enseignant", "apprenant", "parent", "chercheur", "dpo"] as const;
const PLAFONDS: Record<string, string[]> = {
  autorite: ["administration_centrale", "dpo", "chercheur", "direction_departementale", "inspecteur", "chef_etablissement", "enseignant"],
  ministere: ["administration_centrale", "direction_departementale", "inspecteur", "chef_etablissement", "enseignant"],
  organisme: ["administration_centrale"],
  departement: ["inspecteur", "chef_etablissement", "enseignant"],
  universite: ["chef_etablissement", "enseignant"],
  circonscription: ["chef_etablissement", "enseignant"],
  etablissement: ["enseignant", "apprenant", "parent"],
};
const NIVEAU_DU_TYPE: Record<string, number> = { autorite: 0, ministere: 1, organisme: 1, departement: 2, universite: 2, circonscription: 3, etablissement: 3 };
/** Type d'organisation sur lequel un rôle métier se pose (et donc son périmètre). */
const TYPE_DU_ROLE: Record<string, string[]> = {
  administration_centrale: ["ministere", "organisme", "autorite"], dpo: ["autorite"], chercheur: ["autorite"],
  direction_departementale: ["departement"], inspecteur: ["circonscription"],
  chef_etablissement: ["etablissement", "universite"], enseignant: ["etablissement", "universite"],
  apprenant: ["etablissement", "universite"], parent: ["etablissement", "universite"],
};

type Org = typeof schema.organisations.$inferSelect;
type Delegation = typeof schema.delegations.$inferSelect;
const ID_ORG = z.string().regex(/^ORG-[A-Za-z0-9-]+$/);
const ID_PROFIL = z.string().regex(/^p-[A-Za-z0-9-]+$/);

/* ------------------------------------------------------------------ Arbre et portée */

async function organisation(id: string): Promise<Org> {
  const [o] = await base().select().from(schema.organisations).where(eq(schema.organisations.id, id));
  if (!o) throw new HTTPException(404, { message: "Organisation inconnue" });
  return o;
}
/** Ancêtres d'une organisation, elle comprise (du plus proche au plus lointain). */
async function ancetres(id: string): Promise<string[]> {
  const r = (await base().execute(sql`with recursive a as (select id, parent_id, 0 d from core.organisations where id = ${id}
    union all select o.id, o.parent_id, a.d + 1 from core.organisations o join a on o.id = a.parent_id where a.d < 12) select id from a order by d`)) as unknown as { id: string }[];
  return r.map((x) => x.id);
}
const actives = (profilId: string) => base().select().from(schema.delegations)
  .where(and(eq(schema.delegations.profilId, profilId), eq(schema.delegations.statut, "active"), lt(schema.delegations.du, new Date()), gt(schema.delegations.au, new Date())));

/** La délégation active de l'acteur qui couvre l'organisation (la plus proche), ou rien. */
async function delegationCouvrante(profilId: string, orgId: string, stricte = false): Promise<Delegation | null> {
  const [mes, chaine] = await Promise.all([actives(profilId), ancetres(orgId)]);
  const rang = (d: Delegation) => chaine.indexOf(d.organisationId);
  return mes.filter((d) => rang(d) >= (stricte ? 1 : 0)).sort((a, b) => rang(a) - rang(b))[0] ?? null;
}
async function exigerCouverture(profil: Profil, orgId: string, action: string, stricte = false) {
  const d = await delegationCouvrante(profil.id, orgId, stricte);
  if (!d) {
    await journaliser(profil, action, orgId, "gestion", false, "perimetre");
    refuser("Cette organisation n'est pas dans le périmètre de votre délégation : refus journalisé");
  }
  return d!;
}

/* ------------------------------------------------------------------ Cumul encadré */

/**
 * Combinaisons interdites (vérifiées sur l'état résultant) :
 * - un administrateur de niveau 0 ne porte aucun rôle métier (accès aux comptes ≠ accès aux données) ;
 * - le DPO ne porte aucune délégation d'administration (il contrôle les administrateurs) ;
 * - le chercheur ne porte ni délégation ni rôle de gestion.
 */
function verifierCumul(roles: string[], niveaux: number[]): string | null {
  const metier = roles.filter((r) => r !== "administrateur");
  if (niveaux.includes(0) && metier.length) return "Un administrateur de niveau 0 ne peut porter aucun rôle métier.";
  if (roles.includes("dpo") && niveaux.length) return "Le délégué à la protection des données ne peut porter aucune délégation d'administration.";
  if (roles.includes("chercheur") && (niveaux.length || metier.some((r) => r !== "chercheur"))) return "Le chercheur ne peut cumuler ni administration ni rôle de gestion.";
  return null;
}
async function etatDuProfil(profilId: string) {
  const [p] = await base().select().from(schema.profils).where(eq(schema.profils.id, profilId));
  if (!p) throw new HTTPException(404, { message: "Profil inconnu" });
  const dlg = await actives(profilId);
  const enAttente = await base().select().from(schema.delegations).where(and(eq(schema.delegations.profilId, profilId), eq(schema.delegations.statut, "en_attente")));
  return { profil: p, habilitations: p.habilitations as Habilitation[], niveaux: [...dlg, ...enAttente].map((d) => d.niveau) };
}

/* ------------------------------------------------------------------ Périmètre d'un rôle posé sur une organisation */

function perimetreDe(role: string, org: Org, sujet?: { apprenantId?: string; npi?: string | null }): Habilitation["perimetre"] {
  if (!(TYPE_DU_ROLE[role] ?? []).includes(org.type)) throw new HTTPException(422, { message: `Le rôle « ${role} » ne se pose pas sur une organisation de type « ${org.type} ».` });
  if (["administration_centrale", "dpo", "chercheur"].includes(role)) return { niveau: "national" };
  if (role === "direction_departementale") return { niveau: "departement", departementId: org.departementId! };
  if (role === "inspecteur") return { niveau: "circonscription", circonscription: org.circonscription! };
  if (role === "apprenant") {
    if (!sujet?.apprenantId) throw new HTTPException(422, { message: "Le dossier de l'apprenant (APP-…) est requis." });
    return { niveau: "personnel", apprenantId: sujet.apprenantId };
  }
  if (role === "parent") {
    if (!sujet?.npi) throw new HTTPException(422, { message: "Le NPI du responsable légal est requis." });
    return { niveau: "famille", responsableNpi: sujet.npi };
  }
  return { niveau: "etablissement", etablissementId: org.etablissementId! };
}

/**
 * Ancrage d'un rôle d'usager dans l'organisation qui l'accorde. Sans lui, un administrateur d'établissement
 * créerait un compte « responsable légal » au NPI de n'importe quel adulte du registre, et lirait le dossier
 * de ses enfants partout au Bénin. Un parent n'est créé que pour un enfant scolarisé ICI ; un élève, s'il est
 * inscrit ICI.
 */
async function verifierAncrage(role: string, org: Org, sujet: { apprenantId?: string; npi?: string | null }) {
  if (role !== "parent" && role !== "apprenant") return;
  const etab = org.etablissementId;
  if (!etab) throw new HTTPException(422, { message: "Ce rôle se pose sur un établissement." });
  const eleves = role === "apprenant"
    ? sql`select ${sujet.apprenantId ?? ""}::text as id`
    : sql`select apprenant_id as id from core.liens_familiaux where responsable_npi = ${sujet.npi ?? ""}`;
  const [ok] = (await base().execute(sql`
    with e as (${eleves})
    select 1 from e where exists (select 1 from core.scolarites s left join core.classes c on c.id = s.classe_id
        where s.apprenant_id = e.id and coalesce(s.etablissement_id, c.etablissement_id) = ${etab})
      or exists (select 1 from core.inscriptions_superieures i where i.apprenant_id = e.id and i.etablissement_id = ${etab})
    limit 1`)) as unknown as unknown[];
  if (!ok) {
    throw new HTTPException(422, { message: role === "parent"
      ? "Aucun enfant rattaché à ce NPI n'est scolarisé dans cet établissement : le compte parent se crée là où l'enfant est inscrit."
      : "Cet apprenant n'est pas inscrit dans cet établissement." });
  }
}

/** Retire des droits effectifs une habilitation (même rôle, même périmètre), et invalide la session en cache. */
async function retirerHabilitation(profilId: string, role: string, perimetre: unknown) {
  const [p] = await base().select().from(schema.profils).where(eq(schema.profils.id, profilId));
  if (!p) return;
  const restantes = (p.habilitations as Habilitation[]).filter((h) => !(h.role === role && JSON.stringify(h.perimetre) === JSON.stringify(perimetre)));
  await base().update(schema.profils).set({ habilitations: restantes }).where(eq(schema.profils.id, profilId));
  await revoquerSessions(profilId);
}
async function revoquerSessions(profilId: string) {
  const comptes = await base().select({ id: schema.comptes.id }).from(schema.comptes).where(eq(schema.comptes.profilId, profilId));
  if (!comptes.length) return;
  const sessions = await base().update(schema.sessions).set({ revoquee: true }).where(and(inArray(schema.sessions.compteId, comptes.map((x) => x.id)), eq(schema.sessions.revoquee, false))).returning({ e: schema.sessions.empreinte });
  for (const s of sessions) oublierSession(s.e);
}

const dateFin = (demandee: string | undefined, plafond: Date) => {
  // Par défaut : un an, dans la limite de la délégation du garant (un droit ne survit pas à celui qui l'a accordé).
  const voulue = demandee ? new Date(demandee) : new Date(Math.min(Date.now() + UN_AN, plafond.getTime()));
  if (Number.isNaN(voulue.getTime()) || voulue <= new Date()) throw new HTTPException(422, { message: "Date de fin invalide ou passée." });
  if (voulue > plafond) throw new HTTPException(422, { message: `La date de fin ne peut dépasser celle de votre propre délégation (${plafond.toISOString().slice(0, 10)}).` });
  return voulue;
};

/* ================================================================== Lecture */

/** Mes délégations, ce qui attend ma validation, ce qui arrive à échéance dans mon périmètre. */
delegation.get("/delegation/moi", authentifie, async (c) => {
  const profil = c.get("profil");
  const mes = await actives(profil.id);
  if (!mes.length) return c.json({ delegations: [], aValider: 0, echeances: 0 });
  const orgs = await base().select().from(schema.organisations).where(inArray(schema.organisations.id, mes.map((d) => d.organisationId)));
  const enAttente = await base().select().from(schema.delegations).where(eq(schema.delegations.statut, "en_attente"));
  let aValider = 0;
  for (const d of enAttente) if (d.profilId !== profil.id && d.accordeePar !== profil.id && mes.some((m) => m.niveau < d.niveau)) {
    if ((await ancetres(d.organisationId)).some((id) => mes.some((m) => m.organisationId === id && m.niveau < d.niveau))) aValider++;
  }
  return c.json({
    delegations: mes.map((d) => ({ ...d, organisation: orgs.find((o) => o.id === d.organisationId) ?? null })),
    aValider,
  });
});

/** Enfants directs d'une organisation de mon périmètre (arbre parcouru à la demande). */
delegation.get("/delegation/organisations", authentifie, async (c) => {
  const profil = c.get("profil");
  const f = z.object({ parent: ID_ORG, q: z.string().trim().max(60).optional() }).parse(c.req.query());
  await exigerCouverture(profil, f.parent, "Parcours de l'arbre des organisations");
  const enfants = await base().execute(sql`select o.id, o.type, o.nom, o.ministere, (select count(*)::int from core.organisations e where e.parent_id = o.id) as enfants
    from core.organisations o where o.parent_id = ${f.parent} ${f.q ? sql`and o.nom ilike ${`%${f.q.replace(/[%_\\]/g, "")}%`}` : sql``}
    order by o.type, o.nom limit 200`);
  return c.json({ parent: await organisation(f.parent), enfants });
});

/** Comptes portant un droit (attribution ou délégation) dans le sous-arbre d'une organisation de mon périmètre. */
delegation.get("/delegation/comptes", authentifie, async (c) => {
  const profil = c.get("profil");
  const f = z.object({ organisation: ID_ORG, q: z.string().trim().max(60).optional() }).parse(c.req.query());
  const couvrante = await exigerCouverture(profil, f.organisation, "Liste des comptes délégués");
  const motif = f.q ? `%${f.q.replace(/[%_\\]/g, "")}%` : null;
  const lignes = (await base().execute(sql`
    with recursive sous(id) as (select ${f.organisation}::text union all select o.id from core.organisations o join sous on o.parent_id = sous.id),
    porteurs as (
      select profil_id from core.attributions where organisation_id in (select id from sous) and revoquee_le is null
      union select profil_id from core.delegations where organisation_id in (select id from sous) and statut in ('active','en_attente')
    )
    select p.id, p.nom_affiche as "nomAffiche", p.fonction, c.id as "compteId", c.identifiant, c.actif,
      (select coalesce(json_agg(json_build_object('id', a.id, 'role', a.role, 'organisationId', a.organisation_id, 'organisation', oa.nom, 'au', a.au, 'garant', a.accordee_par, 'dansPerimetre', a.organisation_id in (select id from sous)) order by a.role), '[]')
         from core.attributions a join core.organisations oa on oa.id = a.organisation_id where a.profil_id = p.id and a.revoquee_le is null) as attributions,
      (select coalesce(json_agg(json_build_object('id', d.id, 'niveau', d.niveau, 'statut', d.statut, 'organisationId', d.organisation_id, 'organisation', od.nom, 'au', d.au)), '[]')
         from core.delegations d join core.organisations od on od.id = d.organisation_id where d.profil_id = p.id and d.statut in ('active','en_attente') and d.organisation_id in (select id from sous)) as delegations
    from porteurs x join core.profils p on p.id = x.profil_id left join core.comptes c on c.profil_id = p.id
    ${motif ? sql`where p.nom_affiche ilike ${motif} or c.identifiant ilike ${motif}` : sql``}
    order by p.nom_affiche limit 100`)) as unknown as { id: string; attributions: { role: string; dansPerimetre: boolean }[]; delegations: unknown[] }[];
  await journaliser(profil, "Liste des comptes délégués", f.organisation, "gestion", true, null);
  // Cumul signalé : un même profil porte à la fois un rôle métier et une délégation d'administration.
  // « gerable » : ce que je peux reconfirmer ou révoquer (jamais mes propres droits) ; le serveur revérifie à l'action.
  // Les droits détenus HORS de mon sous-arbre ne me regardent pas : seul le fait d'un cumul est signalé.
  return c.json(lignes.map((l) => ({
    ...l, cumul: l.attributions.length > 0 && l.delegations.length > 0,
    attributions: l.attributions.filter((a) => a.dansPerimetre).map(({ dansPerimetre, ...a }) => ({ ...a, gerable: dansPerimetre && l.id !== profil.id && couvrante.rolesDelegables.includes(a.role) })),
  })));
});

/** Nominations d'administrateurs en attente que je peux valider (jamais les miennes ni celles que j'ai demandées). */
delegation.get("/delegation/a-valider", authentifie, async (c) => {
  const profil = c.get("profil");
  const mes = await actives(profil.id);
  const enAttente = await base().select().from(schema.delegations).where(eq(schema.delegations.statut, "en_attente"));
  const out = [];
  for (const d of enAttente) {
    if (d.profilId === profil.id || d.accordeePar === profil.id) continue;
    const chaine = await ancetres(d.organisationId);
    if (!mes.some((m) => m.niveau < d.niveau && chaine.includes(m.organisationId))) continue;
    const [[o], [p], [demandeur]] = await Promise.all([
      base().select().from(schema.organisations).where(eq(schema.organisations.id, d.organisationId)),
      base().select({ nomAffiche: schema.profils.nomAffiche }).from(schema.profils).where(eq(schema.profils.id, d.profilId)),
      d.accordeePar ? base().select({ nomAffiche: schema.profils.nomAffiche }).from(schema.profils).where(eq(schema.profils.id, d.accordeePar)) : Promise.resolve([undefined]),
    ]);
    out.push({ ...d, organisation: o?.nom ?? d.organisationId, beneficiaire: p?.nomAffiche ?? d.profilId, demandeur: demandeur?.nomAffiche ?? null });
  }
  return c.json(out);
});

/* ================================================================== Écritures */

/** Créer un compte portant un rôle métier sur une organisation de mon périmètre. Mot de passe provisoire, à changer. */
delegation.post("/delegation/comptes", authentifie, limiteDebit(60, 60_000, cleUtilisateur), async (c) => {
  exigerElevation(c);
  const profil = c.get("profil");
  const s = await corps(c, z.object({
    nomAffiche: z.string().trim().min(3).max(120), fonction: z.string().trim().min(2).max(160),
    npi: z.string().regex(/^\d{10}$/).nullable().optional(), apprenantId: z.string().regex(/^APP-\d{6}$/).optional(),
    role: z.enum(ROLES_METIER), organisationId: ID_ORG, au: z.string().optional(),
    telephone: z.string().trim().transform((t) => t.replace(/[\s.-]/g, "")).pipe(z.string().regex(/^\+\d{8,15}$/)).optional(),
    courriel: z.string().trim().toLowerCase().email().max(120).optional(),
  }).strict());
  const org = await organisation(s.organisationId);
  const d = await exigerCouverture(profil, org.id, "Création d'un compte délégué");
  if (!d.rolesDelegables.includes(s.role)) {
    await journaliser(profil, "Création d'un compte délégué", `${org.id} · ${s.role}`, "gestion", false, "role");
    refuser(`Votre délégation ne permet pas d'attribuer le rôle « ${s.role} » : refus journalisé`);
  }
  // Toute personne qui reçoit un rôle est identifiée au registre national : pas de compte « fantôme ».
  if (!s.npi) throw new HTTPException(422, { message: "Le NPI de la personne est requis pour tout compte." });
  const au = dateFin(s.au, d.au);
  const perimetre = perimetreDe(s.role, org, { apprenantId: s.apprenantId, npi: s.npi });
  await verifierAncrage(s.role, org, { apprenantId: s.apprenantId, npi: s.npi });
  const habilitations = [{ role: s.role, perimetre }] as Habilitation[];
  const cumul = verifierCumul([s.role], []);
  if (cumul) throw new HTTPException(422, { message: cumul });
  await verifierCoherence(habilitations, s.npi ?? null, null);
  const identifiant = (await proposerIdentifiant(s.nomAffiche)) ?? (() => { throw new HTTPException(422, { message: "Impossible de proposer un identifiant." }); })();
  const suffixe = suffixeAleatoire();
  const profilId = `p-${suffixe}`, compteId = `CPT-${suffixe}`;
  const temporaire = genererMotDePasse();
  const hash = await hacherMotDePasse(temporaire);
  await base().transaction(async (tx) => {
    await tx.insert(schema.profils).values({ id: profilId, nomAffiche: s.nomAffiche, fonction: s.fonction, npi: s.npi ?? null, habilitations });
    await tx.insert(schema.comptes).values({ id: compteId, identifiant, motDePasseHash: hash, profilId, doitChangerMotDePasse: true, telephone: s.telephone ?? null, courriel: s.courriel ?? null });
    await tx.insert(schema.attributions).values({ id: `ATT-${suffixeAleatoire(16)}`, profilId, role: s.role, perimetre, organisationId: org.id, accordeePar: profil.id, motif: "Création du compte", au });
  });
  await journaliser(profil, "Création d'un compte délégué", `${compteId} · ${identifiant} · ${s.role} · ${org.id}`, "gestion", true, null);
  await surCreationCompte(profil.id, profil.nomAffiche);
  // Activation autonome : avec une coordonnée et un canal ouvert, la personne reçoit son identifiant et active
  // elle-même son compte par code (le mot de passe provisoire n'est alors jamais montré à l'administrateur).
  const canaux = canauxDisponibles();
  const canal = s.telephone && canaux.sms ? { k: "sms" as const, v: s.telephone } : s.courriel && canaux.courriel ? { k: "courriel" as const, v: s.courriel } : null;
  if (canal) {
    const parti = await envoyer({
      canal: canal.k, destinataire: canal.v, compteId, objet: "Votre compte BEILE",
      texte: `BEILE : un compte a été ouvert à votre nom (identifiant ${identifiant}). Activez-le vous-même sur le portail, rubrique « Activer mon compte ». Aucun agent ne vous demandera de code.`,
    }).catch(() => false);
    if (parti) return c.json({ compte: { id: compteId, identifiant }, profilId, activation: { canal: canal.k, destination: masquer(canal.v) }, au: au.toISOString() }, 201);
  }
  return c.json({ compte: { id: compteId, identifiant }, profilId, motDePasseTemporaire: temporaire, au: au.toISOString() }, 201);
});

/** Ajouter un rôle métier à un profil existant (cumul encadré). Jamais à soi-même. */
delegation.post("/delegation/attributions", authentifie, async (c) => {
  exigerElevation(c);
  const profil = c.get("profil");
  const s = await corps(c, z.object({ profilId: ID_PROFIL, role: z.enum(ROLES_METIER), organisationId: ID_ORG, apprenantId: z.string().regex(/^APP-\d{6}$/).optional(), au: z.string().optional(), motif: z.string().trim().min(5).max(200) }).strict());
  if (s.profilId === profil.id) {
    await journaliser(profil, "Attribution d'un rôle", s.role, "gestion", false, "role");
    refuser("Nul ne s'attribue un rôle à lui-même : demandez à votre supérieur. Refus journalisé");
  }
  const org = await organisation(s.organisationId);
  const d = await exigerCouverture(profil, org.id, "Attribution d'un rôle");
  if (!d.rolesDelegables.includes(s.role)) refuser(`Votre délégation ne permet pas d'attribuer le rôle « ${s.role} »`);
  const etat = await etatDuProfil(s.profilId);
  if (!etat.profil.npi) throw new HTTPException(422, { message: "Ce profil n'est pas rattaché au registre national (NPI) : aucun rôle ne peut lui être attribué." });
  const perimetre = perimetreDe(s.role, org, { apprenantId: s.apprenantId, npi: etat.profil.npi });
  await verifierAncrage(s.role, org, { apprenantId: s.apprenantId, npi: etat.profil.npi });
  if (etat.habilitations.some((h) => h.role === s.role && JSON.stringify(h.perimetre) === JSON.stringify(perimetre))) throw new HTTPException(409, { message: "Ce rôle est déjà attribué sur ce périmètre." });
  const cumul = verifierCumul([...etat.habilitations.map((h) => h.role), s.role], etat.niveaux);
  if (cumul) throw new HTTPException(422, { message: cumul });
  const nouvelles = [...etat.habilitations, { role: s.role as Role, perimetre }] as Habilitation[];
  await verifierCoherence(nouvelles, etat.profil.npi, s.profilId);
  const au = dateFin(s.au, d.au);
  const id = `ATT-${suffixeAleatoire(16)}`;
  await base().transaction(async (tx) => {
    await tx.update(schema.profils).set({ habilitations: nouvelles }).where(eq(schema.profils.id, s.profilId));
    await tx.insert(schema.attributions).values({ id, profilId: s.profilId, role: s.role, perimetre, organisationId: org.id, accordeePar: profil.id, motif: s.motif, au });
  });
  await revoquerSessions(s.profilId);
  await journaliser(profil, "Attribution d'un rôle", `${s.profilId} · ${s.role} · ${org.id}`, "gestion", true, null);
  return c.json({ id, au: au.toISOString() }, 201);
});

async function attributionGeree(profil: Profil, id: string, action: string) {
  const [a] = await base().select().from(schema.attributions).where(eq(schema.attributions.id, id));
  if (!a || a.revoqueeLe) throw new HTTPException(404, { message: "Attribution introuvable ou déjà révoquée" });
  if (a.profilId === profil.id) refuser("Nul n'agit sur ses propres droits : demandez à votre supérieur");
  const d = await exigerCouverture(profil, a.organisationId, action);
  if (!d.rolesDelegables.includes(a.role)) refuser(`Votre délégation ne couvre pas le rôle « ${a.role} »`);
  return { a, d };
}

delegation.post("/delegation/attributions/:id/revoquer", authentifie, async (c) => {
  exigerElevation(c);
  const profil = c.get("profil");
  const id = z.string().regex(/^ATT-[A-Za-z0-9-]+$/).parse(c.req.param("id"));
  const { motif } = await corps(c, z.object({ motif: z.string().trim().min(5).max(200) }).strict());
  const { a } = await attributionGeree(profil, id, "Révocation d'un rôle");
  await base().update(schema.attributions).set({ revoqueeLe: new Date(), revoqueePar: profil.id, motifRevocation: motif }).where(eq(schema.attributions.id, id));
  await retirerHabilitation(a.profilId, a.role, a.perimetre);
  await journaliser(profil, "Révocation d'un rôle", `${a.profilId} · ${a.role} · ${motif}`, "gestion", true, null);
  return c.json({ revoquee: true });
});

/** Reconfirmation annuelle : le droit est prolongé (au plus jusqu'à la fin de ma propre délégation). */
delegation.post("/delegation/attributions/:id/reconfirmer", authentifie, async (c) => {
  exigerElevation(c);
  const profil = c.get("profil");
  const id = z.string().regex(/^ATT-[A-Za-z0-9-]+$/).parse(c.req.param("id"));
  const s = await corps(c, z.object({ au: z.string().optional() }).strict());
  const { a, d } = await attributionGeree(profil, id, "Reconfirmation d'un rôle");
  const au = dateFin(s.au, d.au);
  await base().update(schema.attributions).set({ au }).where(eq(schema.attributions.id, id));
  await journaliser(profil, "Reconfirmation d'un rôle", `${a.profilId} · ${a.role} → ${au.toISOString().slice(0, 10)}`, "gestion", true, null);
  return c.json({ au: au.toISOString() });
});

/**
 * Nommer un administrateur sur une organisation STRICTEMENT inférieure (ou un référent de proximité, niveau 4,
 * dans mon établissement). Rôles délégables : sous-ensemble des miens et du plafond du type. Niveau ≤ 2 :
 * en attente d'une seconde validation.
 */
delegation.post("/delegation/delegations", authentifie, async (c) => {
  exigerElevation(c);
  const profil = c.get("profil");
  const s = await corps(c, z.object({
    profilId: ID_PROFIL, organisationId: ID_ORG, referent: z.boolean().default(false),
    rolesDelegables: z.array(z.enum(ROLES_METIER)).max(9).optional(), peutNommer: z.boolean().default(false),
    au: z.string().optional(), motif: z.string().trim().min(5).max(200),
  }).strict());
  if (s.profilId === profil.id) refuser("Nul ne se nomme lui-même administrateur : refus");
  const org = await organisation(s.organisationId);
  const d = s.referent ? await exigerCouverture(profil, org.id, "Nomination d'un référent") : await exigerCouverture(profil, org.id, "Nomination d'un administrateur", true);
  if (!d.peutNommer && !s.referent) refuser("Votre délégation ne permet pas de nommer d'administrateur");
  const niveau = s.referent ? 4 : NIVEAU_DU_TYPE[org.type]!;
  if (niveau <= d.niveau) refuser("On ne nomme que sur un niveau strictement inférieur au sien");
  if (s.referent && org.type !== "etablissement" && org.type !== "universite") throw new HTTPException(422, { message: "Un référent de proximité se nomme dans un établissement." });
  const plafond = s.referent ? [] : (PLAFONDS[org.type] ?? []).filter((r) => d.rolesDelegables.includes(r));
  const roles = s.referent ? [] : (s.rolesDelegables ?? plafond);
  if (roles.some((r) => !plafond.includes(r))) throw new HTTPException(422, { message: `Rôles délégables hors plafond : ${roles.filter((r) => !plafond.includes(r)).join(", ")}` });
  const etat = await etatDuProfil(s.profilId);
  const cumul = verifierCumul(etat.habilitations.map((h) => h.role), [...etat.niveaux, niveau]);
  if (cumul) throw new HTTPException(422, { message: cumul });
  const au = dateFin(s.au, d.au);
  const id = `DLG-${suffixeAleatoire(16)}`;
  const statut = niveau <= 2 ? "en_attente" : "active";
  await base().insert(schema.delegations).values({
    id, profilId: s.profilId, organisationId: org.id, niveau, rolesDelegables: roles, peutNommer: s.peutNommer && d.peutNommer && niveau < 3,
    statut, accordeePar: profil.id, motif: s.motif, au,
  });
  await journaliser(profil, "Nomination d'un administrateur", `${s.profilId} · niveau ${niveau} · ${org.id} · ${statut}`, "gestion", true, null);
  return c.json({ id, statut, niveau, au: au.toISOString() }, 201);
});

/** Seconde validation d'une nomination : par un administrateur de niveau supérieur couvrant l'organisation, ni bénéficiaire ni demandeur. */
delegation.post("/delegation/delegations/:id/:decision{valider|refuser}", authentifie, async (c) => {
  exigerElevation(c);
  const profil = c.get("profil");
  const id = z.string().regex(/^DLG-[A-Za-z0-9-]+$/).parse(c.req.param("id"));
  const decision = c.req.param("decision");
  const [d] = await base().select().from(schema.delegations).where(eq(schema.delegations.id, id));
  if (!d || d.statut !== "en_attente") throw new HTTPException(409, { message: "Nomination introuvable ou déjà traitée" });
  if (d.profilId === profil.id || d.accordeePar === profil.id) {
    await journaliser(profil, "Validation d'une nomination", id, "gestion", false, "role");
    refuser("La seconde validation revient à une autre personne que le bénéficiaire et le demandeur : refus journalisé");
  }
  const chaine = await ancetres(d.organisationId);
  const mes = await actives(profil.id);
  if (!mes.some((m) => m.niveau < d.niveau && chaine.includes(m.organisationId))) refuser("Seul un administrateur de niveau supérieur couvrant cette organisation peut valider");
  const statut = decision === "valider" ? "active" : "refusee";
  await base().update(schema.delegations).set({ statut, valideePar: profil.id }).where(eq(schema.delegations.id, id));
  await journaliser(profil, "Validation d'une nomination", `${id} → ${statut}`, "gestion", true, null);
  return c.json({ statut });
});

delegation.post("/delegation/delegations/:id/revoquer", authentifie, async (c) => {
  exigerElevation(c);
  const profil = c.get("profil");
  const id = z.string().regex(/^DLG-[A-Za-z0-9-]+$/).parse(c.req.param("id"));
  const { motif } = await corps(c, z.object({ motif: z.string().trim().min(5).max(200) }).strict());
  const [d] = await base().select().from(schema.delegations).where(eq(schema.delegations.id, id));
  if (!d || !["active", "en_attente"].includes(d.statut)) throw new HTTPException(404, { message: "Délégation introuvable ou déjà révoquée" });
  if (d.profilId === profil.id) refuser("Nul ne révoque sa propre délégation : demandez à votre supérieur");
  const chaine = await ancetres(d.organisationId);
  const mes = await actives(profil.id);
  if (!mes.some((m) => m.niveau < d.niveau && chaine.includes(m.organisationId))) refuser("Seul un administrateur de niveau supérieur couvrant cette organisation peut révoquer");
  await base().update(schema.delegations).set({ statut: "revoquee", revoqueeLe: new Date(), revoqueePar: profil.id, motif }).where(eq(schema.delegations.id, id));
  await revoquerSessions(d.profilId);
  await journaliser(profil, "Révocation d'une délégation", `${d.profilId} · niveau ${d.niveau} · ${motif}`, "gestion", true, null);
  return c.json({ revoquee: true });
});
