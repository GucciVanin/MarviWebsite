using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Marvi.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ProductPhotos : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "product_photo_uploads",
                columns: table => new
                {
                    token = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    file_name = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    uploaded_by_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_product_photo_uploads", x => x.token);
                });

            migrationBuilder.CreateIndex(
                name: "ix_product_photo_uploads_created_at",
                table: "product_photo_uploads",
                column: "created_at");

            migrationBuilder.CreateIndex(
                name: "ix_product_photo_uploads_uploaded_by_user_id",
                table: "product_photo_uploads",
                column: "uploaded_by_user_id");

            // MRV-9.7: the photo is now an uploaded file served from this site. Every address stored before (a free https URL typed in MRV-9.5 or
            // brought by the import) could never display under the CSP (img-src 'self' data:), so the column is cleared; it will hold the
            // relative path of the uploaded photo. A path of ours is never cleared (so Down then Up again keeps the photos). Down cannot bring the old
            // addresses back: take a database backup before migrating.
            migrationBuilder.Sql("UPDATE products SET image_url = NULL WHERE image_url IS NOT NULL AND image_url NOT LIKE '/api/public/media/products/%';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // The old image addresses were cleared by Up and are not restored. Photos uploaded since are no longer linked (the paths stay in
            // products.image_url and keep working, but the pending-upload table is gone).
            migrationBuilder.DropTable(
                name: "product_photo_uploads");
        }
    }
}
