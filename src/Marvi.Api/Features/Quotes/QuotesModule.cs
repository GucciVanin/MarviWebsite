using Marvi.Domain.Quotes;

namespace Marvi.Api.Features.Quotes;

public static class QuotesModule
{
    public static IServiceCollection AddQuotesFeature(this IServiceCollection services)
    {
        services.AddScoped<QuoteWorkflowService>();
        return services;
    }
}
