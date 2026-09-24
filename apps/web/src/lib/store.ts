"use client";

import type { Apprenant, Certificat, EntreeAudit, Evenement, Finalite, LienFamilial, NouvelEvenement, PersonneRegistre, Profil } from "@beile/contracts";
import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { decider, type Demande } from "@beile/simulation/abac";
import { DATE_SIMULEE } from "@beile/simulation/micro";
import { getMonde } from "@beile/simulation/monde";

/**
 * État de la démonstration. Seules les actions réalisées pendant la session sont conservées
 * (dans le navigateur, uniquement des données fictives) ; le socle est régénéré à l'identique.
 */

export interface Notification {
  id: string;
  destinataireNpi: string;
  titre: string;
  texte: string;
  horodatage: string;
  lue: boolean;
}

interface EtatDemo {
  profilId: string;
  evenementsLive: Evenement[];
  apprenantsLive: Apprenant[];
  liensLive: LienFamilial[];
  registreLive: PersonneRegistre[];
  certificatsLive: Certificat[];
  audit: EntreeAudit[];
  notifications: Notification[];
  enLigne: boolean;
  fileAttente: Evenement[];
  hydrate: boolean;

  changerProfil: (id: string) => void;
  enregistrer: (evts: NouvelEvenement[]) => Evenement[];
  synchroniser: () => number;
  basculerConnexion: () => void;
  journaliser: (e: Omit<EntreeAudit, "id" | "horodatage" | "profilId" | "profilNom">) => void;
  notifier: (n: Omit<Notification, "id" | "horodatage" | "lue">) => void;
  marquerLues: (npi: string) => void;
  ajouterApprenant: (a: Apprenant, liens: LienFamilial[], personne: PersonneRegistre | null) => void;
  ajouterCertificat: (c: Certificat) => void;
  reinitialiser: () => void;
}

let seq = 0;

/** Notifications dérivées des faits : un événement enregistré une fois est restitué aux familles concernées. */
function notificationsPour(evts: Evenement[], liensLive: LienFamilial[], apprenantsLive: Apprenant[]): Omit<Notification, "id" | "lue">[] {
  const monde = getMonde();
  const liens = [...monde.liens, ...liensLive];
  const apprenants = [...monde.apprenants, ...apprenantsLive];
  const res: Omit<Notification, "id" | "lue">[] = [];
  for (const e of evts) {
    if (e.type !== "ABSENCE" && e.type !== "INSCRIPTION" && e.type !== "EVALUATION") continue;
    const a = apprenants.find((x) => x.id === e.apprenantId);
    if (!a) continue;
    const classe = "classeId" in e ? monde.classes.find((c) => c.id === e.classeId) : undefined;
    const titre = e.type === "ABSENCE" ? `Absence de ${a.prenoms}` : e.type === "INSCRIPTION" ? `Inscription de ${a.prenoms} confirmée` : `Nouvelle note pour ${a.prenoms}`;
    const texte = e.type === "ABSENCE"
      ? `${a.prenoms} a été noté(e) absent(e) aujourd'hui${classe ? ` en ${classe.libelle}` : ""}. Vous pouvez justifier l'absence depuis votre espace.`
      : e.type === "INSCRIPTION" ? `${a.prenoms} est inscrit(e)${classe ? ` en ${classe.libelle}` : ""} pour l'année ${"anneeScolaire" in e ? e.anneeScolaire : ""}.`
      : `${e.matiere} : ${e.note}/20.`;
    for (const l of liens.filter((x) => x.apprenantId === a.id && x.verifie)) res.push({ destinataireNpi: l.responsableNpi, titre, texte, horodatage: e.enregistreLe });
  }
  return res;
}
const id = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** Horloge de démonstration : la date simulée, avec l'heure réelle de la présentation. */
export function maintenant() {
  const heure = new Date().toISOString().slice(11);
  return `${DATE_SIMULEE.slice(0, 10)}T${heure}`;
}

const initial = {
  profilId: "p-central",
  evenementsLive: [] as Evenement[],
  apprenantsLive: [] as Apprenant[],
  liensLive: [] as LienFamilial[],
  registreLive: [] as PersonneRegistre[],
  certificatsLive: [] as Certificat[],
  audit: [] as EntreeAudit[],
  notifications: [] as Notification[],
  enLigne: true,
  fileAttente: [] as Evenement[],
};

