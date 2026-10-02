"use client";

import { startAuthentication, startRegistration, type PublicKeyCredentialCreationOptionsJSON, type PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { useQuery } from "@tanstack/react-query";
import { ecrire, lire, requete } from "@/lib/http";

/** Sécurité des comptes : second facteur, coordonnées de récupération, alertes de la vigie. */

export interface EtatMfa {
  exige: boolean; actif: boolean; verifie: boolean; totp: boolean;
  cles: { id: string; nom: string; creeLe: string; utiliseeLe: string | null }[];
  codesSecoursRestants: number; rpConfigure: boolean;
}
export interface Coordonnee { valeur: string; verifie: boolean }
export interface Coordonnees { telephone: Coordonnee | null; courriel: Coordonnee | null; canaux: { sms: boolean; courriel: boolean } }
export interface AlerteSecurite {
  id: string; type: string; gravite: "info" | "moyenne" | "haute"; profilId: string | null; detail: string;
  creeLe: string; traiteeLe: string | null; traiteePar: string | null; suite: string | null;
}

export const CLES_SECURITE = { mfa: ["securite", "mfa"], coordonnees: ["securite", "coordonnees"], canaux: ["securite", "canaux"], alertes: ["securite", "alertes"] } as const;

export const useEtatMfa = (actif = true) => useQuery({ queryKey: CLES_SECURITE.mfa, queryFn: ({ signal }) => lire<EtatMfa>("/auth/mfa/etat", signal), enabled: actif });
export const useCoordonnees = () => useQuery({ queryKey: CLES_SECURITE.coordonnees, queryFn: ({ signal }) => lire<Coordonnees>("/moi/coordonnees", signal) });
export const useCanaux = () => useQuery({ queryKey: CLES_SECURITE.canaux, queryFn: ({ signal }) => lire<{ sms: boolean; courriel: boolean }>("/auth/canaux", signal), staleTime: 10 * 60_000 });
export const useAlertesSecurite = (statut: "ouvertes" | "toutes") => useQuery({
  queryKey: [...CLES_SECURITE.alertes, statut], queryFn: ({ signal }) => lire<AlerteSecurite[]>(`/securite/alertes?statut=${statut}`, signal), refetchInterval: 60_000,
});

/** Enregistre une clé de sécurité FIDO2 (clé USB/NFC, empreinte, Windows Hello…). */
export async function enregistrerCle(nom: string) {
  const options = await ecrire<PublicKeyCredentialCreationOptionsJSON>("/auth/mfa/fido/options-enrolement");
  const reponse = await startRegistration({ optionsJSON: options });
  return ecrire<{ ok: true; codesSecours: string[] | null }>("/auth/mfa/fido/enroler", { reponse, nom });
}

/** Présente une clé de sécurité : second facteur de la session, ou élévation juste à temps. */
export async function presenterCle(elevation = false) {
  // L'intention (second facteur ou élévation) est fixée dans le défi, côté serveur, dès sa création.
  const options = await ecrire<PublicKeyCredentialRequestOptionsJSON>("/auth/mfa/fido/options-verification", { elevation });
  const reponse = await startAuthentication({ optionsJSON: options });
  return requete<{ ok: true }>("POST", "/auth/mfa/fido/verifier", { reponse, elevation }, { sansElevation: true });
}

export const LIBELLE_ALERTE: Record<string, string> = {
  refus_en_rafale: "Refus d'accès en rafale",
  verrouillage: "Compte verrouillé",
  nouvel_appareil_administrateur: "Administrateur : nouvelle adresse",
  activite_hors_horaires: "Connexion d'administrateur hors horaires",
  creation_en_serie: "Créations de comptes en série",
  second_facteur_echoue: "Échecs répétés du second facteur",
};
