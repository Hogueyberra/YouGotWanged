CREATE TABLE `yahoo_oauth_state` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `yahoo_oauth_state_owner` ON `yahoo_oauth_state` (`owner_id`);--> statement-breakpoint
CREATE TABLE `yahoo_oauth_tokens` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`access_token_enc` text NOT NULL,
	`refresh_token_enc` text NOT NULL,
	`expires_at` text NOT NULL,
	`updated_at` text NOT NULL
);
