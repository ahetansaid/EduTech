import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { schema } from "@beile/db";
import { codeTotp, hacherMotDePasse, motDePasseConforme, nouveauSecretTotp, verifierMotDePasse, verifierTotp } from "@beile/db/securite";
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type AuthenticatorTransportFuture, type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  authentifie, base, cleUtilisateur, controlerOrigine, cookieSecurise, corps, ErreurCodee, exigerElevation, journaliser, limiteDebit, limiteDebitPartage, oublierSession, refuser,
  revoquerSessionsDuCompte, type Variables,
} from "./commun";
import { chiffrer, cleDerivee, codeNumerique, dechiffrer, egalConstant, empreinteSecret, masquer } from "./cryptographie";
import { lireEnv } from "./env";
import { canauxDisponibles, envoyer, type Canal } from "./messagerie";
import { signaler, surEchecsSecondFacteur } from "./vigie";

/**
 * Sécurité des comptes.
 *
 * Lot B — activation et récupération sans intervention d'un administrateur :
 *   un code à 6 chiffres (10 min, 5 essais, usage unique, seule son empreinte HMAC est gardée) est envoyé
 *   par SMS (opérateur national) ou courriel (domaine de la plateforme) ; les réponses ne révèlent jamais
 *   si un compte existe. Chacun peut enregistrer et vérifier ses propres coordonnées de récupération.
 *
 * Lot C — second facteur des administrateurs de niveau 0 à 2 : TOTP (application d'authentification) ou
 *   clé FIDO2 / WebAuthn, dix codes de secours à usage unique, et élévation « juste à temps » de 15 min
 *   exigée avant toute action d'administration.
 */
export const securiteComptes = new Hono<{ Variables: Variables }>();

const DUREE_CODE_MS = 10 * 60_000;
const ESSAIS_CODE = 5;
const DUREE_ELEVATION_MS = 15 * 60_000;
const ECHECS_MFA_MAX = 5;
const REPONSE_GENERIQUE = { ok: true, message: "Si ce compte existe et dispose d'une coordonnée utilisable, un code vient d'être envoyé. Il est valable 10 minutes." };
const CODE_INVALIDE = "Code invalide ou expiré";
const TELEPHONE = z.string().trim().transform((t) => t.replace(/[\s.-]/g, "")).pipe(z.string().regex(/^\+\d{8,15}$/, "numéro au format international (+229…)"));
const COURRIEL = z.string().trim().toLowerCase().email().max(120);
const REGLE_MDP = "12 caractères minimum, avec au moins une minuscule, une majuscule et un chiffre, et pas un mot de passe courant";
/** Durée minimale de réponse d'une demande de code : identique que le compte existe ou non. */
const DUREE_REPONSE_CODE_MS = 1500;

/**
 * Plafond PARTAGÉ (en base, toutes instances) et par COMPTE sur les vérifications de second facteur et
 * d'élévation : ni une nouvelle connexion, ni une autre instance serverless ne remettent le compteur à zéro.
 */
// 30 par quart d'heure : la force brute est déjà bornée par le compteur d'échecs (blocage croissant après 5 codes
// faux) ; ce plafond est une seconde barrière, assez large pour un compte de démonstration partagé par un jury.
const limiteParCompte = (nom: string) => limiteDebitPartage(nom, 30, 15 * 60_000, (c) => `compte:${(c as Context<{ Variables: Variables }>).get("compte")?.id ?? "anonyme"}`);

async function profilDuCompte(compteId: string) {
  const [l] = await base().select({ id: schema.profils.id, nomAffiche: schema.profils.nomAffiche }).from(schema.comptes)
    .innerJoin(schema.profils, eq(schema.profils.id, schema.comptes.profilId)).where(eq(schema.comptes.id, compteId));
  return l ?? { id: "inconnu", nomAffiche: "inconnu" };
}

/* ================================================================== Lot B : codes à usage unique */

/** Canaux réellement disponibles (sans fournisseur en production, un canal est annoncé fermé). */
securiteComptes.get("/auth/canaux", (c) => c.json(canauxDisponibles()));

async function emettreCode(compteId: string, objet: "activation" | "recuperation" | "verification", canal: Canal, destination: string, pendante?: string) {
  // Au plus 3 codes par quart d'heure et par compte ; les codes précédents du même objet sont annulés.
  const [recents] = (await base().execute(sql`select count(*)::int n from core.codes_usage_unique where compte_id = ${compteId} and cree_le > now() - interval '15 minutes'`)) as unknown as { n: number }[];
  if ((recents?.n ?? 0) >= 3) return false;
  await base().update(schema.codesUsageUnique).set({ utiliseLe: new Date() })
    .where(and(eq(schema.codesUsageUnique.compteId, compteId), eq(schema.codesUsageUnique.objet, objet), isNull(schema.codesUsageUnique.utiliseLe)));
  const code = codeNumerique();
  await base().insert(schema.codesUsageUnique).values({
    id: `OTP-${randomUUID()}`, compteId, objet, canal, empreinte: empreinteSecret("code-unique", compteId, code),
    expireLe: new Date(Date.now() + DUREE_CODE_MS), destinationChiffree: pendante ? chiffrer(pendante, "coordonnees") : null,
  });
  const libelle = { activation: "d'activation", recuperation: "de récupération", verification: "de vérification" }[objet];
  const texte = `BEILE : votre code ${libelle} est ${code}. Valable 10 minutes. Ne le communiquez à personne, pas même à un agent de la plateforme.`;
  return envoyer({ canal, destinataire: destination, objet: `Votre code ${libelle} BEILE`, texte, secret: code, compteId }).catch(() => false);
}

