#!/usr/bin/env bash
# MRV-9.3: proves, on a throwaway real Postgres, that the migration ClientAddresses copies the legacy free-text billing and shipping
# addresses into client_addresses (flagged needs_review), drops the old columns, keeps one billing and one default delivery address per
# customer (the unique indexes refuse a second), and that Down restores the text columns from the rows.
# It never touches the dev stack or its volume: it starts its own container on port 55434 and removes it at the end.
# Usage (from the project root):  bash test/runtime/migration-addresses.sh
set -u
cd "$(dirname "$0")/../.."

NAME=marvi-migration-addresses
PORT=55434
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

PREV=CustomerQuoteOrderNumbers
EF="dotnet ef database update --project src/Marvi.Infrastructure --startup-project src/Marvi.Api --connection"
$EF "$CONN" "$PREV" >/dev/null 2>&1 || { echo "FAIL  could not migrate to $PREV"; exit 2; }

# A: billing and three shipping lines (one blank); B: no billing text, one shipping line; C: billing, no shipping; D: nothing at all.
psqlc "INSERT INTO client_accounts (id, user_id, created_at, company_name, billing_address, shipping_addresses, status) VALUES
 ('00000000-0000-0000-0000-00000000000a', gen_random_uuid(), '2026-01-01Z', 'A', 'Rua A, 1, São Paulo, SP', ARRAY['Rua B, 2', '  ', 'Av. C, 3'], 0),
 ('00000000-0000-0000-0000-00000000000b', gen_random_uuid(), '2026-01-02Z', 'B', '', ARRAY['Rua D, 4'], 0),
 ('00000000-0000-0000-0000-00000000000c', gen_random_uuid(), '2026-01-03Z', 'C', 'Rua E, 5', '{}', 0),
 ('00000000-0000-0000-0000-00000000000d', gen_random_uuid(), '2026-01-04Z', 'D', '', '{}', 0);" >/dev/null

$EF "$CONN" >/dev/null 2>&1 || { echo "FAIL  migration did not apply"; exit 2; }

check "the old columns are gone" "$(psqlc "SELECT count(*) FROM information_schema.columns WHERE table_name='client_accounts' AND column_name IN ('billing_address','shipping_addresses')")" "0"
check "A: the billing text is one Both address, billing and default, needing review" "$(psqlc "SELECT label||'|'||kind||'|'||street||'|'||is_billing||'|'||is_default||'|'||needs_review||'|'||country FROM client_addresses WHERE client_account_id='00000000-0000-0000-0000-00000000000a' AND is_billing")" "Endereço principal|2|Rua A, 1, São Paulo, SP|true|true|true|BR"
check "A: each non-blank shipping line is a Delivery address (blank dropped), not default" "$(psqlc "SELECT string_agg(label||'='||street||':'||kind||':'||is_default, ',' ORDER BY label) FROM client_addresses WHERE client_account_id='00000000-0000-0000-0000-00000000000a' AND NOT is_billing")" "Endereço de entrega 1=Rua B, 2:1:false,Endereço de entrega 3=Av. C, 3:1:false"
check "B: no billing row; the first shipping line becomes the default delivery address" "$(psqlc "SELECT count(*) FILTER (WHERE is_billing) || '|' || count(*) FILTER (WHERE is_default) || '|' || count(*) FROM client_addresses WHERE client_account_id='00000000-0000-0000-0000-00000000000b'")" "0|1|1"
check "C: billing only" "$(psqlc "SELECT count(*) || '|' || bool_and(is_billing AND is_default) FROM client_addresses WHERE client_account_id='00000000-0000-0000-0000-00000000000c'")" "1|true"
check "D: no address rows" "$(psqlc "SELECT count(*) FROM client_addresses WHERE client_account_id='00000000-0000-0000-0000-00000000000d'")" "0"
check "every migrated row has a key and all need review" "$(psqlc "SELECT count(*) || '|' || count(DISTINCT key) || '|' || bool_and(needs_review) FROM client_addresses")" "5|5|true"
check "a second billing address for one customer is refused by the database" "$(psqlc "INSERT INTO client_addresses (id, key, client_account_id, label, kind, postal_code, street, number, district, city, state, country, is_billing, is_default, needs_review, created_at) VALUES (gen_random_uuid(), gen_random_uuid(), '00000000-0000-0000-0000-00000000000a', 'x', 0, '01001000', 'x', '1', 'x', 'x', 'SP', 'BR', true, false, false, now())" 2>&1 | grep -c 'unique')" "1"
check "a second default delivery address is refused too" "$(psqlc "INSERT INTO client_addresses (id, key, client_account_id, label, kind, postal_code, street, number, district, city, state, country, is_billing, is_default, needs_review, created_at) VALUES (gen_random_uuid(), gen_random_uuid(), '00000000-0000-0000-0000-00000000000a', 'x', 1, '01001000', 'x', '1', 'x', 'x', 'SP', 'BR', false, true, false, now())" 2>&1 | grep -c 'unique')" "1"

# A structured row (as the API would write it) must come back as one readable line.
psqlc "UPDATE client_addresses SET needs_review=false, postal_code='01001000', street='Praça da Sé', number='10', complement='sala 2', district='Sé', city='São Paulo', state='SP' WHERE client_account_id='00000000-0000-0000-0000-00000000000c'" >/dev/null

$EF "$CONN" "$PREV" >/dev/null 2>&1
check "Down: the table is gone, the columns are back" "$(psqlc "SELECT (SELECT count(*) FROM pg_class WHERE relname='client_addresses') || '|' || (SELECT count(*) FROM information_schema.columns WHERE table_name='client_accounts' AND column_name IN ('billing_address','shipping_addresses'))")" "0|2"
check "Down: A's billing text and shipping lines are restored" "$(psqlc "SELECT billing_address || '|' || array_to_string(shipping_addresses, ';') FROM client_accounts WHERE company_name='A'")" "Rua A, 1, São Paulo, SP|Rua B, 2;Av. C, 3"
check "Down: B's only line comes back as shipping, billing empty" "$(psqlc "SELECT billing_address || '|' || array_to_string(shipping_addresses, ';') FROM client_accounts WHERE company_name='B'")" "|Rua D, 4"
check "Down: a structured address is written out in one line" "$(psqlc "SELECT billing_address FROM client_accounts WHERE company_name='C'")" "Praça da Sé, 10 - sala 2, Sé, São Paulo/SP, CEP 01001-000"
check "Down: D stays empty" "$(psqlc "SELECT billing_address || '|' || cardinality(shipping_addresses) FROM client_accounts WHERE company_name='D'")" "|0"

# Up again after Down works (no leftover objects).
$EF "$CONN" >/dev/null 2>&1
check "Up again: the rows are rebuilt" "$(psqlc "SELECT count(*) FROM client_addresses")" "5"
exit $fail
