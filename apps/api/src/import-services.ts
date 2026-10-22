import { MATIERES, type Matiere } from "@beile/contracts";
import { schema } from "@beile/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authentifie, base, corps, journaliser, limiteDebitPartage, refuser, type Variables } from "./commun";
import { inscrireAuRegistre, type NouveauFait } from "./ecriture";
import { anneeAdmise, chefDe, cleClasse, cleProfil, normaliser } from "./import-eleves";

/**
 * Import des services d'enseignement (lot 1 bis, docs/cadrage/DOCUMENTS_IMPORT_EXPORT.md) : qui enseigne quelle
 * matière dans quelle classe. Un service ouvre à l'enseignant le carnet de la classe ; c'est donc un droit d'accès
 * que l'on donne, et chaque attribution ou retrait est un fait SERVICE_ENSEIGNEMENT au registre.
 *
 * Seuls les enseignants DÉJÀ affectés à l'établissement sont reconnus : l'affectation relève du circuit de la
 * direction départementale, un fichier ne la contourne pas. Ils sont désignés par leur NPI ou leur nom ; la
 * recherche ne porte que sur le personnel de l'établissement (aucune consultation du registre national).
 *
 * `remplacer` : les classes présentes dans le fichier reçoivent EXACTEMENT les services listés ; les autres
 * services de ces classes sont retirés (et l'enseignant perd l'accès au carnet). Sans `remplacer`, on ajoute
 * seulement, et une matière déjà assurée par un autre enseignant est refusée.
 */
export const importServices = new Hono<{ Variables: Variables }>();

const ID_ETAB = z.string().regex(/^ETB-[A-Za-z0-9-]+$/);
const MAX_LIGNES = 800;

const Ligne = z.object({
  n: z.number().int().min(1).max(100_000),
  classe: z.string().trim().min(1).max(40),
  matiere: z.string().trim().min(1).max(40),
  enseignant: z.string().trim().min(2).max(100).optional(),
  npiEnseignant: z.string().regex(/^\d{10}$/).optional(),
  principal: z.boolean().optional(),
}).strict().refine((l) => !!l.enseignant || !!l.npiEnseignant, "enseignant ou npiEnseignant");
type Ligne = z.infer<typeof Ligne>;

const Requete = z.object({
  mode: z.enum(["simulation", "import"]),
  anneeScolaire: z.string().regex(/^\d{4}-\d{4}$/),
  remplacer: z.boolean().default(false),
  idImport: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  lignes: z.array(Ligne).min(1).max(MAX_LIGNES).refine((ls) => new Set(ls.map((l) => l.n)).size === ls.length, "numéros de ligne (n) en double"),
}).strict();

/** Intitulés courants dans les établissements béninois → matière du référentiel. */
const ALIAS_MATIERES: Record<string, Matiere> = {
  MATHEMATIQUES: "Mathématiques", MATHS: "Mathématiques", MATH: "Mathématiques",
  FRANCAIS: "Français",
  ANGLAIS: "Anglais",
  "SCIENCES PHYSIQUES": "Sciences physiques", PCT: "Sciences physiques", "PHYSIQUE CHIMIE": "Sciences physiques", "PHYSIQUE CHIMIE ET TECHNOLOGIE": "Sciences physiques", "SCIENCES PHYSIQUES CHIMIQUES ET TECHNOLOGIQUES": "Sciences physiques",
  SVT: "SVT", "SCIENCES DE LA VIE ET DE LA TERRE": "SVT",
  "HISTOIRE GEOGRAPHIE": "Histoire-Géographie", "HISTOIRE GEO": "Histoire-Géographie", HG: "Histoire-Géographie",
  "EDUCATION CIVIQUE": "Éducation civique", "EDUCATION CIVIQUE ET MORALE": "Éducation civique", ECM: "Éducation civique",
};
export const matiereDe = (s: string): Matiere | null => ALIAS_MATIERES[normaliser(s)] ?? null;

