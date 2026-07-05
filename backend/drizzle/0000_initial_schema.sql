CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `username` text NOT NULL,
  `email` text NOT NULL,
  `password_hash` text NOT NULL,
  `role` text NOT NULL,
  `failed_login_attempts` integer NOT NULL DEFAULT 0,
  `locked_until` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);

CREATE TABLE `class_sections` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `semester` text NOT NULL,
  `instructor_id` text REFERENCES `users`(`id`),
  `created_at` text NOT NULL
);

CREATE TABLE `section_instructors` (
  `id` text PRIMARY KEY NOT NULL,
  `section_id` text NOT NULL REFERENCES `class_sections`(`id`),
  `instructor_id` text NOT NULL REFERENCES `users`(`id`),
  `is_primary` integer NOT NULL DEFAULT 0,
  `assigned_at` text NOT NULL
);

CREATE UNIQUE INDEX `section_instructors_section_instructor_unique`
  ON `section_instructors` (`section_id`, `instructor_id`);

CREATE TABLE `section_enrollments` (
  `id` text PRIMARY KEY NOT NULL,
  `section_id` text NOT NULL REFERENCES `class_sections`(`id`),
  `student_id` text NOT NULL REFERENCES `users`(`id`),
  `student_external_id` text,
  `enrolled_at` text NOT NULL
);

CREATE UNIQUE INDEX `enrollments_section_student_unique` ON `section_enrollments` (`section_id`, `student_id`);
CREATE UNIQUE INDEX `enrollments_student_unique` ON `section_enrollments` (`student_id`);

CREATE TABLE `exercises` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `description` text NOT NULL,
  `difficulty` text NOT NULL,
  `starter_code` text,
  `is_library` integer NOT NULL DEFAULT 0,
  `oop_tags` text NOT NULL,
  `created_by` text REFERENCES `users`(`id`),
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE TABLE `exercise_assignments` (
  `id` text PRIMARY KEY NOT NULL,
  `exercise_id` text NOT NULL REFERENCES `exercises`(`id`),
  `section_id` text NOT NULL REFERENCES `class_sections`(`id`),
  `deadline` text,
  `is_assessment` integer NOT NULL DEFAULT 0,
  `assigned_at` text NOT NULL
);

CREATE UNIQUE INDEX `assignments_exercise_section_unique` ON `exercise_assignments` (`exercise_id`, `section_id`);

CREATE TABLE `test_cases` (
  `id` text PRIMARY KEY NOT NULL,
  `exercise_id` text NOT NULL REFERENCES `exercises`(`id`),
  `input_data` text NOT NULL,
  `expected_output` text NOT NULL,
  `is_visible` integer NOT NULL DEFAULT 0,
  `point_value` integer NOT NULL DEFAULT 1,
  `time_limit_seconds` integer,
  `created_at` text NOT NULL
);

CREATE TABLE `submissions` (
  `id` text PRIMARY KEY NOT NULL,
  `student_id` text NOT NULL REFERENCES `users`(`id`),
  `exercise_id` text NOT NULL REFERENCES `exercises`(`id`),
  `section_id` text NOT NULL REFERENCES `class_sections`(`id`),
  `code` text NOT NULL,
  `score` real,
  `attempt_number` integer NOT NULL DEFAULT 1,
  `submitted_at` text NOT NULL
);

CREATE TABLE `submission_results` (
  `id` text PRIMARY KEY NOT NULL,
  `submission_id` text NOT NULL REFERENCES `submissions`(`id`),
  `test_case_id` text NOT NULL REFERENCES `test_cases`(`id`),
  `passed` integer NOT NULL DEFAULT 0,
  `actual_output` text,
  `status` text NOT NULL,
  `execution_time_ms` integer
);

CREATE TABLE `anticheat_events` (
  `id` text PRIMARY KEY NOT NULL,
  `submission_id` text REFERENCES `submissions`(`id`),
  `student_id` text NOT NULL REFERENCES `users`(`id`),
  `exercise_id` text NOT NULL REFERENCES `exercises`(`id`),
  `event_type` text NOT NULL,
  `warning_count_at_event` integer NOT NULL,
  `occurred_at` text NOT NULL
);

CREATE TABLE `system_config` (
  `key` text PRIMARY KEY NOT NULL,
  `value` text NOT NULL,
  `valid_range` text,
  `updated_at` text NOT NULL,
  `updated_by` text REFERENCES `users`(`id`)
);