/** Vérifie un code (essais comptés, usage unique) ; renvoie la ligne consommée ou lève « code invalide ». */
async function consommerCode(compteId: string, objets: ("activation" | "recuperation" | "verification")[], code: string) {
  const u = schema.codesUsageUnique;
  const [dernier] = await base().select({ id: u.id }).from(u)
    .where(and(eq(u.compteId, compteId), isNull(u.utiliseLe), gt(u.expireLe, new Date()), sql`${u.objet} in ${objets}`))
    .orderBy(desc(u.creeLe)).limit(1);
  if (!dernier) throw new ErreurCodee(422, CODE_INVALIDE, "code_invalide");
  // Essai compté AVANT la comparaison, en une seule écriture atomique : des requêtes simultanées ne lisent
  // jamais le même compteur (sinon le plafond de 5 essais ne tiendrait pas sous la concurrence).
  const [ligne] = await base().update(u).set({ tentatives: sql`${u.tentatives} + 1` })
    .where(and(eq(u.id, dernier.id), isNull(u.utiliseLe), sql`${u.tentatives} < ${ESSAIS_CODE}`)).returning();
  if (!ligne) throw new ErreurCodee(422, CODE_INVALIDE, "code_invalide");
  if (!egalConstant(ligne.empreinte, empreinteSecret("code-unique", compteId, code))) {
    if (ligne.tentatives >= ESSAIS_CODE) await base().update(u).set({ utiliseLe: new Date() }).where(eq(u.id, ligne.id));
    throw new ErreurCodee(422, CODE_INVALIDE, "code_invalide");
  }
  const [consomme] = await base().update(u).set({ utiliseLe: new Date() }).where(and(eq(u.id, ligne.id), isNull(u.utiliseLe))).returning({ id: u.id });
  if (!consomme) throw new ErreurCodee(422, CODE_INVALIDE, "code_invalide");
  return ligne;
}

/**
 * Demande d'un code d'activation (premier accès) ou de récupération (mot de passe oublié). Réponse
 * identique que le compte existe ou non. Activation : vers la coordonnée enregistrée à la création du
 * compte ; récupération : vers une coordonnée déjà VÉRIFIÉE uniquement.
 */
securiteComptes.post("/auth/code/demande", limiteDebitPartage("code-demande", 5, 15 * 60_000), async (c) => {
  controlerOrigine(c);
  const s = await corps(c, z.object({ identifiant: z.string().trim().toLowerCase().min(3).max(80), objet: z.enum(["activation", "recuperation"]), canal: z.enum(["sms", "courriel"]).optional() }).strict());
  const ouverts = canauxDisponibles();
  if (!ouverts.sms && !ouverts.courriel) throw new ErreurCodee(503, "L'envoi de codes n'est pas encore ouvert sur cette plateforme : adressez-vous à votre administrateur.", "canaux_fermes");
  // Durée de réponse constante : l'attente d'un envoi réel ne doit pas révéler qu'un compte existe.
  const debut = Date.now();
  const traiter = async () => {
    const [cpt] = await base().select().from(schema.comptes).where(eq(schema.comptes.identifiant, s.identifiant));
    if (!cpt || !cpt.actif) return;
    if (s.objet === "activation" && !cpt.doitChangerMotDePasse) return;
    const candidats: [Canal, string][] = [];
    if (cpt.telephone && (s.objet === "activation" || cpt.telephoneVerifie) && ouverts.sms) candidats.push(["sms", cpt.telephone]);
    if (cpt.courriel && (s.objet === "activation" || cpt.courrielVerifie) && ouverts.courriel) candidats.push(["courriel", cpt.courriel]);
    const choix = candidats.find(([k]) => k === s.canal) ?? candidats[0];
    if (!choix) return;
    const parti = await emettreCode(cpt.id, s.objet, choix[0], choix[1]);
    await journaliser(await profilDuCompte(cpt.id), s.objet === "activation" ? "Envoi d'un code d'activation" : "Envoi d'un code de récupération", `${cpt.identifiant} → ${masquer(choix[1])}`, "gestion", parti, parti ? null : "envoi");
  };
  await traiter().catch(() => {});
  await new Promise((r) => setTimeout(r, Math.max(0, DUREE_REPONSE_CODE_MS - (Date.now() - debut))));
  return c.json(REPONSE_GENERIQUE);
});

