ALTER TABLE `assessments` ADD COLUMN `shuffle_questions` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `assessment_sessions` ADD COLUMN `question_order_json` text;
