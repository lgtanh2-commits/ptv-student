import { createApp } from "./app";
import type { Env } from "./env";
import { extendOpenSeries } from "./lessons/jobs";
import { runMaintenance } from "./maintenance/jobs";
import { drainQueue } from "./notifications/delivery";
import { makeReminders, sendReminders } from "./notifications/jobs";
import type { NotifiedRow } from "./repos/notifications";

const app = createApp();

/** The cron that sends what waits in the queue (the hourly one is "0 * * * *"). */
const EVERY_MINUTE = "* * * * *";

export default {
  fetch: app.fetch,
  // Two schedules (see "triggers" in wrangler.jsonc). Every minute: only the messages that wait to be sent.
  // Once an hour: reminders, the next lessons of repeats that have no end date, cleaning up, then sending the reminders.
  scheduled(event, env, ctx) {
    if (event.cron === EVERY_MINUTE) {
      ctx.waitUntil(
        drainQueue(env).catch((err) =>
          console.error(JSON.stringify({ msg: "scheduled job failed", job: "send queue", err: String(err) })),
        ),
      );
      return;
    }
    // One job that fails must not stop the others. Sending is last: it uses the most CPU, so if the run is
    // stopped for using too much, the other jobs are done already (and what was not sent waits in the queue).
    let reminders: NotifiedRow[] = [];
    const jobs: [string, (env: Env) => Promise<unknown>][] = [
      ["reminders", async (e) => void (reminders = await makeReminders(e))],
      ["repeating lessons", extendOpenSeries],
      ["clean up", runMaintenance],
      ["send reminders", (e) => sendReminders(e, reminders)],
    ];
    ctx.waitUntil(
      (async () => {
        for (const [name, job] of jobs) {
          try {
            await job(env);
          } catch (err) {
            console.error(JSON.stringify({ msg: "scheduled job failed", job: name, err: String(err) }));
          }
        }
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
