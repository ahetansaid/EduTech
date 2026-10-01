import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { lireEnv } from "./env";

/**
 * Secrets dérivés d'une clef maîtresse unique (la clef du sceau, obligatoire en production) par HKDF, un
 * usage par clef : un code à usage unique, un secret TOTP ou un code de secours ne partagent jamais la
 * même clef. Hors production, sans clef du sceau, la chaîne de connexion tient lieu de clef maîtresse.
 */
const maitre = () => lireEnv().CLE_SEAU ?? lireEnv().DATABASE_URL_API;
const cles = new Map<string, Buffer>();
export function cleDerivee(usage: string): Buffer {
  let k = cles.get(usage);
  if (!k) { k = Buffer.from(hkdfSync("sha256", maitre(), "beile", usage, 32)); cles.set(usage, k); }
  return k;
}

/** Empreinte HMAC d'un secret court lié à un compte (code SMS, code de secours) : inutilisable sans la clef. */
export const empreinteSecret = (usage: string, compteId: string, secret: string) =>
  createHmac("sha256", cleDerivee(usage)).update(`${compteId}|${secret}`).digest("hex");

export function egalConstant(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const codeNumerique = (chiffres = 6) => String(randomInt(0, 10 ** chiffres)).padStart(chiffres, "0");

/** Chiffrement authentifié (AES-256-GCM) : « v1.iv.tag.chiffré » en base64url. */
export function chiffrer(clair: string, usage = "chiffrement"): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", cleDerivee(usage), iv);
  const chiffre = Buffer.concat([c.update(clair, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), chiffre.toString("base64url")].join(".");
}

export function dechiffrer(paquet: string, usage = "chiffrement"): string {
  const [v, iv, tag, chiffre] = paquet.split(".");
  if (v !== "v1" || !iv || !tag || !chiffre) throw new Error("Paquet chiffré illisible");
  const d = createDecipheriv("aes-256-gcm", cleDerivee(usage), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(chiffre, "base64url")), d.final()]).toString("utf8");
}

/** Masquage pour l'affichage et les traces : +229 01 •• •• •• 47, a•••@domaine.bj. */
export function masquer(destination: string): string {
  if (destination.includes("@")) {
    const [local, domaine] = destination.split("@");
    return `${local!.slice(0, 1)}•••@${domaine}`;
  }
  const chiffres = destination.replace(/\D/g, "");
  return `${chiffres.slice(0, chiffres.length - 8)}••••••${chiffres.slice(-2)}`;
}
