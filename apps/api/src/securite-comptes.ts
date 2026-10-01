import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { schema } from "@beile/db";
import { hacherMotDePasse, motDePasseConforme, nouveauSecretTotp, verifierMotDePasse, verifierTotp } from "@beile/db/securite";
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type AuthenticatorTransportFuture, type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  authentifie, base, cleUtilisateur, controlerOrigine, corps, ErreurCodee, exigerElevation, journaliser, limiteDebit, limiteDebitPartage, oublierSession, refuser, type Variables,
} from "./commun";
import { chiffrer, codeNumerique, dechiffrer, egalConstant, empreinteSecret, masquer } from "./cryptographie";
import { lireEnv } from "./env";
import { canauxDisponibles, envoyer, type Canal } from "./messagerie";
import { surEchecsSecondFacteur } from "./vigie";

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
const REGLE_MDP = "12 caractères minimum, avec au moins une minuscule, une majuscule et un chiffre";

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
  const [ligne] = await base().select().from(schema.codesUsageUnique)
    .where(and(eq(schema.codesUsageUnique.compteId, compteId), isNull(schema.codesUsageUnique.utiliseLe), gt(schema.codesUsageUnique.expireLe, new Date()), sql`${schema.codesUsageUnique.objet} in ${objets}`))
    .orderBy(desc(schema.codesUsageUnique.creeLe)).limit(1);
  if (!ligne || ligne.tentatives >= ESSAIS_CODE) throw new ErreurCodee(422, CODE_INVALIDE, "code_invalide");
  if (!egalConstant(ligne.empreinte, empreinteSecret("code-unique", compteId, code))) {
    await base().update(schema.codesUsageUnique).set({ tentatives: ligne.tentatives + 1, ...(ligne.tentatives + 1 >= ESSAIS_CODE ? { utiliseLe: new Date() } : {}) }).where(eq(schema.codesUsageUnique.id, ligne.id));
    throw new ErreurCodee(422, CODE_INVALIDE, "code_invalide");
  }
  await base().update(schema.codesUsageUnique).set({ utiliseLe: new Date() }).where(eq(schema.codesUsageUnique.id, ligne.id));
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
  const [cpt] = await base().select().from(schema.comptes).where(eq(schema.comptes.identifiant, s.identifiant));
  if (!cpt || !cpt.actif) return c.json(REPONSE_GENERIQUE);
  if (s.objet === "activation" && !cpt.doitChangerMotDePasse) return c.json(REPONSE_GENERIQUE);
  const candidats: [Canal, string][] = [];
  if (cpt.telephone && (s.objet === "activation" || cpt.telephoneVerifie) && ouverts.sms) candidats.push(["sms", cpt.telephone]);
  if (cpt.courriel && (s.objet === "activation" || cpt.courrielVerifie) && ouverts.courriel) candidats.push(["courriel", cpt.courriel]);
  const choix = candidats.find(([k]) => k === s.canal) ?? candidats[0];
  if (!choix) return c.json(REPONSE_GENERIQUE);
  const parti = await emettreCode(cpt.id, s.objet, choix[0], choix[1]);
  await journaliser(await profilDuCompte(cpt.id), s.objet === "activation" ? "Envoi d'un code d'activation" : "Envoi d'un code de récupération", `${cpt.identifiant} → ${masquer(choix[1])}`, "gestion", parti, parti ? null : "envoi");
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
  await base().update(schema.sessions).set({ revoquee: true }).where(eq(schema.sessions.compteId, cpt.id));
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
  await base().update(schema.comptes).set(ligne.canal === "sms" ? { telephone: destination, telephoneVerifie: true } : { courriel: destination, courrielVerifie: true }).where(eq(schema.comptes.id, compte.id));
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

/** Échec du second facteur : compté sur le compte ; au 5e, la session est coupée et une alerte levée. */
async function echecSecondFacteur(c: Ctx) {
  const compte = c.get("compte");
  const [maj] = await base().update(schema.comptes).set({ echecsConsecutifs: sql`${schema.comptes.echecsConsecutifs} + 1` }).where(eq(schema.comptes.id, compte.id)).returning({ n: schema.comptes.echecsConsecutifs });
  await journaliser(c.get("profil"), "Second facteur refusé", compte.identifiant, "gestion", false, "second_facteur");
  if ((maj?.n ?? 0) >= ECHECS_MFA_MAX) {
    await base().update(schema.comptes).set({ verrouilleJusquA: new Date(Date.now() + 15 * 60_000) }).where(eq(schema.comptes.id, compte.id));
    await base().update(schema.sessions).set({ revoquee: true }).where(eq(schema.sessions.compteId, compte.id));
    oublierSession(compte.empreinteSession);
    await surEchecsSecondFacteur(c.get("profil").id, compte.identifiant);
    throw new ErreurCodee(401, "Trop d'échecs du second facteur : session coupée, compte verrouillé 15 minutes.", "mfa_verrouille");
  }
  throw new ErreurCodee(422, "Code incorrect", "code_invalide");
}

