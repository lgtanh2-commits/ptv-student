import { createApp } from "./app";
import type { Env } from "./env";
import { runScheduled } from "./scheduled";

const app = createApp();

export default {
  fetch: app.fetch,
  // Two schedules (see "triggers" in wrangler.jsonc and scheduled.ts).
  scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduled(event.cron, env));
  },
} satisfies ExportedHandler<Env>;
