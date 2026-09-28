import { timingSafeEqual } from "node:crypto";
import { empreinteContenu } from "@beile/db/securite";
import { champsSignesCertificat, certificatDuSuperieur, empreinteCertificat, type CertificatBrut } from "@beile/simulation/micro";
import { lireEnv } from "./env";

/**
 * Sceau d'un certificat : la liste des champs signés est unique, partagée par l'émission et par le
 * service public — deux services qui trieraient leurs champs autrement produiraient deux sceaux d'un
 * même diplôme, et tout document honnête passerait pour une falsification.
 *
 * Le K-12 garde son condensé historique : un diplôme déjà imprimé et déjà remis garde un QR vérifiable.
 * Un certificat du supérieur est scellé à clef (`BEILE_CLE_SEAU`), donc en MAC : celui qui peut écrire
 * dans la rangée ne peut pas recalculer le sceau, et déplacer une licence d'une filière à l'autre en
 * base se voit à la vérification. Sans clef provisionnée, le sceau retombe sur un condensé d'intégrité —
 * utile contre une corruption, inutile contre une falsification : la clef se provisionne avant la
 * première certification du supérieur.
 */
export const sceauCertificat = (c: CertificatBrut, titulaire: string) =>
  (certificatDuSuperieur(c)
    ? empreinteContenu(champsSignesCertificat(c, titulaire), lireEnv().CLE_SEAU)
    : empreinteCertificat(c, titulaire));

/**
 * Sceaux qu'un certificat INTÈGRE peut porter : un par clef acceptée (rotation), ou le condensé
 * historique pour un diplôme du K-12 émis avant la certification par office. Sert à juger la LIGNE :
 * si son sceau stocké n'est aucun d'eux, un champ signé a été modifié en base après l'émission.
 */
export const sceauxAdmis = (c: CertificatBrut, titulaire: string): string[] => {
  if (!certificatDuSuperieur(c)) return [empreinteCertificat(c, titulaire)];
  const cles = lireEnv().CLES_VERIFICATION;
  return cles.length ? cles.map((k) => empreinteContenu(champsSignesCertificat(c, titulaire), k)) : [empreinteContenu(champsSignesCertificat(c, titulaire))];
};

/**
 * Longueur minimale de l'empreinte présentée pour qu'elle débloque une identité. Le service est public et
 * sans compte : un préfixe d'un ou deux caractères se devine à l'usure (un seizième, puis un deux-cent
 * cinquante-sixième…), et la fin de l'identifiant reprend le numéro d'apprenant. Le QR d'une attestation
 * porte 32 caractères ; 16 en demandent six cents fois plus de tentatives qu'il n'en faut pour lire un
 * nom.
 */
export const LONGUEUR_EMPREINTE_MINIMALE = 16;

/** Une empreinte de QR, nettoyée — ou rien du tout si elle est trop courte pour prouver quoi que ce soit. */
export const empreintePresentee = (brut: string | undefined) => {
  const e = (brut ?? "").toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 64);
  return e.length >= LONGUEUR_EMPREINTE_MINIMALE ? e : "";
};

/**
 * Le préfixe présenté ouvre-t-il le dossier ? Comparaison en temps constant, comme le jeton CSRF et le
 * mot de passe : sous `BEILE_CLE_SEAU`, le sceau est un MAC et `startsWith` s'arrête au premier octet
 * différent — une comparaison qui se lit octet par octet se laisserait mesurer. Le service est public,
 * sans compte et à haut débit : c'est exactement là que le canal se referme.
 */
export const sceauCorrespond = (sceau: string, presente: string) => {
  const a = Buffer.from(sceau.slice(0, presente.length), "utf8");
  const b = Buffer.from(presente, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
};
