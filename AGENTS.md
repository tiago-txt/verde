\# AGENTS.md — Verde



Finanças pessoais/familiares em pt-BR, BRL, self-hosted (1 container Docker, SQLite).

Stack: Next.js 15 (App Router), TypeScript strict, SQLite (better-sqlite3) + Drizzle, Tailwind, lucide-react, Zod, Vitest. Server Actions por padrão.

Pastas: `app/` rotas · `components/` · `lib/finance/` lógica pura · `lib/db/` (schema, `scoped.ts`, `queries/`) · `lib/actions/` · `lib/validation/` · `drizzle/` migrations · `docs/`.



\## 1. COMO TRABALHAR

1\. \*\*Leia antes de codar.\*\* Abra os arquivos que vai tocar e os testes vizinhos. Procure antes de criar; reaproveite. Confirme nomes no código, não assuma.

2\. \*\*Escopo é o pedido.\*\* Só o que foi pedido. Sem refatoração, renomeação, dependência ou "melhoria" não pedida. Achou outro problema: relate no final, não corrija.

3\. \*\*Escopo fechado.\*\* Antes de editar: `git status` (se a árvore estiver suja, avise e pare) e liste os arquivos que pretende alterar, com o motivo. Só edite esses. Precisa de outro? Pare e explique por que e quem mais depende dele. Depois de editar: `git diff --stat`; desfaça ou justifique tudo que estiver fora da lista. Relate "planejados × alterados".

4\. \*\*Arquivos-hub\*\* (mudar afeta várias telas): `components/transactions/{transaction-row,budget-event-row,card-invoice-row,transactions-page-client,transactions-summary-footer,transaction-form-dialog}.tsx`, `components/app-shell.tsx`, `components/entity-tile.tsx`, `components/ui/{button,dialog,badge,input}.tsx`, `app/globals.css`, `tailwind.config.ts`, `lib/db/schema.ts`, `lib/db/queries/{budgets,cards,transactions,forecast}.ts`, `lib/{dates,format,utils}.ts`, `middleware.ts`. Só mexa se o pedido citar; nesse caso, prefira ADICIONAR variante/prop opcional a mudar o comportamento existente, liste as telas afetadas e verifique ao menos 3.

5\. \*\*Nunca "aproveite a passada"\*\* para ajustar estilo, texto, nome ou lógica de outra área.

6\. \*\*Dúvida que muda o resultado\*\*: pergunte (uma pergunta objetiva). Detalhe menor: decida e registre como suposição.

7\. \*\*NUNCA faça commit, push, `git reset`, `git checkout .`, nem apague arquivos fora do escopo.\*\* Deixe na working tree.

8\. \*\*NUNCA enfraqueça verificações para passar\*\*: sem `skip`/`only`, sem afrouxar asserts, sem subir o limite do guarda de estilos, sem desligar regra de lint, sem `any`/`@ts-ignore`/`eslint-disable`. Teste falhou por causa da sua mudança? Corrija o código. Só ajuste o teste se ele estiver desatualizado e você explicar.

9\. \*\*Não altere este arquivo\*\*, nem testes de guarda, lint ou CI, sem pedido explícito.



\## 2. PRONTO (só vale se tudo for rodado e relatado)

`npm run check` (typecheck + lint + test + build). Além disso:

\- \*\*Toda mudança de comportamento tem teste no mesmo trabalho\*\*: regra em `lib/finance/` com teste unitário; ação com teste; componente interativo com teste de renderização/interação (quando a infraestrutura existir); bug corrigido com teste de regressão. \*\*Sem teste, a tarefa NÃO está pronta, mesmo que o build passe.\*\*

\- Mudou UI? Descreva como verificou (desktop e mobile) e o que não conseguiu verificar.

\- Sem texto em inglês na UI, `console.log` de depuração ou segredos no código.

\- Migrations aplicam em banco existente.



\## 3. REGRAS INVIOLÁVEIS (dados e segurança)

\- \*\*Dinheiro em centavos (inteiro)\*\*, nunca float; formatar só na borda (`lib/format.ts`). Soma de parcelas == total.

\- \*\*Datas\*\* somente-data ISO, fuso `America/Sao\_Paulo`, via `lib/dates.ts`; sem `new Date()` solto para "hoje".

\- \*\*Isolamento por workspace\*\*: `workspace\_id` vem SEMPRE da sessão no servidor, nunca de parâmetro, formulário ou searchParams. Toda query de tabela de domínio passa por `scopedDb(workspaceId)`. Operação por ID valida o workspace; recurso alheio responde "não encontrado". IDs de vínculo (conta, categoria, cartão, tag) validados no mesmo workspace. Chaves de cache incluem o workspace. O admin nunca lê dados financeiros de outros.

