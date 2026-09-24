"use client";

import { ArrowRight, Search, Users } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Badge, Card, EtatVide, PageHeader, Segmente } from "@/components/ui/primitives";
import { nombre } from "@/lib/format";
import { absences, elevesEtablissement, moyenneGenerale, nomComplet } from "@/lib/scolarite";
import { ETAB_RONIERS } from "@/lib/sim/micro";
import { elevesEnBaisse } from "@/lib/sim/projections";
import { useMonde } from "@/lib/store";

type Filtre = "tous" | "baisse" | "identite";

function Liste() {
  const monde = useMonde();
  const params = useSearchParams();
  const [filtre, setFiltre] = useState<Filtre>((params.get("filtre") as Filtre) ?? "tous");
  const [classe, setClasse] = useState("toutes");
  const [q, setQ] = useState("");
  const eleves = useMemo(() => elevesEtablissement(monde, monde.evenements, ETAB_RONIERS), [monde]);
  const baisse = useMemo(() => new Map(elevesEnBaisse(monde.evenements, new Set(eleves.map((e) => e.apprenant.id))).map((b) => [b.apprenantId, b])), [monde, eleves]);
  const classes = [...new Set(eleves.map((e) => e.classe?.libelle ?? ""))].sort();
  const liste = eleves
    .filter((e) => filtre === "tous" || (filtre === "baisse" ? baisse.has(e.apprenant.id) : e.apprenant.statutIdentite === "regularisation_en_cours"))
    .filter((e) => classe === "toutes" || e.classe?.libelle === classe)
    .filter((e) => !q.trim() || nomComplet(e.apprenant).toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (a.classe?.libelle ?? "").localeCompare(b.classe?.libelle ?? "") || a.apprenant.nom.localeCompare(b.apprenant.nom));

  return (
    <div className="space-y-6">
      <PageHeader surtitre="Processus P7 · P9" titre="Apprenants" sousTitre={`${eleves.length} apprenants scolarisés au CEG Les Rôniers. Chaque dossier s'ouvre au titre de la gestion de l'établissement, et chaque ouverture est journalisée.`} />
      <div className="flex flex-wrap items-center gap-3">
        <Segmente label="Filtre" valeur={filtre} onChange={setFiltre} options={[{ valeur: "tous", libelle: "Tous" }, { valeur: "baisse", libelle: `En baisse (${baisse.size})` }, { valeur: "identite", libelle: "Identité à régulariser" }]} />
        <select value={classe} onChange={(e) => setClasse(e.target.value)} aria-label="Classe" className="h-9 rounded-md border border-line bg-surface px-3 text-[13px]">
          <option value="toutes">Toutes les classes</option>
          {classes.map((c) => <option key={c}>{c}</option>)}
        </select>
        <label className="relative ml-auto">
          <span className="sr-only">Rechercher</span>
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value.slice(0, 50))} placeholder="Rechercher un nom" className="h-9 w-56 rounded-md border border-line bg-surface pl-8 pr-3 text-[13px]" />
        </label>
      </div>
      <Card className="p-0">
        {liste.length === 0 ? <EtatVide icone={Users} titre="Aucun apprenant" texte="Aucun apprenant ne correspond à ces critères." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead className="bg-surface-2 text-left text-[11.5px] uppercase tracking-wide text-ink-muted">
                <tr><th className="px-5 py-2.5 font-semibold">Apprenant</th><th className="px-3 py-2.5 font-semibold">Classe</th><th className="px-3 py-2.5 font-semibold">Moyenne T2</th><th className="px-3 py-2.5 font-semibold">Absences</th><th className="px-3 py-2.5 font-semibold">Signalement</th><th /></tr>
              </thead>
              <tbody>
                {liste.slice(0, 120).map(({ apprenant: a, classe: c }, i) => {
                  const b = baisse.get(a.id);
                  return (
                    <tr key={a.id} className="animate-row border-t border-line/60 hover:bg-surface-2/50" style={{ animationDelay: `${Math.min(i, 20) * 15}ms` }}>
                      <td className="px-5 py-2.5"><span className="font-semibold text-ink">{a.nom}</span> {a.prenoms}<span className="block font-mono text-[11px] text-ink-muted">{a.id}</span></td>
                      <td className="px-3 py-2.5">{c?.libelle}</td>
                      <td className="px-3 py-2.5 tabular">{nombre(moyenneGenerale(monde.evenements, a.id, 2), 2)}</td>
                      <td className="px-3 py-2.5 tabular">{absences(monde.evenements, a.id).length}</td>
                      <td className="px-3 py-2.5">
                        {b && <Badge ton="avertissement">Maths : {b.notes.map((n) => nombre(n, 1)).join(" → ")}</Badge>}
                        {a.statutIdentite === "regularisation_en_cours" && <Badge ton="info">Régularisation</Badge>}
                      </td>
                      <td className="px-3 py-2.5 text-right"><Link href={`/etablissement/eleves/${a.id}`} className="inline-flex items-center gap-1 text-[13px] font-semibold text-blue hover:underline">Dossier <ArrowRight size={13} /></Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function Page() {
  return <Suspense><Liste /></Suspense>;
}
