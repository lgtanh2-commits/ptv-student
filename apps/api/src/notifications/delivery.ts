import type { Env } from "../env";
import { uuidv7 } from "../lib/id";
import { noticeIn } from "../lib/outbound-text";
import { sendPush, type PushContent } from "../push/client";
import { isPushOn } from "../push/service";
import type { NotifiedRow } from "../repos/notifications";
import {
  deleteMessagesStatement,
  deleteSubscriptionsStatement,
  dueMessages,
  enqueueStatement,
  liveSubscriptionsByIds,
  liveSubscriptionsOf,
  retryMessagesStatement,
  type PushSubscriptionRow,
  type QueuedMessage,
} from "../repos/push";

/**
 * The Free plan allows about 50 outgoing requests per request or cron run, and every push (one per browser) is
 * one. A request that makes notifications sends at most this many, a cron run at most
 * JOB_SEND_LIMIT; the rest waits in the queue for the job that runs every minute. The 10 ms of CPU a run may use
 * are the tighter limit (each push is encrypted and signed), so these are set low until the CPU per message is
 * read on Workers (docs/spikes.md, "Web Push CPU").
 */
export const REQUEST_SEND_LIMIT = 10;
export const JOB_SEND_LIMIT = 20;
/** Workers keep at most 6 connections open at once; more sends wait for a free one before they start. */
export const MAX_IN_FLIGHT = 6;
/** A message is tried this many times in all, then given up. */
export const MAX_TRIES = 3;
/** The wait before the next try, for every try so far. */
const RETRY_MINUTES = 5;

/** A push for one browser. `userId`: the person the message is for. */
interface Message {
  userId: string;
  sub: PushSubscriptionRow;
  content: PushContent;
}

type Outcome = "sent" | "gone" | "failed";

/** Sends one message. Never throws: anything that goes wrong is one failed message. */
async function send(env: Env, m: Message): Promise<Outcome> {
  try {
    return await sendPush(env, m.sub, m.content);
  } catch (err) {
    console.error(JSON.stringify({ msg: "message not sent", err: String(err) }));
    return "failed";
  }
}

/**
 * Runs `work` on every item, at most MAX_IN_FLIGHT at once, and returns the results in order. A send only starts
 * (and its timeout only begins) once a connection is free.
 */
async function inPool<T, R>(items: T[], work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await work(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_IN_FLIGHT, items.length) }, worker));
  return results;
}

const queueRow = (m: Message, tries: number, createdAt: string, nextAt: string) => ({
  id: uuidv7(),
  channel: "push" as const,
  userId: m.userId,
  target: m.sub.id,
  content: JSON.stringify(m.content),
  tries,
  createdAt,
  nextAt,
});

/**
 * Sends the notifications that were just made to every browser with push on, each in that browser's language. The first `limit` go now; the rest, and any that failed, wait
 * in the queue. A browser the push service says is gone is forgotten. Never throws: the notifications are in
 * the app (the bell) already, and reaching people elsewhere must never turn an action into an error.
 */
export async function deliver(env: Env, rows: NotifiedRow[], limit: number): Promise<void> {
  if (rows.length === 0) return;
  try {
    const db = env.DB;
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const subs = isPushOn(env) ? await liveSubscriptionsOf(db, userIds) : [];
    if (subs.length === 0) return;

    const messages: Message[] = rows.flatMap((r) =>
      subs
        .filter((s) => s.user_id === r.user_id)
        .map((sub) => ({
          userId: r.user_id,
          sub,
          content: { ...noticeIn(r, sub.language), link: r.link },
        })),
    );

    const now = new Date();
    const nowIso = now.toISOString();
    const retryAt = new Date(now.getTime() + RETRY_MINUTES * 60_000).toISOString();
    const first = messages.slice(0, limit);
    const waiting = messages.slice(limit).map((m) => queueRow(m, 0, nowIso, nowIso));
    // Saved before anything is sent, so the messages over the limit are not lost if this run is cut short.
    if (waiting.length > 0) await enqueueStatement(db, waiting).run();

    const outcomes = await inPool(first, (m) => send(env, m));
    const failed = first
      .filter((_, i) => outcomes[i] === "failed")
      .map((m) => queueRow(m, 1, nowIso, retryAt));
    const gone = first.flatMap((m, i) => (outcomes[i] === "gone" ? [m.sub.id] : []));

    const writes: D1PreparedStatement[] = [];
    if (failed.length > 0) writes.push(enqueueStatement(db, failed));
    if (gone.length > 0) writes.push(deleteSubscriptionsStatement(db, gone));
    if (writes.length > 0) await db.batch(writes);
  } catch (err) {
    console.error(JSON.stringify({ msg: "delivery failed", err: String(err) }));
  }
}

/**
 * Turns a queued row back into a message, or null when it can no longer be sent: it is not a push (a Telegram row
 * left from before notifications stopped going to Telegram), the browser is gone, or it now belongs to someone else
 * than the person the message is for (a shared computer).
 */
function messageOf(q: QueuedMessage, subs: Map<string, PushSubscriptionRow>): Message | null {
  if (q.channel !== "push") return null;
  const sub = subs.get(q.target);
  if (!sub || sub.user_id !== q.user_id) return null;
  try {
    return { userId: q.user_id, sub, content: JSON.parse(q.content) as PushContent };
  } catch {
    return null;
  }
}

/**
 * Runs every minute: sends the oldest waiting messages whose time has come, at most `limit`. A message that
 * fails again waits longer each time, and is given up after MAX_TRIES. A push for a browser that was signed out
 * (or is gone, or is now someone else's) in the meantime is dropped, so a shared computer stops getting someone's
 * messages; so is a leftover Telegram row (nothing is sent to Telegram any more), dropped without a call.
 */
export async function drainQueue(env: Env, limit = JOB_SEND_LIMIT, now: Date = new Date()): Promise<void> {
  const db = env.DB;
  const nowIso = now.toISOString();
  const due = await dueMessages(db, nowIso, limit);
  if (due.length === 0) return;
  const live = await liveSubscriptionsByIds(
    db,
    due.filter((q) => q.channel === "push").map((q) => q.target),
    nowIso,
  );
  const subs = new Map(live.map((s) => [s.id, s]));

  const done: string[] = [];
  const retry: string[] = [];
  const gone: string[] = [];
  await inPool(due, async (q) => {
    const m = messageOf(q, subs);
    if (!m) return void done.push(q.id);
    const outcome = await send(env, m);
    if (outcome === "sent") done.push(q.id);
    else if (outcome === "gone") {
      done.push(q.id);
      gone.push(m.sub.id);
    } else if (q.tries + 1 >= MAX_TRIES) {
      console.error(JSON.stringify({ msg: "message given up", tries: q.tries + 1 }));
      done.push(q.id);
    } else retry.push(q.id);
  });

  const writes: D1PreparedStatement[] = [];
  if (done.length > 0) writes.push(deleteMessagesStatement(db, done));
  if (retry.length > 0) writes.push(retryMessagesStatement(db, retry, nowIso, RETRY_MINUTES));
  if (gone.length > 0) writes.push(deleteSubscriptionsStatement(db, gone));
  if (writes.length > 0) await db.batch(writes);
}
