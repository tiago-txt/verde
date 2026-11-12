# Verde

Finanças pessoais e familiares, em português do Brasil, com valores em **BRL** e
valores armazenados sempre em **centavos**. Interface responsiva (PWA no celular
e dashboard no computador), self-hosted em um único container Docker, com SQLite.

> **Status:** etapas 1–5 concluídas — autenticação, contas, categorias/tags,
> lançamentos completos, recorrência/parcelamento, orçamentos com ciclo,
> cartões/faturas, dashboard, relatórios, exportação/importação e PWA. Esta
> entrega adiciona **multiusuário com isolamento total por workspace** (sem
> compartilhamento) e a **previsão de saldo da Etapa 6**.

---

## Stack

- **Next.js 15** (App Router) + **TypeScript** strict
- **SQLite** via `better-sqlite3` + **Drizzle ORM** (migrations versionadas)
- **Tailwind CSS** + componentes no estilo **shadcn/ui** + `lucide-react`
- **Recharts** (gráficos, a partir da etapa 5)
- **Zod** para validação e **React Hook Form** nos formulários
- **Server Actions** como padrão (sem TanStack Query)
- **bcryptjs** para hash de senha e **jose** para sessão JWT assinada em cookie
  `httpOnly`
- **Vitest** para a lógica crítica

Sem Redis, sem Postgres, sem serviços externos. Tudo em um container.

---

## Funcionalidades atuais

- **Multiusuário isolado por workspace**: cada usuário tem um workspace pessoal
  com contas, cartões, categorias, tags, lançamentos, recorrências e orçamentos
  próprios. O `workspace_id` vem sempre da sessão no servidor; IDs de outro
  workspace respondem como “não encontrado”. O admin gerencia usuários, mas
  **não** vê os dados financeiros de ninguém.
- **Contas** (`/contas`): CRUD, saldo atual (pagos) e previsto (inclui não pagos),
  transferências, arquivamento e exclusão bloqueada quando há lançamentos.
- **Categorias e tags** (`/configuracoes/categorias`): despesa/receita, um nível
  de subcategoria, arquivamento, exclusão com movimentação de lançamentos e tags.
- **Lançamentos** (`/lancamentos`): despesa, receita e transferência; lista mensal
  agrupada por dia; valor em centavos; pagamento otimista; duplicar e excluir.
- **Tela de Lançamentos completa**: filtros no servidor (origem, tipo, categorias,
  tags e status), busca com debounce, mês/ano na URL, cabeçalho “Hoje/Ontem/Amanhã”,
  saldo do dia real sem filtros, painel lateral no desktop / tela cheia no mobile,
  navegação por teclado entre lançamentos, seleção múltipla com ações em lote,
  exportação CSV e “marcar vencidos como pagos”.
- **Calendário de data**: digitação dd/MM/yyyy com máscara, calendário em popover
  no desktop e bottom sheet no mobile, troca rápida de mês/ano, teclado e botão
  “Hoje”. Reutilizado em data do lançamento e data final da recorrência.
- **Categorias de sistema “Outros”**: uma para despesa e uma para receita,
  protegidas contra exclusão/arquivamento. Categoria é opcional no lançamento e
  resolve automaticamente para Outros; transferências permanecem sem categoria.
- **Recorrência fixa** (mensal/semanal/anual): geração idempotente sob demanda,
  inclusive 12 meses à frente; meses curtos e anos bissextos tratados.
- **Parcelamento** (2–60x): total dividido com resto na primeira parcela ou valor
  por parcela; todas as parcelas geradas na criação.
- **Edição/exclusão por escopo**: só este, este e os próximos, ou todos.
- **Orçamentos com ciclo** (`/limite-de-gastos`): envelope por categorias com dia
  de fechamento, valor por ciclo, overrides, vigências e eventos virtuais de
  provisão/sobra no previsto, sem alterar o realizado. O orçamento é uma
  **série**: cada ciclo é uma ocorrência e pode ser editado/excluído em três
  escopos (só este, este e os próximos, todos). Exceções por ciclo permitem
  ajustar valor/categorias/fechamento ou excluir só um mês, com restauração.
  Quando o envelope estoura ou é consumido, a linha permanece visível com
  reserva R$ 0,00, barra vermelha e o resultado final; ela nunca some por
  `restante <= 0`.
