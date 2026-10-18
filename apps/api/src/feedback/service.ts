import type { FeedbackBody, FeedbackBoard, FeedbackCard, Language } from "@lms/shared";
import { teacherMembership, type Actor } from "../auth/actor";
import type { Ctx } from "../auth/service";
import { AppError } from "../lib/errors";
import { uuidv7 } from "../lib/id";
import {
  boardColumn,
  feedbackForOwner,
  insertFeedback,
  type BoardRow,
  type BoardStatus,
} from "../repos/feedback";
import { tellOwner } from "./telegram";
import { hit } from "../security/rate-limit";

/** How many feedbacks one person may send in an hour. */
const SENDS_PER_HOUR = 5;
/** The most cards in one column of the board. */
const CARDS_PER_COLUMN = 50;
/** The longest page path kept. */
const MAX_PAGE_PATH = 200;

/**
 * The page the person was on, kept only when it is a plain path inside the app: it starts with one `/`
 * (not `//`, which a browser reads as another site), has no query or fragment (where tokens could hide),
 * and is short. Anything else becomes null.
 */
export function safePagePath(value: string | undefined): string | null {
  if (value === undefined || value.length > MAX_PAGE_PATH) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("?") || value.includes("#")) return null;
  // A backslash can read as `/` in a browser; control characters (line breaks, tabs) could smuggle text
  // into the owner's message or the logs.
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

/** Saves a feedback from the signed in person. The role and class come from the session, never from the request. */
export async function submitFeedback(ctx: Ctx, actor: Actor, body: FeedbackBody): Promise<{ id: string }> {
  // Counted before anything is saved, so a person over the limit leaves no row behind.
  const limit = await hit(ctx.env.DB, `feedback:user:${actor.userId}`, SENDS_PER_HOUR, 3600);
  if (!limit.allowed) throw new AppError("RATE_LIMITED");

  const teacher = teacherMembership(actor);
  const id = uuidv7();
  await insertFeedback(ctx.env.DB, {
    id,
    userId: actor.userId,
    tenantId: (teacher ?? actor.memberships[0])?.tenantId ?? null,
    role: teacher ? "teacher" : "student",
    kind: body.kind,
    message: body.message,
    page: safePagePath(body.page),
    language: actor.language,
    userAgent: ctx.userAgent,
  });
  await ctx.defer(
    notifyOwner(ctx, actor, { id, kind: body.kind, message: body.message, teacher: !!teacher }),
  );
  return { id };
}

/** Looks the sender up and tells the owner on Telegram. Runs after the answer, so it never slows or fails it. */
async function notifyOwner(
  ctx: Ctx,
  actor: Actor,
  f: { id: string; kind: FeedbackBody["kind"]; message: string; teacher: boolean },
): Promise<void> {
  if (!ctx.env.FEEDBACK_TELEGRAM_CHAT_ID?.trim()) return;
  const saved = await feedbackForOwner(ctx.env.DB, f.id);
  if (!saved) return;
  await tellOwner(ctx.env, {
    id: f.id,
    kind: f.kind,
    message: f.message,
    name: saved.name,
    email: saved.email,
    role: f.teacher ? "teacher" : "student",
    tenantName: saved.tenant_name,
    page: saved.page,
    language: saved.language,
    userAgent: saved.user_agent,
  });
}

/** The public title in the reader's language: English readers get the English one when the owner wrote it. */
const titleFor = (row: BoardRow, language: Language): string => {
  const en = row.public_title_en?.trim() ?? "";
  return language === "en" && en !== "" ? en : row.public_title.trim();
};

const card = (row: BoardRow, language: Language): FeedbackCard => ({
  id: row.id,
  title: titleFor(row, language),
  kind: row.kind,
  role: row.role,
  createdAt: row.created_at,
});

/** The public board: one list for everybody (not only the reader's class), newest first in each column. */
export async function feedbackBoard(ctx: Ctx, actor: Actor): Promise<FeedbackBoard> {
  const column = async (status: BoardStatus) =>
    (await boardColumn(ctx.env.DB, status, CARDS_PER_COLUMN)).map((r) => card(r, actor.language));
  const [todo, inProgress, done] = await Promise.all([column("todo"), column("in_progress"), column("done")]);
  return { todo, inProgress, done };
}
