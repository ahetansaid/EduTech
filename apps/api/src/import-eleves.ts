import { randomUUID } from "node:crypto";
import { NIVEAUX, type Profil } from "@beile/contracts";
import { schema } from "@beile/db";
import { aujourdhui } from "@beile/simulation/scolarite";
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authentifie, base, corps, journaliser, limiteDebitPartage, refuser, type Variables } from "./commun";
import { classesCourantes, inscrireAuRegistre, type NouveauFait } from "./ecriture";

/**
 * Import d'une liste d'élèves par le chef d'établissement (cadrage : docs/cadrage/DOCUMENTS_IMPORT_EXPORT.md).
 *
 * Le fichier ne quitte pas le navigateur : l'API reçoit des lignes typées. Deux temps — `simulation` rend un
 * rapport ligne par ligne sans rien écrire ; `import` REFAIT toutes les vérifications et n'écrit que les lignes
 * valides. Rejouable : un élève déjà inscrit dans l'établissement est reconnu, jamais recréé.
 *
 * Registre national : une ligne avec NPI porte aussi le nom et le prénom, et un NPI inconnu ou d'une autre
 * personne reçoit LE MÊME motif. Le fichier ne sert donc pas à découvrir à qui appartient un NPI.
 */
export const importEleves = new Hono<{ Variables: Variables }>();

const ID_ETAB = z.string().regex(/^ETB-[A-Za-z0-9-]+$/);
const MAX_LIGNES = 1500;
const MOTIF_REGISTRE = "NPI et identité ne concordent pas au registre national";

const Ligne = z.object({
  n: z.number().int().min(1).max(100_000),
  classe: z.string().trim().min(1).max(40),
  niveau: z.enum(NIVEAUX).optional(),
  npi: z.string().regex(/^\d{10}$/).optional(),
  nom: z.string().trim().min(1).max(40),
  prenoms: z.string().trim().min(1).max(60),
  sexe: z.enum(["F", "M"]).optional(),
  dateNaissance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  responsable: z.string().trim().max(80).optional(),
}).strict();
type Ligne = z.infer<typeof Ligne>;

const Requete = z.object({
  mode: z.enum(["simulation", "import"]),
  anneeScolaire: z.string().regex(/^\d{4}-\d{4}$/).refine((a) => Number(a.slice(5)) === Number(a.slice(0, 4)) + 1, "année scolaire AAAA-AAAA"),
  creerClasses: z.boolean().default(false),
  capaciteNouvellesClasses: z.number().int().min(10).max(200).default(60),
  idImport: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  lignes: z.array(Ligne).min(1).max(MAX_LIGNES),
}).strict();

type Statut = "a_inscrire" | "deja_inscrit" | "erreur";
interface Resultat { n: number; statut: Statut; motif?: string; classe: string; apprenantId?: string; nouvelleClasse?: boolean }

/** Majuscules, sans accents ni espaces superflus : « Adjoa-Mèlè » et « ADJOA MELE » concordent. */
export const normaliser = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
/** Libellé de classe : « 6ème A », « 6e A », « 6EA » désignent la même division. */
export const cleClasse = (s: string) => normaliser(s).replace(/(\d)\s*(?:EME|IEME|E|ERE|RE)\b/g, "$1E").replace(/\s+/g, "");

export function chefDe(profil: Profil, etablissementId: string) {
  return profil.habilitations.some((h) => h.role === "chef_etablissement" && h.perimetre.niveau === "etablissement" && h.perimetre.etablissementId === etablissementId);
}

