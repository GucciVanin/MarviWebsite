using Marvi.Domain.Identity;
using Marvi.Infrastructure.Data;

namespace Marvi.Api.Features.Identity;

/// <summary>
/// MRV-9.9: a request that carries the token of a Suspended customer is refused with 403 and <see cref="AccountSuspension.Body"/>, whatever the endpoint
/// (a token cannot be recalled, so the status is checked server-side, through <see cref="ClientStatusCache"/>). Runs after authentication and before
/// authorization. Employees, Admins, Pending and Approved customers, visitors and the sign-in/registration endpoints (which carry no session) pass through.
/// </summary>
public sealed class SuspendedClientGate(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, ClientStatusCache cache, AppDbContext dbContext)
    {
        if (context.User.Identity?.IsAuthenticated == true
            && context.User.IsInRole(Principal.Roles.Client)
            && context.User.ClientId() is { } clientId
            && !context.Request.Path.StartsWithSegments("/api/auth", StringComparison.OrdinalIgnoreCase)
            && await cache.GetStatusAsync(clientId, dbContext, context.RequestAborted) == ClientAccountStatus.Suspended)
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsJsonAsync(AccountSuspension.Body, context.RequestAborted);
            return;
        }

        await next(context);
    }
}
