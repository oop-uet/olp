CREATE TABLE `assessments` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `instructions` text NOT NULL DEFAULT '',
  `duration_minutes` integer NOT NULL DEFAULT 60,
  `total_points` real NOT NULL DEFAULT 10,
  `status` text NOT NULL DEFAULT 'draft',
  `created_by` text NOT NULL REFERENCES `users`(`id`),
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `published_at` text
);
--> statement-breakpoint
CREATE TABLE `assessment_sections` (
  `id` text PRIMARY KEY NOT NULL,
  `assessment_id` text NOT NULL REFERENCES `assessments`(`id`) ON DELETE CASCADE,
  `title` text NOT NULL,
  `intro_content` text,
  `points` real NOT NULL,
  `order_index` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_sections_assessment_order_unique` ON `assessment_sections` (`assessment_id`,`order_index`);
--> statement-breakpoint
CREATE TABLE `assessment_questions` (
  `id` text PRIMARY KEY NOT NULL,
  `section_id` text NOT NULL REFERENCES `assessment_sections`(`id`) ON DELETE CASCADE,
  `type` text NOT NULL,
  `prompt` text NOT NULL,
  `points` real NOT NULL,
  `order_index` integer NOT NULL,
  `grading_mode` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_questions_section_order_unique` ON `assessment_questions` (`section_id`,`order_index`);
--> statement-breakpoint
CREATE TABLE `assessment_options` (
  `id` text PRIMARY KEY NOT NULL,
  `question_id` text NOT NULL REFERENCES `assessment_questions`(`id`) ON DELETE CASCADE,
  `content` text NOT NULL,
  `order_index` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_options_question_order_unique` ON `assessment_options` (`question_id`,`order_index`);
--> statement-breakpoint
CREATE TABLE `assessment_answer_keys` (
  `question_id` text PRIMARY KEY NOT NULL REFERENCES `assessment_questions`(`id`) ON DELETE CASCADE,
  `answer_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `assessment_grading_guides` (
  `question_id` text PRIMARY KEY NOT NULL REFERENCES `assessment_questions`(`id`) ON DELETE CASCADE,
  `reference_answer` text NOT NULL,
  `rubric_json` text NOT NULL,
  `prompt_template` text NOT NULL DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE `assessment_assignments` (
  `id` text PRIMARY KEY NOT NULL,
  `assessment_id` text NOT NULL REFERENCES `assessments`(`id`),
  `section_id` text NOT NULL REFERENCES `class_sections`(`id`),
  `opens_at` text NOT NULL,
  `closes_at` text NOT NULL,
  `duration_minutes` integer NOT NULL,
  `is_visible` integer NOT NULL DEFAULT 1,
  `require_fullscreen` integer NOT NULL DEFAULT 0,
  `warning_threshold` integer NOT NULL DEFAULT 3,
  `show_predicted_score` integer NOT NULL DEFAULT 1,
  `assigned_by` text NOT NULL REFERENCES `users`(`id`),
  `assigned_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_assignments_assessment_section_unique` ON `assessment_assignments` (`assessment_id`,`section_id`);
--> statement-breakpoint
CREATE TABLE `assessment_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `assignment_id` text NOT NULL REFERENCES `assessment_assignments`(`id`),
  `student_id` text NOT NULL REFERENCES `users`(`id`),
  `status` text NOT NULL DEFAULT 'in_progress',
  `started_at` text NOT NULL,
  `expires_at` text NOT NULL,
  `submitted_at` text,
  `submit_reason` text,
  `auto_score` real NOT NULL DEFAULT 0,
  `predicted_score` real,
  `official_score` real,
  `review_status` text NOT NULL DEFAULT 'not_ready',
  `official_at` text,
  `official_by` text REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_sessions_assignment_student_unique` ON `assessment_sessions` (`assignment_id`,`student_id`);
--> statement-breakpoint
CREATE TABLE `assessment_answers` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL REFERENCES `assessment_sessions`(`id`) ON DELETE CASCADE,
  `question_id` text NOT NULL REFERENCES `assessment_questions`(`id`),
  `answer_json` text NOT NULL,
  `client_revision` integer NOT NULL DEFAULT 1,
  `saved_at` text NOT NULL,
  `auto_points` real,
  `ai_suggested_points` real,
  `final_points` real,
  `ai_feedback` text,
  `final_feedback` text,
  `ai_confidence` text,
  `grading_state` text NOT NULL DEFAULT 'ungraded',
  `reviewed_by` text REFERENCES `users`(`id`),
  `reviewed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_answers_session_question_unique` ON `assessment_answers` (`session_id`,`question_id`);
--> statement-breakpoint
CREATE TABLE `assessment_ai_grading_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `answer_id` text NOT NULL REFERENCES `assessment_answers`(`id`) ON DELETE CASCADE,
  `status` text NOT NULL DEFAULT 'queued',
  `provider` text,
  `model` text,
  `prompt_version` text NOT NULL DEFAULT 'assessment-grading-v1',
  `suggested_points` real,
  `result_json` text,
  `confidence` text,
  `needs_human_attention` integer NOT NULL DEFAULT 0,
  `attempt_count` integer NOT NULL DEFAULT 0,
  `error_code` text,
  `error_message` text,
  `created_at` text NOT NULL,
  `started_at` text,
  `finished_at` text
);
--> statement-breakpoint
CREATE INDEX `assessment_ai_grading_runs_answer_idx` ON `assessment_ai_grading_runs` (`answer_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `assessment_integrity_events` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL REFERENCES `assessment_sessions`(`id`) ON DELETE CASCADE,
  `event_type` text NOT NULL,
  `occurred_at` text NOT NULL,
  `metadata_json` text
);
--> statement-breakpoint
CREATE TABLE `assessment_audit_logs` (
  `id` text PRIMARY KEY NOT NULL,
  `actor_id` text NOT NULL REFERENCES `users`(`id`),
  `action` text NOT NULL,
  `target_type` text NOT NULL,
  `target_id` text NOT NULL,
  `before_json` text,
  `after_json` text,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `assessment_audit_logs_target_idx` ON `assessment_audit_logs` (`target_type`,`target_id`,`created_at`);
