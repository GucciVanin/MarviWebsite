using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Marvi.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddCategories : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "categories",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_categories", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_products_category_id",
                table: "products",
                column: "category_id");

            migrationBuilder.CreateIndex(
                name: "ix_categories_name",
                table: "categories",
                column: "name",
                unique: true);

            // Before this migration category_id pointed at nothing (no categories existed), so any value is an orphan
            // that would violate the new foreign key. Keep the grouping: give each orphan id an inactive category named
            // "Legacy <full id>" (the full id, so names stay unique), hidden from the public list; an admin can rename
            // and activate it.
            migrationBuilder.Sql("""
                INSERT INTO categories (id, name, sort_order, is_active)
                SELECT DISTINCT category_id, 'Legacy ' || category_id::text, 0, false
                FROM products
                WHERE category_id IS NOT NULL;
                """);

            migrationBuilder.AddForeignKey(
                name: "fk_products_categories_category_id",
                table: "products",
                column: "category_id",
                principalTable: "categories",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_products_categories_category_id",
                table: "products");

            migrationBuilder.DropTable(
                name: "categories");

            migrationBuilder.DropIndex(
                name: "ix_products_category_id",
                table: "products");
        }
    }
}
