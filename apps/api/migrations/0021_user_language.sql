-- 0021: the language each person sees the app in. Expand only.

-- New accounts start in Vietnamese. Only the two languages the app has can be stored.
ALTER TABLE users ADD COLUMN language TEXT NOT NULL DEFAULT 'vi' CHECK (language IN ('vi', 'en'));

-- Everyone who has an account already has been using the app in English, so they keep it.
UPDATE users SET language = 'en';
