#!/usr/bin/env bash
# MRV-9.6: proves, on a throwaway real Postgres, that the migration DeliveryAddressSnapshot adds the snapshot columns and the nullable
# delivery_address_id to quotes and orders without touching legacy rows (an order keeps its free text in delivery_address, a quote has no
# snapshot), that deleting the customer's address clears the link (ON DELETE SET NULL) but leaves the copied fields as they were, and that
# Down removes the columns again (the legacy text stays) and Up works a second time.
# It never touches the dev stack or its volume: it starts its own container on port 55436 and removes it at the end.
# Usage (from the project root):  bash test/runtime/migration-delivery.sh
set -u
cd "$(dirname "$0")/../.."

NAME=marvi-migration-delivery
PORT=55436
PW=migration-check-only
CONN="Host=127.0.0.1;Port=$PORT;Database=marvi;Username=marvi;Password=$PW"
fail=0
check() { if [ "$2" = "$3" ]; then echo "PASS  $1"; else echo "FAIL  $1  -> expected '$3' got '$2'"; fail=1; fi; }
psqlc() { docker exec -i "$NAME" psql -U marvi -d marvi -Atq -c "$1"; }

docker rm -f "$NAME" >/dev/null 2>&1
trap 'docker rm -f "$NAME" >/dev/null 2>&1' EXIT   # set before the container exists, so an interrupted start cannot leave it behind
docker run -d --name "$NAME" -e POSTGRES_DB=marvi -e POSTGRES_USER=marvi -e POSTGRES_PASSWORD="$PW" -p 127.0.0.1:"$PORT":5432 postgres:16 >/dev/null || exit 2
for i in $(seq 1 30); do docker exec "$NAME" pg_isready -U marvi -d marvi >/dev/null 2>&1 && break; sleep 1; done
sleep 2

PREV=CpfKeyFingerprint
EF="dotnet ef database update --project src/Marvi.Infrastructure --startup-project src/Marvi.Api --connection"
$EF "$CONN" "$PREV" >/dev/null 2>&1 || { echo "FAIL  could not migrate to $PREV"; exit 2; }

A=00000000-0000-0000-0000-00000000000a
# One customer with an address, one old quote, and two old orders: one from an accepted quote... (no quote needed), one with a free-text address.
psqlc "INSERT INTO client_accounts (id, user_id, created_at, company_name, status) VALUES ('$A', gen_random_uuid(), '2026-01-01Z', 'A', 1);" >/dev/null
psqlc "INSERT INTO client_addresses (id, key, client_account_id, label, kind, postal_code, street, number, district, city, state, country, is_billing, is_default, needs_review, created_at)
       VALUES ('00000000-0000-0000-0000-0000000000a1', gen_random_uuid(), '$A', 'Matriz', 2, '01001000', 'Praça da Sé', '10', 'Sé', 'São Paulo', 'SP', 'BR', true, true, false, now());" >/dev/null
psqlc "INSERT INTO quotes (id, client_account_id, status, created_at) VALUES ('00000000-0000-0000-0000-0000000000b1', '$A', 1, '2026-02-01Z');" >/dev/null
psqlc "INSERT INTO orders (id, client_account_id, status, delivery_address, placed_at, total_amount) VALUES
       ('00000000-0000-0000-0000-0000000000c1', '$A', 0, 'Rua Antiga, 5, Campinas', '2026-02-02Z', 10),
       ('00000000-0000-0000-0000-0000000000c2', '$A', 0, '', '2026-02-03Z', 20),
       ('00000000-0000-0000-0000-0000000000c3', '$A', 0, repeat('x', 600), '2026-02-04Z', 30);" >/dev/null
# The follow-up migration OrderDeliveryAddressMaxLength narrows the text column to 500: a legacy text longer than that is cut, so what must stay is left(text, 500).
BEFORE_ORDERS="$(psqlc "SELECT string_agg(number || ':' || left(delivery_address, 500), ',' ORDER BY number) FROM orders")"

$EF "$CONN" >/dev/null 2>&1 || { echo "FAIL  migration did not apply"; exit 2; }