type Statut = "a_attribuer" | "deja_attribue" | "erreur";
interface Resultat { n: number; statut: Statut; classe: string; classeId?: string; matiere?: Matiere; enseignant?: string; motif?: string; avertissement?: string; principal?: boolean }
interface Service { enseignantId: string; classeId: string; matiere: string }
const cle = (s: Service) => `${s.classeId}|${s.matiere}|${s.enseignantId}`;

/**
 * Personnel affecté à l'établissement, et recherche d'un enseignant par NPI ou par nom (dans les deux ordres).
 * Partagé avec l'emploi du temps : la recherche ne sort JAMAIS du personnel de l'établissement.
 */
export async function personnelDe(etablissementId: string) {
  const profs = await base().select({ id: schema.enseignants.id, npi: schema.enseignants.npi, nom: schema.enseignants.nom, prenoms: schema.enseignants.prenoms, matieres: schema.enseignants.matieres })
    .from(schema.enseignants).where(eq(schema.enseignants.etablissementId, etablissementId));
  const parNom = new Map<string, typeof profs>();
  for (const p of profs) {
    for (const k of new Set([normaliser(`${p.nom} ${p.prenoms}`), normaliser(`${p.prenoms} ${p.nom}`)])) parNom.set(k, [...(parNom.get(k) ?? []), p]);
  }
  return {
    profs,
    trouver: (l: { enseignant?: string; npiEnseignant?: string }) => (l.npiEnseignant ? profs.filter((p) => p.npi === l.npiEnseignant) : parNom.get(normaliser(l.enseignant ?? "")) ?? []),
    nomDe: (id: string) => { const p = profs.find((x) => x.id === id); return p ? `${p.prenoms} ${p.nom}` : id; },
  };
}

