using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Marvi.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ClientRegistrationData : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "account_type",
                table: "client_accounts",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateOnly>(
                name: "birth_date",
                table: "client_accounts",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "cnpj",
                table: "client_accounts",
                type: "character varying(14)",
                maxLength: 14,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "contact_name",
                table: "client_accounts",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "cpf_hash",
                table: "client_accounts",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "cpf_protected",
                table: "client_accounts",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "invoice_email",
                table: "client_accounts",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "legal_name",
                table: "client_accounts",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "main_cnae",
                table: "client_accounts",
                type: "character varying(7)",
                maxLength: 7,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "municipal_registration",
                table: "client_accounts",
                type: "character varying(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "opening_date",
                table: "client_accounts",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "phone",
                table: "client_accounts",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "state_registration",
                table: "client_accounts",
                type: "character varying(14)",
                maxLength: 14,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "state_registration_status",
                table: "client_accounts",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "tax_regime",
                table: "client_accounts",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "trade_name",
                table: "client_accounts",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_client_accounts_cnpj",
                table: "client_accounts",
                column: "cnpj",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_client_accounts_cpf_hash",
                table: "client_accounts",
                column: "cpf_hash",
                unique: true);
        }

        /// <inheritdoc />
        // WARNING (MRV-9.4): Down drops these columns and with them every customer's registration data (account type, CNPJ, the encrypted CPF and its hash,
        // birth date, phone and the rest). Rolling back discards that data for good: take a database backup first (docs/operations.md section 7).
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_client_accounts_cnpj",
                table: "client_accounts");

            migrationBuilder.DropIndex(
                name: "ix_client_accounts_cpf_hash",
                table: "client_accounts");

            migrationBuilder.DropColumn(
                name: "account_type",
                table: "client_accounts");

            migrationBuilder.DropColumn(
                name: "birth_date",
                table: "client_accounts");

            migrationBuilder.DropColumn(
                name: "cnpj",
                table: "client_accounts");

            migrationBuilder.DropColumn(
                name: "contact_name",
                table: "client_accounts");

            migrationBuilder.DropColumn(
                name: "cpf_hash",
                table: "client_accounts");

            migrationBuilder.DropColumn(
                name: "cpf_protected",
                table: "client_accounts");

            migrationBuilder.DropColumn(
                name: "invoice_email",
                table: "client_accounts");

            migrationBuilder.DropColumn(
                name: "legal_name",
                table: "client_accounts");

            migrationBuilder.DropColumn(
                name: "main_cnae",
                table: "client_accounts");

            migrationBuilder.DropColumn(
                name: "municipal_registration",
                table: "client_accounts");

            migrationBuilder.DropColumn(
                name: "opening_date",
                table: "client_accounts");

            migrationBuilder.DropColumn(
                name: "phone",
                table: "client_accounts");

            migrationBuilder.DropColumn(
                name: "state_registration",
                table: "client_accounts");

            migrationBuilder.DropColumn(
                name: "state_registration_status",
                table: "client_accounts");

            migrationBuilder.DropColumn(
                name: "tax_regime",
                table: "client_accounts");

            migrationBuilder.DropColumn(
                name: "trade_name",
                table: "client_accounts");
        }
    }
}
