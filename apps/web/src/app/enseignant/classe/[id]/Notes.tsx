"use client";

import type { Matiere } from "@beile/contracts";
import { ChevronDown, CloudOff, History, PenLine, Save, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "@/components/motion";
import { useEnLigne } from "@/components/shell/EtatReseau";
import { Badge, Button, Card, CardHeader, EtatVide, Segmente } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { date, heure, nombre } from "@/lib/format";
import { analyserNote, useCorrectionMutation, useHistorique, useNotesMutation, type Carnet, type CorpsNotes, type CorrectionHistorique, type NoteCarnet } from "@/lib/api/enseignant";
import { useFileHorsConnexion } from "@/lib/fileHorsConnexion";
import { BadgePoint, BarreAction, Confirmation, FeuilleModale, nomComplet } from "../../communs";

/* ------------------------------------------------------------------ Brouillon local (appel téléphonique, écran verrouillé…) */

const cleBrouillon = (classeId: string, matiere: string, trimestre: number) => `beile.brouillon-notes.${classeId}.${matiere}.${trimestre}`;
function lireBrouillon(cle: string): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(cle) ?? "{}") as Record<string, string>; } catch { return {}; }
}
function ecrireBrouillon(cle: string, v: Record<string, string>) {
  try { if (Object.values(v).some((x) => x.trim())) localStorage.setItem(cle, JSON.stringify(v)); else localStorage.removeItem(cle); } catch { /* stockage indisponible */ }
}

const fmtNote = (n: number) => nombre(n, Number.isInteger(n) ? 0 : 2);
const tonNote = (n: number) => (n < 10 ? "text-critical" : n >= 14 ? "text-success" : "text-ink");

/**
 * Saisie d'une évaluation : clavier numérique, validation 0–20 au quart de point à la frappe,
 * « Entrée » passe à l'élève suivant, brouillon conservé sur l'appareil jusqu'à l'envoi.
 * Puis les évaluations enregistrées, avec correction motivée (la note d'origine reste tracée).
 */