async function analyser(etablissementId: string, saisie: z.infer<typeof Requete>, npiAuteur: string | null) {
  const classes = await base().select().from(schema.classes)
    .where(and(eq(schema.classes.etablissementId, etablissementId), eq(schema.classes.anneeScolaire, saisie.anneeScolaire)));
  const parCle = new Map(classes.map((c) => [cleClasse(c.libelle), c]));
  const { trouver, nomDe } = await personnelDe(etablissementId);
  const existants: Service[] = classes.length
    ? await base().select({ enseignantId: schema.enseignements.enseignantId, classeId: schema.enseignements.classeId, matiere: schema.enseignements.matiere })
      .from(schema.enseignements).where(inArray(schema.enseignements.classeId, classes.map((c) => c.id)))
    : [];
  // Classes et matières où des notes existent déjà : le chef ne peut pas se les attribuer lui-même (il pourrait
  // alors corriger les notes saisies par un collègue). La reprise d'une telle classe passe par l'inspection.
  const notees = new Set(classes.length
    ? (await base().selectDistinct({ classeId: schema.notes.classeId, matiere: schema.notes.matiere }).from(schema.notes).where(inArray(schema.notes.classeId, classes.map((c) => c.id)))).map((x) => `${x.classeId}|${x.matiere}`)
    : []);

  const resultats: Resultat[] = [];
  const attributions: (Service & { principal: boolean; remplace: Service | null })[] = [];
  const vusClasseMatiere = new Map<string, string>(); // classe|matière → enseignant déjà retenu dans le fichier
  const principaux = new Map<string, string>(); // classe → enseignant principal désigné dans le fichier
  const classesDuFichier = new Set<string>();
  const gardes = new Set<string>(); // services relistés tels quels : jamais retirés

  for (const l of [...saisie.lignes].sort((a, b) => a.n - b.n)) {
    const classe = parCle.get(cleClasse(l.classe));
    const r = (statut: Statut, extra: Partial<Resultat> = {}) => { resultats.push({ n: l.n, statut, classe: l.classe, ...(classe ? { classeId: classe.id } : {}), ...extra }); };
    if (!classe) { r("erreur", { motif: `Classe « ${l.classe} » inconnue pour ${saisie.anneeScolaire} (créez-la d'abord, par l'import des élèves)` }); continue; }
    classesDuFichier.add(classe.id);
    const matiere = matiereDe(l.matiere);
    if (!matiere) { r("erreur", { motif: `Matière « ${l.matiere} » non reconnue (${MATIERES.join(", ")})` }); continue; }
    const candidats = trouver(l);
    if (!candidats.length) { r("erreur", { matiere, motif: "Enseignant introuvable parmi le personnel affecté à votre établissement" }); continue; }
    if (candidats.length > 1) { r("erreur", { matiere, motif: "Homonymes dans votre personnel : préciser le NPI de l'enseignant" }); continue; }
    const prof = candidats[0]!;
    const enseignant = `${prof.prenoms} ${prof.nom}`;
    const cm = `${classe.id}|${matiere}`;
    const deja = vusClasseMatiere.get(cm);
    if (deja) { r("erreur", { matiere, enseignant, motif: deja === prof.id ? "Ligne en double" : `${matiere} en ${classe.libelle} est déjà attribuée à ${nomDe(deja)} plus haut dans le fichier` }); continue; }
    if (l.principal) {
      const p = principaux.get(classe.id);
      if (p && p !== prof.id) { r("erreur", { matiere, enseignant, motif: `Deux professeurs principaux pour ${classe.libelle}` }); continue; }
    }
    const avertissement = prof.matieres.includes(matiere) ? undefined : `Hors des matières déclarées de l'enseignant (${prof.matieres.join(", ") || "aucune"})`;
    const service = { enseignantId: prof.id, classeId: classe.id, matiere };
    const autre = existants.find((e) => e.classeId === classe.id && e.matiere === matiere && e.enseignantId !== prof.id);
    const memeService = existants.some((e) => cle(e) === cle(service));
    if (!memeService && autre && !saisie.remplacer) { r("erreur", { matiere, enseignant, motif: `${matiere} en ${classe.libelle} est assurée par ${nomDe(autre.enseignantId)} : cochez « remplacer » pour changer d'enseignant` }); continue; }
    if (!memeService && npiAuteur && prof.npi === npiAuteur && notees.has(cm)) { r("erreur", { matiere, enseignant, motif: `Des notes existent déjà en ${matiere} pour ${classe.libelle} : vous attribuer ce service passe par l'inspection` }); continue; }
    // La ligne est retenue : elle compte désormais pour les doublons et pour le professeur principal.
    vusClasseMatiere.set(cm, prof.id);
    if (l.principal) principaux.set(classe.id, prof.id);
    gardes.add(cle(service));
    const principal = l.principal ? { principal: true } : {};
    if (memeService) { r("deja_attribue", { matiere, enseignant, ...principal }); continue; }
    r("a_attribuer", { matiere, enseignant, ...(autre ? { motif: `Remplace ${nomDe(autre.enseignantId)}` } : {}), ...(avertissement ? { avertissement } : {}), ...principal });
    attributions.push({ ...service, principal: !!l.principal, remplace: autre ?? null });
  }

  // Remplacer : une classe dont une ligne est refusée est bloquée EN ENTIER. Sinon, le service que la ligne refusée
  // voulait garder serait retiré, et la classe perdrait un enseignant sur une simple erreur de saisie.
  const bloquees = new Set(saisie.remplacer ? resultats.filter((x) => x.statut === "erreur" && x.classeId).map((x) => x.classeId!) : []);
  for (const x of resultats) {
    if (x.statut !== "erreur" && x.classeId && bloquees.has(x.classeId)) {
      x.statut = "erreur";
      x.motif = "Classe bloquée (mode remplacer) : une autre ligne de cette classe est refusée, corrigez-la d'abord";
    }
  }
  const retenues = attributions.filter((x) => !bloquees.has(x.classeId));
  for (const c of bloquees) principaux.delete(c);
  // Dans chaque classe du fichier (non bloquée), tout service non relisté est retiré.
  const retraits = saisie.remplacer ? existants.filter((e) => classesDuFichier.has(e.classeId) && !bloquees.has(e.classeId) && !gardes.has(cle(e))) : [];
  const remplaces = retenues.flatMap((x) => (x.remplace ? [x.remplace] : []));
  const aRetirer = [...retraits, ...remplaces.filter((r) => !retraits.some((x) => cle(x) === cle(r)))];
  const principauxValides = [...principaux.entries()].filter(([classeId, ens]) => classes.find((c) => c.id === classeId)?.enseignantPrincipalId !== ens);
  // Un professeur principal qui n'enseignera plus rien dans sa classe cesse de l'être (fait au registre).
  const apres = [...existants.filter((e) => !aRetirer.some((x) => cle(x) === cle(e))), ...retenues];
  const principauxRetires = classes.filter((c) => c.enseignantPrincipalId && !principaux.has(c.id) && aRetirer.some((x) => x.classeId === c.id)
    && !apres.some((s) => s.classeId === c.id && s.enseignantId === c.enseignantPrincipalId)).map((c) => [c.id, c.enseignantPrincipalId!] as const);
  return {
    resultats, attributions: retenues, retraits, aRetirer, existants, principauxValides, principauxRetires,
    classeIds: classes.map((c) => c.id),
    libelleClasse: (id: string) => classes.find((c) => c.id === id)?.libelle ?? id, nomDe,
  };
}

