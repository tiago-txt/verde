CREATE TABLE `budget_cycle_closures` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`budget_id` text NOT NULL,
	`ciclo` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`budget_id`) REFERENCES `budgets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `budget_cycle_closures_workspace_idx` ON `budget_cycle_closures` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `budget_cycle_closures_budget_idx` ON `budget_cycle_closures` (`budget_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `budget_cycle_closures_budget_ciclo_unique` ON `budget_cycle_closures` (`budget_id`,`ciclo`);--> statement-breakpoint
ALTER TABLE `budgets` ADD `sobra_apenas_ao_fechar` integer;