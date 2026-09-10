CREATE TABLE `oauth_states` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`provider` text DEFAULT 'yahoo' NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`created_at` text NOT NULL,
	CONSTRAINT "oauth_states_provider" CHECK("oauth_states"."provider" IN ('yahoo'))
);
--> statement-breakpoint
CREATE INDEX `oauth_states_actor` ON `oauth_states` (`actor_id`);--> statement-breakpoint
CREATE INDEX `oauth_states_expires` ON `oauth_states` (`expires_at`);--> statement-breakpoint
CREATE TABLE `yahoo_connections` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`encrypted_access_token` text NOT NULL,
	`encrypted_refresh_token` text NOT NULL,
	`token_type` text DEFAULT 'Bearer' NOT NULL,
	`access_token_expires_at` text,
	`updated_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `yahoo_connections_updated` ON `yahoo_connections` (`updated_at`);