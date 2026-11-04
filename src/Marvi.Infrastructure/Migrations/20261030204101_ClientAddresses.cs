using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Marvi.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ClientAddresses : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "client_addresses",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    key = table.Column<Guid>(type: "uuid", nullable: false),
                    client_account_id = table.Column<Guid>(type: "uuid", nullable: false),
                    label = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    kind = table.Column<int>(type: "integer", nullable: false),
                    postal_code = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    street = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    number = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    complement = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    district = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    city = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    state = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                    country = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                    delivery_notes = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    is_billing = table.Column<bool>(type: "boolean", nullable: false),
                    is_default = table.Column<bool>(type: "boolean", nullable: false),
                    needs_review = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_client_addresses", x => x.id);
                    table.ForeignKey(
                        name: "fk_client_addresses_client_accounts_client_account_id",
                        column: x => x.client_account_id,
                        principalTable: "client_accounts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_client_addresses_client_account_id",
                table: "client_addresses",
                column: "client_account_id");

            migrationBuilder.CreateIndex(
                name: "ix_client_addresses_key",
                table: "client_addresses",
                column: "key",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_client_addresses_one_billing",
                table: "client_addresses",
                column: "client_account_id",
                unique: true,
                filter: "is_billing = true");

            migrationBuilder.CreateIndex(
                name: "ix_client_addresses_one_default",
                table: "client_addresses",
                column: "client_account_id",
                unique: true,
                filter: "is_default = true");

            // Legacy data (MRV-9.3): the old billing text becomes one address that is the billing AND default delivery address; each old
            // shipping line becomes a delivery address. The text is copied whole into the street, flagged needs_review so the customer is
            // asked to complete the structure. A customer with no billing text gets no billing row (their first new address becomes it).
            migrationBuilder.Sql("""
                INSERT INTO client_addresses (id, key, client_account_id, label, kind, postal_code, street, number, complement, district, city, state, country, delivery_notes, is_billing, is_default, needs_review, created_at)
                SELECT gen_random_uuid(), gen_random_uuid(), id, 'Endereço principal', 2, '', left(btrim(billing_address), 500), '', NULL, '', '', '', 'BR', NULL, true, true, true, created_at
                FROM client_accounts
                WHERE btrim(billing_address) <> '';
                """);
            migrationBuilder.Sql("""
                INSERT INTO client_addresses (id, key, client_account_id, label, kind, postal_code, street, number, complement, district, city, state, country, delivery_notes, is_billing, is_default, needs_review, created_at)
                SELECT gen_random_uuid(), gen_random_uuid(), c.id, 'Endereço de entrega ' || s.n, 1, '', left(btrim(s.addr), 500), '', NULL, '', '', '', 'BR', NULL, false, false, true, c.created_at
                FROM client_accounts c
                CROSS JOIN LATERAL unnest(c.shipping_addresses) WITH ORDINALITY AS s(addr, n)
                WHERE btrim(s.addr) <> '';
                """);
            // A customer whose billing text was empty still gets a default delivery address: their first old shipping line.
            migrationBuilder.Sql("""
                UPDATE client_addresses SET is_default = true
                WHERE id IN (
                    SELECT DISTINCT ON (a.client_account_id) a.id
                    FROM client_addresses a
                    WHERE a.kind = 1
                      AND NOT EXISTS (SELECT 1 FROM client_addresses o WHERE o.client_account_id = a.client_account_id AND o.is_default)
                    ORDER BY a.client_account_id, length(a.label), a.label);
                """);

            migrationBuilder.DropColumn(
                name: "billing_address",
                table: "client_accounts");

            migrationBuilder.DropColumn(
                name: "shipping_addresses",
                table: "client_accounts");
        }
        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("ALTER TABLE client_accounts ADD COLUMN billing_address text NOT NULL DEFAULT '';");
            migrationBuilder.Sql("ALTER TABLE client_accounts ADD COLUMN shipping_addresses text[] NOT NULL DEFAULT '{}';");

            // The rows go back to text (at most 10 non-billing addresses, the old limit; any beyond that are lost on rollback): a row still waiting for review is its old text as it was; a structured one is written out in one line.
            const string Text = """
                CASE WHEN a.needs_review THEN a.street
                     ELSE a.street || ', ' || a.number || COALESCE(' - ' || a.complement, '') || ', ' || a.district || ', ' || a.city || '/' || a.state
                          || ', CEP ' || substr(a.postal_code, 1, 5) || '-' || substr(a.postal_code, 6) END
                """;
            migrationBuilder.Sql($"""
                UPDATE client_accounts c SET
                    billing_address = COALESCE((SELECT {Text} FROM client_addresses a WHERE a.client_account_id = c.id AND a.is_billing LIMIT 1), ''),
                    shipping_addresses = ARRAY(
                        SELECT {Text} FROM client_addresses a
                        WHERE a.client_account_id = c.id AND NOT a.is_billing
                        ORDER BY a.is_default DESC, a.created_at, a.label
                        LIMIT 10);
                """);

            migrationBuilder.Sql("ALTER TABLE client_accounts ALTER COLUMN billing_address DROP DEFAULT;");
            migrationBuilder.Sql("ALTER TABLE client_accounts ALTER COLUMN shipping_addresses DROP DEFAULT;");

            migrationBuilder.DropTable(
                name: "client_addresses");
        }
    }
}
