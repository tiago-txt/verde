-- Etapa multiusuário: workspaces e isolamento por workspace.
-- SQLite exige rebuild para adicionar NOT NULL + FK + índices únicos compostos.
-- O migrator roda com `PRAGMA foreign_keys = OFF` (ver lib/db/init.ts) para que
-- os DROP TABLE não disparem cascatas nos dados que estão sendo copiados.

CREATE TABLE IF NOT EXISTS `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint

-- Workspace único que recebe todos os dados da etapa anterior (o admin atual).
-- Em banco novo não há usuários e nenhum workspace é criado aqui; o seed cria.
INSERT OR IGNORE INTO `workspaces` (`id`, `nome`, `created_at`)
SELECT '00000000-0000-4000-8000-000000000001', 'Meu espaço', CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE EXISTS (SELECT 1 FROM `users`);
--> statement-breakpoint

-- users
CREATE TABLE `users_new` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	`nome` text NOT NULL,
	`email` text NOT NULL,
	`senha_hash` text NOT NULL,
	`role` text DEFAULT 'membro' NOT NULL,
	`is_admin` integer DEFAULT false NOT NULL,
	`ativo` integer DEFAULT true NOT NULL,
	`must_change_password` integer DEFAULT false NOT NULL,
	`last_login_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `users_new` (`id`, `workspace_id`, `nome`, `email`, `senha_hash`, `role`, `is_admin`, `ativo`, `must_change_password`, `last_login_at`, `created_at`, `updated_at`)
SELECT `id`, '00000000-0000-4000-8000-000000000001', `nome`, `email`, `senha_hash`,
	CASE WHEN `is_admin` = 1 THEN 'admin' ELSE 'membro' END,
	`is_admin`, 1, 0, NULL, `created_at`, `updated_at`
FROM `users`;
--> statement-breakpoint
DROP TABLE `users`;
--> statement-breakpoint
ALTER TABLE `users_new` RENAME TO `users`;
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
--> statement-breakpoint
CREATE INDEX `users_workspace_idx` ON `users` (`workspace_id`);
--> statement-breakpoint

-- accounts
CREATE TABLE `accounts_new` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	`nome` text NOT NULL,
	`tipo` text NOT NULL,
	`saldo_inicial` integer DEFAULT 0 NOT NULL,
	`cor` text DEFAULT '#34d399' NOT NULL,
	`icone` text DEFAULT 'Wallet' NOT NULL,
	`arquivada` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
