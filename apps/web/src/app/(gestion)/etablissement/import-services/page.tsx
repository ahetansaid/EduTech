"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileWarning, ListChecks, Upload, UsersRound } from "lucide-react";
import { useMemo, useState, type ChangeEvent } from "react";
import { EntreePage } from "@/components/motion";
import { notifier } from "@/components/ui/Notifications";
import { Badge, Button, Card, CardHeader, EtatVide, PageHeader, type Ton } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { exporterCsv, telechargerCsv } from "@/lib/export";
import { ecrire } from "@/lib/http";
import { MAX_OCTETS } from "@/lib/importListe";
import { COLONNES_SERVICES, lireServices, MAX_SERVICES, MODELE_SERVICES, type LectureServices } from "@/lib/importServices";
import { useEtablissementCourant } from "@/lib/session";
import { classeChamp, classeSelect, HorsPerimetre } from "../_composants";

type Statut = "a_attribuer" | "attribue" | "deja_attribue" | "erreur";
interface LigneRapport { n: number; statut: Statut; classe: string; matiere?: string; enseignant?: string; motif?: string; avertissement?: string; principal?: boolean }
interface Retrait { classe: string; matiere: string; enseignant: string }
interface Reponse {
  mode: "simulation" | "import"; ecrit: boolean;
  totaux: { lignes: number; aAttribuer: number; dejaAttribues: number; erreurs: number; retraits: number; principaux: number; attribues?: number; retires?: number };
  retraits: Retrait[];
  lignes: LigneRapport[];
}

const LIBELLE: Record<Statut, [string, Ton]> = {
  a_attribuer: ["À attribuer", "info"], attribue: ["Attribué", "succes"], deja_attribue: ["Déjà attribué", "neutre"], erreur: ["Refusée", "critique"],
};
function annees() {
  const j = new Date();
  const debut = j.getFullYear() - (j.getMonth() < 8 ? 1 : 0);
  return [debut - 1, debut, debut + 1].map((a) => `${a}-${a + 1}`);
}
const nouvelId = () => `SRV-${crypto.randomUUID()}`;

export default function Page() {
  const id = useEtablissementCourant();
  return <EntreePage>{id ? <ImportServices id={id} /> : <HorsPerimetre />}</EntreePage>;
}