/** Code reçu + nouveau mot de passe : le compte est activé (ou récupéré), la coordonnée utilisée est vérifiée. */
securiteComptes.post("/auth/code/confirmer", limiteDebitPartage("code-confirmer", 20, 15 * 60_000), async (c) => {
  controlerOrigine(c);
  const s = await corps(c, z.object({ identifiant: z.string().trim().toLowerCase().min(3).max(80), code: z.string().regex(/^\d{6}$/), nouveau: z.string().min(12).max(200) }).strict());
  if (!motDePasseConforme(s.nouveau)) throw new HTTPException(422, { message: REGLE_MDP });
  const [cpt] = await base().select().from(schema.comptes).where(eq(schema.comptes.identifiant, s.identifiant));
  if (!cpt || !cpt.actif) throw new ErreurCodee(422, CODE_INVALIDE, "code_invalide");
  const ligne = await consommerCode(cpt.id, ["activation", "recuperation"], s.code);
  await base().update(schema.comptes).set({
    motDePasseHash: await hacherMotDePasse(s.nouveau), doitChangerMotDePasse: false, echecsConsecutifs: 0, verrouilleJusquA: null,
    ...(ligne.canal === "sms" ? { telephoneVerifie: true } : { courrielVerifie: true }),
  }).where(eq(schema.comptes.id, cpt.id));
  await revoquerSessionsDuCompte(cpt.id);
  await journaliser(await profilDuCompte(cpt.id), ligne.objet === "activation" ? "Activation du compte par code" : "Récupération du compte par code", cpt.identifiant, "gestion", true, null);
  return c.json({ ok: true });
});

/** Mes coordonnées de récupération (masquées). */
securiteComptes.get("/moi/coordonnees", authentifie, async (c) => {
  const [cpt] = await base().select().from(schema.comptes).where(eq(schema.comptes.id, c.get("compte").id));
  return c.json({
    telephone: cpt?.telephone ? { valeur: masquer(cpt.telephone), verifie: cpt.telephoneVerifie } : null,
    courriel: cpt?.courriel ? { valeur: masquer(cpt.courriel), verifie: cpt.courrielVerifie } : null,
    canaux: canauxDisponibles(),
  });
});

/** Nouvelle coordonnée : adoptée seulement quand le code qui y est envoyé revient (preuve de possession). */
securiteComptes.post("/moi/coordonnees/demande", authentifie, limiteDebit(5, 15 * 60_000, cleUtilisateur), async (c) => {
  // Une coordonnée de récupération ouvre le compte : la changer exige de reconfirmer son identité
  // (sinon une session volée devient une prise de contrôle durable, via « mot de passe oublié »).
  exigerElevation(c);
  const s = await corps(c, z.discriminatedUnion("canal", [
    z.object({ canal: z.literal("sms"), destination: TELEPHONE }).strict(),
    z.object({ canal: z.literal("courriel"), destination: COURRIEL }).strict(),
  ]));
  if (!canauxDisponibles()[s.canal]) throw new ErreurCodee(503, "Ce canal n'est pas encore ouvert sur la plateforme.", "canal_ferme");
  const parti = await emettreCode(c.get("compte").id, "verification", s.canal, s.destination, s.destination);
  if (!parti) throw new ErreurCodee(429, "Envoi impossible pour le moment (trop de demandes récentes ou service indisponible). Réessayez dans quelques minutes.", "envoi_impossible");
  await journaliser(c.get("profil"), "Vérification d'une coordonnée", `${s.canal} → ${masquer(s.destination)}`, "gestion", true, null);
  return c.json({ ok: true, destination: masquer(s.destination) });
});

securiteComptes.post("/moi/coordonnees/confirmer", authentifie, limiteDebit(10, 15 * 60_000, cleUtilisateur), async (c) => {
  const { code } = await corps(c, z.object({ code: z.string().regex(/^\d{6}$/) }).strict());
  const compte = c.get("compte");
  const ligne = await consommerCode(compte.id, ["verification"], code);
  const destination = ligne.destinationChiffree ? dechiffrer(ligne.destinationChiffree, "coordonnees") : null;
  if (!destination) throw new ErreurCodee(422, CODE_INVALIDE, "code_invalide");
  const [avant] = await base().select({ telephone: schema.comptes.telephone, tv: schema.comptes.telephoneVerifie, courriel: schema.comptes.courriel, cv: schema.comptes.courrielVerifie }).from(schema.comptes).where(eq(schema.comptes.id, compte.id));
  await base().update(schema.comptes).set(ligne.canal === "sms" ? { telephone: destination, telephoneVerifie: true } : { courriel: destination, courrielVerifie: true }).where(eq(schema.comptes.id, compte.id));
  // L'ancienne coordonnée vérifiée est prévenue : si ce n'est pas la personne, elle le sait aussitôt.
  const ancienne = ligne.canal === "sms" ? (avant?.tv ? avant.telephone : null) : (avant?.cv ? avant.courriel : null);
  if (ancienne && ancienne !== destination) {
    await envoyer({ canal: ligne.canal, destinataire: ancienne, compteId: compte.id, objet: "Coordonnée de votre compte BEILE modifiée",
      texte: `BEILE : la coordonnée de récupération du compte ${compte.identifiant} vient d'être remplacée. Si ce n'est pas vous, contactez sans délai l'administrateur de votre établissement.` }).catch(() => false);
  }
  await journaliser(c.get("profil"), "Coordonnée vérifiée", `${ligne.canal} → ${masquer(destination)}`, "gestion", true, null);
  return c.json({ ok: true });
});

/* ================================================================== Lot C : second facteur et élévation */

type Ctx = Context<{ Variables: Variables }>;

