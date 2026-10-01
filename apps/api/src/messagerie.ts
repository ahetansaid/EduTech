import { randomUUID } from "node:crypto";
import { schema } from "@beile/db";
import { createTransport, type Transporter } from "nodemailer";
import { base } from "./commun";
import { masquer } from "./cryptographie";
import { lireEnv } from "./env";

/**
 * Envoi des messages de sécurité (codes d'activation et de récupération), par SMS ou courriel.
 *
 * - SMS : passerelle HTTP de l'opérateur national configurée par BEILE_SMS_URL / BEILE_SMS_CLE.
 * - Courriel : SMTP du domaine de la plateforme (BEILE_SMTP_URL, expéditeur du même domaine).
 * - Sans fournisseur : « journal ». Hors production, le message est conservé en clair dans
 *   core.messages_sortants (recette, démonstration). En production, le canal est déclaré indisponible :
 *   on ne prétend pas avoir envoyé un code qui n'est parti nulle part.
 *
 * Chaque envoi est tracé ; avec un vrai fournisseur, le code est masqué dans la trace.
 */
export type Canal = "sms" | "courriel";

export function canauxDisponibles(): Record<Canal, boolean> {
  const e = lireEnv();
  return { sms: !!e.SMS || !e.PRODUCTION, courriel: !!e.SMTP || !e.PRODUCTION };
}

let transport: Transporter | null = null;

export async function envoyer(m: { canal: Canal; destinataire: string; objet: string; texte: string; secret?: string; compteId?: string }): Promise<boolean> {
  const e = lireEnv();
  const reel = m.canal === "sms" ? e.SMS : e.SMTP;
  if (!reel && e.PRODUCTION) throw new Error(`Canal ${m.canal} non configuré en production`);
  let statut: "envoye" | "echec" = "envoye", erreur: string | null = null;
  try {
    if (m.canal === "sms" && e.SMS) {
      const r = await fetch(e.SMS.url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${e.SMS.cle}` },
        body: JSON.stringify({ to: m.destinataire, from: e.SMS.expediteur, text: m.texte }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) throw new Error(`Passerelle SMS : HTTP ${r.status}`);
    } else if (m.canal === "courriel" && e.SMTP) {
      transport ??= createTransport(e.SMTP.url);
      await transport.sendMail({ from: e.SMTP.expediteur, to: m.destinataire, subject: m.objet, text: m.texte });
    }
  } catch (err) {
    statut = "echec";
    erreur = (err as Error).message.slice(0, 200);
  }
  // Trace : en clair seulement pour le fournisseur « journal » hors production ; sinon code masqué.
  const texteTrace = reel && m.secret ? m.texte.replaceAll(m.secret, "••••••") : m.texte;
  await base().insert(schema.messagesSortants).values({
    id: `MSG-${randomUUID()}`, compteId: m.compteId ?? null, canal: m.canal, destinataire: reel ? masquer(m.destinataire) : m.destinataire,
    objet: m.objet, texte: texteTrace, fournisseur: reel ? (m.canal === "sms" ? "passerelle-sms" : "smtp") : "journal", statut, erreur,
  });
  return statut === "envoye";
}
