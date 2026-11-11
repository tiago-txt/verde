CREATE TABLE `budget_categories` (
	`budget_id` text NOT NULL,
	`category_id` text NOT NULL,
	PRIMARY KEY(`budget_id`, `category_id`),
	FOREIGN KEY (`budget_id`) REFERENCES `budgets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `budget_categories_category_idx` ON `budget_categories` (`category_id`);--> statement-breakpoint
CREATE TABLE `budget_overrides` (
	`budget_id` text NOT NULL,
	`ciclo` text NOT NULL,
	`valor_centavos` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`budget_id`, `ciclo`),
	FOREIGN KEY (`budget_id`) REFERENCES `budgets`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "budget_overrides_valor_check" CHECK("budget_overrides"."valor_centavos" >= 0)
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`nome` text DEFAULT '' NOT NULL,
	`valor_padrao_centavos` integer DEFAULT 0 NOT NULL,
	`dia_fechamento` integer DEFAULT 1 NOT NULL,
	`antecedencia_ciclos` integer DEFAULT 0 NOT NULL,
	`conta_id` text,
	`data_inicio` text DEFAULT '' NOT NULL,
	`data_fim` text,
	`cor` text DEFAULT '#34d399' NOT NULL,
	`icone` text DEFAULT 'Target' NOT NULL,
	`arquivado` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`categoria_id` text NOT NULL,
	`mes` text NOT NULL,
	`valor_limite` integer NOT NULL,
	FOREIGN KEY (`conta_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`categoria_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "budgets_valor_check" CHECK("__new_budgets"."valor_limite" >= 0),
	CONSTRAINT "budgets_fechamento_check" CHECK("__new_budgets"."dia_fechamento" between 1 and 31),
	CONSTRAINT "budgets_antecedencia_check" CHECK("__new_budgets"."antecedencia_ciclos" in (0, 1))
);
--> statement-breakpoint
INSERT INTO `__new_budgets`("id", "created_at", "updated_at", "categoria_id", "mes", "valor_limite") SELECT "id", "created_at", "updated_at", "categoria_id", "mes", "valor_limite" FROM `budgets`;--> statement-breakpoint
DROP TABLE `budgets`;--> statement-breakpoint
ALTER TABLE `__new_budgets` RENAME TO `budgets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
-- Backfill idempotente dos orçamentos legados (Etapa 1) para o modelo de ciclo.
-- Registros antigos não tinham nome; cada linha vira um orçamento de um único
-- ciclo (mês) com a categoria original sincronizada.
UPDATE `budgets` SET `data_inicio` = `mes` WHERE `data_inicio` = '' AND `mes` <> '';--> statement-breakpoint
UPDATE `budgets` SET `data_fim` = `mes` WHERE `data_fim` IS NULL AND `nome` = '';--> statement-breakpoint
UPDATE `budgets` SET `valor_padrao_centavos` = `valor_limite` WHERE `valor_padrao_centavos` = 0 AND `valor_limite` > 0;--> statement-breakpoint
UPDATE `budgets` SET `nome` = COALESCE((SELECT `nome` FROM `categories` WHERE `categories`.`id` = `budgets`.`categoria_id`), 'Orçamento') WHERE `nome` = '';--> statement-breakpoint
INSERT OR IGNORE INTO `budget_categories` (`budget_id`, `category_id`) SELECT `id`, `categoria_id` FROM `budgets` WHERE `categoria_id` IS NOT NULL;--> statement-breakpoint
CREATE INDEX `budgets_arquivado_idx` ON `budgets` (`arquivado`);--> statement-breakpoint
CREATE INDEX `transactions_data_categoria_idx` ON `transactions` (`data`,`categoria_id`);