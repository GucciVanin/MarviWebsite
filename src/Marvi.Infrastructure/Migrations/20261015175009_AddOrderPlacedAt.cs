using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Marvi.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderPlacedAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "placed_at",
                table: "orders",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            // Orders that already exist have no recorded time: an order made from a quote was placed when that quote
            // was accepted, which is not recorded either, so the quote's request date is the closest honest value;
            // an order an employee placed directly gets the time of this migration.
            migrationBuilder.Sql("""
                UPDATE orders
                SET placed_at = COALESCE((SELECT q.created_at FROM quotes q WHERE q.id = orders.quote_id), now());
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "placed_at",
                table: "orders");
        }
    }
}
