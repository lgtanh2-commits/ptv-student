-- 0023: browser push. Expand only.
--
-- One row per signed in device that agreed to get push messages. The row belongs to the session it was made in,
-- so signing out (or the session ending) stops messages to that device.
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  session_id TEXT NOT NULL REFERENCES sessions(id),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);

-- Messages waiting to be sent to a push address or a Telegram chat, with how often sending was tried. `user_id` is
-- the person the message is for: it is only sent if the address or chat still belongs to that same person.
CREATE TABLE outbound_queue (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('push', 'telegram')),
  user_id TEXT NOT NULL,
  target TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0,
  next_at TEXT NOT NULL
);
CREATE INDEX idx_outbound_queue_next ON outbound_queue(next_at);
