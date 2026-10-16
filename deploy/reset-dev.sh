#!/usr/bin/env bash
# Wipes the LOCAL development database and recreates the demo data (deploy/seed-demo.mjs).
#
#   bash deploy/reset-dev.sh --yes
#
# DESTRUCTIVE: it removes the dev database volume (`docker compose down -v`) and everything in it. Use it only when the
# owner asks for a clean slate. It never touches the throwaway database of the runtime suite (compose project marvi-runtime).
set -euo pipefail

if [ "${1:-}" != "--yes" ]; then
  echo "This deletes the local development database and recreates the demo data."
  echo "Run again with --yes to go ahead:  bash deploy/reset-dev.sh --yes"
  exit 1
fi

cd "$(dirname "$0")/.."
compose=(docker compose -f deploy/docker-compose.yml)

"${compose[@]}" down -v
"${compose[@]}" up -d --build

echo "Waiting for the API..."
for _ in $(seq 1 60); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/health || true)" = "200" ]; then
    break
  fi
  sleep 2
done
if [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/health || true)" != "200" ]; then
  echo "The API did not become healthy in time." >&2
  exit 1
fi

node deploy/seed-demo.mjs
echo "SPA: http://localhost:4200   API: http://localhost:8080"
