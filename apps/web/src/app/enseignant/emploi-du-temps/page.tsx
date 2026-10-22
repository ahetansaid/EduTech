"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Clock } from "lucide-react";
import { GrilleSemaine, type Seance } from "@/components/emploi/GrilleSemaine";
import { EntreePage } from "@/components/motion";
import { Card, CardHeader, PageHeader, Squelette } from "@/components/ui/primitives";
import { nombre } from "@/lib/format";
import { lire } from "@/lib/http";
import { Erreur } from "../communs";

interface MonEmploiDuTemps { heuresHebdomadaires: number; cours: Seance[] }

/** Mon emploi du temps : mes séances dans l'établissement où je suis affecté, déposées par mon chef d'établissement. */
export default function PageEmploiDuTemps() {
  const { data, isPending, error, refetch, isRefetching } = useQuery({
    queryKey: ["enseignant", "emploi-du-temps"],
    queryFn: ({ signal }) => lire<MonEmploiDuTemps>("/moi/emploi-du-temps", signal),
  });
  return (
    <EntreePage>
      <div className="space-y-5">
        <PageHeader surtitre="Enseignement" titre="Mon emploi du temps"
          sousTitre="Semaine type déposée par votre établissement. Une erreur ? Signalez-la à votre chef d'établissement : c'est lui qui la corrige." />
        {isPending ? <Squelette className="h-56 rounded-xl" /> : error ? <Erreur erreur={error} relancer={() => void refetch()} enCours={isRefetching} titre="Impossible de charger votre emploi du temps" /> : (
          <>
            <Card className="min-w-0">
              <CardHeader icon={Clock} title={`${nombre(data.heuresHebdomadaires, 1)} h de cours par semaine`} subtitle={`${data.cours.length} séance(s) hebdomadaire(s).`} />
            </Card>
            <Card className="min-w-0">
              <CardHeader icon={CalendarClock} title="Semaine type" />
              <GrilleSemaine seances={data.cours} afficher="classe" />
            </Card>
          </>
        )}
      </div>
    </EntreePage>
  );
}
