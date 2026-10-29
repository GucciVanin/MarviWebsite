using Marvi.Api.Configuration;
using Marvi.Api.Features.Contact.Contracts;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Marvi.Api.Features.Contact;

/// <summary>The site's contact form (MRV-2.8). Anonymous, rate limited per client address, honeypot against bots. Nothing is e-mailed: the admin reads it in the inbox.</summary>
[ApiController]
[Route("api/public/contact")]
[AllowAnonymous]
public class PublicContactController : ControllerBase
{
    private readonly AppDbContext _dbContext;
    private readonly ILogger<PublicContactController> _logger;

    public PublicContactController(AppDbContext dbContext, ILogger<PublicContactController> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    [HttpPost]
    [EnableRateLimiting(RateLimiting.ContactPolicy)]
    // The fields add up to about 2.7 KB of text; anything near this size is not a person writing to us.
    [RequestSizeLimit(16 * 1024)]
    public async Task<IActionResult> Submit(ContactRequest request, CancellationToken cancellationToken)
    {
        // A bot filled the field no person can see (any value at all, even spaces): pretend it worked so it learns nothing, and store nothing.
        if (!string.IsNullOrEmpty(request.Website))
        {
            return NoContent();
        }

        var checkedRequest = ContactRules.Check(request);
        if (checkedRequest.Message is null)
        {
            return ValidationProblem(new ValidationProblemDetails(checkedRequest.Problems));
        }

        _dbContext.ContactMessages.Add(checkedRequest.Message);
        await _dbContext.SaveChangesAsync(cancellationToken);

        // Only the id: the visitor's name, e-mail and text are not written to logs.
        _logger.LogInformation("Contact message {ContactMessageId} received.", checkedRequest.Message.Id);
        return NoContent();
    }
}
