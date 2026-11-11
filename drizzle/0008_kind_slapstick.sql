CREATE TABLE `budget_cycle_exceptions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`budget_id` text NOT NULL,
	`ciclo` text NOT NULL,
	`tipo` text NOT NULL,
	`dados` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`budget_id`) REFERENCES `budgets`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "budget_cycle_exceptions_tipo_check" CHECK("budget_cycle_exceptions"."tipo" in ('excluido', 'ajustado'))
);
--> statement-breakpoint
CREATE INDEX `budget_cycle_exceptions_workspace_idx` ON `budget_cycle_exceptions` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `budget_cycle_exceptions_budget_idx` ON `budget_cycle_exceptions` (`budget_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `budget_cycle_exceptions_budget_ciclo_unique` ON `budget_cycle_exceptions` (`budget_id`,`ciclo`);--> statement-breakpoint
CREATE TABLE `budget_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`budget_id` text NOT NULL,
	`vigente_apartir` text NOT NULL,
	`nome` text NOT NULL,
	`valor_padrao_centavos` integer NOT NULL,
	`dia_fechamento` integer NOT NULL,
	`antecedencia_ciclos` integer NOT NULL,
	`data_da_reserva` text DEFAULT 'inicio_do_ciclo' NOT NULL,
	`dia_vencimento` integer NOT NULL,
	`origens` text DEFAULT 'todas' NOT NULL,
	`conta_id` text,
	`cartao_id` text,
	`cor` text NOT NULL,
	`icone` text NOT NULL,
	`categoria_ids` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`budget_id`) REFERENCES `budgets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conta_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`cartao_id`) REFERENCES `credit_cards`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "budget_versions_fechamento_check" CHECK("budget_versions"."dia_fechamento" between 1 and 31),
	CONSTRAINT "budget_versions_vencimento_check" CHECK("budget_versions"."dia_vencimento" between 1 and 31),
	CONSTRAINT "budget_versions_antecedencia_check" CHECK("budget_versions"."antecedencia_ciclos" in (0, 1))
);
--> statement-breakpoint
CREATE INDEX `budget_versions_workspace_idx` ON `budget_versions` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `budget_versions_budget_idx` ON `budget_versions` (`budget_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `budget_versions_budget_vigencia_unique` ON `budget_versions` (`budget_id`,`vigente_apartir`);--> statement-breakpoint

-- Backfill: cada orçamento existente vira uma série com uma vigência inicial.
INSERT OR IGNORE INTO `budget_versions` (
	`id`, `workspace_id`, `budget_id`, `vigente_apartir`, `nome`,
	`valor_padrao_centavos`, `dia_fechamento`, `antecedencia_ciclos`,
	`data_da_reserva`, `dia_vencimento`, `origens`, `conta_id`, `cartao_id`,
	`cor`, `icone`, `categoria_ids`, `created_at`, `updated_at`
)
SELECT
	lower(hex(randomblob(16))),
	`budgets`.`workspace_id`,
	`budgets`.`id`,
	CASE
		WHEN `budgets`.`data_inicio` <> '' THEN `budgets`.`data_inicio`
		WHEN length(`budgets`.`mes`) = 7 THEN `budgets`.`mes`
		ELSE strftime('%Y-%m','now')
	END,
	`budgets`.`nome`,
	`budgets`.`valor_padrao_centavos`,
	`budgets`.`dia_fechamento`,
	`budgets`.`antecedencia_ciclos`,
	`budgets`.`data_da_reserva`,
	`budgets`.`dia_vencimento`,
	`budgets`.`origens`,
	`budgets`.`conta_id`,
	`budgets`.`cartao_id`,
	`budgets`.`cor`,
	`budgets`.`icone`,
	COALESCE(
		NULLIF(
			(SELECT json_group_array(`bc`.`category_id`) FROM `budget_categories` `bc` WHERE `bc`.`budget_id` = `budgets`.`id`),
			'[]'
		),
		json_array(`budgets`.`categoria_id`)
	),
	`budgets`.`created_at`,
	`budgets`.`updated_at`
FROM `budgets`;
--> statement-breakpoint

-- Backfill: overrides antigos viram exceções "ajustado" do ciclo.
INSERT OR IGNORE INTO `budget_cycle_exceptions` (
	`id`, `workspace_id`, `budget_id`, `ciclo`, `tipo`, `dados`,
	`created_at`, `updated_at`
)
SELECT
	lower(hex(randomblob(16))),
	`workspace_id`,
	`budget_id`,
	`ciclo`,
	'ajustado',
	json_object('valorPadrao', `valor_centavos`),
	`created_at`,
	`updated_at`
FROM `budget_overrides`;