INSERT INTO `accounts_new` (`id`, `workspace_id`, `nome`, `tipo`, `saldo_inicial`, `cor`, `icone`, `arquivada`, `created_at`, `updated_at`, `deleted_at`)
SELECT `id`, '00000000-0000-4000-8000-000000000001', `nome`, `tipo`, `saldo_inicial`, `cor`, `icone`, `arquivada`, `created_at`, `updated_at`, `deleted_at`
FROM `accounts`;
--> statement-breakpoint
DROP TABLE `accounts`;
--> statement-breakpoint
ALTER TABLE `accounts_new` RENAME TO `accounts`;
--> statement-breakpoint
-- Nomes duplicados (a versão anterior não impunha unicidade) recebem sufixo.
WITH ranked AS (
	SELECT `id`, row_number() OVER (PARTITION BY `workspace_id`, `nome` ORDER BY `created_at`, `id`) AS rn
	FROM `accounts`
)
UPDATE `accounts` SET `nome` = `nome` || ' (' || (SELECT rn FROM ranked WHERE ranked.id = accounts.id) || ')'
WHERE `id` IN (SELECT `id` FROM ranked WHERE rn > 1);
--> statement-breakpoint
CREATE INDEX `accounts_arquivada_idx` ON `accounts` (`arquivada`);
--> statement-breakpoint
CREATE INDEX `accounts_workspace_idx` ON `accounts` (`workspace_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_workspace_nome_unique` ON `accounts` (`workspace_id`,`nome`);
--> statement-breakpoint

-- credit_cards
CREATE TABLE `credit_cards_new` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	`nome` text NOT NULL,
	`bandeira` text DEFAULT 'outra' NOT NULL,
	`limite` integer DEFAULT 0 NOT NULL,
	`dia_fechamento` integer NOT NULL,
	`dia_vencimento` integer NOT NULL,
	`conta_pagamento_id` text REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	`cor` text DEFAULT '#818cf8' NOT NULL,
	`icone` text DEFAULT 'CreditCard' NOT NULL,
	`arquivado` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	CONSTRAINT "credit_cards_fechamento_check" CHECK(`dia_fechamento` between 1 and 31),
	CONSTRAINT "credit_cards_vencimento_check" CHECK(`dia_vencimento` between 1 and 31),
	CONSTRAINT "credit_cards_limite_check" CHECK(`limite` >= 0)
);
--> statement-breakpoint
INSERT INTO `credit_cards_new` (`id`, `workspace_id`, `nome`, `bandeira`, `limite`, `dia_fechamento`, `dia_vencimento`, `conta_pagamento_id`, `cor`, `icone`, `arquivado`, `created_at`, `updated_at`, `deleted_at`)
SELECT `id`, '00000000-0000-4000-8000-000000000001', `nome`, `bandeira`, `limite`, `dia_fechamento`, `dia_vencimento`, `conta_pagamento_id`, `cor`, `icone`, `arquivado`, `created_at`, `updated_at`, `deleted_at`
FROM `credit_cards`;
--> statement-breakpoint
DROP TABLE `credit_cards`;
--> statement-breakpoint
ALTER TABLE `credit_cards_new` RENAME TO `credit_cards`;
--> statement-breakpoint
WITH ranked AS (
	SELECT `id`, row_number() OVER (PARTITION BY `workspace_id`, `nome` ORDER BY `created_at`, `id`) AS rn
	FROM `credit_cards`
)
UPDATE `credit_cards` SET `nome` = `nome` || ' (' || (SELECT rn FROM ranked WHERE ranked.id = credit_cards.id) || ')'
WHERE `id` IN (SELECT `id` FROM ranked WHERE rn > 1);
--> statement-breakpoint
CREATE INDEX `credit_cards_arquivado_idx` ON `credit_cards` (`arquivado`);
--> statement-breakpoint
CREATE INDEX `credit_cards_workspace_idx` ON `credit_cards` (`workspace_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_cards_workspace_nome_unique` ON `credit_cards` (`workspace_id`,`nome`);
--> statement-breakpoint

-- categories
CREATE TABLE `categories_new` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	`nome` text NOT NULL,
	`tipo` text NOT NULL,
	`icone` text DEFAULT 'CircleEllipsis' NOT NULL,
	`cor` text DEFAULT '#94a3b8' NOT NULL,
	`categoria_pai_id` text,
	`is_system` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
INSERT INTO `categories_new` (`id`, `workspace_id`, `nome`, `tipo`, `icone`, `cor`, `categoria_pai_id`, `is_system`, `created_at`, `updated_at`, `deleted_at`)
SELECT `id`, '00000000-0000-4000-8000-000000000001', `nome`, `tipo`, `icone`, `cor`, `categoria_pai_id`, `is_system`, `created_at`, `updated_at`, `deleted_at`
FROM `categories`;
--> statement-breakpoint
DROP TABLE `categories`;
--> statement-breakpoint
ALTER TABLE `categories_new` RENAME TO `categories`;
--> statement-breakpoint
WITH ranked AS (
	SELECT `id`, row_number() OVER (PARTITION BY `workspace_id`, `tipo`, `nome` ORDER BY `created_at`, `id`) AS rn
	FROM `categories`
)
UPDATE `categories` SET `nome` = `nome` || ' (' || (SELECT rn FROM ranked WHERE ranked.id = categories.id) || ')'
WHERE `id` IN (SELECT `id` FROM ranked WHERE rn > 1);
--> statement-breakpoint
-- Mantém apenas uma categoria de sistema por tipo/workspace.
WITH ranked AS (
	SELECT `id`, row_number() OVER (PARTITION BY `workspace_id`, `tipo` ORDER BY `created_at`, `id`) AS rn
	FROM `categories` WHERE `is_system` = 1
)
UPDATE `categories` SET `is_system` = 0
WHERE `id` IN (SELECT `id` FROM ranked WHERE rn > 1);
--> statement-breakpoint
CREATE INDEX `categories_tipo_idx` ON `categories` (`tipo`);
--> statement-breakpoint
CREATE INDEX `categories_pai_idx` ON `categories` (`categoria_pai_id`);
--> statement-breakpoint
CREATE INDEX `categories_workspace_idx` ON `categories` (`workspace_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_workspace_tipo_nome_unique` ON `categories` (`workspace_id`,`tipo`,`nome`);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_system_workspace_unique` ON `categories` (`workspace_id`,`tipo`) WHERE "categories"."is_system" = 1;
--> statement-breakpoint

-- recurrences
CREATE TABLE `recurrences_new` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	`frequencia` text NOT NULL,
	`data_inicio` text NOT NULL,
	`data_fim` text,
	`ativo` integer DEFAULT true NOT NULL,
	`template` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `recurrences_new` (`id`, `workspace_id`, `frequencia`, `data_inicio`, `data_fim`, `ativo`, `template`, `created_at`, `updated_at`)
SELECT `id`, '00000000-0000-4000-8000-000000000001', `frequencia`, `data_inicio`, `data_fim`, `ativo`, `template`, `created_at`, `updated_at`
FROM `recurrences`;
--> statement-breakpoint
DROP TABLE `recurrences`;
--> statement-breakpoint
ALTER TABLE `recurrences_new` RENAME TO `recurrences`;
--> statement-breakpoint
CREATE INDEX `recurrences_ativo_idx` ON `recurrences` (`ativo`);
--> statement-breakpoint
CREATE INDEX `recurrences_workspace_idx` ON `recurrences` (`workspace_id`);
--> statement-breakpoint

-- tags
CREATE TABLE `tags_new` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	`nome` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `tags_new` (`id`, `workspace_id`, `nome`, `created_at`)
SELECT `id`, '00000000-0000-4000-8000-000000000001', `nome`, `created_at`
FROM `tags`;
--> statement-breakpoint
DROP TABLE `tags`;
--> statement-breakpoint
ALTER TABLE `tags_new` RENAME TO `tags`;
--> statement-breakpoint
WITH ranked AS (
	SELECT `id`, row_number() OVER (PARTITION BY `workspace_id`, `nome` ORDER BY `created_at`, `id`) AS rn
	FROM `tags`
)
UPDATE `tags` SET `nome` = `nome` || ' (' || (SELECT rn FROM ranked WHERE ranked.id = tags.id) || ')'
WHERE `id` IN (SELECT `id` FROM ranked WHERE rn > 1);
--> statement-breakpoint
CREATE INDEX `tags_workspace_idx` ON `tags` (`workspace_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_workspace_nome_unique` ON `tags` (`workspace_id`,`nome`);
--> statement-breakpoint

-- transactions
CREATE TABLE `transactions_new` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	`tipo` text NOT NULL,
	`descricao` text NOT NULL,
	`valor` integer NOT NULL,
	`data` text NOT NULL,
	`pago` integer DEFAULT false NOT NULL,
	`conta_id` text REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	`cartao_id` text REFERENCES `credit_cards`(`id`) ON UPDATE no action ON DELETE set null,
	`conta_destino_id` text REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	`cartao_destino_id` text REFERENCES `credit_cards`(`id`) ON UPDATE no action ON DELETE set null,
	`fatura_chave` text,
	`categoria_id` text REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	`observacao` text,
	`recorrencia_id` text REFERENCES `recurrences`(`id`) ON UPDATE no action ON DELETE set null,
	`parcela_atual` integer,
	`parcela_total` integer,
	`parcela_grupo_id` text,
	`import_batch_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	CONSTRAINT "transactions_valor_check" CHECK(`valor` >= 0)
);
--> statement-breakpoint
INSERT INTO `transactions_new` (`id`, `workspace_id`, `tipo`, `descricao`, `valor`, `data`, `pago`, `conta_id`, `cartao_id`, `conta_destino_id`, `cartao_destino_id`, `fatura_chave`, `categoria_id`, `observacao`, `recorrencia_id`, `parcela_atual`, `parcela_total`, `parcela_grupo_id`, `import_batch_id`, `created_at`, `updated_at`, `deleted_at`)
SELECT `id`, '00000000-0000-4000-8000-000000000001', `tipo`, `descricao`, `valor`, `data`, `pago`, `conta_id`, `cartao_id`, `conta_destino_id`, `cartao_destino_id`, `fatura_chave`, `categoria_id`, `observacao`, `recorrencia_id`, `parcela_atual`, `parcela_total`, `parcela_grupo_id`, `import_batch_id`, `created_at`, `updated_at`, `deleted_at`
FROM `transactions`;
--> statement-breakpoint
DROP TABLE `transactions`;
--> statement-breakpoint
ALTER TABLE `transactions_new` RENAME TO `transactions`;
--> statement-breakpoint
CREATE INDEX `transactions_workspace_idx` ON `transactions` (`workspace_id`);
--> statement-breakpoint
CREATE INDEX `transactions_workspace_data_idx` ON `transactions` (`workspace_id`,`data`);
--> statement-breakpoint
CREATE INDEX `transactions_workspace_conta_idx` ON `transactions` (`workspace_id`,`conta_id`);
--> statement-breakpoint
CREATE INDEX `transactions_workspace_cartao_idx` ON `transactions` (`workspace_id`,`cartao_id`);
--> statement-breakpoint
CREATE INDEX `transactions_workspace_categoria_idx` ON `transactions` (`workspace_id`,`categoria_id`);
--> statement-breakpoint
CREATE INDEX `transactions_data_idx` ON `transactions` (`data`);
--> statement-breakpoint
CREATE INDEX `transactions_conta_idx` ON `transactions` (`conta_id`);
--> statement-breakpoint
CREATE INDEX `transactions_cartao_idx` ON `transactions` (`cartao_id`);
--> statement-breakpoint
CREATE INDEX `transactions_cartao_data_idx` ON `transactions` (`cartao_id`,`data`);
--> statement-breakpoint
CREATE INDEX `transactions_cartao_destino_idx` ON `transactions` (`cartao_destino_id`);
--> statement-breakpoint
CREATE INDEX `transactions_fatura_chave_idx` ON `transactions` (`fatura_chave`);
--> statement-breakpoint
CREATE INDEX `transactions_categoria_idx` ON `transactions` (`categoria_id`);
--> statement-breakpoint
CREATE INDEX `transactions_recorrencia_idx` ON `transactions` (`recorrencia_id`);
--> statement-breakpoint
CREATE INDEX `transactions_parcela_grupo_idx` ON `transactions` (`parcela_grupo_id`);
--> statement-breakpoint
CREATE INDEX `transactions_tipo_idx` ON `transactions` (`tipo`);
--> statement-breakpoint
CREATE INDEX `transactions_pago_idx` ON `transactions` (`pago`);
--> statement-breakpoint
CREATE INDEX `transactions_data_pago_idx` ON `transactions` (`data`,`pago`);
--> statement-breakpoint
CREATE INDEX `transactions_data_categoria_idx` ON `transactions` (`data`,`categoria_id`);
--> statement-breakpoint
CREATE INDEX `transactions_data_tipo_pago_idx` ON `transactions` (`data`,`tipo`,`pago`);
--> statement-breakpoint
CREATE INDEX `transactions_import_batch_idx` ON `transactions` (`import_batch_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_recorrencia_data_unique` ON `transactions` (`workspace_id`,`recorrencia_id`,`data`);
--> statement-breakpoint

-- transaction_tags
CREATE TABLE `transaction_tags_new` (
	`workspace_id` text NOT NULL REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	`transaction_id` text NOT NULL REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	`tag_id` text NOT NULL REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	PRIMARY KEY(`transaction_id`, `tag_id`)
);
--> statement-breakpoint
INSERT INTO `transaction_tags_new` (`workspace_id`, `transaction_id`, `tag_id`)
SELECT '00000000-0000-4000-8000-000000000001', `transaction_id`, `tag_id`
FROM `transaction_tags`;
--> statement-breakpoint
DROP TABLE `transaction_tags`;
--> statement-breakpoint
ALTER TABLE `transaction_tags_new` RENAME TO `transaction_tags`;
--> statement-breakpoint
CREATE INDEX `transaction_tags_tag_idx` ON `transaction_tags` (`tag_id`);
--> statement-breakpoint
CREATE INDEX `transaction_tags_workspace_idx` ON `transaction_tags` (`workspace_id`);
--> statement-breakpoint

-- budgets
CREATE TABLE `budgets_new` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	`nome` text DEFAULT '' NOT NULL,
	`valor_padrao_centavos` integer DEFAULT 0 NOT NULL,
	`dia_fechamento` integer DEFAULT 1 NOT NULL,
	`antecedencia_ciclos` integer DEFAULT 0 NOT NULL,
	`data_da_reserva` text DEFAULT 'inicio_do_ciclo' NOT NULL CHECK (`data_da_reserva` in ('inicio_do_ciclo', 'vencimento_da_fatura')),
	`dia_vencimento` integer DEFAULT 1 NOT NULL CHECK (`dia_vencimento` between 1 and 31),
	`origens` text DEFAULT 'todas' NOT NULL CHECK (`origens` in ('todas', 'cartao', 'contas')),
	`conta_id` text REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	`cartao_id` text REFERENCES `credit_cards`(`id`) ON UPDATE no action ON DELETE set null,
	`data_inicio` text DEFAULT '' NOT NULL,
	`data_fim` text,
	`cor` text DEFAULT '#34d399' NOT NULL,
	`icone` text DEFAULT 'Target' NOT NULL,
	`arquivado` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`categoria_id` text NOT NULL REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	`mes` text NOT NULL,
	`valor_limite` integer NOT NULL,
	CONSTRAINT "budgets_valor_check" CHECK(`valor_limite` >= 0),
	CONSTRAINT "budgets_fechamento_check" CHECK(`dia_fechamento` between 1 and 31),
	CONSTRAINT "budgets_antecedencia_check" CHECK(`antecedencia_ciclos` in (0, 1))
);
--> statement-breakpoint
INSERT INTO `budgets_new` (`id`, `workspace_id`, `nome`, `valor_padrao_centavos`, `dia_fechamento`, `antecedencia_ciclos`, `data_da_reserva`, `dia_vencimento`, `origens`, `conta_id`, `cartao_id`, `data_inicio`, `data_fim`, `cor`, `icone`, `arquivado`, `created_at`, `updated_at`, `categoria_id`, `mes`, `valor_limite`)
SELECT `id`, '00000000-0000-4000-8000-000000000001', `nome`, `valor_padrao_centavos`, `dia_fechamento`, `antecedencia_ciclos`, `data_da_reserva`, `dia_vencimento`, `origens`, `conta_id`, `cartao_id`, `data_inicio`, `data_fim`, `cor`, `icone`, `arquivado`, `created_at`, `updated_at`, `categoria_id`, `mes`, `valor_limite`
FROM `budgets`;
--> statement-breakpoint
DROP TABLE `budgets`;
--> statement-breakpoint
ALTER TABLE `budgets_new` RENAME TO `budgets`;
--> statement-breakpoint
CREATE INDEX `budgets_arquivado_idx` ON `budgets` (`arquivado`);
--> statement-breakpoint
CREATE INDEX `budgets_workspace_idx` ON `budgets` (`workspace_id`);
--> statement-breakpoint

-- budget_categories
CREATE TABLE `budget_categories_new` (
	`workspace_id` text NOT NULL REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	`budget_id` text NOT NULL REFERENCES `budgets`(`id`) ON UPDATE no action ON DELETE cascade,
	`category_id` text NOT NULL REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	PRIMARY KEY(`budget_id`, `category_id`)
);
--> statement-breakpoint
INSERT INTO `budget_categories_new` (`workspace_id`, `budget_id`, `category_id`)
SELECT '00000000-0000-4000-8000-000000000001', `budget_id`, `category_id`
FROM `budget_categories`;
--> statement-breakpoint
DROP TABLE `budget_categories`;
--> statement-breakpoint
ALTER TABLE `budget_categories_new` RENAME TO `budget_categories`;
--> statement-breakpoint
CREATE INDEX `budget_categories_category_idx` ON `budget_categories` (`category_id`);
--> statement-breakpoint
CREATE INDEX `budget_categories_workspace_idx` ON `budget_categories` (`workspace_id`);
--> statement-breakpoint

-- budget_overrides
CREATE TABLE `budget_overrides_new` (
	`workspace_id` text NOT NULL REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	`budget_id` text NOT NULL REFERENCES `budgets`(`id`) ON UPDATE no action ON DELETE cascade,
	`ciclo` text NOT NULL,
	`valor_centavos` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`budget_id`, `ciclo`),
	CONSTRAINT "budget_overrides_valor_check" CHECK(`valor_centavos` >= 0)
);
--> statement-breakpoint
INSERT INTO `budget_overrides_new` (`workspace_id`, `budget_id`, `ciclo`, `valor_centavos`, `created_at`, `updated_at`)
SELECT '00000000-0000-4000-8000-000000000001', `budget_id`, `ciclo`, `valor_centavos`, `created_at`, `updated_at`
FROM `budget_overrides`;
--> statement-breakpoint
DROP TABLE `budget_overrides`;
--> statement-breakpoint
ALTER TABLE `budget_overrides_new` RENAME TO `budget_overrides`;
--> statement-breakpoint
CREATE INDEX `budget_overrides_workspace_idx` ON `budget_overrides` (`workspace_id`);
