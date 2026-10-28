using Marvi.Api.Configuration;
using Marvi.Api.Features.Auditing;
using Marvi.Api.Features.Catalog;
using Marvi.Api.Features.Coverage;
using Marvi.Api.Features.Identity;
using Marvi.Api.Features.Quotes;
using Marvi.Api.Features.Reviews;
using Marvi.Api.Http;
using Marvi.Infrastructure.Data;
using Marvi.Infrastructure.DependencyInjection;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Production never runs on the example secrets that ship in the repository (MRV-3.3a); this throws before anything else starts.
ProductionConfigurationGuard.EnsureSafe(builder.Configuration, builder.Environment);

// Do not advertise the server software on every response.
builder.WebHost.ConfigureKestrel(options => options.AddServerHeader = false);

builder.Services.AddControllers()
    .AddJsonOptions(options => options.JsonSerializerOptions.Converters.Add(new UtcDateTimeConverter()));
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<InvalidTextExceptionHandler>();
builder.Services.AddMarviRateLimiting(builder.Configuration);
builder.Services.AddOpenApi();
builder.Services.AddHealthChecks();
builder.Services.AddInfrastructure(builder.Configuration);

// Feature modules: each owns the service registrations for its folder under Features/.
// Removing a feature means deleting its folder and its line here.
builder.Services.AddIdentityFeature(builder.Configuration);
builder.Services.AddCatalogFeature();
builder.Services.AddCoverageFeature();
builder.Services.AddQuotesFeature();
builder.Services.AddAuditingFeature();
builder.Services.AddReviewsFeature();

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

// First, so it wraps everything: unknown failures become a generic 500 (no stack trace), bad input text a 400.
app.UseExceptionHandler();
app.UseForwardedClientAddress();
app.UseHttpsRedirection();
app.UseCors("SpaClient");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHealthChecks("/health");

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
