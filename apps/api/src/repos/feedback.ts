import type { FeedbackKind } from "@lms/shared";
import { nowIso } from "../lib/time";

export type FeedbackRole = "teacher" | "student";
export type BoardStatus = "todo" | "in_progress" | "done";

export interface NewFeedback {
  id: string;
  userId: string;
  tenantId: string | null;
  role: FeedbackRole;
  kind: FeedbackKind;
  message: string;
  page: string | null;
  language: string;
  userAgent: string | null;
}

/** Saves one feedback. It always starts as `new`: only the owner moves it on. */
export async function insertFeedback(db: D1Database, f: NewFeedback): Promise<void> {
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO feedback (id, user_id, tenant_id, role, kind, message, page, language, user_agent, status,
         created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'new', ?10, ?10)`,
    )
    .bind(f.id, f.userId, f.tenantId, f.role, f.kind, f.message, f.page, f.language, f.userAgent, now)
    .run();
}

/**
 * What the public board may show of one item. Only these columns are ever read for the board: never the
 * message, the sender, the class, the page, the language or the device.
 */
export interface BoardRow {
  id: string;
  kind: FeedbackKind;
  role: FeedbackRole;
  public_title: string;
  public_title_en: string | null;
  created_at: string;
}

/** The newest `limit` items of one column that have a public title, from everybody (the board is global). */
export async function boardColumn(db: D1Database, status: BoardStatus, limit: number): Promise<BoardRow[]> {
  const res = await db
    .prepare(
      `SELECT id, kind, role, public_title, public_title_en, created_at FROM feedback
       WHERE status = ?1 AND public_title IS NOT NULL AND trim(public_title) <> ''
       ORDER BY created_at DESC, id DESC
       LIMIT ?2`,
    )
    .bind(status, limit)
    .all<BoardRow>();
  return res.results;
}
