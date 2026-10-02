using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Marvi.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class MvpFixes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_product_pricings_product_id_pricing_tier_id",
                table: "product_pricings");

            migrationBuilder.AddColumn<bool>(
                name: "is_default",
                table: "pricing_tiers",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "ix_product_pricings_product_id_pricing_tier_id_min_qty",
                table: "product_pricings",
                columns: new[] { "product_id", "pricing_tier_id", "min_qty" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_pricing_tiers_is_default",
                table: "pricing_tiers",
                column: "is_default",
                unique: true,
                filter: "is_default = true");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_product_pricings_product_id_pricing_tier_id_min_qty",
                table: "product_pricings");

            migrationBuilder.DropIndex(
                name: "ix_pricing_tiers_is_default",
                table: "pricing_tiers");

            migrationBuilder.DropColumn(
                name: "is_default",
                table: "pricing_tiers");

            migrationBuilder.CreateIndex(
                name: "ix_product_pricings_product_id_pricing_tier_id",
                table: "product_pricings",
                columns: new[] { "product_id", "pricing_tier_id" },
                unique: true);
        }
    }
}
