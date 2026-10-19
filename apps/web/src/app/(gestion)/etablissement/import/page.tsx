"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileSpreadsheet, FileWarning, ListChecks, Upload } from "lucide-react";
import { useMemo, useState, type ChangeEvent } from "react";
import { EntreePage } from "@/components/motion";
import { notifier } from "@/components/ui/Notifications";
import { Badge, Button, Card, CardHeader, EtatVide, PageHeader, type Ton } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { exporterCsv, telechargerCsv } from "@/lib/export";
import { ecrire } from "@/lib/http";
import { COLONNES_MODELE, lireListe, MAX_LIGNES, MAX_OCTETS, MODELE_CSV, type Lecture } from "@/lib/importListe";
import { useEtablissementCourant } from "@/lib/session";
import { classeChamp, classeSelect, HorsPerimetre } from "../_composants";

type Statut = "a_inscrire" | "inscrit" | "deja_inscrit" | "erreur";
interface LigneRapport { n: number; statut: Statut; motif?: string; classe: string; apprenantId?: string; nouvelleClasse?: boolean }
interface Reponse {
  mode: "simulation" | "import"; ecrit: boolean;
  totaux: { lignes: number; aInscrire: number; dejaInscrits: number; erreurs: number; inscrits?: number };
  classesACreer: { libelle: string; niveau: string }[];
  lignes: LigneRapport[];
}

const LIBELLE: Record<Statut, [string, Ton]> = {
  a_inscrire: ["À inscrire", "info"], inscrit: ["Inscrit", "succes"], deja_inscrit: ["Déjà inscrit", "neutre"], erreur: ["Refusée", "critique"],
};

/** Années proposées : la précédente, l'en cours (rentrée en septembre) et la suivante. L'API dit lesquelles sont ouvertes. */
function annees() {
  const j = new Date();
  const debut = j.getFullYear() - (j.getMonth() < 8 ? 1 : 0);
  return [debut - 1, debut, debut + 1].map((a) => `${a}-${a + 1}`);
}
const nouvelId = () => `IMP-${crypto.randomUUID()}`;

export default function Page() {
  const id = useEtablissementCourant();
  return <EntreePage>{id ? <ImportListe id={id} /> : <HorsPerimetre />}</EntreePage>;
}