COLS="('delivery_address_id','delivery_address_label','delivery_address_street','delivery_address_number','delivery_address_complement','delivery_address_district','delivery_address_city','delivery_address_state','delivery_address_postal_code','delivery_address_notes')"
check "quotes and orders both have the ten new columns" "$(psqlc "SELECT count(*) FROM information_schema.columns WHERE table_name IN ('quotes','orders') AND column_name IN $COLS")" "20"
check "every new column is nullable" "$(psqlc "SELECT count(*) FROM information_schema.columns WHERE table_name IN ('quotes','orders') AND column_name IN $COLS AND is_nullable='NO'")" "0"
check "the legacy quote has no snapshot" "$(psqlc "SELECT count(*) FROM quotes WHERE delivery_address_id IS NOT NULL OR delivery_address_label IS NOT NULL OR delivery_address_street IS NOT NULL")" "0"
check "the legacy orders have no snapshot and keep their text (the empty text too)" "$(psqlc "SELECT count(*) FROM orders WHERE delivery_address_id IS NOT NULL OR delivery_address_label IS NOT NULL")|$(psqlc "SELECT string_agg(number || ':' || delivery_address, ',' ORDER BY number) FROM orders")" "0|$BEFORE_ORDERS"
check "the delivery_address text column now has a limit of 500 and a legacy text of 600 characters was cut to it" "$(psqlc "SELECT character_maximum_length FROM information_schema.columns WHERE table_name='orders' AND column_name='delivery_address'")|$(psqlc "SELECT max(length(delivery_address)) FROM orders")" "500|500"
check "the old delivery_address text column is still there and not null" "$(psqlc "SELECT is_nullable FROM information_schema.columns WHERE table_name='orders' AND column_name='delivery_address'")" "NO"
check "the link is a foreign key with ON DELETE SET NULL on both tables" "$(psqlc "SELECT count(*) FROM information_schema.referential_constraints WHERE constraint_name IN ('fk_quotes_client_addresses_delivery_address_id','fk_orders_client_addresses_delivery_address_id') AND delete_rule='SET NULL'")" "2"

# A quote and an order that copied the address, then the address is removed: the link clears, the copy stays.
psqlc "UPDATE quotes SET delivery_address_id='00000000-0000-0000-0000-0000000000a1', delivery_address_label='Matriz', delivery_address_street='Praça da Sé', delivery_address_number='10', delivery_address_district='Sé', delivery_address_city='São Paulo', delivery_address_state='SP', delivery_address_postal_code='01001000'" >/dev/null
psqlc "UPDATE orders SET delivery_address_id='00000000-0000-0000-0000-0000000000a1', delivery_address_label='Matriz', delivery_address_street='Praça da Sé' WHERE number = (SELECT min(number) FROM orders)" >/dev/null
check "a link to a customer address that does not exist is refused" "$(psqlc "UPDATE quotes SET delivery_address_id=gen_random_uuid()" 2>&1 | grep -c 'foreign key')" "1"
psqlc "DELETE FROM client_addresses WHERE id='00000000-0000-0000-0000-0000000000a1'" >/dev/null
check "removing the address clears the link on the quote and the order" "$(psqlc "SELECT (SELECT count(*) FROM quotes WHERE delivery_address_id IS NOT NULL) + (SELECT count(*) FROM orders WHERE delivery_address_id IS NOT NULL)")" "0"
check "...and leaves the copied fields as they were" "$(psqlc "SELECT (SELECT delivery_address_label || '|' || delivery_address_street || '|' || delivery_address_postal_code FROM quotes) || '|' || (SELECT count(*) FROM orders WHERE delivery_address_street = 'Praça da Sé')")" "Matriz|Praça da Sé|01001000|1"

$EF "$CONN" DeliveryAddressSnapshot >/dev/null 2>&1
check "Down of the follow-up only: the text column has no limit again and the snapshot columns stay" "$(psqlc "SELECT data_type FROM information_schema.columns WHERE table_name='orders' AND column_name='delivery_address'")|$(psqlc "SELECT count(*) FROM information_schema.columns WHERE table_name IN ('quotes','orders') AND column_name IN $COLS")" "text|20"
$EF "$CONN" "$PREV" >/dev/null 2>&1
check "Down: the ten columns are gone from both tables" "$(psqlc "SELECT count(*) FROM information_schema.columns WHERE table_name IN ('quotes','orders') AND column_name IN $COLS")" "0"
check "Down: the legacy order text is untouched" "$(psqlc "SELECT string_agg(number || ':' || delivery_address, ',' ORDER BY number) FROM orders")" "$BEFORE_ORDERS"
check "Down: the quote and the customer are still there" "$(psqlc "SELECT (SELECT count(*) FROM quotes) || '|' || (SELECT count(*) FROM client_accounts)")" "1|1"

$EF "$CONN" >/dev/null 2>&1
check "Up again: the columns are back and empty" "$(psqlc "SELECT count(*) FROM information_schema.columns WHERE table_name IN ('quotes','orders') AND column_name IN $COLS")|$(psqlc "SELECT count(*) FROM quotes WHERE delivery_address_label IS NOT NULL")" "20|0"
exit $fail
