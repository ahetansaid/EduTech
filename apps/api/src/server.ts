import { serve } from "@hono/node-server";
import { app } from "./app";

const port = Number(process.env.PORT ?? 4000);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`BEILE API — http://localhost:${info.port}/api/v1/sante`);
});
