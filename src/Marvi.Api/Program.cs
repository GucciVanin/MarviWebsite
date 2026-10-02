using Marvi.Api.Features.Auditing;
using Marvi.Api.Features.Catalog;
using Marvi.Api.Features.Coverage;
using Marvi.Api.Features.Identity;
using Marvi.Api.Features.Quotes;
using Marvi.Infrastructure.Data;
using Marvi.Infrastructure.DependencyInjection;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddInfrastructure(builder.Configuration);

// Feature modules: each owns the service registrations for its folder under Features/.
// Removing a feature means deleting its folder and its line here.
builder.Services.AddIdentityFeature(builder.Configuration);
builder.Services.AddCatalogFeature();
builder.Services.AddCoverageFeature();
builder.Services.AddQuotesFeature();
builder.Services.AddAuditingFeature();

builder.Services.AddCors(options =>
{
    options.AddPolicy("SpaClient", policy =>
    {
        var allowedOrigin = builder.Configuration["Cors:AllowedOrigin"] ?? "http://localhost:4200";
        policy.WithOrigins(allowedOrigin)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();
app.UseCors("SpaClient");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

if (!app.Environment.IsEnvironment("Testing"))
{
    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();
    await IdentityModule.SeedRolesAsync(scope.ServiceProvider);
    await IdentityModule.SeedAdminAsync(scope.ServiceProvider, app.Configuration);
    await DefaultPricingTier.GetOrCreateAsync(scope.ServiceProvider.GetRequiredService<AppDbContext>());
}

app.Run();

// Exposed so WebApplicationFactory<Program> in the test project can bootstrap the app.
public partial class Program;