- **Cartões e faturas** (`/cartoes`): limite, fechamento, vencimento, fatura
  calculada por ciclo, compras/estornos, parcelas, limite usado/disponível e
  pagamento de fatura por transferência (parcial ou total, com desfazer). Na
  tela de lançamentos, cada fatura é **uma linha única** na data de vencimento,
  com total, status, pago/restante e barra de quitação; ela permanece visível
  mesmo após pagamento total. A linha abre o painel da fatura (compras,
  pagamentos e Pagar) e as transferências vinculadas ficam ocultas por padrão,
  aparecendo no filtro Tipo = Transferência e no painel. Os cálculos usam
  apenas o restante da fatura + as transferências reais, sem dupla contagem.
- **Performance**: lista paginada por dias visíveis (`dias` na URL), saldo do dia
  calculado por uma query agregada; faturas e orçamentos agregados em uma única
  consulta por página, com índices por cartão/data e fatura.
- **Visão geral** (`/`): saldo operacional e investimentos, faturas em aberto,
  receitas × despesas com variação, donut por categoria, evolução de 6/12 meses,
  próximos 15 dias (contas e faturas), cartões e orçamentos do ciclo.
- **Relatórios** (`/relatorios`): por categoria (com subcategorias e variação),
  por mês (barras empilhadas e tabela) e por conta/cartão (com faturas), filtros
  de período/tipo/origem/categoria/tag/pago e exportação CSV por aba.
- **Dados** (`/configuracoes/dados`): backup JSON completo, restauração do JSON
  dentro do workspace (remapeando IDs), CSV de lançamentos por intervalo e
  importação de CSV com mapeamento, pré-visualização, duplicados, criação
  opcional de contas/categorias e desfazer do último lote.
- **Usuários** (`/configuracoes/usuarios`, somente admin): criar usuário com
  senha temporária, redefinir senha, ativar/desativar e excluir (apaga o
  workspace inteiro). O último admin ativo e a própria conta são protegidos.
  O novo usuário nasce com categorias padrão (incluindo “Outros”) e tags.
- **Perfil e segurança** (`/configuracoes/perfil`): editar nome/e-mail, trocar a
  própria senha e excluir a própria conta com confirmação. Primeiro login com
  senha temporária força a troca em `/trocar-senha`.
- **Cadastro público opcional**: desligado por padrão (`ALLOW_SIGNUP=false`);
  quando ligado, habilita `/cadastro` com validação de e-mail e senha forte.
- **PWA**: manifest, ícones 192/512/maskable, atalhos iOS, service worker com
  cache apenas de assets e página offline; nova versão avisa e atualiza sob
  demanda, sem cachear respostas autenticadas ou APIs. O logout limpa caches e
  storages locais para não vazar estado entre usuários no mesmo aparelho.
- **Seed demo opcional** (`SEED_DEMO=true`): 3 meses de contas, recorrências,
  parcelas, transferências, 2 cartões com faturas e um pagamento de fatura.

### Regras de fatura de cartão

- A fatura é **calculada**, não gravada. Ela é identificada por `cartao_id` +
  `YYYY-MM` do **vencimento**.
- O ciclo começa no `dia_fechamento` e termina no dia anterior ao fechamento do
  mês seguinte.
- **Compra feita no dia do fechamento entra na fatura seguinte** por padrão. Cada
  cartão pode escolher **Nesta fatura** (`fechamento_compra = 'fatura_atual'`) ou
  **Na próxima fatura** (`'proxima_fatura'`, padrão). A opção muda a fatura, o
  vencimento e o ciclo de orçamento apenas das compras feitas exatamente no dia
  do fechamento.
- O vencimento é o primeiro `dia_vencimento` posterior ao fechamento; se
  `dia_vencimento <= dia_fechamento`, ele cai no mês seguinte ao fechamento.
- Compras no cartão não movimentam a conta. O pagamento é uma transferência da
  conta para o cartão, com vínculo à fatura (`fatura_chave`). O valor pago reduz
  a conta e a fatura; o restante aparece como linha virtual de fatura no previsto.
  Pagamentos antigos sem `fatura_chave` são alocados no FIFO das faturas em
  aberto, para nunca contar o mesmo valor como transferência e como restante.

### Competência do orçamento