/** Une naissance plausible pour un élève du primaire ou du secondaire : entre 2 et 30 ans. */
function datePlausible(d: string) {
  const t = Date.parse(`${d}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== d) return false;
  const ans = (Date.parse(`${aujourdhui()}T00:00:00Z`) - t) / (365.25 * 86_400_000);
  return ans >= 2 && ans <= 30;
}

async function analyser(etablissementId: string, saisie: z.infer<typeof Requete>) {
  const classes = await base().select().from(schema.classes)
    .where(and(eq(schema.classes.etablissementId, etablissementId), eq(schema.classes.anneeScolaire, saisie.anneeScolaire)));
  const parCle = new Map(classes.map((c) => [cleClasse(c.libelle), c]));
  const effectifs = new Map<string, number>();
  if (classes.length) {
    for (const r of await base().select({ classeId: schema.scolarites.classeId, n: count() }).from(schema.scolarites)
      .where(and(inArray(schema.scolarites.classeId, classes.map((c) => c.id)), eq(schema.scolarites.statut, "scolarise"))).groupBy(schema.scolarites.classeId)) {
      effectifs.set(r.classeId!, Number(r.n));
    }
  }

  // Registre national et apprenants déjà connus, lus en une fois.
  const npis = [...new Set(saisie.lignes.flatMap((l) => (l.npi ? [l.npi] : [])))];
  const personnes = npis.length ? await base().select().from(schema.personnes).where(inArray(schema.personnes.npi, npis)) : [];
  const connus = npis.length ? await base().select({ id: schema.apprenants.id, npi: schema.apprenants.npi }).from(schema.apprenants).where(inArray(schema.apprenants.npi, npis)) : [];
  const courantes = await classesCourantes(connus.map((a) => a.id));
  const classeDe = new Map<string, { etablissementId: string; libelle: string } | undefined>();
  const idsClasses = [...new Set([...courantes.values()].filter(Boolean))] as string[];
  if (idsClasses.length) {
    for (const c of await base().select({ id: schema.classes.id, etablissementId: schema.classes.etablissementId, libelle: schema.classes.libelle }).from(schema.classes).where(inArray(schema.classes.id, idsClasses))) classeDe.set(c.id, c);
  }
  // Enfants sans acte déjà inscrits ici : reconnus par leur identité déclarée.
  const sansActeIci = await base().select({ id: schema.apprenants.id, nom: schema.apprenants.nom, prenoms: schema.apprenants.prenoms, dateNaissance: schema.apprenants.dateNaissance })
    .from(schema.apprenants).innerJoin(schema.scolarites, eq(schema.scolarites.apprenantId, schema.apprenants.id))
    .where(and(isNull(schema.apprenants.npi), eq(schema.scolarites.etablissementId, etablissementId), eq(schema.scolarites.statut, "scolarise")));
  const cleIdentite = (nom: string, prenoms: string, date: string) => `${normaliser(nom)}|${normaliser(prenoms)}|${date}`;
  const sansActeConnus = new Map(sansActeIci.map((a) => [cleIdentite(a.nom, a.prenoms, a.dateNaissance), a.id]));

  const nouvelles = new Map<string, { libelle: string; niveau: string; id: string }>();
  const vusNpi = new Set<string>(); const vusIdentite = new Set<string>();
  const resultats: Resultat[] = [];
  const aInscrire: { ligne: Ligne; classeId: string; apprenantExistant: string | null; personne: typeof personnes[number] | null }[] = [];

  for (const l of [...saisie.lignes].sort((a, b) => a.n - b.n)) {
    const r = (statut: Statut, motif?: string, extra: Partial<Resultat> = {}) => { resultats.push({ n: l.n, statut, classe: l.classe, ...(motif ? { motif } : {}), ...extra }); };
    // Classe : existante pour l'année, ou à créer si le niveau est donné et que le chef l'accepte.
    const cle = cleClasse(l.classe);
    let classe = parCle.get(cle);
    let nouvelle = nouvelles.get(cle);
    if (!classe && !nouvelle) {
      if (!l.niveau) { r("erreur", `Classe « ${l.classe} » inconnue pour ${saisie.anneeScolaire} : indiquer son niveau pour la créer`); continue; }
      if (!saisie.creerClasses) { r("erreur", `Classe « ${l.classe} » inconnue : cocher « créer les classes manquantes »`); continue; }
      nouvelle = { libelle: l.classe.trim(), niveau: l.niveau, id: `CLS-${randomUUID()}` };
      nouvelles.set(cle, nouvelle);
    }
    if (nouvelle && l.niveau && l.niveau !== nouvelle.niveau) { r("erreur", `Niveau ${l.niveau} contradictoire avec celui de « ${nouvelle.libelle} » (${nouvelle.niveau})`); continue; }
    if (classe && l.niveau && l.niveau !== classe.niveau) { r("erreur", `La classe « ${classe.libelle} » est de niveau ${classe.niveau}, pas ${l.niveau}`); continue; }
    const classeId = classe?.id ?? nouvelle!.id;
    const capacite = classe?.capacite ?? saisie.capaciteNouvellesClasses;

    let apprenantExistant: string | null = null;
    let personne: typeof personnes[number] | null = null;
    if (l.npi) {
      if (vusNpi.has(l.npi)) { r("erreur", "NPI en double dans le fichier"); continue; }
      vusNpi.add(l.npi);
      personne = personnes.find((p) => p.npi === l.npi) ?? null;
      const prenom = normaliser(l.prenoms).split(" ")[0]!;
      const concorde = !!personne && normaliser(personne.nom) === normaliser(l.nom) && normaliser(personne.prenoms).split(" ").includes(prenom)
        && (!l.dateNaissance || l.dateNaissance === personne.dateNaissance);
      if (!concorde) { r("erreur", MOTIF_REGISTRE); continue; }
      // Un adulte du registre (parent, enseignant) ne s'inscrit pas comme élève par un fichier.
      if (!datePlausible(personne!.dateNaissance)) { r("erreur", "Âge incompatible avec une scolarité primaire ou secondaire"); continue; }
      const connu = connus.find((a) => a.npi === l.npi);
      const actuelle = connu ? courantes.get(connu.id) : null;
      if (connu && actuelle) {
        const ou = classeDe.get(actuelle);
        if (ou?.etablissementId === etablissementId) { r("deja_inscrit", ou.libelle === classe?.libelle ? undefined : `Déjà inscrit·e en ${ou.libelle}`, { apprenantId: connu.id }); continue; }
        r("erreur", "Scolarisé·e dans un autre établissement : passer par un transfert"); continue;
      }
      apprenantExistant = connu?.id ?? null;
    } else {
      if (!l.sexe || !l.dateNaissance) { r("erreur", "Sans NPI : sexe et date de naissance obligatoires"); continue; }
      if (!datePlausible(l.dateNaissance)) { r("erreur", "Date de naissance invalide ou invraisemblable"); continue; }
      const id = cleIdentite(l.nom, l.prenoms, l.dateNaissance);
      if (vusIdentite.has(id)) { r("erreur", "Même élève deux fois dans le fichier"); continue; }
      vusIdentite.add(id);
      const deja = sansActeConnus.get(id);
      if (deja) { r("deja_inscrit", undefined, { apprenantId: deja }); continue; }
    }
    const effectif = effectifs.get(classeId) ?? 0;
    if (effectif >= capacite) { r("erreur", `Classe complète (${effectif}/${capacite})`); continue; }
    effectifs.set(classeId, effectif + 1);
    r("a_inscrire", undefined, nouvelle ? { nouvelleClasse: true } : {});
    aInscrire.push({ ligne: l, classeId, apprenantExistant, personne });
  }
  const nouvellesUtiles = [...nouvelles.values()].filter((c) => aInscrire.some((a) => a.classeId === c.id));
  return { resultats, aInscrire, nouvellesClasses: nouvellesUtiles };
}

/** Années admises : celles où l'établissement a déjà des classes, plus l'année en cours et la suivante. */
export async function anneeAdmise(etablissementId: string, annee: string) {
  const j = aujourdhui();
  const debut = Number(j.slice(0, 4)) - (Number(j.slice(5, 7)) < 9 ? 1 : 0);
  if (annee === `${debut}-${debut + 1}` || annee === `${debut + 1}-${debut + 2}`) return true;
  const [x] = await base().select({ id: schema.classes.id }).from(schema.classes).where(and(eq(schema.classes.etablissementId, etablissementId), eq(schema.classes.anneeScolaire, annee))).limit(1);
  return !!x;
}

export const cleProfil = (c: Context) => `p:${(c.get("profil") as Profil | undefined)?.id ?? "anonyme"}`;

importEleves.post("/etablissements/:id/import/eleves", authentifie, limiteDebitPartage("import-eleves", 20, 3_600_000, cleProfil), async (c) => {
  const profil = c.get("profil");
  const id = ID_ETAB.parse(c.req.param("id"));
  if (!chefDe(profil, id)) {
    await journaliser(profil, "Import d'une liste d'élèves", id, "gestion", false, "perimetre");
    refuser("L'import d'une liste d'élèves revient au chef de CET établissement : refus journalisé");
  }
  const saisie = await corps(c, Requete);
  if (!(await anneeAdmise(id, saisie.anneeScolaire))) throw new HTTPException(422, { message: `Année ${saisie.anneeScolaire} non ouverte pour l'import` });

  const analyse = await analyser(id, saisie);
  const totaux = (rs: Resultat[]) => ({
    lignes: rs.length,
    aInscrire: rs.filter((x) => x.statut === "a_inscrire").length,
    dejaInscrits: rs.filter((x) => x.statut === "deja_inscrit").length,
    erreurs: rs.filter((x) => x.statut === "erreur").length,
  });
  const classesACreer = analyse.nouvellesClasses.map((n) => ({ libelle: n.libelle, niveau: n.niveau }));
  if (saisie.mode === "simulation" || !analyse.aInscrire.length) {
    await journaliser(profil, "Vérification d'une liste d'élèves", `${id} · ${JSON.stringify(totaux(analyse.resultats))}`, "gestion", true, null);
    return c.json({ mode: saisie.mode, ecrit: false, totaux: totaux(analyse.resultats), classesACreer, lignes: analyse.resultats });
  }

  // Identifiants des nouveaux apprenants : à la suite du plus grand, vérifié de nouveau sous verrou.
  const [{ max } = { max: null }] = await base().select({ max: sql<string | null>`max(${schema.apprenants.id})` }).from(schema.apprenants);
  let suivant = Number(String(max ?? "APP-0").slice(4));
  const effectifAvant = await effectifEtablissement(id);
  const faits: NouveauFait[] = [];
  const nouveaux: (typeof schema.apprenants.$inferInsert)[] = [];
  const liens: (typeof schema.liensFamiliaux.$inferInsert)[] = [];
  const parcours: (typeof schema.parcours.$inferInsert)[] = [];
  const reprises: string[] = [];
  const parLigne = new Map<number, string>();
  for (const a of analyse.aInscrire) {
    const l = a.ligne;
    const apprenantId = a.apprenantExistant ?? `APP-${String(++suivant).padStart(6, "0")}`;
    parLigne.set(l.n, apprenantId);
    if (a.apprenantExistant) reprises.push(apprenantId);
    else {
      const p = a.personne;
      nouveaux.push(p
        ? { id: apprenantId, npi: p.npi, statutIdentite: "verifiee", nom: p.nom, prenoms: p.prenoms, dateNaissance: p.dateNaissance, sexe: p.sexe, besoinsParticuliers: false }
        : { id: apprenantId, npi: null, statutIdentite: "regularisation_en_cours", nom: l.nom.toUpperCase(), prenoms: l.prenoms, dateNaissance: l.dateNaissance!, sexe: l.sexe!, besoinsParticuliers: false });
      if (p?.parentsNpi.length) liens.push(...p.parentsNpi.map((npi) => ({ responsableNpi: npi, apprenantId, nature: "parent" as const, verifie: true })));
    }
    parcours.push({ id: `PRC-${apprenantId}`, apprenantId, type: "scolaire", institutionId: id, intitule: "Scolarité", statut: "en_cours" });
    faits.push({ type: "INSCRIPTION", auteurId: profil.id, etablissementId: id, apprenantId, donnees: { apprenantId, classeId: a.classeId, anneeScolaire: saisie.anneeScolaire, idSaisie: `${saisie.idImport}:${l.n}` } });
    if (!a.personne) faits.push({ type: "REGULARISATION_IDENTITE_DEMANDEE", auteurId: profil.id, etablissementId: id, apprenantId, donnees: { apprenantId, motif: `Absence d'acte de naissance (import de liste) — responsable déclaré : ${l.responsable || "non renseigné"}` } });
  }
  const nouvellesClasses = analyse.nouvellesClasses.map((n) => ({ id: n.id, etablissementId: id, niveau: n.niveau, libelle: n.libelle, anneeScolaire: saisie.anneeScolaire, capacite: saisie.capaciteNouvellesClasses, enseignantPrincipalId: null }));

  try {
    await inscrireAuRegistre(faits, async (tx) => {
      // Deux imports simultanés (double clic, deux onglets) ou une inscription unitaire pendant l'import : l'un
      // attend l'autre, puis on vérifie que rien n'a bougé depuis l'analyse. Sinon on refuse, sans rien écrire.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`import-eleves:${id}`}))`);
      const [m] = await tx.select({ max: sql<string | null>`max(${schema.apprenants.id})` }).from(schema.apprenants);
      const [e] = await tx.select({ n: count() }).from(schema.scolarites).where(and(eq(schema.scolarites.etablissementId, id), eq(schema.scolarites.statut, "scolarise")));
      const repris = reprises.length ? await tx.select({ id: schema.scolarites.apprenantId }).from(schema.scolarites).where(and(inArray(schema.scolarites.apprenantId, reprises), eq(schema.scolarites.statut, "scolarise"))) : [];
      if ((m?.max ?? null) !== max || Number(e?.n ?? 0) !== effectifAvant || repris.length) throw new HTTPException(409, { message: "Des inscriptions ont eu lieu pendant l'import : relancez la vérification (les élèves déjà importés seront reconnus)" });
      if (nouvellesClasses.length) await tx.insert(schema.classes).values(nouvellesClasses);
      if (nouveaux.length) await tx.insert(schema.apprenants).values(nouveaux);
      if (liens.length) await tx.insert(schema.liensFamiliaux).values(liens).onConflictDoNothing();
      await tx.insert(schema.parcours).values(parcours).onConflictDoNothing();
    });
  } catch (err) {
    const code = (err as { code?: string; cause?: { code?: string } }).code ?? (err as { cause?: { code?: string } }).cause?.code;
    if (code === "23505") throw new HTTPException(409, { message: "Un élève du fichier vient d'être inscrit ailleurs : relancez la vérification" });
    throw err;
  }
  const lignes = analyse.resultats.map((r) => (r.statut === "a_inscrire" ? { ...r, statut: "inscrit" as const, apprenantId: parLigne.get(r.n) } : r));
  const t = { ...totaux(analyse.resultats), inscrits: analyse.aInscrire.length };
  await journaliser(profil, "Import d'une liste d'élèves", `${id} · ${saisie.anneeScolaire} · ${t.inscrits} inscrit(s), ${t.dejaInscrits} déjà inscrit(s), ${t.erreurs} refusé(s), ${nouvellesClasses.length} classe(s) créée(s)`, "gestion", true, null);
  return c.json({ mode: "import", ecrit: true, totaux: t, classesACreer, classesCreees: nouvellesClasses.map((n) => ({ id: n.id, libelle: n.libelle, niveau: n.niveau })), lignes }, 201);
});

async function effectifEtablissement(etablissementId: string) {
  const [e] = await base().select({ n: count() }).from(schema.scolarites).where(and(eq(schema.scolarites.etablissementId, etablissementId), eq(schema.scolarites.statut, "scolarise")));
  return Number(e?.n ?? 0);
}