function ImportServices({ id }: { id: string }) {
  const client = useQueryClient();
  const choix = annees();
  const [annee, setAnnee] = useState(choix[1]!);
  const [remplacer, setRemplacer] = useState(false);
  const [fichier, setFichier] = useState<string | null>(null);
  const [lecture, setLecture] = useState<LectureServices | null>(null);
  const [erreurFichier, setErreurFichier] = useState<string | null>(null);
  const [rapport, setRapport] = useState<Reponse | null>(null);
  const [idImport, setIdImport] = useState(nouvelId);
  const [filtre, setFiltre] = useState<Statut | "toutes">("toutes");

  const envoyables = useMemo(() => (lecture?.lignes ?? []).flatMap((l) => (l.ligne ? [l.ligne] : [])), [lecture]);
  const appel = useMutation({
    mutationFn: (mode: "simulation" | "import") => ecrire<Reponse>(`/etablissements/${encodeURIComponent(id)}/import/services`, { mode, anneeScolaire: annee, remplacer, idImport, lignes: envoyables }),
    onSuccess: (r) => {
      setRapport(r);
      setFiltre(r.totaux.erreurs ? "erreur" : "toutes");
      if (r.mode === "import" && r.ecrit) {
        notifier({ ton: "succes", titre: "Services enregistrés", texte: `${r.totaux.attribues ?? 0} attribué(s), ${r.totaux.retires ?? 0} retiré(s). Les carnets des enseignants sont à jour.` });
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
    if (!/\.(csv|txt)$/i.test(f.name)) { setErreurFichier("Format attendu : CSV (Excel : Fichier › Enregistrer sous › CSV)."); return; }
    const l = lireServices(await f.arrayBuffer());
    if (l.colonnesManquantes.length) { setErreurFichier(`Colonnes introuvables : ${l.colonnesManquantes.join(", ")}. Partez du modèle.`); return; }
    if (!l.lignes.length) { setErreurFichier("Aucune ligne de service dans le fichier."); return; }
    if (l.lignes.length > MAX_SERVICES) { setErreurFichier(`${l.lignes.length} lignes : ${MAX_SERVICES} au plus par import.`); return; }
    setFichier(f.name); setLecture(l); setIdImport(nouvelId());
  };

  const lignesRapport = useMemo(() => {
    if (!lecture) return [];
    const serveur = new Map((rapport?.lignes ?? []).map((l) => [l.n, l]));
    return lecture.lignes.map((l) => {
      const s = serveur.get(l.n);
      return { n: l.n, brut: l.brut, statut: (l.erreur ? "erreur" : s?.statut ?? null) as Statut | null, motif: l.erreur ?? s?.motif, avertissement: s?.avertissement, enseignant: s?.enseignant, matiere: s?.matiere, principal: s?.principal };
    });
  }, [lecture, rapport]);
  const compte = (s: Statut) => lignesRapport.filter((l) => l.statut === s).length;
  const visibles = filtre === "toutes" ? lignesRapport : lignesRapport.filter((l) => l.statut === filtre);
  const importable = rapport?.mode === "simulation" && (rapport.totaux.aAttribuer > 0 || rapport.totaux.retraits > 0 || rapport.totaux.principaux > 0);
  const erreursLecture = lecture?.lignes.filter((l) => l.erreur).length ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader surtitre="Établissement" titre="Importer les services d'enseignement"
        sousTitre="Qui enseigne quelle matière dans quelle classe. Un service ouvre à l'enseignant le carnet de la classe ; chaque attribution et chaque retrait sont inscrits au registre." />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card className="min-w-0">
          <CardHeader icon={UsersRound} title="1. Préparer le fichier" subtitle="Une ligne par service, au format CSV." />
          <ul className="space-y-1.5 text-[13.5px] text-ink-2">
            <li><b className="text-ink">classe</b>, <b className="text-ink">matiere</b> : obligatoires (« Maths », « PCT », « HG » sont reconnus).</li>
            <li><b className="text-ink">enseignant</b> (nom et prénoms) ou <b className="text-ink">npi_enseignant</b> : seuls les enseignants affectés à votre établissement sont reconnus.</li>
            <li><b className="text-ink">principal</b> : « oui » pour le professeur principal de la classe (un seul par classe).</li>
            <li>Un enseignant à ajouter à votre personnel passe par la direction départementale (affectation), pas par ce fichier.</li>
          </ul>
          <Button className="mt-4" variante="secondaire" icone={Download} onClick={() => telechargerCsv("modele_services_enseignement", MODELE_SERVICES)}>Télécharger le modèle</Button>
        </Card>

        <Card className="min-w-0">
          <CardHeader icon={Upload} title="2. Déposer et vérifier" subtitle="La vérification n'écrit rien. Les retraits éventuels sont annoncés avant l'import." />
          <div className="grid gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">Année scolaire</span>
              <select value={annee} onChange={(e) => { setAnnee(e.target.value); reinitialiser(); }} className={classeSelect} aria-label="Année scolaire">
                {choix.map((a) => <option key={a} value={a}>{a}</option>)}
              </select></label>
            <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">Fichier CSV</span>
              <input type="file" accept=".csv,text/csv,.txt" onChange={choisir} className={cn(classeChamp, "py-1.5 file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-[13px]")} aria-label="Fichier CSV" /></label>
          </div>
          <label className="mt-3 flex items-start gap-2 text-[13.5px] text-ink-2">
            <input type="checkbox" checked={remplacer} onChange={(e) => { setRemplacer(e.target.checked); reinitialiser(); }} className="mt-0.5" />
            <span><b className="text-ink">Remplacer</b> : les classes du fichier reçoivent exactement les services listés ; leurs autres services sont retirés et les enseignants concernés perdent l&apos;accès au carnet.</span>
          </label>
          {erreurFichier && <p role="alert" className="mt-3 rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">{erreurFichier}</p>}
          {lecture && (
            <p className="mt-3 text-[13px] text-ink-2"><b className="text-ink">{fichier}</b> : {lecture.lignes.length} ligne(s) lue(s) ({lecture.encodage}, séparateur « {lecture.separateur} »)
              {erreursLecture > 0 && <> — <span className="text-critical">{erreursLecture} à corriger avant envoi</span></>}.</p>
          )}
          {appel.error && <p role="alert" className="mt-3 rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">{appel.error.message}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variante="secondaire" icone={ListChecks} disabled={!envoyables.length} chargement={appel.isPending && appel.variables === "simulation"} onClick={() => appel.mutate("simulation")}>Vérifier {envoyables.length ? `${envoyables.length} ligne(s)` : ""}</Button>
            <Button variante="primaire" icone={CheckCircle2} disabled={!importable} chargement={appel.isPending && appel.variables === "import"} onClick={() => appel.mutate("import")}>Enregistrer les services</Button>
          </div>
        </Card>
      </div>

      {lecture && (
        <Card className="min-w-0">
          <CardHeader icon={rapport?.ecrit ? CheckCircle2 : ListChecks} title={rapport ? (rapport.ecrit ? "3. Résultat" : "3. Rapport de vérification") : "3. Rapport"}
            subtitle={rapport ? (rapport.ecrit ? "Les services sont en place ; les lignes refusées n'ont rien changé." : "Rien n'est encore changé.") : "Lancez la vérification pour obtenir le verdict de chaque ligne."} />
          {rapport && rapport.retraits.length > 0 && (
            <div role="status" className="mb-3 rounded-md bg-warning-bg px-3 py-2 text-[13px] text-ink-2">
              <b className="text-ink">{rapport.ecrit ? "Services retirés" : "Services qui seront retirés"} ({rapport.retraits.length})</b> :{" "}
              {rapport.retraits.slice(0, 12).map((r) => `${r.classe} · ${r.matiere} (${r.enseignant})`).join(" ; ")}{rapport.retraits.length > 12 ? " ; …" : ""}
            </div>
          )}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {(["toutes", "erreur", rapport?.ecrit ? "attribue" : "a_attribuer", "deja_attribue"] as const).map((f) => (
              <button key={f} onClick={() => setFiltre(f)} aria-pressed={filtre === f}
                className={cn("rounded-full border px-3 py-1 text-[12.5px] font-medium", filtre === f ? "border-navy bg-navy text-white" : "border-line text-ink-2 hover:bg-surface-2")}>
                {f === "toutes" ? `Toutes (${lignesRapport.length})` : `${LIBELLE[f][0]} (${compte(f)})`}
              </button>
            ))}
            {compte("erreur") > 0 && (
              <Button className="ml-auto" taille="sm" variante="secondaire" icone={FileWarning} onClick={() => void exporterCsv(`services_refuses_${id}`, lignesRapport.filter((l) => l.statut === "erreur"),
                [...COLONNES_SERVICES.map((c) => ({ entete: c, valeur: (l: (typeof lignesRapport)[number]) => l.brut[c] ?? "" })), { entete: "motif", valeur: (l) => l.motif ?? "" }],
                `Services refusés à l'import — ${annee}`)}>Lignes refusées (CSV)</Button>
            )}
          </div>
          {!visibles.length ? <EtatVide icone={ListChecks} titre="Aucune ligne dans ce filtre" /> : (
            <div className="max-h-[480px] overflow-auto rounded-lg border border-line">
              <table className="w-full min-w-[680px] text-left text-[13px]">
                <thead className="sticky top-0 bg-surface-2 text-[11.5px] uppercase tracking-wide text-ink-muted">
                  <tr><th className="px-3 py-2">Ligne</th><th className="px-3 py-2">Classe</th><th className="px-3 py-2">Matière</th><th className="px-3 py-2">Enseignant</th><th className="px-3 py-2">Verdict</th><th className="px-3 py-2">Motif</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visibles.map((l) => (
                    <tr key={l.n}>
                      <td className="px-3 py-1.5 tabular-nums text-ink-muted">{l.n}</td>
                      <td className="px-3 py-1.5">{l.brut.classe}</td>
                      <td className="px-3 py-1.5">{l.matiere ?? l.brut.matiere}</td>
                      <td className="px-3 py-1.5 text-ink">{l.enseignant ?? l.brut.enseignant ?? (l.brut.npi_enseignant ? "NPI fourni" : "")}{l.principal ? <Badge className="ml-1.5" ton="marque">principal</Badge> : null}</td>
                      <td className="px-3 py-1.5">{l.statut ? <Badge ton={LIBELLE[l.statut][1]}>{LIBELLE[l.statut][0]}</Badge> : <span className="text-ink-muted">—</span>}</td>
                      <td className="px-3 py-1.5 text-ink-2">{l.motif ?? ""}{l.avertissement ? <span className="block text-[12px] text-warning">{l.avertissement}</span> : null}</td>
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
