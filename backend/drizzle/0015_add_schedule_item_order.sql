ALTER TABLE `exercise_assignments` ADD COLUMN `sort_order` integer NOT NULL DEFAULT 0;
ALTER TABLE `assessment_assignments` ADD COLUMN `sort_order` integer NOT NULL DEFAULT 0;