async function reussiteSecondFacteur(c: Ctx, elevation: boolean) {
  await base().update(schema.comptes).set({ echecsConsecutifs: 0 }).where(eq(schema.comptes.id, c.get("compte").id));
  await marquerSession(c, { mfaVerifie: true, ...(elevation ? { eleveJusquA: new Date(Date.now() + DUREE_ELEVATION_MS) } : {}) });
  await journaliser(c.get("profil"), elevation ? "Élévation par second facteur" : "Second facteur présenté", c.get("compte").identifiant, "gestion", true, null);
}

/** Vérifie un code TOTP (anti-rejeu : un pas déjà consommé est refusé) ou un code de secours. */
async function verifierCodeMfa(compteId: string, code: string, secoursPermis: boolean): Promise<boolean> {
  const [cpt] = await base().select().from(schema.comptes).where(eq(schema.comptes.id, compteId));
  if (!cpt) return false;
  const propre = code.replace(/[\s-]/g, "");
  if (/^\d{6}$/.test(propre) && cpt.totpChiffre && cpt.mfaActive) {
    const pas = verifierTotp(dechiffrer(cpt.totpChiffre, "totp"), propre);
    if (pas === null || (cpt.totpDernierPas !== null && pas <= cpt.totpDernierPas)) return false;
    await base().update(schema.comptes).set({ totpDernierPas: pas }).where(eq(schema.comptes.id, compteId));
    return true;
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
  return c.json({ exige: compte.mfaExige, actif: !!cpt?.actif, verifie: compte.mfaVerifie, totp: !!(cpt?.actif && cpt.totp), cles, codesSecoursRestants: secours?.n ?? 0, rpConfigure: !!rpId(c) });
});

/** Enrôlement TOTP, étape 1 : un secret est tiré et gardé chiffré, inactif tant qu'un code n'a pas été confirmé. */
securiteComptes.post("/auth/mfa/totp/debut", authentifie, limiteDebit(10, 15 * 60_000, cleUtilisateur), async (c) => {
  exigerFacteurPresente(c);
  const compte = c.get("compte");
  const secret = nouveauSecretTotp();
  await base().update(schema.comptes).set(compte.mfaActive ? {} : { totpChiffre: chiffrer(secret, "totp") }).where(eq(schema.comptes.id, compte.id));
  // Compte déjà protégé (ajout d'un TOTP à une clé FIDO2) : le secret provisoire vit dans un cookie chiffré, jamais en base avant confirmation.
  if (compte.mfaActive) setCookie(c, "beile_totp_provisoire", chiffrer(`${compte.id}|${secret}`, "totp-provisoire"), { httpOnly: true, secure: c.req.url.startsWith("https://") || c.req.header("x-forwarded-proto") === "https", sameSite: "Strict", path: "/", maxAge: 600 });
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
    const [id, s] = dechiffrer(provisoire, "totp-provisoire").split("|");
    if (id === compte.id) secret = s ?? null;
  } else {
    const [cpt] = await base().select({ t: schema.comptes.totpChiffre }).from(schema.comptes).where(eq(schema.comptes.id, compte.id));
    secret = cpt?.t ? dechiffrer(cpt.t, "totp") : null;
  }
  if (!secret) throw new ErreurCodee(422, "Commencez l'enregistrement de l'application d'authentification", "totp_absent");
  const pas = verifierTotp(secret, code);
  if (pas === null) throw new ErreurCodee(422, "Code incorrect : vérifiez l'heure de votre téléphone et réessayez", "code_invalide");
  await base().update(schema.comptes).set({ totpChiffre: chiffrer(secret, "totp"), totpDernierPas: pas, mfaActive: true }).where(eq(schema.comptes.id, compte.id));
  deleteCookie(c, "beile_totp_provisoire", { path: "/" });
  const codes = await nouveauxCodesSecours(compte.id);
  await marquerSession(c, { mfaVerifie: true });
  await journaliser(c.get("profil"), "Second facteur enregistré (application)", compte.identifiant, "gestion", true, null);
  return c.json({ ok: true, codesSecours: codes });
});