\- \*\*Migrations\*\*: sempre NOVAS e não destrutivas; nunca edite migration já publicada nem apague dados do usuário. Colunas obsoletas ficam deprecadas, não removidas. Migration que reconstrói tabela (como 0004/0007) só com cópia de dados e teste de preservação. Teste sobre banco existente.

\- \*\*Validação\*\*: Zod em toda entrada (action, route handler, importação). Queries parametrizadas via Drizzle.

\- \*\*Privacidade\*\*: sem CDN, fonte ou imagem externa em runtime; sem telemetria; o service worker nunca cacheia dados autenticados; logout limpa caches e storages; segredos só em variáveis de ambiente.

\- \*\*Dados reais do dono NUNCA entram no repositório\*\*: backups JSON (`verde-backup\*.json`), planilhas (`\*.xlsx`, `movimentacoes\*`), CSVs exportados, bancos `.db`. Garanta que o `.gitignore` os cobre. Testes usam fixtures genéricas (valores e descrições inventados que reproduzam os totais necessários), nunca cópias de dados reais. Não cole dados reais em logs, mensagens de commit, comentários ou relatórios.

\- \*\*Sem dependência nova\*\* sem justificar e sem aval do dono.



\## 4. LÓGICA DE NEGÓCIO

\- Regra financeira vive em `lib/finance/` (funções puras, com teste). Componentes e actions só chamam. `lib/finance/` pode importar TIPOS de `lib/db`; nunca consultas, React nem relógio global. Não recalcule saldo, fatura, ciclo ou previsão dentro de componente ou query.

\- Dívida conhecida (NÃO criar mais duplicação): saldo em SQL × `balance.ts`/`day-balance.ts`; `calcularCiclo` × `toCycleSummary`; FIFO de pagamento em `invoicesForCard` e `getCardDebtSnapshot`; `eventoDaFatura` × montagem manual na página de Lançamentos; percentuais de progresso em 3 componentes.

\- \*\*Orçamento é série de ciclos\*\* (`resolverCiclo`, versões e exceções; escopos só este / este e os próximos / todos). A linha do ciclo não some por restante ≤ 0. Consome pela data de saída do dinheiro (conta: a data; cartão: vencimento da fatura) + `orcamento\_deslocamento`.

\- \*\*Relatórios/dashboard\*\* pela data da compra; transferências, linhas virtuais e pagamentos de fatura não contam como despesa/receita.

\- Recorrências geradas de forma idempotente, sem duplicar.

\- Mudou uma regra? Atualize o teste e o README no mesmo trabalho.



\## 5. MODELO CONTÁBIL DO DONO (aprovado; NÃO alterar)

O dono usa \*\*regime de caixa com saldo projetado\*\*: o que conta é o dia em que o dinheiro entra ou sai da CONTA. Esse modelo foi conferido contra o aplicativo de referência dele e é o comportamento DESEJADO, mesmo que difira do README, de comentários ou de especificações antigas.



\*\*Glossário\*\*

\- \*\*Saldo (atual)\*\*: foto de HOJE = saldo inicial + lançamentos PAGOS. É constante: não muda ao navegar entre meses nem com filtros. Investimento fica separado.

\- \*\*Previsto (de um mês)\*\*: saldo projetado até o FIM desse mês, ACUMULANDO os anteriores = saldo atual + lançamentos da conta ainda não pagos com data até o fim do mês + RESTANTE das faturas de cartão que vencem até o fim do mês. O previsto de um mês passa por cima dos meses anteriores, não recomeça a cada mês.

\- \*\*Marcar um item como pago/não pago\*\* muda o saldo, mas NÃO muda o previsto (o item só troca de "a pagar" para "realizado").

\- \*\*Cartão\*\*: a compra NÃO mexe na conta. O dinheiro sai quando a FATURA é paga: a fatura pesa no previsto na data de VENCIMENTO, só pelo restante (total − pagamentos vinculados, nunca abaixo de zero). O pagamento é uma transferência conta→cartão vinculada à fatura (`fatura\_chave`), nunca despesa. Compra e pagamento da mesma fatura NUNCA somam juntos; fatura quitada some do previsto mas a linha continua visível.

