CREATE TABLE `activity_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`source` text NOT NULL,
	`logged_at` integer NOT NULL,
	CONSTRAINT "activity_logs_kind_check" CHECK("activity_logs"."kind" in ('gym', 'walk', 'none')),
	CONSTRAINT "activity_logs_source_check" CHECK("activity_logs"."source" in ('notification', 'manual'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_logs_date_idx` ON `activity_logs` (`date`);