import type { NotificationList } from "@lms/shared";
import type { Actor } from "../auth/actor";
import type { Ctx } from "../auth/service";
import type { Env } from "../env";
import { appUrl } from "../lib/config";
import { markReadStatement, notificationsOf, unreadCount, type NotifiedRow } from "../repos/notifications";
import { linkedChatsOf } from "../repos/telegram";
import { telegramClient } from "../telegram/client";

/** The person's own notifications, newest first. */
export async function list(ctx: Ctx, actor: Actor): Promise<NotificationList> {
  const [rows, unread] = await Promise.all([
    notificationsOf(ctx.env.DB, actor.userId, 50),
    unreadCount(ctx.env.DB, actor.userId),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      link: r.link,
      at: r.created_at,
      read: r.read_at !== null,
    })),
    unread,
  };
}

export const unread = (ctx: Ctx, actor: Actor) => unreadCount(ctx.env.DB, actor.userId);

/** Marks some (or all) of the person's notifications as read. */
export async function markRead(ctx: Ctx, actor: Actor, ids: string[] | undefined): Promise<number> {
  await markReadStatement(ctx.env.DB, actor.userId, ids ?? null).run();
  return unreadCount(ctx.env.DB, actor.userId);
}

/** The words sent to Telegram for one notification: the title, the body (when there is one) and the link. */
const telegramText = (row: NotifiedRow, base: string): string =>
  [row.title, row.body, row.link ? `${base}${row.link}` : ""].filter((s) => s !== "").join("\n");

/**
 * Sends each notification that was just made to Telegram too, for whoever linked a chat. Best-effort: one
 * person's message failing (for example they blocked the bot) never stops another's.
 */
async function forwardToTelegram(env: Env, rows: NotifiedRow[]): Promise<void> {
  const client = telegramClient(env);
  if (!client || rows.length === 0) return;
  const chats = await linkedChatsOf(env.DB, [...new Set(rows.map((r) => r.user_id))]);
  if (chats.size === 0) return;
  const base = appUrl(env);
  await Promise.allSettled(
    rows.flatMap((r) => {
      const chatId = chats.get(r.user_id);
      return chatId ? [client.sendMessage(chatId, telegramText(r, base))] : [];
    }),
  );
}

/**
 * Runs a statement that makes notifications. A notification that could not be made never turns a good action
 * (opening work, handing in, scoring) into an error: it is logged for us and the action stays done. The person
 * still sees it in the app (the bell); reaching Telegram too is a bonus, sent after the answer went back.
 */
export async function tell(ctx: Ctx, statement: D1PreparedStatement): Promise<void> {
  let rows: NotifiedRow[];
  try {
    rows = (await statement.all<NotifiedRow>()).results;
  } catch (err) {
    console.error(JSON.stringify({ msg: "notification not made", err: String(err) }));
    return;
  }
  if (rows.length > 0) await ctx.defer(forwardToTelegram(ctx.env, rows));
}

/**
 * The same as `tell`, for the hourly job (there is no request to answer first, and so nothing to defer to
 * after it: the work just runs, inside the job's own try/catch).
 */
export async function tellNow(env: Env, statement: D1PreparedStatement): Promise<void> {
  const rows = (await statement.all<NotifiedRow>()).results;
  await forwardToTelegram(env, rows);
}
