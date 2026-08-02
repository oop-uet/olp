ALTER TABLE exercises ADD COLUMN style_check_enabled INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE exercises ADD COLUMN style_policy TEXT;
