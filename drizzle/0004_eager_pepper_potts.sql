PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_credit_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`bandeira` text DEFAULT 'outra' NOT NULL,
	`limite` integer DEFAULT 0 NOT NULL,
	`dia_fechamento` integer NOT NULL,
	`dia_vencimento` integer NOT NULL,
	`conta_pagamento_id` text,
	`cor` text DEFAULT '#818cf8' NOT NULL,
	`icone` text DEFAULT 'CreditCard' NOT NULL,
	`arquivado` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`conta_pagamento_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "credit_cards_fechamento_check" CHECK("__new_credit_cards"."dia_fechamento" between 1 and 31),
	CONSTRAINT "credit_cards_vencimento_check" CHECK("__new_credit_cards"."dia_vencimento" between 1 and 31),
	CONSTRAINT "credit_cards_limite_check" CHECK("__new_credit_cards"."limite" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_credit_cards`("id", "nome", "bandeira", "limite", "dia_fechamento", "dia_vencimento", "conta_pagamento_id", "cor", "arquivado", "created_at", "updated_at", "deleted_at") SELECT "id", "nome", "bandeira", "limite", "dia_fechamento", "dia_vencimento", "conta_pagamento_id", "cor", "arquivado", "created_at", "updated_at", "deleted_at" FROM `credit_cards`;--> statement-breakpoint
DROP TABLE `credit_cards`;--> statement-breakpoint
ALTER TABLE `__new_credit_cards` RENAME TO `credit_cards`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `credit_cards_arquivado_idx` ON `credit_cards` (`arquivado`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `cartao_destino_id` text REFERENCES credit_cards(id);--> statement-breakpoint
ALTER TABLE `transactions` ADD `fatura_chave` text;--> statement-breakpoint
CREATE INDEX `transactions_cartao_data_idx` ON `transactions` (`cartao_id`,`data`);--> statement-breakpoint
CREATE INDEX `transactions_cartao_destino_idx` ON `transactions` (`cartao_destino_id`);--> statement-breakpoint
CREATE INDEX `transactions_fatura_chave_idx` ON `transactions` (`fatura_chave`);