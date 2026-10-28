using System.Net;
using System.Net.Http.Json;
using System.Text;
using Marvi.Api.Features.Reviews;
using Marvi.Api.Features.Reviews.Contracts;
using Marvi.Infrastructure.Reviews;
using Marvi.Tests.Support;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging.Abstractions;

namespace Marvi.Tests.Reviews;

/// <summary>MRV-2.5: the Google reviews behind the home page, from the Places API reader to the public endpoint, with no key and no network.</summary>
public class GoogleReviewsTests
{
    private const string Key = "SECRET-KEY-123";
    private const string Answer = """
        {
          "rating": 4.8, "userRatingCount": 25, "googleMapsUri": "https://maps.google.com/?cid=1",
          "reviews": [
            { "rating": 5, "text": { "text": "Atendimento e entrega excelentes." }, "relativePublishTimeDescription": "há 2 meses", "publishTime": "2026-08-01T10:00:00Z",
              "authorAttribution": { "displayName": "Livia Marques", "uri": "https://www.google.com/maps/contrib/1" } },
            { "rating": 1, "text": { "text": "Demorou." }, "relativePublishTimeDescription": "há 1 ano",
              "authorAttribution": { "displayName": "Silvia Garcia", "uri": "javascript:alert(1)" } },
            { "rating": 5, "relativePublishTimeDescription": "há 3 dias", "authorAttribution": { "displayName": "Só estrelas" } },
            { "rating": 9, "text": { "text": "nota inválida" }, "authorAttribution": { "displayName": "X" } }
          ]
        }
        """;

    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        public List<HttpRequestMessage> Requests { get; } = new();

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add(request);
            return Task.FromResult(respond(request));
        }
    }

    private sealed class CountingProvider(PlaceReviews? result) : IPlaceReviewsProvider
    {
        public int Calls { get; private set; }

        public Task<PlaceReviews?> GetAsync(CancellationToken cancellationToken)
        {
            Calls++;
            return Task.FromResult(result);
        }
    }

    private static HttpResponseMessage Json(string body, HttpStatusCode status = HttpStatusCode.OK) =>
        new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private static GooglePlacesReviewsProvider Provider(StubHandler handler, bool configured = true)
    {
        var settings = new Dictionary<string, string?>();
        if (configured)
        {
            settings["Reviews:Google:ApiKey"] = Key;
            settings["Reviews:Google:PlaceId"] = "ChIJ-example";
        }

        var configuration = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
        return new GooglePlacesReviewsProvider(new HttpClient(handler), configuration, NullLogger<GooglePlacesReviewsProvider>.Instance);
    }

    [Fact]
    public async Task TheProvider_ReadsTheRatingAndOnlyReviewsWithAnAuthorAStarRatingAndText()
    {
        var result = await Provider(new StubHandler(_ => Json(Answer))).GetAsync(CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(4.8, result.Rating);
        Assert.Equal(25, result.Count);
        Assert.Equal(new[] { "Livia Marques", "Silvia Garcia" }, result.Reviews.Select(r => r.AuthorName));
        Assert.Equal(new[] { 5, 1 }, result.Reviews.Select(r => r.Rating)); // a 1-star review is shown like any other
    }

    [Fact]
    public async Task TheProvider_SendsTheKeyInAHeader_NeverInTheUrl()
    {
        var handler = new StubHandler(_ => Json(Answer));

        await Provider(handler).GetAsync(CancellationToken.None);

        var request = Assert.Single(handler.Requests);
        Assert.DoesNotContain(Key, request.RequestUri!.ToString());
        Assert.Equal(Key, request.Headers.GetValues("X-Goog-Api-Key").Single());
        Assert.Contains("reviews", request.Headers.GetValues("X-Goog-FieldMask").Single());
    }

    [Theory]
    [InlineData(HttpStatusCode.Forbidden)]
    [InlineData(HttpStatusCode.TooManyRequests)]
    [InlineData(HttpStatusCode.InternalServerError)]
    public async Task TheProvider_ReportsUnavailable_WhenGoogleRefusesOrFails(HttpStatusCode status) =>
        Assert.Null(await Provider(new StubHandler(_ => Json("{}", status))).GetAsync(CancellationToken.None));

    [Fact]
    public async Task TheProvider_ReportsUnavailable_OnGarbageOrAnOutage()
    {
        Assert.Null(await Provider(new StubHandler(_ => Json("not json"))).GetAsync(CancellationToken.None));
        Assert.Null(await Provider(new StubHandler(_ => Json("{}"))).GetAsync(CancellationToken.None));
        Assert.Null(await Provider(new StubHandler(_ => throw new HttpRequestException("boom " + Key))).GetAsync(CancellationToken.None));
    }

    [Fact]
    public async Task TheProvider_WithoutAKeyOrPlace_DoesNotCallGoogle()
    {
        var handler = new StubHandler(_ => Json(Answer));

        Assert.Null(await Provider(handler, configured: false).GetAsync(CancellationToken.None));
        Assert.Empty(handler.Requests);
    }

    private static PlaceReviews Source(string? profile = "https://maps.google.com/?cid=1", string? author = "https://www.google.com/maps/contrib/1") =>
        new(4.84, 25, profile, [new PlaceReview("Livia", author, 5, "Ótimo", "há 2 meses", null)]);

    private static ReviewsService Service(IPlaceReviewsProvider provider) =>
        new(provider, new MemoryCache(new MemoryCacheOptions()), new ConfigurationBuilder().Build());

    [Fact]
    public async Task TheService_CallsGoogleOnce_ForManyVisitors()
    {
        var provider = new CountingProvider(Source());
        var service = Service(provider);

        var tasks = Enumerable.Range(0, 20).Select(_ => service.GetAsync(CancellationToken.None));
        await Task.WhenAll(tasks);

        Assert.Equal(1, provider.Calls);
    }

    [Fact]
    public async Task TheService_RemembersAFailure_SoAnOutageIsNotHammered()
    {
        var provider = new CountingProvider(null);
        var service = Service(provider);

        Assert.Null(await service.GetAsync(CancellationToken.None));
        Assert.Null(await service.GetAsync(CancellationToken.None));

        Assert.Equal(1, provider.Calls);
    }

    [Fact]
    public async Task TheService_RoundsTheRating_AndKeepsOnlyHttpsGoogleLinks()
    {
        var dto = await Service(new CountingProvider(Source(profile: "http://maps.google.com/?cid=1", author: "https://evil.example/x"))).GetAsync(CancellationToken.None);

        Assert.NotNull(dto);
        Assert.Equal(4.8, dto.Rating);
        Assert.Null(dto.ProfileUrl);
        Assert.Null(dto.Reviews.Single().AuthorUrl);
    }

    [Fact]
    public async Task TheService_HasNothingToShow_ForAPlaceWithoutRatings() =>
        Assert.Null(await Service(new CountingProvider(new PlaceReviews(0, 0, null, []))).GetAsync(CancellationToken.None));

    [Fact]
    public async Task TheEndpoint_IsPublic_AndAnswers204WhenThereIsNothingToShow()
    {
        using var factory = new ReviewsFactory(null);
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/public/reviews");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    [Fact]
    public async Task TheEndpoint_ServesTheReviewsToAnonymousVisitors()
    {
        using var factory = new ReviewsFactory(Source());
        using var client = factory.CreateClient();

        var dto = await client.GetFromJsonAsync<ReviewsDto>("/api/public/reviews");

        Assert.NotNull(dto);
        Assert.Equal(25, dto.Count);
        Assert.Equal("Livia", dto.Reviews.Single().AuthorName);
    }

    private sealed class ReviewsFactory(PlaceReviews? result) : MarviApiFactory
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IPlaceReviewsProvider>();
                services.AddSingleton<IPlaceReviewsProvider>(new CountingProvider(result));
            });
        }
    }
}
