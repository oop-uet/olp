ALTER TABLE `assessment_ai_grading_runs` ADD `next_attempt_at` text;
--> statement-breakpoint
ALTER TABLE `assessment_ai_grading_runs` ADD `locked_until` text;
--> statement-breakpoint
CREATE INDEX `assessment_ai_grading_runs_queue_idx`
  ON `assessment_ai_grading_runs` (`status`, `next_attempt_at`, `created_at`);
--> statement-breakpoint
CREATE INDEX `assessment_integrity_events_session_occurred_idx`
  ON `assessment_integrity_events` (`session_id`, `occurred_at`);
