CREATE TABLE `forecast_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`horizonte` integer DEFAULT 12 NOT NULL,
	`margem` integer DEFAULT 0 NOT NULL,
	`contas` text DEFAULT '[]' NOT NULL,
	`incluir_estimativas` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "forecast_preferences_horizonte_check" CHECK("forecast_preferences"."horizonte" in (6, 12, 24)),
	CONSTRAINT "forecast_preferences_margem_check" CHECK("forecast_preferences"."margem" >= 0)
);
--> statement-breakpoint
CREATE INDEX `forecast_preferences_workspace_idx` ON `forecast_preferences` (`workspace_id`);