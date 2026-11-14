# Importação de planilhas (XLS/XLSX)

O importador de planilhas lê arquivos `.xls` (BIFF/OLE2) e `.xlsx`, várias abas e
layouts de conta e cartão. Ele foi desenhado para conciliar o arquivo real
`movimentacoes_*_20190101_20261110.xls`, mas não depende de nomes de abas.

## Formato aceito

Layout de conta:

`Data | Descrição | Categoria | Valor | Situação | Tags | Informações adicionais`

Layout de cartão:

`Data | Descrição | Categoria | Valor | Fatura | Tags | Informações adicionais`

- Cabeçalho com `Situação` → conta; com `Fatura` → cartão. Com os dois ou
  nenhum, o tipo é escolhido no wizard.
- Datas: `dd.mm.aaaa`, `dd/mm/aaaa`, ISO e serial do Excel (1900 ou 1904).
- Valores: número, `1.234,56`, `1234.56`, `R$ 1.234,56`, `-150,00` e `(10,50)`.
- Fatura: `Mês/AAAA`, `Mês de AAAA` ou `Mês AAAA`, com ou sem acento.
- Tags separadas por vírgula; observações preservam quebras de linha internas.
- Parcelas no fim da descrição: `n/total`, com `1 <= n <= total <= 60`.
  `FATURA ...` é carry-over, não parcela comum.
- Limites: 5 MB, 50 abas, 50 mil linhas e 20 colunas por aba.

## Decisões de produto

- Toda aba com coluna `Fatura` é cartão de crédito.
- A coluna `Fatura` grava `transactions.fatura_chave_override` e prevalece sobre
  a fatura calculada pela data e pelo fechamento do cartão.
- `Pagamento de fatura` entra como transferência da conta para o cartão. Nunca
  como despesa.
- Pagamentos com cartão e mês na descrição são conciliados automaticamente.
  Cartões citados que não têm aba são criados arquivados automaticamente, com
  opção de revisão.
- Pagamentos genéricos são conciliados automaticamente quando existe exatamente
  uma fatura do mesmo mês com o valor exato do pagamento. Só os casos sem
  correspondência única aparecem para escolha manual.
- Créditos/estornos positivos entram por padrão como receita.
- A revisão avançada permite mudar ação, cartão e fatura de qualquer pagamento,
  mas não é necessária no fluxo normal.
- `Investimento`, `Reserva`, `Reservado`, `Repor reserva` e `Resgate` entram por
  padrão como despesa em `Investimentos`, com opção de transferência para uma
  conta ou de ignorar.
- `Saldo Inicial` não vira receita. Em conta nova/vazia define `saldoInicial`; em
  conta com lançamentos o wizard oferece ajuste ou ignorar.
- `Correção de saldo` entra como lançamento normal, respeitando o sinal.
- `FATURA ...`, `Cartão Adicional` e `fatura bugada?` são carry-over e exigem
  decisão (importar como compra, vincular a outro cartão ou ignorar).
- Pagamentos genéricos (só `Pagamento de fatura`) são agrupados por mês e valor
  para conciliação. Um cartão histórico pode ser criado arquivado, com
  fechamento/vencimento padrão 1/10 e vínculo à conta de origem.
- Linhas com valor zero são contadas e ignoradas.

## Duplicidade, lote e desfazer

- O hash SHA-256 é calculado no navegador. Se o mesmo arquivo já foi importado,
  o wizard avisa e bloqueia até marcar “Reimportar”.
- Duplicatas exatas dentro do arquivo são sinalizadas. Duplicatas contra o banco
  usam origem + data + valor + descrição + parcela e podem ser ignoradas com uma
  opção explícita.
- Cada importação grava um registro em `import_batches` e preenche
  `import_batch_id` nos lançamentos. O desfazer remove todos os lançamentos do
  lote, incluindo compras de cartão e transferências.
- Contas, cartões, categorias e tags criados são mantidos após o desfazer.

## Como testar

```bash
npm test
npm run typecheck
npm run build
```

Depois, abra `/configuracoes/dados`, escolha o arquivo `.xls`/`.xlsx`, revise as
abas e origens, concilie pagamentos/cartões históricos e clique em
“Pré-visualizar” e “Importar planilha”. O botão “Desfazer esta importação”
remove o lote inteiro.

## Limitações

- Fórmulas e macros não são executadas; o importador lê apenas valores.
- Investimentos não viram posições/ativos nem orçamentos.
- Parcelas futuras não são criadas: cada linha da planilha é um lançamento já
  existente.
- O layout é genérico, mas a conciliação de cartões históricos e de pagamentos
  genéricos depende das escolhas feitas no wizard.
- O arquivo de referência tem uma linha com descrição de pagamento de fatura e
  categoria `Outros`. Ela é sinalizada como “categoria divergente” e continua
  sendo tratada como pagamento, para nunca virar despesa.
