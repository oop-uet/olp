UPDATE `exercise_assignments`
SET `is_assessment` = 0
WHERE `is_assessment` <> 0;
