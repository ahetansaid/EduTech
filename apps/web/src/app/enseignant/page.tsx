"use client";

import { ArrowRight, ClipboardCheck, PenLine, Search, ShieldQuestion, TrendingDown, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DecisionAccesCarte } from "@/components/ui/donnees";
import { Badge, Card, CardHeader, Etiquette } from "@/components/ui/primitives";
import { dateLongue, nombre } from "@/lib/format";
import { absentsDuJour, classesEnseignant, elevesClasse, elevesEtablissement, moyennesParMatiere, nomComplet } from "@/lib/scolarite";
import { DATE_SIMULEE, ETAB_RONIERS } from "@/lib/sim/micro";
import { elevesEnBaisse } from "@/lib/sim/projections";
import { useAcces, useMonde, useProfil, type Finalite } from "@/lib/store";
import type { DecisionAcces } from "@beile/contracts";

const HORAIRES = ["08 h 00 – 10 h 00", "10 h 15 – 12 h 15", "15 h 00 – 17 h 00"];

export default function EspaceEnseignant() {
  const monde = useMonde();
  const profil = useProfil();
  const enseignant = monde.enseignants.find((e) => e.npi === profil.npi);
  const classes = useMemo(() => (enseignant ? classesEnseignant(monde, enseignant.id) : []), [monde, enseignant]);

  if (!enseignant) return null;
  return (
    <div className="space-y-8">
      <div>
        <p className="text-[13px] text-ink-muted">{dateLongue(DATE_SIMULEE)} · CEG Les Rôniers, Parakou</p>
        <h1 className="mt-1 text-[26px] font-bold text-ink">Bonjour {enseignant.prenoms}</h1>
        <p className="mt-1 text-ink-2">Vous avez {classes.length} cours aujourd'hui. L'appel et les notes que vous saisissez produisent directement les bulletins et informent les familles : aucune ressaisie.</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {classes.map(({ classe, matieres }, i) => (
          <CarteClasse key={classe.id} classeId={classe.id} horaire={HORAIRES[i] ?? ""} matieres={matieres.join(", ")} />
        ))}
      </div>

      <AccesDossier />
    </div>
  );
}

function CarteClasse({ classeId, horaire, matieres }: { classeId: string; horaire: string; matieres: string }) {
  const monde = useMonde();
  const classe = monde.classes.find((c) => c.id === classeId)!;
  const eleves = elevesClasse(monde, monde.evenements, classe);
  const ids = new Set(eleves.map((e) => e.id));
  const baisse = elevesEnBaisse(monde.evenements, ids);
  const absents = absentsDuJour(monde.evenements, classe.id).length;
  const moyMaths = eleves.map((e) => moyennesParMatiere(monde.evenements, e.id).find((m) => m.matiere === "Mathématiques")?.moyenne).filter((v): v is number => v != null);
  const moy = moyMaths.length ? moyMaths.reduce((s, v) => s + v, 0) / moyMaths.length : null;
  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Etiquette>{horaire}</Etiquette>
          <p className="mt-1 font-display text-[22px] font-bold text-ink">{classe.libelle}</p>
          <p className="text-[13px] text-ink-muted">{matieres}</p>
        </div>
        <span className="flex h-11 w-11 items-center justify-center rounded-lg text-white" style={{ background: "var(--acc)" }}><Users size={20} aria-hidden /></span>
      </div>
      <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-md bg-surface-2/70 px-2 py-3"><dt className="text-[11px] text-ink-muted">Élèves</dt><dd className="mt-0.5 font-display text-[20px] font-bold tabular text-ink">{eleves.length}</dd></div>
        <div className="rounded-md bg-surface-2/70 px-2 py-3"><dt className="text-[11px] text-ink-muted">Moy. maths</dt><dd className="mt-0.5 font-display text-[20px] font-bold tabular text-ink">{nombre(moy, 1)}</dd></div>
        <div className="rounded-md bg-surface-2/70 px-2 py-3"><dt className="text-[11px] text-ink-muted">Absents ce jour</dt><dd className="mt-0.5 font-display text-[20px] font-bold tabular text-ink">{absents}</dd></div>
      </dl>
      {baisse.length > 0 && (
        <p className="mt-4 flex items-center gap-2 rounded-md bg-warning-bg px-3 py-2 text-[12.5px] text-warning">
          <TrendingDown size={15} aria-hidden /> {baisse.length} élève{baisse.length > 1 ? "s" : ""} en baisse sur les trois dernières évaluations de mathématiques
        </p>
      )}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Link href={`/enseignant/classe/${classe.id}?onglet=appel`} className="inline-flex h-11 items-center justify-center gap-2 rounded-md text-[14px] font-semibold text-white shadow-sm transition active:scale-[0.98]" style={{ background: "var(--acc)" }}>
          <ClipboardCheck size={17} aria-hidden /> Faire l'appel
        </Link>
        <Link href={`/enseignant/classe/${classe.id}?onglet=notes`} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-surface text-[14px] font-semibold text-ink ring-1 ring-inset ring-line hover:bg-surface-2">
          <PenLine size={17} aria-hidden /> Saisir des notes
        </Link>
      </div>
    </Card>
  );
}

