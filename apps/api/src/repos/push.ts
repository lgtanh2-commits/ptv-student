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
 * signed in. Signing out (or a session ending) stops messages to that device.
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
       WHERE p.user_id IN (SELECT value FROM json_each(?1)) AND s.revoked_at IS NULL AND s.expires_at > ?2`,
    )
    .bind(JSON.stringify(userIds), nowIso)
    .all<Omit<PushSubscriptionRow, "language"> & { language: string }>();
  return res.results.map((r) => ({ ...r, language: parseLanguage(r.language) ?? DEFAULT_LANGUAGE }));
}

export const deleteSubscriptionStatement = (db: D1Database, id: string): D1PreparedStatement =>
  db.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(id);

/** One row per address. Whoever subscribed last owns it, from the session they subscribed in. */
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
         user_id = excluded.user_id, session_id = excluded.session_id,
         p256dh = excluded.p256dh, auth = excluded.auth`,
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