- O orçamento consome o ciclo da **data de saída do dinheiro**, não da compra:
  despesa em conta/Pix/débito usa a própria data; compra no cartão usa o
  **vencimento da fatura** (cada parcela na fatura dela; estorno idem).
- `transactions.orcamento_deslocamento` (-2..+2, padrão 0) move o consumo em
  ciclos relativos ao padrão. No modal e na edição em lote: **Neste ciclo**,
  **Ciclo anterior** ou **Próximo ciclo**.
- O ciclo é resolvido por `cicloDaData`/`resolverCiclo`, respeitando vigências,
  exceções e ciclos excluídos. Fora da janela ativa, o gasto não consome e não
  gera aviso.
- Cada lançamento no cartão guarda um snapshot de fechamento/vencimento. Mudar o
  cartão recalcula os ciclos ainda abertos; ciclos já encerrados permanecem com
  o snapshot antigo.
- Relatórios e dashboard continuam pela data da compra; só o consumo do
  orçamento usa a competência.
- O chip do lançamento e o painel do orçamento mostram o ciclo real consumido e,
  no cartão, "via fatura de DD/MM".

### Previsão de saldo (Etapa 6)

- `/previsao` projeta o saldo diário a partir do saldo atual (contas corrente,
  poupança e dinheiro por padrão), com horizonte de 6, 12 ou 24 meses.
- A série compõe somente eventos já produzidos pelas regras existentes:
  lançamentos reais futuros/não pagos, recorrências virtuais sem gravar,
  restante das faturas no vencimento, reservas/liberações de orçamento e
  transferências entre contas incluídas.
- Cada evento tem certeza `certo` (lançamentos, parcelas e faturas) ou
  `estimado` (recorrências virtuais, orçamento e receitas anuais). A chave
  “Incluir estimativas” mostra os dois cenários quando divergem.
- A margem de segurança é configurável; abaixo dela o período é negativo.
  A recuperação só pode ser causada por entrada real ou recorrência de receita —
  reserva, liberação de orçamento e transferência nunca contam como causa.
- Avisos no modal, banner dispensável em `/lancamentos`, cartão no dashboard e
  tabela mensal usam a mesma série. Preferências ficam por usuário em
  `forecast_preferences` (migration 0011) e o cache curto é invalidado pelas
  actions de lançamentos, contas, cartões, orçamentos e dados.
- A simulação “e se” do modal não grava nada; ela injeta o rascunho, incluindo
  parcelas, cartão/fatura e efeito no orçamento, e devolve antes/depois.
- A previsão é determinística, em pt-BR, com alternativa textual no gráfico.

### Linguagem visual (azulejos)

- Os mockups de referência ficam em `docs/design-reference/` e são apenas
  referência visual; o porte usa componentes, tokens e `lucide-react`.
- Tokens consolidados em `app/globals.css`/`tailwind.config.ts`: verde-floresta,
  esmaltes semânticos (esmeralda receita, terracota despesa, cobalto
  transferência, âmbar orçamento/alerta) e tema claro marfim.
- Tipografia self-host via `next/font`: Space Grotesk (títulos), Hanken Grotesk
  (corpo) e JetBrains Mono (números/rótulos). Texto mínimo 12px.
- Pastilhas `Tile` com 8 motivos derivados do hash da categoria e motivos fixos
  para transferência, orçamento e fatura; linhas virtuais tracejadas.
- Decorações (padrões, brilhos e glifos) podem ser desligadas em
  Configurações > Aparência; pastilhas e emblemas continuam.
- `lib/design-guard.test.ts` falha se voltarem dependências externas
  (`fonts.googleapis`, `cdn.tailwindcss`, `googleusercontent`,
  `material-symbols`) ou texto abaixo de 12px.

---

## Estrutura

