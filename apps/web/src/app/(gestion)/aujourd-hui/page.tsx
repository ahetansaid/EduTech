"use client";

import { CalendarX2, Check, Inbox, ListChecks } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Cascade, Compteur, Element, EntreePage } from "@/components/motion";
import { TuileIndicateur } from "@/components/ui/donnees";
import { Badge, Card, CardHeader, EtatVide, PageHeader, Squelette, type Ton } from "@/components/ui/primitives";
import { useDemandes, useDemandesATraiter, useJustificatifs, useTableau } from "@/lib/api/etablissement";
import { AUJOURDHUI_TS, ROLES_FILE, tachesEtablissement, tachesFile, type Tache, type Urgence } from "@/lib/taches";
import { cn } from "@/lib/cn";
import { entier } from "@/lib/format";
import { useEtablissementCourant, useRoles } from "@/lib/session";
import { EtatErreur } from "../etablissement/_composants";

/**
 * Poste de pilotage quotidien — agrégateur de tâches multi-sources, triées par urgence réelle.
 * Il ne crée aucune surface d'accès : chaque ligne provient d'un écran déjà autorisable pour le rôle,
 * et n'est calculée qu'à partir de données que ce rôle a le droit de lire. Les rôles de la file de
 * validation (inspecteur, direction, administration) et le chef d'établissement partagent l'écran,
 * mais n'interrogent que leurs propres sources.
 */

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
