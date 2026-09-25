"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, use } from "react";
import { EntreePage } from "@/components/motion";
import { PageHeader, Segmente, Squelette } from "@/components/ui/primitives";
import { useCarnet, useSynchronisationEnseignant } from "@/lib/api/enseignant";
import { BandeauFile, DonneesAnciennes, Erreur } from "../../communs";
import { Appel } from "./Appel";
import { Eleves } from "./Eleves";
import { Historique } from "./Historique";
import { Notes } from "./Notes";

type Onglet = "appel" | "notes" | "historique" | "eleves";
const ONGLETS: { valeur: Onglet; libelle: string }[] = [
  { valeur: "appel", libelle: "Appel" },
  { valeur: "notes", libelle: "Notes" },
  { valeur: "historique", libelle: "Historique" },
  { valeur: "eleves", libelle: "Élèves" },
];

function PageClasse({ id }: { id: string }) {
  useSynchronisationEnseignant();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const brut = params.get("onglet");
  const onglet: Onglet = ONGLETS.some((o) => o.valeur === brut) ? (brut as Onglet) : "appel";
  const changer = (o: Onglet) => router.replace(`${pathname}?onglet=${o}`, { scroll: false });
  const { data: carnet, isPending, error, refetch, isRefetching } = useCarnet(id);

  return (
    <EntreePage>
      <div className="space-y-5">
        <Link href="/enseignant" className="-ml-1 inline-flex h-10 items-center gap-1.5 rounded-md px-1 text-[13.5px] font-medium text-ink-muted hover:text-ink">
          <ArrowLeft size={16} aria-hidden /> Mes classes
        </Link>

        {isPending ? (
          <Chargement />
        ) : !carnet ? (
          <Erreur erreur={error!} relancer={() => refetch()} enCours={isRefetching} titre="Impossible d'ouvrir le carnet de classe" />
        ) : (
          <>
            <PageHeader
              surtitre={`${carnet.matieres.join(", ")} · ${carnet.eleves.length} élèves · ${carnet.classe.anneeScolaire}`}
              titre={carnet.classe.libelle}
              actions={<Segmente label="Section du carnet" valeur={onglet} onChange={changer} options={ONGLETS} />}
            />
            <BandeauFile classeId={id} />
            {error && <DonneesAnciennes relancer={() => refetch()} enCours={isRefetching} />}
            {onglet === "appel" && <Appel carnet={carnet} />}
            {onglet === "notes" && <Notes carnet={carnet} />}
            {onglet === "historique" && <Historique carnet={carnet} />}
            {onglet === "eleves" && <Eleves carnet={carnet} />}
          </>
        )}
      </div>
    </EntreePage>
  );
}

function Chargement() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Chargement du carnet">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2"><Squelette className="h-3 w-52" /><Squelette className="h-8 w-28" /></div>
        <Squelette className="h-9 w-72" />
      </div>
      <Squelette className="h-20 rounded-xl" />
      <div className="grid gap-2 md:grid-cols-2">{Array.from({ length: 8 }, (_, i) => <Squelette key={i} className="h-14 rounded-lg" />)}</div>
    </div>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Suspense><PageClasse id={decodeURIComponent(id)} /></Suspense>;
}
