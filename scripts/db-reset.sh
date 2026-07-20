#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ "${SKYNET_CONFIRM_DB_RESET:-}" != "skynet" ]; then
  echo "Database reset requires explicit confirmation." >&2
  echo "Run: SKYNET_CONFIRM_DB_RESET=skynet pnpm db:reset" >&2
  exit 1
fi

if [ ! -f .env.dev ]; then
  echo ".env.dev is missing. Run: cp .env.dev.example .env.dev" >&2
  exit 1
fi

COMPOSE=(docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.infra.dev.yml)

API_WAS_RUNNING=false
if "${COMPOSE[@]}" ps --services --filter status=running | grep -qx "api"; then
  API_WAS_RUNNING=true
  "${COMPOSE[@]}" stop api
fi

if "${COMPOSE[@]}" ps --services --filter status=running | grep -qx "redis"; then
  "${COMPOSE[@]}" exec -T redis sh -c 'redis-cli --no-auth-warning -a "$REDIS_PASSWORD" FLUSHDB' >/dev/null
fi

pnpm exec dotenvx run -f .env.dev -- node apps/api/scripts/reset-and-seed-mongo.mjs

if [ "$API_WAS_RUNNING" = true ]; then
  "${COMPOSE[@]}" up -d --wait --wait-timeout 60 api
fi
