import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash, createHmac } from "node:crypto";
import { promisify } from "node:util";

/**
 * Hachage des mots de passe : scrypt (N = 2^15, r = 8, p = 1), sel aléatoire de 16 octets.
 * Format stocké : scrypt$N$r$p$sel$empreinte (base64url). Comparaison en temps constant.
 */
const scrypt = promisify(scryptCb) as (mdp: string, sel: Buffer, lg: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const N = 2 ** 15, R = 8, P = 1, LONGUEUR = 64, MAXMEM = 64 * 1024 * 1024;

export async function hacherMotDePasse(motDePasse: string): Promise<string> {
  const sel = randomBytes(16);
  const cle = await scrypt(motDePasse.normalize("NFKC"), sel, LONGUEUR, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${sel.toString("base64url")}$${cle.toString("base64url")}`;
}

export async function verifierMotDePasse(motDePasse: string, stocke: string): Promise<boolean> {
  const [algo, n, r, p, sel, empreinte] = stocke.split("$");
  if (algo !== "scrypt" || !sel || !empreinte) return false;
  const attendu = Buffer.from(empreinte, "base64url");
  const cle = await scrypt(motDePasse.normalize("NFKC"), Buffer.from(sel, "base64url"), attendu.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM });
  return cle.length === attendu.length && timingSafeEqual(cle, attendu);
}

/** Politique : 12 caractères minimum, au moins une minuscule, une majuscule, un chiffre. */
export function motDePasseConforme(m: string) {
  return m.length >= 12 && /[a-z]/.test(m) && /[A-Z]/.test(m) && /\d/.test(m);
}

/** Mot de passe initial lisible et robuste (≈ 90 bits) : groupes séparés par des tirets. */
export function genererMotDePasse() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const groupe = () => Array.from(randomBytes(5), (b) => alphabet[b % alphabet.length]).join("");
  let m = "";
  do m = `${groupe()}-${groupe()}-${groupe()}`; while (!motDePasseConforme(m));
  return m;
}

export const empreinteJeton = (jeton: string) => createHash("sha256").update(jeton).digest("hex");

/**
 * Empreinte d'un contenu d'acte : la signature du document, non d'un jeton. Les champs sont ordonnés
 * une fois pour toutes côté émission et côté vérification — sinon deux services honnêtes produiraient
 * deux empreintes d'un même document.
 *
 * Avec une `cle`, le sceau est un MAC : quiconque écrit dans la ligne sans la clef ne peut pas le
 * recalculer, donc retarde une date ou change un type d'acte en base se voit. Sans clef, le hash reste
 * un condensé d'intégrité — utile contre une corruption, inutile contre une falsification : les champs
 * scellés sont publics, et celui qui peut écrire dans la rangée peut refaire le hash.
 */
export const empreinteContenu = (champs: readonly (string | number | null | undefined)[], cle?: string) =>
  (cle ? createHmac("sha256", cle) : createHash("sha256")).update(champs.map((x) => x ?? "").join("|")).digest("hex");

export const nouveauJeton = () => randomBytes(32).toString("base64url");

/* ------------------------------------------------------------------ TOTP (RFC 6238), sans dépendance */

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32(octets: Buffer): string {
  let bits = 0, valeur = 0, sortie = "";
  for (const o of octets) {
    valeur = (valeur << 8) | o; bits += 8;
    while (bits >= 5) { sortie += BASE32[(valeur >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) sortie += BASE32[(valeur << (5 - bits)) & 31];
  return sortie;
}
export function depuisBase32(texte: string): Buffer {
  const propre = texte.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, valeur = 0;
  const octets: number[] = [];
  for (const ch of propre) {
    valeur = (valeur << 5) | BASE32.indexOf(ch); bits += 5;
    if (bits >= 8) { octets.push((valeur >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(octets);
}

/** Secret TOTP : 20 octets aléatoires (160 bits), en base32 pour les applications d'authentification. */
export const nouveauSecretTotp = () => base32(randomBytes(20));

/** Code TOTP à 6 chiffres, pas de 30 s, HMAC-SHA1 (compatible avec toutes les applications courantes). */
export function codeTotp(secret: string, instant = Date.now(), decalage = 0): string {
  const compteur = Math.floor(instant / 30_000) + decalage;
  const tampon = Buffer.alloc(8);
  tampon.writeBigUInt64BE(BigInt(compteur));
  const h = createHmac("sha1", depuisBase32(secret)).update(tampon).digest();
  const d = h[h.length - 1]! & 15;
  const n = ((h[d]! & 0x7f) << 24) | (h[d + 1]! << 16) | (h[d + 2]! << 8) | h[d + 3]!;
  return String(n % 1_000_000).padStart(6, "0");
}

/** Vérification tolérant une dérive d'horloge d'un pas (±30 s) ; renvoie le pas accepté (anti-rejeu) ou null. */
export function verifierTotp(secret: string, code: string, instant = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  for (const d of [0, -1, 1]) {
    const attendu = Buffer.from(codeTotp(secret, instant, d)), recu = Buffer.from(code);
    if (timingSafeEqual(attendu, recu)) return Math.floor(instant / 30_000) + d;
  }
  return null;
}
