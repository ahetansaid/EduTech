import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";

/**
 * Application Hono indépendante de l'hébergement : montée par `server.ts` en local
 * et dans un conteneur, ou par un adaptateur Vercel. Les routes métier de /api/v1
 * implémenteront l'interface BeileClient définie dans @beile/contracts.
 */
export const app = new Hono().basePath("/api/v1");

app.use("*", secureHeaders());

app.get("/sante", (c) =>
  c.json({ statut: "ok", service: "beile-api", version: "0.1.0", horodatage: new Date().toISOString() }),
);
