#!/bin/bash
# Layout audit runner (MRV-8.1). From the project root:
#   bash test/layout/run.sh              audit the running dev stack (SPA on 4200, API on 8080); read-only, signs in with the seeded demo accounts
#   bash test/layout/run.sh --fixtures   self-test of the rules against test/layout/fixtures (needs no stack)
# Env: BASE_URL (default http://host.docker.internal:4200), WIDTHS, ONLY (regex on "group route"), OUT_FILE name inside test/layout/out/.
# The admin password is read from deploy/.env at run time and handed to the container through the environment; it is never printed or written.
set -euo pipefail
cd "$(dirname "$0")/../.."
IMAGE="mcr.microsoft.com/playwright:v1.49.1-jammy"   # pinned; keep in step with the playwright version below
PW_VERSION="1.49.1"
mkdir -p test/layout/out
envfile=deploy/.env
read_env() { [ -f "$envfile" ] && sed -n "s/^$1=//p" "$envfile" | head -n1 | tr -d '\r' || true; }
export ADMIN_EMAIL="${ADMIN_EMAIL:-$(read_env SEED_ADMIN_EMAIL)}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(read_env SEED_ADMIN_PASSWORD)}"
export BASE_URL="${BASE_URL:-http://host.docker.internal:4200}"
export WIDTHS="${WIDTHS:-}"; export ONLY="${ONLY:-}"
[ -n "${OUT_FILE:-}" ] && export OUT_FILE="/out/$OUT_FILE" || export OUT_FILE=""
args=""; [ "${1:-}" = "--fixtures" ] && args="--fixtures"
# Unset-or-empty variables must not reach the audit as empty strings.
envs=(-e ADMIN_EMAIL -e ADMIN_PASSWORD -e BASE_URL)
[ -n "$WIDTHS" ] && envs+=(-e WIDTHS); [ -n "$ONLY" ] && envs+=(-e ONLY); [ -n "$OUT_FILE" ] && envs+=(-e OUT_FILE)
MSYS_NO_PATHCONV=1 docker run --rm --ipc=host --add-host host.docker.internal:host-gateway "${envs[@]}" \
  -v "$(pwd -W 2>/dev/null || pwd)/test/layout:/src:ro" -v "$(pwd -W 2>/dev/null || pwd)/test/layout/out:/out" \
  "$IMAGE" bash -c "mkdir -p /work && cp -r /src/. /work/ && cd /work && rm -rf out && npm init -y >/dev/null && npm install --no-save --no-audit --no-fund playwright@$PW_VERSION >/dev/null 2>&1 && node audit.mjs $args"
