"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Link2, UserPlus, UsersRound } from "lucide-react";
import { useState } from "react";
import { EntreePage } from "@/components/motion";
import { Modale } from "@/components/ui/Modale";
import { notifier } from "@/components/ui/Notifications";
import { Badge, Button, Card, CardHeader, EtatVide, PageHeader, Squelette } from "@/components/ui/primitives";
import { useEleves } from "@/lib/api/etablissement";
import { ecrire, lire } from "@/lib/http";
import { useEtablissementCourant } from "@/lib/session";
import { classeChamp, classeSelect, EtatErreur } from "../_composants";

interface Provisoire { responsableProvisoire: string; apprenantId: string; eleve: string; nom: string | null; identifiant: string | null; active: boolean }

/**
 * Responsables légaux sans NPI : l'école atteste le lien parent-enfant sur pièce vue au guichet ; la famille reçoit
 * un identifiant de connexion et active son compte par code SMS (personne d'autre ne connaît son mot de passe).
 * Quand le NPI arrive, on le rattache ici : il remplace l'identifiant provisoire partout.
 */
export default function PageFamilles() {
  const id = useEtablissementCourant();
  const client = useQueryClient();
  const eleves = useEleves(id);
  const liste = useQuery({ queryKey: ["familles", "provisoires", id], queryFn: ({ signal }) => lire<Provisoire[]>(`/etablissements/${encodeURIComponent(id!)}/familles/responsables-provisoires`, signal), enabled: !!id });
  const [f, setF] = useState({ apprenantId: "", nomAffiche: "", telephone: "", nature: "parent" as "parent" | "tuteur", pieceVue: "" });
  const [rattacher, setRattacher] = useState<Provisoire | null>(null);
  const [npi, setNpi] = useState("");
  const creer = useMutation({
    mutationFn: () => ecrire<{ identifiant: string }>(`/etablissements/${encodeURIComponent(id!)}/familles/responsable-provisoire`, f),
    onSuccess: (r) => {
      notifier({ ton: "succes", titre: "Responsable enregistré", texte: `Identifiant à remettre : ${r.identifiant}. Il active son compte depuis « Première connexion » (code par SMS).` });
      setF({ apprenantId: "", nomAffiche: "", telephone: "", nature: "parent", pieceVue: "" });
      client.invalidateQueries({ queryKey: ["familles"] });
    },
  });
  const lier = useMutation({
    mutationFn: () => ecrire(`/etablissements/${encodeURIComponent(id!)}/familles/${encodeURIComponent(rattacher!.responsableProvisoire)}/rattacher-npi`, { npi }),
    onSuccess: () => { notifier({ ton: "succes", titre: "NPI rattaché", texte: "L'identifiant provisoire est remplacé partout." }); setRattacher(null); setNpi(""); client.invalidateQueries({ queryKey: ["familles"] }); },
  });
  if (!id) return null;
  const pret = f.apprenantId && f.nomAffiche.trim().length >= 3 && f.telephone.trim().length >= 8 && f.pieceVue.trim().length >= 5;
  return (
    <EntreePage>
      <div className="space-y-5">
        <PageHeader titre="Familles sans NPI" sousTitre="Un parent ou un tuteur qui n'a pas encore de NPI peut suivre son enfant : vous attestez le lien sur pièce vue, il active son compte par SMS. Chaque attestation est journalisée." />
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="min-w-0">
            <CardHeader icon={UserPlus} title="Attester un responsable" subtitle="L'enfant doit être scolarisé dans votre établissement. Deux responsables sans NPI au plus par enfant." />
            <div className="space-y-3">
              <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">Enfant</span>
                <select value={f.apprenantId} onChange={(e) => setF({ ...f, apprenantId: e.target.value })} className={classeSelect} aria-label="Enfant">
                  <option value="">Choisir un élève…</option>
                  {(eleves.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.prenoms} {e.nom} · {e.classe}</option>)}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">Nom du responsable</span>
                  <input value={f.nomAffiche} onChange={(e) => setF({ ...f, nomAffiche: e.target.value.slice(0, 80) })} className={classeChamp} aria-label="Nom du responsable" /></label>
                <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">Téléphone (SMS d'activation)</span>
                  <input value={f.telephone} onChange={(e) => setF({ ...f, telephone: e.target.value.slice(0, 20) })} placeholder="+229 01 …" className={classeChamp} aria-label="Téléphone" /></label>
              </div>
              <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">Lien</span>
                <select value={f.nature} onChange={(e) => setF({ ...f, nature: e.target.value as "parent" | "tuteur" })} className={classeSelect} aria-label="Lien"><option value="parent">Parent</option><option value="tuteur">Tuteur</option></select></label>
              <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">Pièce vue au guichet</span>
                <input value={f.pieceVue} onChange={(e) => setF({ ...f, pieceVue: e.target.value.slice(0, 160) })} placeholder="Ex. acte de naissance de l'enfant, carnet de santé" className={classeChamp} aria-label="Pièce vue" /></label>
              {creer.error && <p role="alert" className="rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">{creer.error.message}</p>}
              <Button variante="primaire" icone={KeyRound} chargement={creer.isPending} disabled={!pret} onClick={() => creer.mutate()}>Attester et créer l&apos;accès</Button>
            </div>
          </Card>
          <Card className="min-w-0">
            <CardHeader icon={UsersRound} title="Responsables sans NPI" subtitle="Rattachez le NPI dès qu'il est délivré." />
            {liste.isPending ? <Squelette className="h-40 rounded-lg" /> : liste.isError ? <EtatErreur erreur={liste.error} /> : !liste.data.length ? (
              <EtatVide icone={UsersRound} titre="Aucun responsable sans NPI" texte="Les familles déjà identifiées par leur NPI n'apparaissent pas ici." />
            ) : (
              <ul className="divide-y divide-line">
                {liste.data.map((p) => (
                  <li key={`${p.responsableProvisoire}-${p.apprenantId}`} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium text-ink">{p.nom ?? "—"} · {p.eleve}</span>
                      <span className="font-mono text-xs text-ink-muted">{p.identifiant ?? "—"}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge ton={p.active ? "succes" : "avertissement"}>{p.active ? "Compte activé" : "En attente d'activation"}</Badge>
                      <Button taille="sm" variante="secondaire" icone={Link2} onClick={() => setRattacher(p)}>Rattacher le NPI</Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      <Modale ouvert={!!rattacher} onFermer={() => { setRattacher(null); setNpi(""); lier.reset(); }} icone={Link2} titre="Rattacher le NPI" sousTitre={rattacher ? `${rattacher.nom ?? ""} · ${rattacher.eleve}` : undefined}
        pied={<div className="flex justify-end gap-2"><Button variante="fantome" onClick={() => setRattacher(null)}>Annuler</Button><Button variante="primaire" chargement={lier.isPending} disabled={!/^\d{10}$/.test(npi)} onClick={() => lier.mutate()}>Rattacher</Button></div>}>
        <label className="block"><span className="mb-1.5 block text-sm font-medium text-ink">NPI (10 chiffres)</span>
          <input value={npi} inputMode="numeric" onChange={(e) => setNpi(e.target.value.replace(/\D/g, "").slice(0, 10))} className={classeChamp} aria-label="NPI" /></label>
        {lier.error && <p role="alert" className="mt-2 rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">{lier.error.message}</p>}
      </Modale>
    </EntreePage>
  );
}
