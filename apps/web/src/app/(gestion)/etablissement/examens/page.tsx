"use client";

import type { Certificat, NouvelEvenement } from "@beile/contracts";
import { Award, ClipboardList, Gavel, MapPin, ScanLine } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { TableauDonnees } from "@/components/charts/Graphiques";
import { cheminVerification } from "@/components/ui/Preuve";
import { Badge, Button, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { nombre } from "@/lib/format";
import { elevesClasse, moyenneGenerale, nomComplet } from "@/lib/scolarite";
import { empreinteCertificat, ETAB_RONIERS } from "@beile/simulation/micro";
import { maintenant, useDemo, useMonde } from "@/lib/store";

const SESSION = "Juin 2026";
const CENTRES = ["Centre d'examen CEG Parakou-Centre", "Centre d'examen Lycée de Parakou"];

export default function Examens() {
  const monde = useMonde();
  const enregistrer = useDemo((s) => s.enregistrer);
  const ajouterCertificat = useDemo((s) => s.ajouterCertificat);
  const [deliberation, setDeliberation] = useState(false);
  const classe3e = monde.classes.find((c) => c.etablissementId === ETAB_RONIERS && c.niveau === "3e")!;
  const candidats = useMemo(() => elevesClasse(monde, monde.evenements, classe3e), [monde, classe3e]);
  const dejaDelibere = monde.certificats.some((c) => c.examen === "BEPC" && c.session === SESSION);
  const certsBepc = monde.certificats.filter((c) => c.examen === "BEPC" && c.session === SESSION);
  const cepEleves = monde.certificats.filter((c) => c.examen === "CEP" && monde.apprenants.some((a) => a.id === c.apprenantId));

  const deliberer = () => {
    const evts: NouvelEvenement[] = [];
    candidats.forEach((a) => {
      const moy = Number(Math.min(18.5, Math.max(6, (moyenneGenerale(monde.evenements, a.id) ?? 10) + 0.4)).toFixed(2));
      const admis = moy >= 10;
      const base = { apprenantId: a.id, survenuLe: maintenant(), auteurId: "DEC-Examens", source: "examens" as const, etablissementId: ETAB_RONIERS };
      evts.push({ type: "RESULTAT_EXAMEN", examen: "BEPC", session: SESSION, moyenne: moy, admis, ...base });
      if (admis) {
        const mention = moy >= 16 ? "Très bien" : moy >= 14 ? "Bien" : moy >= 12 ? "Assez bien" : "Passable";
        const c: Omit<Certificat, "empreinte" | "revoque"> = { id: `CERT-BEPC-2026-${a.id.slice(4)}`, apprenantId: a.id, examen: "BEPC", session: SESSION, mention, moyenne: moy, delivreLe: maintenant().slice(0, 10) };
        ajouterCertificat({ ...c, empreinte: empreinteCertificat(c, nomComplet(a)), revoque: false });
        evts.push({ type: "CERTIFICATION", certificatId: c.id, examen: "BEPC", session: SESSION, mention, ...base });
      }
    });
    enregistrer(evts);
    setDeliberation(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader surtitre="Processus P8" titre="Examens et certification" sousTitre="Candidatures constituées à partir du référentiel des apprenants, sans ressaisie ; résultats journalisés ; preuves vérifiables par un tiers en quelques secondes." />
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader icon={ClipboardList} title={`BEPC · session ${SESSION}`} subtitle={`${candidats.length} candidats inscrits automatiquement depuis la classe de ${classe3e.libelle}`} action={<Badge ton={dejaDelibere ? "succes" : "info"}>{dejaDelibere ? "Délibération faite" : "Candidatures ouvertes"}</Badge>} />
          <TableauDonnees
            colonnes={["Candidat", "Identifiant", "Centre de composition", "Moyenne annuelle"]}
            lignes={candidats.slice(0, 8).map((a, i) => [nomComplet(a), <span key={a.id} className="font-mono text-[11.5px]">{a.id}</span>, CENTRES[i % 2]!, nombre(moyenneGenerale(monde.evenements, a.id), 2)])}
          />
          <p className="mt-2 text-[12.5px] text-ink-muted">… et {Math.max(0, candidats.length - 8)} autres. Listes d'émargement et convocations générées pour les deux centres.</p>
          <div className="mt-4 flex flex-wrap gap-2 text-[12.5px] text-ink-2">
            {CENTRES.map((c) => <span key={c} className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2.5 py-1"><MapPin size={13} /> {c}</span>)}
          </div>
        </Card>
        <Card>
          <CardHeader icon={Gavel} title="Délibération (démonstration)" subtitle="Anticipe la session de juin pour montrer la chaîne complète" />
          {dejaDelibere || deliberation ? (
            <div className="space-y-3">
              <p className="rounded-md bg-success-bg px-3 py-2 text-[13px] font-medium text-success">{certsBepc.length} diplômes délivrés, chacun vérifiable par QR code.</p>
              <ul className="space-y-1.5">
                {certsBepc.slice(0, 5).map((c) => {
                  const a = monde.apprenants.find((x) => x.id === c.apprenantId);
                  return <li key={c.id} className="flex items-center gap-2 text-[13px]"><Award size={14} className="text-amber" /> <span className="flex-1 truncate">{a ? nomComplet(a) : c.apprenantId} · {c.mention}</span><Link href={cheminVerification(c)} className="font-semibold text-blue hover:underline">Vérifier</Link></li>;
                })}
              </ul>
            </div>
          ) : (
            <>
              <p className="text-[13px] text-ink-2">Les résultats sont enregistrés comme événements du registre ; chaque diplôme reçoit un identifiant et une empreinte. Toute correction ultérieure est journalisée avec son auteur.</p>
              <Button className="mt-4 w-full" variante="valider" icone={Gavel} onClick={deliberer}>Délibérer et délivrer les diplômes</Button>
            </>
          )}
        </Card>
      </div>
      <Card>
        <CardHeader icon={ScanLine} title="Diplômes antérieurs des élèves (CEP)" subtitle="Rattachés à l'identifiant de chaque apprenant : le parcours devient sa propre preuve" action={<Badge>{cepEleves.length}</Badge>} />
        <p className="text-[13px] text-ink-2">Un employeur, une université ou un autre établissement contrôle un diplôme sans compte ni démarche, depuis la <Link href="/verifier" className="font-semibold text-blue hover:underline">page publique de vérification</Link>. Un diplôme révoqué ou un document dont une mention a été modifiée est immédiatement signalé.</p>
      </Card>
    </div>
  );
}
