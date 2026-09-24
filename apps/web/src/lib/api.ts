"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Client de l'API BEILE. Si NEXT_PUBLIC_BEILE_API n'est pas défini, l'application reste en mode
 * simulation (aucun appel réseau). Les jetons de session vivent uniquement en mémoire (jamais dans
 * le stockage du navigateur) et sont renouvelés à l'expiration.
 */
const API = process.env.NEXT_PUBLIC_BEILE_API?.replace(/\/$/, "");
export const apiActive = !!API;

const jetons = new Map<string, { jeton: string; expire: number }>();

async function jetonPour(profilId: string) {
  const j = jetons.get(profilId);
  if (j && j.expire * 1000 - Date.now() > 60_000) return j.jeton;
  const r = await fetch(`${API}/auth/demo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profilId }) });
  if (!r.ok) throw new Error(`Authentification impossible (${r.status})`);
  const d = (await r.json()) as { jeton: string; expire: number };
  jetons.set(profilId, d);
  return d.jeton;
}

export interface ReponseApi<T> { statut: number; donnees: T }

export async function appelApi<T>(profilId: string, methode: "GET" | "POST", chemin: string, corps?: unknown): Promise<ReponseApi<T>> {
  if (!API) throw new Error("API non configurée");
  const envoyer = async () => fetch(`${API}${chemin}`, {
    method: methode,
    headers: { "content-type": "application/json", authorization: `Bearer ${await jetonPour(profilId)}` },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  let r = await envoyer();
  if (r.status === 401) { jetons.delete(profilId); r = await envoyer(); }
  const donnees = (await r.json().catch(() => null)) as T;
  return { statut: r.status, donnees };
}

/** Lecture depuis l'API ; `null` tant que rien n'est chargé ou si l'API est inactive. */
export function useLectureApi<T>(profilId: string, chemin: string | null) {
  const [etat, setEtat] = useState<{ donnees: T | null; erreur: string | null; chargement: boolean }>({ donnees: null, erreur: null, chargement: apiActive && !!chemin });
  const [version, setVersion] = useState(0);
  const recharger = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    if (!apiActive || !chemin) return;
    let actif = true;
    appelApi<T>(profilId, "GET", chemin)
      .then((r) => { if (actif) setEtat({ donnees: r.statut < 300 ? r.donnees : null, erreur: r.statut < 300 ? null : `Refus ${r.statut}`, chargement: false }); })
      .catch((e: Error) => { if (actif) setEtat({ donnees: null, erreur: e.message, chargement: false }); });
    return () => { actif = false; };
  }, [profilId, chemin, version]);
  return { ...etat, recharger };
}