async function marquerSession(c: Ctx, champs: { mfaVerifie?: boolean; eleveJusquA?: Date }) {
  const empreinte = c.get("compte").empreinteSession;
  await base().update(schema.sessions).set(champs).where(eq(schema.sessions.empreinte, empreinte));
  oublierSession(empreinte);
}

/**
 * Second facteur bloqué ? Le compteur d'échecs est PROPRE au second facteur : une nouvelle connexion par
 * mot de passe ne le remet pas à zéro (sinon : connexion, 4 codes, connexion… sans fin).
 */
async function exigerSecondFacteurOuvert(c: Ctx) {
  const [cpt] = await base().select({ b: schema.comptes.mfaBloqueJusquA }).from(schema.comptes).where(eq(schema.comptes.id, c.get("compte").id));
  if (cpt?.b && cpt.b > new Date()) {
    const minutes = Math.ceil((cpt.b.getTime() - Date.now()) / 60_000);
    throw new ErreurCodee(429, `Second facteur bloqué après des échecs répétés : réessayez dans ${minutes} minute(s).`, "mfa_bloque");
  }
}

/** Échec du second facteur : tous les 5 échecs, blocage croissant (15 min, 30 min, 1 h…), sessions coupées, alerte. */
async function echecSecondFacteur(c: Ctx) {
  const compte = c.get("compte");
  const [maj] = await base().update(schema.comptes).set({ echecsMfa: sql`${schema.comptes.echecsMfa} + 1` }).where(eq(schema.comptes.id, compte.id)).returning({ n: schema.comptes.echecsMfa });
  await journaliser(c.get("profil"), "Second facteur refusé", compte.identifiant, "gestion", false, "second_facteur");
  const n = maj?.n ?? 0;
  if (n % ECHECS_MFA_MAX === 0) {
    const minutes = 15 * 2 ** Math.min(6, n / ECHECS_MFA_MAX - 1);
    await base().update(schema.comptes).set({ mfaBloqueJusquA: new Date(Date.now() + minutes * 60_000) }).where(eq(schema.comptes.id, compte.id));
    await revoquerSessionsDuCompte(compte.id);
    await surEchecsSecondFacteur(c.get("profil").id, compte.identifiant);
    throw new ErreurCodee(401, `Trop d'échecs du second facteur : session coupée, second facteur bloqué ${minutes} minutes.`, "mfa_verrouille");
  }
  throw new ErreurCodee(422, "Code incorrect", "code_invalide");
}

async function reussiteSecondFacteur(c: Ctx, elevation: boolean) {
  await base().update(schema.comptes).set({ echecsMfa: 0, mfaBloqueJusquA: null }).where(eq(schema.comptes.id, c.get("compte").id));
  await marquerSession(c, { mfaVerifie: true, ...(elevation ? { eleveJusquA: new Date(Date.now() + DUREE_ELEVATION_MS) } : {}) });
  await journaliser(c.get("profil"), elevation ? "Élévation par second facteur" : "Second facteur présenté", c.get("compte").identifiant, "gestion", true, null);
}

/** Vérifie un code TOTP (anti-rejeu : un pas déjà consommé est refusé) ou un code de secours. */
async function verifierCodeMfa(compteId: string, code: string, secoursPermis: boolean): Promise<boolean> {
  const [cpt] = await base().select().from(schema.comptes).where(eq(schema.comptes.id, compteId));
  if (!cpt) return false;
  const propre = code.replace(/[\s-]/g, "");
  // Un TOTP n'est un facteur que s'il a été CONFIRMÉ (totpDernierPas posé à la confirmation) : un secret tiré
  // puis abandonné ne doit jamais devenir une porte d'entrée.
  if (/^\d{6}$/.test(propre) && cpt.totpChiffre && cpt.mfaActive && cpt.totpDernierPas !== null) {
    const pas = verifierTotp(dechiffrer(cpt.totpChiffre, "totp"), propre);
    if (pas === null) return false;
    // Anti-rejeu atomique : deux requêtes simultanées avec le même code, une seule passe.
    const [ok] = await base().update(schema.comptes).set({ totpDernierPas: pas })
      .where(and(eq(schema.comptes.id, compteId), sql`${schema.comptes.totpDernierPas} < ${pas}`)).returning({ id: schema.comptes.id });
    return !!ok;
  }
  if (secoursPermis && /^[a-z0-9]{10}$/i.test(propre)) {
    const [ok] = await base().update(schema.codesSecours).set({ utiliseLe: new Date() })
      .where(and(eq(schema.codesSecours.compteId, compteId), eq(schema.codesSecours.empreinte, empreinteSecret("secours", compteId, propre.toLowerCase())), isNull(schema.codesSecours.utiliseLe)))
      .returning({ id: schema.codesSecours.id });
    return !!ok;
  }
  return false;
}

async function nouveauxCodesSecours(compteId: string) {
  await base().update(schema.codesSecours).set({ utiliseLe: new Date() }).where(and(eq(schema.codesSecours.compteId, compteId), isNull(schema.codesSecours.utiliseLe)));
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const codes = Array.from({ length: 10 }, () => Array.from(randomBytes(10), (b) => alphabet[b % alphabet.length]).join(""));
  await base().insert(schema.codesSecours).values(codes.map((k) => ({ id: `SCR-${randomUUID()}`, compteId, empreinte: empreinteSecret("secours", compteId, k) })));
  return codes.map((k) => `${k.slice(0, 5)}-${k.slice(5)}`);
}

