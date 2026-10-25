-- 0024: product metrics in Mixpanel. Expand only.
--
-- The browser's anonymous id at email sign up, kept until the email is confirmed (then cleared), so the "Signed Up" event can be
-- joined to the visits before it (also when the email is confirmed on another device). Empty for everyone else.
ALTER TABLE users ADD COLUMN signup_anon_id TEXT;

-- The days (Vietnam time, "2026-10-25") on which a person used the app. The first signed in request of a day adds
-- the row and sends "App Opened"; every later one that day finds it and sends nothing. Rows older than 400 days are
-- removed by the hourly clean up.
CREATE TABLE user_active_days (
  user_id TEXT NOT NULL REFERENCES users(id),
  day TEXT NOT NULL,
  PRIMARY KEY (user_id, day)
);
