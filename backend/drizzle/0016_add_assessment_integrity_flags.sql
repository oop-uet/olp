ALTER TABLE `assessment_sessions` ADD COLUMN `flagged_question_ids_json` text;
UPDATE `assessment_assignments` SET `require_fullscreen` = 1;
