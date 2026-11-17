PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_budget_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`budget_id` text NOT NULL,
	`vigente_apartir` text NOT NULL,
	`nome` text NOT NULL,
	`valor_padrao_centavos` integer NOT NULL,
	`dia_fechamento` integer NOT NULL,
	`periodicidade_meses` integer DEFAULT 1 NOT NULL,
	`base_valor_periodo` text DEFAULT 'total' NOT NULL,
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
	CONSTRAINT "budget_versions_fechamento_check" CHECK("__new_budget_versions"."dia_fechamento" between 1 and 31),
	CONSTRAINT "budget_versions_periodicidade_check" CHECK("__new_budget_versions"."periodicidade_meses" between 1 and 12),
	CONSTRAINT "budget_versions_base_valor_check" CHECK("__new_budget_versions"."base_valor_periodo" in ('total', 'mensal')),
	CONSTRAINT "budget_versions_vencimento_check" CHECK("__new_budget_versions"."dia_vencimento" between 1 and 31),
	CONSTRAINT "budget_versions_antecedencia_check" CHECK("__new_budget_versions"."antecedencia_ciclos" in (0, 1))
);
--> statement-breakpoint
INSERT INTO `__new_budget_versions`("id", "workspace_id", "budget_id", "vigente_apartir", "nome", "valor_padrao_centavos", "dia_fechamento", "periodicidade_meses", "base_valor_periodo", "antecedencia_ciclos", "data_da_reserva", "dia_vencimento", "origens", "conta_id", "cartao_id", "cor", "icone", "categoria_ids", "created_at", "updated_at") SELECT "id", "workspace_id", "budget_id", "vigente_apartir", "nome", "valor_padrao_centavos", "dia_fechamento", 1, 'total', "antecedencia_ciclos", "data_da_reserva", "dia_vencimento", "origens", "conta_id", "cartao_id", "cor", "icone", "categoria_ids", "created_at", "updated_at" FROM `budget_versions`;--> statement-breakpoint
DROP TABLE `budget_versions`;--> statement-breakpoint
ALTER TABLE `__new_budget_versions` RENAME TO `budget_versions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `budget_versions_workspace_idx` ON `budget_versions` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `budget_versions_budget_idx` ON `budget_versions` (`budget_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `budget_versions_budget_vigencia_unique` ON `budget_versions` (`budget_id`,`vigente_apartir`);--> statement-breakpoint
CREATE TABLE `__new_budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`nome` text DEFAULT '' NOT NULL,
	`valor_padrao_centavos` integer DEFAULT 0 NOT NULL,
	`dia_fechamento` integer DEFAULT 1 NOT NULL,
	`periodicidade_meses` integer DEFAULT 1 NOT NULL,
	`base_valor_periodo` text DEFAULT 'total' NOT NULL,
	`antecedencia_ciclos` integer DEFAULT 0 NOT NULL,
	`data_da_reserva` text DEFAULT 'inicio_do_ciclo' NOT NULL,
	`dia_vencimento` integer DEFAULT 1 NOT NULL,
	`origens` text DEFAULT 'todas' NOT NULL,
	`conta_id` text,
	`cartao_id` text,
	`data_inicio` text DEFAULT '' NOT NULL,
	`data_fim` text,
	`sobra_policy` text DEFAULT 'liberar' NOT NULL,
	`sobra_apenas_ao_fechar` integer,
	`sobra_destino_budget_id` text,
	`cor` text DEFAULT '#34d399' NOT NULL,
	`icone` text DEFAULT 'Target' NOT NULL,
	`arquivado` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`categoria_id` text NOT NULL,
	`mes` text NOT NULL,
	`valor_limite` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conta_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`cartao_id`) REFERENCES `credit_cards`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`sobra_destino_budget_id`) REFERENCES `budgets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`categoria_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "budgets_valor_check" CHECK("__new_budgets"."valor_limite" >= 0),
	CONSTRAINT "budgets_fechamento_check" CHECK("__new_budgets"."dia_fechamento" between 1 and 31),
	CONSTRAINT "budgets_periodicidade_check" CHECK("__new_budgets"."periodicidade_meses" between 1 and 12),
	CONSTRAINT "budgets_base_valor_check" CHECK("__new_budgets"."base_valor_periodo" in ('total', 'mensal')),
	CONSTRAINT "budgets_antecedencia_check" CHECK("__new_budgets"."antecedencia_ciclos" in (0, 1)),
	CONSTRAINT "budgets_data_reserva_check" CHECK("__new_budgets"."data_da_reserva" in ('inicio_do_ciclo', 'vencimento_da_fatura')),
	CONSTRAINT "budgets_dia_vencimento_check" CHECK("__new_budgets"."dia_vencimento" between 1 and 31),
	CONSTRAINT "budgets_origens_check" CHECK("__new_budgets"."origens" in ('todas', 'cartao', 'contas'))
);
--> statement-breakpoint
INSERT INTO `__new_budgets`("id", "workspace_id", "nome", "valor_padrao_centavos", "dia_fechamento", "periodicidade_meses", "base_valor_periodo", "antecedencia_ciclos", "data_da_reserva", "dia_vencimento", "origens", "conta_id", "cartao_id", "data_inicio", "data_fim", "sobra_policy", "sobra_apenas_ao_fechar", "sobra_destino_budget_id", "cor", "icone", "arquivado", "created_at", "updated_at", "categoria_id", "mes", "valor_limite") SELECT "id", "workspace_id", "nome", "valor_padrao_centavos", "dia_fechamento", 1, 'total', "antecedencia_ciclos", "data_da_reserva", "dia_vencimento", "origens", "conta_id", "cartao_id", "data_inicio", "data_fim", "sobra_policy", "sobra_apenas_ao_fechar", "sobra_destino_budget_id", "cor", "icone", "arquivado", "created_at", "updated_at", "categoria_id", "mes", "valor_limite" FROM `budgets`;--> statement-breakpoint
DROP TABLE `budgets`;--> statement-breakpoint
ALTER TABLE `__new_budgets` RENAME TO `budgets`;--> statement-breakpoint
CREATE INDEX `budgets_arquivado_idx` ON `budgets` (`arquivado`);--> statement-breakpoint
CREATE INDEX `budgets_workspace_idx` ON `budgets` (`workspace_id`);