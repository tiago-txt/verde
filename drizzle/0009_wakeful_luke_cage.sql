-- Ajuste focado em orçamentos/faturas:
-- 1. remove o modo "vencimento da fatura" (colunas ficam deprecated);
-- 2. adiciona o deslocamento manual de ciclo e a opção de fechamento do cartão.
-- Tudo aditivo; nenhuma coluna é removida.

ALTER TABLE `transactions` ADD `orcamento_deslocamento` integer DEFAULT 0 NOT NULL CHECK (`orcamento_deslocamento` between -2 and 2);--> statement-breakpoint
ALTER TABLE `credit_cards` ADD `fechamento_compra` text DEFAULT 'proxima_fatura' NOT NULL;--> statement-breakpoint

-- Orçamentos que usavam o modo removido voltam para o início do ciclo.
UPDATE `budgets`
SET `data_da_reserva` = 'inicio_do_ciclo'
WHERE `data_da_reserva` = 'vencimento_da_fatura';--> statement-breakpoint

UPDATE `budget_versions`
SET `data_da_reserva` = 'inicio_do_ciclo'
WHERE `data_da_reserva` = 'vencimento_da_fatura';--> statement-breakpoint

-- Exceções antigas podem carregar os campos removidos no JSON; eles deixam de
-- ser lidos, mas são limpos para manter o dado consistente.
UPDATE `budget_cycle_exceptions`
SET `dados` = json_remove(`dados`, '$.dataDaReserva', '$.diaVencimento')
WHERE `dados` IS NOT NULL;