/** Présenter le second facteur (code de l'application ou code de secours) après le mot de passe. */
securiteComptes.post("/auth/mfa/verifier", authentifie, limiteDebit(20, 15 * 60_000, cleUtilisateur), async (c) => {
  const { code } = await corps(c, z.object({ code: z.string().trim().min(6).max(12) }).strict());
  if (!(await verifierCodeMfa(c.get("compte").id, code, true))) return echecSecondFacteur(c);
  await reussiteSecondFacteur(c, false);
  return c.json({ ok: true });
});

/** Nouveaux codes de secours (les anciens sont annulés) : exige une élévation. */
securiteComptes.post("/auth/mfa/codes-secours", authentifie, async (c) => {
  exigerElevation(c);
  return c.json({ codesSecours: await nouveauxCodesSecours(c.get("compte").id) });
});

/* ------------------------------------------------------------------ FIDO2 / WebAuthn */

/** Domaine du portail (Relying Party) : configuré, sinon celui de l'origine de la requête (le portail web). */
function rpId(c: Ctx): string | null {
  const configure = lireEnv().RP_ID;
  if (configure) return configure;
  const origine = c.req.header("origin");
  return origine ? new URL(origine).hostname : null;
}
function originesAttendues(c: Ctx) {
  const origine = c.req.header("origin");
  return [...new Set([...lireEnv().ORIGINES, ...(origine ? [origine] : [])])].filter((o) => {
    try { return new URL(o).hostname === rpId(c) || new URL(o).hostname.endsWith(`.${rpId(c)}`); } catch { return false; }
  });
}

/** Défi WebAuthn lié à la session, porté par un cookie signé (aucun état serveur entre deux instances). */
function poserDefi(c: Ctx, defi: string) {
  const exp = Date.now() + 5 * 60_000;
  const sig = createHmac("sha256", Buffer.from(lireEnv().CLE_SEAU ?? lireEnv().DATABASE_URL_API)).update(`${defi}|${exp}|${c.get("compte").empreinteSession}`).digest("base64url");
  setCookie(c, "beile_defi", `${defi}.${exp}.${sig}`, { httpOnly: true, secure: c.req.url.startsWith("https://") || c.req.header("x-forwarded-proto") === "https", sameSite: "Strict", path: "/", maxAge: 300 });
}
function lireDefi(c: Ctx): string {
  const [defi, exp, sig] = (getCookie(c, "beile_defi") ?? "").split(".");
  deleteCookie(c, "beile_defi", { path: "/" });
  if (!defi || !exp || !sig || Number(exp) < Date.now()) throw new ErreurCodee(422, "Défi expiré : recommencez", "defi_expire");
  const attendu = createHmac("sha256", Buffer.from(lireEnv().CLE_SEAU ?? lireEnv().DATABASE_URL_API)).update(`${defi}|${exp}|${c.get("compte").empreinteSession}`).digest("base64url");
  if (!egalConstant(sig, attendu)) throw new ErreurCodee(422, "Défi invalide", "defi_invalide");
  return defi;
}

