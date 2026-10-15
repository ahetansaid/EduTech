"use client";

import { MATIERES, TYPES_EVALUATION, type Matiere, type TypeEvaluation } from "@beile/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardPen, Save, School } from "lucide-react";
import { useMemo, useState } from "react";
import { EntreePage } from "@/components/motion";
import { notifier } from "@/components/ui/Notifications";
import { Button, Card, CardHeader, EtatVide, PageHeader, Segmente, Squelette } from "@/components/ui/primitives";
import { ecrire, lire } from "@/lib/http";
import { EtatEchec } from "../_commun";

interface Ecole { id: string; nom: string; classes: { id: string; libelle: string; anneeScolaire: string; effectif: number }[] }
interface ElevesClasse { classe: { id: string; libelle: string; anneeScolaire: string }; trimestreCalendrier: number | null; eleves: { id: string; nom: string; prenoms: string }[] }
const LIBELLE_TYPE: Record<TypeEvaluation, string> = { interrogation: "Interrogation", devoir: "Devoir", composition: "Composition" };
const champ = "h-10 w-full rounded-lg border border-line bg-surface px-3 text-[14px] text-ink outline-none focus:border-blue/50 focus:ring-2 focus:ring-blue/20";

/**
 * Saisie pour le compte d'une école NON CONNECTÉE de la circonscription : l'inspection reporte une feuille d'appel
 * ou un relevé de notes papier. Chaque fait porte la marque « saisi par l'inspection » et la référence de sa pièce ;
 * dès que l'école a un chef connecté, elle disparaît de cette liste et la saisie lui revient.
 */