/** Changer ou ajouter un facteur quand on en a déjà un : il faut l'avoir présenté pour cette session. */
function exigerFacteurPresente(c: Ctx) {
  const compte = c.get("compte");
  if (compte.mfaActive && !compte.mfaVerifie) throw new ErreurCodee(403, "Présentez d'abord votre second facteur actuel", "mfa_a_verifier");
}

securiteComptes.get("/auth/mfa/etat", authentifie, async (c) => {
  const compte = c.get("compte");
  const [cpt] = await base().select({ totp: schema.comptes.totpChiffre, actif: schema.comptes.mfaActive }).from(schema.comptes).where(eq(schema.comptes.id, compte.id));
  const cles = await base().select({ id: schema.clesFido.id, nom: schema.clesFido.nom, creeLe: schema.clesFido.creeLe, utiliseeLe: schema.clesFido.utiliseeLe }).from(schema.clesFido).where(eq(schema.clesFido.compteId, compte.id));
  const [secours] = (await base().execute(sql`select count(*)::int n from core.codes_secours where compte_id = ${compte.id} and utilise_le is null`)) as unknown as { n: number }[];
  return c.json({ exige: compte.mfaExige, actif: !!cpt?.actif, verifie: compte.mfaVerifie, totp: !!(cpt?.actif && cpt.totp), cles, codesSecoursRestants: secours?.n ?? 0, rpConfigure: !!rpId() });
});

/** Enrôlement TOTP, étape 1 : un secret est tiré et gardé chiffré, inactif tant qu'un code n'a pas été confirmé. */
securiteComptes.post("/auth/mfa/totp/debut", authentifie, limiteDebit(10, 15 * 60_000, cleUtilisateur), async (c) => {
  exigerFacteurPresente(c);
  const compte = c.get("compte");
  const secret = nouveauSecretTotp();
  // Le secret provisoire vit dans un cookie chiffré et lié au compte, JAMAIS en base avant confirmation : un
  // secret tiré puis abandonné ne peut pas devenir un facteur valide.
  setCookie(c, "beile_totp_provisoire", chiffrer(`${compte.id}|${secret}`, "totp-provisoire"), { httpOnly: true, secure: cookieSecurise(c), sameSite: "Strict", path: "/", maxAge: 600 });
  const emetteur = "BEILE";
  const uri = `otpauth://totp/${encodeURIComponent(`${emetteur}:${compte.identifiant}`)}?secret=${secret}&issuer=${emetteur}&algorithm=SHA1&digits=6&period=30`;
  return c.json({ secret, uri });
});

/** Enrôlement TOTP, étape 2 : un premier code juste active le facteur et remet dix codes de secours (affichés une fois). */
securiteComptes.post("/auth/mfa/totp/confirmer", authentifie, limiteDebit(10, 15 * 60_000, cleUtilisateur), async (c) => {
  exigerFacteurPresente(c);
  const { code } = await corps(c, z.object({ code: z.string().regex(/^\d{6}$/) }).strict());
  const compte = c.get("compte");
  let secret: string | null = null;
  const provisoire = getCookie(c, "beile_totp_provisoire");
  if (provisoire) {
    try {
      const [id, s] = dechiffrer(provisoire, "totp-provisoire").split("|");
      if (id === compte.id) secret = s ?? null;
    } catch { secret = null; }
  }
  if (!secret) throw new ErreurCodee(422, "Commencez l'enregistrement de l'application d'authentification", "totp_absent");
  const pas = verifierTotp(secret, code);
  if (pas === null) throw new ErreurCodee(422, "Code incorrect : vérifiez l'heure de votre téléphone et réessayez", "code_invalide");
  await base().update(schema.comptes).set({ totpChiffre: chiffrer(secret, "totp"), totpDernierPas: pas, mfaActive: true }).where(eq(schema.comptes.id, compte.id));
  deleteCookie(c, "beile_totp_provisoire", { path: "/" });
  // Codes de secours remis au PREMIER facteur seulement ; ensuite, leur renouvellement exige une élévation.
  const codes = compte.mfaActive ? null : await nouveauxCodesSecours(compte.id);
  await marquerSession(c, { mfaVerifie: true });
  await journaliser(c.get("profil"), "Second facteur enregistré (application)", compte.identifiant, "gestion", true, null);
  return c.json({ ok: true, codesSecours: codes });
});

/** Présenter le second facteur (code de l'application ou code de secours) après le mot de passe. */
securiteComptes.post("/auth/mfa/verifier", authentifie, limiteParCompte("mfa-verifier"), async (c) => {
  await exigerSecondFacteurOuvert(c);
  const { code } = await corps(c, z.object({ code: z.string().trim().min(6).max(12) }).strict());
  if (!(await verifierCodeMfa(c.get("compte").id, code, true))) return echecSecondFacteur(c);
  await reussiteSecondFacteur(c, false);
  return c.json({ ok: true });
});

