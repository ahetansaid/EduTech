"use client";

import { Activity, CheckCircle2, CloudOff, Database, DatabaseBackup, GitBranch, HardDrive, History, RefreshCw, Server, ShieldCheck, Timer, TriangleAlert, Wifi } from "lucide-react";
import { useMemo } from "react";
import { TuileIndicateur } from "@/components/ui/donnees";
import { Badge, Button, Card, CardHeader, Etiquette, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { libelleEvenement } from "@/lib/donnees";
import { date, dateLongue, entier, heure } from "@/lib/format";
import { hashString } from "@beile/simulation/rng";
import { DATE_SIMULEE } from "@beile/simulation/micro";
import { useDemo, useMonde } from "@/lib/store";

/* ------------------------------------------------------------------ Valeurs simulées */

const JOUR = DATE_SIMULEE.slice(0, 10);
const SAUVEGARDE = `${JOUR}T03:00:00.000Z`;
const RESTAURATION = `${JOUR}T03:41:00.000Z`;

const COMPOSANTS = [
  { nom: "Application et espaces", detail: "Pages des six espaces", icone: Server, etat: "ok" as const },
  { nom: "API BEILE /api/v1", detail: "Contrôle d'accès et calculs", icone: Activity, etat: "ok" as const },
  { nom: "Base de données", detail: "Registre, référentiels, audit", icone: Database, etat: "ok" as const },
  { nom: "Stockage des documents", detail: "Diplômes, pièces, sauvegardes", icone: HardDrive, etat: "ok" as const },
  { nom: "Registre national (connecteur)", detail: "Temps de réponse plus long que d'habitude", icone: ShieldCheck, etat: "degrade" as const },
  { nom: "Notifications aux familles", detail: "Envoi des messages", icone: Wifi, etat: "ok" as const },
];

const CRITICITE = [
  { niveau: 4, libelle: "Hautement sensible", exemples: "Identité, certifications, registre des événements", rpo: "Quelques minutes", rto: "Moins d'1 h" },
  { niveau: 3, libelle: "Personnel", exemples: "Dossiers apprenants, évaluations", rpo: "Moins de 15 min", rto: "Moins de 4 h" },
  { niveau: 2, libelle: "Professionnel", exemples: "Référentiels, affectations", rpo: "Moins d'1 h", rto: "Moins de 8 h" },
  { niveau: 1, libelle: "Public", exemples: "Statistiques agrégées publiées", rpo: "Moins de 24 h", rto: "Moins de 24 h" },
];

const ENVIRONNEMENTS = [
  { branche: "main", nom: "Production", role: "Ce que voit le jury", version: "v0.4.0", deploye: "16/03/2026 18:20", etat: "ok" as const },
  { branche: "staging", nom: "Recette", role: "Version candidate, figée pour validation et répétition", version: "v0.5.0-rc.1", deploye: "17/03/2026 07:05", etat: "ok" as const },
  { branche: "dev", nom: "Intégration", role: "Fusion quotidienne des fonctionnalités", version: "38c93f9", deploye: "17/03/2026 08:12", etat: "ok" as const },
];

/** 90 jours de disponibilité, déterministes (simulés). */
const JOURS = Array.from({ length: 90 }, (_, i) => {
  const h = hashString(`dispo-${i}`) % 1000;
  const incident = i === 61 ? "incident" : h < 30 ? "degrade" : "ok";
  return incident as "ok" | "degrade" | "incident";
});

export default function EtatPage() {
  const monde = useMonde();
  const enLigne = useDemo((s) => s.enLigne);
  const fileAttente = useDemo((s) => s.fileAttente);
  const basculer = useDemo((s) => s.basculerConnexion);
  const synchroniser = useDemo((s) => s.synchroniser);

  const lignesVerifiees = useMemo(
    () => monde.evenements.length + monde.apprenants.length + monde.registre.length + monde.certificats.length + monde.liens.length,
    [monde],
  );
  const degrades = COMPOSANTS.filter((c) => c.etat !== "ok");

  return (
    <div className="space-y-6">
      <PageHeader
        surtitre={`Conformité · P15 · ${dateLongue(DATE_SIMULEE)}`}
        titre="État du service"
        sousTitre="Le service fonctionne-t-il, les données sont-elles sauvegardées, et saurait-on les récupérer ? Réponses en clair, pour tous."
        actions={<Badge ton="avertissement" icone={TriangleAlert}>Toutes les valeurs de cette page sont simulées</Badge>}
      />

      <div className={cn("flex flex-col gap-4 rounded-xl border p-5 shadow-float sm:flex-row sm:items-center", degrades.length ? "border-warning/30 bg-warning-bg" : "border-success/30 bg-success-bg")} role="status">
        <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-surface shadow-soft", degrades.length ? "text-warning" : "text-success")}>
          {degrades.length ? <TriangleAlert size={21} aria-hidden /> : <CheckCircle2 size={21} aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[18px] font-bold text-ink">
            {degrades.length ? "Le service fonctionne, avec un ralentissement" : "Tous les services fonctionnent normalement"}
          </p>
          <p className="mt-0.5 text-[13.5px] text-ink-2">
            {degrades.length
              ? `${degrades.map((d) => d.nom).join(", ")} : les inscriptions restent possibles, la vérification d'identité est mise en file et reprise automatiquement.`
              : "Aucune action n'est attendue."}{" "}
            <span className="text-ink-muted">(simulé)</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TuileIndicateur libelle="Disponibilité · 30 jours" icone={Activity} accent="sarcelle" valeur="99,94" unite="%" indice={<>Environ 26 min d'interruption · <Badge ton="avertissement">simulé</Badge></>} />
        <TuileIndicateur libelle="Temps de réponse" icone={Timer} accent="bleu" valeur="184" unite="ms" indice={<>9 pages sur 10 en moins de 0,6 s · <Badge ton="avertissement">simulé</Badge></>} />
        <TuileIndicateur libelle="Dernière sauvegarde" icone={DatabaseBackup} accent="bleu" valeur={heure(SAUVEGARDE)} indice={<>{date(SAUVEGARDE)} · chiffrée, hors site · <Badge ton="avertissement">simulé</Badge></>} />
        <TuileIndicateur libelle="Test de restauration" icone={ShieldCheck} accent="sarcelle" valeur="Réussi" indice={<>{date(RESTAURATION)} à {heure(RESTAURATION)} · <Badge ton="avertissement">simulé</Badge></>} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            icon={History}
            title="Dernier test de restauration"
            subtitle="Une sauvegarde qui n'a jamais été restaurée n'est pas une sauvegarde. Le test est automatique, chaque nuit."
            action={<Badge ton="succes" icone={CheckCircle2}>Réussi</Badge>}
          />
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Date", `${date(RESTAURATION)} · ${heure(RESTAURATION)}`],
              ["Durée", "11 min 32 s"],
              ["Lignes vérifiées", entier(lignesVerifiees)],
              ["Écarts", "0"],
            ].map(([l, v]) => (
              <div key={l} className="min-w-0 rounded-lg bg-surface-2/60 p-3">
                <dt><Etiquette>{l}</Etiquette></dt>
                <dd className="mt-1 font-display text-[16px] font-bold tabular text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <ol className="mt-4 space-y-2">
            {[
              ["Copie de la sauvegarde chiffrée de 03:00 récupérée depuis le site secondaire", "3 min 05 s"],
              ["Restauration sur une base éphémère, isolée de la production", "6 min 40 s"],
              [`Comptages comparés, table par table : ${entier(lignesVerifiees)} lignes, aucun écart`, "58 s"],
              [`Intégrité du registre des événements contrôlée : ${entier(monde.evenements.length)} événements, en ajout seul, aucune modification ni suppression`, "34 s"],
              ["Base éphémère supprimée ; résultat inscrit au journal d'exploitation", "15 s"],
            ].map(([t, d], i) => (
              <li key={i} className="flex items-start gap-3 text-[13.5px]">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success text-white"><CheckCircle2 size={12} aria-hidden /></span>
                <span className="flex-1 text-ink-2">{t}</span>
                <span className="shrink-0 font-mono text-[11.5px] tabular text-ink-muted">{d}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[12px] text-ink-muted">Nombre de lignes et d'événements : comptages réels du registre de la démonstration. Horaires et durées : simulés.</p>
        </Card>

        <Card>
          <CardHeader
            icon={enLigne ? Wifi : CloudOff}
            title="Synchronisation hors connexion"
            subtitle="Une saisie faite sans réseau est conservée sur l'appareil, puis envoyée au retour de la connexion."
            action={enLigne ? <Badge ton="succes" icone={Wifi}>En ligne</Badge> : <Badge ton="avertissement" icone={CloudOff}>Hors connexion</Badge>}
          />
          <div className="flex items-end justify-between gap-3 rounded-lg bg-surface-2/60 p-4">
            <div>
              <Etiquette>En attente d'envoi</Etiquette>
              <p className="mt-1 font-display text-[30px] font-bold leading-none tabular text-ink">{entier(fileAttente.length)}</p>
              <p className="mt-1 text-[12.5px] text-ink-muted">{fileAttente.length ? "élément(s) non synchronisé(s)" : "Rien en attente : tout est à jour"}</p>
            </div>
            {enLigne ? (
              <Button variante="secondaire" taille="sm" icone={CloudOff} onClick={basculer}>Simuler une coupure</Button>
            ) : (
              <Button variante="valider" taille="sm" icone={RefreshCw} onClick={() => synchroniser()}>Synchroniser</Button>
            )}
          </div>
          {fileAttente.length > 0 && (
            <ul className="mt-3 max-h-48 space-y-1.5 overflow-y-auto">
              {fileAttente.map((e) => (
                <li key={e.id} className="flex items-center gap-3 rounded-md bg-warning-bg/60 px-3 py-1.5 text-[12.5px]">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-warning" aria-hidden />
                  <span className="flex-1 truncate font-medium text-ink">{libelleEvenement(e.type)}</span>
                  <span className="tabular text-ink-muted">{heure(e.enregistreLe)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[12.5px] text-ink-2">
            {enLigne
              ? "Pour le voir fonctionner : simulez une coupure, faites l'appel dans l'espace enseignant, puis revenez synchroniser."
              : "Les saisies faites maintenant gardent leur date réelle ; seule la date d'enregistrement changera à la synchronisation."}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader icon={Server} title="Composants" subtitle="État de chaque brique du service" action={<Badge ton="avertissement">simulé</Badge>} />
          <ul className="space-y-1.5">
            {COMPOSANTS.map((c) => (
              <li key={c.nom} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-2/60">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-surface-2 text-ink-muted"><c.icone size={15} aria-hidden /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink">{c.nom}</span>
                  <span className="block truncate text-[12px] text-ink-muted">{c.detail}</span>
                </span>
                {c.etat === "ok" ? <Badge ton="succes" icone={CheckCircle2}>Normal</Badge> : <Badge ton="avertissement" icone={TriangleAlert}>Ralenti</Badge>}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader icon={Activity} title="Disponibilité sur 90 jours" subtitle="Un trait par jour, du plus ancien au plus récent" action={<Badge ton="avertissement">simulé</Badge>} />
          <div className="flex h-10 items-stretch gap-[2px]" role="img" aria-label={`90 jours : ${JOURS.filter((j) => j === "ok").length} jours normaux, ${JOURS.filter((j) => j === "degrade").length} jours ralentis, ${JOURS.filter((j) => j === "incident").length} jour d'interruption`}>
            {JOURS.map((j, i) => (
              <span key={i} className={cn("flex-1 rounded-[2px]", j === "ok" ? "bg-success/80" : j === "degrade" ? "bg-warning" : "bg-critical")} />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-ink-muted"><span>il y a 90 jours</span><span>aujourd'hui</span></div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
            <li className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-success/80" aria-hidden />Normal ({JOURS.filter((j) => j === "ok").length} j)</li>
            <li className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-warning" aria-hidden />Ralenti ({JOURS.filter((j) => j === "degrade").length} j)</li>
            <li className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-critical" aria-hidden />Interruption ({JOURS.filter((j) => j === "incident").length} j)</li>
          </ul>
          <p className="mt-3 rounded-md bg-surface-2/60 px-3 py-2 text-[12.5px] text-ink-2">
            Interruption de 26 min il y a 28 jours : mise à jour de la base de données, bascule sur la réplique. Aucune donnée perdue.
          </p>
        </Card>
      </div>

      <Card className="p-0">
        <div className="border-b border-line/60 px-5 py-4">
          <h2 className="text-[15px] font-semibold text-ink">Objectifs de continuité par niveau de criticité</h2>
          <p className="text-[12.5px] text-ink-muted">
            <strong className="font-semibold text-ink-2">Perte maximale</strong> (RPO) : au pire, combien de minutes de saisie pourraient être à refaire.{" "}
            <strong className="font-semibold text-ink-2">Délai de reprise</strong> (RTO) : en combien de temps le service revient. Cibles de travail, à valider selon l'infrastructure retenue.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-surface-2 text-left text-[11px] uppercase tracking-wide text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-semibold">Niveau</th>
                <th scope="col" className="hidden px-4 py-2 font-semibold sm:table-cell">Exemples</th>
                <th scope="col" className="px-4 py-2 font-semibold">Perte max. (RPO)</th>
                <th scope="col" className="px-4 py-2 font-semibold">Reprise (RTO)</th>
              </tr>
            </thead>
            <tbody>
              {CRITICITE.map((c) => (
                <tr key={c.niveau} className="border-t border-line/60">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-navy font-display text-[12px] font-bold text-white dark:bg-blue dark:text-navy-deep">{c.niveau}</span>
                      <span className="font-medium text-ink">{c.libelle}</span>
                    </span>
                    <span className="mt-0.5 block text-[12px] text-ink-muted sm:hidden">{c.exemples}</span>
                  </td>
                  <td className="hidden px-4 py-2.5 text-ink-2 sm:table-cell">{c.exemples}</td>
                  <td className="px-4 py-2.5 tabular text-ink">{c.rpo}</td>
                  <td className="px-4 py-2.5 tabular text-ink">{c.rto}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 text-[12px] text-ink-muted">Politique 3-2-1 : trois copies, deux supports, une copie hors site.</p>
      </Card>

      <Card>
        <CardHeader icon={GitBranch} title="Environnements" subtitle="Une modification passe par l'intégration, puis la recette, avant la production. Jamais directement." action={<Badge ton="avertissement">simulé</Badge>} />
        <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {ENVIRONNEMENTS.slice().reverse().map((e, i) => (
            <li key={e.branche} className="relative rounded-lg border border-line/70 bg-surface-2/40 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[13px] font-semibold text-ink">{e.branche}</span>
                <Badge ton="succes" icone={CheckCircle2}>Opérationnel</Badge>
              </div>
              <p className="mt-2 font-display text-[16px] font-bold text-ink">{e.nom}</p>
              <p className="text-[12.5px] text-ink-2">{e.role}</p>
              <p className="mt-2 text-[12px] text-ink-muted">Version <span className="font-mono text-ink-2">{e.version}</span> · déployée le {e.deploye}</p>
              <span className="sr-only">Étape {i + 1} sur 3</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[12px] text-ink-muted">
          Chaque passage exige une intégration continue verte : vérification des types, tests du moteur d'accès et du calcul des indicateurs, audit des dépendances.
        </p>
      </Card>
    </div>
  );
}
