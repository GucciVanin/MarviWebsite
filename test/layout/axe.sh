#!/bin/bash
# axe-core pass (MRV-8.5). From the project root:  bash test/layout/axe.sh
# Env: BASE_URL (default http://host.docker.internal:4200), ONLY (regex on "role route"), WIDTHS (default 375,1280).
# Needs the dev stack up. Read-only. The admin password comes from deploy/.env or the environment and is never printed.
set -euo pipefail
cd "$(dirname "$0")/../.."
IMAGE="mcr.microsoft.com/playwright:v1.49.1-jammy"   # keep in step with run.sh
PW_VERSION="1.49.1"; AXE_VERSION="4.10.2"
envfile=deploy/.env
read_env() { [ -f "$envfile" ] && sed -n "s/^$1=//p" "$envfile" | head -n1 | tr -d '\r' || true; }
export ADMIN_EMAIL="${ADMIN_EMAIL:-$(read_env SEED_ADMIN_EMAIL)}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(read_env SEED_ADMIN_PASSWORD)}"
export BASE_URL="${BASE_URL:-http://host.docker.internal:4200}"
export WIDTHS="${WIDTHS:-}"; export ONLY="${ONLY:-}"
envs=(-e ADMIN_EMAIL -e ADMIN_PASSWORD -e BASE_URL)
[ -n "$WIDTHS" ] && envs+=(-e WIDTHS); [ -n "$ONLY" ] && envs+=(-e ONLY)
MSYS_NO_PATHCONV=1 docker run --rm --ipc=host --add-host host.docker.internal:host-gateway "${envs[@]}" \
  -v "$(pwd -W 2>/dev/null || pwd)/test/layout:/src:ro" \
  "$IMAGE" bash -c "mkdir -p /work && cp /src/axe.mjs /work/ && cd /work && npm init -y >/dev/null && npm install --no-save --no-audit --no-fund playwright@$PW_VERSION axe-core@$AXE_VERSION >/dev/null 2>&1 && node axe.mjs"
