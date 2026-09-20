-- 0020: linking a person's Telegram chat, so their notifications can also reach them there. Expand only.

-- One row per person. A chat can belong to only one person; when the webhook links it to someone new, the
-- old row for that chat is removed first (see repos/telegram.ts), so this index never blocks a re-link.
CREATE TABLE telegram_links (
  user_id TEXT PRIMARY KEY REFERENCES users (id),
  chat_id TEXT NOT NULL,
  linked_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_telegram_links_chat ON telegram_links (chat_id);

-- A one-time code a person opens in Telegram as "/start <code>" to link their account. Same shape as the
-- one-time codes in auth_tokens: only the hash is stored, and it is used once.
CREATE TABLE telegram_link_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users (id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX idx_telegram_link_codes_user ON telegram_link_codes (user_id, created_at);
