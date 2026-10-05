using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Marvi.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class CaseInsensitiveCategoryNames : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_categories_name",
                table: "categories");

            // Unique ignoring case, so concurrent "Foo" and "foo" cannot both be stored (the controller maps the
            // violation to 409). EF cannot model an expression index, hence raw SQL and no HasIndex in the model.
            migrationBuilder.Sql("CREATE UNIQUE INDEX ix_categories_name_lower ON categories (lower(name));");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP INDEX ix_categories_name_lower;");

            migrationBuilder.CreateIndex(
                name: "ix_categories_name",
                table: "categories",
                column: "name",
                unique: true);
        }
    }
}
