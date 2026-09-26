"use client";

import type { Examen, ResultatExamenPublic } from "@beile/contracts";
import { CalendarClock, CircleAlert, CircleCheckBig, CircleX, GraduationCap, ScanLine, Search, ShieldCheck, type LucideIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Cascade, EASE, Element, EntreePage, motion } from "@/components/motion";
import { Button, Card, Segmente, Squelette } from "@/components/ui/primitives";
import { useResultatExamen } from "@/lib/api/public";
import { NOM_EXAMEN } from "@/lib/api/parcours";
import { cn } from "@/lib/cn";
import { nombre } from "@/lib/format";
import { ErreurApi } from "@/lib/http";
import { useThemeEspace } from "@/lib/useSombre";

/** Les trois examens nationaux, dans l'ordre du parcours. */
const EXAMENS: { valeur: Examen; libelle: string }[] = [
  { valeur: "CEP", libelle: "CEP" },
  { valeur: "BEPC", libelle: "BEPC" },
  { valeur: "BAC", libelle: "BAC" },
];

/* Mapping central des quatre verdicts du service e-résultat. */
const VERDICT: Record<ResultatExamenPublic["statut"], { icone: LucideIcon; titre: string; couleur: string; fond: string; bord: string }> = {
  admis: { icone: CircleCheckBig, titre: "Admis", couleur: "text-success", fond: "bg-success-bg", bord: "border-success/40" },
  non_admis: { icone: CircleX, titre: "Non admis", couleur: "text-critical", fond: "bg-critical-bg", bord: "border-critical/40" },
  session_non_publiee: { icone: CalendarClock, titre: "Résultats non publiés", couleur: "text-info", fond: "bg-info-bg", bord: "border-info/40" },
  introuvable: { icone: CircleAlert, titre: "Numéro de table introuvable", couleur: "text-warning", fond: "bg-warning-bg", bord: "border-warning/40" },
};

export default function Resultats() {
  return (
    <EntreePage>
      <Suspense fallback={<RechercheChargement />}><Recherche /></Suspense>
    </EntreePage>
  );
}

function Recherche() {
  useThemeEspace(false);
  const params = useSearchParams();
  const router = useRouter();
  // Valeurs engagées par la dernière recherche soumise : source de la requête, synchronisée dans l'URL.
  const [criteres, setCriteres] = useState<{ examen: Examen; session: string; table: string }>(() => ({
    examen: (EXAMENS.find((e) => e.valeur === params.get("examen"))?.valeur ?? "BEPC"),
    session: params.get("session")?.slice(0, 40) ?? "",
    table: params.get("table")?.slice(0, 20) ?? "",
  }));
  const [fExamen, setFExamen] = useState<Examen>(criteres.examen);
  const [fSession, setFSession] = useState(criteres.session);
  const [fTable, setFTable] = useState(criteres.table);
  const q = useResultatExamen(criteres.examen, criteres.session, criteres.table);
  const pret = criteres.table.length > 0 && criteres.session.length > 0;

  const soumettre = (e: React.FormEvent) => {
    e.preventDefault();
    const c = { examen: fExamen, session: fSession.trim().slice(0, 40), table: fTable.trim().slice(0, 20) };
    setCriteres(c);
    router.replace(`/resultats?examen=${c.examen}&session=${encodeURIComponent(c.session)}&table=${encodeURIComponent(c.table)}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <motion.span initial={{ scale: 0.6, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }}
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-navy text-white shadow-float dark:bg-blue dark:text-navy-deep">
          <GraduationCap size={30} aria-hidden />
        </motion.span>
        <h1 className="mt-4 text-[26px] font-bold leading-tight text-ink sm:text-[30px]">Résultats d&apos;examens nationaux</h1>
        <p className="mx-auto mt-2 max-w-lg text-[15px] text-ink-2">Saisissez votre numéro de table pour connaître le verdict de la session. Service gratuit, sans compte.</p>
      </div>

      <Card>
        <form onSubmit={soumettre} className="space-y-4">
          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink">Examen</span>
            <Segmente label="Examen" options={EXAMENS} valeur={fExamen} onChange={setFExamen} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Session</span>
              <input value={fSession} onChange={(e) => setFSession(e.target.value)} placeholder="Juin 2026" autoComplete="off"
                className="h-12 w-full rounded-md border border-line bg-surface px-3.5 text-[15px] text-ink outline-none transition focus:border-blue focus:ring-4 focus:ring-blue/15" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Numéro de table</span>
              <span className="relative block">
                <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
                <input value={fTable} onChange={(e) => setFTable(e.target.value.replace(/[^0-9A-Za-z-]/g, ""))} placeholder="2026000123" autoComplete="off" inputMode="numeric"
                  className="h-12 w-full rounded-md border border-line bg-surface pl-10 pr-3.5 font-mono text-[15px] text-ink outline-none transition focus:border-blue focus:ring-4 focus:ring-blue/15" />
              </span>
            </label>
          </div>
          <div className="flex justify-end">
            <Button type="submit" taille="lg" icone={Search} disabled={!fTable.trim() || !fSession.trim()}>Consulter mon résultat</Button>
          </div>
        </form>
      </Card>

      {pret && q.isPending ? <Chargement /> : pret && q.isError ? (
        <Card className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-ink-muted"><CircleAlert size={24} aria-hidden /></span>
          <p className="mt-3 text-[17px] font-semibold text-ink">{q.error instanceof ErreurApi && q.error.statut === 429 ? "Trop de consultations en peu de temps" : "Consultation impossible pour le moment"}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-2">{q.error instanceof ErreurApi && q.error.statut === 429 ? "Le service limite le nombre de recherches par minute pour se protéger des devinettes. Réessayez dans un instant." : `${q.error.message}. Aucun verdict n'est donné sans réponse du registre national des examens.`}</p>
        </Card>
      ) : pret && q.data ? <Verdict r={q.data} /> : null}

      {!pret && (
        <Cascade className="grid gap-3 sm:grid-cols-3">
          {[
            { icone: ScanLine, titre: "1. Repérez", texte: "Votre numéro de figure est imprimé sur la carte de convocation." },
            { icone: CalendarClock, titre: "2. Attendez", texte: "Le verdict n'apparaît qu'après la publication officielle de la session." },
            { icone: CircleCheckBig, titre: "3. Consultez", texte: "Admis ou non admis, avec le centre et la mention — en une seconde." },
          ].map((e) => (
            <Element key={e.titre}>
              <div className="rounded-lg border border-line/70 bg-surface p-4 shadow-soft">
                <e.icone size={18} className="text-accent-ink" aria-hidden />
                <p className="mt-2 text-sm font-semibold text-ink">{e.titre}</p>
                <p className="mt-0.5 text-[13px] text-ink-2">{e.texte}</p>
              </div>
            </Element>
          ))}
        </Cascade>
      )}
    </div>
  );
}

