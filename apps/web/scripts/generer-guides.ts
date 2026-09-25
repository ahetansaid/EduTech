/**
 * Génère la documentation écrite des utilisateurs (docs/guides/*.md) à partir du contenu du centre d'aide
 * (src/lib/aide.ts). Une seule source : ce que lit l'utilisateur dans l'application et ce qu'imprime
 * l'administration sont toujours identiques.
 *
 *   npm run guides:docs -w @beile/web
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CHANGER_MOT_DE_PASSE, DEMANDER_AIDE, EN_CAS_DE_PROBLEME, FAQ_GENERALE, PREMIERE_CONNEXION, PROFILS, SE_CONNECTER, SE_DECONNECTER,
  SECURITE, VISITE_GUIDEE, type ContenuProfil, type Tache,
} from "../src/lib/aide";

const SORTIE = fileURLToPath(new URL("../../../docs/guides/", import.meta.url));
const ADRESSE = "https://edu-tech-api-rho.vercel.app";

const tache = (t: Tache, niveau = "###") => [
  `${niveau} ${t.titre}`,
  "",
  ...(t.pourquoi ? [`> ${t.pourquoi}`, ""] : []),
  ...t.etapes.map((e, i) => `${i + 1}. ${e}`),
  "",
];

const communs = [
  "## Premiers pas",
  "",
  ...tache(SE_CONNECTER),
  ...tache(PREMIERE_CONNEXION),
  ...tache(VISITE_GUIDEE),
  ...tache(CHANGER_MOT_DE_PASSE),
  ...tache(SE_DECONNECTER),
];

function guide(p: ContenuProfil) {
  return [
    `# Guide ${p.nom}`,
    "",
    `**Pour qui :** ${p.pourQui}  `,
    `**Votre espace :** ${p.espace} — vous y arrivez directement après la connexion (\`${p.arrivee}\`).  `,
    `**Accès :** ${ADRESSE}${p.arrivee} · centre d'aide en ligne : ${ADRESSE}/aide/${p.slug}`,
    "",
    `> ${p.objectif}`,
    "",
    "## Sommaire",
    "",
    "1. [Premiers pas](#premiers-pas)",
    "2. [Vos écrans](#vos-écrans)",
    "3. [Tâches pas à pas](#tâches-pas-à-pas)",
    "4. [Questions fréquentes](#questions-fréquentes)",
    "5. [Bons réflexes](#bons-réflexes)",
    "6. [En cas de problème](#en-cas-de-problème)",
    "",
    ...communs,
    "## Vos écrans",
    "",
    ...p.ecrans.flatMap((e) => [`### ${e.titre}`, "", `\`${e.chemin}\` — ${e.resume}`, "", ...e.points.map((x) => `- ${x}`), ""]),
    "## Tâches pas à pas",
    "",
    ...p.taches.flatMap((t) => tache(t)),
    "## Questions fréquentes",
    "",
    ...[...p.faq, ...FAQ_GENERALE].flatMap((f) => [`**${f.q}**  `, f.r, ""]),
    "## Bons réflexes",
    "",
    ...p.conseils.map((c) => `- ${c}`),
    ...SECURITE.map((s) => `- **${s.titre}.** ${s.texte}`),
    "",
    "## En cas de problème",
    "",
    ...EN_CAS_DE_PROBLEME.map((x) => `- ${x}`),
    "",
    ...tache(DEMANDER_AIDE),
    "---",
    "",
    "*Document généré depuis le centre d'aide de l'application (`apps/web/src/lib/aide.ts`) : ne pas modifier à la main.*",
    "",
  ].join("\n");
}

mkdirSync(SORTIE, { recursive: true });
for (const p of PROFILS) writeFileSync(`${SORTIE}${p.slug}.md`, guide(p));
writeFileSync(`${SORTIE}README.md`, [
  "# Guides des utilisateurs de BEILE",
  "",
  "Un guide par profil : se connecter, chaque écran, les tâches courantes pas à pas, les questions fréquentes et les bons réflexes.",
  `Les mêmes contenus sont consultables en ligne, sans compte, dans le centre d'aide : ${ADRESSE}/aide.`,
  "Dans l'application, le bouton « Guide » relance à tout moment la visite guidée animée de l'espace.",
  "",
  "| Profil | Pour qui | Espace |",
  "|---|---|---|",
  ...PROFILS.map((p) => `| [${p.nom}](${p.slug}.md) | ${p.pourQui} | ${p.espace} |`),
  "",
  "---",
  "",
  "*Généré depuis `apps/web/src/lib/aide.ts` (`npm run guides:docs -w @beile/web`).*",
  "",
].join("\n"));
console.log(`${PROFILS.length} guides écrits dans docs/guides/`);
