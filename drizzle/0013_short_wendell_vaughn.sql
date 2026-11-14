ALTER TABLE `budgets` ADD `sobra_destino_budget_id` text REFERENCES budgets(id) ON DELETE SET NULL;
