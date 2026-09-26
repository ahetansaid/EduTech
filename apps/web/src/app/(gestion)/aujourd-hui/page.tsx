"use client";

import { CalendarX2, Check, ClipboardCheck, Fingerprint, GraduationCap, Inbox, ListChecks, TrendingDown, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Cascade, Compteur, Element, EntreePage } from "@/components/motion";
import { TuileIndicateur } from "@/components/ui/donnees";
import { Badge, Card, CardHeader, EtatVide, PageHeader, Squelette, type Ton } from "@/components/ui/primitives";
import {
  jourCourant,
  useDemandes,
  useDemandesATraiter,
  useJustificatifs,
  useTableau,
  type Demande,
  type DemandeATraiter,
  type Justificatifs,
  type Tableau,
} from "@/lib/api/etablissement";
import { CIRCUIT_LIBELLE, LIBELLE_ROLE_CIRCUIT, libelleEtape } from "@/lib/circuits";
import { cn } from "@/lib/cn";
import { entier } from "@/lib/format";
import { useEtablissementCourant, useRoles } from "@/lib/session";
import { dateCourte, EtatErreur } from "../etablissement/_composants";

/**
 * Poste de pilotage quotidien — agrégateur de tâches multi-sources, triées par urgence réelle.
 * Il ne crée aucune surface d'accès : chaque ligne provient d'un écran déjà autorisable pour le rôle,
 * et n'est calculée qu'à partir de données que ce rôle a le droit de lire. Les rôles de la file de
 * validation (inspecteur, direction, administration) et le chef d'établissement partagent l'écran,
 * mais n'interrogent que leurs propres sources.
 */

/** Rôles porteurs d'une étape de circuit à traiter (le droit réel est vérifié par l'API). */
const ROLES_FILE = ["inspecteur", "direction_departementale", "administration_centrale"] as const;

/** Degré d'urgence : 0 = bloquant / échéance atteinte, 1 = attendu à court terme, 2 = simple signal. */
type Urgence = 0 | 1 | 2;

interface Tache {
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
const AUJOURDHUI_TS = new Date(`${jourCourant()}T12:00:00Z`).getTime();

/** Classe une échéance en urgence + libellé humain (« en retard de 3 j », « aujourd'hui », « dans 5 j »). */
function analyserEcheance(echeance: string | null): { urgence: Urgence; ton: Ton; libelle: string; ts: number } {
  if (!echeance) return { urgence: 2, ton: "info", libelle: "", ts: Number.MAX_SAFE_INTEGER };
  const ts = new Date(echeance.length === 10 ? `${echeance}T12:00:00Z` : echeance).getTime();
  const jours = Math.round((ts - AUJOURDHUI_TS) / JOUR);
  if (jours < 0) return { urgence: 0, ton: "critique", libelle: `En retard de ${Math.abs(jours)} j`, ts };
  if (jours === 0) return { urgence: 0, ton: "critique", libelle: "Échéance aujourd'hui", ts };
  if (jours <= 7) return { urgence: 1, ton: "avertissement", libelle: `Dans ${jours} j`, ts };
  return { urgence: 2, ton: "info", libelle: `Le ${dateCourte(echeance)}`, ts };
}

/* ------------------------------------------------------------------ Sources : chef d'établissement */

function tachesEtablissement(t: Tableau | undefined, justif: Justificatifs | undefined, demandes: Demande[] | undefined): Tache[] {
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

function tachesFile(demandes: DemandeATraiter[] | undefined): Tache[] {
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

/* ------------------------------------------------------------------ Page */

export default function PageAujourdhui() {
  const etabId = useEtablissementCourant();
  const roles = useRoles();
  const isChef = !!etabId;
  const isFile = roles.some((r) => (ROLES_FILE as readonly string[]).includes(r));

  // Chaque source n'est interrogée que si le rôle qui la porte est présent : aucune requête oisive ni refus journalisé.
  const tableau = useTableau(etabId);
  const justificatifs = useJustificatifs(etabId);
  const demandesEtab = useDemandes(etabId);
  const demandesFile = useDemandesATraiter(isFile);

  const taches = useMemo(
    () => [...(isChef ? tachesEtablissement(tableau.data, justificatifs.data, demandesEtab.data) : []), ...(isFile ? tachesFile(demandesFile.data) : [])]
      .sort((a, b) => a.urgence - b.urgence || a.ts - b.ts),
    [isChef, isFile, tableau.data, justificatifs.data, demandesEtab.data, demandesFile.data],
  );

  if (!isChef && !isFile) return <EntreePage><HorsRole /></EntreePage>;

  const chargement = (isChef && (tableau.isPending || justificatifs.isPending)) || (isFile && demandesFile.isPending);
  const erreur = (isChef && tableau.isError) ? tableau.error : (isFile && demandesFile.isError) ? demandesFile.error : null;

  const parUrgence = (u: Urgence) => taches.filter((t) => t.urgence === u);
  const enRetard = taches.filter((t) => t.ts < AUJOURDHUI_TS).length;
  const aujourdhui = parUrgence(0).length;

  return (
    <EntreePage>
      <div className="space-y-6">
        <PageHeader
          surtitre={dateLongueDuJour()}
          titre="Poste de pilotage"
          sousTitre="Tout ce qui demande votre main aujourd'hui, agrégé depuis vos écrans et trié par urgence réelle — aucune donnée d'un périmètre qui ne vous appartient."
        />

        {erreur ? (
          <Card><EtatErreur erreur={erreur} reessayer={() => { tableau.refetch(); demandesFile.refetch(); }} /></Card>
        ) : chargement ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <Squelette key={i} className="h-[104px] rounded-lg" />)}</div>
            <Squelette className="h-80" />
          </>
        ) : taches.length === 0 ? (
          <Card>
            <EtatVide icone={Check} titre="Rien à signaler aujourd'hui" texte="Aucune échéance atteinte, aucun justificatif ni demande en attente, aucune alerte du registre. Revenez ici chaque matin." />
          </Card>
        ) : (
          <>
            <Cascade className="grid gap-3 sm:grid-cols-3">
              <Element><TuileIndicateur libelle="À traiter aujourd'hui" icone={ListChecks} accent={aujourdhui ? "critique" : "sarcelle"} valeur={<Compteur valeur={aujourdhui} format={entier} />} indice="tâches bloquantes ou à échéance" /></Element>
              <Element><TuileIndicateur libelle="En retard" icone={CalendarX2} accent={enRetard ? "ambre" : "neutre"} valeur={<Compteur valeur={enRetard} format={entier} />} indice="échéances dépassées" /></Element>
              <Element><TuileIndicateur libelle="Total ouvert" icone={Inbox} accent="bleu" valeur={<Compteur valeur={taches.length} format={entier} />} indice="signalements sur vos sources" /></Element>
            </Cascade>

            <SectionUrgence titre="À traiter aujourd'hui" aide="Une décision bloque, ou l'échéance est atteinte." barres={parUrgence(0)} />
            <SectionUrgence titre="Cette semaine" aide="Actions attendues à court terme." barres={parUrgence(1)} />
            <SectionUrgence titre="À surveiller" aide="Signaux du registre, sans échéance immédiate." barres={parUrgence(2)} />
          </>
        )}
      </div>
    </EntreePage>
  );
}

