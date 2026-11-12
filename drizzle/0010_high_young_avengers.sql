ALTER TABLE `transactions` ADD `cartao_fechamento` integer;--> statement-breakpoint
ALTER TABLE `transactions` ADD `cartao_vencimento` integer;--> statement-breakpoint
ALTER TABLE `transactions` ADD `cartao_fechamento_compra` text;--> statement-breakpoint

-- Congela a regra vigente do cartão nos lançamentos existentes. Ciclos já
-- encerrados permanecem intactos; ciclos abertos são atualizados quando o
-- cadastro do cartão muda.
UPDATE `transactions`
SET
  `cartao_fechamento` = (
    SELECT `dia_fechamento` FROM `credit_cards` WHERE `credit_cards`.`id` = `transactions`.`cartao_id`
  ),
  `cartao_vencimento` = (
    SELECT `dia_vencimento` FROM `credit_cards` WHERE `credit_cards`.`id` = `transactions`.`cartao_id`
  ),
  `cartao_fechamento_compra` = (
    SELECT `fechamento_compra` FROM `credit_cards` WHERE `credit_cards`.`id` = `transactions`.`cartao_id`
  )
WHERE `cartao_id` IS NOT NULL;
