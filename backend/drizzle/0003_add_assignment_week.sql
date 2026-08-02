ALTER TABLE exercise_assignments ADD COLUMN week INTEGER;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS section_weeks (
  id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL,
  week INTEGER NOT NULL,
  deadline TEXT
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS section_weeks_section_week_unique ON section_weeks(section_id, week);
