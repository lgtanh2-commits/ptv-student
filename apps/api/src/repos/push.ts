import { DEFAULT_LANGUAGE, parseLanguage, type Language } from "@lms/shared";

export interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  language: Language;
}

/**
 * The browsers that can be told something about each of these people: only devices whose session is still
 * signed in, by the same rule as the sign in check (middleware/auth.ts): not signed out, not past its end, not
 * idle for longer than it may be, and the account not turned off. Signing out (or a session ending) stops
 * messages to that device.
 */
export async function liveSubscriptionsOf(
  db: D1Database,
  userIds: string[],
  nowIso: string = new Date().toISOString(),
): Promise<PushSubscriptionRow[]> {
  if (userIds.length === 0) return [];
  const res = await db
    .prepare(
      `SELECT p.id, p.user_id, p.endpoint, p.p256dh, p.auth, u.language
       FROM push_subscriptions p
       JOIN sessions s ON s.id = p.session_id
       JOIN users u ON u.id = p.user_id
       WHERE p.user_id IN (SELECT value FROM json_each(?1)) AND s.revoked_at IS NULL AND s.expires_at > ?2
         AND u.disabled_at IS NULL AND datetime(s.last_seen_at, '+' || s.idle_days || ' days') > datetime(?2)`,
    )
    .bind(JSON.stringify(userIds), nowIso)
    .all<Omit<PushSubscriptionRow, "language"> & { language: string }>();
  return res.results.map((r) => ({ ...r, language: parseLanguage(r.language) ?? DEFAULT_LANGUAGE }));
}

/** The same as `liveSubscriptionsOf`, by subscription: the ones of these that can still be told something. */
export async function liveSubscriptionsByIds(
  db: D1Database,
  ids: string[],
  nowIso: string = new Date().toISOString(),
): Promise<PushSubscriptionRow[]> {
  if (ids.length === 0) return [];
  const res = await db
    .prepare(
      `SELECT p.id, p.user_id, p.endpoint, p.p256dh, p.auth, u.language
       FROM push_subscriptions p
       JOIN sessions s ON s.id = p.session_id
       JOIN users u ON u.id = p.user_id
       WHERE p.id IN (SELECT value FROM json_each(?1)) AND s.revoked_at IS NULL AND s.expires_at > ?2
         AND u.disabled_at IS NULL AND datetime(s.last_seen_at, '+' || s.idle_days || ' days') > datetime(?2)`,
    )
    .bind(JSON.stringify(ids), nowIso)
    .all<Omit<PushSubscriptionRow, "language"> & { language: string }>();
  return res.results.map((r) => ({ ...r, language: parseLanguage(r.language) ?? DEFAULT_LANGUAGE }));
}

/** Subscriptions the push service said are gone (the browser dropped them). */
export const deleteSubscriptionsStatement = (db: D1Database, ids: string[]): D1PreparedStatement =>
  db
    .prepare("DELETE FROM push_subscriptions WHERE id IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(ids));

/**
 * A session is one browser, so it keeps one address: the one it subscribed last. Without this, one person
 * could pile up addresses and use the send limit everybody shares.
 */
export const deleteOtherSessionSubscriptionsStatement = (
  db: D1Database,
  sessionId: string,
  endpoint: string,
): D1PreparedStatement =>
  db
    .prepare("DELETE FROM push_subscriptions WHERE session_id = ? AND endpoint <> ?")
    .bind(sessionId, endpoint);

// ---------------------------------------------------------------- messages waiting to be sent

export interface QueuedMessage {
  id: string;
  channel: "push" | "telegram";
  /** The person the message is for. */
  user_id: string;
  /** A push subscription id, or a Telegram chat id. */
  target: string;
  /** For push the JSON `{ title, body, link }`, for Telegram the finished text. */
  content: string;
  tries: number;
}

/** Puts these messages in the queue, all in one statement however many there are. */
export const enqueueStatement = (
  db: D1Database,
  rows: (Omit<QueuedMessage, "user_id"> & { userId: string; createdAt: string; nextAt: string })[],
): D1PreparedStatement =>
  db
    .prepare(
      `INSERT INTO outbound_queue (id, channel, user_id, target, content, created_at, tries, next_at)
       SELECT json_extract(value, '$.id'), json_extract(value, '$.channel'), json_extract(value, '$.userId'),
              json_extract(value, '$.target'),
              json_extract(value, '$.content'), json_extract(value, '$.createdAt'), json_extract(value, '$.tries'),
              json_extract(value, '$.nextAt')
       FROM json_each(?)`,
    )
    .bind(JSON.stringify(rows));

/** The oldest messages whose time to be (tried again) has come. */
export async function dueMessages(db: D1Database, nowIso: string, limit: number): Promise<QueuedMessage[]> {
  const res = await db
    .prepare(
      `SELECT id, channel, user_id, target, content, tries FROM outbound_queue
       WHERE next_at <= ? ORDER BY created_at, id LIMIT ?`,
    )
    .bind(nowIso, limit)
    .all<QueuedMessage>();
  return res.results;
}

export const deleteMessagesStatement = (db: D1Database, ids: string[]): D1PreparedStatement =>
  db
    .prepare("DELETE FROM outbound_queue WHERE id IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(ids));

/** One more failed try: the next one waits 5 minutes for every try so far. */
export const retryMessagesStatement = (
  db: D1Database,
  ids: string[],
  nowIso: string,
  minutesPerTry: number,
): D1PreparedStatement =>
  db
    .prepare(
      `UPDATE outbound_queue
       SET tries = tries + 1,
           next_at = strftime('%Y-%m-%dT%H:%M:%fZ', ?2, '+' || (?3 * (tries + 1)) || ' minutes')
       WHERE id IN (SELECT value FROM json_each(?1))`,
    )
    .bind(JSON.stringify(ids), nowIso, minutesPerTry);

/**
 * One row per address. Whoever subscribed last owns it, from the session they subscribed in. A new owner gets a
 * new id, so nothing that waited in the queue for the one before can reach them.
 */
export const upsertSubscriptionStatement = (
  db: D1Database,
  s: {
    id: string;
    userId: string;
    sessionId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    createdAt: string;
  },
): D1PreparedStatement =>
  db
    .prepare(
      `INSERT INTO push_subscriptions (id, user_id, session_id, endpoint, p256dh, auth, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT (endpoint) DO UPDATE SET
         id = excluded.id, user_id = excluded.user_id, session_id = excluded.session_id,
         p256dh = excluded.p256dh, auth = excluded.auth, created_at = excluded.created_at`,
    )
    .bind(s.id, s.userId, s.sessionId, s.endpoint, s.p256dh, s.auth, s.createdAt);

export async function isSubscribed(
  db: D1Database,
  userId: string,
  sessionId: string,
  endpoint: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT 1 AS found FROM push_subscriptions WHERE endpoint = ? AND user_id = ? AND session_id = ?",
    )
    .bind(endpoint, userId, sessionId)
    .first();
  return row !== null;
}

/** Only the person's own row goes; an address that belongs to someone else is left alone. */
export const deleteOwnSubscriptionStatement = (
  db: D1Database,
  userId: string,
  endpoint: string,
): D1PreparedStatement =>
  db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?").bind(endpoint, userId);
