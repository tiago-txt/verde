CREATE TABLE `finance_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`card_basis` text DEFAULT 'caixa' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "finance_preferences_card_basis_check" CHECK("finance_preferences"."card_basis" in ('caixa', 'competencia'))
);
--> statement-breakpoint
CREATE INDEX `finance_preferences_workspace_idx` ON `finance_preferences` (`workspace_id`);