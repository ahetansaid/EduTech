"use client";

import type { Critere, EntreeAudit, Finalite } from "@beile/contracts";
import { FINALITE_LIBELLE } from "@beile/contracts";
import { ArrowRightLeft, FileLock2, Lock, ScrollText, Search, ShieldCheck, ShieldX, UserRoundSearch, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { TuileIndicateur } from "@/components/ui/donnees";
import { Badge, Button, Card, CardHeader, EtatVide, Etiquette, PageHeader, Segmente } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { date, entier, heure, nombre } from "@/lib/format";
import { useAcces, useDemo, useMonde, useProfil } from "@/lib/store";
import { useLectureApi } from "@/lib/api";

/* ------------------------------------------------------------------ Libellés */

const CRITERE_LIBELLE: Record<Critere, string> = { role: "Rôle", perimetre: "Périmètre", relation: "Relation", finalite: "Finalité" };
const CRITERE_AIDE: Record<Critere, string> = {
  role: "Le rôle ne donne pas accès à ce type de donnée",
  perimetre: "La donnée est hors du territoire ou de l'établissement de l'habilitation",
  relation: "Aucun lien pédagogique, familial ou administratif avec la personne",
  finalite: "Le motif déclaré n'est pas admis pour ce rôle",
};

type Entree = EntreeAudit & { simule?: boolean; base?: boolean };
type FiltreDecision = "tous" | "autorises" | "refuses";
type FiltreOrigine = "tout" | "seance" | "historique";

/** Une seule journalisation de la consultation du journal par chargement de l'application. */
let consultationJournalisee = false;

export default function AuditPage() {
  const audit = useDemo((s) => s.audit);
  const monde = useMonde();
  const acces = useAcces();

  const [recherche, setRecherche] = useState("");
  const [decision, setDecision] = useState<FiltreDecision>("tous");
  const [origine, setOrigine] = useState<FiltreOrigine>("tout");
  const [profil, setProfil] = useState("tous");
  const [finalite, setFinalite] = useState<"toutes" | Finalite>("toutes");

  // La consultation du journal est elle-même une lecture journalisée.
  useEffect(() => {
    if (consultationJournalisee) return;
    consultationJournalisee = true;
    acces.demander({ ressource: { type: "journal_audit" }, finalite: "audit" }, "Consultation du journal d'audit", "Journal d'audit national");
  }, [acces]);

  const historique = useMemo<Entree[]>(() => {
    const nom = (id: string) => monde.profils.find((p) => p.id === id)?.nomAffiche ?? id;
    const app = (i: number) => monde.apprenants[i % monde.apprenants.length]?.id ?? `APP-${i}`;
    const e = (n: number, h: string, profilId: string, action: string, ressource: string, fin: Finalite, autorise: boolean, critere: Critere | null): Entree => ({
      id: `HIST-${n}`, horodatage: h, profilId, profilNom: nom(profilId), action, ressource, finalite: fin, autorise, critereManquant: critere, simule: true,
    });
    return [
      e(1, "2026-03-16T17:58:12.000Z", "p-enseignant", "Consultation d'un dossier d'apprenant", `Dossier ${app(41)}`, "evaluation", false, "relation"),
      e(2, "2026-03-16T16:40:03.000Z", "p-parent", "Consultation d'un dossier d'apprenant", `Dossier ${app(3)}`, "suivi_familial", true, null),
      e(3, "2026-03-16T15:12:47.000Z", "p-chercheur", "Ask Education — requête agrégée", "Taux de réussite à l'examen", "statistique", true, null),
      e(4, "2026-03-16T14:03:29.000Z", "p-departement", "Consultation d'un indicateur", "Absentéisme · commune de Cotonou (Littoral)", "controle", false, "perimetre"),
      e(5, "2026-03-16T11:27:55.000Z", "p-directeur", "Consultation d'un dossier d'apprenant", `Dossier ${app(12)}`, "gestion", true, null),
      e(6, "2026-03-16T10:05:18.000Z", "p-inspecteur", "Consultation d'un dossier d'apprenant", `Dossier ${app(27)}`, "controle", false, "role"),
      e(7, "2026-03-15T16:31:40.000Z", "p-enseignant", "Consultation d'un indicateur", "Moyenne des apprenants · département du Borgou", "statistique", false, "finalite"),
      e(8, "2026-03-15T09:44:02.000Z", "p-central", "Ask Education — requête agrégée", "Ratio apprenants par enseignant", "statistique", true, null),
      e(9, "2026-03-15T08:15:36.000Z", "p-dpo", "Consultation du journal d'audit", "Journal d'audit national", "audit", true, null),
    ];
  }, [monde.profils, monde.apprenants]);

  // Journal réel de la base nationale (API) : remplace l'historique simulé quand il est disponible.
  const profilActif = useProfil();
  const base = useLectureApi<EntreeAudit[]>(profilActif.id, "/audit?limite=200");
  const historiqueAffiche = useMemo<Entree[]>(
    () => (base.donnees ? base.donnees.map((e) => ({ ...e, horodatage: new Date(e.horodatage).toISOString(), simule: true, base: true })) : historique),
    [base.donnees, historique],
  );
  const toutes = useMemo<Entree[]>(() => [...audit, ...historiqueAffiche], [audit, historiqueAffiche]);
  const profils = useMemo(() => [...new Map(toutes.map((e) => [e.profilId, e.profilNom])).entries()].sort((a, b) => a[1].localeCompare(b[1], "fr")), [toutes]);
  const finalites = useMemo(() => [...new Set(toutes.map((e) => e.finalite))], [toutes]);

  const filtrees = useMemo(() => {
    const q = normaliser(recherche.trim());
    return toutes.filter((e) =>
      (decision === "tous" || (decision === "autorises" ? e.autorise : !e.autorise)) &&
      (origine === "tout" || (origine === "seance" ? !e.simule : !!e.simule)) &&
      (profil === "tous" || e.profilId === profil) &&
      (finalite === "toutes" || e.finalite === finalite) &&
      (!q || [e.profilNom, e.action, e.ressource, FINALITE_LIBELLE[e.finalite]].some((t) => normaliser(t).includes(q))),
    );
  }, [toutes, recherche, decision, origine, profil, finalite]);

  const refus = toutes.filter((e) => !e.autorise);
  const refusSeance = audit.filter((e) => !e.autorise).length;
  const parCritere = (["role", "perimetre", "relation", "finalite"] as Critere[]).map((c) => ({ c, n: refus.filter((e) => e.critereManquant === c).length }));
  const maxCritere = Math.max(1, ...parCritere.map((x) => x.n));
  const filtresActifs = decision !== "tous" || origine !== "tout" || profil !== "tous" || finalite !== "toutes" || recherche !== "";

  const tenterAcces = () => {
    const a = monde.apprenants[7] ?? monde.apprenants[0];
    if (!a) return;
    acces.demander({ ressource: { type: "dossier_apprenant", apprenantId: a.id }, finalite: "audit" }, "Consultation d'un dossier d'apprenant", `Dossier ${a.id}`);
  };
  const reinitialiserFiltres = () => { setRecherche(""); setDecision("tous"); setOrigine("tout"); setProfil("tous"); setFinalite("toutes"); };

  return (
    <div className="space-y-6">
      <PageHeader
        surtitre="Conformité · P11 · P14"
        titre="Journal d'audit"
        sousTitre="Qui a demandé quelle donnée, pour quelle finalité, et avec quelle décision. Le journal est en ajout seul : aucune entrée ne peut être modifiée ni supprimée."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TuileIndicateur libelle="Entrées" icone={ScrollText} accent="bleu" valeur={entier(toutes.length)} indice={`${entier(audit.length)} pendant la séance`} />
        <TuileIndicateur libelle="Accès refusés" icone={ShieldX} accent="critique" valeur={entier(refus.length)} indice={`${entier(refusSeance)} pendant la séance`} />
        <TuileIndicateur libelle="Part de refus" icone={FileLock2} accent="ambre" valeur={nombre(toutes.length ? (refus.length / toutes.length) * 100 : 0, 0)} unite="%" indice="de toutes les demandes" />
        <TuileIndicateur libelle="Dernière décision" icone={ShieldCheck} accent="sarcelle" valeur={toutes[0] ? heure(toutes[0].horodatage) : "—"} indice={toutes[0] ? `${date(toutes[0].horodatage)} · ${toutes[0].profilNom}` : "aucune"} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className="border-blue/25 bg-blue-soft/50">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface text-accent-ink shadow-soft"><Lock size={19} aria-hidden /></span>
            <div className="min-w-0">
              <p className="font-display text-[16px] font-bold text-ink">Le refus est journalisé au même titre que l'autorisation</p>
              <p className="mt-1.5 text-[14px] text-ink-2">
                Chaque demande d'accès à une donnée est jugée sur quatre critères : le <strong className="text-ink">rôle</strong>, le <strong className="text-ink">périmètre</strong>,
                la <strong className="text-ink">relation</strong> avec la personne concernée et la <strong className="text-ink">finalité</strong> déclarée. La décision, accordée
                ou refusée, est inscrite ici avec le critère manquant. Votre propre consultation de ce journal y figure aussi.
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader icon={UserRoundSearch} title="Générer des entrées" subtitle="Pour voir le journal réagir en direct" />
          <ol className="list-decimal space-y-1.5 pl-5 text-[13px] text-ink-2">
            <li>Changez de profil (en haut à droite), par exemple l'enseignant.</li>
            <li>Tentez d'ouvrir le dossier d'un élève qui n'est pas dans ses classes, ou posez une question hors périmètre à Ask Education.</li>
            <li>Revenez sur ce profil : la décision et le critère manquant sont là.</li>
          </ol>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variante="secondaire" taille="sm" icone={ArrowRightLeft} onClick={tenterAcces}>Tenter d'ouvrir un dossier d'apprenant</Button>
          </div>
          <p className="mt-2 text-[12px] text-ink-muted">Le profil DPO contrôle les accès : il n'a lui-même aucun droit sur les dossiers. Cette tentative sera refusée et journalisée.</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <Card className="min-w-0 p-0">
          <div className="space-y-3 border-b border-line/60 px-5 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <div className="min-w-0 flex-1">
                <label htmlFor="recherche-audit" className="text-[12px] font-semibold text-ink-2">Rechercher</label>
                <div className="relative mt-1.5">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
                  <input
                    id="recherche-audit"
                    type="search"
                    value={recherche}
                    onChange={(e) => setRecherche(e.target.value)}
                    placeholder="Personne, action, dossier…"
                    className="h-10 w-full rounded-sm border border-line bg-surface pl-9 pr-3 text-[14px] text-ink placeholder:text-ink-muted"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex">
                <div className="min-w-0">
                  <label htmlFor="filtre-profil" className="mb-1.5 block text-[12px] font-semibold text-ink-2">Profil</label>
                  <select id="filtre-profil" value={profil} onChange={(e) => setProfil(e.target.value)} className="h-10 w-full rounded-sm border border-line bg-surface px-3 text-[13.5px] text-ink lg:w-48">
                    <option value="tous">Tous les profils</option>
                    {profils.map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
                  </select>
                </div>
                <div className="min-w-0">
                  <label htmlFor="filtre-finalite" className="mb-1.5 block text-[12px] font-semibold text-ink-2">Finalité</label>
                  <select id="filtre-finalite" value={finalite} onChange={(e) => setFinalite(e.target.value as Finalite | "toutes")} className="h-10 w-full rounded-sm border border-line bg-surface px-3 text-[13.5px] text-ink lg:w-52">
                    <option value="toutes">Toutes les finalités</option>
                    {finalites.map((f) => <option key={f} value={f}>{FINALITE_LIBELLE[f]}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Segmente
                label="Décision"
                options={[{ valeur: "tous", libelle: "Toutes" }, { valeur: "autorises", libelle: "Accordées" }, { valeur: "refuses", libelle: `Refusées (${refus.length})` }]}
                valeur={decision}
                onChange={setDecision}
              />
              <Segmente
                label="Origine"
                options={[{ valeur: "tout", libelle: "Tout" }, { valeur: "seance", libelle: "Séance" }, { valeur: "historique", libelle: "Historique" }]}
                valeur={origine}
                onChange={setOrigine}
              />
              {filtresActifs && (
                <button onClick={reinitialiserFiltres} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-blue hover:underline"><X size={13} aria-hidden /> Effacer</button>
              )}
            </div>
          </div>

          <p className="px-5 pt-3 text-[12.5px] text-ink-muted" aria-live="polite">{filtrees.length} entrée{filtrees.length > 1 ? "s" : ""} affichée{filtrees.length > 1 ? "s" : ""}</p>

          {filtrees.length ? (
            <ul className="divide-y divide-line/60">
              {filtrees.map((e, i) => <LigneAudit key={e.id} e={e} i={i} />)}
            </ul>
          ) : (
            <EtatVide
              icone={ScrollText}
              titre={origine === "seance" && !audit.length ? "Aucune décision pendant cette séance" : "Aucune entrée ne correspond"}
              texte="Pour générer des entrées : changez de profil, tentez d'ouvrir un dossier ou posez une question à Ask Education, puis revenez ici. Chaque décision, accordée ou refusée, apparaît aussitôt."
              action={filtresActifs ? <Button variante="secondaire" taille="sm" icone={X} onClick={reinitialiserFiltres}>Effacer les filtres</Button> : undefined}
            />
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader icon={ShieldX} title="Refus par critère manquant" subtitle={`${entier(refus.length)} refus au total`} />
          <ul className="space-y-3">
            {parCritere.map(({ c, n }) => (
              <li key={c}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold text-ink">{CRITERE_LIBELLE[c]}</span>
                  <span className="text-[13px] font-semibold tabular text-ink">{entier(n)}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  <div className="h-full rounded-full bg-critical/80" style={{ width: `${(n / maxCritere) * 100}%` }} />
                </div>
                <p className="mt-1 text-[11.5px] text-ink-muted">{CRITERE_AIDE[c]}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Ligne du journal */

function LigneAudit({ e, i }: { e: Entree; i: number }) {
  return (
    <li className={cn("animate-row grid gap-x-4 gap-y-1.5 px-5 py-3 sm:grid-cols-[6.5rem_minmax(0,1fr)_auto]", !e.autorise && "bg-critical-bg/30")} style={{ animationDelay: `${Math.min(i, 15) * 20}ms` }}>
      <div className="flex items-center gap-2 sm:block">
        <p className="font-mono text-[12.5px] tabular text-ink">{heure(e.horodatage)}</p>
        <p className="text-[11.5px] tabular text-ink-muted">{date(e.horodatage)}</p>
      </div>
      <div className="min-w-0">
        <p className="text-[13.5px] text-ink">
          <span className="font-semibold">{e.profilNom}</span> <span className="text-ink-2">· {e.action}</span>
        </p>
        <p className="mt-0.5 truncate text-[12.5px] text-ink-muted">
          <span className="sr-only">Ressource : </span>{e.ressource}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge ton="neutre">{FINALITE_LIBELLE[e.finalite]}</Badge>
          {e.critereManquant && <Badge ton="critique">Critère manquant : {CRITERE_LIBELLE[e.critereManquant]}</Badge>}
          {e.base ? <Badge ton="succes">Base nationale</Badge> : e.simule ? <Badge ton="avertissement">Historique simulé</Badge> : <Badge ton="info">Séance en cours</Badge>}
        </div>
      </div>
      <div className="sm:text-right">
        {e.autorise ? <Badge ton="succes" icone={ShieldCheck}>Accordé</Badge> : <Badge ton="critique" icone={ShieldX}>Refusé</Badge>}
        <Etiquette className="mt-1 hidden font-mono normal-case tracking-normal sm:block">{e.id.slice(0, 12)}</Etiquette>
      </div>
    </li>
  );
}

function normaliser(t: string) {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
