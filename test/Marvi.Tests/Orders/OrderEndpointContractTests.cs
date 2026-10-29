using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Orders.Contracts;
using Marvi.Tests.Support;

namespace Marvi.Tests.Orders;

/// <summary>MRV-3.5: validation answers of POST /api/employee/orders and the customer's own order list.</summary>
public class OrderEndpointContractTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public OrderEndpointContractTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task PlaceOrder_RejectsEmptyBaskets_BlankAddresses_UnknownCustomers_AndUnknownProducts()
    {
        var admin = await _factory.AdminAsync();
        var (_, clientId) = await _factory.RegisterClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        var line = new EmployeeOrderLineItemRequest(product, 1);

        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync("/api/employee/orders", new CreateEmployeeOrderRequest(clientId, "Rua A, 1", []))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync("/api/employee/orders", new CreateEmployeeOrderRequest(clientId, "Rua A, 1", [new EmployeeOrderLineItemRequest(product, 0)]))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync("/api/employee/orders", new CreateEmployeeOrderRequest(clientId, "  ", [line]))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync("/api/employee/orders", new CreateEmployeeOrderRequest(Guid.NewGuid(), "Rua A, 1", [line]))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync("/api/employee/orders", new CreateEmployeeOrderRequest(clientId, "Rua A, 1", [new EmployeeOrderLineItemRequest(Guid.NewGuid(), 1)]))).StatusCode);
    }

    [Fact]
    public async Task PlaceOrder_ThenTheCustomerSeesItInTheirOwnList()
    {
        var admin = await _factory.AdminAsync();
        var (client, clientId) = await _factory.RegisterClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);

        var placed = await admin.PostAsJsonAsync("/api/employee/orders", new CreateEmployeeOrderRequest(clientId, "Rua A, 1", [new EmployeeOrderLineItemRequest(product, 3)]));

        Assert.Equal(HttpStatusCode.Created, placed.StatusCode);
        var order = (await placed.Content.ReadFromJsonAsync<OrderDto>())!;
        var mine = (await client.GetFromJsonAsync<List<OrderDto>>("/api/orders/mine"))!;
        Assert.Contains(mine, o => o.Id == order.Id);
    }

    [Fact]
    public async Task OrdersMine_IsEmptyForACustomerWithoutOrders()
    {
        var (client, _) = await _factory.RegisterClientAsync();

        var response = await client.GetAsync("/api/orders/mine");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty((await response.Content.ReadFromJsonAsync<List<OrderDto>>())!);
    }
}
