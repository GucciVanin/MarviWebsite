#!/usr/bin/env bash
# Rebuilds the compose stack on an EMPTY database, then runs the data/security runtime test against it.
# Usage (from the project root):  bash test/runtime/run.sh
set -u
cd "$(dirname "$0")/../.."

# A separate compose project (own containers, network and database volume), so `down -v` below can never delete
# the data of a stack you started yourself. api-security.mjs inherits this variable for its psql calls.
export COMPOSE_PROJECT_NAME=marvi-runtime

if curl -s -o /dev/null --max-time 2 http://localhost:8080/health; then
  echo "Port 8080 is already in use (is your own stack running?). Stop it first: docker compose -f deploy/docker-compose.yml down" >&2
  exit 2
fi

docker compose -f deploy/docker-compose.yml down -v >/dev/null 2>&1
docker compose -f deploy/docker-compose.yml up -d --build api postgres
for i in $(seq 1 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/health)" = "200" ] && break
  sleep 2
done
node test/runtime/api-security.mjs
status=$?
docker compose -f deploy/docker-compose.yml down >/dev/null 2>&1
exit $status
