namespace Marvi.Api.Features.Catalog.Media;

/// <summary>Runs <see cref="ProductPhotoService.CleanupAsync"/> every <c>Media:CleanupMinutes</c> (default 15). Not registered in the test host: tests call the cleanup directly.</summary>
public sealed class ProductPhotoCleanupWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<ProductPhotoCleanupWorker> _logger;
    private readonly TimeSpan _interval;

    public ProductPhotoCleanupWorker(IServiceScopeFactory scopes, IConfiguration configuration, ILogger<ProductPhotoCleanupWorker> logger)
    {
        _scopes = scopes;
        _logger = logger;
        _interval = TimeSpan.FromMinutes(Math.Max(1, configuration.GetValue("Media:CleanupMinutes", 15)));
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(_interval);
        do
        {
            try
            {
                using var scope = _scopes.CreateScope();
                var removed = await scope.ServiceProvider.GetRequiredService<ProductPhotoService>().CleanupAsync(stoppingToken);
                if (removed > 0)
                {
                    _logger.LogInformation("Product photo cleanup removed {Count} file(s).", removed);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception exception)
            {
                // The cleanup is housekeeping: a failure (database restarting, a locked file) is retried at the next tick.
                _logger.LogWarning(exception, "Product photo cleanup failed; it will run again.");
            }
        }
        while (await WaitAsync(timer, stoppingToken));
    }

    private static async Task<bool> WaitAsync(PeriodicTimer timer, CancellationToken stoppingToken)
    {
        try
        {
            return await timer.WaitForNextTickAsync(stoppingToken);
        }
        catch (OperationCanceledException)
        {
            return false;
        }
    }
}
