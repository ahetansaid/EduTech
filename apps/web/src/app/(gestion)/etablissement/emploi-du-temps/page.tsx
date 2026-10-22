"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, Download, FileWarning, ListChecks, Plus, Trash2, Upload } from "lucide-react";
import { useMemo, useState, type ChangeEvent } from "react";
import { GrilleSemaine, type Seance } from "@/components/emploi/GrilleSemaine";
import { EntreePage } from "@/components/motion";
import { Modale } from "@/components/ui/Modale";
import { notifier } from "@/components/ui/Notifications";
import { Badge, Button, Card, CardHeader, EtatVide, PageHeader, Squelette, type Ton } from "@/components/ui/primitives";
import { useTableau } from "@/lib/api/etablissement";
import { cn } from "@/lib/cn";
import { exporterCsv, telechargerCsv } from "@/lib/export";
import { ecrire, lire } from "@/lib/http";
import { COLONNES_EDT, lireEmploiDuTemps, MAX_SEANCES, MODELE_EDT, type LectureEdt } from "@/lib/importEmploiDuTemps";
import { MAX_OCTETS } from "@/lib/importListe";
import { useEtablissementCourant } from "@/lib/session";
import { classeChamp, classeSelect, EtatErreur, HorsPerimetre } from "../_composants";

type Statut = "a_importer" | "deja_present" | "erreur";
interface LigneRapport { n: number; statut: Statut; classe: string; matiere?: string; enseignant?: string; motif?: string }
interface Reponse { mode: "simulation" | "import"; ecrit: boolean; totaux: { lignes: number; aImporter: number; dejaPresents: number; erreurs: number; classesRemplacees: number; coursRetires: number; coursEcrits?: number }; classes: string[]; lignes: LigneRapport[] }

const LIBELLE: Record<Statut, [string, Ton]> = { a_importer: ["À importer", "info"], deja_present: ["En place", "neutre"], erreur: ["Refusée", "critique"] };
function annees() {
  const j = new Date();
  const debut = j.getFullYear() - (j.getMonth() < 8 ? 1 : 0);
  return [debut - 1, debut, debut + 1].map((a) => `${a}-${a + 1}`);
}
const nouvelId = () => `EDT-${crypto.randomUUID()}`;

interface Service { enseignantId: string; matiere: string; enseignant: string }
interface Grille { modifiable: boolean; services?: Service[]; cours: Seance[] }
const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
interface Brouillon { id: string | null; jour: number; debut: string; fin: string; service: string; salle: string }
const cleService = (s: { enseignantId?: string; matiere: string }) => `${s.enseignantId ?? ""}|${s.matiere}`;

/**
 * Saisie d'une séance à l'écran (administration de l'école) : jour, horaires, service (couple matière × enseignant
 * de la classe) et salle. L'API refait tous les contrôles ; un chevauchement revient avec son motif exact.
 */
