CREATE TABLE `chain_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`chain_id` text NOT NULL,
	`student_id` text NOT NULL,
	`answer_id` text,
	`taps` text NOT NULL,
	`self_found` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`chain_id`) REFERENCES `chains`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`answer_id`) REFERENCES `answers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `chains` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`option` text NOT NULL,
	`misconception` text NOT NULL,
	`steps` text NOT NULL,
	`explanation` text NOT NULL,
	`cited_slide_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`edited` integer DEFAULT false NOT NULL,
	`model` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cited_slide_id`) REFERENCES `slides`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `answers` ADD `chosen_option` text;--> statement-breakpoint
ALTER TABLE `questions` ADD `kind` text DEFAULT 'written' NOT NULL;--> statement-breakpoint
ALTER TABLE `questions` ADD `options` text;--> statement-breakpoint
ALTER TABLE `questions` ADD `correct_option` text;