\- \*\*Fatura\*\*: identificada por cartão + `YYYY-MM` do VENCIMENTO. Ciclo de compras: começa no dia de fechamento e termina no dia anterior ao fechamento seguinte. Compra feita no dia do fechamento segue a opção do cartão (`fechamento\_compra`: `proxima\_fatura` padrão, ou `fatura\_atual`). O vencimento é o primeiro dia de vencimento posterior ao fechamento (se `dia\_vencimento <= dia\_fechamento`, cai no mês seguinte). `fatura\_chave\_override` (usado em milhares de lançamentos importados) SEMPRE prevalece sobre o cálculo.

\- \*\*Orçamento\*\*: ver seção 4 e a regra de congelamento abaixo.



\*\*Caso de referência (números aprovados)\*\*, com "hoje" = 15/11/2026: saldo = 382,00 em novembro e em dezembro; previsto de novembro = 50,00; previsto de dezembro = 466,26; faturas de dezembro por cartão = 130,55 / 691,59 / 514,87 / 195,73 / 83,00 (soma 1.615,74). Os testes `\*.golden.test.ts` guardam esses números. NUNCA os edite para passar: se falharem, a sua mudança alterou o modelo contábil; desfaça-a.



\*\*Importação de planilhas\*\* (referência: exportação do app de origem do dono): cada aba de cartão traz, além das compras, uma linha-resumo "Fatura <mês> <ano>" sem categoria, com o total da fatura. Ela NÃO é compra; somá-la dobra a fatura. A importação deve ignorá-la.



\*\*Congelado (não mexer sem pedido explícito e nomeado)\*\*: saldo do dia; saldos do rodapé de Lançamentos; total em Contas e Dashboard (quais contas entram, arquivadas, investimentos); reserva do orçamento (cálculo do restante); sobra do orçamento (rolagem, realocação, rótulo, cor, sinal) e como entram no previsto; resultado do mês (caixa/competência); previsão de saldo. Achou algo "errado" nessas áreas? NÃO corrija: relate como observação. Se uma mudança em outra área alterar qualquer número dessas áreas, pare e avise.



\## 6. INTERFACE

\- Tokens em `app/globals.css` + `tailwind.config.ts`. Proibido hexadecimal, `text-\[..px]` e raio/espaço arbitrário no markup (o guarda `lib/design-guard.test.ts` limita as ocorrências de `text-\[Npx]` e esse limite NÃO pode subir). Texto mínimo 12px.

\- Fontes locais via `next/font` (Space Grotesk, Hanken Grotesk, JetBrains Mono); `tabular-nums` em valores. Ícones: lucide-react.

\- Cores semânticas: receita esmeralda; despesa terracota (nunca âmbar); transferência cobalto; orçamento/alerta âmbar; estouro vermelho.

\- Reaproveite SEMPRE: `DialogContent` (modais), `useToast`/`ToastProvider` (avisos), `EntityTile`/`tile-spec` (pastilhas: a mesma entidade tem a mesma cor/ícone em todas as telas), `PageHeader`, `NativeSelect`, `DatePicker`, `NumericKeypad`. NÃO crie novo estilo de modal, toast, pastilha ou cabeçalho.

\- Decorações só pelos tokens `--deco-\*`, nunca atrás de texto/controle nem nas listas.

\- Alvos de toque ≥ 48px no mobile; foco só em `:focus-visible`; sem `autoFocus` em toque; `aria-label` em botão só de ícone; `role="progressbar"` com valores.

\- Textos em pt-BR, plural correto (sem "(s)"), um só caractere de sinal negativo.

\- Toda tela nova tem loading, vazio (com ação) e erro (com "Tentar novamente").

\- Mobile: sem botão flutuante extra além do "+" da barra inferior; lista plana (linha ≤ 76px, sem card dentro de card); formulários em `100dvh`; sem blur/glow pesado.



\## 7. PROIBIDO (resumo)

float para dinheiro · query fora de `scopedDb` · `workspace\_id` vindo do cliente · migration destrutiva ou editada · regra financeira em componente · compra de cartão mexendo no saldo da conta · pagamento de fatura contado como despesa · despesa em âmbar · hexadecimal ou `px` arbitrário · fonte/imagem/CDN externa · novo estilo de modal/toast/pastilha · remover/pular/enfraquecer teste · editar golden test · dados reais no repositório · commit/push · dependência nova sem aval · texto em inglês · afirmar que testou sem ter rodado.



\## 8. RELATÓRIO FINAL

1\. O que foi feito. 2. Planejados × alterados (`git diff --stat`). 3. Verificações rodadas (comandos e resultados reais). 4. O que NÃO foi possível verificar. 5. Suposições. 6. Problemas fora do escopo (sem corrigir). 7. Próximo passo.

