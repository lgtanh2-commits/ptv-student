import type { Language } from "@lms/shared";
import type { Env } from "../env";
import { appUrl } from "../lib/config";
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
import { linkedChatsOf, stillLinkedChats } from "../repos/telegram";
import { telegramClient } from "../telegram/client";

/**
 * The Free plan allows about 50 outgoing requests per request or cron run, and every push (one per browser) and
 * every Telegram message is one. A request that makes notifications sends at most this many, a cron run at most
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

/** `userId`: the person the message is for. */
type Message =
  | { channel: "push"; userId: string; sub: PushSubscriptionRow; content: PushContent }
  | { channel: "telegram"; userId: string; chatId: string; text: string };

type Outcome = "sent" | "gone" | "failed";

/** The words sent to Telegram for one notification, in `lang`: the title, the body (when there is one) and the link. */
const telegramText = (row: NotifiedRow, lang: Language, base: string): string => {
  const { title, body } = noticeIn(row, lang);
  return [title, body, row.link ? `${base}${row.link}` : ""].filter((s) => s !== "").join("\n");
};

/** Sends one message. Never throws: anything that goes wrong is one failed message. */
async function send(env: Env, m: Message): Promise<Outcome> {
  try {
    if (m.channel === "push") return await sendPush(env, m.sub, m.content);
    const client = telegramClient(env);
    if (!client) return "failed";
    return (await client.sendMessage(m.chatId, m.text)) ? "sent" : "failed";
  } catch (err) {
    console.error(JSON.stringify({ msg: "message not sent", channel: m.channel, err: String(err) }));
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
  channel: m.channel,
  userId: m.userId,
  target: m.channel === "push" ? m.sub.id : m.chatId,
  content: m.channel === "push" ? JSON.stringify(m.content) : m.text,
  tries,
  createdAt,
  nextAt,
});

/**
 * Sends the notifications that were just made to every browser with push on and every linked Telegram chat of
 * their person, each in that person's language. The first `limit` go now; the rest, and any that failed, wait
 * in the queue. A browser the push service says is gone is forgotten. Never throws: the notifications are in
 * the app (the bell) already, and reaching people elsewhere must never turn an action into an error.
 */
export async function deliver(env: Env, rows: NotifiedRow[], limit: number): Promise<void> {
  if (rows.length === 0) return;
  try {
    const db = env.DB;
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const [subs, chats] = await Promise.all([
      isPushOn(env) ? liveSubscriptionsOf(db, userIds) : Promise.resolve([]),
      telegramClient(env) ? linkedChatsOf(db, userIds) : Promise.resolve(new Map()),
    ]);
    if (subs.length === 0 && chats.size === 0) return;

    const base = appUrl(env);
    const messages: Message[] = rows.flatMap((r) => {
      const toPush: Message[] = subs
        .filter((s) => s.user_id === r.user_id)
        .map((sub) => ({
          channel: "push",
          userId: r.user_id,
          sub,
          content: { ...noticeIn(r, sub.language), link: r.link },
        }));
      const chat = chats.get(r.user_id);
      const toChat: Message[] = chat
        ? [
            {
              channel: "telegram",
              userId: r.user_id,
              chatId: chat.chatId,
              text: telegramText(r, chat.language, base),
            },
          ]
        : [];
      return [...toPush, ...toChat];
    });

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
    const gone = first.flatMap((m, i) => (outcomes[i] === "gone" && m.channel === "push" ? [m.sub.id] : []));

    const writes: D1PreparedStatement[] = [];
    if (failed.length > 0) writes.push(enqueueStatement(db, failed));
    if (gone.length > 0) writes.push(deleteSubscriptionsStatement(db, gone));
    if (writes.length > 0) await db.batch(writes);
  } catch (err) {
    console.error(JSON.stringify({ msg: "delivery failed", err: String(err) }));
  }
}

/**
 * Turns a queued row back into a message, or null when it can no longer be sent: the browser or the chat is gone,
 * or it now belongs to someone else than the person the message is for (a shared computer, a chat linked again).
 */
function messageOf(
  q: QueuedMessage,
  subs: Map<string, PushSubscriptionRow>,
  chats: Map<string, string>,
): Message | null {
  if (q.channel === "telegram")
    return chats.get(q.target) === q.user_id
      ? { channel: "telegram", userId: q.user_id, chatId: q.target, text: q.content }
      : null;
  const sub = subs.get(q.target);
  if (!sub || sub.user_id !== q.user_id) return null;
  try {
    return { channel: "push", userId: q.user_id, sub, content: JSON.parse(q.content) as PushContent };
  } catch {
    return null;
  }
}

/**
 * Runs every minute: sends the oldest waiting messages whose time has come, at most `limit`. A message that
 * fails again waits longer each time, and is given up after MAX_TRIES. A push for a browser that was signed out
 * (or is gone, or is now someone else's) in the meantime is dropped, so a shared computer stops getting someone's
 * messages; so is a Telegram message for a chat that was unlinked or linked to someone else.
 */
export async function drainQueue(env: Env, limit = JOB_SEND_LIMIT, now: Date = new Date()): Promise<void> {
  const db = env.DB;
  const nowIso = now.toISOString();
  const due = await dueMessages(db, nowIso, limit);
  if (due.length === 0) return;
  const targets = (channel: QueuedMessage["channel"]) =>
    due.filter((q) => q.channel === channel).map((q) => q.target);
  const [live, chats] = await Promise.all([
    liveSubscriptionsByIds(db, targets("push"), nowIso),
    stillLinkedChats(db, targets("telegram")),
  ]);
  const subs = new Map(live.map((s) => [s.id, s]));

  const done: string[] = [];
  const retry: string[] = [];
  const gone: string[] = [];
  await inPool(due, async (q) => {
    const m = messageOf(q, subs, chats);
    if (!m) return void done.push(q.id);
    const outcome = await send(env, m);
    if (outcome === "sent") done.push(q.id);
    else if (outcome === "gone") {
      done.push(q.id);
      if (m.channel === "push") gone.push(m.sub.id);
    } else if (q.tries + 1 >= MAX_TRIES) {
      console.error(JSON.stringify({ msg: "message given up", channel: q.channel, tries: q.tries + 1 }));
      done.push(q.id);
    } else retry.push(q.id);
  });

  const writes: D1PreparedStatement[] = [];
  if (done.length > 0) writes.push(deleteMessagesStatement(db, done));
  if (retry.length > 0) writes.push(retryMessagesStatement(db, retry, nowIso, RETRY_MINUTES));
  if (gone.length > 0) writes.push(deleteSubscriptionsStatement(db, gone));
  if (writes.length > 0) await db.batch(writes);
}
