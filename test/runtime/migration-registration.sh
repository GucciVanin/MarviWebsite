#!/usr/bin/env bash
# MRV-9.4: proves, on a throwaway real Postgres, that the migration ClientRegistrationData makes every existing customer a Business account (account_type 0)
# with empty registration data, refuses a second account with the same CNPJ or the same CPF hash (while any number of accounts without one coexist),
# and that Down removes the columns again and Up works a second time.
# It never touches the dev stack or its volume: it starts its own container on port 55435 and removes it at the end.
# Usage (from the project root):  bash test/runtime/migration-registration.sh
set -u
cd "$(dirname "$0")/../.."

NAME=marvi-migration-registration
PORT=55435
PW=migration-check-only
CONN="Host=127.0.0.1;Port=$PORT;Database=marvi;Username=marvi;Password=$PW"
fail=0
check() { if [ "$2" = "$3" ]; then echo "PASS  $1"; else echo "FAIL  $1  -> expected '$3' got '$2'"; fail=1; fi; }
psqlc() { docker exec -i "$NAME" psql -U marvi -d marvi -Atq -c "$1"; }

docker rm -f "$NAME" >/dev/null 2>&1
docker run -d --name "$NAME" -e POSTGRES_DB=marvi -e POSTGRES_USER=marvi -e POSTGRES_PASSWORD="$PW" -p 127.0.0.1:"$PORT":5432 postgres:16 >/dev/null || exit 2
trap 'docker rm -f "$NAME" >/dev/null 2>&1' EXIT
for i in $(seq 1 30); do docker exec "$NAME" pg_isready -U marvi -d marvi >/dev/null 2>&1 && break; sleep 1; done
sleep 2

PREV=ClientAddresses
EF="dotnet ef database update --project src/Marvi.Infrastructure --startup-project src/Marvi.Api --connection"
$EF "$CONN" "$PREV" >/dev/null 2>&1 || { echo "FAIL  could not migrate to $PREV"; exit 2; }

# Three customers as they exist before this story: no registration columns at all.
psqlc "INSERT INTO client_accounts (id, user_id, created_at, company_name, status) VALUES
 ('00000000-0000-0000-0000-00000000000a', gen_random_uuid(), '2026-01-01Z', 'A', 1),
 ('00000000-0000-0000-0000-00000000000b', gen_random_uuid(), '2026-01-02Z', 'B', 0),
 ('00000000-0000-0000-0000-00000000000c', gen_random_uuid(), '2026-01-03Z', 'C', 2);" >/dev/null

$EF "$CONN" >/dev/null 2>&1 || { echo "FAIL  migration did not apply"; exit 2; }

check "every existing customer is a Business account" "$(psqlc "SELECT count(*) || '|' || count(*) FILTER (WHERE account_type = 0) FROM client_accounts")" "3|3"
check "no registration data was invented" "$(psqlc "SELECT count(*) FROM client_accounts WHERE cnpj IS NOT NULL OR cpf_protected IS NOT NULL OR cpf_hash IS NOT NULL OR birth_date IS NOT NULL OR legal_name IS NOT NULL OR phone IS NOT NULL OR state_registration_status IS NOT NULL")" "0"
check "the customers keep their status and their numbers" "$(psqlc "SELECT string_agg(company_name || ':' || status || ':' || number, ',' ORDER BY number) FROM client_accounts")" "A:1:1,B:0:2,C:2:3"
check "a CNPJ can be set on one account" "$(psqlc "WITH u AS (UPDATE client_accounts SET cnpj='11222333000181' WHERE company_name='A' RETURNING 1) SELECT count(*) FROM u")" "1"
check "the same CNPJ on a second account is refused by the database" "$(psqlc "UPDATE client_accounts SET cnpj='11222333000181' WHERE company_name='B'" 2>&1 | grep -c 'unique')" "1"
check "the same CPF hash on a second account is refused too" "$(psqlc "UPDATE client_accounts SET cpf_hash=repeat('a',64), account_type=1 WHERE company_name='B'" >/dev/null; psqlc "UPDATE client_accounts SET cpf_hash=repeat('a',64) WHERE company_name='C'" 2>&1 | grep -c 'unique')" "1"
check "several accounts without a CNPJ or CPF coexist (NULLs do not collide)" "$(psqlc "SELECT count(*) FROM client_accounts WHERE cnpj IS NULL")" "2"

check "the app_settings table (CPF hash-key canary) exists and is empty" "$(psqlc "SELECT count(*) FROM app_settings")" "0"

$EF "$CONN" "$PREV" >/dev/null 2>&1
check "Down: the registration columns are gone" "$(psqlc "SELECT count(*) FROM information_schema.columns WHERE table_name='client_accounts' AND column_name IN ('account_type','cnpj','cpf_protected','cpf_hash','birth_date','phone','legal_name')")" "0"
check "Down: the app_settings table is gone too" "$(psqlc "SELECT count(*) FROM pg_class WHERE relname='app_settings'")" "0"
check "Down: the customers are still there" "$(psqlc "SELECT count(*) FROM client_accounts")" "3"

$EF "$CONN" >/dev/null 2>&1
check "Up again: everyone is a Business account again" "$(psqlc "SELECT count(*) FILTER (WHERE account_type = 0) FROM client_accounts")" "3"
exit $fail
