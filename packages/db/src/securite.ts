import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from "node:crypto";
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
export const nouveauJeton = () => randomBytes(32).toString("base64url");