function ImportListe({ id }: { id: string }) {
  const client = useQueryClient();
  const choix = annees();
  const [annee, setAnnee] = useState(choix[1]!);
  const [creerClasses, setCreerClasses] = useState(false);
  const [capacite, setCapacite] = useState(60);
  const [fichier, setFichier] = useState<string | null>(null);
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [erreurFichier, setErreurFichier] = useState<string | null>(null);
  const [rapport, setRapport] = useState<Reponse | null>(null);
  const [idImport, setIdImport] = useState(nouvelId);
  const [filtre, setFiltre] = useState<Statut | "toutes">("toutes");

  const envoyables = useMemo(() => (lecture?.lignes ?? []).flatMap((l) => (l.ligne ? [l.ligne] : [])), [lecture]);
  const appel = useMutation({
    mutationFn: (mode: "simulation" | "import") => ecrire<Reponse>(`/etablissements/${encodeURIComponent(id)}/import/eleves`, {
      mode, anneeScolaire: annee, creerClasses, capaciteNouvellesClasses: capacite, idImport, lignes: envoyables,
    }),
    onSuccess: (r) => {
      setRapport(r);
      setFiltre(r.totaux.erreurs ? "erreur" : "toutes");
      if (r.mode === "import" && r.ecrit) {
        notifier({ ton: "succes", titre: "Import terminé", texte: `${r.totaux.inscrits ?? 0} élève(s) inscrit(s). Chaque inscription est au registre et la famille est prévenue.` });
        setIdImport(nouvelId());
        void client.invalidateQueries({ queryKey: ["etablissement"] });
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
    if (!/\.(csv|txt)$/i.test(f.name)) { setErreurFichier("Format attendu : CSV. Dans Excel : Fichier › Enregistrer sous › « CSV UTF-8 » ou « CSV (séparateur : point-virgule) »."); return; }
    const l = lireListe(await f.arrayBuffer());
    if (l.colonnesManquantes.length) { setErreurFichier(`Colonnes introuvables : ${l.colonnesManquantes.join(", ")}. Partez du modèle.`); return; }
    if (!l.lignes.length) { setErreurFichier("Aucune ligne d'élève dans le fichier."); return; }
    if (l.lignes.length > MAX_LIGNES) { setErreurFichier(`${l.lignes.length} lignes : ${MAX_LIGNES} au plus par import. Découpez le fichier (par niveau, par exemple).`); return; }
    setFichier(f.name); setLecture(l); setIdImport(nouvelId());
  };

  // Rapport complet : erreurs de lecture (jamais envoyées) + verdict de l'API, dans l'ordre du fichier.
  const lignesRapport = useMemo(() => {
    if (!lecture) return [];
    const serveur = new Map((rapport?.lignes ?? []).map((l) => [l.n, l]));
    return lecture.lignes.map((l) => {
      const s = serveur.get(l.n);
      const statut: Statut | null = l.erreur ? "erreur" : s?.statut ?? null;
      return { n: l.n, brut: l.brut, statut, motif: l.erreur ?? s?.motif, nouvelleClasse: s?.nouvelleClasse };
    });
  }, [lecture, rapport]);
  const erreursLecture = lecture?.lignes.filter((l) => l.erreur).length ?? 0;
  const compte = (s: Statut) => lignesRapport.filter((l) => l.statut === s).length;
  const visibles = filtre === "toutes" ? lignesRapport : lignesRapport.filter((l) => l.statut === filtre);
  const importable = rapport?.mode === "simulation" && rapport.totaux.aInscrire > 0;

  const exporterRefusees = () => exporterCsv(
    `import_refusees_${id}`,
    lignesRapport.filter((l) => l.statut === "erreur"),
    [...COLONNES_MODELE.map((c) => ({ entete: c, valeur: (l: (typeof lignesRapport)[number]) => l.brut[c] ?? "" })), { entete: "motif", valeur: (l) => l.motif ?? "" }],
    `Lignes refusées à l'import — ${annee} — corriger puis réimporter (la colonne motif est ignorée)`,
  );

  return (
    <div className="space-y-5">
      <PageHeader surtitre="Établissement" titre="Importer une liste d'élèves"
        sousTitre="Basculez une classe ou l'école entière en une fois. Le fichier reste sur votre appareil ; BEILE vérifie chaque ligne au registre national avant toute inscription." />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card className="min-w-0">
          <CardHeader icon={FileSpreadsheet} title="1. Préparer le fichier" subtitle="Une ligne par élève, au format CSV (Excel : « Enregistrer sous » › CSV)." />
          <ul className="space-y-1.5 text-[13.5px] text-ink-2">
            <li><b className="text-ink">classe</b>, <b className="text-ink">nom</b>, <b className="text-ink">prenoms</b> : obligatoires.</li>
            <li><b className="text-ink">npi</b> : avec lui, l&apos;identité et les parents viennent du registre national ; le nom doit concorder.</li>
            <li>Sans NPI : <b className="text-ink">sexe</b> (F/M) et <b className="text-ink">date_naissance</b> (JJ/MM/AAAA) ; une régularisation d&apos;identité est ouverte.</li>
            <li><b className="text-ink">niveau</b> : seulement pour une classe qui n&apos;existe pas encore (6e, 5e, 2nde, Tle…).</li>
          </ul>
          <Button className="mt-4" variante="secondaire" icone={Download} onClick={() => telechargerCsv("modele_import_eleves", MODELE_CSV)}>Télécharger le modèle</Button>
          <p className="mt-2 text-[12px] text-ink-muted">Les deux lignes d&apos;exemple du modèle sont fictives : remplacez-les.</p>
        </Card>

        <Card className="min-w-0">
          <CardHeader icon={Upload} title="2. Déposer et vérifier" subtitle="La vérification n'écrit rien. Vous importez ensuite les seules lignes valides." />
          <div className="grid gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">Année scolaire</span>
              <select value={annee} onChange={(e) => { setAnnee(e.target.value); reinitialiser(); }} className={classeSelect} aria-label="Année scolaire">
                {choix.map((a) => <option key={a} value={a}>{a}</option>)}
              </select></label>
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">Fichier CSV</span>
              <input type="file" accept=".csv,text/csv,.txt" onChange={choisir} className={cn(classeChamp, "py-1.5 file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-[13px]")} aria-label="Fichier CSV" /></label>
          </div>
          <label className="mt-3 flex items-start gap-2 text-[13.5px] text-ink-2">
            <input type="checkbox" checked={creerClasses} onChange={(e) => { setCreerClasses(e.target.checked); reinitialiser(); }} className="mt-0.5" />
            <span>Créer les classes absentes pour {annee} (la ligne doit indiquer le niveau), capacité
              <input type="number" min={10} max={200} value={capacite} onChange={(e) => { setCapacite(Math.min(200, Math.max(10, Number(e.target.value) || 60))); reinitialiser(); }} className="mx-1.5 w-16 rounded border border-line bg-surface px-1.5 py-0.5 text-[13px]" aria-label="Capacité des classes créées" />
              élèves.</span>
          </label>
          {erreurFichier && <p role="alert" className="mt-3 rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">{erreurFichier}</p>}
          {lecture && (
            <p className="mt-3 text-[13px] text-ink-2">
              <b className="text-ink">{fichier}</b> : {lecture.lignes.length} ligne(s) lue(s) ({lecture.encodage}, séparateur « {lecture.separateur} »)
              {erreursLecture > 0 && <> — <span className="text-critical">{erreursLecture} à corriger avant envoi</span></>}.
            </p>
          )}
          {appel.error && <p role="alert" className="mt-3 rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">{appel.error.message}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variante="secondaire" icone={ListChecks} disabled={!envoyables.length} chargement={appel.isPending && appel.variables === "simulation"} onClick={() => appel.mutate("simulation")}>Vérifier {envoyables.length ? `${envoyables.length} ligne(s)` : ""}</Button>
            <Button variante="primaire" icone={CheckCircle2} disabled={!importable} chargement={appel.isPending && appel.variables === "import"} onClick={() => appel.mutate("import")}>
              Importer {rapport?.mode === "simulation" ? `${rapport.totaux.aInscrire} élève(s)` : ""}
            </Button>
          </div>
        </Card>
      </div>

      {lecture && (
        <Card className="min-w-0">
          <CardHeader icon={rapport?.ecrit ? CheckCircle2 : ListChecks} title={rapport ? (rapport.ecrit ? "3. Résultat de l'import" : "3. Rapport de vérification") : "3. Rapport"}
            subtitle={rapport ? (rapport.ecrit ? "Les lignes refusées n'ont pas été inscrites : corrigez-les et réimportez le fichier, les élèves déjà inscrits seront reconnus." : "Rien n'est encore inscrit.") : "Lancez la vérification pour obtenir le verdict de chaque ligne."} />
          {rapport && rapport.classesACreer.length > 0 && (
            <p className="mb-3 rounded-md bg-info-bg px-3 py-2 text-[13px] text-ink-2">
              {rapport.ecrit ? "Classes créées" : "Classes qui seront créées"} : {rapport.classesACreer.map((c) => `${c.libelle} (${c.niveau})`).join(", ")}.
            </p>
          )}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {(["toutes", "erreur", rapport?.ecrit ? "inscrit" : "a_inscrire", "deja_inscrit"] as const).map((f) => (
              <button key={f} onClick={() => setFiltre(f)} aria-pressed={filtre === f}
                className={cn("rounded-full border px-3 py-1 text-[12.5px] font-medium", filtre === f ? "border-navy bg-navy text-white" : "border-line text-ink-2 hover:bg-surface-2")}>
                {f === "toutes" ? `Toutes (${lignesRapport.length})` : `${LIBELLE[f][0]} (${compte(f)})`}
              </button>
            ))}
            {compte("erreur") > 0 && <Button className="ml-auto" taille="sm" variante="secondaire" icone={FileWarning} onClick={() => void exporterRefusees()}>Lignes refusées (CSV)</Button>}
          </div>
          {!visibles.length ? <EtatVide icone={ListChecks} titre="Aucune ligne dans ce filtre" /> : (
            <div className="max-h-[480px] overflow-auto rounded-lg border border-line">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="sticky top-0 bg-surface-2 text-[11.5px] uppercase tracking-wide text-ink-muted">
                  <tr><th className="px-3 py-2">Ligne</th><th className="px-3 py-2">Élève</th><th className="px-3 py-2">Classe</th><th className="px-3 py-2">Verdict</th><th className="px-3 py-2">Motif</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visibles.slice(0, 500).map((l) => (
                    <tr key={l.n}>
                      <td className="px-3 py-1.5 tabular-nums text-ink-muted">{l.n}</td>
                      <td className="px-3 py-1.5 text-ink">{l.brut.nom} {l.brut.prenoms}{l.brut.npi ? <span className="ml-1 text-ink-muted">· NPI</span> : null}</td>
                      <td className="px-3 py-1.5">{l.brut.classe}{l.nouvelleClasse ? <Badge className="ml-1.5" ton="marque">nouvelle</Badge> : null}</td>
                      <td className="px-3 py-1.5">{l.statut ? <Badge ton={LIBELLE[l.statut][1]}>{LIBELLE[l.statut][0]}</Badge> : <span className="text-ink-muted">—</span>}</td>
                      <td className="px-3 py-1.5 text-ink-2">{l.motif ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visibles.length > 500 && <p className="px-3 py-2 text-[12px] text-ink-muted">500 premières lignes affichées sur {visibles.length} ; le fichier des lignes refusées les contient toutes.</p>}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
