import { z } from "zod";
import { Examen } from "./evenements";

/** CERTIFICATE-ID : preuve vérifiable par un tiers, sans compte ni démarche (§7.2). */
export const Certificat = z.object({
  id: z.string(),
  apprenantId: z.string(),
  examen: Examen,
  session: z.string(),
  mention: z.string(),
  moyenne: z.number(),
  delivreLe: z.string(),
  /** Empreinte des champs signés : toute altération du document est détectée. */
  empreinte: z.string(),
  revoque: z.boolean(),
});
export type Certificat = z.infer<typeof Certificat>;

export const ResultatVerification = z.discriminatedUnion("statut", [
  z.object({
    statut: z.literal("authentique"),
    certificatId: z.string(),
    titulaire: z.string(),
    examen: Examen,
    session: z.string(),
    mention: z.string(),
    delivreLe: z.string(),
  }),
  z.object({ statut: z.literal("altere"), certificatId: z.string(), explication: z.string() }),
  z.object({ statut: z.literal("revoque"), certificatId: z.string(), explication: z.string() }),
  z.object({ statut: z.literal("introuvable"), explication: z.string() }),
]);
export type ResultatVerification = z.infer<typeof ResultatVerification>;
