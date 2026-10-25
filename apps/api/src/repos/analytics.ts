/** Product metrics (analytics/events.ts): the sign up's anonymous id, and the days a person used the app. */

/** The browser's anonymous id kept from the email sign up, if any. */
export async function signupAnonIdOf(db: D1Database, userId: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT signup_anon_id FROM users WHERE id = ?")
    .bind(userId)
    .first<{ signup_anon_id: string | null }>();
  return row?.signup_anon_id ?? null;
}

/** When the account was made (ISO time). */
export async function userCreatedAt(db: D1Database, userId: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT created_at FROM users WHERE id = ?")
    .bind(userId)
    .first<{ created_at: string }>();
  return row?.created_at ?? null;
}

/** Notes that this person used the app on `day`. True only the first time for that day. */
export async function markActiveDay(db: D1Database, userId: string, day: string): Promise<boolean> {
  const row = await db
    .prepare("INSERT OR IGNORE INTO user_active_days (user_id, day) VALUES (?, ?) RETURNING day")
    .bind(userId, day)
    .first<{ day: string }>();
  return row !== null;
}

/** Days older than `cutoffDay` ("2025-09-20") are not needed any more. */
export const deleteOldActiveDaysStatement = (db: D1Database, cutoffDay: string): D1PreparedStatement =>
  db.prepare("DELETE FROM user_active_days WHERE day < ?").bind(cutoffDay);