importServices.post("/etablissements/:id/import/services", authentifie, limiteDebitPartage("import-services", 20, 3_600_000, cleProfil), async (c) => {
  const profil = c.get("profil");
  const id = ID_ETAB.parse(c.req.param("id"));
  if (!chefDe(profil, id)) {
    await journaliser(profil, "Import des services d'enseignement", id, "gestion", false, "perimetre");
    refuser("L'attribution des services revient au chef de CET établissement : refus journalisé");
  }
  const saisie = await corps(c, Requete);
  if (!(await anneeAdmise(id, saisie.anneeScolaire))) {
    await journaliser(profil, "Import des services d'enseignement", `${id} · ${saisie.anneeScolaire}`, "gestion", false, "annee");
    throw new HTTPException(422, { message: `Année ${saisie.anneeScolaire} non ouverte pour l'import` });
  }

  const a = await analyser(id, saisie, profil.npi ?? null);
  const totaux = {
    lignes: a.resultats.length,
    aAttribuer: a.resultats.filter((x) => x.statut === "a_attribuer").length,
    dejaAttribues: a.resultats.filter((x) => x.statut === "deja_attribue").length,
    erreurs: a.resultats.filter((x) => x.statut === "erreur").length,
    retraits: a.aRetirer.length,
    principaux: a.principauxValides.length,
  };
  const enClair = (s: Service) => ({ classe: a.libelleClasse(s.classeId), matiere: s.matiere, enseignant: a.nomDe(s.enseignantId) });
  const sortie = (r: Resultat) => { const { classeId: _interne, ...reste } = r; return reste; };
  const rien = !a.attributions.length && !a.aRetirer.length && !a.principauxValides.length && !a.principauxRetires.length;
  if (saisie.mode === "simulation" || rien) {
    await journaliser(profil, "Vérification des services d'enseignement", `${id} · ${JSON.stringify(totaux)}`, "gestion", true, null);
    return c.json({ mode: saisie.mode, ecrit: false, totaux, retraits: a.aRetirer.map(enClair), lignes: a.resultats.map(sortie) });
  }

  // Un fait par mouvement, y compris pour le professeur principal : aucun changement d'accès sans trace au registre.
  const fait = (enseignantId: string, classeId: string, action: "attribue" | "retire" | "principal" | "principal_retire", matiere?: string): NouveauFait => ({
    type: "SERVICE_ENSEIGNEMENT", auteurId: profil.id, etablissementId: id, apprenantId: null, enseignantId,
    donnees: { enseignantId, classeId, action, ...(matiere ? { matiere } : {}), idImport: saisie.idImport },
  });
  const faits = [
    ...a.aRetirer.map((s) => fait(s.enseignantId, s.classeId, "retire", s.matiere)),
    ...a.attributions.map((s) => fait(s.enseignantId, s.classeId, "attribue", s.matiere)),
    ...a.principauxRetires.map(([classeId, ens]) => fait(ens, classeId, "principal_retire")),
    ...a.principauxValides.map(([classeId, ens]) => fait(ens, classeId, "principal")),
  ];
  const instantane = a.existants.map(cle).sort().join(",");
  const concernes = [...new Set([...a.attributions.map((x) => x.enseignantId), ...a.principauxValides.map(([, e]) => e)])];

  try {
    await inscrireAuRegistre(faits, async (tx) => {
      // Deux imports simultanés : l'un attend l'autre, puis on vérifie que les services des classes de l'année n'ont
      // pas bougé depuis l'analyse (même périmètre que l'analyse). Sinon on refuse, sans rien écrire.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`services-edt:${id}`}))`);
      const maintenant = await tx.select({ enseignantId: schema.enseignements.enseignantId, classeId: schema.enseignements.classeId, matiere: schema.enseignements.matiere })
        .from(schema.enseignements).where(inArray(schema.enseignements.classeId, a.classeIds));
      if (maintenant.map(cle).sort().join(",") !== instantane) throw new HTTPException(409, { message: "Les services ont changé pendant l'import : relancez la vérification" });
      // Une mutation acceptée entre l'analyse et maintenant : l'enseignant n'est plus de l'établissement.
      if (concernes.length) {
        const ici = await tx.select({ id: schema.enseignants.id }).from(schema.enseignants).where(and(inArray(schema.enseignants.id, concernes), eq(schema.enseignants.etablissementId, id)));
        if (ici.length !== concernes.length) throw new HTTPException(409, { message: "Un enseignant du fichier vient de quitter l'établissement : relancez la vérification" });
      }
      for (const s of a.aRetirer) {
        await tx.delete(schema.enseignements).where(and(eq(schema.enseignements.enseignantId, s.enseignantId), eq(schema.enseignements.classeId, s.classeId), eq(schema.enseignements.matiere, s.matiere)));
        // Plus de service, plus de séance : l'emploi du temps ne garde pas un cours que l'enseignant n'assure plus.
        await tx.delete(schema.cours).where(and(eq(schema.cours.enseignantId, s.enseignantId), eq(schema.cours.classeId, s.classeId), eq(schema.cours.matiere, s.matiere)));
      }
      if (a.attributions.length) await tx.insert(schema.enseignements).values(a.attributions.map(({ enseignantId, classeId, matiere }) => ({ enseignantId, classeId, matiere }))).onConflictDoNothing();
      for (const [classeId] of a.principauxRetires) await tx.update(schema.classes).set({ enseignantPrincipalId: null }).where(and(eq(schema.classes.id, classeId), eq(schema.classes.etablissementId, id)));
      for (const [classeId, ens] of a.principauxValides) await tx.update(schema.classes).set({ enseignantPrincipalId: ens }).where(and(eq(schema.classes.id, classeId), eq(schema.classes.etablissementId, id)));
    });
  } catch (err) {
    if (err instanceof HTTPException && err.status === 409) await journaliser(profil, "Import des services d'enseignement", `${id} · ${err.message}`, "gestion", false, "concurrence");
    throw err;
  }
  const lignes = a.resultats.map((r) => sortie(r.statut === "a_attribuer" ? { ...r, statut: "attribue" as Statut } : r));
  const refusees = a.resultats.filter((x) => x.statut === "erreur").map((x) => x.n).slice(0, 40).join(",");
  await journaliser(profil, "Import des services d'enseignement", `${id} · ${saisie.anneeScolaire} · ${a.attributions.length} attribué(s), ${a.aRetirer.length} retiré(s), ${a.principauxValides.length} principal(aux), ${a.principauxRetires.length} principal(aux) retiré(s), ${totaux.erreurs} ligne(s) refusée(s)${refusees ? ` [${refusees}]` : ""}`, "gestion", true, null);
  return c.json({ mode: "import", ecrit: true, totaux: { ...totaux, attribues: a.attributions.length, retires: a.aRetirer.length }, retraits: a.aRetirer.map(enClair), lignes }, 201);
});
