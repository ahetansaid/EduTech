"use client";

import { BellOff, CheckCheck } from "lucide-react";
import { Button, Card, EtatVide } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { date, heure } from "@/lib/format";
import { useDemo, useProfil } from "@/lib/store";

export default function Notifications() {
  const profil = useProfil();
  const toutes = useDemo((s) => s.notifications);
  const marquerLues = useDemo((s) => s.marquerLues);
  const liste = toutes.filter((n) => n.destinataireNpi === profil.npi);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold text-ink">Notifications</h1>
          <p className="mt-1 text-[14px] text-ink-2">Elles naissent des faits enregistrés par l'établissement : aucune n'est rédigée à la main.</p>
        </div>
        {liste.some((n) => !n.lue) && <Button variante="secondaire" taille="sm" icone={CheckCheck} onClick={() => profil.npi && marquerLues(profil.npi)}>Tout marquer comme lu</Button>}
      </div>
      <Card className="p-0">
        {liste.length === 0 ? (
          <EtatVide icone={BellOff} titre="Aucune notification" texte="Quand un enseignant fait l'appel ou saisit une note, la notification arrive ici immédiatement — ou dès la synchronisation si l'établissement était hors connexion." />
        ) : (
          <ul className="divide-y divide-line/60">
            {liste.map((n) => (
              <li key={n.id} className={cn("flex gap-3 px-5 py-4", !n.lue && "bg-[var(--acc-doux)]/60")}>
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.lue ? "bg-line" : "")} style={!n.lue ? { background: "var(--acc)" } : undefined} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-ink">{n.titre}</p>
                  <p className="text-[13.5px] text-ink-2">{n.texte}</p>
                </div>
                <span className="shrink-0 text-right text-[12px] tabular text-ink-muted">{date(n.horodatage)}<br />{heure(n.horodatage)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
