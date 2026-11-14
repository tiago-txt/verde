CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`file_name` text NOT NULL,
	`file_hash` text NOT NULL,
	`imported_by_id` text,
	`counts` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`imported_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `import_batches_workspace_idx` ON `import_batches` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `import_batches_workspace_hash_idx` ON `import_batches` (`workspace_id`,`file_hash`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `fatura_chave_override` text;--> statement-breakpoint
CREATE INDEX `transactions_fatura_override_idx` ON `transactions` (`workspace_id`,`cartao_id`,`fatura_chave_override`);