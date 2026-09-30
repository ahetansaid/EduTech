import { CalendarX2, ClipboardCheck, Fingerprint, GraduationCap, Inbox, TrendingDown, Users, type LucideIcon } from "lucide-react";
import type { Ton } from "@/components/ui/primitives";
import { jourCourant, type Demande, type DemandeATraiter, type Justificatifs, type Tableau } from "@/lib/api/etablissement";
import { CIRCUIT_LIBELLE, LIBELLE_ROLE_CIRCUIT, libelleEtape } from "@/lib/circuits";

/**
 * Tâches du jour, dérivées des sources qu'un rôle a le droit de lire (tableau d'établissement,
 * justificatifs, demandes en circuit, file de validation) et triées par urgence réelle. Partagé par le
 * poste de pilotage et par les tableaux de bord : une même règle, un même ordre, partout.
 */

const fmtDateCourte = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const dateCourte = (iso: string) => fmtDateCourte.format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso));

/** Rôles porteurs d'une étape de circuit à traiter (le droit réel est vérifié par l'API). */
export const ROLES_FILE = ["inspecteur", "direction_departementale", "administration_centrale"] as const;

/** Degré d'urgence : 0 = bloquant / échéance atteinte, 1 = attendu à court terme, 2 = simple signal. */
export type Urgence = 0 | 1 | 2;

export interface Tache {
  cle: string;
  libelle: string;
  detail: string;
  icone: LucideIcon;
  ton: Ton;
  urgence: Urgence;
  href: string | null;
  action: string;
  /** Échéance au format court, si la tâche en porte une. */
  echeance?: string;
  /** Horodatage de l'échéance pour le tri ; MAX_SAFE_INTEGER quand il n'y en a pas. */
  ts: number;
}

const JOUR = 86_400_000;
export const AUJOURDHUI_TS = new Date(`${jourCourant()}T12:00:00Z`).getTime();

/** Classe une échéance en urgence + libellé humain (« en retard de 3 j », « aujourd'hui », « dans 5 j »). */
export function analyserEcheance(echeance: string | null): { urgence: Urgence; ton: Ton; libelle: string; ts: number } {
  if (!echeance) return { urgence: 2, ton: "info", libelle: "", ts: Number.MAX_SAFE_INTEGER };
  const ts = new Date(echeance.length === 10 ? `${echeance}T12:00:00Z` : echeance).getTime();
  const jours = Math.round((ts - AUJOURDHUI_TS) / JOUR);
  if (jours < 0) return { urgence: 0, ton: "critique", libelle: `En retard de ${Math.abs(jours)} j`, ts };
  if (jours === 0) return { urgence: 0, ton: "critique", libelle: "Échéance aujourd'hui", ts };
  if (jours <= 7) return { urgence: 1, ton: "avertissement", libelle: `Dans ${jours} j`, ts };
  return { urgence: 2, ton: "info", libelle: `Le ${dateCourte(echeance)}`, ts };
}

/* ------------------------------------------------------------------ Sources : chef d'établissement */

export function tachesEtablissement(t: Tableau | undefined, justif: Justificatifs | undefined, demandes: Demande[] | undefined): Tache[] {
  const out: Tache[] = [];
  if (t) {
    const a = t.alertes;
    for (const s of a.surcharges) {
      out.push({ cle: `surcharge-${s.classe}`, libelle: `${s.classe} au-delà de sa capacité`, detail: `${s.effectif} élèves pour ${s.capacite} places — une place à libérer ou à créer`, icone: Users, ton: "critique", urgence: 0, href: "/etablissement", action: "Examiner", ts: 0 });
    }
    if (a.baisse.length) {
      out.push({ cle: "baisse", libelle: `${a.baisse.length} élève${a.baisse.length > 1 ? "s" : ""} en baisse en mathématiques`, detail: "Trois évaluations consécutives en recul — un accompagnement à proposer", icone: TrendingDown, ton: "avertissement", urgence: 1, href: "/etablissement/eleves?filtre=baisse", action: "Traiter", ts: JOUR });
    }
    if (a.regularisations.length) {
      out.push({ cle: "identite", libelle: `${a.regularisations.length} identité${a.regularisations.length > 1 ? "s" : ""} à régulariser`, detail: "Inscription maintenue, démarche d'identification engagée", icone: Fingerprint, ton: "info", urgence: 2, href: "/etablissement/eleves?filtre=identite", action: "Suivre", ts: 2 * JOUR });
    }
    if (a.enseignantsSansFormation) {
      out.push({ cle: "formation", libelle: `${a.enseignantsSansFormation} enseignant${a.enseignantsSansFormation > 1 ? "s" : ""} sans la formation obligatoire`, detail: `« ${a.formationObligatoire} » à planifier`, icone: GraduationCap, ton: "info", urgence: 2, href: null, action: "", ts: 3 * JOUR });
    }
    if (t.chiffres.absentsDuJour) {
      out.push({ cle: "absences", libelle: `${t.chiffres.absentsDuJour} apprenant${t.chiffres.absentsDuJour > 1 ? "s" : ""} absent${t.chiffres.absentsDuJour > 1 ? "s" : ""} aujourd'hui`, detail: "Appels enregistrés par les enseignants — à vérifier, à justifier le cas échéant", icone: CalendarX2, ton: "info", urgence: 2, href: "/etablissement", action: "Consulter", ts: 4 * JOUR });
    }
  }
  if (justif && justif.enAttente) {
    out.push({ cle: "justificatifs", libelle: `${justif.enAttente} justificatif${justif.enAttente > 1 ? "s" : ""} d'absence à statuer`, detail: "Transmis par les familles — une décision inscrite au registre, en ajout seul", icone: ClipboardCheck, ton: "avertissement", urgence: 1, href: "/etablissement/justificatifs", action: "Statuer", ts: 0.5 * JOUR });
  }
  for (const d of demandes ?? []) {
    if (d.statut !== "ouverte" && d.statut !== "en_cours") continue;
    const e = analyserEcheance(d.echeance);
    out.push({
      cle: `demande-${d.id}`,
      libelle: d.objet,
      detail: `${CIRCUIT_LIBELLE[d.modele] ?? d.modele} · étape « ${libelleEtape(d.modele, d.etapeCourante)} »`,
      icone: Inbox,
      ton: e.ton,
      urgence: e.urgence,
      href: "/etablissement",
      action: "Ouvrir",
      echeance: d.echeance ? e.libelle : undefined,
      ts: e.ts,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ Sources : file de validation (rôles d'encadrement) */

export function tachesFile(demandes: DemandeATraiter[] | undefined): Tache[] {
  return (demandes ?? []).map((d) => {
    const e = analyserEcheance(d.echeance);
    const role = LIBELLE_ROLE_CIRCUIT[d.etapeRole] ?? d.etapeRole;
    return {
      cle: `file-${d.id}`,
      libelle: d.objet,
      detail: `${CIRCUIT_LIBELLE[d.modele] ?? d.modeleLibelle} · votre étape · ${role}${d.etablissement ? ` · ${d.etablissement}` : ""}`,
      icone: Inbox,
      ton: e.ton,
      urgence: e.urgence,
      href: "/demandes",
      action: "Statuer",
      echeance: d.echeance ? e.libelle : undefined,
      ts: e.ts,
    };
  });
}