function EditionSeance({ etablissementId, classeId, classe, services, brouillon, fermer }: {
  etablissementId: string; classeId: string; classe: string; services: Service[]; brouillon: Brouillon; fermer: () => void;
}) {
  const client = useQueryClient();
  const [b, setB] = useState(brouillon);
  const base = `/etablissements/${encodeURIComponent(etablissementId)}/emploi-du-temps/seances`;
  const fini = (titre: string, texte: string) => {
    notifier({ ton: "succes", titre, texte });
    void client.invalidateQueries({ queryKey: ["etablissement", etablissementId, "emploi-du-temps"] });
    fermer();
  };
  const enregistrer = useMutation({
    mutationFn: () => {
      const [enseignantId, matiere] = b.service.split("|") as [string, string];
      const corps = { classeId, jour: b.jour, debut: b.debut, fin: b.fin, matiere, enseignantId, ...(b.salle.trim() ? { salle: b.salle.trim() } : {}) };
      return ecrire<{ matiere: string; debut: string; fin: string }>(b.id ? `${base}/${encodeURIComponent(b.id)}` : base, corps);
    },
    onSuccess: (r) => fini(b.id ? "Séance modifiée" : "Séance ajoutée", `${classe} · ${r.matiere} · ${JOURS[b.jour - 1]} ${r.debut}–${r.fin}.`),
  });
  const supprimer = useMutation({
    mutationFn: () => ecrire(`${base}/${encodeURIComponent(b.id!)}/supprimer`, {}),
    onSuccess: () => fini("Séance supprimée", `${classe} · ${JOURS[b.jour - 1]} ${b.debut}–${b.fin}.`),
  });
  const pret = !!b.service && /^\d{2}:\d{2}$/.test(b.debut) && /^\d{2}:\d{2}$/.test(b.fin) && b.debut < b.fin;
  const erreur = enregistrer.error ?? supprimer.error;
  return (
    <Modale ouvert onFermer={fermer} icone={CalendarClock} titre={b.id ? "Modifier la séance" : "Ajouter une séance"} sousTitre={classe}
      pied={(
        <div className="flex flex-wrap items-center justify-between gap-2">
          {b.id ? <Button variante="fantome" icone={Trash2} chargement={supprimer.isPending} onClick={() => supprimer.mutate()}>Supprimer</Button> : <span />}
          <div className="flex gap-2">
            <Button variante="fantome" onClick={fermer}>Annuler</Button>
            <Button variante="primaire" chargement={enregistrer.isPending} disabled={!pret} onClick={() => enregistrer.mutate()}>Enregistrer</Button>
          </div>
        </div>
      )}>
      <div className="space-y-3">
        {!services.length && <p role="status" className="rounded-md bg-warning-bg px-3 py-2 text-[13px] text-ink-2">Aucun service n&apos;est attribué dans cette classe : attribuez d&apos;abord les services (Services d&apos;enseignement).</p>}
        <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">Matière et enseignant</span>
          <select value={b.service} onChange={(e) => setB({ ...b, service: e.target.value })} className={classeSelect} aria-label="Matière et enseignant">
            <option value="">Choisir un service de la classe…</option>
            {services.map((s) => <option key={cleService(s)} value={cleService(s)}>{s.matiere} — {s.enseignant}</option>)}
          </select></label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">Jour</span>
            <select value={b.jour} onChange={(e) => setB({ ...b, jour: Number(e.target.value) })} className={classeSelect} aria-label="Jour">
              {JOURS.map((j, i) => <option key={j} value={i + 1}>{j}</option>)}
            </select></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">Début</span>
            <input type="time" min="06:00" max="20:00" step={300} value={b.debut} onChange={(e) => setB({ ...b, debut: e.target.value })} className={classeChamp} aria-label="Début" /></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">Fin</span>
            <input type="time" min="06:00" max="20:00" step={300} value={b.fin} onChange={(e) => setB({ ...b, fin: e.target.value })} className={classeChamp} aria-label="Fin" /></label>
        </div>
        <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">Salle (facultative)</span>
          <input value={b.salle} maxLength={30} onChange={(e) => setB({ ...b, salle: e.target.value })} placeholder="Ex. Salle 4" className={classeChamp} aria-label="Salle" /></label>
        {erreur && <p role="alert" className="rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">{erreur.message}</p>}
      </div>
    </Modale>
  );
}

export default function Page() {
  const id = useEtablissementCourant();
  return <EntreePage>{id ? <EmploiDuTemps id={id} /> : <HorsPerimetre />}</EntreePage>;
}

