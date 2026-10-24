import type { NotificationList } from "@lms/shared";
import type { Actor } from "../auth/actor";
import type { Ctx } from "../auth/service";
import { noticeIn } from "../lib/outbound-text";
import { markReadStatement, notificationsOf, unreadCount, type NotifiedRow } from "../repos/notifications";
import { deliver, REQUEST_SEND_LIMIT } from "./delivery";

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
      ...noticeIn(r, actor.language),
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

/**
 * Runs a statement that makes notifications. A notification that could not be made never turns a good action
 * (opening work, handing in, scoring) into an error: it is logged for us and the action stays done. The person
 * still sees it in the app (the bell); reaching their browsers (push) too is a bonus, sent after the
 * answer went back, at most REQUEST_SEND_LIMIT at once (the rest is sent by the job that runs every minute).
 */
export async function tell(ctx: Ctx, statement: D1PreparedStatement): Promise<void> {
  let rows: NotifiedRow[];
  try {
    rows = (await statement.all<NotifiedRow>()).results;
  } catch (err) {
    console.error(JSON.stringify({ msg: "notification not made", err: String(err) }));
    return;
  }
  if (rows.length > 0) await ctx.defer(deliver(ctx.env, rows, REQUEST_SEND_LIMIT));
}
