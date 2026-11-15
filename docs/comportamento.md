# Comportamento contábil do Verde

Este documento descreve **o que o app faz hoje**, não o que ele deveria fazer.
O modelo aprovado pelo dono é o de **regime de caixa com saldo projetado**: o
que conta é o dia em que o dinheiro entra ou sai da **conta**. Todos os valores
são armazenados em centavos inteiros e formatados em BRL apenas na borda.

> Os testes `*.golden.test.ts` congelam este comportamento. **Não os edite para
> passar.** Se um deles falhar, a mudança alterou o modelo contábil.

## Tela × número × como é calculado

| Tela | Número | Como é calculado hoje | Função / arquivo |
|---|---|---|---|
| `/` | Saldo total em contas | Contas **operacionais + investimentos**, na data de hoje, **sem** contas arquivadas | `getDashboardBalance` em `lib/db/queries/dashboard.ts`; base em `listAccountsWithBalances` |
| `/` | Previsto até o fim do mês | Para mês passado: saldo realizado no último dia. Para mês atual/futuro: projeção diária até o último dia, acumulando meses anteriores, com lançamentos de conta, restante de faturas e eventos de orçamento | `getMonthProjection` em `lib/db/queries/forecast.ts`; `construirProjecao` em `lib/finance/forecast.ts` |
| `/` | Resultado do mês | Receitas − despesas na base escolhida (`caixa` ou `competencia`); transferências entre contas próprias são neutras. Na base `caixa`, pagamento de fatura é saída; na `competencia`, a compra no cartão conta na data da compra | `getDashboardMonth` + `summarizeResult` em `lib/finance/result.ts` |
| `/contas` | Saldo atual total | Soma de **todas** as contas não excluídas (inclusive arquivadas e investimentos): saldo inicial + lançamentos pagos com data até hoje | `listAccountsWithBalances` em `lib/db/queries/accounts.ts`; soma em `components/accounts/accounts-view.tsx` |
| `/contas` | Saldo previsto total | Soma das mesmas contas com **todas** as transações (pagas ou não) + deltas de fatura por conta de pagamento + provisões/sobras do mês | `listAccountsWithBalances`; `getCardInvoiceAccountDeltas` em `lib/db/queries/cards.ts`; `getBudgetAccountDeltasForMonth` em `lib/db/queries/budgets.ts` |
| `/lancamentos` | Saldo do dia | Saldo **previsto** acumulado ao fim de cada dia: `getMonthBalances("previsto")` usa **todas** as contas não excluídas e apenas transações de conta; as faturas virtuais são somadas depois por `aplicarEventosAoSalsoDia`. Não é um realizado diário | `getMonthBalances` em `lib/db/queries/transactions.ts`; `aplicarEventosAoSalsoDia` em `lib/finance/budgets.ts`; página `app/(app)/lancamentos/page.tsx` |
| `/lancamentos` | Saldo e previsto do rodapé | `saldo = abertura realizada do mês + saldoRealizado do recorte`. `previsto = projeção do mês` quando não há filtros/intervalo; com filtros, a projeção é desligada e o previsto é `abertura + entradasPrevistas − saídasPrevistas` do recorte | `buildFooterSummary` e `buildFooterBreakdown` em `lib/finance/summary-display.ts`; `components/transactions/transactions-summary-footer.tsx` |
| `/cartoes` | Fatura, restante e status | Fatura por cartão + `YYYY-MM` do vencimento. `total` = despesas − estornos; `pago` = transferências pagas vinculadas à fatura (pagamentos antigos sem vínculo entram por FIFO); `restante = max(0, total − pago)`; `credito = max(0, pago − total)` | `faturaDaCompra`, `datasDaFatura`, `montarResumoFatura` em `lib/finance/cards.ts`; `invoicesForCard` em `lib/db/queries/cards.ts` |
| `/cartoes` | Limite usado e dívida | Limite usado = soma dos restantes − créditos, com piso zero; dívida separa fatura atual, parcelas futuras e compras futuras | `calcularLimiteUsado`, `splitCardDebt` em `lib/finance/cards.ts`; `getCardDebtSnapshot` em `lib/db/queries/cards.ts` |
| `/limite-de-gastos` | Limite, restante, estouro e percentual | Limite do ciclo (com override) − gasto; restante e estouro com piso zero; gasto pela **data de saída** (conta: data; cartão: vencimento da fatura) | `calcularCiclo` em `lib/finance/budgets.ts`; `toCycleSummary`/`applySobraPolicy` em `lib/db/queries/budgets.ts` |
| `/limite-de-gastos` | Provisão e sobra | Provisão = **restante** do ciclo no início (ou um ciclo antes, com antecedência). Sobra = mesmo restante no fechamento, apenas se > 0. `liberar` devolve ao saldo livre; `rolar` soma ao limite seguinte; `realocar` envia ao orçamento de destino no ciclo seguinte | `eventosDoCiclo` em `lib/finance/budgets.ts`; `applySobraPolicy` em `lib/db/queries/budgets.ts` |
| `/previsao` | Série, mínimo, períodos negativos e recuperação | Projeção diária a partir do saldo atual do escopo; abaixo da margem abre período negativo. Recuperação só pode ser causada por entrada real/recorrência de receita; reserva, liberação e transferência não são causas | `getForecastData` em `lib/db/queries/forecast.ts`; `construirProjecao`, `detectarPeriodosNegativos`, `encontrarRecuperacao` em `lib/finance/forecast.ts` |
| `/relatorios` | Categorias, meses e origens | Pela **data da compra**; transferências e linhas virtuais não entram como despesa/receita. Compras no cartão entram por categoria; pagamentos de fatura aparecem por origem | `getReportData`, `listReportRows` em `lib/db/queries/reports.ts`; `lib/finance/reports.ts` |
| `/configuracoes/dados` | Importação de planilha | Linha-resumo `Fatura <mês> <ano>` sem categoria é classificada como `carry_over`, não como compra, e não entra no total da fatura | `classifySpecialRow`, `buildCanonicalRows`, `buildSheetInvoiceTotals` em `lib/finance/spreadsheet-import.ts` |

