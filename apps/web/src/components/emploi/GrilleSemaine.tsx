import { CalendarClock } from "lucide-react";
import { EtatVide } from "@/components/ui/primitives";

export interface Seance {
  id: string; jour: number; jourLibelle: string; debut: string; fin: string; matiere: string;
  salle: string | null; classe?: string; enseignant?: string;
}

const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

/**
 * Semaine type : une colonne par jour (empilées sur téléphone), séances dans l'ordre horaire. Le samedi n'apparaît
 * que s'il a des séances. `afficher` choisit ce que dit chaque séance en plus de la matière (classe ou enseignant).
 */
export function GrilleSemaine({ seances, afficher }: { seances: Seance[]; afficher: "classe" | "enseignant" }) {
  if (!seances.length) return <EtatVide icone={CalendarClock} titre="Aucune séance" texte="L'emploi du temps n'a pas encore été déposé par l'établissement." />;
  const jours = JOURS.map((libelle, i) => ({ libelle, jour: i + 1, seances: seances.filter((s) => s.jour === i + 1).sort((a, b) => a.debut.localeCompare(b.debut)) }))
    .filter((j) => j.jour < 6 || j.seances.length);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 xl:[grid-template-columns:repeat(var(--n),minmax(0,1fr))]" style={{ ["--n" as string]: jours.length }}>
      {jours.map((j) => (
        <section key={j.jour} className="min-w-0 rounded-xl border border-line/70 bg-surface p-3" aria-label={j.libelle}>
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{j.libelle}</h3>
          {!j.seances.length ? <p className="text-[12.5px] text-ink-muted">Pas de cours</p> : (
            <ul className="space-y-2">
              {j.seances.map((s) => (
                <li key={s.id} className="rounded-lg bg-surface-2/70 px-2.5 py-2">
                  <p className="text-[12px] font-medium tabular-nums text-ink-2">{s.debut} – {s.fin}</p>
                  <p className="text-[13.5px] font-semibold text-ink">{s.matiere}</p>
                  <p className="truncate text-[12px] text-ink-2">{afficher === "classe" ? s.classe : s.enseignant}{s.salle ? ` · ${s.salle}` : ""}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
