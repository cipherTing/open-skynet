#!/bin/bash
set -euo pipefail

HASHES_DIR="/app/.build-hashes"
mkdir -p "$HASHES_DIR"

# --- 1. Install dependencies when the lockfile changes ---
if [ ! -f /app/pnpm-lock.yaml ]; then
  echo "❌ FATAL: pnpm-lock.yaml not found" >&2
  exit 1
fi
LOCK_HASH=$(sha256sum /app/pnpm-lock.yaml | cut -d' ' -f1)
CACHED_LOCK=$(cat "$HASHES_DIR/.lock-hash" 2>/dev/null || echo "")

if [ "$LOCK_HASH" = "$CACHED_LOCK" ] && [ -d /app/node_modules/.pnpm ]; then
  echo "[OK] Dependencies up to date, skipping install"
else
  echo "[INSTALL] Installing dependencies..."
  if ! pnpm --filter @skynet/api... install --frozen-lockfile; then
    echo "❌ FATAL: pnpm install --frozen-lockfile failed." >&2
    echo "   This usually means pnpm-lock.yaml is out of date with package.json." >&2
    echo "   Please run 'pnpm install' on the host machine to update the lockfile, then restart the container." >&2
    exit 1
  fi
  echo "$LOCK_HASH" > "$HASHES_DIR/.lock-hash"
fi

# --- 2. Wait for MongoDB ---
echo "[WAIT] Waiting for MongoDB..."
MONGO_RETRIES=0
MONGO_MAX_RETRIES=30
until node -e "const net=require('net');const c=net.connect(27017,'mongo');c.on('connect',()=>{c.end();process.exit(0)});c.on('error',()=>process.exit(1))" 2>/dev/null; do
  MONGO_RETRIES=$((MONGO_RETRIES + 1))
  if [ "$MONGO_RETRIES" -ge "$MONGO_MAX_RETRIES" ]; then
    echo "❌ FATAL: MongoDB not ready after ${MONGO_MAX_RETRIES}s" >&2
    exit 1
  fi
  sleep 1
done
echo "[OK] MongoDB is ready"

# --- 3. Wait for Redis ---
echo "[WAIT] Waiting for Redis..."
REDIS_RETRIES=0
REDIS_MAX_RETRIES=15
until node -e "const net=require('net');const c=net.connect(6379,'redis');c.on('connect',()=>{c.end();process.exit(0)});c.on('error',()=>process.exit(1))" 2>/dev/null; do
  REDIS_RETRIES=$((REDIS_RETRIES + 1))
  if [ "$REDIS_RETRIES" -ge "$REDIS_MAX_RETRIES" ]; then
    echo "❌ FATAL: Redis not ready after ${REDIS_MAX_RETRIES}s" >&2
    exit 1
  fi
  sleep 1
done
echo "[OK] Redis is ready"

echo "[START] Starting API server..."
exec "$@"