export default function PageSaisieEcoles() {
  const ecoles = useQuery({ queryKey: ["inspection", "ecoles-non-connectees"], queryFn: ({ signal }) => lire<{ ecoles: Ecole[] }>("/inspection/ecoles-non-connectees", signal) });
  const [ecoleId, setEcoleId] = useState("");
  const [classeId, setClasseId] = useState("");
  const ecole = ecoles.data?.ecoles.find((e) => e.id === ecoleId);
  return (
    <EntreePage>
      <div className="space-y-5">
        <PageHeader surtitre="Inspection" titre="Saisie pour une école non connectée"
          sousTitre="Reportez une feuille d'appel ou un relevé de notes papier. Chaque fait garde la mention « saisi par l'inspection » et la référence de sa pièce ; l'école le verra en se connectant." />
        {ecoles.isPending ? <Squelette className="h-40 rounded-2xl" /> : ecoles.isError ? <EtatEchec erreur={ecoles.error} onReessayer={() => ecoles.refetch()} /> : !ecoles.data.ecoles.length ? (
          <Card><EtatVide icone={School} titre="Toutes les écoles de votre circonscription sont connectées" texte="La saisie revient à chaque établissement." /></Card>
        ) : (
          <Card>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">École</span>
                <select value={ecoleId} onChange={(e) => { setEcoleId(e.target.value); setClasseId(""); }} className={champ} aria-label="École">
                  <option value="">Choisir une école…</option>
                  {ecoles.data.ecoles.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
                </select>
              </label>
              <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">Classe</span>
                <select value={classeId} onChange={(e) => setClasseId(e.target.value)} disabled={!ecole} className={champ} aria-label="Classe">
                  <option value="">Choisir une classe…</option>
                  {ecole?.classes.map((c) => <option key={c.id} value={c.id}>{c.libelle} · {c.anneeScolaire} · {c.effectif} élève(s)</option>)}
                </select>
              </label>
            </div>
          </Card>
        )}
        {ecoleId && classeId && <Saisie ecoleId={ecoleId} classeId={classeId} />}
      </div>
    </EntreePage>
  );
}

function Saisie({ ecoleId, classeId }: { ecoleId: string; classeId: string }) {
  const client = useQueryClient();
  const q = useQuery({ queryKey: ["inspection", "eleves", ecoleId, classeId], queryFn: ({ signal }) => lire<ElevesClasse>(`/inspection/etablissements/${encodeURIComponent(ecoleId)}/classes/${encodeURIComponent(classeId)}/eleves`, signal) });
  const [mode, setMode] = useState<"appel" | "notes">("appel");
  const [piece, setPiece] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [absents, setAbsents] = useState<Set<string>>(new Set());
  const [matiere, setMatiere] = useState<Matiere>(MATIERES[0]);
  const [trimestre, setTrimestre] = useState<number>(1);
  const [type, setType] = useState<TypeEvaluation>("devoir");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [cle, setCle] = useState(() => crypto.randomUUID());
  const valides = useMemo(() => Object.entries(notes).flatMap(([apprenantId, v]) => {
    const n = Number(v.replace(",", "."));
    return v.trim() && Number.isFinite(n) && n >= 0 && n <= 20 && Number.isInteger(n * 4) ? [{ apprenantId, note: n }] : [];
  }), [notes]);
  const envoyer = useMutation({
    mutationFn: () => mode === "appel"
      ? ecrire(`/inspection/etablissements/${encodeURIComponent(ecoleId)}/absences`, { classeId, date, apprenantIds: [...absents], piece: piece.trim(), idSaisie: cle })
      : ecrire(`/inspection/etablissements/${encodeURIComponent(ecoleId)}/evaluations`, { classeId, matiere, trimestre, typeEvaluation: type, notes: valides, piece: piece.trim(), idSaisie: cle }),
    onSuccess: () => {
      notifier({ ton: "succes", titre: "Saisie enregistrée", texte: mode === "appel" ? `${absents.size} absence(s) reportée(s).` : `${valides.length} note(s) reportée(s).` });
      setAbsents(new Set()); setNotes({}); setPiece(""); setCle(crypto.randomUUID());
      client.invalidateQueries({ queryKey: ["inspection"] });
    },
  });
  if (q.isPending) return <Squelette className="h-64 rounded-2xl" />;
  if (q.isError) return <EtatEchec erreur={q.error} onReessayer={() => q.refetch()} />;
  const d = q.data;
  const pret = piece.trim().length >= 3 && (mode === "appel" ? absents.size > 0 : valides.length > 0);
  return (
    <Card>
      <CardHeader icon={ClipboardPen} title={`${d.classe.libelle} · ${d.classe.anneeScolaire}`} subtitle={`${d.eleves.length} élève(s)${d.trimestreCalendrier ? ` · trimestre en cours au calendrier : T${d.trimestreCalendrier}` : ""}`}
        action={<Segmente label="Saisie" valeur={mode} onChange={(v) => setMode(v as typeof mode)} options={[{ valeur: "appel", libelle: "Appel" }, { valeur: "notes", libelle: "Notes" }]} />} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block sm:col-span-2"><span className="mb-1.5 block text-sm font-medium text-ink">Pièce reportée <span className="text-critical">*</span></span>
          <input value={piece} onChange={(e) => setPiece(e.target.value.slice(0, 120))} placeholder="Ex. feuille d'appel du 14/10 signée du directeur" className={champ} aria-label="Pièce reportée" />
        </label>
        {mode === "appel" ? (
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">Date de l'appel</span>
            <input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} className={champ} aria-label="Date de l'appel" />
          </label>
        ) : (
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">Matière</span>
            <select value={matiere} onChange={(e) => setMatiere(e.target.value as Matiere)} className={champ} aria-label="Matière">{MATIERES.map((m) => <option key={m}>{m}</option>)}</select>
          </label>
        )}
      </div>
      {mode === "notes" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Segmente label="Trimestre" valeur={String(trimestre) as "1" | "2" | "3"} onChange={(t) => setTrimestre(Number(t))} options={[{ valeur: "1", libelle: "T1" }, { valeur: "2", libelle: "T2" }, { valeur: "3", libelle: "T3" }]} />
          <Segmente label="Type" valeur={type} onChange={(t) => setType(t as TypeEvaluation)} options={TYPES_EVALUATION.map((t) => ({ valeur: t, libelle: LIBELLE_TYPE[t] }))} />
        </div>
      )}
      <ul className="mt-4 divide-y divide-line">
        {d.eleves.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0 truncate text-[14px] text-ink">{e.prenoms} {e.nom}</span>
            {mode === "appel" ? (
              <label className="flex items-center gap-2 text-[13px] text-ink-2">
                <input type="checkbox" checked={absents.has(e.id)} onChange={(x) => setAbsents((s) => { const n = new Set(s); if (x.target.checked) n.add(e.id); else n.delete(e.id); return n; })} aria-label={`Absent : ${e.prenoms} ${e.nom}`} /> Absent
              </label>
            ) : (
              <input inputMode="decimal" value={notes[e.id] ?? ""} onChange={(x) => setNotes((s) => ({ ...s, [e.id]: x.target.value.slice(0, 5) }))} placeholder="/20" aria-label={`Note de ${e.prenoms} ${e.nom}`}
                className="h-9 w-20 rounded-lg border border-line bg-surface px-2 text-right text-[14px] text-ink" />
            )}
          </li>
        ))}
      </ul>
      {envoyer.error && <p role="alert" className="mt-3 rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">{envoyer.error.message}</p>}
      <div className="mt-4 flex justify-end">
        <Button variante="primaire" icone={Save} chargement={envoyer.isPending} disabled={!pret} onClick={() => envoyer.mutate()}>
          {mode === "appel" ? `Enregistrer ${absents.size} absence(s)` : `Enregistrer ${valides.length} note(s)`}
        </Button>
      </div>
    </Card>
  );
}
