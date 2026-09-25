import { availableParallelism } from "node:os";
import { serve } from "@hono/node-server";
import { app } from "./app";

// scrypt (connexion) s'exécute dans le pool de threads de libuv (4 par défaut) : on l'aligne sur les cœurs,
// pour qu'un pic de connexions n'attende pas derrière quatre calculs. Le pool est créé à sa première utilisation.
process.env.UV_THREADPOOL_SIZE ??= String(Math.max(4, availableParallelism()));

const port = Number(process.env.PORT ?? 4000);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`BEILE API — http://localhost:${info.port}/api/v1/sante (pool libuv : ${process.env.UV_THREADPOOL_SIZE})`);
});
