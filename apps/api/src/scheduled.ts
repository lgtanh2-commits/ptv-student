import type { Env } from "./env";
import { extendOpenSeries } from "./lessons/jobs";
import { runMaintenance } from "./maintenance/jobs";
import { drainQueue } from "./notifications/delivery";
import { makeReminders, sendReminders } from "./notifications/jobs";
import type { NotifiedRow } from "./repos/notifications";

/** The cron that sends what waits in the queue (the hourly one is "0 * * * *"). */
export const EVERY_MINUTE = "* * * * *";
export const EVERY_HOUR = "0 * * * *";

/**
 * What the app does by itself for one schedule (see "triggers" in wrangler.jsonc). Every minute: only the messages
 * that wait to be sent. Once an hour: reminders, the next lessons of repeats that have no end date, cleaning up,
 * then sending the reminders. Never throws: a failed job is logged.
 */
export async function runScheduled(cron: string, env: Env): Promise<void> {
  if (cron === EVERY_MINUTE) {
    await drainQueue(env).catch((err) =>
      console.error(JSON.stringify({ msg: "scheduled job failed", job: "send queue", err: String(err) })),
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
  for (const [name, job] of jobs) {
    try {
      await job(env);
    } catch (err) {
      console.error(JSON.stringify({ msg: "scheduled job failed", job: name, err: String(err) }));
    }
  }
}
