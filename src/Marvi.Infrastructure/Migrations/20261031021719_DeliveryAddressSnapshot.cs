using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Marvi.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class DeliveryAddressSnapshot : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "delivery_address_city",
                table: "quotes",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "delivery_address_complement",
                table: "quotes",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "delivery_address_district",
                table: "quotes",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "delivery_address_id",
                table: "quotes",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "delivery_address_label",
                table: "quotes",
                type: "character varying(60)",
                maxLength: 60,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "delivery_address_notes",
                table: "quotes",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "delivery_address_number",
                table: "quotes",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "delivery_address_postal_code",
                table: "quotes",
                type: "character varying(8)",
                maxLength: 8,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "delivery_address_state",
                table: "quotes",
                type: "character varying(2)",
                maxLength: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "delivery_address_street",
                table: "quotes",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "delivery_address_city",
                table: "orders",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "delivery_address_complement",
                table: "orders",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "delivery_address_district",
                table: "orders",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "delivery_address_id",
                table: "orders",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "delivery_address_label",
                table: "orders",
                type: "character varying(60)",
                maxLength: 60,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "delivery_address_notes",
                table: "orders",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "delivery_address_number",
                table: "orders",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "delivery_address_postal_code",
                table: "orders",
                type: "character varying(8)",
                maxLength: 8,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "delivery_address_state",
                table: "orders",
                type: "character varying(2)",
                maxLength: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "delivery_address_street",
                table: "orders",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_quotes_delivery_address_id",
                table: "quotes",
                column: "delivery_address_id");

            migrationBuilder.CreateIndex(
                name: "ix_orders_delivery_address_id",
                table: "orders",
                column: "delivery_address_id");

            migrationBuilder.AddForeignKey(
                name: "fk_orders_client_addresses_delivery_address_id",
                table: "orders",
                column: "delivery_address_id",
                principalTable: "client_addresses",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "fk_quotes_client_addresses_delivery_address_id",
                table: "quotes",
                column: "delivery_address_id",
                principalTable: "client_addresses",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_orders_client_addresses_delivery_address_id",
                table: "orders");

            migrationBuilder.DropForeignKey(
                name: "fk_quotes_client_addresses_delivery_address_id",
                table: "quotes");

            migrationBuilder.DropIndex(
                name: "ix_quotes_delivery_address_id",
                table: "quotes");

            migrationBuilder.DropIndex(
                name: "ix_orders_delivery_address_id",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "delivery_address_city",
                table: "quotes");

            migrationBuilder.DropColumn(
                name: "delivery_address_complement",
                table: "quotes");

            migrationBuilder.DropColumn(
                name: "delivery_address_district",
                table: "quotes");

            migrationBuilder.DropColumn(
                name: "delivery_address_id",
                table: "quotes");

            migrationBuilder.DropColumn(
                name: "delivery_address_label",
                table: "quotes");

            migrationBuilder.DropColumn(
                name: "delivery_address_notes",
                table: "quotes");

            migrationBuilder.DropColumn(
                name: "delivery_address_number",
                table: "quotes");

            migrationBuilder.DropColumn(
                name: "delivery_address_postal_code",
                table: "quotes");

            migrationBuilder.DropColumn(
                name: "delivery_address_state",
                table: "quotes");

            migrationBuilder.DropColumn(
                name: "delivery_address_street",
                table: "quotes");

            migrationBuilder.DropColumn(
                name: "delivery_address_city",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "delivery_address_complement",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "delivery_address_district",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "delivery_address_id",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "delivery_address_label",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "delivery_address_notes",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "delivery_address_number",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "delivery_address_postal_code",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "delivery_address_state",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "delivery_address_street",
                table: "orders");
        }
    }
}
