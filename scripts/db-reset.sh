#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ "${SKYNET_CONFIRM_DB_RESET:-}" != "skynet" ]; then
  echo "拒绝执行：清库必须显式确认目标库。" >&2
  echo "请使用 SKYNET_CONFIRM_DB_RESET=skynet pnpm db:reset" >&2
  exit 1
fi

if [ ! -f .env.dev ]; then
  echo "拒绝执行：缺少 .env.dev。请先运行 cp .env.dev.example .env.dev" >&2
  exit 1
fi

COMPOSE=(docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.infra.dev.yml)

API_WAS_RUNNING=false
if "${COMPOSE[@]}" ps --services --filter status=running | grep -qx "api"; then
  API_WAS_RUNNING=true
  "${COMPOSE[@]}" stop api
fi

if "${COMPOSE[@]}" ps --services --filter status=running | grep -qx "redis"; then
  "${COMPOSE[@]}" exec -T redis redis-cli FLUSHDB >/dev/null
fi

pnpm exec dotenvx run -f .env.dev -- node apps/api/scripts/reset-and-seed-mongo.mjs

if [ "$API_WAS_RUNNING" = true ]; then
  "${COMPOSE[@]}" up -d --wait --wait-timeout 60 api
fi
