ALTER TABLE `concepts` ADD `activity_cache` text;--> statement-breakpoint
ALTER TABLE `criterion_results` ADD `explanation` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `criterion_results` ADD `cited_slide_id` text REFERENCES slides(id);