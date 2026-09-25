"use client";

import type { Habilitation, Role } from "@beile/contracts";
import { Building2, Check, Globe2, Lock, MapPinned, Plus, Search, Trash2, UserRound, Users } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, EASE, motion } from "@/components/motion";
import { Badge, Button } from "@/components/ui/primitives";
import {
  LIBELLE_ROLE, NIVEAU_DU_ROLE, ROLES_AVEC_NPI, useCirconscriptionsRef, useDepartementsRef, useEtablissementsRef,
  type FicheNpi,
} from "@/lib/api/administration";
import { cn } from "@/lib/cn";
import { CHAMP } from "./communs";

/** Une ligne d'habilitation en cours de saisie. Les périmètres « famille » et « personnel » se déduisent du NPI. */
export interface Brouillon { cle: string; role: Role | ""; etablissementId?: string; etablissementNom?: string; circonscription?: string; departementId?: string }

const ROLES: Role[] = ["enseignant", "chef_etablissement", "parent", "apprenant", "inspecteur", "direction_departementale", "administration_centrale", "chercheur", "dpo", "administrateur"];
let compteur = 0;
export const nouvelleCle = () => `h${++compteur}-${Date.now().toString(36)}`;
export const brouillonVide = (): Brouillon => ({ cle: nouvelleCle(), role: "" });

export function depuisHabilitations(hs: Habilitation[], libelles: Record<string, string>): Brouillon[] {
  return hs.map((h) => {
    const p = h.perimetre;
    return {
      cle: nouvelleCle(),
      role: h.role,
      ...(p.niveau === "etablissement" ? { etablissementId: p.etablissementId, etablissementNom: libelles[p.etablissementId] ?? p.etablissementId } : {}),
      ...(p.niveau === "circonscription" ? { circonscription: p.circonscription } : {}),
      ...(p.niveau === "departement" ? { departementId: p.departementId } : {}),
    };
  });
}

/** Convertit un brouillon en habilitation conforme au contrat, ou renvoie la raison pour laquelle c'est impossible. */
export function versHabilitation(b: Brouillon, npi: string | null, fiche: FicheNpi | undefined): Habilitation | string {
  if (!b.role) return "Choisissez un rôle.";
  if (ROLES_AVEC_NPI.includes(b.role) && !npi) return "Ce rôle exige le NPI de la personne (étape « Identité »).";
  switch (NIVEAU_DU_ROLE[b.role]) {
    case "national": return { role: b.role, perimetre: { niveau: "national" } };
    case "etablissement": return b.etablissementId ? { role: b.role, perimetre: { niveau: "etablissement", etablissementId: b.etablissementId } } : "Choisissez l'établissement.";
    case "circonscription": return b.circonscription ? { role: b.role, perimetre: { niveau: "circonscription", circonscription: b.circonscription } } : "Choisissez la circonscription.";
    case "departement": return b.departementId ? { role: b.role, perimetre: { niveau: "departement", departementId: b.departementId } } : "Choisissez le département.";
    case "famille": return { role: b.role, perimetre: { niveau: "famille", responsableNpi: npi! } };
    case "personnel":
      if (!fiche) return "Vérification du NPI en cours…";
      return fiche.apprenant ? { role: b.role, perimetre: { niveau: "personnel", apprenantId: fiche.apprenant.id } } : "Aucun dossier apprenant ne porte ce NPI.";
  }
}

export function validerTout(bs: Brouillon[], npi: string | null, fiche: FicheNpi | undefined) {
  const erreurs: Record<string, string> = {};
  const habilitations: Habilitation[] = [];
  const vues = new Set<string>();
  for (const b of bs) {
    const r = versHabilitation(b, npi, fiche);
    if (typeof r === "string") { erreurs[b.cle] = r; continue; }
    const k = JSON.stringify(r);
    if (vues.has(k)) erreurs[b.cle] = "Habilitation en double.";
    vues.add(k);
    habilitations.push(r);
  }
  return { habilitations, erreurs, valide: bs.length > 0 && Object.keys(erreurs).length === 0 };
}

