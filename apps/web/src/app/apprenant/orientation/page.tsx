"use client";

import { Compass, Info, UserCheck } from "lucide-react";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { nombre } from "@/lib/format";
import { moyennesParMatiere } from "@/lib/scolarite";
import { usePasseport } from "@/lib/sources";

/** Orientation : le système propose et documente ses critères ; la décision reste humaine (§14.3). */
const FILIERES = [
  { nom: "Série C — mathématiques et sciences physiques", poids: { Mathématiques: 0.5, "Sciences physiques": 0.5 } },
  { nom: "Série D — sciences de la vie et de la Terre", poids: { SVT: 0.5, Mathématiques: 0.25, "Sciences physiques": 0.25 } },
  { nom: "Série A — lettres et langues", poids: { Français: 0.5, Anglais: 0.3, "Histoire-Géographie": 0.2 } },
  { nom: "Enseignement technique et professionnel", poids: { Mathématiques: 0.4, "Sciences physiques": 0.3, Français: 0.3 } },
] as const;

export default function Orientation() {
  const { dossier } = usePasseport();
  const id = dossier?.apprenant.id ?? "";
  const moyennes = new Map(moyennesParMatiere(dossier?.evenements ?? [], id).map((m) => [m.matiere as string, m.moyenne]));
  const scores = FILIERES.map((f) => {
    const criteres = Object.entries(f.poids).map(([m, p]) => ({ matiere: m, poids: p, moyenne: moyennes.get(m) ?? null }));
    const score = criteres.reduce((s, c) => s + (c.moyenne ?? 10) * c.poids, 0);
    return { ...f, criteres, score };
  }).sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] font-bold text-ink">Orientation</h1>
        <p className="mt-1 text-[14px] text-ink-2">Des pistes calculées à partir de vos résultats, avec leurs critères visibles. Elles éclairent votre choix, elles ne le font pas.</p>
      </div>
      <div className="flex items-start gap-3 rounded-lg bg-info-bg px-4 py-3 text-[13px] text-info">
        <Info size={17} className="mt-0.5 shrink-0" aria-hidden />
        <p>Aucune orientation n'est décidée par un calcul. Le système propose et explique ; vous, votre famille et le conseil de classe décidez.</p>
      </div>
      {scores.map((f, i) => (
        <Card key={f.nom}>
          <CardHeader icon={Compass} title={f.nom} subtitle={`Indice de compatibilité : ${nombre(f.score, 1)}/20`} action={i === 0 ? <Badge ton="succes">Piste la plus compatible</Badge> : undefined} />
          <ul className="space-y-2">
            {f.criteres.map((c) => (
              <li key={c.matiere} className="flex items-center gap-3 text-[13px]">
                <span className="w-40 shrink-0 text-ink-2">{c.matiere}</span>
                <span className="h-2 flex-1 rounded-full bg-surface-2"><span className="block h-2 rounded-full" style={{ width: `${((c.moyenne ?? 0) / 20) * 100}%`, background: "var(--acc)" }} /></span>
                <span className="w-24 text-right tabular text-ink">{nombre(c.moyenne, 1)} × {Math.round(c.poids * 100)} %</span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
      <Card className="flex items-center gap-3">
        <UserCheck size={20} style={{ color: "var(--acc)" }} aria-hidden />
        <p className="text-[13.5px] text-ink-2">Prochaine étape : entretien avec le conseiller d'orientation, qui voit les mêmes critères que vous.</p>
      </Card>
    </div>
  );
}
