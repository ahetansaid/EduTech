import { app } from "@beile/api/app";
import { handle } from "hono/vercel";

/**
 * L'API BEILE (application Hono de apps/api) servie par Next.js sous /api/v1 : un seul déploiement
 * Vercel, une seule origine. Sur l'infrastructure souveraine, apps/api tourne seule dans un conteneur.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(app);
export const POST = handle(app);
export const OPTIONS = handle(app);
