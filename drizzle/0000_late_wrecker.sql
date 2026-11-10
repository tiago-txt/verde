CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
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
CREATE INDEX `accounts_arquivada_idx` ON `accounts` (`arquivada`);--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`categoria_id` text NOT NULL,
	`mes` text NOT NULL,
	`valor_limite` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`categoria_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "budgets_valor_check" CHECK("budgets"."valor_limite" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_categoria_mes_unique` ON `budgets` (`categoria_id`,`mes`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`tipo` text NOT NULL,
	`icone` text DEFAULT 'CircleEllipsis' NOT NULL,
	`cor` text DEFAULT '#94a3b8' NOT NULL,
	`categoria_pai_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `categories_tipo_idx` ON `categories` (`tipo`);--> statement-breakpoint
CREATE INDEX `categories_pai_idx` ON `categories` (`categoria_pai_id`);--> statement-breakpoint
CREATE TABLE `credit_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`bandeira` text DEFAULT 'outra' NOT NULL,
	`limite` integer DEFAULT 0 NOT NULL,
	`dia_fechamento` integer NOT NULL,
	`dia_vencimento` integer NOT NULL,
	`conta_pagamento_id` text,
	`cor` text DEFAULT '#818cf8' NOT NULL,
	`arquivado` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`conta_pagamento_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "credit_cards_fechamento_check" CHECK("credit_cards"."dia_fechamento" between 1 and 31),
	CONSTRAINT "credit_cards_vencimento_check" CHECK("credit_cards"."dia_vencimento" between 1 and 31)
);
--> statement-breakpoint
CREATE TABLE `recurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`frequencia` text NOT NULL,
	`data_inicio` text NOT NULL,
	`data_fim` text,
	`ativo` integer DEFAULT true NOT NULL,
	`template` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `recurrences_ativo_idx` ON `recurrences` (`ativo`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_nome_unique` ON `tags` (`nome`);--> statement-breakpoint
CREATE TABLE `transaction_tags` (
	`transaction_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`transaction_id`, `tag_id`),
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `transaction_tags_tag_idx` ON `transaction_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`tipo` text NOT NULL,
	`descricao` text NOT NULL,
	`valor` integer NOT NULL,
	`data` text NOT NULL,
	`pago` integer DEFAULT false NOT NULL,
	`conta_id` text,
	`cartao_id` text,
	`conta_destino_id` text,
	`categoria_id` text,
	`observacao` text,
	`recorrencia_id` text,
	`parcela_atual` integer,
	`parcela_total` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`conta_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`cartao_id`) REFERENCES `credit_cards`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`conta_destino_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`categoria_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`recorrencia_id`) REFERENCES `recurrences`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "transactions_valor_check" CHECK("transactions"."valor" >= 0)
);
--> statement-breakpoint
CREATE INDEX `transactions_data_idx` ON `transactions` (`data`);--> statement-breakpoint
CREATE INDEX `transactions_conta_idx` ON `transactions` (`conta_id`);--> statement-breakpoint
CREATE INDEX `transactions_cartao_idx` ON `transactions` (`cartao_id`);--> statement-breakpoint
CREATE INDEX `transactions_categoria_idx` ON `transactions` (`categoria_id`);--> statement-breakpoint
CREATE INDEX `transactions_recorrencia_idx` ON `transactions` (`recorrencia_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`email` text NOT NULL,
	`senha_hash` text NOT NULL,
	`is_admin` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);