export const useDemo = create<EtatDemo>()(
  persist(
    (set, get) => ({
      ...initial,
      hydrate: false,

      changerProfil: (profilId) => set({ profilId }),

      enregistrer: (evts) => {
        const complets = evts.map((e) => ({ ...e, id: id("EVT"), enregistreLe: maintenant() }) as Evenement);
        if (get().enLigne) {
          const notifs = notificationsPour(complets, get().liensLive, get().apprenantsLive).map((n) => ({ ...n, id: id("NOT"), lue: false }));
          set((s) => ({ evenementsLive: [...s.evenementsLive, ...complets], notifications: [...notifs, ...s.notifications].slice(0, 300) }));
        }
        else set((s) => ({ fileAttente: [...s.fileAttente, ...complets] }));
        return complets;
      },

      synchroniser: () => {
        const n = get().fileAttente.length;
        // Les événements gardent leur date de survenance ; seule la date d'enregistrement change.
        const synchronises = get().fileAttente.map((e) => ({ ...e, enregistreLe: maintenant() }));
        const notifs = notificationsPour(synchronises, get().liensLive, get().apprenantsLive).map((n) => ({ ...n, id: id("NOT"), lue: false }));
        set((s) => ({
          evenementsLive: [...s.evenementsLive, ...synchronises],
          notifications: [...notifs, ...s.notifications].slice(0, 300),
          fileAttente: [],
          enLigne: true,
        }));
        return n;
      },

      basculerConnexion: () => {
        if (!get().enLigne) get().synchroniser();
        else set({ enLigne: false });
      },

      journaliser: (e) => {
        const profil = getMonde().profils.find((p) => p.id === get().profilId);
        set((s) => ({
          audit: [{ ...e, id: id("AUD"), horodatage: maintenant(), profilId: s.profilId, profilNom: profil?.nomAffiche ?? s.profilId }, ...s.audit].slice(0, 500),
        }));
      },

      notifier: (n) => set((s) => ({ notifications: [{ ...n, id: id("NOT"), horodatage: maintenant(), lue: false }, ...s.notifications].slice(0, 200) })),

      marquerLues: (npi) => set((s) => ({ notifications: s.notifications.map((n) => (n.destinataireNpi === npi ? { ...n, lue: true } : n)) })),

      ajouterApprenant: (a, liens, personne) =>
        set((s) => ({
          apprenantsLive: [...s.apprenantsLive, a],
          liensLive: [...s.liensLive, ...liens],
          registreLive: personne ? [...s.registreLive, personne] : s.registreLive,
        })),

      ajouterCertificat: (c) => set((s) => ({ certificatsLive: [...s.certificatsLive, c] })),

      reinitialiser: () => set({ ...initial }),
    }),
    {
      name: "beile-demo-v1",
      // Réhydratation explicite côté client (AppShell) : pas d'écart entre rendu serveur et client.
      skipHydration: true,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ hydrate: _h, ...reste }) => {
        void _h;
        return Object.fromEntries(Object.entries(reste).filter(([, v]) => typeof v !== "function"));
      },
      onRehydrateStorage: () => () => useDemo.setState({ hydrate: true }),
    },
  ),
);

/** Monde courant = socle généré + actions de la session. */
export function useMonde() {
  const evenementsLive = useDemo((s) => s.evenementsLive);
  const apprenantsLive = useDemo((s) => s.apprenantsLive);
  const liensLive = useDemo((s) => s.liensLive);
  const registreLive = useDemo((s) => s.registreLive);
  const certificatsLive = useDemo((s) => s.certificatsLive);
  return useMemo(() => {
    const base = getMonde();
    return {
      ...base,
      evenements: [...base.evenements, ...evenementsLive],
      apprenants: [...base.apprenants, ...apprenantsLive],
      liens: [...base.liens, ...liensLive],
      registre: [...base.registre, ...registreLive],
      certificats: [...base.certificats, ...certificatsLive],
    };
  }, [evenementsLive, apprenantsLive, liensLive, registreLive, certificatsLive]);
}

export function useProfil(): Profil {
  const profilId = useDemo((s) => s.profilId);
  return getMonde().profils.find((p) => p.id === profilId) ?? getMonde().profils[0]!;
}

/** Décision d'accès journalisée : aucune lecture de donnée individuelle ne la contourne. */
export function useAcces() {
  const monde = useMonde();
  const profil = useProfil();
  const journaliser = useDemo((s) => s.journaliser);
  return useMemo(
    () => ({
      evaluer: (demande: Demande) => decider(profil, demande, { monde, evenements: monde.evenements }),
      demander: (demande: Demande, action: string, ressource: string) => {
        const d = decider(profil, demande, { monde, evenements: monde.evenements });
        journaliser({ action, ressource, finalite: demande.finalite, autorise: d.autorise, critereManquant: d.criteres.find((c) => !c.satisfait)?.critere ?? null });
        return d;
      },
    }),
    [monde, profil, journaliser],
  );
}

/** Réhydrate l'état de démonstration côté client (après le premier rendu, sans écart serveur/client). */
export function useHydratation() {
  const hydrate = useDemo((s) => s.hydrate);
  useEffect(() => { if (!useDemo.getState().hydrate) void useDemo.persist.rehydrate(); }, []);
  return hydrate;
}

export type { Finalite };
