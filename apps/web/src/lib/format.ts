/** Formats français : 2 295 038 · 16,2 % · 24/09/2026. */
const nf = new Intl.NumberFormat("fr-FR");
export const nombre = (v: number | null | undefined, decimales = 0) =>
  v == null ? "—" : new Intl.NumberFormat("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(v);
export const entier = (v: number | null | undefined) => (v == null ? "—" : nf.format(Math.round(v)));
export const pourcent = (v: number | null | undefined, decimales = 1) => (v == null ? "—" : `${nombre(v, decimales)} %`);
export const note = (v: number | null | undefined) => (v == null ? "—" : `${nombre(v, 2)}/20`);
export const date = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
export const dateLongue = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
export const heure = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
export const compact = (v: number) => (v >= 1_000_000 ? `${nombre(v / 1_000_000, 2)} M` : v >= 10_000 ? `${nombre(v / 1000, 0)} k` : nf.format(v));

/**
 * Classe d'âge (années révolues) au lieu de la date de naissance exacte : un export de masse quitte la
 * plateforme et ne doit pas porter un quasi-identifiant. La date exacte reste visible dans le dossier individuel.
 */
export function bandeAge(naissanceIso: string, referenceIso: string = new Date().toISOString()): string {
  const n = new Date(naissanceIso), r = new Date(referenceIso);
  if (Number.isNaN(n.getTime())) return "—";
  let a = r.getUTCFullYear() - n.getUTCFullYear();
  if (r.getUTCMonth() < n.getUTCMonth() || (r.getUTCMonth() === n.getUTCMonth() && r.getUTCDate() < n.getUTCDate())) a--;
  if (!Number.isFinite(a)) return "—";
  return a < 6 ? "moins de 6 ans" : a <= 9 ? "6 – 9 ans" : a <= 12 ? "10 – 12 ans" : a <= 15 ? "13 – 15 ans" : a <= 18 ? "16 – 18 ans" : "19 ans et plus";
}
