import { DEFAULT_LANGUAGE, parseLanguage, type Language } from "@lms/shared";
import { nowIso } from "../lib/time";

export interface TelegramLinkRow {
  user_id: string;
  chat_id: string;
  linked_at: string;
}

export const findLink = (db: D1Database, userId: string): Promise<TelegramLinkRow | null> =>
  db
    .prepare("SELECT user_id, chat_id, linked_at FROM telegram_links WHERE user_id = ?")
    .bind(userId)
    .first<TelegramLinkRow>();

/** The language of the person this chat is linked to; Vietnamese for a chat nobody linked. */
export async function languageOfChat(db: D1Database, chatId: string): Promise<Language> {
  const row = await db
    .prepare("SELECT u.language FROM telegram_links t JOIN users u ON u.id = t.user_id WHERE t.chat_id = ?")
    .bind(chatId)
    .first<{ language: string }>();
  return parseLanguage(row?.language) ?? DEFAULT_LANGUAGE;
}

export const deleteLinkStatement = (db: D1Database, userId: string): D1PreparedStatement =>
  db.prepare("DELETE FROM telegram_links WHERE user_id = ?").bind(userId);

/** The row for another person who already has this chat, so a re-link never trips the unique index on chat_id. */
export const deleteOtherLinkOfChatStatement = (
  db: D1Database,
  chatId: string,
  exceptUserId: string,
): D1PreparedStatement =>
  db.prepare("DELETE FROM telegram_links WHERE chat_id = ? AND user_id != ?").bind(chatId, exceptUserId);

/** Links a chat to a person, or moves it there if they had linked a different chat before. */
export const upsertLinkStatement = (db: D1Database, userId: string, chatId: string): D1PreparedStatement =>
  db
    .prepare(
      `INSERT INTO telegram_links (user_id, chat_id, linked_at) VALUES (?1, ?2, ?3)
       ON CONFLICT (user_id) DO UPDATE SET chat_id = excluded.chat_id, linked_at = excluded.linked_at`,
    )
    .bind(userId, chatId, nowIso());

export const insertLinkCodeStatement = (
  db: D1Database,
  o: { id: string; codeHash: string; userId: string; expiresAt: string },
): D1PreparedStatement =>
  db
    .prepare(
      "INSERT INTO telegram_link_codes (id, code_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(o.id, o.codeHash, o.userId, nowIso(), o.expiresAt);

/**
 * Uses a link code up. One statement, so two people racing the same code cannot both win: only the first
 * gets the row back. Returns null for a code that does not exist, expired, or was already used.
 */
export const consumeLinkCode = (db: D1Database, codeHash: string): Promise<{ user_id: string } | null> =>
  db
    .prepare(
      `UPDATE telegram_link_codes SET used_at = ?1
       WHERE code_hash = ?2 AND used_at IS NULL AND expires_at > ?1
       RETURNING user_id`,
    )
    .bind(nowIso(), codeHash)
    .first<{ user_id: string }>();
