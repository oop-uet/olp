ALTER TABLE exercises ADD COLUMN style_check_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE exercises ADD COLUMN style_policy TEXT;
