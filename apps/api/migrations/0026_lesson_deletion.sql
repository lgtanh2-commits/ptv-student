-- Keep the date in a repeating series so deleting its last occurrence does not bring it back.
ALTER TABLE lessons ADD COLUMN deleted_at TEXT;
