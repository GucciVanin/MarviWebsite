using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Marvi.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddClientCreatedAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "created_at",
                table: "client_accounts",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            // Customers that already exist have no recorded registration time: the earliest quote or order they made is the
            // closest honest value; a customer with no activity gets the time of this migration.
            migrationBuilder.Sql("""
                UPDATE client_accounts
                SET created_at = COALESCE(
                    LEAST(
                        (SELECT MIN(q.created_at) FROM quotes q WHERE q.client_account_id = client_accounts.id),
                        (SELECT MIN(o.placed_at) FROM orders o WHERE o.client_account_id = client_accounts.id)),
                    now());
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "created_at",
                table: "client_accounts");
        }
    }
}