function EmploiDuTemps({ id }: { id: string }) {
  const client = useQueryClient();
  const tableau = useTableau(id);
  const [classeId, setClasseId] = useState("");
  const classes = tableau.data?.classes ?? [];
  const classeVue = classeId || classes[0]?.id || "";
  const grille = useQuery({
    queryKey: ["etablissement", id, "emploi-du-temps", classeVue],
    queryFn: ({ signal }) => lire<Grille>(`/etablissements/${encodeURIComponent(id)}/emploi-du-temps?classe=${encodeURIComponent(classeVue)}`, signal),
    enabled: !!classeVue,
  });
  const [edition, setEdition] = useState<Brouillon | null>(null);
  const libelleVue = classes.find((c) => c.id === classeVue)?.libelle ?? "";
  const modifiable = !!grille.data?.modifiable;

  const choix = annees();
  const [annee, setAnnee] = useState(choix[1]!);
  const [fichier, setFichier] = useState<string | null>(null);
  const [lecture, setLecture] = useState<LectureEdt | null>(null);
  const [erreurFichier, setErreurFichier] = useState<string | null>(null);
  const [rapport, setRapport] = useState<Reponse | null>(null);
  const [idImport, setIdImport] = useState(nouvelId);
  const [filtre, setFiltre] = useState<Statut | "toutes">("toutes");
  const envoyables = useMemo(() => (lecture?.lignes ?? []).flatMap((l) => (l.ligne ? [l.ligne] : [])), [lecture]);
  const appel = useMutation({
    mutationFn: (mode: "simulation" | "import") => ecrire<Reponse>(`/etablissements/${encodeURIComponent(id)}/import/emploi-du-temps`, { mode, anneeScolaire: annee, idImport, lignes: envoyables }),
    onSuccess: (r) => {
      setRapport(r); setFiltre(r.totaux.erreurs ? "erreur" : "toutes");
      if (r.mode === "import" && r.ecrit) {
        notifier({ ton: "succes", titre: "Emploi du temps enregistré", texte: `${r.totaux.coursEcrits ?? 0} séance(s) pour ${r.classes.length} classe(s). Les enseignants le voient dans « Mon emploi du temps ».` });
        setIdImport(nouvelId());
        void client.invalidateQueries({ queryKey: ["etablissement", id, "emploi-du-temps"] });
      }
    },
  });
  const reinitialiser = () => { setRapport(null); appel.reset(); };
  const choisir = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    reinitialiser(); setLecture(null); setErreurFichier(null); setFichier(null);
    if (!f) return;
    if (f.size > MAX_OCTETS) { setErreurFichier("Fichier trop volumineux (2 Mo au plus)."); return; }
    if (!/\.(csv|txt)$/i.test(f.name)) { setErreurFichier("Format attendu : CSV (Excel : Fichier › Enregistrer sous › CSV)."); return; }
    const l = lireEmploiDuTemps(await f.arrayBuffer());
    if (l.colonnesManquantes.length) { setErreurFichier(`Colonnes introuvables : ${l.colonnesManquantes.join(", ")}. Partez du modèle.`); return; }
    if (!l.lignes.length) { setErreurFichier("Aucune séance dans le fichier."); return; }
    if (l.lignes.length > MAX_SEANCES) { setErreurFichier(`${l.lignes.length} lignes : ${MAX_SEANCES} au plus par import.`); return; }
    setFichier(f.name); setLecture(l); setIdImport(nouvelId());
  };
  const lignesRapport = useMemo(() => {
    if (!lecture) return [];
    const serveur = new Map((rapport?.lignes ?? []).map((l) => [l.n, l]));
    return lecture.lignes.map((l) => { const s = serveur.get(l.n); return { n: l.n, brut: l.brut, statut: (l.erreur ? "erreur" : s?.statut ?? null) as Statut | null, motif: l.erreur ?? s?.motif, enseignant: s?.enseignant, matiere: s?.matiere }; });
  }, [lecture, rapport]);
  const compte = (s: Statut) => lignesRapport.filter((l) => l.statut === s).length;
  const visibles = filtre === "toutes" ? lignesRapport : lignesRapport.filter((l) => l.statut === filtre);
  const importable = rapport?.mode === "simulation" && rapport.totaux.classesRemplacees > 0;

  return (
    <div className="space-y-5">
      <PageHeader surtitre="Établissement" titre="Emploi du temps"
        sousTitre="Déposez l'emploi du temps que vous utilisez déjà : BEILE vérifie chaque séance (service de l'enseignant, chevauchements de classe, d'enseignant et de salle) avant de l'enregistrer." />

      <Card className="min-w-0">
        <CardHeader icon={CalendarClock} title="Semaine type" subtitle="Lecture réservée à l'établissement et à son inspection." />
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <label className="block w-full max-w-xs"><span className="mb-1.5 block text-sm font-medium text-ink">Classe</span>
            <select value={classeVue} onChange={(e) => setClasseId(e.target.value)} className={classeSelect} aria-label="Classe affichée">
              {classes.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
            </select></label>
          {modifiable && <Button variante="primaire" icone={Plus} onClick={() => setEdition({ id: null, jour: 1, debut: "07:00", fin: "08:00", service: "", salle: "" })}>Ajouter une séance</Button>}
        </div>
        {modifiable && <p className="mb-3 text-[12.5px] text-ink-muted">Cliquez sur une séance pour la modifier ou la supprimer.</p>}
        {tableau.isPending || grille.isPending ? <Squelette className="h-48 rounded-xl" /> : grille.isError ? <EtatErreur erreur={grille.error} /> : (
          <GrilleSemaine seances={grille.data?.cours ?? []} afficher="enseignant"
            onChoisir={modifiable ? (s) => setEdition({ id: s.id, jour: s.jour, debut: s.debut, fin: s.fin, service: cleService(s), salle: s.salle ?? "" }) : undefined} />
        )}
      </Card>
      {edition && classeVue && (
        <EditionSeance etablissementId={id} classeId={classeVue} classe={libelleVue} services={grille.data?.services ?? []} brouillon={edition} fermer={() => setEdition(null)} />
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card className="min-w-0">
          <CardHeader icon={ListChecks} title="1. Préparer le fichier" subtitle="Une ligne par séance hebdomadaire, au format CSV." />
          <ul className="space-y-1.5 text-[13.5px] text-ink-2">
            <li><b className="text-ink">classe</b>, <b className="text-ink">jour</b> (lundi à samedi), <b className="text-ink">debut</b> et <b className="text-ink">fin</b> (07:30), <b className="text-ink">matiere</b>.</li>
            <li><b className="text-ink">enseignant</b> ou <b className="text-ink">npi_enseignant</b> : il doit avoir le service de cette matière dans cette classe (importez d&apos;abord les services).</li>
            <li><b className="text-ink">salle</b> : facultative ; deux classes ne peuvent pas l&apos;occuper en même temps.</li>
            <li>Chaque classe du fichier reçoit exactement les séances listées ; une classe dont une ligne est refusée garde son emploi du temps actuel.</li>
          </ul>
          <Button className="mt-4" variante="secondaire" icone={Download} onClick={() => telechargerCsv("modele_emploi_du_temps", MODELE_EDT)}>Télécharger le modèle</Button>
        </Card>
        <Card className="min-w-0">
          <CardHeader icon={Upload} title="2. Déposer et vérifier" subtitle="La vérification n'écrit rien." />
          <div className="grid gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">Année scolaire</span>
              <select value={annee} onChange={(e) => { setAnnee(e.target.value); reinitialiser(); }} className={classeSelect} aria-label="Année scolaire">
                {choix.map((a) => <option key={a} value={a}>{a}</option>)}
              </select></label>
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">Fichier CSV</span>
              <input type="file" accept=".csv,text/csv,.txt" onChange={choisir} className={cn(classeChamp, "py-1.5 file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-[13px]")} aria-label="Fichier CSV" /></label>
          </div>
          {erreurFichier && <p role="alert" className="mt-3 rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">{erreurFichier}</p>}
          {lecture && <p className="mt-3 text-[13px] text-ink-2"><b className="text-ink">{fichier}</b> : {lecture.lignes.length} séance(s) lue(s) ({lecture.encodage}, séparateur « {lecture.separateur} »).</p>}
          {appel.error && <p role="alert" className="mt-3 rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">{appel.error.message}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variante="secondaire" icone={ListChecks} disabled={!envoyables.length} chargement={appel.isPending && appel.variables === "simulation"} onClick={() => appel.mutate("simulation")}>Vérifier {envoyables.length ? `${envoyables.length} séance(s)` : ""}</Button>
            <Button variante="primaire" icone={CheckCircle2} disabled={!importable} chargement={appel.isPending && appel.variables === "import"} onClick={() => appel.mutate("import")}>Enregistrer l&apos;emploi du temps</Button>
          </div>
        </Card>
      </div>

      {lecture && (
        <Card className="min-w-0">
          <CardHeader icon={rapport?.ecrit ? CheckCircle2 : ListChecks} title={rapport ? (rapport.ecrit ? "3. Résultat" : "3. Rapport de vérification") : "3. Rapport"}
            subtitle={rapport ? (rapport.ecrit ? `Enregistré pour : ${rapport.classes.join(", ")}.` : rapport.classes.length ? `Classes qui seront remplacées : ${rapport.classes.join(", ")}.` : "Aucune classe ne change.") : "Lancez la vérification pour obtenir le verdict de chaque séance."} />
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {(["toutes", "erreur", "a_importer", "deja_present"] as const).map((f) => (
              <button key={f} onClick={() => setFiltre(f)} aria-pressed={filtre === f}
                className={cn("rounded-full border px-3 py-1 text-[12.5px] font-medium", filtre === f ? "border-navy bg-navy text-white" : "border-line text-ink-2 hover:bg-surface-2")}>
                {f === "toutes" ? `Toutes (${lignesRapport.length})` : `${LIBELLE[f][0]} (${compte(f)})`}
              </button>
            ))}
            {compte("erreur") > 0 && (
              <Button className="ml-auto" taille="sm" variante="secondaire" icone={FileWarning} onClick={() => void exporterCsv(`emploi_du_temps_refuse_${id}`, lignesRapport.filter((l) => l.statut === "erreur"),
                [...COLONNES_EDT.map((c) => ({ entete: c, valeur: (l: (typeof lignesRapport)[number]) => l.brut[c] ?? "" })), { entete: "motif", valeur: (l) => l.motif ?? "" }],
                `Séances refusées — ${annee}`)}>Lignes refusées (CSV)</Button>
            )}
          </div>
          {!visibles.length ? <EtatVide icone={ListChecks} titre="Aucune ligne dans ce filtre" /> : (
            <div className="max-h-[480px] overflow-auto rounded-lg border border-line">
              <table className="w-full min-w-[720px] text-left text-[13px]">
                <thead className="sticky top-0 bg-surface-2 text-[11.5px] uppercase tracking-wide text-ink-muted">
                  <tr><th className="px-3 py-2">Ligne</th><th className="px-3 py-2">Classe</th><th className="px-3 py-2">Séance</th><th className="px-3 py-2">Matière</th><th className="px-3 py-2">Enseignant</th><th className="px-3 py-2">Verdict</th><th className="px-3 py-2">Motif</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visibles.map((l) => (
                    <tr key={l.n}>
                      <td className="px-3 py-1.5 tabular-nums text-ink-muted">{l.n}</td>
                      <td className="px-3 py-1.5">{l.brut.classe}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{l.brut.jour} {l.brut.debut}–{l.brut.fin}</td>
                      <td className="px-3 py-1.5">{l.matiere ?? l.brut.matiere}</td>
                      <td className="px-3 py-1.5 text-ink">{l.enseignant ?? l.brut.enseignant ?? (l.brut.npi_enseignant ? "NPI fourni" : "")}</td>
                      <td className="px-3 py-1.5">{l.statut ? <Badge ton={LIBELLE[l.statut][1]}>{LIBELLE[l.statut][0]}</Badge> : <span className="text-ink-muted">—</span>}</td>
                      <td className="px-3 py-1.5 text-ink-2">{l.motif ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
