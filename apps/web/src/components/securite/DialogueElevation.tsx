"use client";

import { Fingerprint, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Modale } from "@/components/ui/Modale";
import { Button } from "@/components/ui/primitives";
import { presenterCle, useEtatMfa } from "@/lib/api/securite";
import { ErreurApi, enregistrerElevation, requete } from "@/lib/http";
import { CLE_SESSION, useSessionServeur } from "@/lib/session";

/**
 * Élévation juste à temps : avant une action d'administration, l'API demande une confirmation d'identité
 * récente. Cette boîte s'ouvre d'elle-même, puis la requête interrompue est rejouée. Administrateur soumis au
 * second facteur : code de l'application ou clé de sécurité ; autres administrateurs délégués : mot de passe.
 */
export function DialogueElevation() {
  const { data: session } = useSessionServeur();
  const client = useQueryClient();
  const [ouvert, setOuvert] = useState(false);
  const resoudre = useRef<((ok: boolean) => void) | null>(null);
  const [valeur, setValeur] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const mfa = !!session?.compte.mfaExige;
  const etat = useEtatMfa(ouvert && mfa);
  const avecCle = mfa && ouvert && (etat.data?.cles.length ?? 0) > 0;

  useEffect(() => {
    enregistrerElevation(() => new Promise<boolean>((r) => { resoudre.current = r; setValeur(""); setErreur(null); setOuvert(true); }));
    return () => enregistrerElevation(null);
  }, []);

  const finir = (ok: boolean) => {
    setOuvert(false); setEnvoi(false);
    if (ok) void client.invalidateQueries({ queryKey: CLE_SESSION });
    resoudre.current?.(ok); resoudre.current = null;
  };

  const confirmer = async () => {
    setEnvoi(true); setErreur(null);
    try {
      await requete("POST", "/auth/elevation", mfa ? { code: valeur } : { motDePasse: valeur }, { sansElevation: true });
      finir(true);
    } catch (x) {
      setErreur(x instanceof ErreurApi && x.statut === 422 ? (mfa ? "Code incorrect." : "Mot de passe incorrect.") : (x as Error).message);
      setEnvoi(false);
    }
  };

  const parCle = async () => {
    setEnvoi(true); setErreur(null);
    try { await presenterCle(true); finir(true); } catch (x) { setErreur(x instanceof ErreurApi ? x.message : "Clé non reconnue ou opération annulée."); setEnvoi(false); }
  };

  return (
    <Modale ouvert={ouvert} onFermer={() => finir(false)} titre="Confirmez votre identité" sousTitre="Action d'administration : valable 15 minutes" icone={ShieldCheck}
      pied={<><Button variante="secondaire" onClick={() => finir(false)}>Annuler</Button><Button chargement={envoi} disabled={mfa ? !/^\d{6}$/.test(valeur) : !valeur} onClick={confirmer}>Confirmer</Button></>}>
      <form method="post" onSubmit={(e) => { e.preventDefault(); void confirmer(); }} className="space-y-3">
        <label className="block text-[13px] font-medium text-ink">
          {mfa ? "Code de votre application d'authentification" : "Votre mot de passe"}
          <input autoFocus type={mfa ? "text" : "password"} inputMode={mfa ? "numeric" : undefined} autoComplete={mfa ? "one-time-code" : "current-password"} value={valeur}
            onChange={(e) => setValeur(mfa ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value)}
            className="mt-1.5 h-11 w-full rounded-lg border border-line bg-bg px-3 text-[15px] tracking-wide outline-none focus:border-blue focus:ring-4 focus:ring-blue/15" />
        </label>
        {avecCle && <Button type="button" variante="secondaire" icone={Fingerprint} className="w-full" onClick={parCle} disabled={envoi}>Utiliser ma clé de sécurité</Button>}
        {erreur && <p role="alert" className="rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">{erreur}</p>}
      </form>
    </Modale>
  );
}