securiteComptes.post("/auth/mfa/fido/options-enrolement", authentifie, async (c) => {
  exigerFacteurPresente(c);
  const rp = rpId(c);
  if (!rp) throw new ErreurCodee(422, "Portail non identifié (origine absente)", "rp_absent");
  const compte = c.get("compte");
  const existantes = await base().select({ id: schema.clesFido.id, transports: schema.clesFido.transports }).from(schema.clesFido).where(eq(schema.clesFido.compteId, compte.id));
  const options = await generateRegistrationOptions({
    rpName: "BEILE", rpID: rp, userName: compte.identifiant, userDisplayName: c.get("profil").nomAffiche,
    attestationType: "none", excludeCredentials: existantes.map((k) => ({ id: k.id, transports: k.transports as AuthenticatorTransportFuture[] })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });
  poserDefi(c, options.challenge);
  return c.json(options);
});

securiteComptes.post("/auth/mfa/fido/enroler", authentifie, async (c) => {
  exigerFacteurPresente(c);
  const s = await corps(c, z.object({ reponse: z.record(z.string(), z.unknown()), nom: z.string().trim().min(2).max(40) }).strict());
  const defi = lireDefi(c);
  const v = await verifyRegistrationResponse({ response: s.reponse as unknown as RegistrationResponseJSON, expectedChallenge: defi, expectedOrigin: originesAttendues(c), expectedRPID: rpId(c)!, requireUserVerification: false })
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
  const rp = rpId(c);
  if (!rp) throw new ErreurCodee(422, "Portail non identifié (origine absente)", "rp_absent");
  const cles = await base().select({ id: schema.clesFido.id, transports: schema.clesFido.transports }).from(schema.clesFido).where(eq(schema.clesFido.compteId, c.get("compte").id));
  if (!cles.length) throw new ErreurCodee(422, "Aucune clé de sécurité enregistrée", "fido_absent");
  const options = await generateAuthenticationOptions({ rpID: rp, allowCredentials: cles.map((k) => ({ id: k.id, transports: k.transports as AuthenticatorTransportFuture[] })), userVerification: "preferred" });
  poserDefi(c, options.challenge);
  return c.json(options);
});

/** Présentation d'une clé FIDO2 : second facteur de la session, ou élévation (« elevation: true »). */
securiteComptes.post("/auth/mfa/fido/verifier", authentifie, limiteDebit(20, 15 * 60_000, cleUtilisateur), async (c) => {
  const s = await corps(c, z.object({ reponse: z.record(z.string(), z.unknown()), elevation: z.boolean().optional() }).strict());
  const defi = lireDefi(c);
  const reponse = s.reponse as unknown as AuthenticationResponseJSON;
  const [cle] = await base().select().from(schema.clesFido).where(and(eq(schema.clesFido.id, String(reponse.id ?? "")), eq(schema.clesFido.compteId, c.get("compte").id)));
  if (!cle) return echecSecondFacteur(c);
  const v = await verifyAuthenticationResponse({
    response: reponse, expectedChallenge: defi, expectedOrigin: originesAttendues(c), expectedRPID: rpId(c)!, requireUserVerification: false,
    credential: { id: cle.id, publicKey: Buffer.from(cle.clePublique, "base64url"), counter: cle.compteur, transports: cle.transports as AuthenticatorTransportFuture[] },
  }).catch(() => null);
  if (!v?.verified) return echecSecondFacteur(c);
  await base().update(schema.clesFido).set({ compteur: v.authenticationInfo.newCounter, utiliseeLe: new Date() }).where(eq(schema.clesFido.id, cle.id));
  await reussiteSecondFacteur(c, !!s.elevation);
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
securiteComptes.post("/auth/elevation", authentifie, limiteDebit(10, 15 * 60_000, cleUtilisateur), async (c) => {
  const s = await corps(c, z.object({ motDePasse: z.string().min(1).max(200).optional(), code: z.string().regex(/^\d{6}$/).optional() }).strict());
  const compte = c.get("compte");
  if (compte.mfaExige) {
    if (!s.code) throw new ErreurCodee(422, "Code de votre application d'authentification requis (ou clé de sécurité)", "code_requis");
    if (!(await verifierCodeMfa(compte.id, s.code, false))) return echecSecondFacteur(c);
    await reussiteSecondFacteur(c, true);
  } else {
    const [cpt] = await base().select({ h: schema.comptes.motDePasseHash }).from(schema.comptes).where(eq(schema.comptes.id, compte.id));
    if (!s.motDePasse || !cpt || !(await verifierMotDePasse(s.motDePasse, cpt.h))) {
      await journaliser(c.get("profil"), "Élévation refusée", compte.identifiant, "gestion", false, "mot_de_passe");
      throw new ErreurCodee(422, "Mot de passe incorrect", "mot_de_passe_invalide");
    }
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
  const [maj] = await base().update(schema.comptes).set({ mfaActive: false, totpChiffre: null, totpDernierPas: null }).where(eq(schema.comptes.id, id)).returning({ id: schema.comptes.id });
  if (!maj) throw new HTTPException(404, { message: "Compte introuvable" });
  await base().execute(sql`delete from core.cles_fido where compte_id = ${id}`);
  await base().update(schema.codesSecours).set({ utiliseLe: new Date() }).where(and(eq(schema.codesSecours.compteId, id), isNull(schema.codesSecours.utiliseLe)));
  await base().update(schema.sessions).set({ revoquee: true }).where(eq(schema.sessions.compteId, id));
  await journaliser(c.get("profil"), "Réinitialisation du second facteur", `${id} · ${motif}`, "gestion", true, null);
  return c.json({ ok: true });
});

