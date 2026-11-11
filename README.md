# Verde

Finanças pessoais e familiares, em português do Brasil, com valores em **BRL** e
valores armazenados sempre em **centavos**. Interface responsiva (PWA no celular
e dashboard no computador), self-hosted em um único container Docker, com SQLite.

> **Status:** etapas 1–5 concluídas — autenticação, contas, categorias/tags,
> lançamentos completos, recorrência/parcelamento, orçamentos com ciclo,
> cartões/faturas, dashboard, relatórios, exportação/importação e PWA. A previsão
> de saldo entra na Etapa 6.

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
  provisão/sobra no previsto, sem alterar o realizado.
- **Cartões e faturas** (`/cartoes`): limite, fechamento, vencimento, fatura
  calculada por ciclo, compras/estornos, parcelas, limite usado/disponível e
  pagamento de fatura por transferência (parcial ou total, com desfazer).
- **Performance**: lista paginada por dias visíveis (`dias` na URL), saldo do dia
  calculado por uma query agregada; faturas e orçamentos agregados em uma única
  consulta por página, com índices por cartão/data e fatura.
- **Visão geral** (`/`): saldo operacional e investimentos, faturas em aberto,
  receitas × despesas com variação, donut por categoria, evolução de 6/12 meses,
  próximos 15 dias (contas e faturas), cartões e orçamentos do ciclo.
- **Relatórios** (`/relatorios`): por categoria (com subcategorias e variação),
  por mês (barras empilhadas e tabela) e por conta/cartão (com faturas), filtros
  de período/tipo/origem/categoria/tag/pago e exportação CSV por aba.
- **Dados** (`/configuracoes/dados`): backup JSON completo, CSV de lançamentos
  por intervalo e importação de CSV com mapeamento, pré-visualização,
  duplicados, criação opcional de contas/categorias e desfazer do último lote.
- **PWA**: manifest, ícones 192/512/maskable, atalhos iOS, service worker com
  cache apenas de assets e página offline; nova versão avisa e atualiza sob
  demanda, sem cachear respostas autenticadas ou APIs.
- **Seed demo opcional** (`SEED_DEMO=true`): 3 meses de contas, recorrências,
  parcelas, transferências, 2 cartões com faturas e um pagamento de fatura.

### Regras de fatura de cartão

- A fatura é **calculada**, não gravada. Ela é identificada por `cartao_id` +
  `YYYY-MM` do **vencimento**.
- O ciclo começa no `dia_fechamento` e termina no dia anterior ao fechamento do
  mês seguinte.
- **Compra feita no dia do fechamento entra na fatura seguinte.**
- O vencimento é o primeiro `dia_vencimento` posterior ao fechamento; se
  `dia_vencimento <= dia_fechamento`, ele cai no mês seguinte ao fechamento.
- Compras no cartão não movimentam a conta. O pagamento é uma transferência da
  conta para o cartão, com vínculo à fatura (`fatura_chave`). O valor pago reduz
  a conta e a fatura; o restante aparece como linha virtual de fatura no previsto.

Ainda são placeholders: previsão de saldo (etapa 6).

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
    init.ts              # migrations + seed idempotente
    index.ts             # conexão única por processo
    seed-data.ts         # categorias/tags padrão
    seed-demo.ts         # dados de exemplo (SEED_DEMO=true)
    queries/             # leituras (saldos, filtros, saldo do dia, detalhe)
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
| `PORT`           | não         | Porta HTTP do app/container (padrão: 3000).                                |
| `TZ`             | não         | Fuso para “hoje”, faturas e recorrências (padrão: `America/Sao_Paulo`).    |
| `COOKIE_SECURE`  | não         | Força o cookie `Secure`. Em geral o app detecta HTTPS via `x-forwarded-proto`. |
| `DATABASE_PATH`  | não         | Caminho do SQLite. No Docker o compose fixa `/app/data/verde.db`.          |
| `VERDE_IMAGE`    | não         | Imagem de produção (default: `ghcr.io/tiago-txt/verde:latest`).            |
| `VERDE_DATA_DIR` | não         | Pasta de dados no host (default: `./data`).                                |
| `SEED_DEMO`      | não         | `true` popula dados de exemplo no primeiro boot (idempotente).             |
| `BACKUP_KEEP`    | não         | Quantos backups manter (padrão: 14).                                       |

> `ADMIN_EMAIL`/`ADMIN_PASSWORD` só são usados quando **não existe nenhum
> usuário**. Depois disso, o admin gerencia a família pela interface (etapa 6).

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

O manifest e o service worker entram na etapa 6; até lá o app funciona
normalmente no navegador.

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

---

## Qualidade

```bash
npm run typecheck
npm test
npm run build
```

Testes atuais (102): formatação/parse de BRL, datas/meses, máscara e parsing
dd/MM/yyyy, grade do calendário, rótulos Hoje/Ontem/Amanhã, sessão assinada,
saldo atual/previsto e saldo do dia (transferências, não pagos e cartão),
geração de recorrências (mensal/semanal/anual, dia 31, bissexto, data fim e
idempotência), parcelamento (resto de centavos e soma), escopos de
edição/exclusão, parsing/validação dos filtros da URL, resumo mensal com e sem
filtros, resolução/proteção das categorias “Outros” e planejamento de ações em
lote. A migration 0002 (categorias de sistema + backfill) foi validada também
contra um banco simulando a etapa 2. Na etapa 4 entram os testes de fechamento
de fatura.

Decisões de segurança já aplicadas:

- senha com **bcrypt** (custo 12), sem cadastro público;
- cookie de sessão `httpOnly`, `SameSite=Lax`, `Secure` quando HTTPS (detectado
  via `x-forwarded-proto` ou `COOKIE_SECURE=true`), assinado com HS256;
- middleware protege todas as rotas (exceto login/health) e a sessão é
  reconferida no banco a cada request;
- validação com **Zod** em toda entrada;
- queries parametrizadas via Drizzle (sem SQL concatenado);
- rate limit simples em memória no login (8 tentativas / 5 min por e-mail).

---

## Roteiro

- [x] **Etapa 1** — scaffold, Docker, banco + migrations, auth, shell responsivo
- [x] **Etapa 2** — contas, categorias, tags e CRUD de lançamentos (recorrência e parcelas)
- [x] **Etapa 3** — tela de Lançamentos completa, calendário, filtros, painel, saldo do dia, lote e CSV
- [ ] **Etapa 4** — cartões e faturas
- [ ] **Etapa 5** — dashboard, relatórios e limite de gastos
- [ ] **Etapa 6** — PWA, exportação/importação, backup e gestão de usuários

Fora do escopo por enquanto: Open Finance, IA de categorização, multi-moeda,
investimentos com cotação e notificações push.