export function Notes({ carnet }: { carnet: Carnet }) {
  const classeId = carnet.classe.id;
  const enLigne = useEnLigne();
  const [matiere, setMatiere] = useState<Matiere>(carnet.matieres[0]!);
  const [trimestre, setTrimestre] = useState<number>(carnet.trimestre);
  const [saisies, setSaisies] = useState<Record<string, string>>(() => lireBrouillon(cleBrouillon(classeId, carnet.matieres[0]!, carnet.trimestre)));
  const [confirmation, setConfirmation] = useState<{ attente: boolean; n: number } | null>(null);
  const fermer = useCallback(() => setConfirmation(null), []);
  const mutation = useNotesMutation(classeId, carnet.classe.libelle);

  const changerContexte = (m: Matiere, t: number) => {
    setMatiere(m); setTrimestre(t);
    setSaisies(lireBrouillon(cleBrouillon(classeId, m, t)));
  };
  const saisir = (id: string, v: string) => {
    const propre = v.replace(/[^0-9.,]/g, "").slice(0, 5);
    setSaisies((s) => { const n = { ...s, [id]: propre }; ecrireBrouillon(cleBrouillon(classeId, matiere, trimestre), n); return n; });
  };
  const effacer = () => { setSaisies({}); ecrireBrouillon(cleBrouillon(classeId, matiere, trimestre), {}); };

  const analyses = useMemo(() => Object.fromEntries(Object.entries(saisies).map(([k, v]) => [k, analyserNote(v)])), [saisies]);
  const valides = Object.entries(analyses).filter(([, a]) => a.valeur != null).map(([apprenantId, a]) => ({ apprenantId, note: a.valeur! }));
  const erreurs = Object.values(analyses).filter((a) => a.erreur).length;
  const moyenne = valides.length ? valides.reduce((s, n) => s + n.note, 0) / valides.length : null;

  const enregistrer = () => {
    if (!valides.length || erreurs) return;
    mutation.mutate({ classeId, matiere, trimestre, notes: valides }, {
      onSuccess: (r) => { effacer(); setConfirmation({ attente: r.etat === "en_attente", n: valides.length }); },
    });
  };

  const suivant = (index: number) => {
    const e = carnet.eleves[index + 1];
    if (e) document.getElementById(`note-${e.id}`)?.focus();
    else (document.activeElement as HTMLElement | null)?.blur();
  };

  if (carnet.lecture) return <Evaluations carnet={carnet} />;

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden p-0">
        <div className="space-y-3 border-b border-line/60 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-ink">Nouvelle évaluation</p>
              <p className="text-[12.5px] text-ink-muted">{date(carnet.date)} · sur 20, au quart de point<span className="hidden sm:inline"> · « Entrée » passe à l'élève suivant</span></p>
            </div>
            {Object.keys(saisies).length > 0 && <Button taille="sm" variante="fantome" icone={Trash2} onClick={effacer}>Effacer</Button>}
          </div>
          <div className="flex flex-wrap gap-2">
            {carnet.matieres.length > 1 && <Segmente label="Matière" valeur={matiere} onChange={(m) => changerContexte(m, trimestre)} options={carnet.matieres.map((m) => ({ valeur: m, libelle: m }))} />}
            <Segmente label="Trimestre" valeur={String(trimestre) as "1" | "2" | "3"} onChange={(t) => changerContexte(matiere, Number(t))} options={[{ valeur: "1", libelle: "T1" }, { valeur: "2", libelle: "T2" }, { valeur: "3", libelle: "T3" }]} />
          </div>
          {/* Progression de la saisie */}
          <div>
            <div className="mb-1 flex justify-between text-[12px] text-ink-muted">
              <span><strong className="tabular-nums text-ink">{valides.length}</strong>/{carnet.eleves.length} copies{erreurs ? <span className="text-critical"> · {erreurs} à corriger</span> : null}</span>
              <span>Moyenne provisoire <strong className={cn("tabular-nums", moyenne != null ? tonNote(moyenne) : "text-ink")}>{moyenne == null ? "—" : nombre(moyenne, 2)}</strong></span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <motion.div className="h-full rounded-full" style={{ background: "var(--acc)" }} animate={{ width: `${(valides.length / Math.max(1, carnet.eleves.length)) * 100}%` }} transition={{ type: "spring", stiffness: 240, damping: 30 }} />
            </div>
          </div>
        </div>

        <ul className="grid divide-y divide-line/50 md:grid-cols-2 md:divide-y-0">
          {carnet.eleves.map((e, i) => {
            const a = analyses[e.id];
            const derniere = e.notes.filter((n) => n.matiere === matiere).at(-1);
            return (
              <li key={e.id} className={cn("flex items-center gap-3 px-4 py-2.5 transition-colors sm:px-5 md:border-b md:border-line/50", a?.valeur != null && "bg-success-bg/40", a?.erreur && "bg-critical-bg/50")}>
                <span className="w-6 shrink-0 text-right text-[12px] tabular-nums text-ink-muted">{i + 1}</span>
                <label htmlFor={`note-${e.id}`} className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-ink">{e.nom} <span className="font-normal text-ink-2">{e.prenoms}</span></span>
                  <span className="block text-[12px] text-ink-muted">
                    {a?.erreur ? <span id={`err-${e.id}`} className="text-critical">{a.erreur}</span> : derniere ? `Dernière note : ${fmtNote(derniere.note)}` : "Aucune note dans cette matière"}
                  </span>
                </label>
                <input
                  id={`note-${e.id}`}
                  inputMode="decimal"
                  enterKeyHint={i < carnet.eleves.length - 1 ? "next" : "done"}
                  autoComplete="off"
                  value={saisies[e.id] ?? ""}
                  onChange={(ev) => saisir(e.id, ev.target.value)}
                  onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); suivant(i); } }}
                  aria-invalid={!!a?.erreur}
                  aria-describedby={a?.erreur ? `err-${e.id}` : undefined}
                  placeholder="—"
                  className={cn("h-12 w-20 shrink-0 rounded-lg border bg-surface px-2 text-center text-[17px] font-semibold tabular-nums text-ink outline-none transition focus:border-blue focus:ring-4 focus:ring-blue/15",
                    a?.erreur ? "border-critical" : a?.valeur != null ? "border-success/50" : "border-line")}
                />
              </li>
            );
          })}
        </ul>
      </Card>

      <Evaluations carnet={carnet} matiere={matiere} />

      {(valides.length > 0 || erreurs > 0) && (
        <BarreAction>
          <motion.div whileTap={{ scale: 0.98 }}>
            <Button
              variante="valider" taille="lg" icone={enLigne ? Save : CloudOff} chargement={mutation.isPending}
              disabled={!valides.length || erreurs > 0}
              onClick={enregistrer}
              className="h-14 w-full rounded-xl text-[15px]"
            >
              {erreurs ? `${erreurs} note${erreurs > 1 ? "s" : ""} à corriger avant l'envoi` : valides.length ? `Enregistrer ${valides.length} note${valides.length > 1 ? "s" : ""} · T${trimestre}${enLigne ? "" : " (hors connexion)"}` : "Saisissez au moins une note"}
            </Button>
          </motion.div>
        </BarreAction>
      )}

      <Confirmation
        visible={!!confirmation}
        attente={confirmation?.attente}
        titre={confirmation?.attente ? "Notes conservées" : "Évaluation enregistrée"}
        texte={confirmation ? (confirmation.attente ? `${confirmation.n} note(s) sur l'appareil · envoi automatique au retour du réseau.` : `${confirmation.n} note(s) au registre · moyennes et bulletins recalculés.`) : undefined}
        fermer={fermer}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ Évaluations enregistrées + correction */

