"use client";

import { Bell, CalendarX2, ChevronRight, Database, Fingerprint, School, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Courbes } from "@/components/charts/Graphiques";
import { Badge, Card, CardHeader, Etiquette } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { date, heure, nombre } from "@/lib/format";
import { useFamille } from "@/lib/sources";
import { absences, ageAu, moyenneGenerale, moyennesParMatiere } from "@/lib/scolarite";
import { useAcces, useDemo, useProfil } from "@/lib/store";

export default function EspaceFamille() {
  const profil = useProfil();
  const { enfants, chargement, base } = useFamille();
  const acces = useAcces();
  const notifications = useDemo((s) => s.notifications).filter((n) => n.destinataireNpi === profil.npi);
  const [choisi, setChoisi] = useState(0);
  const [justifiees, setJustifiees] = useState<Set<string>>(new Set());
  const enfant = enfants[choisi];

  // Chaque consultation d'un dossier d'enfant passe par le contrôle d'accès et est journalisée.
  const idEnfant = enfant?.apprenant.id;
  useEffect(() => {
    // En mode connecté, la décision est prise et journalisée par l'API (base nationale).
    if (idEnfant && !base) acces.demander({ ressource: { type: "dossier_apprenant", apprenantId: idEnfant }, finalite: "suivi_familial" }, "Consultation familiale", idEnfant);
  }, [idEnfant]); // eslint-disable-line react-hooks/exhaustive-deps

  if (chargement) return <div className="space-y-4" aria-busy><div className="h-24 animate-pulse rounded-xl bg-surface-2" /><div className="h-64 animate-pulse rounded-xl bg-surface-2" /></div>;
  if (!enfant) return <Card>Aucun enfant rattaché à votre identité.</Card>;
  const a = enfant.apprenant;
  const evts = enfant.evenements;
  const t1 = moyenneGenerale(evts, a.id, 1);
  const t2 = moyenneGenerale(evts, a.id, 2);
  const abs = absences(evts, a.id);
  const matieres = moyennesParMatiere(evts, a.id, 2);
  const matieresT1 = moyennesParMatiere(evts, a.id, 1);
  const recentes = notifications.slice(0, 3);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-bold text-ink">Bonjour {profil.nomAffiche.split(" ")[0]}</h1>
        <p className="mt-1 text-[14px] text-ink-2">Vos enfants sont rattachés à votre identité par le registre national : vous ne voyez qu'eux, et eux seuls.</p>
      </div>

      {recentes.length > 0 && (
        <Link href="/famille/notifications" className="block animate-slide-up rounded-xl border border-line/70 bg-surface p-4 shadow-float transition hover:-translate-y-0.5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md text-white" style={{ background: "var(--acc)" }}><Bell size={18} aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-ink">{recentes[0]!.titre}</p>
              <p className="truncate text-[13px] text-ink-2">{recentes[0]!.texte}</p>
            </div>
            <span className="text-[12px] tabular text-ink-muted">{heure(recentes[0]!.horodatage)}</span>
            <ChevronRight size={16} className="text-ink-muted" aria-hidden />
          </div>
        </Link>
      )}

      <div role="tablist" aria-label="Mes enfants" className="flex gap-2 overflow-x-auto pb-1">
        {enfants.map((e, i) => (
          <button key={e.apprenant.id} role="tab" aria-selected={i === choisi} onClick={() => setChoisi(i)}
            className={cn("flex shrink-0 items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-left transition", i === choisi ? "border-transparent text-white shadow-float" : "border-line/70 bg-surface text-ink hover:bg-surface-2")}
            style={i === choisi ? { background: "var(--acc)" } : undefined}>
            <span className={cn("flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-bold", i === choisi ? "bg-white/20" : "bg-surface-2")}>{e.apprenant.prenoms[0]}</span>
            <span><span className="block text-[14px] font-semibold">{e.apprenant.prenoms}</span><span className={cn("block text-[12px]", i === choisi ? "text-white/80" : "text-ink-muted")}>{e.classe?.libelle ?? "—"}</span></span>
          </button>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-display text-[22px] font-bold text-ink">{a.prenoms} {a.nom}</p>
            <p className="text-[13.5px] text-ink-2">{ageAu(a.dateNaissance)} ans · {enfant.classe?.libelle} · {enfant.etablissementNom}</p>
          </div>
          <span className="flex flex-wrap gap-1.5"><Badge ton="succes" icone={Fingerprint}>Identité vérifiée</Badge>{base && <Badge ton="info" icone={Database}>Base nationale</Badge>}</span>
        </div>
        <dl className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-surface-2/70 p-3"><dt className="text-[11.5px] text-ink-muted">Moyenne T2</dt><dd className="mt-0.5 font-display text-[22px] font-bold tabular text-ink">{nombre(t2, 2)}</dd></div>
          <div className="rounded-lg bg-surface-2/70 p-3"><dt className="text-[11.5px] text-ink-muted">Évolution</dt><dd className={cn("mt-0.5 font-display text-[22px] font-bold tabular", (t2 ?? 0) >= (t1 ?? 0) ? "text-success" : "text-critical")}>{t1 != null && t2 != null ? `${t2 >= t1 ? "+" : ""}${nombre(t2 - t1, 2)}` : "—"}</dd></div>
          <div className="rounded-lg bg-surface-2/70 p-3"><dt className="text-[11.5px] text-ink-muted">Absences</dt><dd className="mt-0.5 font-display text-[22px] font-bold tabular text-ink">{abs.length}</dd></div>
        </dl>
      </Card>

      <Card>
        <CardHeader icon={TrendingUp} title="Résultats par matière" subtitle="Moyennes du 1er et du 2e trimestre" />
        <ul className="space-y-3">
          {matieres.map((m) => {
            const avant = matieresT1.find((x) => x.matiere === m.matiere)?.moyenne;
            return (
              <li key={m.matiere}>
                <div className="flex items-baseline justify-between text-[13.5px]">
                  <span className="text-ink">{m.matiere}</span>
                  <span className="tabular"><span className="text-[12px] text-ink-muted">{avant != null ? `${nombre(avant, 1)} → ` : ""}</span><span className="font-semibold text-ink">{nombre(m.moyenne, 1)}</span></span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-surface-2"><div className="h-2 rounded-full transition-[width] duration-500" style={{ width: `${(m.moyenne / 20) * 100}%`, background: m.moyenne >= 10 ? "var(--acc)" : "var(--critical)" }} /></div>
              </li>
            );
          })}
        </ul>
        <div className="mt-6">
          <Etiquette>Progression générale</Etiquette>
          <Courbes hauteur={180} formater={(v) => nombre(v, 1)} series={[{ nom: "Moyenne générale", points: [{ x: "1er trimestre", y: t1 }, { x: "2e trimestre", y: t2 }] }]} />
        </div>
      </Card>

      <Card>
        <CardHeader icon={CalendarX2} title="Absences" subtitle="Vous pouvez transmettre un justificatif à l'établissement" />
        {abs.length === 0 ? <p className="text-[13.5px] text-ink-muted">Aucune absence cette année.</p> : (
          <ul className="divide-y divide-line/60">
            {abs.slice(0, 6).map((x) => {
              const ok = x.justifiee || justifiees.has(x.id);
              return (
                <li key={x.id} className="flex items-center gap-3 py-2.5 text-[13.5px]">
                  <span className="flex-1 text-ink">{date(x.date)}</span>
                  {ok ? <Badge ton="succes">{x.justifiee ? "Justifiée" : "Justificatif transmis"}</Badge> : (
                    <button onClick={() => setJustifiees((s) => new Set(s).add(x.id))} className="rounded-md px-3 py-1.5 text-[12.5px] font-semibold ring-1 ring-inset ring-line hover:bg-surface-2" style={{ color: "var(--acc)" }}>Justifier</button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <p className="flex items-center gap-2 text-[12px] text-ink-muted"><School size={14} aria-hidden /> Chaque consultation est enregistrée au titre du suivi familial, conformément à la protection des données.</p>
    </div>
  );
}
