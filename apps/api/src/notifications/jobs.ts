import type { Env } from "../env";
import {
  cleanupStatement,
  notifyDueSoonStatement,
  notifyOverdueStatement,
  type NotifiedRow,
} from "../repos/notifications";
import { deliver, JOB_SEND_LIMIT } from "./delivery";

/** Work due in the next 24 hours is reminded about. The job runs every hour, so a reminder comes 1 to 24 hours before. */
const REMIND_HOURS = 24;

/** Work whose deadline passed in the last 24 hours is reminded about once, so a deadline missed long ago says nothing. */
const OVERDUE_HOURS = 24;

/**
 * What the app does by itself, once an hour: makes the reminders for work that is due soon or just overdue (one for each
 * person and piece of work), sends the ones that were made to browsers with push on and to linked Telegram chats (all of
 * them within one send limit; the rest waits for the job that runs every minute), and removes notifications older than
 * 90 days. Nothing is sent by email.
 */
export async function runNotificationJobs(env: Env, now: Date = new Date()): Promise<void> {
  const db = env.DB;
  const dueRows = (
    await notifyDueSoonStatement(
      db,
      now.toISOString(),
      new Date(now.getTime() + REMIND_HOURS * 3_600_000).toISOString(),
    ).all<NotifiedRow>()
  ).results;
  const overdueRows = (
    await notifyOverdueStatement(
      db,
      new Date(now.getTime() - OVERDUE_HOURS * 3_600_000).toISOString(),
      now.toISOString(),
    ).all<NotifiedRow>()
  ).results;
  await deliver(env, [...dueRows, ...overdueRows], JOB_SEND_LIMIT);
  await cleanupStatement(db, new Date(now.getTime() - 90 * 86_400_000).toISOString()).run();
}
