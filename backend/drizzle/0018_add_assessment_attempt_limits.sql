ALTER TABLE `assessment_assignments` ADD COLUMN `max_attempts` integer NOT NULL DEFAULT 1;
ALTER TABLE `assessment_sessions` ADD COLUMN `attempt_number` integer NOT NULL DEFAULT 1;
DROP INDEX IF EXISTS `assessment_sessions_assignment_student_unique`;
CREATE UNIQUE INDEX `assessment_sessions_assignment_student_attempt_unique`
  ON `assessment_sessions` (`assignment_id`, `student_id`, `attempt_number`);