function Verdict({ r }: { r: ResultatExamenPublic }) {
  const v = VERDICT[r.statut];
  const positif = r.statut === "admis";
  const lignes: readonly (readonly [string, string])[] =
    r.statut === "admis" ? [["Titulaire", r.titulaire], ["Diplôme", `${NOM_EXAMEN[r.examen] ?? r.examen}`], ["Session", r.session], ["Centre", r.centre], ["Numéro de table", r.numeroTable], ["Moyenne", `${nombre(r.moyenne, 2)} / 20`], ["Mention", r.mention]]
    : r.statut === "non_admis" ? [["Titulaire", r.titulaire], ["Examen", `${NOM_EXAMEN[r.examen] ?? r.examen}`], ["Session", r.session], ["Centre", r.centre], ["Numéro de table", r.numeroTable]]
    : [];
  return (
    <motion.div key={r.statut} initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5, ease: EASE }}>
      <Card className={cn("border-2 text-center", v.bord)}>
        <div className="relative mx-auto h-20 w-20">
          {positif && <motion.span className="absolute inset-0 rounded-full bg-success/25" initial={{ scale: 0.8, opacity: 0.8 }} animate={{ scale: 1.8, opacity: 0 }} transition={{ duration: 1.2, delay: 0.25, ease: "easeOut" }} aria-hidden />}
          <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 380, damping: 16, delay: 0.1 }} className={cn("relative flex h-20 w-20 items-center justify-center rounded-full", v.fond, v.couleur)}>
            <v.icone size={40} aria-hidden />
          </motion.span>
        </div>
        <h2 className={cn("mt-4 text-[26px] font-bold leading-tight sm:text-[28px]", v.couleur)} aria-live="polite">{v.titre}</h2>
        {"explication" in r && <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">{r.explication}</p>}

        {lignes.length > 0 && (
          <Cascade className="mx-auto mt-6 max-w-md space-y-0 text-left">
            {lignes.map(([l, val]) => (
              <Element key={l} className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 text-sm">
                <span className="shrink-0 text-ink-muted">{l}</span>
                <span className={cn("min-w-0 break-words text-right font-semibold text-ink", l === "Numéro de table" && "font-mono text-[12.5px]")}>{val}</span>
              </Element>
            ))}
          </Cascade>
        )}

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-ink-muted">
          <ShieldCheck size={13} aria-hidden /> Verdict officiel · registre national des examens et concours
        </p>
      </Card>
    </motion.div>
  );
}

function Chargement() {
  return (
    <Card className="text-center" aria-busy>
      <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
        <motion.span className="absolute inset-0 rounded-full border-2 border-blue/30" animate={{ scale: [1, 1.25, 1], opacity: [0.8, 0, 0.8] }} transition={{ duration: 1.6, repeat: Infinity }} aria-hidden />
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-soft text-accent-ink"><Search size={34} aria-hidden /></span>
      </div>
      <p className="mt-4 text-[17px] font-semibold text-ink">Interrogation du registre des examens…</p>
      <div className="mx-auto mt-6 max-w-md space-y-2.5">{[0, 1, 2].map((i) => <Squelette key={i} className="h-6" />)}</div>
    </Card>
  );
}

function RechercheChargement() {
  return <div className="mx-auto max-w-md space-y-3 py-10"><Squelette className="h-10 w-2/3" /><Squelette className="h-28" /></div>;
}
