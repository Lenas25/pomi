DROP INDEX `metric_entries_metric_date_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `metric_entries_metric_date_idx` ON `metric_entries` (`metric_id`,`date`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_checkins` (
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`answers` text NOT NULL,
	PRIMARY KEY(`date`, `kind`),
	CONSTRAINT "checkins_kind_check" CHECK("__new_checkins"."kind" in ('morning', 'night', 'monthly'))
);
--> statement-breakpoint
INSERT INTO `__new_checkins`("date", "kind", "answers") SELECT "date", "kind", "answers" FROM `checkins`;--> statement-breakpoint
DROP TABLE `checkins`;--> statement-breakpoint
ALTER TABLE `__new_checkins` RENAME TO `checkins`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_set_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`step_id` text NOT NULL,
	`set_index` integer NOT NULL,
	`weight_kg` real,
	`reps` integer,
	`rir` integer,
	`duration_sec` integer,
	`done_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "set_logs_rir_check" CHECK("__new_set_logs"."rir" is null or "__new_set_logs"."rir" between 0 and 3)
);
--> statement-breakpoint
INSERT INTO `__new_set_logs`("id", "session_id", "step_id", "set_index", "weight_kg", "reps", "rir", "duration_sec", "done_at") SELECT "id", "session_id", "step_id", "set_index", "weight_kg", "reps", "rir", "duration_sec", "done_at" FROM `set_logs`;--> statement-breakpoint
DROP TABLE `set_logs`;--> statement-breakpoint
ALTER TABLE `__new_set_logs` RENAME TO `set_logs`;--> statement-breakpoint
CREATE UNIQUE INDEX `set_logs_session_step_set_idx` ON `set_logs` (`session_id`,`step_id`,`set_index`);--> statement-breakpoint
CREATE INDEX `set_logs_step_idx` ON `set_logs` (`step_id`);--> statement-breakpoint
CREATE TABLE `__new_steps_daily` (
	`date` text PRIMARY KEY NOT NULL,
	`steps` integer NOT NULL,
	`source` text NOT NULL,
	CONSTRAINT "steps_daily_source_check" CHECK("__new_steps_daily"."source" in ('health_connect', 'manual'))
);
--> statement-breakpoint
INSERT INTO `__new_steps_daily`("date", "steps", "source") SELECT "date", "steps", "source" FROM `steps_daily`;--> statement-breakpoint
DROP TABLE `steps_daily`;--> statement-breakpoint
ALTER TABLE `__new_steps_daily` RENAME TO `steps_daily`;--> statement-breakpoint
CREATE TABLE `__new_suggestions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`decided_at` integer,
	CONSTRAINT "suggestions_status_check" CHECK("__new_suggestions"."status" in ('pending', 'accepted', 'rejected'))
);
--> statement-breakpoint
INSERT INTO `__new_suggestions`("id", "kind", "payload", "reason", "created_at", "status", "decided_at") SELECT "id", "kind", "payload", "reason", "created_at", "status", "decided_at" FROM `suggestions`;--> statement-breakpoint
DROP TABLE `suggestions`;--> statement-breakpoint
ALTER TABLE `__new_suggestions` RENAME TO `suggestions`;--> statement-breakpoint
CREATE TABLE `__new_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`json` text NOT NULL,
	`imported_at` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	CONSTRAINT "templates_kind_check" CHECK("__new_templates"."kind" in ('module', 'settings'))
);
--> statement-breakpoint
INSERT INTO `__new_templates`("id", "kind", "name", "json", "imported_at", "active") SELECT "id", "kind", "name", "json", "imported_at", "active" FROM `templates`;--> statement-breakpoint
DROP TABLE `templates`;--> statement-breakpoint
ALTER TABLE `__new_templates` RENAME TO `templates`;