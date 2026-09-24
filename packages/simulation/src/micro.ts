import type {
  Apprenant,
  Certificat,
  Classe,
  Enseignant,
  Evenement,
  LienFamilial,
  Matiere,
  Niveau,
  NouvelEvenement,
  PersonneRegistre,
  Profil,
} from "@beile/contracts";
import { sha256 } from "./empreinte";
import type { EtablissementGenere } from "./macro";
import { NOMS_NORD, NOMS_SUD, PRENOMS_F, PRENOMS_M } from "./noms";
import { clamp, createRng, type Rng } from "./rng";

/**
 * Niveau individuel : trois établissements pilotes, entièrement fictifs, avec leurs apprenants,
 * familles, enseignants et un historique complet d'événements. C'est sur eux que se jouent les
 * parcours de démonstration (inscription, appel, notes, transfert, certification, accès).
 */

/** Horloge de démonstration : la scène se joue en milieu d'année scolaire. */
export const DATE_SIMULEE = "2026-03-17T08:30:00.000Z";
export const ANNEE = "2025-2026";

export const ETAB_RONIERS = "ETB-PAR-PILOTE-CEG";
export const ETAB_FLAMBOYANTS = "ETB-PAR-PILOTE-EPP";
export const ETAB_COCOTIERS = "ETB-COT-PILOTE-CEG";

const MATIERES_SECONDAIRE: Matiere[] = ["Mathématiques", "Français", "Anglais", "Sciences physiques", "SVT", "Histoire-Géographie", "Éducation civique"];
const MATIERES_PRIMAIRE: Matiere[] = ["Mathématiques", "Français", "SVT", "Histoire-Géographie", "Éducation civique"];
const DECALAGE_MATIERE: Record<Matiere, number> = {
  Mathématiques: -0.6, Français: 0.2, Anglais: 0.4, "Sciences physiques": -0.4, SVT: 0.3, "Histoire-Géographie": 0.5, "Éducation civique": 1.1,
};

export interface Enseignement {
  enseignantId: string;
  classeId: string;
  matiere: Matiere;
}

export interface MicroMonde {
  etablissements: EtablissementGenere[];
  registre: PersonneRegistre[];
  apprenants: Apprenant[];
  enseignants: Enseignant[];
  liens: LienFamilial[];
  classes: Classe[];
  enseignements: Enseignement[];
  evenements: Evenement[];
  certificats: Certificat[];
  profils: Profil[];
  /** Enfants présents au registre national mais pas encore inscrits (scénario d'inscription). */
  enfantsAInscrire: string[];
}

const etablissementPilote = (
  id: string, nom: string, cycle: "primaire" | "secondaire", communeId: string, lat: number, lng: number,
  capacite: number, effectif: number, enseignants: number, circonscription: string,
): EtablissementGenere => ({
  id, nom, cycle, statut: "public", communeId, circonscription, lat, lng, capacite,
  sallesDeClasse: Math.round(capacite / 50), effectif, enseignants, indicePerformance: 1, transmis: true,
  infrastructures: { eau: true, electricite: true, internet: cycle === "secondaire", latrines: true, bibliotheque: cycle === "secondaire" },
});

export function empreinteCertificat(c: Pick<Certificat, "id" | "apprenantId" | "examen" | "session" | "mention" | "moyenne" | "delivreLe">, titulaire: string) {
  return sha256([c.id, c.apprenantId, titulaire, c.examen, c.session, c.mention, c.moyenne.toFixed(2), c.delivreLe].join("|"));
}

