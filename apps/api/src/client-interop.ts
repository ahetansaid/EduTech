import { randomUUID } from "node:crypto";
import { BASE } from "./client-recette";
import { signer } from "./interop";

/**
 * Client d'un système partenaire : signe le corps exact de la requête (HMAC-SHA256 du secret partagé),
 * avec horodatage et identifiant de lot — exactement ce qu'un SI raccordé (EducMaster, eRESULTATS,
 * université, DBAU) enverrait via la plateforme nationale d'interopérabilité.
 */
export const secretDe = (partenaire: string) => {
  const paire = (process.env.BEILE_PARTENAIRES ?? "").split(",").map((x) => x.trim()).find((x) => x.startsWith(`${partenaire}:`));
  if (!paire) throw new Error(`Secret du partenaire « ${partenaire} » absent de BEILE_PARTENAIRES`);
  return paire.slice(partenaire.length + 1);
};

export async function envoyer(partenaire: string, chemin: string, corps: unknown, options: { lot?: string; horodatage?: number; secret?: string } = {}) {
  const texte = JSON.stringify(corps);
  const horodatage = options.horodatage ?? Date.now();
  const lot = options.lot ?? `LOT-${randomUUID().slice(0, 23)}`;
  const r = await fetch(`${BASE}${chemin}`, {
    method: "POST",
    headers: {
      "content-type": "application/json", "x-beile-partenaire": partenaire, "x-beile-horodatage": String(horodatage),
      "x-beile-lot": lot, "x-beile-signature": signer(options.secret ?? secretDe(partenaire), horodatage, lot, texte),
    },
    body: texte,
  });
  const t = await r.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(t); } catch { /* texte brut */ }
  return { statut: r.status, json, lot };
}
