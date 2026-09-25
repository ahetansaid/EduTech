"use client";

import type { Profil, Role } from "@beile/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useContext, type ReactNode } from "react";
import { ecrire, requete } from "./http";

/**
 * Session de l'utilisateur connecté, lue sur le serveur (GET /auth/session).
 * Rien n'est conservé dans le navigateur : la vérité est le cookie HttpOnly et la table des sessions.
 */
export interface Session {
  profil: Profil;
  compte: { identifiant: string; doitChangerMotDePasse: boolean };
}

const Contexte = createContext<Session | null>(null);

export const CLE_SESSION = ["session"] as const;

export function useSessionServeur() {
  return useQuery({
    queryKey: CLE_SESSION,
    // /auth/etat répond toujours 200 (session ou null) : aucune erreur 401 dans la console des pages publiques.
    queryFn: () => requete<{ session: Session | null }>("GET", "/auth/etat").then((r) => r.session),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function FournisseurSession({ session, children }: { session: Session; children: ReactNode }) {
  return <Contexte.Provider value={session}>{children}</Contexte.Provider>;
}

/** Session courante — uniquement sous une enveloppe authentifiée (AppShell, EspacePersonnel). */
export function useSession(): Session {
  const s = useContext(Contexte);
  if (!s) throw new Error("useSession hors d'un espace authentifié");
  return s;
}

export const useProfil = () => useSession().profil;

export function useRoles(): Role[] {
  return useProfil().habilitations.map((h) => h.role);
}

/** Périmètre d'établissement du chef d'établissement connecté. */
export function useEtablissementCourant(): string | null {
  const h = useProfil().habilitations.find((x) => x.role === "chef_etablissement" && x.perimetre.niveau === "etablissement");
  return h && h.perimetre.niveau === "etablissement" ? h.perimetre.etablissementId : null;
}

export function useDeconnexion() {
  const client = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: () => ecrire("/auth/deconnexion"),
    onSettled: () => {
      client.clear();
      router.replace("/connexion?motif=deconnexion");
    },
  });
}

/** Page d'accueil d'un utilisateur selon ses habilitations (la première qui s'applique). */
export function accueilPour(roles: Role[]): string {
  const ordre: [Role, string][] = [
    ["administrateur", "/administration"],
    ["administration_centrale", "/cockpit"],
    ["direction_departementale", "/territoire"],
    ["inspecteur", "/territoire"],
    ["chef_etablissement", "/etablissement"],
    ["enseignant", "/enseignant"],
    ["parent", "/famille"],
    ["apprenant", "/apprenant"],
    ["chercheur", "/ask"],
    ["dpo", "/audit"],
  ];
  return ordre.find(([r]) => roles.includes(r))?.[1] ?? "/";
}