export function genererMicroMonde(graine = 229): MicroMonde {
  const rng = createRng(graine);
  const registre: PersonneRegistre[] = [];
  const apprenants: Apprenant[] = [];
  const enseignants: Enseignant[] = [];
  const liens: LienFamilial[] = [];
  const classes: Classe[] = [];
  const enseignements: Enseignement[] = [];
  const evenements: Evenement[] = [];
  const certificats: Certificat[] = [];
  let seqEvt = 0;
  let seqNpi = 0;

  const npi = () => `${(1_000_000_000 + ((seqNpi++ * 7_919_993 + 104_729) % 8_999_999_999)).toString().slice(0, 10)}`;
  const evt = (e: NouvelEvenement): Evenement => {
    const complet = { ...e, id: `EVT-${String(++seqEvt).padStart(6, "0")}`, enregistreLe: e.survenuLe } as Evenement;
    evenements.push(complet);
    return complet;
  };
  const nomPour = (r: Rng, nord: number) => (r.bool(nord) ? r.pick(NOMS_NORD) : r.pick(NOMS_SUD));

  const etablissements = [
    etablissementPilote(ETAB_RONIERS, "CEG Les Rôniers", "secondaire", "parakou", 9.3517, 2.6202, 360, 0, 14, "CS Parakou"),
    etablissementPilote(ETAB_FLAMBOYANTS, "EPP Les Flamboyants", "primaire", "parakou", 9.3321, 2.6391, 150, 0, 4, "CS Parakou"),
    etablissementPilote(ETAB_COCOTIERS, "CEG Les Cocotiers", "secondaire", "cotonou", 6.3703, 2.4183, 320, 0, 12, "CS Cotonou"),
  ];

  // --- Enseignants -------------------------------------------------------------------------
  const creerEnseignant = (etabId: string, matieres: Matiere[], sexe: "F" | "M", nord: number, force?: { nom: string; prenoms: string }) => {
    const personne: PersonneRegistre = {
      npi: npi(),
      nom: force?.nom ?? nomPour(rng, nord),
      prenoms: force?.prenoms ?? (sexe === "F" ? rng.pick(PRENOMS_F) : rng.pick(PRENOMS_M)),
      dateNaissance: `${rng.int(1972, 1995)}-${String(rng.int(1, 12)).padStart(2, "0")}-${String(rng.int(1, 28)).padStart(2, "0")}`,
      sexe, communeNaissanceId: "parakou", parentsNpi: [],
    };
    registre.push(personne);
    const e: Enseignant = {
      id: `ENS-${String(enseignants.length + 1).padStart(5, "0")}`, npi: personne.npi, nom: personne.nom, prenoms: personne.prenoms,
      sexe, matieres, etablissementId: etabId, grade: rng.pick(["Professeur certifié", "Professeur adjoint", "Professeur certifié", "Contractuel de l'État"]),
      dateRecrutement: `${rng.int(2008, 2021)}-10-01`,
    };
    enseignants.push(e);
    evt({ type: "AFFECTATION_ENSEIGNANT", enseignantId: e.id, versEtablissementId: etabId, survenuLe: `${rng.int(2019, 2024)}-09-15T08:00:00.000Z`, auteurId: "DDEMP-Borgou", source: "beile", etablissementId: etabId });
    return e;
  };

  // L'enseignant-parent du scénario d'accès.
  const sanni = creerEnseignant(ETAB_RONIERS, ["Mathématiques"], "M", 1, { nom: "SANNI", prenoms: "Idrissou" });
  const equipeRoniers: Enseignant[] = [
    sanni,
    creerEnseignant(ETAB_RONIERS, ["Mathématiques", "Sciences physiques"], "F", 0.7),
    creerEnseignant(ETAB_RONIERS, ["Français"], "F", 0.6),
    creerEnseignant(ETAB_RONIERS, ["Français", "Éducation civique"], "M", 0.6),
    creerEnseignant(ETAB_RONIERS, ["Anglais"], "F", 0.5),
    creerEnseignant(ETAB_RONIERS, ["Sciences physiques"], "M", 0.7),
    creerEnseignant(ETAB_RONIERS, ["SVT"], "F", 0.6),
    creerEnseignant(ETAB_RONIERS, ["Histoire-Géographie", "Éducation civique"], "M", 0.8),
  ];
  const equipeFlamboyants = [creerEnseignant(ETAB_FLAMBOYANTS, MATIERES_PRIMAIRE, "F", 0.7), creerEnseignant(ETAB_FLAMBOYANTS, MATIERES_PRIMAIRE, "M", 0.7)];
  const equipeCocotiers = [
    creerEnseignant(ETAB_COCOTIERS, ["Mathématiques", "Sciences physiques"], "M", 0.1),
    creerEnseignant(ETAB_COCOTIERS, ["Français", "Anglais", "Histoire-Géographie", "Éducation civique"], "F", 0.1),
    creerEnseignant(ETAB_COCOTIERS, ["SVT"], "F", 0.1),
  ];
  for (const e of [...equipeRoniers, ...equipeFlamboyants, ...equipeCocotiers]) {
    evt({ type: "FORMATION_ENSEIGNANT", enseignantId: e.id, formation: "Enseignant augmenté par l'IA — université de vacances", statut: rng.bool(0.6) ? "validee" : "inscrit", survenuLe: "2025-08-20T08:00:00.000Z", auteurId: "MEMP-Formation", source: "beile", etablissementId: e.etablissementId });
    if (rng.bool(0.5)) evt({ type: "FORMATION_ENSEIGNANT", enseignantId: e.id, formation: "Évaluation par compétences", statut: "validee", survenuLe: `${rng.int(2021, 2024)}-07-10T08:00:00.000Z`, auteurId: "MEMP-Formation", source: "beile", etablissementId: e.etablissementId });
  }

  // --- Classes -------------------------------------------------------------------------------
  const creerClasse = (etabId: string, niveau: Niveau, lettre: string, capacite: number, principal: Enseignant | null) => {
    const c: Classe = { id: `CLS-${etabId.slice(4, 7)}-${niveau.replace(/[^A-Za-z0-9]/g, "")}${lettre}-${etabId.endsWith("EPP") ? "P" : "S"}`, etablissementId: etabId, niveau, libelle: `${niveau} ${lettre}`, anneeScolaire: ANNEE, capacite, enseignantPrincipalId: principal?.id ?? null };
    classes.push(c);
    return c;
  };
  const r = equipeRoniers;
  const cls6A = creerClasse(ETAB_RONIERS, "6e", "A", 55, r[2]!);
  const cls6B = creerClasse(ETAB_RONIERS, "6e", "B", 55, r[4]!);
  const cls5A = creerClasse(ETAB_RONIERS, "5e", "A", 55, sanni);
  const cls5B = creerClasse(ETAB_RONIERS, "5e", "B", 55, r[6]!);
  const cls4A = creerClasse(ETAB_RONIERS, "4e", "A", 60, r[1]!);
  const cls3A = creerClasse(ETAB_RONIERS, "3e", "A", 60, r[7]!);
  const clsCM1 = creerClasse(ETAB_FLAMBOYANTS, "CM1", "A", 60, equipeFlamboyants[0]!);
  const clsCM2 = creerClasse(ETAB_FLAMBOYANTS, "CM2", "A", 60, equipeFlamboyants[1]!);
  const cls5Cot = creerClasse(ETAB_COCOTIERS, "5e", "A", 55, equipeCocotiers[0]!);

  // Relation pédagogique : qui enseigne quoi, à quelle classe.
  const affecter = (classe: Classe, equipe: Enseignant[], matieres: Matiere[]) => {
    for (const m of matieres) {
      const titulaire = classe.id === cls5A.id || classe.id === cls4A.id
        ? (m === "Mathématiques" ? sanni : equipe.find((e) => e.matieres.includes(m) && e.id !== sanni.id))
        : equipe.find((e) => e.matieres.includes(m) && e.id !== sanni.id) ?? equipe.find((e) => e.matieres.includes(m));
      if (titulaire) enseignements.push({ enseignantId: titulaire.id, classeId: classe.id, matiere: m });
    }
  };
  for (const c of [cls6A, cls6B, cls5A, cls5B, cls4A, cls3A]) affecter(c, equipeRoniers, MATIERES_SECONDAIRE);
  affecter(clsCM1, equipeFlamboyants, MATIERES_PRIMAIRE);
  affecter(clsCM2, equipeFlamboyants, MATIERES_PRIMAIRE);
  affecter(cls5Cot, equipeCocotiers, MATIERES_SECONDAIRE);

  // --- Apprenants, familles, historique ---------------------------------------------------------
  const ageNiveau: Partial<Record<Niveau, number>> = { CM1: 10, CM2: 11, "6e": 12, "5e": 13, "4e": 14, "3e": 15 };
  const niveauxPasses: Niveau[] = ["CI", "CP", "CE1", "CE2", "CM1", "CM2", "6e", "5e", "4e", "3e"];

  interface OptionsApprenant { force?: { nom: string; prenoms: string; sexe: "F" | "M" }; parents?: PersonneRegistre[]; sansActe?: boolean; nord?: number; declin?: boolean; aptitude?: number }

  const creerApprenant = (classe: Classe, opts: OptionsApprenant = {}) => {
    const sexe = opts.force?.sexe ?? (rng.bool(0.49) ? "F" : "M");
    const nord = opts.nord ?? 0.7;
    const nom = opts.force?.nom ?? opts.parents?.[0]?.nom ?? nomPour(rng, nord);
    const age = (ageNiveau[classe.niveau] ?? 12) + rng.weighted([0, 1, 2], [0.62, 0.27, 0.11]);
    const naissance = `${2025 - age}-${String(rng.int(1, 12)).padStart(2, "0")}-${String(rng.int(1, 28)).padStart(2, "0")}`;
    const parents = opts.parents ?? [
      { npi: npi(), nom, prenoms: rng.pick(PRENOMS_M), dateNaissance: `${rng.int(1970, 1990)}-01-01`, sexe: "M" as const, communeNaissanceId: "parakou", parentsNpi: [] },
      { npi: npi(), nom: nomPour(rng, nord), prenoms: rng.pick(PRENOMS_F), dateNaissance: `${rng.int(1972, 1992)}-01-01`, sexe: "F" as const, communeNaissanceId: "parakou", parentsNpi: [] },
    ];
    if (!opts.parents) registre.push(...parents);
    const sansActe = opts.sansActe ?? false;
    const personne: PersonneRegistre | null = sansActe ? null : {
      npi: npi(), nom, prenoms: opts.force?.prenoms ?? (sexe === "F" ? rng.pick(PRENOMS_F) : rng.pick(PRENOMS_M)),
      dateNaissance: naissance, sexe, communeNaissanceId: classe.etablissementId === ETAB_COCOTIERS ? "cotonou" : "parakou", parentsNpi: parents.map((p) => p.npi),
    };
    if (personne) registre.push(personne);
    const a: Apprenant = {
      id: `APP-${String(apprenants.length + 1).padStart(6, "0")}`,
      npi: personne?.npi ?? null,
      statutIdentite: sansActe ? "regularisation_en_cours" : "verifiee",
      nom, prenoms: personne?.prenoms ?? (opts.force?.prenoms ?? (sexe === "F" ? rng.pick(PRENOMS_F) : rng.pick(PRENOMS_M))),
      dateNaissance: naissance, sexe, besoinsParticuliers: rng.bool(0.03),
    };
    apprenants.push(a);
    for (const p of parents) liens.push({ responsableNpi: p.npi, apprenantId: a.id, nature: "parent", verifie: !sansActe });
    if (sansActe) evt({ type: "REGULARISATION_IDENTITE_DEMANDEE", apprenantId: a.id, motif: "Absence d'acte de naissance à l'inscription", survenuLe: "2025-09-24T09:00:00.000Z", auteurId: "chef-etablissement", source: "beile", etablissementId: classe.etablissementId });

    const aptitude = opts.aptitude ?? rng.normal(0, 1);
    const indexNiveau = niveauxPasses.indexOf(classe.niveau);
    // Parcours antérieur : passages, CEP pour les élèves du secondaire.
    const etabAnterieur = classe.etablissementId === ETAB_COCOTIERS ? ETAB_COCOTIERS : classe.niveau.startsWith("CM") ? ETAB_FLAMBOYANTS : ETAB_RONIERS;
    for (let k = Math.max(0, indexNiveau - 3); k < indexNiveau; k++) {
      const annee = 2025 - (indexNiveau - k);
      const de = niveauxPasses[k]!;
      const vers = niveauxPasses[k + 1]!;
      if (de === "CM2") {
        const moyenne = Number(clamp(12.2 + aptitude * 2.4 + rng.normal(0, 0.8), 10, 18.5).toFixed(2));
        const session = `Juin ${annee + 1}`;
        const survenu = `${annee + 1}-07-05T10:00:00.000Z`;
        evt({ type: "RESULTAT_EXAMEN", apprenantId: a.id, examen: "CEP", session, moyenne, admis: true, survenuLe: survenu, auteurId: "DEC-Examens", source: "examens", etablissementId: etabAnterieur === ETAB_COCOTIERS ? null : ETAB_FLAMBOYANTS });
        const mention = moyenne >= 16 ? "Très bien" : moyenne >= 14 ? "Bien" : moyenne >= 12 ? "Assez bien" : "Passable";
        const base = { id: `CERT-CEP-${annee + 1}-${a.id.slice(4)}`, apprenantId: a.id, examen: "CEP" as const, session, mention, moyenne, delivreLe: `${annee + 1}-07-20` };
        certificats.push({ ...base, empreinte: empreinteCertificat(base, `${a.prenoms} ${a.nom}`), revoque: false });
        evt({ type: "CERTIFICATION", apprenantId: a.id, certificatId: base.id, examen: "CEP", session, mention, survenuLe: `${annee + 1}-07-20T10:00:00.000Z`, auteurId: "DEC-Examens", source: "examens", etablissementId: etabAnterieur === ETAB_COCOTIERS ? null : ETAB_FLAMBOYANTS });
      }
      evt({ type: "PASSAGE", apprenantId: a.id, deNiveau: de, versNiveau: vers, decision: "admis", anneeScolaire: `${annee}-${annee + 1}`, survenuLe: `${annee + 1}-07-10T10:00:00.000Z`, auteurId: "conseil-de-classe", source: de === "CM2" || k < 5 ? "educmaster" : "beile", etablissementId: etabAnterieur === ETAB_COCOTIERS ? (de.startsWith("C") ? null : ETAB_COCOTIERS) : de.startsWith("C") ? ETAB_FLAMBOYANTS : ETAB_RONIERS });
    }

    evt({ type: "INSCRIPTION", apprenantId: a.id, classeId: classe.id, anneeScolaire: ANNEE, survenuLe: `2025-09-${rng.int(15, 26)}T09:00:00.000Z`, auteurId: "chef-etablissement", source: "beile", etablissementId: classe.etablissementId });
    genererScolarite(a, classe, aptitude, opts.declin ?? false, null);
    return a;
  };

  /** Évaluations des trimestres 1 et 2, absences. `periode` limite aux évaluations d'un intervalle (transfert). */
  const genererScolarite = (a: Apprenant, classe: Classe, aptitude: number, declin: boolean, periode: { avant?: string; apres?: string } | null) => {
    const matieres = classe.niveau.startsWith("CM") ? MATIERES_PRIMAIRE : MATIERES_SECONDAIRE;
    const dates = [
      { d: "2025-10-24", t: 1 }, { d: "2025-11-28", t: 1 }, { d: "2026-02-13", t: 2 },
    ];
    for (const { d, t } of dates) {
      if (periode?.avant && d >= periode.avant) continue;
      if (periode?.apres && d < periode.apres) continue;
      for (const m of matieres) {
        let note = 10.8 + aptitude * 2.6 + DECALAGE_MATIERE[m] + rng.normal(0, 1.5);
        if (declin && m === "Mathématiques") note = d === "2025-10-24" ? 13.5 + rng.normal(0, 0.5) : d === "2025-11-28" ? 10.5 + rng.normal(0, 0.5) : 7.5 + rng.normal(0, 0.6);
        const ens = enseignements.find((e) => e.classeId === classe.id && e.matiere === m);
        evt({ type: "EVALUATION", apprenantId: a.id, classeId: classe.id, matiere: m, note: Math.round(clamp(note, 0, 20) * 4) / 4, trimestre: t, anneeScolaire: ANNEE, survenuLe: `${d}T15:00:00.000Z`, auteurId: ens?.enseignantId ?? "enseignant", source: "beile", etablissementId: classe.etablissementId });
      }
    }
    const nbAbsences = declin ? rng.int(4, 8) : rng.weighted([0, 1, 2, 3, 5], [0.35, 0.25, 0.2, 0.12, 0.08]);
    for (let k = 0; k < nbAbsences; k++) {
      const jour = new Date(Date.UTC(2025, 9, 1) + rng.int(0, 160) * 86_400_000).toISOString().slice(0, 10);
      if (periode?.avant && jour >= periode.avant) continue;
      if (periode?.apres && jour < periode.apres) continue;
      evt({ type: "ABSENCE", apprenantId: a.id, classeId: classe.id, date: jour, justifiee: rng.bool(0.55), anneeScolaire: ANNEE, survenuLe: `${jour}T08:15:00.000Z`, auteurId: "enseignant", source: "beile", etablissementId: classe.etablissementId });
    }
  };

  // Famille de démonstration : Mme DOSSOU, deux enfants dans deux établissements.
  const mere: PersonneRegistre = { npi: npi(), nom: "DOSSOU", prenoms: "Chantal", dateNaissance: "1984-05-12", sexe: "F", communeNaissanceId: "cotonou", parentsNpi: [] };
  const pere: PersonneRegistre = { npi: npi(), nom: "ZANNOU", prenoms: "Codjo", dateNaissance: "1980-11-03", sexe: "M", communeNaissanceId: "cotonou", parentsNpi: [] };
  registre.push(mere, pere);

  // Aïcha : inscrite à Cotonou en septembre, transférée à Parakou en janvier (parcours continu).
  const aicha = creerApprenant(cls5Cot, { force: { nom: "ZANNOU", prenoms: "Aïcha", sexe: "F" }, parents: [pere, mere], aptitude: 1.15 });
  // Recalage du transfert : on retire ses événements de Cotonou postérieurs au 12/01 et on génère la suite à Parakou.
  for (let i = evenements.length - 1; i >= 0; i--) {
    const e = evenements[i]!;
    if ("apprenantId" in e && e.apprenantId === aicha.id && (e.type === "EVALUATION" || e.type === "ABSENCE") && e.survenuLe >= "2026-01-12") evenements.splice(i, 1);
  }
  evt({ type: "TRANSFERT", apprenantId: aicha.id, deEtablissementId: ETAB_COCOTIERS, versEtablissementId: ETAB_RONIERS, versClasseId: cls5A.id, anneeScolaire: ANNEE, survenuLe: "2026-01-12T09:00:00.000Z", auteurId: "chef-etablissement", source: "beile", etablissementId: ETAB_RONIERS });
  genererScolarite(aicha, cls5A, 1.15, false, { apres: "2026-01-12" });
  const kamal = creerApprenant(clsCM2, { force: { nom: "ZANNOU", prenoms: "Kamal", sexe: "M" }, parents: [pere, mere], aptitude: 0.3 });

  // Enfant de l'enseignant SANNI, en 6e B : ni dans ses classes, ni dans sa matière.
  const sanniPersonne = registre.find((p) => p.npi === sanni.npi)!;
  const conjointe: PersonneRegistre = { npi: npi(), nom: "BIO", prenoms: "Awaou", dateNaissance: "1987-02-19", sexe: "F", communeNaissanceId: "parakou", parentsNpi: [] };
  registre.push(conjointe);
  const zoulfath = creerApprenant(cls6B, { force: { nom: "SANNI", prenoms: "Zoulfath", sexe: "F" }, parents: [sanniPersonne, conjointe], aptitude: 0.6 });

  // Effectifs des classes, dont 12 élèves en baisse en mathématiques au CEG Les Rôniers.
  const remplir = (classe: Classe, n: number, nord: number, declins = 0) => {
    for (let k = 0; k < n; k++) creerApprenant(classe, { nord, declin: k < declins, sansActe: k === n - 1 && classe.id === cls6A.id });
  };
  remplir(cls6A, 47, 0.75, 2);
  remplir(cls6B, 45, 0.75, 1);
  remplir(cls5A, 50, 0.72, 4);
  remplir(cls5B, 47, 0.72, 2);
  remplir(cls4A, 52, 0.7, 2);
  remplir(cls3A, 49, 0.7, 1);
  remplir(clsCM1, 44, 0.75);
  remplir(clsCM2, 45, 0.75);
  remplir(cls5Cot, 43, 0.1);

  for (const e of etablissements) {
    e.effectif = evenements.filter((x) => x.type === "INSCRIPTION" && x.etablissementId === e.id).length
      + evenements.filter((x) => x.type === "TRANSFERT" && x.versEtablissementId === e.id).length
      - evenements.filter((x) => x.type === "TRANSFERT" && x.deEtablissementId === e.id).length;
  }

  // Enfants connus du registre, non encore inscrits : scénario d'inscription en direct.
  const enfantsAInscrire: string[] = [];
  for (const [prenoms, nom, sexe] of [["Sidonie", "WOROU", "F"], ["Landry", "HOUESSOU", "M"], ["Bintou", "IMOROU", "F"]] as const) {
    const pere2: PersonneRegistre = { npi: npi(), nom, prenoms: rng.pick(PRENOMS_M), dateNaissance: "1982-03-01", sexe: "M", communeNaissanceId: "parakou", parentsNpi: [] };
    const enfant: PersonneRegistre = { npi: npi(), nom, prenoms, dateNaissance: `2013-${String(rng.int(1, 12)).padStart(2, "0")}-${String(rng.int(1, 28)).padStart(2, "0")}`, sexe, communeNaissanceId: "parakou", parentsNpi: [pere2.npi] };
    registre.push(pere2, enfant);
    enfantsAInscrire.push(enfant.npi);
  }

  // Un certificat révoqué, pour la démonstration de vérification.
  const revoque = certificats.find((c) => c.apprenantId !== aicha.id);
  if (revoque) revoque.revoque = true;

  // --- Profils de démonstration ----------------------------------------------------------------
  const inspecteur = { nom: "OROU", prenoms: "Nestor" };
  const profils: Profil[] = [
    { id: "p-apprenant", nomAffiche: `${aicha.prenoms} ${aicha.nom}`, fonction: "Apprenante · 5e A, CEG Les Rôniers", npi: aicha.npi, habilitations: [{ role: "apprenant", perimetre: { niveau: "personnel", apprenantId: aicha.id } }] },
    { id: "p-parent", nomAffiche: `${mere.prenoms} ${mere.nom}`, fonction: "Mère · 2 enfants, 2 établissements", npi: mere.npi, habilitations: [{ role: "parent", perimetre: { niveau: "famille", responsableNpi: mere.npi } }] },
    { id: "p-enseignant", nomAffiche: `${sanni.prenoms} ${sanni.nom}`, fonction: "Professeur de mathématiques · et parent d'élève", npi: sanni.npi, habilitations: [
      { role: "enseignant", perimetre: { niveau: "etablissement", etablissementId: ETAB_RONIERS } },
      { role: "parent", perimetre: { niveau: "famille", responsableNpi: sanni.npi } },
    ] },
    { id: "p-directeur", nomAffiche: "Hortense GUERA", fonction: "Directrice · CEG Les Rôniers", npi: null, habilitations: [{ role: "chef_etablissement", perimetre: { niveau: "etablissement", etablissementId: ETAB_RONIERS } }] },
    { id: "p-inspecteur", nomAffiche: `${inspecteur.prenoms} ${inspecteur.nom}`, fonction: "Inspecteur · circonscription de Parakou", npi: null, habilitations: [{ role: "inspecteur", perimetre: { niveau: "circonscription", circonscription: "CS Parakou" } }] },
    { id: "p-departement", nomAffiche: "Bertrand CHABI", fonction: "Directeur départemental · Borgou", npi: null, habilitations: [{ role: "direction_departementale", perimetre: { niveau: "departement", departementId: "borgou" } }] },
    { id: "p-central", nomAffiche: "Félicité AKAKPO", fonction: "Cabinet du ministre · pilotage national", npi: null, habilitations: [{ role: "administration_centrale", perimetre: { niveau: "national" } }] },
    { id: "p-chercheur", nomAffiche: "Dr Landry KOUTON", fonction: "Chercheur · laboratoire universitaire", npi: null, habilitations: [{ role: "chercheur", perimetre: { niveau: "national" } }] },
    { id: "p-dpo", nomAffiche: "Laure ZANNOU", fonction: "Déléguée à la protection des données", npi: null, habilitations: [{ role: "dpo", perimetre: { niveau: "national" } }] },
  ];

  void kamal; void zoulfath;
  return { etablissements, registre, apprenants, enseignants, liens, classes, enseignements, evenements, certificats, profils, enfantsAInscrire };
}
