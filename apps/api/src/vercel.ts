import { handle } from "@hono/node-server/vercel";
import { app } from "./app";

/** Point d'entrée de la fonction Vercel (runtime Node.js) : l'application Hono complète, sans état. */
export default handle(app);
