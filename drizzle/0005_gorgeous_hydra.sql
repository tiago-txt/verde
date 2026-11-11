ALTER TABLE `transactions` ADD `import_batch_id` text;--> statement-breakpoint
CREATE INDEX `transactions_data_tipo_pago_idx` ON `transactions` (`data`,`tipo`,`pago`);--> statement-breakpoint
CREATE INDEX `transactions_import_batch_idx` ON `transactions` (`import_batch_id`);