import { Hono } from "hono";
import type { AppBindings } from "../env";
import { isLocalOrTest } from "../lib/config";
import { AppError } from "../lib/errors";
import { EVERY_HOUR, EVERY_MINUTE, runScheduled } from "../scheduled";

/**
 * Lets a developer read the emails the app "sent" in dev mode (magic links included).
 * Only on a local machine or in tests. On any deployed address it answers "not found",
 * because these links can sign people in.
 */
export const dev = new Hono<AppBindings>();

dev.get("/dev/outbox", async (c) => {
  if (!isLocalOrTest(c.env)) throw new AppError("NOT_FOUND");
  const rows = await c.env.DB.prepare(
    "SELECT id, kind, to_email, subject, body_text, created_at FROM email_outbox ORDER BY created_at DESC, id DESC LIMIT 50",
  ).all();
  return c.json({ emails: rows.results });
});

/**
 * Runs what a schedule runs, now: `?job=hour` (reminders, repeats, clean up) or `?job=minute` (send the queue).
 * Locally the schedules never fire by themselves, so this is how to try reminders and push. Only on a local
 * machine or in tests.
 */
dev.get("/dev/run-jobs", async (c) => {
  if (!isLocalOrTest(c.env)) throw new AppError("NOT_FOUND");
  const job = c.req.query("job") === "minute" ? "minute" : "hour";
  await runScheduled(job === "minute" ? EVERY_MINUTE : EVERY_HOUR, c.env);
  return c.json({ ran: job });
});
