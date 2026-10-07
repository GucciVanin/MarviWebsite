using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Marvi.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ProtectHistoryAndUniqueSkus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_inventory_records_warehouses_warehouse_id",
                table: "inventory_records");

            migrationBuilder.DropForeignKey(
                name: "fk_order_line_items_products_product_id",
                table: "order_line_items");

            migrationBuilder.DropForeignKey(
                name: "fk_orders_client_accounts_client_account_id",
                table: "orders");

            migrationBuilder.DropForeignKey(
                name: "fk_quote_line_items_products_product_id",
                table: "quote_line_items");

            migrationBuilder.DropForeignKey(
                name: "fk_quotes_client_accounts_client_account_id",
                table: "quotes");

            migrationBuilder.AddForeignKey(
                name: "fk_inventory_records_warehouses_warehouse_id",
                table: "inventory_records",
                column: "warehouse_id",
                principalTable: "warehouses",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_order_line_items_products_product_id",
                table: "order_line_items",
                column: "product_id",
                principalTable: "products",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_orders_client_accounts_client_account_id",
                table: "orders",
                column: "client_account_id",
                principalTable: "client_accounts",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_quote_line_items_products_product_id",
                table: "quote_line_items",
                column: "product_id",
                principalTable: "products",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_quotes_client_accounts_client_account_id",
                table: "quotes",
                column: "client_account_id",
                principalTable: "client_accounts",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            // SKUs are unique ignoring case. EF cannot model an expression index, so it is raw SQL (and absent from the
            // model). A duplicate race becomes a 409 in AdminProductsController. This fails if two products already
            // share a SKU ignoring case; the product has never been deployed, so there is no such data to reconcile.
            migrationBuilder.Sql("CREATE UNIQUE INDEX ix_products_sku_lower ON products (lower(sku));");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP INDEX ix_products_sku_lower;");

            migrationBuilder.DropForeignKey(
                name: "fk_inventory_records_warehouses_warehouse_id",
                table: "inventory_records");

            migrationBuilder.DropForeignKey(
                name: "fk_order_line_items_products_product_id",
                table: "order_line_items");

            migrationBuilder.DropForeignKey(
                name: "fk_orders_client_accounts_client_account_id",
                table: "orders");

            migrationBuilder.DropForeignKey(
                name: "fk_quote_line_items_products_product_id",
                table: "quote_line_items");

            migrationBuilder.DropForeignKey(
                name: "fk_quotes_client_accounts_client_account_id",
                table: "quotes");

            migrationBuilder.AddForeignKey(
                name: "fk_inventory_records_warehouses_warehouse_id",
                table: "inventory_records",
                column: "warehouse_id",
                principalTable: "warehouses",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "fk_order_line_items_products_product_id",
                table: "order_line_items",
                column: "product_id",
                principalTable: "products",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "fk_orders_client_accounts_client_account_id",
                table: "orders",
                column: "client_account_id",
                principalTable: "client_accounts",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "fk_quote_line_items_products_product_id",
                table: "quote_line_items",
                column: "product_id",
                principalTable: "products",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "fk_quotes_client_accounts_client_account_id",
                table: "quotes",
                column: "client_account_id",
                principalTable: "client_accounts",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