/**
 * Comptes de DÉMONSTRATION (jury) : le code courant du second facteur est rendu au portail, qui l'affiche au-dessus
 * du formulaire. Seulement après un mot de passe juste (session ouverte), seulement pour un compte marqué
 * « démonstration » en base. Un compte réel répond 404 : rien ne distingue la route de son absence.
 */
securiteComptes.get("/auth/mfa/demonstration", authentifie, async (c) => {
  const compte = c.get("compte");
  const [cpt] = await base().select({ demo: schema.comptes.demonstration, actif: schema.comptes.mfaActive, totp: schema.comptes.totpChiffre, pas: schema.comptes.totpDernierPas })
    .from(schema.comptes).where(eq(schema.comptes.id, compte.id));
  if (!cpt?.demo || !cpt.actif || !cpt.totp || cpt.pas === null) throw new HTTPException(404, { message: "Introuvable" });
  const secret = dechiffrer(cpt.totp, "totp");
  // Un code ne sert qu'une fois : on donne le premier pas jamais consommé. Le serveur accepte ±1 pas : un pas
  // plus lointain ne devient valable qu'à la période suivante (« valableDans »).
  const maintenant = Math.floor(Date.now() / 30_000);
  const pas = Math.max(maintenant, cpt.pas + 1);
  const ecoule = Math.floor(Date.now() / 1000) % 30;
  c.header("Cache-Control", "no-store");
  return c.json({
    code: codeTotp(secret, Date.now(), pas - maintenant),
    valableDans: pas - maintenant > 1 ? 30 - ecoule : 0,
    resteSecondes: 30 * (pas - maintenant + 1) - ecoule,
  });
});

/** Nouveaux codes de secours (les anciens sont annulés) : exige une élévation. */
securiteComptes.post("/auth/mfa/codes-secours", authentifie, async (c) => {
  exigerElevation(c);
  return c.json({ codesSecours: await nouveauxCodesSecours(c.get("compte").id) });
});

/* ------------------------------------------------------------------ FIDO2 / WebAuthn */

/**
 * Domaine du portail (Relying Party) et origines admises : tirés de la CONFIGURATION du serveur
 * (BEILE_WEBAUTHN_RP_ID, sinon la première origine autorisée), jamais d'un en-tête fourni par le client.
 */
function rpId(): string | null {
  const configure = lireEnv().RP_ID;
  if (configure) return configure;
  // Première origine HTTPS déclarée (le portail public), sinon la première (développement local).
  const origines = lireEnv().ORIGINES;
  try { return new URL(origines.find((o) => o.startsWith("https://")) ?? origines[0]!).hostname; } catch { return null; }
}
function originesAttendues() {
  const rp = rpId();
  return lireEnv().ORIGINES.filter((o) => {
    try { const h = new URL(o).hostname; return h === rp || h.endsWith(`.${rp}`); } catch { return false; }
  });
}

/** Défi WebAuthn : enregistré en base (empreinte), à usage unique, lié à la session ET à l'intention. */
const empreinteDefi = (defi: string) => createHmac("sha256", cleDerivee("defi-webauthn")).update(defi).digest("hex");
async function poserDefi(c: Ctx, defi: string, intention: "enrolement" | "verification" | "elevation") {
  await base().delete(schema.defisWebauthn).where(lt(schema.defisWebauthn.expireLe, new Date())).catch(() => {});
  await base().insert(schema.defisWebauthn).values({ empreinte: empreinteDefi(defi), session: c.get("compte").empreinteSession, intention, expireLe: new Date(Date.now() + 5 * 60_000) });
}
/** Consomme le défi de la réponse (supprimé : jamais rejouable) et vérifie session et intention. */
async function consommerDefi(c: Ctx, reponse: { response?: { clientDataJSON?: string } }, intentions: string[]): Promise<{ defi: string; intention: string }> {
  let defi = "";
  try { defi = String(JSON.parse(Buffer.from(String(reponse.response?.clientDataJSON ?? ""), "base64url").toString("utf8")).challenge ?? ""); } catch { /* défi illisible */ }
  if (!defi) throw new ErreurCodee(422, "Défi invalide", "defi_invalide");
  const [d] = await base().delete(schema.defisWebauthn).where(eq(schema.defisWebauthn.empreinte, empreinteDefi(defi))).returning();
  if (!d || d.expireLe < new Date() || d.session !== c.get("compte").empreinteSession || !intentions.includes(d.intention)) throw new ErreurCodee(422, "Défi expiré ou invalide : recommencez", "defi_invalide");
  return { defi, intention: d.intention };
}

