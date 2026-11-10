#!/usr/bin/env bash
# MRV-9.7: proves, on a throwaway real Postgres, that the migration ProductPhotos creates product_photo_uploads (token primary key, file name,
# uploader, created_at, the two indexes), sets every stored products.image_url that is not one of our photo paths to NULL (the old free https addresses could never display under the
# CSP; the column now holds the relative path of an uploaded photo), leaves every other product column alone, and that Down drops the table and
# keeps the products (the cleared addresses are NOT restored: take a backup before migrating) and Up works a second time.
# It never touches the dev stack or its volume: it starts its own container on port 55437 and removes it at the end.
# Usage (from the project root):  bash test/runtime/migration-photos.sh
set -u
cd "$(dirname "$0")/../.."

NAME=marvi-migration-photos
PORT=55437
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

PREV=OrderDeliveryAddressMaxLength
EF="dotnet ef database update --project src/Marvi.Infrastructure --startup-project src/Marvi.Api --connection"
$EF "$CONN" "$PREV" >/dev/null 2>&1 || { echo "FAIL  could not migrate to $PREV"; exit 2; }

# Three products: a free https address, an http one, and none.
psqlc "INSERT INTO products (id, sku, name, description, image_url, is_active, attributes) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'PH-1', 'Com https', 'desc', 'https://exemplo.com/a.png', true, '{\"Marca\":\"X\"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'PH-2', 'Com http', NULL, 'http://exemplo.com/b.png', true, '{}'),
  ('00000000-0000-0000-0000-0000000000a3', 'PH-3', 'Sem imagem', NULL, NULL, false, '{}');" >/dev/null
BEFORE="$(psqlc "SELECT string_agg(sku || ':' || name || ':' || coalesce(description,'-') || ':' || is_active || ':' || attributes::text, ',' ORDER BY sku) FROM products")"

$EF "$CONN" >/dev/null 2>&1 || { echo "FAIL  migration did not apply"; exit 2; }

check "the table exists with the four columns" "$(psqlc "SELECT string_agg(column_name || ':' || is_nullable, ',' ORDER BY column_name) FROM information_schema.columns WHERE table_name='product_photo_uploads'")" "created_at:NO,file_name:NO,token:NO,uploaded_by_user_id:NO"
check "the token is the primary key" "$(psqlc "SELECT string_agg(a.attname, ',') FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey) WHERE i.indrelid='product_photo_uploads'::regclass AND i.indisprimary")" "token"
check "both indexes exist" "$(psqlc "SELECT count(*) FROM pg_indexes WHERE tablename='product_photo_uploads' AND indexname IN ('ix_product_photo_uploads_created_at','ix_product_photo_uploads_uploaded_by_user_id')")" "2"
check "every stored image address was cleared" "$(psqlc "SELECT count(*) FROM products WHERE image_url IS NOT NULL")" "0"
check "...and nothing else about the products changed" "$(psqlc "SELECT string_agg(sku || ':' || name || ':' || coalesce(description,'-') || ':' || is_active || ':' || attributes::text, ',' ORDER BY sku) FROM products")" "$BEFORE"
check "the three products are all still there" "$(psqlc "SELECT count(*) FROM products")" "3"

psqlc "INSERT INTO product_photo_uploads (token, file_name, uploaded_by_user_id, created_at) VALUES ('0123456789abcdef0123456789abcdef', '0123456789abcdef0123456789abcdef.jpg', gen_random_uuid(), now());" >/dev/null
check "an upload row can be stored" "$(psqlc "SELECT count(*) FROM product_photo_uploads")" "1"
check "a second row with the same token is refused" "$(psqlc "INSERT INTO product_photo_uploads (token, file_name, uploaded_by_user_id, created_at) VALUES ('0123456789abcdef0123456789abcdef', 'x.png', gen_random_uuid(), now())" 2>&1 | grep -c 'duplicate key')" "1"
psqlc "UPDATE products SET image_url = '/api/public/media/products/0123456789abcdef0123456789abcdef.jpg' WHERE sku = 'PH-1'" >/dev/null

$EF "$CONN" "$PREV" >/dev/null 2>&1
check "Down: the table is gone" "$(psqlc "SELECT count(*) FROM information_schema.tables WHERE table_name='product_photo_uploads'")" "0"
check "Down: the products and their photo paths stay (the cleared https addresses are not restored)" "$(psqlc "SELECT count(*) || '|' || count(image_url) FROM products")" "3|1"

$EF "$CONN" >/dev/null 2>&1
check "Up again: the table is back and empty" "$(psqlc "SELECT count(*) FROM product_photo_uploads")" "0"
check "Up again keeps a path of ours (Down then Up must not orphan uploaded photos) and clears nothing else" "$(psqlc "SELECT count(image_url) FROM products")" "1"
exit $fail
