using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Marvi.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class CustomerQuoteOrderNumbers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateSequence<int>(name: "client_number_seq");
            migrationBuilder.CreateSequence<int>(name: "order_number_seq");
            migrationBuilder.CreateSequence<int>(name: "quote_number_seq");

            // Rows that already exist are numbered in the order they came into being (oldest first, the id breaking a tie), so the
            // numbers read as a history. The column is added empty, filled in that order, and only then given the sequence as its
            // default and made required: a plain "add column with default nextval" would number existing rows in no particular order.
            AddNumber(migrationBuilder, "client_accounts", "client_number_seq", "created_at");
            AddNumber(migrationBuilder, "quotes", "quote_number_seq", "created_at");
            AddNumber(migrationBuilder, "orders", "order_number_seq", "placed_at");
        }

        private static void AddNumber(MigrationBuilder migrationBuilder, string table, string sequence, string orderColumn)
        {
            migrationBuilder.AddColumn<int>(name: "number", table: table, type: "integer", nullable: true);

            migrationBuilder.Sql($"""
                UPDATE {table} AS t
                SET number = n.rn
                FROM (SELECT id, row_number() OVER (ORDER BY {orderColumn}, id) AS rn FROM {table}) AS n
                WHERE t.id = n.id;
                """);
            migrationBuilder.Sql($"SELECT setval('{sequence}', COALESCE((SELECT MAX(number) FROM {table}), 1), (SELECT COUNT(*) > 0 FROM {table}));");

            migrationBuilder.AlterColumn<int>(
                name: "number",
                table: table,
                type: "integer",
                nullable: false,
                defaultValueSql: $"nextval('{sequence}')",
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.CreateIndex(name: $"ix_{table}_number", table: table, column: "number", unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_quotes_number",
                table: "quotes");

            migrationBuilder.DropIndex(
                name: "ix_orders_number",
                table: "orders");

            migrationBuilder.DropIndex(
                name: "ix_client_accounts_number",
                table: "client_accounts");

            migrationBuilder.DropColumn(
                name: "number",
                table: "quotes");

            migrationBuilder.DropColumn(
                name: "number",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "number",
                table: "client_accounts");

            migrationBuilder.DropSequence(
                name: "client_number_seq");

            migrationBuilder.DropSequence(
                name: "order_number_seq");

            migrationBuilder.DropSequence(
                name: "quote_number_seq");
        }
    }
}
