"use client";

import { Check, Download, ShieldAlert, Siren } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Cascade, Element, EntreePage } from "@/components/motion";
import { Modale } from "@/components/ui/Modale";
import { notifier } from "@/components/ui/Notifications";
import { Badge, Button, Card, EtatVide, PageHeader, Segmente, Squelette } from "@/components/ui/primitives";
import { CLES_SECURITE, LIBELLE_ALERTE, useAlertesSecurite, type AlerteSecurite } from "@/lib/api/securite";
import { ecrire, lire } from "@/lib/http";

/**
 * Vigie : anomalies détectées automatiquement (refus en rafale, verrouillages, administrateur sur une adresse
 * nouvelle ou hors horaires, créations de comptes en série, échecs du second facteur). Le DPO et
 * l'administrateur les qualifient ; l'export alimente une notification d'incident au bjCSIRT.
 */
const TON = { haute: "critique", moyenne: "avertissement", info: "info" } as const;
const LIBELLE_GRAVITE = { haute: "Haute", moyenne: "Moyenne", info: "Information" } as const;

export default function PageSecurite() {
  const [statut, setStatut] = useState<"ouvertes" | "toutes">("ouvertes");
  const alertes = useAlertesSecurite(statut);
  const [aTraiter, setATraiter] = useState<AlerteSecurite | null>(null);

  const exporter = async () => {
    const donnees = await lire<unknown>("/securite/alertes/export");
    const url = URL.createObjectURL(new Blob([JSON.stringify(donnees, null, 2)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `beile_incidents_${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <EntreePage>
      <div className="space-y-5">
        <PageHeader surtitre="Conformité" titre="Alertes de sécurité" actions={<Button variante="secondaire" icone={Download} onClick={exporter}>Export pour le bjCSIRT</Button>} />
        <Segmente label="Statut" valeur={statut} onChange={setStatut} options={[{ valeur: "ouvertes", libelle: "À traiter" }, { valeur: "toutes", libelle: "Toutes" }]} />
        {alertes.isPending ? <Squelette className="h-48 rounded-2xl" /> : !alertes.data?.length ? (
          <Card><EtatVide icone={ShieldAlert} titre="Aucune alerte" texte={statut === "ouvertes" ? "Rien à qualifier pour le moment." : "La vigie n'a encore rien détecté."} /></Card>
        ) : (
          <Cascade className="space-y-2.5">
            {alertes.data.map((a) => (
              <Element key={a.id}>
                <Card className="min-w-0 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                        <Siren size={16} className="text-accent-ink" aria-hidden /> {LIBELLE_ALERTE[a.type] ?? a.type}
                        <Badge ton={TON[a.gravite]}>{LIBELLE_GRAVITE[a.gravite]}</Badge>
                      </p>
                      <p className="mt-1 text-[13.5px] text-ink-2">{a.detail}</p>
                      <p className="mt-1 text-[12px] text-ink-muted">{new Date(a.creeLe).toLocaleString("fr-FR")}{a.traiteeLe ? ` · traitée le ${new Date(a.traiteeLe).toLocaleString("fr-FR")} : ${a.suite}` : ""}</p>
                    </div>
                    {!a.traiteeLe && <Button taille="sm" variante="secondaire" icone={Check} onClick={() => setATraiter(a)}>Qualifier</Button>}
                  </div>
                </Card>
              </Element>
            ))}
          </Cascade>
        )}
      </div>
      <DialogueTraiter alerte={aTraiter} onFermer={() => setATraiter(null)} />
    </EntreePage>
  );
}

function DialogueTraiter({ alerte, onFermer }: { alerte: AlerteSecurite | null; onFermer: () => void }) {
  const client = useQueryClient();
  const [suite, setSuite] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const fermer = () => { setSuite(""); setEnvoi(false); onFermer(); };
  const valider = async () => {
    setEnvoi(true);
    try {
      await ecrire(`/securite/alertes/${alerte!.id}/traiter`, { suite: suite.trim() });
      await client.invalidateQueries({ queryKey: CLES_SECURITE.alertes });
      notifier({ ton: "succes", titre: "Alerte qualifiée", texte: "La suite donnée est journalisée." });
      fermer();
    } catch { setEnvoi(false); }
  };
  return (
    <Modale ouvert={!!alerte} onFermer={fermer} titre="Qualifier l'alerte" sousTitre={alerte ? LIBELLE_ALERTE[alerte.type] ?? alerte.type : undefined} icone={Siren}
      pied={<><Button variante="secondaire" onClick={fermer}>Annuler</Button><Button chargement={envoi} disabled={suite.trim().length < 5} onClick={valider}>Enregistrer</Button></>}>
      <label className="block text-[13px] font-medium text-ink">Suite donnée (journalisée)
        <textarea value={suite} onChange={(e) => setSuite(e.target.value.slice(0, 300))} rows={3} placeholder="Fausse alerte : réunion de rentrée, accès vérifiés avec la direction." className="mt-1.5 w-full rounded-lg border border-line bg-bg px-3 py-2 text-[14px]" />
      </label>
    </Modale>
  );
}
