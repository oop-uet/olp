ALTER TABLE exercise_assignments
ADD COLUMN allow_submission INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint

ALTER TABLE exercise_assignments
ADD COLUMN max_submissions INTEGER;