```
app/
  (app)/                 # área autenticada (layout com sidebar/bottom nav)
    page.tsx             # visão geral (dashboard completo na etapa 5)
    lancamentos/         # lista mensal + CRUD completo (etapa 2)
    contas/              # CRUD de contas e saldos
    cartoes/             # cartões, faturas e pagamentos
    limite-de-gastos/    # orçamentos com ciclo
    relatorios/          # etapa 5
    configuracoes/       # perfil, tema, logout
      categorias/        # categorias, subcategorias e tags
      dados/             # exportação/importação JSON e CSV
      perfil/            # nome, e-mail, senha e exclusão da conta
      usuarios/          # gestão de usuários (somente admin)
  cadastro/              # cadastro público (somente com ALLOW_SIGNUP=true)
  trocar-senha/          # troca obrigatória da senha temporária
  login/                 # login (fora do shell)
  api/health/            # healthcheck do Docker
  layout.tsx             # tema escuro padrão + metadados
  globals.css
components/
  ui/                    # Button, Input, Card, Dialog, Popover, Dropdown, etc.
  calendar/              # calendário, date picker e seletor de mês/ano
  accounts/              # cards e formulário de contas
  cards/                 # cartões, faturas, limite e pagamento
  budgets/               # orçamentos, chips, detalhe e ciclo
  categories/            # categorias, subcategorias e tags
  transactions/          # lista, filtros, detalhes, lote, formulário e escopos
  app-shell.tsx          # sidebar desktop + bottom nav + FAB mobile
  auth/login-form.tsx
  ...
lib/
  db/
    schema.ts            # tabelas Drizzle
    scoped.ts            # camada única de acesso com workspaceId
    init.ts              # migrations + seed idempotente
    index.ts             # conexão única por processo
    seed-data.ts         # categorias/tags padrão
    seed-workspace.ts    # seed por workspace (novos usuários)
    seed-demo.ts         # dados de exemplo (SEED_DEMO=true)
    queries/             # leituras escopadas por workspace
  finance/               # lógica pura testável: saldos, recorrência, parcelas,
                         # escopos, filtros, calendário, datas, saldo do dia,
                         # lote, orçamentos com ciclo e faturas de cartão
  validation/            # schemas Zod compartilhados
  auth/
    jwt.ts               # assinatura/verificação (Edge-safe)
    session.ts           # cookie httpOnly
    current-user.ts      # requireUser()
  actions/               # Server Actions (auth, contas, categorias, tags, lançamentos)
  env.ts                 # variáveis e validações
  format.ts              # BRL, datas, meses em pt-BR
  dates.ts               # utilitários de mês/dia (sem fuso surpresa)
drizzle/                 # migrations SQL geradas (versionadas)
scripts/backup.mjs       # backup seguro do SQLite
data/                    # banco e backups (bind mount; fora do git)
```

---

## Rodar localmente

Requisitos: **Node.js 20.9+** (recomendado 22) e npm.

```bash
npm install

# 1. Crie o .env e ajuste os valores
cp .env.example .env

# 2. Gere um SESSION_SECRET forte
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# 3. Suba em desenvolvimento
npm run dev
```

Acesse `http://localhost:3000`. No primeiro boot, o usuário definido em
`ADMIN_EMAIL`/`ADMIN_PASSWORD` é criado e as categorias padrão são semeadas.

> O `.env` local usado neste repositório (não versionado) tem
> `admin@verde.local` / `verde12345` apenas para desenvolvimento. **Troque em
> produção.**

Para visualizar o app populado, defina `SEED_DEMO=true` no `.env` antes do
primeiro boot (ou apague `data/verde.db` e suba de novo). O seed é idempotente e
cria 3 meses de contas, recorrências, parcelas e transferências.

### Scripts

| Comando                | O que faz                                              |
| ---------------------- | ------------------------------------------------------ |
| `npm run dev`          | servidor de desenvolvimento                            |
| `npm run build`        | build de produção (output standalone)                  |
| `npm start`            | preview local do build                                 |
| `npm run typecheck`    | TypeScript strict                                      |
| `npm test`             | testes unitários (Vitest)                              |
| `npm run db:generate`  | gera nova migration a partir do schema                 |
| `npm run backup`       | backup seguro do SQLite para `./data/backups`          |

As migrations são aplicadas **automaticamente no boot** (via
`instrumentation.ts`), e o seed é idempotente.

---

## Docker e deploy

O repositório tem dois caminhos:

- **Produção (recomendado):** `docker-compose.yml` usa a imagem publicada no
  GHCR (`VERDE_IMAGE`) e não faz build no servidor.
- **Build local:** `docker-compose.dev.yml` constrói a imagem a partir do
  `Dockerfile`.

### Produção com GHCR

A imagem é construída no GitHub Actions a cada push na `main`/tag e publicada
como `ghcr.io/tiago-txt/verde:latest` (linux/amd64 + linux/arm64). No servidor:

