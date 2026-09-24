"use client";

import type { Evenement } from "@beile/contracts";
import { ArrowRightLeft, Award, BookOpenCheck, CalendarCheck, GraduationCap, School, Sparkles, type LucideIcon } from "lucide-react";
import { useMemo } from "react";
import { Card, CardHeader, Etiquette } from "@/components/ui/primitives";
import { date, nombre } from "@/lib/format";
import { absences, moyenneGenerale, moyennesParMatiere } from "@/lib/scolarite";
import { evenementsApprenant, notesEffectives, situationApprenant } from "@beile/simulation/projections";
import { useMonde, useProfil } from "@/lib/store";

interface Jalon { date: string; titre: string; detail: string; icone: LucideIcon; accent?: boolean; source: string }

const SOURCE: Record<string, string> = { beile: "BEILE", educmaster: "EducMaster", examens: "Système d'examens", registre_national: "Registre national" };

export default function Passeport() {
  const monde = useMonde();
  const profil = useProfil();
  const h = profil.habilitations.find((x) => x.role === "apprenant");
  const id = h?.perimetre.niveau === "personnel" ? h.perimetre.apprenantId : "";
  const a = monde.apprenants.find((x) => x.id === id);
  const situation = a ? situationApprenant(monde, monde.evenements, a.id) : null;
  const etab = (eid: string | null) => monde.etablissements.find((e) => e.id === eid)?.nom ?? (eid ? eid : "École primaire (hors pilote)");

  const jalons = useMemo<Jalon[]>(() => {
    if (!a) return [];
    const evts = evenementsApprenant(monde.evenements, a.id);
    const res: Jalon[] = [];
    const parTrimestre = new Map<string, Evenement[]>();
    for (const e of evts) {
      const src = SOURCE[e.source] ?? e.source;
      switch (e.type) {
        case "INSCRIPTION": res.push({ date: e.survenuLe, titre: `Inscription en ${monde.classes.find((c) => c.id === e.classeId)?.libelle}`, detail: etab(e.etablissementId), icone: School, source: src }); break;
        case "TRANSFERT": res.push({ date: e.survenuLe, titre: "Transfert d'établissement", detail: `${etab(e.deEtablissementId)} → ${etab(e.versEtablissementId)} · le parcours vous a suivi·e, sans ressaisie`, icone: ArrowRightLeft, accent: true, source: src }); break;
        case "PASSAGE": res.push({ date: e.survenuLe, titre: `Passage en ${e.versNiveau}`, detail: `Décision du conseil de classe · année ${e.anneeScolaire}`, icone: GraduationCap, source: src }); break;
        case "RESULTAT_EXAMEN": res.push({ date: e.survenuLe, titre: `${e.examen} ${e.admis ? "obtenu" : "non obtenu"}`, detail: `Session ${e.session} · moyenne ${nombre(e.moyenne, 2)}/20`, icone: BookOpenCheck, source: src }); break;
        case "CERTIFICATION": res.push({ date: e.survenuLe, titre: `Diplôme délivré : ${e.examen}`, detail: `Mention ${e.mention} · preuve vérifiable en ligne`, icone: Award, accent: true, source: src }); break;
        case "EVALUATION": {
          const k = `${e.anneeScolaire}-T${e.trimestre}`;
          parTrimestre.set(k, [...(parTrimestre.get(k) ?? []), e]);
          break;
        }
      }
    }
    for (const [k, l] of parTrimestre) {
      const t = Number(k.slice(-1));
      const moy = moyenneGenerale(monde.evenements, a.id, t);
      const derniere = l.map((x) => x.survenuLe).sort().at(-1)!;
      res.push({ date: derniere, titre: `Bilan du ${t === 1 ? "1er" : "2e"} trimestre`, detail: `${l.length} évaluations · moyenne générale ${nombre(moy, 2)}/20`, icone: CalendarCheck, source: "BEILE" });
    }
    return res.sort((x, y) => y.date.localeCompare(x.date));
  }, [monde, a]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!a || !situation) return null;
  const matieres = moyennesParMatiere(monde.evenements, a.id, 2).sort((x, y) => y.moyenne - x.moyenne);
  const nbEval = notesEffectives(monde.evenements).filter((e) => e.apprenantId === a.id).length;

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-xl text-white shadow-pop" style={{ background: "linear-gradient(135deg, var(--acc), #0a3764)" }}>
        <div className="p-5 sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">Passeport éducatif</p>
          <p className="mt-2 font-display text-[26px] font-bold leading-tight">{a.prenoms} {a.nom}</p>
          <p className="mt-1 text-[14px] text-white/85">{situation.classe?.libelle} · {etab(situation.etablissementId)}</p>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {[["Moyenne T2", nombre(moyenneGenerale(monde.evenements, a.id, 2), 2)], ["Évaluations", String(nbEval)], ["Absences", String(absences(monde.evenements, a.id).length)]].map(([l, v]) => (
              <div key={l} className="rounded-lg bg-white/12 px-3 py-2.5 backdrop-blur"><p className="text-[11px] text-white/75">{l}</p><p className="font-display text-[20px] font-bold tabular">{v}</p></div>
            ))}
          </div>
          <p className="mt-4 font-mono text-[11px] text-white/70">Identifiant éducatif {a.id} · rattaché au registre national</p>
        </div>
      </div>

      <Card>
        <CardHeader icon={Sparkles} title="Mes points forts ce trimestre" subtitle="Moyennes du 2e trimestre, de la plus haute à la plus basse" />
        <div className="flex flex-wrap gap-2">
          {matieres.map((m, i) => (
            <span key={m.matiere} className="rounded-md px-3 py-1.5 text-[13px] font-medium" style={i < 3 ? { background: "var(--acc-doux)", color: "var(--acc)" } : undefined}>
              {m.matiere} <span className="font-semibold tabular">{nombre(m.moyenne, 1)}</span>
            </span>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader icon={GraduationCap} title="Mon parcours" subtitle="Reconstitué à partir d'événements vérifiables, quelle que soit l'école fréquentée" />
        <ol className="relative ml-3 border-l-2 border-line/80 pl-7">
          {jalons.map((j, i) => (
            <li key={i} className="relative animate-row pb-6 last:pb-0" style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
              <span className="absolute -left-[42px] flex h-8 w-8 items-center justify-center rounded-full ring-4 ring-surface" style={{ background: j.accent ? "var(--acc)" : "var(--surface-2)", color: j.accent ? "#fff" : "var(--acc)" }}>
                <j.icone size={15} aria-hidden />
              </span>
              <Etiquette>{date(j.date)} · source {j.source}</Etiquette>
              <p className="mt-0.5 text-[15px] font-semibold text-ink">{j.titre}</p>
              <p className="text-[13.5px] text-ink-2">{j.detail}</p>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
