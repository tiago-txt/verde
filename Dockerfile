# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# 1) Dependências (inclui toolchain para compilar better-sqlite3 no Alpine)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# 2) Build do Next.js (output standalone)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Next build em builders pequenos (ARM/QEMU) pode estourar o heap padrão.
ENV NODE_OPTIONS="--max-old-space-size=4096"
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# 3) Runtime enxuto, processo final sem privilégios
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat su-exec
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    HOME=/app

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Migrations são lidas do disco em runtime (instrumentation.ts).
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
# Backup roda via `docker compose exec -u nextjs verde node scripts/backup.mjs`.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p /app/data /app/.next/cache \
  && chown -R nextjs:nodejs /app/data /app/.next/cache

EXPOSE 3000

# O entrypoint ajusta o dono do bind mount (./data) e então executa como nextjs.
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
