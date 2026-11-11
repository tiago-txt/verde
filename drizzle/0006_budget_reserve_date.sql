ALTER TABLE `budgets` ADD `data_da_reserva` text DEFAULT 'inicio_do_ciclo' NOT NULL CHECK (`data_da_reserva` in ('inicio_do_ciclo', 'vencimento_da_fatura'));--> statement-breakpoint
ALTER TABLE `budgets` ADD `dia_vencimento` integer DEFAULT 1 NOT NULL CHECK (`dia_vencimento` between 1 and 31);--> statement-breakpoint
ALTER TABLE `budgets` ADD `origens` text DEFAULT 'todas' NOT NULL CHECK (`origens` in ('todas', 'cartao', 'contas'));--> statement-breakpoint
ALTER TABLE `budgets` ADD `cartao_id` text REFERENCES `credit_cards`(`id`) ON UPDATE no action ON DELETE set null;
