using Marvi.Api.Features.Catalog.Contracts;
using Marvi.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Marvi.Api.Features.Catalog;

[ApiController]
[Route("api/categories")]
[AllowAnonymous]
public class CategoriesController : ControllerBase
{
    private readonly AppDbContext _dbContext;

    public CategoriesController(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<CategoryDto>>> GetCategories()
    {
        var categories = await _dbContext.Categories
            .Where(c => c.IsActive)
            .OrderBy(c => c.SortOrder)
            .ThenBy(c => c.Name)
            .Select(c => new CategoryDto(
                c.Id,
                c.Name,
                _dbContext.Products.Count(p => p.CategoryId == c.Id && p.IsActive)))
            .ToListAsync();

        return Ok(categories);
    }
}