/** Circonscriptions groupées par département (sans Object.groupBy : navigateurs anciens des téléphones). */
function parDepartement<T extends { departement: string }>(l: T[]): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const x of l) m.set(x.departement, [...(m.get(x.departement) ?? []), x]);
  return [...m].sort(([a], [b]) => a.localeCompare(b, "fr"));
}

const ICONE_NIVEAU = { national: Globe2, etablissement: Building2, circonscription: MapPinned, departement: MapPinned, famille: Users, personnel: UserRound } as const;
const LIBELLE_NIVEAU = { national: "National", etablissement: "Établissement", circonscription: "Circonscription", departement: "Département", famille: "Famille", personnel: "Dossier personnel" } as const;

/**
 * Éditeur d'habilitations : un rôle et son périmètre par ligne. Le sélecteur de périmètre s'adapte au rôle
 * (recherche d'établissement, circonscriptions groupées par département, départements) ; famille et dossier
 * personnel sont déduits du NPI et du fichier des apprenants. `verrouAdmin` : la ligne administrateur de
 * l'utilisateur connecté ne peut pas être retirée (le serveur le refuse aussi).
 */
export function EditeurHabilitations({ valeur, onChange, npi, fiche, erreurs, verrouAdmin }: {
  valeur: Brouillon[]; onChange: (v: Brouillon[]) => void; npi: string | null; fiche: FicheNpi | undefined; erreurs: Record<string, string>; verrouAdmin?: boolean;
}) {
  const maj = (cle: string, patch: Partial<Brouillon>) => onChange(valeur.map((b) => (b.cle === cle ? { ...b, ...patch } : b)));
  const besoinCirco = valeur.some((b) => b.role && NIVEAU_DU_ROLE[b.role] === "circonscription");
  const besoinDep = valeur.some((b) => b.role && NIVEAU_DU_ROLE[b.role] === "departement");
  const circos = useCirconscriptionsRef(besoinCirco);
  const deps = useDepartementsRef(besoinDep);
  const adminVerrouille = verrouAdmin ? valeur.find((b) => b.role === "administrateur")?.cle : undefined;

  // Suggestions issues du NPI : ce que les fichiers nationaux savent déjà de la personne.
  const suggestions = useMemo(() => {
    const s: { libelle: string; brouillon: Omit<Brouillon, "cle"> }[] = [];
    if (fiche?.enseignant) s.push({ libelle: `Enseignant · ${fiche.enseignant.etablissement}`, brouillon: { role: "enseignant", etablissementId: fiche.enseignant.etablissementId, etablissementNom: fiche.enseignant.etablissement } });
    if (fiche && fiche.enfantsLies > 0) s.push({ libelle: `Parent · ${fiche.enfantsLies} enfant${fiche.enfantsLies > 1 ? "s" : ""} lié${fiche.enfantsLies > 1 ? "s" : ""}`, brouillon: { role: "parent" } });
    if (fiche?.apprenant) s.push({ libelle: `Apprenant · ${fiche.apprenant.prenoms} ${fiche.apprenant.nom}`, brouillon: { role: "apprenant" } });
    return s.filter((x) => !valeur.some((b) => b.role === x.brouillon.role && (b.etablissementId ?? "") === (x.brouillon.etablissementId ?? "")));
  }, [fiche, valeur]);

  return (
    <div className="space-y-3">
      {suggestions.length > 0 && (
        <div className="rounded-lg border border-dashed border-blue/40 bg-blue-soft/40 p-3">
          <p className="text-xs font-medium text-accent-ink">Suggestions d'après le NPI</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button key={s.libelle} type="button" onClick={() => onChange([...valeur.filter((b) => b.role), { cle: nouvelleCle(), ...s.brouillon }])}
                className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-left text-[13px] font-medium text-ink ring-1 ring-inset ring-line transition hover:ring-blue active:scale-[0.97]">
                <Plus size={14} className="shrink-0 text-accent-ink" aria-hidden /> <span className="min-w-0 truncate">{s.libelle}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <ul className="space-y-3">
        <AnimatePresence initial={false}>
          {valeur.map((b, i) => {
            const niveau = b.role ? NIVEAU_DU_ROLE[b.role] : null;
            const IconeNiveau = niveau ? ICONE_NIVEAU[niveau] : Globe2;
            const verrou = b.cle === adminVerrouille;
            return (
              <motion.li key={b.cle} layout initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: -16, transition: { duration: 0.18 } }} transition={{ duration: 0.3, ease: EASE }}
                className={cn("rounded-lg border bg-surface p-3 sm:p-4", erreurs[b.cle] ? "border-critical/50" : "border-line/70")}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Habilitation {i + 1}</span>
                  {verrou ? (
                    <Badge ton="neutre" icone={Lock}>Votre rôle</Badge>
                  ) : (
                    <button type="button" onClick={() => onChange(valeur.filter((x) => x.cle !== b.cle))} disabled={valeur.length === 1}
                      className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted transition hover:bg-critical-bg hover:text-critical disabled:opacity-40" aria-label={`Retirer l'habilitation ${i + 1}`}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div className="min-w-0">
                    <label htmlFor={`role-${b.cle}`} className="mb-1.5 block text-sm font-medium text-ink">Rôle</label>
                    <select id={`role-${b.cle}`} value={b.role} disabled={verrou} onChange={(e) => maj(b.cle, { role: e.target.value as Role, etablissementId: undefined, etablissementNom: undefined, circonscription: undefined, departementId: undefined })} className={CHAMP}>
                      <option value="" disabled>Choisir un rôle…</option>
                      {ROLES.map((r) => <option key={r} value={r}>{LIBELLE_ROLE[r]}</option>)}
                    </select>
                  </div>
                  <div className="min-w-0">
                    <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink"><IconeNiveau size={14} className="text-ink-muted" aria-hidden />Périmètre{niveau && <span className="font-normal text-ink-muted">· {LIBELLE_NIVEAU[niveau]}</span>}</p>
                    {!niveau ? (
                      <p className="flex h-10 items-center rounded-md bg-surface-2/60 px-3.5 text-sm text-ink-muted">Selon le rôle</p>
                    ) : niveau === "national" ? (
                      <p className="flex h-10 items-center gap-2 rounded-md bg-surface-2/60 px-3.5 text-sm text-ink-2"><Globe2 size={15} aria-hidden /> Tout le territoire</p>
                    ) : niveau === "etablissement" ? (
                      <ChoixEtablissement id={`etab-${b.cle}`} valeur={b.etablissementId ? { id: b.etablissementId, nom: b.etablissementNom ?? b.etablissementId } : null} onChange={(e) => maj(b.cle, { etablissementId: e?.id, etablissementNom: e?.nom })} />
                    ) : niveau === "circonscription" ? (
                      <select aria-label="Circonscription" value={b.circonscription ?? ""} onChange={(e) => maj(b.cle, { circonscription: e.target.value || undefined })} className={CHAMP} disabled={circos.isPending}>
                        <option value="">{circos.isPending ? "Chargement…" : "Choisir une circonscription…"}</option>
                        {parDepartement(circos.data ?? []).map(([dep, liste]) => (
                          <optgroup key={dep} label={dep}>{liste.map((c) => <option key={c.circonscription} value={c.circonscription}>{c.circonscription} · {c.etablissements} établ.</option>)}</optgroup>
                        ))}
                      </select>
                    ) : niveau === "departement" ? (
                      <select aria-label="Département" value={b.departementId ?? ""} onChange={(e) => maj(b.cle, { departementId: e.target.value || undefined })} className={CHAMP} disabled={deps.isPending}>
                        <option value="">{deps.isPending ? "Chargement…" : "Choisir un département…"}</option>
                        {(deps.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
                      </select>
                    ) : niveau === "famille" ? (
                      <p className="flex min-h-10 items-center gap-2 rounded-md bg-surface-2/60 px-3.5 py-2 text-sm text-ink-2"><Users size={15} className="shrink-0" aria-hidden />{npi ? <>Enfants liés au NPI <span className="font-mono">{npi}</span>{fiche ? ` · ${fiche.enfantsLies}` : ""}</> : "Déduit du NPI"}</p>
                    ) : (
                      <p className="flex min-h-10 items-center gap-2 rounded-md bg-surface-2/60 px-3.5 py-2 text-sm text-ink-2"><UserRound size={15} className="shrink-0" aria-hidden />{fiche?.apprenant ? `${fiche.apprenant.prenoms} ${fiche.apprenant.nom} · ${fiche.apprenant.id}` : "Déduit du NPI"}</p>
                    )}
                  </div>
                </div>
                <AnimatePresence>
                  {erreurs[b.cle] && <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-2 text-xs text-critical" role="alert">{erreurs[b.cle]}</motion.p>}
                </AnimatePresence>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      <Button type="button" variante="secondaire" taille="sm" icone={Plus} className="h-10 w-full sm:w-auto" disabled={valeur.length >= 6} onClick={() => onChange([...valeur, brouillonVide()])}>
        Ajouter une habilitation
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ Recherche d'établissement (combobox) */

function ChoixEtablissement({ id, valeur, onChange }: { id: string; valeur: { id: string; nom: string } | null; onChange: (e: { id: string; nom: string } | null) => void }) {
  const [saisie, setSaisie] = useState("");
  const [q, setQ] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const idListe = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const t = setTimeout(() => setQ(saisie.trim()), 250); return () => clearTimeout(t); }, [saisie]);
  useEffect(() => {
    const f = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOuvert(false); };
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, []);
  const res = useEtablissementsRef(q, ouvert && q.length >= 2);
  const liste = q.length >= 2 ? res.data ?? [] : [];
  const choisir = (e: { id: string; nom: string }) => { onChange(e); setOuvert(false); setSaisie(""); };

  if (valeur && !ouvert) {
    return (
      <div className="flex min-h-10 items-center gap-2 rounded-md border border-line bg-surface-2/50 py-1 pl-3 pr-1">
        <Check size={15} className="shrink-0 text-success" aria-hidden />
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{valeur.nom}</span><span className="block truncate font-mono text-[11px] text-ink-muted">{valeur.id}</span></span>
        <Button type="button" variante="fantome" taille="sm" onClick={() => { setOuvert(true); setSaisie(""); }}>Changer</Button>
      </div>
    );
  }
  return (
    <div ref={ref} className="relative">
      <Search size={15} className="pointer-events-none absolute left-3 top-[13px] text-ink-muted" aria-hidden />
      <input
        id={id} type="search" role="combobox" aria-expanded={ouvert && liste.length > 0} aria-controls={idListe} aria-autocomplete="list" autoComplete="off"
        value={saisie} placeholder="Nom, commune ou code…" className={cn(CHAMP, "pl-9")}
        onFocus={() => setOuvert(true)}
        onChange={(e) => { setSaisie(e.target.value); setOuvert(true); setActif(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActif((a) => Math.min(a + 1, liste.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActif((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && liste[actif]) { e.preventDefault(); choisir(liste[actif]!); }
          else if (e.key === "Escape") { setOuvert(false); }
        }}
      />
      <AnimatePresence>
        {ouvert && saisie.trim().length >= 2 && (
          <motion.ul id={idListe} role="listbox" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
            className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-line/70 bg-surface p-1 shadow-pop">
            {res.isFetching && liste.length === 0 ? (
              <li className="px-3 py-2.5 text-sm text-ink-muted">Recherche…</li>
            ) : liste.length === 0 ? (
              <li className="px-3 py-2.5 text-sm text-ink-muted">Aucun établissement ne correspond.</li>
            ) : liste.map((e, i) => (
              <li key={e.id} role="option" aria-selected={i === actif}>
                <button type="button" onMouseEnter={() => setActif(i)} onClick={() => choisir(e)} className={cn("flex w-full flex-col items-start rounded-md px-3 py-2 text-left", i === actif ? "bg-blue-soft" : "hover:bg-surface-2")}>
                  <span className="w-full truncate text-sm font-medium text-ink">{e.nom}</span>
                  <span className="w-full truncate text-xs text-ink-muted">{e.commune} · {e.circonscription} · <span className="font-mono">{e.id}</span></span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
      {valeur && <button type="button" onClick={() => setOuvert(false)} className="mt-1 text-xs text-ink-muted underline-offset-2 hover:underline">Garder {valeur.nom}</button>}
    </div>
  );
}