```bash
cp .env.example .env
nano .env                    # SESSION_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, PORT, TZ
mkdir -p data

docker compose pull
docker compose up -d
docker compose logs -f verde
```

Acesse `http://IP-DO-SERVIDOR:3000` (ou a porta definida em `PORT`).

O compose tem o serviço `verde` (healthcheck em `/api/health`,
`restart: unless-stopped`, volume `${VERDE_DATA_DIR:-./data}:/app/data`) e um
`watchtower` opcional. O entrypoint ajusta o dono do bind mount e executa o
processo como usuário `nextjs` (não-root).

### Build local (dev)

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d --build
```

Use esse modo para testar mudanças de código antes de publicar uma imagem.

### GHCR: pacote público ou privado

Escolha **uma** opção no servidor:

- **Público:** GitHub → **Packages** → `verde` → *Package settings* →
  *Change visibility* → Public. Não precisa de login.
- **Privado:** crie um Personal Access Token (classic) com `read:packages` e
  faça login como root no host (o plugin Compose e o watchtower usam a mesma
  credencial):

  ```bash
  docker login ghcr.io -u tiago-txt -p <PAT com read:packages>
  ```

### Atualizar

```bash
# backup antes
docker compose exec -u nextjs -T verde node scripts/backup.mjs

docker compose pull
docker compose up -d
```

O `pull_policy: always` também faz o `up -d` buscar a imagem nova. As migrations
pendentes rodam no boot.

### Watchtower (opcional)

O `docker-compose.yml` inclui um `watchtower` com `--label-enable`, que atualiza
apenas containers com o label `com.centurylinklabs.watchtower.enable=true`
(a cada 15 min). Se não quiser auto-update, remova o serviço e use os comandos
acima. Montar `/var/run/docker.sock` dá poder de root ao container — avalie o
risco no seu servidor.

### Stack do OMV (esta instalação)

- Pasta: `\\ORANGEPI3B\apps\compose\verde` (no Pi, confirme o caminho local).
- Arquivos: `verde.yml` + `verde.env` (padrão do plugin Compose do OMV).
- Porta: **3200**; dados em `apps/data/verde`.
- A imagem é `VERDE_IMAGE=ghcr.io/tiago-txt/verde:latest` no `verde.env`.
- O plugin pode regenerar o YAML; se isso acontecer, confira a linha `image:`.

### Variáveis de ambiente

| Variável         | Obrigatória | Descrição                                                                 |
| ---------------- | ----------- | ------------------------------------------------------------------------- |
| `SESSION_SECRET` | sim         | Segredo (≥ 32 caracteres) que assina o cookie de sessão. Trocar desloga todos. |
| `ADMIN_EMAIL`    | 1º boot     | E-mail do primeiro usuário (admin). Ignorado se já existir usuário.        |
| `ADMIN_PASSWORD` | 1º boot     | Senha do admin inicial (≥ 8 caracteres).                                   |
| `ADMIN_NAME`     | não         | Nome exibido do admin (padrão: Administrador).                            |
| `ALLOW_SIGNUP`   | não         | `true` habilita o cadastro público em `/cadastro` (padrão: `false`).      |
| `PORT`           | não         | Porta HTTP do app/container (padrão: 3000).                                |
| `TZ`             | não         | Fuso para “hoje”, faturas e recorrências (padrão: `America/Sao_Paulo`).    |
| `COOKIE_SECURE`  | não         | Força o cookie `Secure`. Em geral o app detecta HTTPS via `x-forwarded-proto`. |
| `DATABASE_PATH`  | não         | Caminho do SQLite. No Docker o compose fixa `/app/data/verde.db`.          |
| `VERDE_IMAGE`    | não         | Imagem de produção (default: `ghcr.io/tiago-txt/verde:latest`).            |
| `VERDE_DATA_DIR` | não         | Pasta de dados no host (default: `./data`).                                |
| `SEED_DEMO`      | não         | `true` popula dados de exemplo no primeiro boot (idempotente).             |
| `BACKUP_KEEP`    | não         | Quantos backups manter (padrão: 14).                                       |

> `ADMIN_EMAIL`/`ADMIN_PASSWORD` só são usados quando **não existe nenhum
> usuário**. Depois disso, o admin gerencia os usuários em
> **Configurações → Usuários**.

---

## HTTPS, PWA e acesso remoto

O PWA (instalável) exige **contexto seguro**: `https://` ou `localhost`. Para
usar no celular na rede local, coloque um reverse proxy com TLS na frente.