interface Groupe { cle: string; matiere: Matiere; trimestre: number; le: string; notes: (NoteCarnet & { eleve: string; apprenantId: string })[] }

function Evaluations({ carnet, matiere }: { carnet: Carnet; matiere?: Matiere }) {
  const classeId = carnet.classe.id;
  const historique = useHistorique(classeId);
  const file = useFileHorsConnexion(classeId);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [tout, setTout] = useState(false);
  const [cible, setCible] = useState<Groupe["notes"][number] | null>(null);

  const corrections = useMemo(() => {
    const m = new Map<string, CorrectionHistorique[]>();
    for (const c of historique.data?.corrections ?? []) m.set(c.evenementCorrigeId, [...(m.get(c.evenementCorrigeId) ?? []), c]);
    return m;
  }, [historique.data]);

  const groupes = useMemo(() => {
    const m = new Map<string, Groupe>();
    for (const e of carnet.eleves) {
      for (const n of e.notes) {
        if (matiere && n.matiere !== matiere) continue;
        const cle = `${n.matiere}|${n.trimestre}|${n.le}`;
        const g = m.get(cle) ?? { cle, matiere: n.matiere, trimestre: n.trimestre, le: n.le, notes: [] };
        g.notes.push({ ...n, eleve: nomComplet(e), apprenantId: e.id });
        m.set(cle, g);
      }
    }
    return [...m.values()].sort((a, b) => b.le.localeCompare(a.le));
  }, [carnet.eleves, matiere]);

  const enAttente = file.filter((s) => s.type === "notes" && (!matiere || (s.corps as unknown as CorpsNotes).matiere === matiere));
  const affiches = tout ? groupes : groupes.slice(0, 5);

  return (
    <Card className="min-w-0">
      <CardHeader icon={History} title={`Évaluations enregistrées${matiere ? ` · ${matiere}` : ""}`} subtitle="Touchez une note pour la corriger. Une note n'est jamais effacée : la correction s'ajoute au registre avec son motif." />

      {enAttente.length > 0 && (
        <ul className="mb-3 space-y-2">
          {enAttente.map((s) => {
            const c = s.corps as unknown as CorpsNotes;
            return (
              <li key={s.id} className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning-bg/60 px-3.5 py-2.5">
                <CloudOff size={16} className="shrink-0 text-warning" aria-hidden />
                <span className="min-w-0 flex-1 text-[13.5px] text-ink">{c.matiere} · T{c.trimestre} · {c.notes.length} copie{c.notes.length > 1 ? "s" : ""}</span>
                <BadgePoint ton="avertissement">En attente · {heure(s.saisiLe)}</BadgePoint>
              </li>
            );
          })}
        </ul>
      )}

      {groupes.length === 0 ? (
        <EtatVide icone={PenLine} titre="Aucune évaluation enregistrée" texte="Les évaluations que vous saisissez apparaîtront ici, prêtes à être consultées ou corrigées." />
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {affiches.map((g, i) => {
              const moy = g.notes.reduce((s, n) => s + n.note, 0) / g.notes.length;
              const corrigees = g.notes.filter((n) => n.corrigee).length;
              const estOuvert = ouvert === g.cle;
              return (
                <motion.li key={g.cle} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.035 }} className="overflow-hidden rounded-xl border border-line/70">
                  <button onClick={() => setOuvert(estOuvert ? null : g.cle)} aria-expanded={estOuvert} className="flex min-h-[56px] w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-surface-2/60">
                    <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-blue-soft text-accent-ink leading-none">
                      <span className="text-[14px] font-bold tabular-nums">{new Date(g.le).getUTCDate()}</span>
                      <span className="text-[9.5px] uppercase">{new Date(g.le).toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" }).replace(".", "")}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-ink">{matiere ? "Évaluation" : g.matiere} · T{g.trimestre}</span>
                      <span className="block text-xs text-ink-muted">{g.notes.length} copie{g.notes.length > 1 ? "s" : ""} · {heure(g.le)}{corrigees ? ` · ${corrigees} corrigée${corrigees > 1 ? "s" : ""}` : ""}</span>
                    </span>
                    <span className="text-right">
                      <span className={cn("block text-[16px] font-bold tabular-nums", tonNote(moy))}>{nombre(moy, 2)}</span>
                      <span className="block text-[10.5px] text-ink-muted">moyenne</span>
                    </span>
                    <ChevronDown size={16} className={cn("shrink-0 text-ink-muted transition-transform", estOuvert && "rotate-180")} aria-hidden />
                  </button>
                  <AnimatePresence initial={false}>
                    {estOuvert && (
                      <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                        <ul className="grid gap-1.5 border-t border-line/60 bg-surface-2/40 p-2.5 sm:grid-cols-2 lg:grid-cols-3">
                          {[...g.notes].sort((a, b) => a.eleve.localeCompare(b.eleve, "fr")).map((n) => {
                            const hist = corrections.get(n.id);
                            const origine = hist?.[0]?.noteInitiale;
                            return (
                              <li key={n.id}>
                                <button disabled={carnet.lecture} onClick={() => setCible(n)} className="flex min-h-[44px] w-full items-center gap-2 rounded-lg bg-surface px-3 py-2 text-left ring-1 ring-inset ring-line/60 transition hover:ring-blue/50 active:scale-[0.98] disabled:cursor-default">
                                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{n.eleve}</span>
                                  {n.corrigee && origine != null && <span className="text-[12px] tabular-nums text-ink-muted line-through" title="Note d'origine">{fmtNote(origine)}</span>}
                                  <span className={cn("text-[14px] font-semibold tabular-nums", tonNote(n.note))}>{fmtNote(n.note)}</span>
                                  {n.corrigee && <Badge ton="info">corrigée</Badge>}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
      {groupes.length > 5 && (
        <Button variante="fantome" taille="sm" className="mt-3 w-full" onClick={() => setTout((t) => !t)}>{tout ? "Afficher moins" : `Afficher les ${groupes.length} évaluations`}</Button>
      )}

      <ModaleCorrection cible={cible} fermer={() => setCible(null)} historique={cible ? corrections.get(cible.id) ?? [] : []} carnet={carnet} />
    </Card>
  );
}

const MOTIFS = ["Erreur de report", "Copie recorrigée", "Barème revu", "Réclamation fondée"];

function ModaleCorrection({ cible, fermer, historique, carnet }: { cible: (NoteCarnet & { eleve: string }) | null; fermer: () => void; historique: CorrectionHistorique[]; carnet: Carnet }) {
  const mutation = useCorrectionMutation(carnet.classe.id, carnet.classe.libelle);
  const [nouvelle, setNouvelle] = useState("");
  const [motif, setMotif] = useState("");
  const [cibleVue, setCibleVue] = useState<string | null>(null);
  // Réinitialisation du formulaire à chaque nouvelle note ciblée (sans effet).
  if (cible && cible.id !== cibleVue) { setCibleVue(cible.id); setNouvelle(""); setMotif(""); }

  const a = analyserNote(nouvelle);
  const motifOk = motif.trim().length >= 5;
  const identique = cible && a.valeur === cible.note;
  const ok = !!cible && a.valeur != null && motifOk && !identique;

  return (
    <FeuilleModale
      ouverte={!!cible}
      fermer={fermer}
      titre="Corriger une note"
      sousTitre={cible ? `${cible.eleve} · ${cible.matiere} · T${cible.trimestre} · ${date(cible.le)}` : undefined}
      pied={<>
        <Button variante="secondaire" onClick={fermer}>Annuler</Button>
        <Button icone={PenLine} disabled={!ok} chargement={mutation.isPending} onClick={() => cible && a.valeur != null && mutation.mutate({ evenementCorrigeId: cible.id, nouvelleNote: a.valeur, motif: motif.trim(), eleve: cible.eleve }, { onSuccess: fermer })}>Corriger</Button>
      </>}
    >
      {cible && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-surface-2/70 p-3">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Note actuelle</p>
              <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tonNote(cible.note))}>{fmtNote(cible.note)}</p>
            </div>
            <div className="rounded-lg bg-surface-2/70 p-3">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Note d'origine</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-ink-2">{fmtNote(historique[0]?.noteInitiale ?? cible.note)}</p>
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-ink">Nouvelle note</span>
            <input inputMode="decimal" autoComplete="off" value={nouvelle} onChange={(e) => setNouvelle(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 5))} placeholder="ex. 12,5"
              aria-invalid={!!a.erreur || !!identique}
              className="mt-1.5 h-12 w-full rounded-md border border-line bg-surface px-3.5 text-[18px] font-semibold tabular-nums text-ink outline-none focus:border-blue focus:ring-4 focus:ring-blue/15" />
            {(a.erreur || identique) && <span className="mt-1 block text-xs text-critical">{a.erreur ?? "Identique à la note actuelle"}</span>}
          </label>

          <div>
            <label htmlFor="motif-correction" className="text-sm font-medium text-ink">Motif <span className="font-normal text-ink-muted">(obligatoire, tracé au registre)</span></label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {MOTIFS.map((m) => (
                <button key={m} type="button" onClick={() => setMotif(m)} className={cn("h-9 rounded-full px-3 text-[12.5px] font-medium ring-1 ring-inset transition active:scale-[0.97]", motif === m ? "bg-blue-soft text-accent-ink ring-blue/40" : "text-ink-2 ring-line hover:bg-surface-2")}>{m}</button>
              ))}
            </div>
            <textarea id="motif-correction" value={motif} onChange={(e) => setMotif(e.target.value.slice(0, 140))} rows={2} placeholder="Précisez le motif (5 caractères au moins)"
              className="mt-2 w-full resize-none rounded-md border border-line bg-surface px-3.5 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-4 focus:ring-blue/15" />
            <p className={cn("text-right text-xs", motif.length && !motifOk ? "text-critical" : "text-ink-muted")}>{motif.length}/140</p>
          </div>

          {historique.length > 0 && (
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Corrections précédentes</p>
              <ul className="mt-1 divide-y divide-line">
                {historique.map((h) => (
                  <li key={h.id} className="flex items-start gap-3 py-2.5">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-info" aria-hidden />
                    <span className="min-w-0 flex-1 text-sm text-ink">{fmtNote(h.notePrecedente)} → <strong>{fmtNote(h.nouvelleNote)}</strong> <span className="text-ink-muted">· {h.motif}</span></span>
                    <span className="shrink-0 text-xs text-ink-muted">{date(h.le)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-ink-muted">La note d'origine n'est jamais effacée : la correction est un nouvel événement, horodaté, avec son auteur et son motif ; la famille en est informée.</p>
        </div>
      )}
    </FeuilleModale>
  );
}
