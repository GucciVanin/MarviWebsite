using Marvi.Api.Features.Reviews.Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Marvi.Api.Features.Reviews;

/// <summary>The Google reviews behind the landing page's "Avaliações" section (MRV-2.5). Anonymous; 204 when there is nothing to show.</summary>
[ApiController]
[Route("api/public/reviews")]
[AllowAnonymous]
public class PublicReviewsController : ControllerBase
{
    private readonly ReviewsService _reviews;

    public PublicReviewsController(ReviewsService reviews)
    {
        _reviews = reviews;
    }

    [HttpGet]
    [ResponseCache(Duration = 300, Location = ResponseCacheLocation.Any)]
    public async Task<ActionResult<ReviewsDto>> Get(CancellationToken cancellationToken)
    {
        var reviews = await _reviews.GetAsync(cancellationToken);
        return reviews is null ? NoContent() : Ok(reviews);
    }
}
