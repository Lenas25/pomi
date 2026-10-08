CREATE TABLE `habit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`habit_id` text NOT NULL,
	`date` text NOT NULL,
	`at` integer NOT NULL,
	`value` real NOT NULL
);
--> statement-breakpoint
CREATE INDEX `habit_events_habit_date_idx` ON `habit_events` (`habit_id`,`date`);