/** Démonstration du contrôle d'accès : l'enseignant tente d'ouvrir un dossier. */
function AccesDossier() {
  const monde = useMonde();
  const acces = useAcces();
  const [recherche, setRecherche] = useState("");
  const [finalite, setFinalite] = useState<Finalite>("evaluation");
  const [resultat, setResultat] = useState<{ nom: string; classe: string; decision: DecisionAcces; id: string } | null>(null);
  const eleves = useMemo(() => elevesEtablissement(monde, monde.evenements, ETAB_RONIERS), [monde]);
  const trouves = recherche.trim().length >= 2
    ? eleves.filter(({ apprenant }) => nomComplet(apprenant).toLowerCase().includes(recherche.trim().toLowerCase())).slice(0, 6)
    : [];

  return (
    <Card>
      <CardHeader icon={ShieldQuestion} title="Ouvrir le dossier d'un élève" subtitle="Chaque ouverture est décidée sur quatre critères — rôle, périmètre, relation, finalité — et journalisée, refus compris." />
      <div className="grid gap-3 sm:grid-cols-[1fr_16rem]">
        <label className="relative block">
          <span className="sr-only">Rechercher un élève de l'établissement</span>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input value={recherche} onChange={(e) => setRecherche(e.target.value.slice(0, 60))} placeholder="Nom d'un élève du CEG (ex. SANNI, ZANNOU…)" className="h-11 w-full rounded-md border border-line bg-surface pl-9 pr-3 text-[14px] text-ink outline-none focus:ring-2 focus:ring-blue/40" />
        </label>
        <label className="block">
          <span className="sr-only">Finalité déclarée</span>
          <select value={finalite} onChange={(e) => setFinalite(e.target.value as Finalite)} className="h-11 w-full rounded-md border border-line bg-surface px-3 text-[14px] text-ink">
            <option value="evaluation">Finalité : évaluation pédagogique</option>
            <option value="suivi_familial">Finalité : suivi familial (parent)</option>
            <option value="gestion">Finalité : gestion administrative</option>
          </select>
        </label>
      </div>
      {trouves.length > 0 && (
        <ul className="mt-3 divide-y divide-line/60 rounded-md border border-line/70">
          {trouves.map(({ apprenant, classe }) => (
            <li key={apprenant.id}>
              <button
                onClick={() => setResultat({ nom: nomComplet(apprenant), classe: classe?.libelle ?? "—", id: apprenant.id, decision: acces.demander({ ressource: { type: "dossier_apprenant", apprenantId: apprenant.id }, finalite }, "Ouverture d'un dossier apprenant", `${nomComplet(apprenant)} (${apprenant.id})`) })}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2"
              >
                <span className="flex-1 text-[14px] text-ink">{nomComplet(apprenant)}</span>
                <Badge>{classe?.libelle ?? "—"}</Badge>
                <ArrowRight size={15} className="text-ink-muted" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {resultat && (
        <div className="mt-4 animate-slide-up">
          <p className="mb-2 text-[13px] text-ink-2">Demande : dossier de <strong className="text-ink">{resultat.nom}</strong> ({resultat.classe})</p>
          <DecisionAccesCarte decision={resultat.decision} />
          {resultat.decision.autorise && (
            <div className="mt-3 rounded-md bg-surface-2/70 p-3 text-[13px]">
              <p className="font-semibold text-ink">Moyennes du trimestre en cours</p>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {moyennesParMatiere(monde.evenements, resultat.id, 2).map((m) => (
                  <li key={m.matiere} className="flex justify-between"><span className="text-ink-2">{m.matiere}</span><span className="font-semibold tabular text-ink">{nombre(m.moyenne, 2)}/20</span></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <p className="mt-4 text-[12px] text-ink-muted">Essayez : votre fille Zoulfath (6e B) avec la finalité « évaluation » puis « suivi familial » ; un élève de 3e A avec la finalité « évaluation ».</p>
    </Card>
  );
}
