"use client";

import { ChevronLeft, ChevronRight, LocateFixed, MapPin, Search, School, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { PagePublique } from "@/components/public/CadrePublic";
import { AnimatePresence, EASE, motion } from "@/components/motion";
import { CarteBenin } from "@/components/map/CarteBenin";
import { EtatVide, Squelette } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { NIVEAUX_PUBLICS, STATUTS, useAnnuaire, type Filtres, type NiveauPublic, type StatutEtablissement } from "@/lib/api/public";
import { DEPARTEMENTS } from "@beile/simulation/territoire";

export default function PageEtablissements() {
  return <Suspense><Annuaire /></Suspense>;
}

const lireFiltres = (p: URLSearchParams): Filtres => ({
  q: p.get("q") ?? undefined,
  departement: p.get("departement") ?? undefined,
  commune: p.get("commune") ?? undefined,
  niveau: (p.get("niveau") as NiveauPublic | null) ?? undefined,
  statut: (p.get("statut") as StatutEtablissement | null) ?? undefined,
  lat: p.get("lat") ? Number(p.get("lat")) : undefined,
  lng: p.get("lng") ? Number(p.get("lng")) : undefined,
  page: p.get("page") ? Number(p.get("page")) : undefined,
});

function Annuaire() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filtres = useMemo(() => lireFiltres(new URLSearchParams(params.toString())), [params]);
  const [saisie, setSaisie] = useState(filtres.q ?? "");
  const [geo, setGeo] = useState<"attente" | "refus" | null>(null);
  const [vue, setVue] = useState<"liste" | "carte">("liste");
  const { data, isPending, isError, refetch, isFetching } = useAnnuaire(filtres);

  const changer = (maj: Partial<Filtres>) => {
    const suivant: Filtres = { ...filtres, ...maj, page: "page" in maj ? maj.page : 1 };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(suivant)) if (v !== undefined && v !== "" && !(k === "page" && v === 1)) p.set(k, String(v));
    router.replace(`${pathname}${p.toString() ? `?${p}` : ""}`, { scroll: false });
  };

  // Recherche par nom : déclenchée après une courte pause de frappe.
  useEffect(() => {
    const t = setTimeout(() => { if ((filtres.q ?? "") !== saisie.trim()) changer({ q: saisie.trim() || undefined }); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saisie]);

  const autourDeMoi = () => {
    if (!("geolocation" in navigator)) { setGeo("refus"); return; }
    setGeo("attente");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGeo(null); changer({ lat: Number(pos.coords.latitude.toFixed(4)), lng: Number(pos.coords.longitude.toFixed(4)), departement: undefined }); },
      () => setGeo("refus"),
      { timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const pres = filtres.lat !== undefined && filtres.lng !== undefined;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.parPage)) : 1;
  const points = (data?.etablissements ?? []).filter((e) => e.lat != null && e.lng != null).map((e) => ({ id: e.id, lat: e.lat!, lng: e.lng!, libelle: e.nom, mis: true }));
  const filtresActifs = [filtres.q, filtres.commune, filtres.departement, filtres.niveau, filtres.statut, pres ? "pres" : undefined].filter(Boolean).length;

  return (
    <PagePublique large surtitre="Service public" titre="Trouver un établissement" intro="Écoles, collèges, lycées et centres de formation de tout le pays : cherchez par nom, par lieu ou autour de vous.">
      {/* Recherche */}
      <div className="rounded-2xl border border-line/70 bg-surface p-3 shadow-float sm:p-4">
        <div className="grid gap-2.5 md:grid-cols-[1fr_auto_auto_auto]">
          <label className="relative block">
            <span className="sr-only">Nom de l'établissement</span>
            <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
            <input value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder="Nom de l'établissement, ex. CEG Les Rôniers"
              className="h-12 w-full rounded-xl border border-line bg-bg pl-11 pr-10 text-[15px] text-ink outline-none transition focus:border-blue focus:ring-4 focus:ring-blue/15" />
            {saisie && <button onClick={() => setSaisie("")} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted hover:bg-surface-2" aria-label="Effacer"><X size={16} /></button>}
          </label>
          <select value={filtres.departement ?? ""} onChange={(e) => changer({ departement: e.target.value || undefined, commune: undefined, lat: undefined, lng: undefined })} aria-label="Département"
            className="h-12 rounded-xl border border-line bg-bg px-3.5 text-[14px] text-ink outline-none focus:border-blue focus:ring-4 focus:ring-blue/15">
            <option value="">Tous les départements</option>
            {[...DEPARTEMENTS].sort((a, b) => a.nom.localeCompare(b.nom, "fr")).map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
          </select>
          <select value={filtres.statut ?? ""} onChange={(e) => changer({ statut: (e.target.value || undefined) as StatutEtablissement | undefined })} aria-label="Statut"
            className="h-12 rounded-xl border border-line bg-bg px-3.5 text-[14px] text-ink outline-none focus:border-blue focus:ring-4 focus:ring-blue/15">
            <option value="">Tous statuts</option>
            {Object.entries(STATUTS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button onClick={pres ? () => changer({ lat: undefined, lng: undefined }) : autourDeMoi}
            className={cn("inline-flex h-12 items-center justify-center gap-2 rounded-xl px-4 text-[14px] font-semibold transition", pres ? "bg-teal text-white hover:bg-teal/90" : "bg-navy text-white hover:bg-navy-deep")}>
            {geo === "attente" ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <LocateFixed size={17} aria-hidden />}
            {pres ? "Autour de moi ✓" : "Autour de moi"}
          </button>
        </div>
        <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Niveau">
          {[{ valeur: undefined, libelle: "Tous niveaux" }, ...NIVEAUX_PUBLICS].map((n) => {
            const actif = filtres.niveau === n.valeur;
            return (
              <button key={n.libelle} role="radio" aria-checked={actif} onClick={() => changer({ niveau: n.valeur as NiveauPublic | undefined })}
                className={cn("shrink-0 rounded-full px-4 py-2 text-[13px] font-medium ring-1 ring-inset transition", actif ? "bg-blue-soft text-accent-ink ring-blue/30" : "text-ink-2 ring-line hover:bg-surface-2")}>
                {n.libelle}
              </button>
            );
          })}
        </div>
        {geo === "refus" && <p className="mt-2 text-[13px] text-warning">Position indisponible : autorisez la localisation dans votre navigateur, ou choisissez un département.</p>}
      </div>

      {/* Résultats */}
      <div className="mt-6 flex items-center justify-between gap-3">
        <p className="text-[14px] text-ink-2" aria-live="polite">
          {isPending ? "Recherche…" : data ? <><strong className="text-ink">{data.total.toLocaleString("fr-FR")}</strong> établissement{data.total > 1 ? "s" : ""}{pres ? ", du plus proche au plus éloigné" : ""}</> : null}
          {isFetching && !isPending && <span className="ml-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue border-t-transparent align-middle" />}
        </p>
        <div className="flex items-center gap-2">
          {filtresActifs > 0 && <button onClick={() => { setSaisie(""); router.replace(pathname, { scroll: false }); }} className="text-[13px] font-medium text-accent-ink hover:underline">Effacer les filtres</button>}
          <div className="inline-flex rounded-full bg-surface-2 p-1 lg:hidden">
            {(["liste", "carte"] as const).map((v) => (
              <button key={v} onClick={() => setVue(v)} className={cn("rounded-full px-3.5 py-1.5 text-[13px] font-medium capitalize", vue === v ? "bg-surface text-ink shadow-sm" : "text-ink-muted")}>{v}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className={cn("min-w-0", vue === "carte" && "hidden lg:block")}>
          {isError ? (
            <EtatVide icone={School} titre="La recherche n'a pas abouti" texte="Vérifiez votre connexion puis réessayez." action={<button onClick={() => refetch()} className="rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white">Réessayer</button>} />
          ) : isPending ? (
            <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 6 }, (_, i) => <Squelette key={i} className="h-28 rounded-2xl" />)}</div>
          ) : data && data.etablissements.length === 0 ? (
            <EtatVide icone={Search} titre="Aucun établissement ne correspond" texte="Élargissez la recherche : retirez un filtre ou vérifiez l'orthographe." />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              <AnimatePresence mode="popLayout" initial={false}>
                {data?.etablissements.map((e, i) => (
                  <motion.li key={e.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 10) * 0.03, duration: 0.35, ease: EASE } }} exit={{ opacity: 0, scale: 0.98 }}>
                    <Link href={`/etablissements/${encodeURIComponent(e.id)}`} className="group flex h-full flex-col rounded-2xl border border-line/70 bg-surface p-4 shadow-float transition hover:-translate-y-0.5 hover:shadow-pop">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-display text-[15.5px] font-bold leading-snug text-ink group-hover:text-accent-ink">{e.nom}</p>
                        {e.distanceKm != null && <span className="shrink-0 rounded-full bg-teal/10 px-2.5 py-1 text-[12px] font-semibold text-teal">{e.distanceKm.toLocaleString("fr-FR")} km</span>}
                      </div>
                      <p className="mt-1 text-[13px] text-ink-2">{e.typeLibelle} · {STATUTS[e.statut]}</p>
                      <p className="mt-auto flex items-center gap-1.5 pt-3 text-[12.5px] text-ink-muted"><MapPin size={14} aria-hidden /> {e.commune}{e.departement ? `, ${e.departement}` : ""}</p>
                    </Link>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
          {data && pages > 1 && (
            <nav className="mt-6 flex items-center justify-between gap-3" aria-label="Pages de résultats">
              <button disabled={(filtres.page ?? 1) <= 1} onClick={() => changer({ page: (filtres.page ?? 1) - 1 })} className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-medium text-ink ring-1 ring-inset ring-line hover:bg-surface disabled:opacity-40"><ChevronLeft size={16} /> Précédent</button>
              <span className="text-[13px] text-ink-muted">Page {filtres.page ?? 1} sur {pages.toLocaleString("fr-FR")}</span>
              <button disabled={(filtres.page ?? 1) >= pages} onClick={() => changer({ page: (filtres.page ?? 1) + 1 })} className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-medium text-ink ring-1 ring-inset ring-line hover:bg-surface disabled:opacity-40">Suivant <ChevronRight size={16} /></button>
            </nav>
          )}
        </div>
        <aside className={cn("min-w-0 lg:sticky lg:top-6 lg:self-start", vue === "liste" && "hidden lg:block")}>
          <div className="overflow-hidden rounded-2xl border border-line/70 bg-surface p-3 shadow-float">
            <CarteBenin niveau="communes" focusDepartement={filtres.departement} points={points} selection={filtres.commune ?? null}
              onSelect={(id) => changer({ commune: id, lat: undefined, lng: undefined })} hauteur={filtres.departement ? 420 : 560} className="w-full" />
            <p className="px-1 pb-1 pt-2 text-[12px] text-ink-muted">Les points situent les établissements de la page affichée.</p>
          </div>
        </aside>
      </div>
    </PagePublique>
  );
}