## Caso de referência aprovado (15/11/2026)

Fixture genérica: 1 conta corrente com saldo inicial zero e 5 cartões. Quatro
cartões fecham em 9/10 e vencem em 15; um fecha em 16 e vence em 23; todos com
`proxima_fatura`. As faturas de novembro estão pagas por transferências
vinculadas; uma delas foi paga com R$ 85,00 a mais. Há itens de conta em
novembro e dezembro, e faturas em aberto em dezembro.

### 1. Saldo atual = R$ 382,00

- Receita recebida em outubro: **+1.067,00**
- Pagamentos das faturas de novembro (5 cartões): **−1.135,00**
- Itens de 19/11 e 20/11 já pagos: **+1.100,00** e **−650,00**

```text
1.067,00 − 1.135,00 + 1.100,00 − 650,00 = 382,00
```

Os itens de 19/11 e 20/11 são **futuros** em relação a 15/11. Por isso:

- `computeAccountBalances` (todos os pagos) e `buildFooterSummary.saldo`:
  **382,00**;
- `listAccountsWithBalances.saldoAtual` e `getDashboardBalance.total`
  (pagos até hoje): **−68,00**.

Desmarcar os dois itens muda o saldo de 382,00 para **−68,00**.

### 2. Previsto de novembro = R$ 50,00

Os itens de conta de novembro ainda não pagos somam **−332,00** e não há
restante de fatura em novembro:

```text
382,00 − 332,00 = 50,00
```

Pela via “as of today” a conta é a mesma:

```text
−68,00 + 1.100,00 − 650,00 − 332,00 = 50,00
```

Desmarcar os itens de 19/11 e 20/11 **não altera** o previsto: continua 50,00.

### 3. Previsto de dezembro = R$ 466,26

O previsto acumula novembro e soma os itens de conta de dezembro, menos as
faturas que vencem em dezembro:

```text
50,00 + 2.032,00 − 1.615,74 = 466,26
```

Faturas de dezembro por cartão:

| Cartão | Fatura |
|---|---:|
| A | 130,55 |
| B | 691,59 |
| C | 514,87 |
| D | 195,73 |
| E | 83,00 |
| **Total** | **1.615,74** |

### 4. O que o caso também congela

- As faturas de novembro ficam com `restante = 0`; o pagamento de R$ 85,00 a
  mais vira **crédito** e não aumenta o previsto de novembro.
- A fatura paga continua visível na lista de lançamentos.
- Uma compra no cartão não altera o saldo da conta.
- Pagamento de fatura é transferência e não aparece como despesa/receita nos
  relatórios.

## Divergências observadas entre vias (sem correção)

1. **Contas × previsão em dezembro:** `getMonthProjection("2026-12")` = **466,26**;
   `listAccountsWithBalances().saldoPrevisto` = **549,26**. A diferença de
   **83,00** é a fatura do Cartão E, anulada pelo crédito de 85,00 na via de
   Contas.
2. **Saldo “as of today”:** `listAccountsWithBalances.saldoAtual` e
   `getDashboardBalance.total` = **−68,00**, porque os itens de 19/11 e 20/11
   são futuros. O rodapé e `computeAccountBalances` mostram **382,00**.
3. **`getMonthBalances` não conhece faturas virtuais:** o previsto bruto de
   dezembro é **2.082,00**; depois de `aplicarEventosAoSalsoDia` com as faturas,
   chega a **466,26**.
4. **Orçamento com realocação:** `getBudgetCycleDetail` chamado isoladamente
   para o destino não carrega a série de origem e mostra o limite sem a sobra;
   `listBudgetCycleDetails` no mesmo ciclo mostra o limite com a sobra recebida.

## Onde estão os testes

- `lib/db/accounting-model.golden.test.ts` — caso de referência, alternância
  pago/não pago, saldo do dia, rodapé e previsão da fixture.
- `lib/db/cards.golden.test.ts` — restante/crédito, linha após pagamento, FIFO e
  relatórios.
- `lib/db/budgets.golden.test.ts` — `sobra_policy` liberar/rolar/realocar e
  efeito no previsto.
- `lib/finance/cards.golden.test.ts` — datas de fatura, override e visibilidade.
- `lib/finance/budgets.golden.test.ts` — provisão, sobra, estouro, antecedência
  e ciclo passado.
- `lib/finance/forecast.golden.test.ts` — estimativas ligadas/desligadas.
- `lib/finance/spreadsheet-import.golden.test.ts` — linha-resumo “Fatura”.
