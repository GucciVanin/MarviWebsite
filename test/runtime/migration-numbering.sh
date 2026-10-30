#!/usr/bin/env bash
# MRV-9.1: proves, on a throwaway real Postgres, that the migration CustomerQuoteOrderNumbers numbers the rows that already
# exist by creation time (then id), leaves the sequences ready for the next insert, and can be rolled back.
# It never touches the dev stack or its volume: it starts its own container on port 55432 and removes it at the end.
# Usage (from the project root):  bash test/runtime/migration-numbering.sh
set -u
cd "$(dirname "$0")/../.."

NAME=marvi-migration-check
PORT=55432
PW=migration-check-only
CONN="Host=localhost;Port=$PORT;Database=marvi;Username=marvi;Password=$PW"
fail=0
check() { if [ "$2" = "$3" ]; then echo "PASS  $1"; else echo "FAIL  $1  -> expected '$3' got '$2'"; fail=1; fi; }
psqlc() { docker exec -i "$NAME" psql -U marvi -d marvi -Atq -c "$1"; }

docker rm -f "$NAME" >/dev/null 2>&1
docker run -d --name "$NAME" -e POSTGRES_DB=marvi -e POSTGRES_USER=marvi -e POSTGRES_PASSWORD="$PW" -p "$PORT":5432 postgres:16 >/dev/null || exit 2
trap 'docker rm -f "$NAME" >/dev/null 2>&1' EXIT
for i in $(seq 1 30); do docker exec "$NAME" pg_isready -U marvi -d marvi >/dev/null 2>&1 && break; sleep 1; done
sleep 2

PREV=ContactMessages
EF="dotnet ef database update --project src/Marvi.Infrastructure --startup-project src/Marvi.Api --connection"
$EF "$CONN" "$PREV" >/dev/null 2>&1 || { echo "FAIL  could not migrate to $PREV"; exit 2; }

# Three customers (registered out of id order), two quotes and two orders, inserted with deliberately shuffled times.
psqlc "INSERT INTO client_accounts (id, user_id, created_at, company_name, billing_address, shipping_addresses, status)
VALUES ('00000000-0000-0000-0000-00000000000c', gen_random_uuid(), '2026-03-01Z', 'C', '', '{}', 0),
       ('00000000-0000-0000-0000-00000000000a', gen_random_uuid(), '2026-01-01Z', 'A', '', '{}', 0),
       ('00000000-0000-0000-0000-00000000000b', gen_random_uuid(), '2026-01-01Z', 'B', '', '{}', 0);" >/dev/null
psqlc "INSERT INTO quotes (id, client_account_id, status, created_at) VALUES
       ('00000000-0000-0000-0000-000000000f02', '00000000-0000-0000-0000-00000000000a', 1, '2026-05-02Z'),
       ('00000000-0000-0000-0000-000000000f01', '00000000-0000-0000-0000-00000000000a', 1, '2026-05-01Z');" >/dev/null
psqlc "INSERT INTO orders (id, client_account_id, status, delivery_address, placed_at, total_amount) VALUES
       ('00000000-0000-0000-0000-000000000e02', '00000000-0000-0000-0000-00000000000c', 0, 'x', '2026-06-02Z', 1),
       ('00000000-0000-0000-0000-000000000e01', '00000000-0000-0000-0000-00000000000c', 0, 'x', '2026-06-01Z', 1);" >/dev/null

$EF "$CONN" >/dev/null 2>&1 || { echo "FAIL  migration did not apply"; exit 2; }

check "existing customers are numbered by created_at, then id (A=1, B=2, C=3)" "$(psqlc "SELECT string_agg(company_name || number, ',' ORDER BY number) FROM client_accounts")" "A1,B2,C3"
check "existing quotes are numbered by created_at, then id" "$(psqlc "SELECT string_agg(right(id::text, 3) || ':' || number, ',' ORDER BY number) FROM quotes")" "f01:1,f02:2"
check "existing orders are numbered by placed_at, then id" "$(psqlc "SELECT string_agg(right(id::text, 3) || ':' || number, ',' ORDER BY number) FROM orders")" "e01:1,e02:2"
psqlc "INSERT INTO client_accounts (id, user_id, created_at, company_name, billing_address, shipping_addresses, status)
VALUES (gen_random_uuid(), gen_random_uuid(), now(), 'D', '', '{}', 0);" >/dev/null
check "the next customer continues after the last number (4)" "$(psqlc "SELECT number FROM client_accounts WHERE company_name='D'")" "4"
check "the next quote and order continue too (3 and 3)" "$(psqlc "INSERT INTO quotes (id, client_account_id, status, created_at) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000000a', 1, now()) RETURNING number")|$(psqlc "INSERT INTO orders (id, client_account_id, status, delivery_address, placed_at, total_amount) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-00000000000c', 0, 'x', now(), 1) RETURNING number")" "3|3"
check "the number is unique (a duplicate is refused by the database)" "$(psqlc "UPDATE client_accounts SET number = 1 WHERE company_name='D'" 2>&1 | grep -c 'unique')" "1"

$EF "$CONN" "$PREV" >/dev/null 2>&1
check "Down removes the columns and the sequences" "$(psqlc "SELECT (SELECT count(*) FROM information_schema.columns WHERE column_name='number' AND table_name IN ('client_accounts','quotes','orders')) + (SELECT count(*) FROM pg_class WHERE relname IN ('client_number_seq','quote_number_seq','order_number_seq'))")" "0"

# A table with no rows: the sequence must still start at 1.
psqlc "TRUNCATE orders, quotes, client_accounts CASCADE" >/dev/null
$EF "$CONN" >/dev/null 2>&1
check "an empty database starts numbering at 1" "$(psqlc "INSERT INTO client_accounts (id, user_id, created_at, company_name, billing_address, shipping_addresses, status) VALUES (gen_random_uuid(), gen_random_uuid(), now(), 'E', '', '{}', 0) RETURNING number")" "1"
exit $fail
