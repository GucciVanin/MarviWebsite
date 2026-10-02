namespace Marvi.Api.Features.Auditing;

public static class AuditingModule
{
    public static IServiceCollection AddAuditingFeature(this IServiceCollection services)
    {
        services.AddHttpContextAccessor();
        services.AddScoped<AuditLogger>();
        return services;
    }
}
