#!/bin/bash
set -euo pipefail

HASHES_DIR="/app/.build-hashes"
mkdir -p "$HASHES_DIR"

# --- Install dependencies when the lockfile changes ---
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
  pnpm install --frozen-lockfile
  echo "$LOCK_HASH" > "$HASHES_DIR/.lock-hash"
fi

echo "[START] Starting Web server..."
exec "$@"
