-- Add full_name and must_change_password columns to users table
ALTER TABLE `users` ADD COLUMN `full_name` text;
ALTER TABLE `users` ADD COLUMN `must_change_password` integer NOT NULL DEFAULT 0;