### Nginx Proxy Manager

1. Crie um *Proxy Host* apontando para `IP-DO-SERVIDOR:3000`.
2. Ative **Block Common Exploits** e **Websockets Support**.
3. Em **SSL**, peça um certificado Let's Encrypt e ative **Force SSL**.
4. Acesse `https://verde.seudominio.com` e instale o PWA.

### Caddy (alternativa)

```caddyfile
verde.seudominio.com {
    reverse_proxy 192.168.1.10:3000
}
```

### Tailscale (sem expor portas)

```bash
# no servidor, com Tailscale instalado
tailscale serve --bg https / http://127.0.0.1:3000
```

Acesse `https://nome-da-maquina.tailnet.ts.net` no celular. O Tailscale já
fornece TLS válido, então o PWA pode ser instalado.

### Instalar o PWA

- **Android/Chrome:** menu → “Instalar app” / “Adicionar à tela inicial”.
- **iOS/Safari:** compartilhar → “Adicionar à Tela de Início”.

O manifest e o service worker já estão ativos; o logout limpa caches e
storages locais.

---

## Backup e restore

O banco fica em `./data/verde.db` (WAL). Use o script com a API de backup do
SQLite — ele funciona com o app rodando e mantém os últimos `BACKUP_KEEP`
arquivos em `./data/backups`.

```bash
# dentro do container (recomendado), executando como o usuário do app
docker compose exec -u nextjs -T verde node scripts/backup.mjs
```

Cron do OMV (exemplo diário às 03:15):

```cron
15 3 * * * cd /srv/verde && docker compose exec -u nextjs -T verde node scripts/backup.mjs >> /var/log/verde-backup.log 2>&1
```

> Os backups ficam em `./data/backups`. Copie essa pasta periodicamente para
> outro disco/NAS — backup no mesmo volume não protege contra perda do volume.
> Mantenha o `./data` em disco local (ext4), não em SMB/NFS, para evitar
> problemas de lock do SQLite.

### Restore

```bash
docker compose stop verde

# guarde o banco atual antes de substituir
mv data/verde.db data/verde.db.antes
rm -f data/verde.db-wal data/verde.db-shm

cp data/backups/verde-AAAA-MM-DDTHH-MM-SS.db data/verde.db

docker compose start verde
docker compose logs -f verde
```

Para backup “frio” de tudo, pare o container e copie a pasta `./data` inteira.

### Restaurar um único usuário

O backup SQLite cobre **todos** os usuários/workspaces de uma vez — é o caminho
recomendado para desastre total. Para restaurar apenas uma pessoa:

1. Peça a ela (ou use um backup anterior) o JSON exportado em
   **Configurações → Dados → Exportar JSON**.
2. Crie/abra a conta dela e vá em **Configurações → Dados → Restaurar backup
   (JSON)**.
3. O arquivo é recriado **dentro do workspace dela**, com contas, cartões,
   categorias, tags, lançamentos, recorrências e orçamentos; os IDs são
   remapeados e nomes duplicados recebem sufixo.

O JSON não contém senhas nem segredos. Se o usuário foi excluído, o admin pode
criá-lo novamente em **Configurações → Usuários** antes de restaurar.

---

## Qualidade

```bash
npm run typecheck
npm test
npm run build
```

Testes atuais (294): formatação/parse de BRL, datas/meses, máscara e parsing
dd/MM/yyyy, grade do calendário, rótulos Hoje/Ontem/Amanhã, sessão assinada,
saldo atual/previsto e saldo do dia (transferências, não pagos e cartão),
geração de recorrências (mensal/semanal/anual, dia 31, bissexto, data fim e
idempotência), parcelamento (resto de centavos e soma), escopos de
edição/exclusão, parsing/validação dos filtros da URL, resumo mensal com e sem
filtros, resolução/proteção das categorias “Outros” e planejamento de ações em
lote. A migration 0002 (categorias de sistema + backfill) foi validada também
contra um banco simulando a etapa 2. Na etapa 4 entram os testes de fechamento
de fatura.

