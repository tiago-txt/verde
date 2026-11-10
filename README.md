# Verde

Finanças pessoais e familiares, em português do Brasil, com valores em **BRL** e
valores armazenados sempre em **centavos**. Interface responsiva (PWA no celular
e dashboard no computador), self-hosted em um único container Docker, com SQLite.

> **Status:** etapa 1 concluída — scaffold, Docker, banco com migrations, seed,
> autenticação e shell da aplicação. As telas de Contas, Cartões, Lançamentos,
> Relatórios e Limites estão com placeholders e serão implementadas nas próximas
> etapas (veja o [roteiro](#roteiro)).

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

## Estrutura

```
app/
  (app)/                 # área autenticada (layout com sidebar/bottom nav)
    page.tsx             # visão geral
    lancamentos/         # etapa 2/3
    contas/              # etapa 2
    cartoes/             # etapa 4
    relatorios/          # etapa 5
    limites/             # etapa 5
    configuracoes/       # perfil, tema, logout
  login/                 # login (fora do shell)
  api/health/            # healthcheck do Docker
  layout.tsx             # tema escuro padrão + metadados
  globals.css
components/
  ui/                    # Button, Input, Card, Dropdown, etc.
  app-shell.tsx          # sidebar desktop + bottom nav + FAB mobile
  auth/login-form.tsx
  ...
lib/
  db/
    schema.ts            # tabelas Drizzle
    init.ts              # migrations + seed idempotente
    index.ts             # conexão única por processo
    seed-data.ts         # categorias/tags padrão
  auth/
    jwt.ts               # assinatura/verificação (Edge-safe)
    session.ts           # cookie httpOnly
    current-user.ts      # requireUser()
  actions/auth.ts        # login/logout (Server Actions)
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

## Docker Compose (OpenMediaVault)

```bash
# no servidor, ex.: /srv/verde
cp .env.example .env
nano .env                    # SESSION_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, PORT, TZ
mkdir -p data

docker compose up -d --build
docker compose logs -f verde
```

Acesse `http://IP-DO-SERVIDOR:3000` (ou a porta definida em `PORT`).

O `docker-compose.yml` tem **um único serviço**, `restart: unless-stopped`,
healthcheck em `/api/health`, volume bind `./data:/app/data` e limites de log.
O entrypoint ajusta o dono do bind mount e executa o processo como usuário
`nextjs` (não-root).

> Esse fluxo exige o repositório (inclusive o `Dockerfile`) na pasta onde o
> build roda. No **plugin Compose do OMV** a pasta só contém o YAML, então o
> build falha com `failed to read dockerfile: open Dockerfile: no such file or
> directory`. Nesse caso use o build automático abaixo.

### Build automático (GitHub Actions → GHCR)

A imagem é construída no GitHub a cada push na `main` e publicada em
`ghcr.io/tiago-txt/verde:latest`. O servidor só faz `pull`: nenhum arquivo do
projeto precisa existir na pasta do stack do OMV.

1. O workflow já está em `.github/workflows/docker-publish.yml` (tags `latest`,
   `sha-<commit>` e `v*`).
2. Dê permissão de leitura ao servidor — escolha **uma** opção:
   - tornar o pacote público: GitHub → **Packages** → `verde` → *Package
     settings* → *Change visibility*; ou
   - autenticar no host (como root, para o plugin usar a mesma credencial):
     `docker login ghcr.io -u tiago-txt -p <PAT com read:packages>`.
3. No plugin Compose, crie o stack `verde` em `/apps/data/verde` usando o
   `docker-compose.prod.yml` deste repositório (aba *Files* → cole o conteúdo)
   e clique em **Up**.
   - Ajuste o `env_file` para o nome que o plugin usa (padrão `verde.env`).
   - Os dados ficam em `./data` relativo à pasta do stack
     (`/apps/data/verde/data`); para outro caminho, defina `VERDE_DATA_DIR`.
4. Atualização: o serviço `watchtower` do mesmo YAML verifica o registry a cada
   15 min e recria o container quando há digest novo. Sem ele, basta clicar em
   **Up** (o `pull_policy: always` garante que a imagem nova seja baixada).

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

## Atualizar

```bash
# sempre faça um backup antes
docker compose exec -u nextjs -T verde node scripts/backup.mjs

git pull
docker compose up -d --build
```

As migrations pendentes rodam no boot. Se algo falhar, o healthcheck fica
`unhealthy` e os logs mostram o erro:

```bash
docker compose ps
docker compose logs --tail=200 verde
```

---

## Qualidade

```bash
npm run typecheck
npm test
npm run build
```

Testes atuais (etapa 1): formatação/parse de BRL, utilitários de data/mês,
limites de fim de mês e assinatura/verificação do cookie de sessão.
Nas próximas etapas entram os testes de cálculo de saldo, geração de
recorrências, parcelamento e fechamento de fatura.

Decisões de segurança já aplicadas:

- senha com **bcrypt** (custo 12), sem cadastro público;
- cookie de sessão `httpOnly`, `SameSite=Lax`, `Secure` em produção, assinado
  com HS256;
- middleware protege todas as rotas (exceto login/health) e a sessão é
  reconferida no banco a cada request;
- validação com **Zod** em toda entrada;
- queries parametrizadas via Drizzle (sem SQL concatenado);
- rate limit simples em memória no login (8 tentativas / 5 min por e-mail).

---

## Roteiro

- [x] **Etapa 1** — scaffold, Docker, banco + migrations, auth, shell responsivo
- [ ] **Etapa 2** — contas, categorias e CRUD de lançamentos (recorrência e parcelas)
- [ ] **Etapa 3** — tela de Lançamentos completa (mês, dias, filtros, painel lateral)
- [ ] **Etapa 4** — cartões e faturas
- [ ] **Etapa 5** — dashboard, relatórios e limite de gastos
- [ ] **Etapa 6** — PWA, exportação/importação, backup e gestão de usuários

Fora do escopo por enquanto: Open Finance, IA de categorização, multi-moeda,
investimentos com cotação e notificações push.
