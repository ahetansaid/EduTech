import { genererCoucheNationale, type CouchesNationales } from "./macro";
import { genererMicroMonde, type MicroMonde } from "./micro";

/**
 * Socle de démonstration, généré une seule fois et de façon déterministe.
 * Seules les actions faites pendant la démonstration sont conservées dans le navigateur.
 */
let couches: CouchesNationales | null = null;
let monde: MicroMonde | null = null;

export function getCouches(): CouchesNationales {
  if (!couches) {
    couches = genererCoucheNationale();
    // Les établissements pilotes rejoignent le référentiel national.
    const m = getMonde();
    for (const e of m.etablissements) {
      couches.etablissements.push(e);
      couches.etablissementsParCommune.get(e.communeId)?.push(e);
    }
  }
  return couches;
}

export function getMonde(): MicroMonde {
  if (!monde) monde = genererMicroMonde();
  return monde;
}
