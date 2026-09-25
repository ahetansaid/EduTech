// Construit le back-end au format « Build Output API » de Vercel : une seule fonction Node.js
// (bundle esbuild : API + paquets du monorepo) qui reçoit toutes les requêtes.
import { build } from "esbuild";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const racine = fileURLToPath(new URL("..", import.meta.url));
const sortie = `${racine}.vercel/output`;
const fonction = `${sortie}/functions/api.func`;
rmSync(sortie, { recursive: true, force: true });
mkdirSync(fonction, { recursive: true });

const r = await build({
  entryPoints: [`${racine}src/vercel.ts`],
  outfile: `${fonction}/index.mjs`,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  minify: true,
  sourcemap: false,
  legalComments: "none",
  metafile: true,
  // Certains paquets CommonJS appellent require() : on le fournit au module ESM.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});

writeFileSync(`${fonction}/.vc-config.json`, JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false, maxDuration: 30 }, null, 2));
writeFileSync(`${sortie}/config.json`, JSON.stringify({ version: 3, routes: [{ src: "/(.*)", dest: "/api" }] }, null, 2));
const octets = Object.values(r.metafile.outputs).reduce((s, o) => s + o.bytes, 0);
console.log(`Fonction API construite : ${(octets / 1024).toFixed(0)} Ko → .vercel/output/functions/api.func`);