Testes de multiusuário (SQLite real em memória): dois workspaces cobrindo contas,
cartões, categorias, tags, lançamentos, recorrências, parcelas, orçamentos,
faturas, importação/desfazer lote, exportação, relatórios, dashboard, busca e
filtros; rejeição de IDs de outro workspace em vínculos; saldos/relatórios/
faturas/orçamentos imutáveis entre workspaces; “Outros” por workspace; usuário
inativo sem sessão; último admin protegido; `ALLOW_SIGNUP=false`; migration 0007
validada contra um banco da etapa anterior e idempotente; e uma varredura que
falha se houver query de domínio fora de `scopedDb`.

Ajustes de orçamentos/faturas cobertos por testes: competência de compras no
cartão (12/11 vence em dezembro, 15/12 na fatura seguinte e opção "nesta
fatura"), parcelas por fatura, despesa em conta pela data, deslocamento ±1,
ciclo excluído/fora da vigência, avisos e recálculo, fatura sem dupla contagem
(inclusive pagamento sem `fatura_chave` no FIFO), composição do rodapé somando
exatamente o previsto e linha de orçamento mantida com reserva zero no estouro e
no limite exato; ciclo passado visível; séries com
exceção “só este ciclo”, edição “este e os próximos”, exclusão da série e
restauração; conflito de categoria por ciclo; gasto em ciclo excluído não
consome; migration 0008 de `budget_versions`/`budget_cycle_exceptions` e
overrides; fatura visível após pagamento parcial/total; restante correto;
transferência vinculada oculta; desfazer pagamento; saldo/previsto sem dupla
contagem; pagamento em data diferente do vencimento.

Previsão de saldo coberta por testes: série sem eventos/reta, soma dos eventos,
salário e despesas no mesmo mês, parcelas 12x com recuperação por 13º, reserva/
liberação/transferência fora das causas de recuperação, sem recuperação, margem,
atrasados, recorrências virtuais sem duplicar, fatura restante/parcial/total,
reserva de orçamento e estouro, indicador sem evento, transferências anulando,
conta fora do escopo, estimativas ligadas/desligadas, simulação antes/depois,
parcela máxima segura, resumo mensal/virada de ano, consistência com saldo do dia,
Zod, cache e preferências isoladas por workspace, e rejeição de conta/cartão/
categoria de outro workspace.

Decisões de segurança já aplicadas:

- senha com **bcrypt** (custo 12), sem cadastro público por padrão;
- cookie de sessão `httpOnly`, `SameSite=Lax`, `Secure` quando HTTPS (detectado
  via `x-forwarded-proto` ou `COOKIE_SECURE=true`), assinado com HS256;
- sessão inclui `userId`, `workspaceId` e `role`; o usuário é reconferido no
  banco a cada request e **usuário inativo perde a sessão**;
- middleware protege todas as rotas (exceto login/cadastro/health) e toda query
  de domínio passa pela camada `scopedDb(workspaceId)`; um teste de varredura
  falha se alguém consultar tabela de domínio fora dela;
- operações por ID validam o workspace e respondem “não encontrado” para
  recursos de outro usuário;
- validação com **Zod** em toda entrada;
- queries parametrizadas via Drizzle (sem SQL concatenado);
- rate limit simples em memória no login (8 tentativas / 5 min por e-mail **e**
  por IP), com mensagem genérica;
- admin vê apenas metadados de usuários; nunca dados financeiros de outro
  workspace;
- preferências de interface (tema e sidebar) ficam no `localStorage`; a sidebar
  é namespaced por `userId` e o logout limpa tema, sidebar, `sessionStorage` e
  caches do service worker. As preferências da previsão (horizonte, margem,
  contas e estimativas) ficam no servidor por usuário em
  `forecast_preferences`.

---

## Roteiro

- [x] **Etapa 1** — scaffold, Docker, banco + migrations, auth, shell responsivo
- [x] **Etapa 2** — contas, categorias, tags e CRUD de lançamentos (recorrência e parcelas)
- [x] **Etapa 3** — tela de Lançamentos completa, calendário, filtros, painel, saldo do dia, lote e CSV
- [x] **Etapa 4** — cartões e faturas
- [x] **Etapa 5** — dashboard, relatórios e limite de gastos
- [x] **Etapa 6** — previsão de saldo (PWA, exportação/importação, backup,
  multiusuário e gestão de usuários já implementados)

Fora do escopo por enquanto: Open Finance, IA de categorização, multi-moeda,
investimentos com cotação e notificações push.
