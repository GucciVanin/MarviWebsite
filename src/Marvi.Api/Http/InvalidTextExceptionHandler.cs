using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace Marvi.Api.Http;

/// <summary>
/// A request carrying text the database cannot store (such as a NUL character in a search term or a name) is the
/// caller's mistake, so answer 400 instead of letting it surface as a 500. Every other exception is left to the
/// default handler, which returns a generic 500 without internals.
/// </summary>
public sealed class InvalidTextExceptionHandler : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        if (!PostgresInputErrors.IsInvalidText(exception))
        {
            return false;
        }

        httpContext.Response.StatusCode = StatusCodes.Status400BadRequest;
        await httpContext.Response.WriteAsJsonAsync(
            new ProblemDetails { Status = StatusCodes.Status400BadRequest, Title = "The request contains characters that cannot be stored." },
            cancellationToken);
        return true;
    }
}