securiteComptes.post("/auth/mfa/fido/options-enrolement", authentifie, async (c) => {
  exigerFacteurPresente(c);
  const rp = rpId();
  if (!rp) throw new ErreurCodee(422, "Portail non configuré (BEILE_WEBAUTHN_RP_ID)", "rp_absent");
  const compte = c.get("compte");
  const existantes = await base().select({ id: schema.clesFido.id, transports: schema.clesFido.transports }).from(schema.clesFido).where(eq(schema.clesFido.compteId, compte.id));
  const options = await generateRegistrationOptions({
    rpName: "BEILE", rpID: rp, userName: compte.identifiant, userDisplayName: c.get("profil").nomAffiche,
    attestationType: "none", excludeCredentials: existantes.map((k) => ({ id: k.id, transports: k.transports as AuthenticatorTransportFuture[] })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });
  await poserDefi(c, options.challenge, "enrolement");
  return c.json(options);
});

securiteComptes.post("/auth/mfa/fido/enroler", authentifie, async (c) => {
  exigerFacteurPresente(c);
  const s = await corps(c, z.object({ reponse: z.record(z.string(), z.unknown()), nom: z.string().trim().min(2).max(40) }).strict());
  const { defi } = await consommerDefi(c, s.reponse as { response?: { clientDataJSON?: string } }, ["enrolement"]);
  const v = await verifyRegistrationResponse({ response: s.reponse as unknown as RegistrationResponseJSON, expectedChallenge: defi, expectedOrigin: originesAttendues(), expectedRPID: rpId()!, requireUserVerification: false })
    .catch((e: Error) => { throw new ErreurCodee(422, `Clé refusée : ${e.message}`, "fido_refuse"); });
  if (!v.verified || !v.registrationInfo) throw new ErreurCodee(422, "Clé refusée", "fido_refuse");
  const { credential } = v.registrationInfo;
  const compte = c.get("compte");
  await base().insert(schema.clesFido).values({ id: credential.id, compteId: compte.id, clePublique: Buffer.from(credential.publicKey).toString("base64url"), compteur: credential.counter, transports: credential.transports ?? [], nom: s.nom });
  const premier = !compte.mfaActive;
  await base().update(schema.comptes).set({ mfaActive: true }).where(eq(schema.comptes.id, compte.id));
  const codes = premier ? await nouveauxCodesSecours(compte.id) : null;
  await marquerSession(c, { mfaVerifie: true });
  await journaliser(c.get("profil"), "Second facteur enregistré (clé de sécurité)", `${compte.identifiant} · ${s.nom}`, "gestion", true, null);
  return c.json({ ok: true, codesSecours: codes });
});

securiteComptes.post("/auth/mfa/fido/options-verification", authentifie, async (c) => {
  const elevation = z.object({ elevation: z.boolean().optional() }).catch({}).parse(await c.req.json().catch(() => ({}))).elevation === true;
  const rp = rpId();
  if (!rp) throw new ErreurCodee(422, "Portail non configuré (BEILE_WEBAUTHN_RP_ID)", "rp_absent");
  const cles = await base().select({ id: schema.clesFido.id, transports: schema.clesFido.transports }).from(schema.clesFido).where(eq(schema.clesFido.compteId, c.get("compte").id));
  if (!cles.length) throw new ErreurCodee(422, "Aucune clé de sécurité enregistrée", "fido_absent");
  const options = await generateAuthenticationOptions({ rpID: rp, allowCredentials: cles.map((k) => ({ id: k.id, transports: k.transports as AuthenticatorTransportFuture[] })), userVerification: "preferred" });
  await poserDefi(c, options.challenge, elevation ? "elevation" : "verification");
  return c.json(options);
});

/**
 * Présentation d'une clé FIDO2 : second facteur de la session, ou élévation. L'intention est celle du DÉFI
 * (fixée côté serveur à sa création), pas un drapeau de la requête : une assertion capturée ne se rejoue pas
 * en élévation.
 */
securiteComptes.post("/auth/mfa/fido/verifier", authentifie, limiteParCompte("mfa-fido"), async (c) => {
  await exigerSecondFacteurOuvert(c);
  const s = await corps(c, z.object({ reponse: z.record(z.string(), z.unknown()), elevation: z.boolean().optional() }).strict());
  const { defi, intention } = await consommerDefi(c, s.reponse as { response?: { clientDataJSON?: string } }, ["verification", "elevation"]);
  const reponse = s.reponse as unknown as AuthenticationResponseJSON;
  const [cle] = await base().select().from(schema.clesFido).where(and(eq(schema.clesFido.id, String(reponse.id ?? "")), eq(schema.clesFido.compteId, c.get("compte").id)));
  if (!cle) return echecSecondFacteur(c);
  const v = await verifyAuthenticationResponse({
    response: reponse, expectedChallenge: defi, expectedOrigin: originesAttendues(), expectedRPID: rpId()!, requireUserVerification: false,
    credential: { id: cle.id, publicKey: Buffer.from(cle.clePublique, "base64url"), counter: cle.compteur, transports: cle.transports as AuthenticatorTransportFuture[] },
  }).catch(() => null);
  if (!v?.verified) return echecSecondFacteur(c);
  await base().update(schema.clesFido).set({ compteur: v.authenticationInfo.newCounter, utiliseeLe: new Date() }).where(eq(schema.clesFido.id, cle.id));
  await reussiteSecondFacteur(c, intention === "elevation");
  return c.json({ ok: true });
});

/** Retirer une clé : exige une élévation, et jamais le dernier facteur d'un compte qui en exige un. */
securiteComptes.post("/auth/mfa/cles/:id/retirer", authentifie, async (c) => {
  exigerElevation(c);
  const compte = c.get("compte");
  const id = z.string().min(8).max(512).parse(c.req.param("id"));
  const [cpt] = await base().select({ totp: schema.comptes.totpChiffre }).from(schema.comptes).where(eq(schema.comptes.id, compte.id));
  const cles = await base().select({ id: schema.clesFido.id }).from(schema.clesFido).where(eq(schema.clesFido.compteId, compte.id));
  if (!cles.some((k) => k.id === id)) throw new HTTPException(404, { message: "Clé introuvable" });
  if (compte.mfaExige && cles.length === 1 && !cpt?.totp) throw new ErreurCodee(422, "C'est votre seul second facteur : enregistrez-en un autre avant de la retirer", "dernier_facteur");
  await base().execute(sql`delete from core.cles_fido where id = ${id} and compte_id = ${compte.id}`);
  await journaliser(c.get("profil"), "Clé de sécurité retirée", compte.identifiant, "gestion", true, null);
  return c.json({ ok: true });
});

/* ------------------------------------------------------------------ Élévation juste à temps */

/**
 * Élévation de 15 minutes avant une action d'administration. Administrateur soumis au second facteur :
 * code de l'application (pas de code de secours), ou clé FIDO2 via /auth/mfa/fido/verifier. Autres
 * administrateurs délégués : mot de passe.
 */
securiteComptes.post("/auth/elevation", authentifie, limiteParCompte("elevation"), async (c) => {
  const s = await corps(c, z.object({ motDePasse: z.string().min(1).max(200).optional(), code: z.string().regex(/^\d{6}$/).optional() }).strict());
  const compte = c.get("compte");
  if (compte.mfaExige || compte.mfaActive) {
    await exigerSecondFacteurOuvert(c);
    if (!s.code) throw new ErreurCodee(422, "Code de votre application d'authentification requis (ou clé de sécurité)", "code_requis");
    if (!(await verifierCodeMfa(compte.id, s.code, false))) return echecSecondFacteur(c);
    await reussiteSecondFacteur(c, true);
  } else {
    const [cpt] = await base().select({ h: schema.comptes.motDePasseHash }).from(schema.comptes).where(eq(schema.comptes.id, compte.id));
    if (!s.motDePasse || !cpt || !(await verifierMotDePasse(s.motDePasse, cpt.h))) {
      // Même compteur que la connexion : une session volée ne sert pas à deviner le mot de passe sans verrou.
      const [maj] = await base().update(schema.comptes).set({ echecsConsecutifs: sql`${schema.comptes.echecsConsecutifs} + 1` }).where(eq(schema.comptes.id, compte.id)).returning({ n: schema.comptes.echecsConsecutifs });
      await journaliser(c.get("profil"), "Élévation refusée", compte.identifiant, "gestion", false, "mot_de_passe");
      if ((maj?.n ?? 0) >= 5) {
        await base().update(schema.comptes).set({ verrouilleJusquA: new Date(Date.now() + 15 * 60_000) }).where(eq(schema.comptes.id, compte.id));
        await revoquerSessionsDuCompte(compte.id);
        throw new ErreurCodee(401, "Trop d'échecs : session coupée, compte verrouillé 15 minutes.", "verrouille");
      }
      throw new ErreurCodee(422, "Mot de passe incorrect", "mot_de_passe_invalide");
    }
    await base().update(schema.comptes).set({ echecsConsecutifs: 0 }).where(eq(schema.comptes.id, compte.id));
    await marquerSession(c, { eleveJusquA: new Date(Date.now() + DUREE_ELEVATION_MS) });
    await journaliser(c.get("profil"), "Élévation par mot de passe", compte.identifiant, "gestion", true, null);
  }
  return c.json({ ok: true, jusquA: new Date(Date.now() + DUREE_ELEVATION_MS).toISOString() });
});

/** Réinitialiser le second facteur d'un compte (perte du téléphone et des codes) : administrateur de la plateforme, élévation. */
securiteComptes.post("/admin/comptes/:id/reinitialiser-mfa", authentifie, async (c) => {
  if (!c.get("profil").habilitations.some((h) => h.role === "administrateur")) refuser("Réservé à l'administrateur de la plateforme");
  exigerElevation(c);
  const id = z.string().regex(/^CPT-[a-z0-9-]+$/).parse(c.req.param("id"));
  if (id === c.get("compte").id) refuser("Nul ne réinitialise son propre second facteur");
  const { motif } = await corps(c, z.object({ motif: z.string().trim().min(5).max(200) }).strict());
  const [maj] = await base().update(schema.comptes).set({ mfaActive: false, totpChiffre: null, totpDernierPas: null, echecsMfa: 0, mfaBloqueJusquA: null }).where(eq(schema.comptes.id, id)).returning({ id: schema.comptes.id });
  if (!maj) throw new HTTPException(404, { message: "Compte introuvable" });
  await base().execute(sql`delete from core.cles_fido where compte_id = ${id}`);
  await base().update(schema.codesSecours).set({ utiliseLe: new Date() }).where(and(eq(schema.codesSecours.compteId, id), isNull(schema.codesSecours.utiliseLe)));
  await revoquerSessionsDuCompte(id);
  await journaliser(c.get("profil"), "Réinitialisation du second facteur", `${id} · ${motif}`, "gestion", true, null);
  await signaler("reinitialisation_mfa", "haute", c.get("profil").id, id, `${c.get("profil").nomAffiche} a réinitialisé le second facteur du compte ${id} (${motif}).`);
  return c.json({ ok: true });
});