/* ------------------------------------------------------------------ Rendu d'une section d'urgence */

function SectionUrgence({ titre, aide, barres }: { titre: string; aide: string; barres: Tache[] }) {
  if (!barres.length) return null;
  return (
    <Card className="min-w-0 overflow-hidden p-0">
      <div className="px-5 pt-5">
        <CardHeader icon={ListChecks} title={titre} subtitle={aide} action={<Badge>{barres.length}</Badge>} />
      </div>
      <ul className="divide-y divide-line/60 border-t border-line/60">
        {barres.map((t, i) => <LigneTache key={t.cle} t={t} index={i} />)}
      </ul>
    </Card>
  );
}

const FOND_ICONE: Record<Ton, string> = {
  critique: "bg-critical-bg text-critical", avertissement: "bg-warning-bg text-warning", info: "bg-info-bg text-info",
  succes: "bg-success-bg text-success", marque: "bg-blue-soft text-accent-ink", neutre: "bg-surface-2 text-ink-muted",
};

function LigneTache({ t, index }: { t: Tache; index: number }) {
  const contenu = (
    <>
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", FOND_ICONE[t.ton])}><t.icone size={17} aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{t.libelle}</p>
        <p className="mt-0.5 text-xs text-ink-muted">{t.detail}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {t.echeance && <span className={cn("hidden text-[12px] font-semibold sm:inline", t.ts < AUJOURDHUI_TS ? "text-critical" : "text-ink-muted")}>{t.echeance}</span>}
        {t.href ? (
          <span className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-[13px] font-semibold text-blue group-hover:underline">{t.action} →</span>
        ) : (
          <span className="rounded-sm bg-surface-2 px-2 py-0.5 text-[11.5px] text-ink-muted">pas de lien</span>
        )}
      </div>
    </>
  );
  const classe = "flex items-start gap-3 px-5 py-3.5 transition-colors";
  return (
    <li style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }} className="group">
      {t.href ? <Link href={t.href} className={cn(classe, "hover:bg-surface-2/40")}>{contenu}</Link> : <div className={classe}>{contenu}</div>}
    </li>
  );
}

/* ------------------------------------------------------------------ États d'enveloppe */

function dateLongueDuJour() {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date())
    .replace(/^./, (c) => c.toUpperCase());
}

function HorsRole() {
  return (
    <Card>
      <EtatVide icone={ListChecks} titre="Poste indisponible pour votre compte" texte="Le poste de pilotage quotidien est réservé au chef d'établissement et aux rôles de la file de validation (inspecteur, direction départementale, administration centrale)." />
    </Card>
  );
}
