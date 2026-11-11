ALTER TABLE `categories` ADD `is_system` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `transactions_tipo_idx` ON `transactions` (`tipo`);--> statement-breakpoint
CREATE INDEX `transactions_pago_idx` ON `transactions` (`pago`);--> statement-breakpoint
CREATE INDEX `transactions_data_pago_idx` ON `transactions` (`data`,`pago`);--> statement-breakpoint
-- Categorias de sistema "Outros" (idempotente e não destrutivo).
-- O INSERT só roda em bancos que já possuem categorias; em banco novo o seed
-- cria todas as categorias (incluindo Outros com is_system = 1).
INSERT INTO `categories` (`id`, `nome`, `tipo`, `icone`, `cor`, `categoria_pai_id`, `is_system`, `created_at`, `updated_at`, `deleted_at`)
SELECT '00000000-0000-4000-8000-000000000001', 'Outros', 'despesa', 'CircleEllipsis', '#94a3b8', NULL, 1, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, NULL
WHERE EXISTS (SELECT 1 FROM `categories`)
  AND NOT EXISTS (SELECT 1 FROM `categories` WHERE `nome` = 'Outros' AND `tipo` = 'despesa');--> statement-breakpoint
INSERT INTO `categories` (`id`, `nome`, `tipo`, `icone`, `cor`, `categoria_pai_id`, `is_system`, `created_at`, `updated_at`, `deleted_at`)
SELECT '00000000-0000-4000-8000-000000000002', 'Outros', 'receita', 'CirclePlus', '#94a3b8', NULL, 1, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, NULL
WHERE EXISTS (SELECT 1 FROM `categories`)
  AND NOT EXISTS (SELECT 1 FROM `categories` WHERE `nome` = 'Outros' AND `tipo` = 'receita');--> statement-breakpoint
UPDATE `categories` SET `is_system` = 1 WHERE `nome` = 'Outros' AND `tipo` IN ('despesa', 'receita');--> statement-breakpoint
-- Backfill de lançamentos antigos sem categoria (transferências continuam sem).
UPDATE `transactions`
SET `categoria_id` = (SELECT `id` FROM `categories` WHERE `nome` = 'Outros' AND `tipo` = 'despesa' AND `is_system` = 1 LIMIT 1)
WHERE `tipo` = 'despesa' AND `categoria_id` IS NULL;--> statement-breakpoint
UPDATE `transactions`
SET `categoria_id` = (SELECT `id` FROM `categories` WHERE `nome` = 'Outros' AND `tipo` = 'receita' AND `is_system` = 1 LIMIT 1)
WHERE `tipo` = 'receita' AND `categoria_id` IS NULL;