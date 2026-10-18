-- 0022: feedback people send to the app owner, and the public board of what the owner accepted. Expand only.

-- One row for each feedback sent. Only the owner reads the sender's words, page, language and device (in the
-- database). The board shows nothing but the public title the owner wrote, the kind, the role and the date.
CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  -- The sender's class at the time, for the owner only. The board is one list for everybody.
  tenant_id TEXT REFERENCES tenants (id),
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  kind TEXT NOT NULL CHECK (kind IN ('inconvenient', 'bug', 'feature')),
  message TEXT NOT NULL,
  -- A plain path inside the app, or null (anything else is never stored).
  page TEXT,
  language TEXT NOT NULL CHECK (language IN ('vi', 'en')),
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'todo', 'in_progress', 'done', 'rejected')),
  -- Written by the owner when accepting. Without one, the item is not on the board.
  public_title TEXT,
  public_title_en TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_feedback_status ON feedback (status, created_at);
