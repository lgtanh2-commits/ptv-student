/**
 * Removing what nobody needs any more. Every statement is one DELETE with fixed text; the times come in as values.
 * Never touched here: the audit log (it can only grow), invites (they show who was ever invited), and anything of a student's.
 */

/**
 * Push addresses of sessions that ended (signed out or past their end) and are about to be removed below. Must
 * run before the sessions are deleted: a subscription points at its session. Idling is not an end: an idle
 * session that has a push address stays (see below).
 */
export const deleteEndedSessionSubscriptionsStatement = (
  db: D1Database,
  cutoffIso: string,
  nowIso: string,
): D1PreparedStatement =>
  db
    .prepare(
      `DELETE FROM push_subscriptions
       WHERE session_id IN (
         SELECT id FROM sessions
         WHERE revoked_at IS NOT NULL OR expires_at < ?2
            OR expires_at < ?1
       )`,
    )
    .bind(cutoffIso, nowIso);

/** Messages still waiting after a day will not be sent any more. */
export const deleteOldQueueStatement = (db: D1Database, cutoffIso: string): D1PreparedStatement =>
  db.prepare("DELETE FROM outbound_queue WHERE created_at < ?").bind(cutoffIso);

/**
 * Sessions that ended (by time, or because the person signed out) a while ago, and sessions that idled out of
 * the app, unless they still have a push address: that device keeps getting messages until it signs out or the
 * session reaches its end (owner decision), so the row it hangs on stays.
 */
export const deleteOldSessionsStatement = (
  db: D1Database,
  cutoffIso: string,
  nowIso: string,
): D1PreparedStatement =>
  db
    .prepare(
      `DELETE FROM sessions
       WHERE expires_at < ?1
          OR (revoked_at IS NOT NULL AND revoked_at < ?1)
          OR (datetime(last_seen_at, '+' || (idle_days + 1) || ' days') < datetime(?2)
              AND NOT EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.session_id = sessions.id))`,
    )
    .bind(cutoffIso, nowIso);

/** Sign in links and email confirmations that expired or were used long ago. Invites are kept. */
export const deleteOldTokensStatement = (db: D1Database, cutoffIso: string): D1PreparedStatement =>
  db
    .prepare(
      `DELETE FROM auth_tokens
       WHERE kind != 'invite' AND (expires_at < ?1 OR (used_at IS NOT NULL AND used_at < ?1) OR (revoked_at IS NOT NULL AND revoked_at < ?1))`,
    )
    .bind(cutoffIso);

/** Counters of limits whose window is long over (no window is longer than an hour). `cutoffSec` is in seconds. */
export const deleteOldCountersStatement = (db: D1Database, cutoffSec: number): D1PreparedStatement =>
  db.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(cutoffSec);

/** Emails kept for a developer to read (only in dev mode). They hold links, so they do not stay. */
export const deleteOldOutboxStatement = (db: D1Database, cutoffIso: string): D1PreparedStatement =>
  db.prepare("DELETE FROM email_outbox WHERE created_at < ?").bind(cutoffIso);
