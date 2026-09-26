"use client";

import { Download, Inbox, Landmark } from "lucide-react";
import { useMemo, useState } from "react";
import { Cascade, Compteur, Element, EntreePage, motion } from "@/components/motion";
import { TuileIndicateur } from "@/components/ui/donnees";
import { Badge, Button, Card, CardHeader, EtatVide, PageHeader, Squelette } from "@/components/ui/primitives";
import { useDemandesATraiter, type DemandeATraiter } from "@/lib/api/etablissement";
import { CIRCUIT_LIBELLE, LIBELLE_ROLE_CIRCUIT, libelleEtape } from "@/lib/circuits";
import { exporterCsv, type Colonne } from "@/lib/export";
import { entier } from "@/lib/format";
import { useRoles } from "@/lib/session";
import { dateCourte, EtatErreur, LIBELLE_STATUT_DEMANDE, normaliser, Statut, TON_STATUT_DEMANDE } from "../etablissement/_composants";
import { DialogueStatuer } from "@/components/demandes/DialogueStatuer";

/** Rôles susceptibles d'avoir une étape de circuit à traiter (le droit réel est décidé par l'API : rôle de l'étape + périmètre). */
const ROLES_FILE = ["inspecteur", "direction_departementale", "administration_centrale"] as const;

/** Colonnes exportées : la file telle qu'affichée (circuit, étape courante, échéance), rien de plus. */
const COLONNES: Colonne<DemandeATraiter>[] = [
  { entete: "Objet", valeur: (d) => d.objet },
  { entete: "Circuit", valeur: (d) => CIRCUIT_LIBELLE[d.modele] ?? d.modeleLibelle },
  { entete: "Étape courante", valeur: (d) => libelleEtape(d.modele, d.etapeCourante) },
  { entete: "Rôle de l'étape", valeur: (d) => LIBELLE_ROLE_CIRCUIT[d.etapeRole] ?? d.etapeRole },
  { entete: "Établissement", valeur: (d) => d.etablissement ?? "" },
  { entete: "Statut", valeur: (d) => LIBELLE_STATUT_DEMANDE[d.statut] },
  { entete: "Ouverte le", valeur: (d) => dateCourte(d.creeeLe) },
  { entete: "Échéance", valeur: (d) => (d.echeance ? dateCourte(d.echeance) : "") },
];

export default function Page() {
  const roles = useRoles();
  const eligible = roles.some((r) => (ROLES_FILE as readonly string[]).includes(r));
  return <EntreePage>{eligible ? <FileDemandes /> : <HorsRole />}</EntreePage>;
}

function HorsRole() {
  return (
    <Card>
      <EtatVide icone={Landmark} titre="Aucune étape de circuit à traiter" texte="Cette file regroupe les demandes dont l'étape courante relève de votre rôle. Votre compte ne porte pas d'habilitation appelée par un circuit de validation." />
    </Card>
  );
}

function FileDemandes() {
  const q = useDemandesATraiter(true);
  return (
    <div className="space-y-5">
      <PageHeader
        surtitre="Processus P9"
        titre="Demandes à traiter"
        sousTitre="Toutes les demandes dont l'étape courante relève de votre rôle et de votre périmètre. Chaque décision est inscrite au registre, en ajout seul, et notifiée au demandeur."
      />
      {q.isPending ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <Squelette key={i} className="h-[104px] rounded-lg" />)}</div>
          <Squelette className="h-96" />
        </>
      ) : q.isError ? (
        <Card><EtatErreur erreur={q.error} reessayer={() => q.refetch()} /></Card>
      ) : (
        <Contenu demandes={q.data!} />
      )}
    </div>
  );
}

function Contenu({ demandes }: { demandes: DemandeATraiter[] }) {
  const [recherche, setRecherche] = useState("");
  const [cible, setCible] = useState<string | null>(null);

  const parCircuit = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of demandes) m.set(d.modele, (m.get(d.modele) ?? 0) + 1);
    return m;
  }, [demandes]);

  const liste = useMemo(() => {
    const n = normaliser(recherche);
    return demandes.filter((d) =>
      !n || normaliser(`${d.objet} ${d.etablissement ?? ""} ${d.modeleLibelle} ${d.etapeCourante}`).includes(n),
    );
  }, [demandes, recherche]);

  const principales = [...parCircuit.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  return (
    <>
      <Cascade className="grid gap-3 sm:grid-cols-3">
        <Element><TuileIndicateur libelle="À traiter" icone={Inbox} accent="ambre" valeur={<Compteur valeur={demandes.length} format={entier} />} indice="en attente de votre décision" /></Element>
        {principales.map(([code, n]) => (
          <Element key={code}><TuileIndicateur libelle={CIRCUIT_LIBELLE[code] ?? code} icone={Inbox} accent="bleu" valeur={<Compteur valeur={n} format={entier} />} indice="demandes en cours" /></Element>
        ))}
      </Cascade>

      <Card className="min-w-0 overflow-hidden p-0">
        <div className="space-y-4 px-5 pt-5">
          <CardHeader className="mb-0" icon={Inbox} title="File de décisions" subtitle="Le droit de statuer est vérifié par l'API à chaque étape" action={<Badge>{demandes.length}</Badge>} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="relative block w-full sm:max-w-sm">
              <span className="sr-only">Rechercher une demande</span>
              <input
                type="search"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value.slice(0, 60))}
                placeholder="Objet, établissement ou circuit"
                className="h-10 w-full rounded-md border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-ink-muted focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/15"
              />
            </label>
            <Button variante="secondaire" icone={Download} disabled={!liste.length} onClick={() => exporterCsv("demandes-a-traiter", liste, COLONNES)} title={`Exporter les ${liste.length} demandes affichées au format CSV`}>Exporter</Button>
          </div>
        </div>

        {liste.length === 0 ? (
          <EtatVide icone={Inbox} titre="Aucune demande" texte={demandes.length ? "Aucune demande ne correspond à cette recherche." : "Rien à traiter pour le moment : les demandes qui arrivent à votre étape apparaîtront ici."} />
        ) : (
          <ul className="mt-4 divide-y divide-line/60 border-t border-line/60">
            {liste.map((d, i) => (
              <Ligne key={d.id} d={d} index={i} onStatuer={() => setCible(d.id)} />
            ))}
          </ul>
        )}
      </Card>

      <DialogueStatuer demandeId={cible} onFermer={() => setCible(null)} />
    </>
  );
}

function Ligne({ d, index, onStatuer }: { d: DemandeATraiter; index: number; onStatuer: () => void }) {
  const circuit = CIRCUIT_LIBELLE[d.modele] ?? d.modeleLibelle;
  const etape = libelleEtape(d.modele, d.etapeCourante);
  const role = LIBELLE_ROLE_CIRCUIT[d.etapeRole] ?? d.etapeRole;
  return (
    <motion.li initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 12) * 0.035 }} className="flex flex-wrap items-start gap-x-3 gap-y-2 px-5 py-3.5 hover:bg-surface-2/40">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-soft text-accent-ink"><Inbox size={17} aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{d.objet}</p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {circuit} · étape « {etape} » ({role})
          {d.etablissement ? ` · ${d.etablissement}` : ""}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          Ouverte le {dateCourte(d.creeeLe)}{d.echeance ? ` · échéance ${dateCourte(d.echeance)}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Statut ton={TON_STATUT_DEMANDE[d.statut]}>{LIBELLE_STATUT_DEMANDE[d.statut]}</Statut>
        <Button variante="primaire" taille="sm" onClick={onStatuer}>Statuer</Button>
      </div>
    </motion.li>
  );
}
