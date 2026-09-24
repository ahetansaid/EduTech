"use client";

import { Award, BadgeCheck, BookOpen, Briefcase, CircleDot, GraduationCap, Plus } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, CardHeader, Etiquette } from "@/components/ui/primitives";
import { date } from "@/lib/format";
import { maintenant, useDemo, useMonde, useProfil } from "@/lib/store";

const CATALOGUE = [
  { titre: "Évaluation formative en mathématiques", type: "Obligatoire", duree: "12 h", echeance: "30/04/2026" },
  { titre: "Enseignant augmenté par l'IA — niveau 2", type: "Recommandée", duree: "20 h", echeance: "Session de juillet" },
  { titre: "Inclusion des élèves à besoins particuliers", type: "Recommandée", duree: "8 h", echeance: "Ouverte" },
  { titre: "Citoyenneté numérique et protection des données", type: "Disponible", duree: "6 h", echeance: "Ouverte" },
];

export default function Carriere() {
  const monde = useMonde();
  const profil = useProfil();
  const enregistrer = useDemo((s) => s.enregistrer);
  const [inscrit, setInscrit] = useState<string | null>(null);
  const e = monde.enseignants.find((x) => x.npi === profil.npi);
  if (!e) return null;
  const evts = monde.evenements
    .filter((x): x is Extract<typeof x, { type: "AFFECTATION_ENSEIGNANT" | "FORMATION_ENSEIGNANT" }> => (x.type === "AFFECTATION_ENSEIGNANT" || x.type === "FORMATION_ENSEIGNANT") && x.enseignantId === e.id)
    .sort((a, b) => b.survenuLe.localeCompare(a.survenuLe));
  const deja = new Set(evts.filter((x) => x.type === "FORMATION_ENSEIGNANT").map((x) => (x.type === "FORMATION_ENSEIGNANT" ? x.formation : "")));

  const jalons = [
    ...evts.map((x) => ({ date: x.survenuLe, titre: x.type === "AFFECTATION_ENSEIGNANT" ? "Affectation au CEG Les Rôniers" : x.formation, detail: x.type === "AFFECTATION_ENSEIGNANT" ? "Direction départementale du Borgou" : x.statut === "validee" ? "Formation validée" : "Inscription en cours", icone: x.type === "AFFECTATION_ENSEIGNANT" ? Briefcase : x.statut === "validee" ? Award : BookOpen })),
    { date: `${e.dateRecrutement}T08:00:00.000Z`, titre: "Recrutement", detail: e.grade, icone: BadgeCheck },
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[13px] text-ink-muted">Passeport professionnel · processus P10</p>
        <h1 className="mt-1 text-[26px] font-bold text-ink">{e.prenoms} {e.nom}</h1>
        <p className="mt-1 text-ink-2">Votre carrière se reconstitue à partir des événements enregistrés : aucun dossier papier à recomposer lors d'une mutation.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        {[["Identifiant professionnel", e.id], ["Grade", e.grade], ["Discipline", e.matieres.join(", ")], ["Recrutement", date(e.dateRecrutement)]].map(([l, v]) => (
          <Card key={l} className="p-4"><Etiquette>{l}</Etiquette><p className="mt-1.5 text-[14px] font-semibold text-ink">{v}</p></Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader icon={GraduationCap} title="Parcours professionnel" subtitle="Chaque jalon est un événement horodaté du registre" />
          <ol className="relative ml-2 border-l border-line pl-6">
            {jalons.map((j, i) => (
              <li key={i} className="relative pb-5 last:pb-0">
                <span className="absolute -left-[35px] flex h-7 w-7 items-center justify-center rounded-full bg-surface ring-2 ring-line" style={{ color: "var(--acc)" }}><j.icone size={14} aria-hidden /></span>
                <p className="text-[12px] text-ink-muted">{date(j.date)}</p>
                <p className="text-[14px] font-semibold text-ink">{j.titre}</p>
                <p className="text-[13px] text-ink-2">{j.detail}</p>
              </li>
            ))}
          </ol>
        </Card>
        <Card>
          <CardHeader icon={BookOpen} title="Formation continue" subtitle="Obligatoires, recommandées selon votre discipline, et disponibles" />
          <ul className="space-y-2.5">
            {CATALOGUE.map((f) => {
              const fait = deja.has(f.titre) || inscrit === f.titre;
              return (
                <li key={f.titre} className="flex items-start gap-3 rounded-lg border border-line/70 p-3">
                  <CircleDot size={16} className={f.type === "Obligatoire" ? "mt-0.5 text-warning" : "mt-0.5 text-ink-muted"} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold text-ink">{f.titre}</p>
                    <p className="text-[12px] text-ink-muted">{f.duree} · {f.echeance}</p>
                    <div className="mt-1.5"><Badge ton={f.type === "Obligatoire" ? "avertissement" : f.type === "Recommandée" ? "info" : "neutre"}>{f.type}</Badge></div>
                  </div>
                  {fait ? <Badge ton="succes">Inscrit</Badge> : (
                    <Button taille="sm" variante="secondaire" icone={Plus} onClick={() => {
                      enregistrer([{ type: "FORMATION_ENSEIGNANT", enseignantId: e.id, formation: f.titre, statut: "inscrit", survenuLe: maintenant(), auteurId: e.id, source: "beile", etablissementId: e.etablissementId }]);
                      setInscrit(f.titre);
                    }}>S'inscrire</Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
