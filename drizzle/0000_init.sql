CREATE TABLE `checkins` (
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`answers` text NOT NULL,
	PRIMARY KEY(`date`, `kind`)
);
--> statement-breakpoint
CREATE TABLE `food_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`text` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `food_notes_date_idx` ON `food_notes` (`date`);--> statement-breakpoint
CREATE TABLE `habit_logs` (
	`habit_id` text NOT NULL,
	`date` text NOT NULL,
	`value` real NOT NULL,
	PRIMARY KEY(`habit_id`, `date`)
);
--> statement-breakpoint
CREATE TABLE `insights` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`evidence` text NOT NULL,
	`created_at` integer NOT NULL,
	`seen_at` integer
);
--> statement-breakpoint
CREATE TABLE `metric_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`metric_id` text NOT NULL,
	`date` text NOT NULL,
	`value` real NOT NULL
);
--> statement-breakpoint
CREATE INDEX `metric_entries_metric_date_idx` ON `metric_entries` (`metric_id`,`date`);--> statement-breakpoint
CREATE TABLE `photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`pose` text NOT NULL,
	`uri` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `photos_date_idx` ON `photos` (`date`);--> statement-breakpoint
CREATE TABLE `profile` (
	`id` integer PRIMARY KEY NOT NULL,
	`weight_kg` real,
	`height_cm` real,
	`age_years` integer,
	`work_type` text,
	`level` text,
	`goal` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`schedule` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `set_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`step_id` text NOT NULL,
	`set_index` integer NOT NULL,
	`weight_kg` real,
	`reps` integer,
	`rir` integer,
	`duration_sec` integer,
	`done_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `set_logs_session_step_set_idx` ON `set_logs` (`session_id`,`step_id`,`set_index`);--> statement-breakpoint
CREATE INDEX `set_logs_step_idx` ON `set_logs` (`step_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `steps_daily` (
	`date` text PRIMARY KEY NOT NULL,
	`steps` integer NOT NULL,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `suggestions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`decided_at` integer
);
--> statement-breakpoint
CREATE TABLE `templates` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`json` text NOT NULL,
	`imported_at` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workout_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`program_id` text NOT NULL,
	`routine_id` text NOT NULL,
	`date` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `workout_sessions_date_idx` ON `workout_sessions` (`date`);