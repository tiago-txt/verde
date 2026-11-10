#!/bin/sh
set -e

# O volume ./data costuma chegar com dono root (bind mount no OMV).
# Ajustamos e executamos o app como usuário sem privilégios.
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/data
  chown -R nextjs:nodejs /app/data
  exec su-exec nextjs:nodejs "$@"
fi

exec "$@"
