CREATE TABLE `trade_events` (
	`id` text PRIMARY KEY NOT NULL,
	`trade_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`league_id` text NOT NULL,
	`status` text NOT NULL,
	`event_at` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`revision` integer NOT NULL,
	FOREIGN KEY (`trade_id`,`owner_id`,`league_id`) REFERENCES `trades`(`id`,`owner_id`,`league_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `events_owner_league` ON `trade_events` (`owner_id`,`league_id`,`trade_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `events_trade_revision` ON `trade_events` (`trade_id`,`revision`);--> statement-breakpoint
CREATE TABLE `trades` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`league_id` text NOT NULL,
	`title` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'idea' NOT NULL,
	`request_json` text NOT NULL,
	`analysis_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_mutation_id` text NOT NULL,
	CONSTRAINT "trades_status" CHECK("trades"."status" IN ('idea','proposed','accepted','rejected','withdrawn','completed')),
	CONSTRAINT "trades_json" CHECK(json_valid("trades"."request_json") AND json_valid("trades"."analysis_json")),
	CONSTRAINT "trades_revision" CHECK("trades"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `trades_owner_league_created` ON `trades` (`owner_id`,`league_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `trades_identity` ON `trades` (`id`,`owner_id`,`league_id`);
--> statement-breakpoint
CREATE TRIGGER immutable_trade_snapshot
BEFORE UPDATE OF request_json, analysis_json, owner_id, league_id, created_at ON trades
BEGIN
  SELECT RAISE(ABORT, 'Decision-time snapshots and ownership are immutable');
END;
