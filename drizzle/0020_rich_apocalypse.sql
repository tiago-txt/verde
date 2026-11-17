ALTER TABLE `transactions` ADD `orcamento_id` text REFERENCES budgets(id);--> statement-breakpoint
ALTER TABLE `transactions` ADD `orcamento_ignorado` integer DEFAULT false NOT NULL;