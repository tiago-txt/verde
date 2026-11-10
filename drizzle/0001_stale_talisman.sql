ALTER TABLE `transactions` ADD `parcela_grupo_id` text;--> statement-breakpoint
CREATE INDEX `transactions_parcela_grupo_idx` ON `transactions` (`parcela_grupo_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_recorrencia_data_unique` ON `transactions` (`recorrencia_id`,`data`);