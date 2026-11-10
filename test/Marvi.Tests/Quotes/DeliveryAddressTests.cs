using System.Net;
using System.Net.Http.Json;
using Marvi.Api.Features.Auditing.Contracts;
using Marvi.Api.Features.Common;
using Marvi.Api.Features.Identity.Contracts;
using Marvi.Api.Features.Orders.Contracts;
using Marvi.Api.Features.Quotes.Contracts;
using Marvi.Domain.Delivery;
using Marvi.Domain.Identity;
using Marvi.Domain.Orders;
using Marvi.Domain.Quotes;
using Marvi.Infrastructure.Data;
using Marvi.Tests.Support;
using Microsoft.Extensions.DependencyInjection;

namespace Marvi.Tests.Quotes;

/// <summary>MRV-9.6: a quote and an order are delivered to an address the customer chose, kept on the document as a snapshot.</summary>
public class DeliveryAddressTests : IClassFixture<MarviApiFactory>
{
    private readonly MarviApiFactory _factory;

    public DeliveryAddressTests(MarviApiFactory factory)
    {
        _factory = factory;
    }

    private static async Task<ClientAddressDto> AddAsync(HttpClient client, ClientAddressRequest request)
    {
        var response = await client.PostAsJsonAsync("/api/client/addresses", request);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ClientAddressDto>())!;
    }

    private static async Task<ClientOwnProfileDto> ProfileAsync(HttpClient client) =>
        (await client.GetFromJsonAsync<ClientOwnProfileDto>("/api/client/profile"))!;

    private static async Task<QuoteDto> RequestQuoteAsync(HttpClient client, Guid productId, Guid? addressKey = null)
    {
        var response = await client.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(productId, 2)], addressKey));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<QuoteDto>())!;
    }

    private static async Task<QuoteDto> PriceAsync(HttpClient admin, QuoteDto quote)
    {
        var response = await admin.PutAsJsonAsync($"/api/employee/quotes/{quote.Id}/price", new PriceQuoteRequest([new PriceQuoteLineRequest(quote.LineItems.Single().Id, 9m)]));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<QuoteDto>())!;
    }

    private static Task<HttpResponseMessage> ChangeAsync(HttpClient client, int quoteNumber, Guid key) =>
        client.PutAsJsonAsync($"/api/quotes/{quoteNumber}/delivery-address", new ChangeDeliveryAddressRequest(key));

    private static Task<HttpResponseMessage> AmendAsync(HttpClient client, int orderNumber, Guid key) =>
        client.PutAsJsonAsync($"/api/employee/orders/{orderNumber}/delivery-address", new ChangeDeliveryAddressRequest(key));

    private static async Task<OrderDto> PlaceOrderAsync(HttpClient admin, Guid clientId, Guid productId, Guid? addressKey = null)
    {
        var response = await admin.PostAsJsonAsync("/api/employee/orders", new CreateEmployeeOrderRequest(clientId, null, [new EmployeeOrderLineItemRequest(productId, 1)], addressKey));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<OrderDto>())!;
    }

    private async Task RemoveAllAddressesAsync(Guid accountId)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.ClientAddresses.RemoveRange(db.ClientAddresses.Where(a => a.ClientAccountId == accountId));
        await db.SaveChangesAsync();
    }

    private async Task ClearDefaultFlagsAsync(Guid accountId)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        foreach (var address in db.ClientAddresses.Where(a => a.ClientAccountId == accountId))
        {
            address.IsDefault = false;
        }

        await db.SaveChangesAsync();
    }

    private async Task SetOrderStatusAsync(Guid orderId, OrderStatus status)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        (await db.Orders.FindAsync(orderId))!.Status = status;
        await db.SaveChangesAsync();
    }

    // ---- AC-2: a quote is requested with an address

    [Fact]
    public async Task AQuote_WithoutAKey_IsDeliveredToTheDefaultAddress_AndCarriesTheSnapshot()
    {
        var admin = await _factory.AdminAsync();
        var (client, _) = await _factory.RegisterClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        await AddAsync(client, TestAddresses.Other("200", label: "Filial"));

        var quote = await RequestQuoteAsync(client, product);

        var snapshot = quote.DeliveryAddressSnapshot!;
        Assert.Equal("Endereço principal", snapshot.Label);
        Assert.Equal("01001000", snapshot.PostalCode);
        Assert.Equal("Praça da Sé", snapshot.Street);
        Assert.Equal("10", snapshot.Number);
        Assert.Equal("São Paulo", snapshot.City);
        Assert.Equal("SP", snapshot.State);
        Assert.Equal("Praça da Sé, 10, Sé, São Paulo/SP, CEP 01001-000", snapshot.Line);
        var mine = (await client.GetFromJsonAsync<List<QuoteDto>>("/api/quotes/mine"))!;
        Assert.Equal(snapshot, mine.Single().DeliveryAddressSnapshot);
    }

    [Fact]
    public async Task AQuote_WithAKey_IsDeliveredToThatAddress_AndTheResponseNeverCarriesTheKey()
    {
        var admin = await _factory.AdminAsync();
        var (client, _) = await _factory.RegisterClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        var filial = await AddAsync(client, TestAddresses.Other("200", label: "Filial Campinas"));

        var response = await client.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(product, 1)], filial.Key));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain(filial.Key.ToString(), body, StringComparison.OrdinalIgnoreCase);
        var snapshot = System.Text.Json.JsonSerializer.Deserialize<QuoteDto>(body, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web))!.DeliveryAddressSnapshot!;
        Assert.Equal("Filial Campinas", snapshot.Label);
        Assert.Equal("Rua Barão de Jaguara", snapshot.Street);
        Assert.Equal("Sala 3", snapshot.Complement);
        Assert.Equal("Entregar de manhã", snapshot.Notes);
    }

    [Fact]
    public async Task ACustomerWithoutAnAddressThatCanReceiveGoods_IsToldToRegisterOne()
    {
        var admin = await _factory.AdminAsync();
        var (client, id) = await _factory.RegisterClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        await RemoveAllAddressesAsync(id);
        await AddAsync(client, TestAddresses.Other("1", ClientAddressKind.Billing));

        var response = await client.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(product, 1)]));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Cadastre um endereço de entrega.", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task AMigratedCustomerWithNoAddressAtAll_GetsTheSameMessage_NotAnError()
    {
        var admin = await _factory.AdminAsync();
        var (client, id) = await _factory.RegisterClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        await RemoveAllAddressesAsync(id);

        var profile = await ProfileAsync(client);
        var response = await client.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(product, 1)]));

        Assert.Null(profile.DefaultDeliveryKey);
        Assert.Null(profile.BillingAddressKey);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Cadastre um endereço de entrega.", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task WithoutAFlaggedDefault_TheOnlyDeliveryAddressIsUsed_ButSeveralMustBeChosenFrom()
    {
        var admin = await _factory.AdminAsync();
        var (client, id) = await _factory.RegisterClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        await ClearDefaultFlagsAsync(id); // a migrated customer with no default flagged

        var single = await RequestQuoteAsync(client, product);
        await AddAsync(client, TestAddresses.Other("200", ClientAddressKind.Delivery));
        await ClearDefaultFlagsAsync(id);
        var several = await client.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest([new QuoteLineItemRequest(product, 1)]));

        Assert.Equal("Endereço principal", single.DeliveryAddressSnapshot!.Label);
        Assert.Equal(HttpStatusCode.BadRequest, several.StatusCode);
        Assert.Equal("Escolha o endereço de entrega.", await several.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task AnAddressOfAnotherCustomer_OrAnUnknownKey_Is404_AndABillingOnlyOne_Is400()
    {
        var admin = await _factory.AdminAsync();
        var (alice, _) = await _factory.RegisterClientAsync();
        var (bob, _) = await _factory.RegisterClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        var bobsKey = (await ProfileAsync(bob)).Addresses.Single().Key;
        var billingOnly = await AddAsync(alice, TestAddresses.Other("9", ClientAddressKind.Billing, "Só cobrança"));
        var lines = new List<QuoteLineItemRequest> { new(product, 1) };

        Assert.Equal(HttpStatusCode.NotFound, (await alice.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest(lines, bobsKey))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await alice.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest(lines, Guid.NewGuid()))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await alice.PostAsJsonAsync("/api/quotes", new CreateQuoteRequest(lines, billingOnly.Key))).StatusCode);
        Assert.Empty((await alice.GetFromJsonAsync<List<QuoteDto>>("/api/quotes/mine"))!); // nothing was created by the refused requests
    }

    // ---- AC-3: change until accepted; accepting copies the snapshot

    [Fact]
    public async Task TheCustomerChangesTheAddress_WhileSubmittedAndWhilePriced_AndOthersAreNotAffected()
    {
        var admin = await _factory.AdminAsync();
        var (client, _) = await _factory.RegisterClientAsync();
        var (other, _) = await _factory.RegisterClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        var filial = await AddAsync(client, TestAddresses.Other("200", label: "Filial"));
        var armazem = await AddAsync(client, TestAddresses.Other("300", label: "Armazém"));
        var quote = await RequestQuoteAsync(client, product);
        var otherQuote = await RequestQuoteAsync(other, product);

        var whileSubmitted = await ChangeAsync(client, quote.Number, filial.Key);
        await PriceAsync(admin, quote);
        var whilePriced = await ChangeAsync(client, quote.Number, armazem.Key);

        Assert.Equal(HttpStatusCode.OK, whileSubmitted.StatusCode);
        Assert.Equal("Filial", (await whileSubmitted.Content.ReadFromJsonAsync<QuoteDto>())!.DeliveryAddressSnapshot!.Label);
        Assert.Equal(HttpStatusCode.OK, whilePriced.StatusCode);
        var changed = (await whilePriced.Content.ReadFromJsonAsync<QuoteDto>())!;
        Assert.Equal("Armazém", changed.DeliveryAddressSnapshot!.Label);
        Assert.Equal(QuoteStatus.Priced, changed.Status);
        var mine = (await client.GetFromJsonAsync<List<QuoteDto>>("/api/quotes/mine"))!;
        Assert.Equal("Armazém", mine.Single().DeliveryAddressSnapshot!.Label);
        var theirs = (await other.GetFromJsonAsync<List<QuoteDto>>("/api/quotes/mine"))!;
        Assert.Equal(otherQuote.Number, theirs.Single().Number);
        Assert.Equal("Endereço principal", theirs.Single().DeliveryAddressSnapshot!.Label);
    }

    [Fact]
    public async Task TheAddressOfAnAcceptedOrRejectedQuote_CannotChange_409()
    {
        var admin = await _factory.AdminAsync();
        var (client, _) = await _factory.RegisterClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        var filial = await AddAsync(client, TestAddresses.Other("200", label: "Filial"));
        var accepted = await PriceAsync(admin, await RequestQuoteAsync(client, product));
        var rejected = await PriceAsync(admin, await RequestQuoteAsync(client, product));
        (await client.PostAsync($"/api/quotes/{accepted.Id}/accept", null)).EnsureSuccessStatusCode();
        (await client.PostAsync($"/api/quotes/{rejected.Id}/reject", null)).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.Conflict, (await ChangeAsync(client, accepted.Number, filial.Key)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await ChangeAsync(client, rejected.Number, filial.Key)).StatusCode);
        var mine = (await client.GetFromJsonAsync<List<QuoteDto>>("/api/quotes/mine"))!;
        Assert.All(mine, q => Assert.Equal("Endereço principal", q.DeliveryAddressSnapshot!.Label));
    }

    [Fact]
    public async Task SomeoneElsesQuote_AnUnknownQuote_AndAForeignAddress_AreAll404()
    {
        var admin = await _factory.AdminAsync();
        var (alice, _) = await _factory.RegisterClientAsync();
        var (bob, _) = await _factory.RegisterClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        var bobsKey = (await ProfileAsync(bob)).Addresses.Single().Key;
        var alicesKey = (await ProfileAsync(alice)).Addresses.Single().Key;
        var quote = await RequestQuoteAsync(alice, product);

        Assert.Equal(HttpStatusCode.NotFound, (await ChangeAsync(bob, quote.Number, bobsKey)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await ChangeAsync(alice, quote.Number + 1000, alicesKey)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await ChangeAsync(alice, quote.Number, bobsKey)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await ChangeAsync(alice, quote.Number, Guid.NewGuid())).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await ChangeAsync(_factory.CreateClient(), quote.Number, alicesKey)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await ChangeAsync(admin, quote.Number, alicesKey)).StatusCode);
    }

    [Fact]
    public async Task ASuspendedCustomer_CannotReAddressAnOpenQuote_403()
    {
        var admin = await _factory.AdminAsync();
        var (client, id) = await _factory.RegisterClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        var filial = await AddAsync(client, TestAddresses.Other("200", label: "Filial"));
        var quote = await RequestQuoteAsync(client, product);
        (await admin.PutAsync($"/api/admin/clients/{id}/suspend", null)).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.Forbidden, (await ChangeAsync(client, quote.Number, filial.Key)).StatusCode);
    }

    [Fact]
    public async Task AQuoteFromBeforeAddresses_CannotBeAccepted_409_UntilTheCustomerPicksOne()
    {
        var admin = await _factory.AdminAsync();
        var (client, _) = await _factory.RegisterClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        var quote = await PriceAsync(admin, await RequestQuoteAsync(client, product));
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            // What a quote made before MRV-9.6 looks like: no snapshot at all.
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var stored = await db.Quotes.FindAsync(quote.Id);
            stored!.CopyFrom(new Marvi.Domain.Identity.ClientAddress());
            stored.DeliveryAddressId = null;
            stored.DeliveryAddressLabel = null;
            await db.SaveChangesAsync();
        }

        var refused = await client.PostAsync($"/api/quotes/{quote.Id}/accept", null);
        var key = (await ProfileAsync(client)).Addresses.Single().Key;
        var picked = await ChangeAsync(client, quote.Number, key);
        var accepted = await client.PostAsync($"/api/quotes/{quote.Id}/accept", null);

        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal("Escolha o endereço de entrega antes de aceitar o orçamento.", await refused.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, picked.StatusCode);
        Assert.Equal(HttpStatusCode.Created, accepted.StatusCode);
        Assert.NotEmpty((await accepted.Content.ReadFromJsonAsync<OrderDto>())!.DeliveryAddress);
        Assert.Single((await client.GetFromJsonAsync<List<OrderDto>>("/api/orders/mine"))!);
    }

    [Fact]
    public async Task TheLegacyFreeText_IsCappedAt500Characters_AndRefusesControlAndFormatCharacters()
    {
        var admin = await _factory.AdminAsync();
        var (_, id) = await _factory.RegisterClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        await RemoveAllAddressesAsync(id);
        var lines = new List<EmployeeOrderLineItemRequest> { new(product, 1) };

        var atLimit = await admin.PostAsJsonAsync("/api/employee/orders", new CreateEmployeeOrderRequest(id, new string('a', 500), lines));
        var tooLong = await admin.PostAsJsonAsync("/api/employee/orders", new CreateEmployeeOrderRequest(id, new string('a', 501), lines));
        var lineBreak = await admin.PostAsJsonAsync("/api/employee/orders", new CreateEmployeeOrderRequest(id, "Rua A" + (char)10 + "Rua B", lines));
        var zeroWidth = await admin.PostAsJsonAsync("/api/employee/orders", new CreateEmployeeOrderRequest(id, "Rua" + (char)0x200B + "A", lines));
        var bidi = await admin.PostAsJsonAsync("/api/employee/orders", new CreateEmployeeOrderRequest(id, "Rua " + (char)0x202E + "A", lines));

        Assert.Equal(HttpStatusCode.Created, atLimit.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, lineBreak.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, zeroWidth.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, bidi.StatusCode);
        var history = (await admin.GetFromJsonAsync<PagedResult<OrderHistoryItemDto>>($"/api/employee/orders/history?clientId={id}"))!;
        Assert.Single(history.Items);
    }

    [Fact]
    public async Task AcceptingAQuote_GivesTheOrderTheQuotesSnapshot_AndNeverAnEmptyAddress()
    {
        var admin = await _factory.AdminAsync();
        var (client, _) = await _factory.RegisterClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        var filial = await AddAsync(client, TestAddresses.Other("200", label: "Filial"));
        var quote = await PriceAsync(admin, await RequestQuoteAsync(client, product, filial.Key));

        var accepted = await client.PostAsync($"/api/quotes/{quote.Id}/accept", null);

        Assert.Equal(HttpStatusCode.Created, accepted.StatusCode);
        var order = (await accepted.Content.ReadFromJsonAsync<OrderDto>())!;
        Assert.Equal(quote.Id, order.QuoteId);
        Assert.Equal(quote.DeliveryAddressSnapshot, order.DeliveryAddressSnapshot);
        Assert.Equal("Filial", order.DeliveryAddressSnapshot!.Label);
        Assert.Equal(order.DeliveryAddressSnapshot.Line, order.DeliveryAddress);
        Assert.NotEmpty(order.DeliveryAddress);
        var mine = (await client.GetFromJsonAsync<List<OrderDto>>("/api/orders/mine"))!;
        Assert.Equal(order.DeliveryAddress, mine.Single().DeliveryAddress);
    }

    // ---- AC-8: editing or removing an address leaves the documents unchanged

    [Fact]
    public async Task EditingOrRemovingTheAddressLater_LeavesTheQuoteAndTheOrderAsTheyWere()
    {
        var admin = await _factory.AdminAsync();
        var (client, _) = await _factory.RegisterClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        var filial = await AddAsync(client, TestAddresses.Other("200", label: "Filial"));
        var armazem = await AddAsync(client, TestAddresses.Other("300", label: "Armazém"));
        var forOrder = await PriceAsync(admin, await RequestQuoteAsync(client, product, filial.Key));
        var order = (await (await client.PostAsync($"/api/quotes/{forOrder.Id}/accept", null)).Content.ReadFromJsonAsync<OrderDto>())!;
        var openQuote = await RequestQuoteAsync(client, product, armazem.Key);

        var edit = await client.PutAsJsonAsync($"/api/client/addresses/{filial.Key}", TestAddresses.Other("200", label: "Filial NOVA") with { Street = "Rua Mudada", PostalCode = "13010-999" });
        var remove = await client.DeleteAsync($"/api/client/addresses/{armazem.Key}");

        Assert.Equal(HttpStatusCode.OK, edit.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, remove.StatusCode);
        var orders = (await client.GetFromJsonAsync<List<OrderDto>>("/api/orders/mine"))!;
        Assert.Equal(order.DeliveryAddressSnapshot, orders.Single().DeliveryAddressSnapshot);
        Assert.Equal("Rua Barão de Jaguara", orders.Single().DeliveryAddressSnapshot!.Street);
        Assert.Equal(order.DeliveryAddress, orders.Single().DeliveryAddress);
        var quotes = (await client.GetFromJsonAsync<List<QuoteDto>>("/api/quotes/mine"))!;
        var open = quotes.Single(q => q.Number == openQuote.Number);
        Assert.Equal(openQuote.DeliveryAddressSnapshot, open.DeliveryAddressSnapshot);
        Assert.Equal("Armazém", open.DeliveryAddressSnapshot!.Label);
    }

    [Fact]
    public async Task TheDefaultAddressRule_StillApplies_EvenWhenADocumentUsesTheAddress()
    {
        var admin = await _factory.AdminAsync();
        var (client, _) = await _factory.RegisterClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        var main = (await ProfileAsync(client)).Addresses.Single();
        await RequestQuoteAsync(client, product, main.Key);

        var remove = await client.DeleteAsync($"/api/client/addresses/{main.Key}");

        Assert.Equal(HttpStatusCode.Conflict, remove.StatusCode);
    }

    // ---- AC-4: staff place an order for a customer's address

    [Fact]
    public async Task StaffPlaceAnOrder_ForAChosenAddress_OrTheDefault_AndItIsInTheHistoryAndTheCustomersList()
    {
        var admin = await _factory.AdminAsync();
        var (client, id) = await _factory.RegisterClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        var filial = await AddAsync(client, TestAddresses.Other("200", label: "Filial"));

        var chosenOrder = await PlaceOrderAsync(admin, id, product, filial.Key);
        var defaultOrder = await PlaceOrderAsync(admin, id, product);

        Assert.Equal("Filial", chosenOrder.DeliveryAddressSnapshot!.Label);
        Assert.Equal(chosenOrder.DeliveryAddressSnapshot.Line, chosenOrder.DeliveryAddress);
        Assert.Equal("Endereço principal", defaultOrder.DeliveryAddressSnapshot!.Label);
        var history = (await admin.GetFromJsonAsync<PagedResult<OrderHistoryItemDto>>($"/api/employee/orders/history?clientId={id}"))!;
        Assert.All(history.Items, o => Assert.NotNull(o.DeliveryAddressSnapshot));
        Assert.Contains(history.Items, o => o.DeliveryAddressSnapshot!.Label == "Filial");
        var page = (await admin.GetFromJsonAsync<ClientProfileDto>($"/api/employee/clients/{id}"))!;
        Assert.Contains(page.Orders, o => o.DeliveryAddressSnapshot?.Label == "Filial");
        Assert.Equal(2, (await client.GetFromJsonAsync<List<OrderDto>>("/api/orders/mine"))!.Count);
    }

    [Fact]
    public async Task StaffCannotUseAnotherCustomersAddress_NorInventOne_ForACustomerWhoHasStructuredAddresses()
    {
        var admin = await _factory.AdminAsync();
        var (_, aliceId) = await _factory.RegisterClientAsync();
        var (bob, _) = await _factory.RegisterClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        var bobsKey = (await ProfileAsync(bob)).Addresses.Single().Key;
        var lines = new List<EmployeeOrderLineItemRequest> { new(product, 1) };

        Assert.Equal(HttpStatusCode.NotFound, (await admin.PostAsJsonAsync("/api/employee/orders", new CreateEmployeeOrderRequest(aliceId, null, lines, bobsKey))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.PostAsJsonAsync("/api/employee/orders", new CreateEmployeeOrderRequest(aliceId, null, lines, Guid.NewGuid()))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync("/api/employee/orders", new CreateEmployeeOrderRequest(aliceId, "Rua Inventada, 1", lines))).StatusCode);
        var history = (await admin.GetFromJsonAsync<PagedResult<OrderHistoryItemDto>>($"/api/employee/orders/history?clientId={aliceId}"))!;
        Assert.Empty(history.Items);
    }

    [Fact]
    public async Task ForACustomerWithoutAnyStructuredAddress_TheFreeTextIsStillAcceptedForNow()
    {
        var admin = await _factory.AdminAsync();
        var (_, id) = await _factory.RegisterClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        await RemoveAllAddressesAsync(id);
        var lines = new List<EmployeeOrderLineItemRequest> { new(product, 1) };

        var legacy = await admin.PostAsJsonAsync("/api/employee/orders", new CreateEmployeeOrderRequest(id, "  Rua Antiga, 5  ", lines));
        var nothing = await admin.PostAsJsonAsync("/api/employee/orders", new CreateEmployeeOrderRequest(id, null, lines));

        Assert.Equal(HttpStatusCode.Created, legacy.StatusCode);
        var order = (await legacy.Content.ReadFromJsonAsync<OrderDto>())!;
        Assert.Equal("Rua Antiga, 5", order.DeliveryAddress);
        Assert.Null(order.DeliveryAddressSnapshot);
        Assert.Equal(HttpStatusCode.BadRequest, nothing.StatusCode);
        Assert.Equal("Cadastre um endereço de entrega.", await nothing.Content.ReadAsStringAsync());
    }

    // ---- AC-5: staff amend an order that is not shipped yet

    [Fact]
    public async Task StaffAmendTheAddressOfAnOrderNotShippedYet_AuditedWithBeforeAndAfter()
    {
        var admin = await _factory.AdminAsync();
        var (client, id) = await _factory.RegisterClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        var filial = await AddAsync(client, TestAddresses.Other("200", label: "Filial"));
        var order = await PlaceOrderAsync(admin, id, product);
        await SetOrderStatusAsync(order.Id, OrderStatus.Backordered);

        var amended = await AmendAsync(admin, order.Number, filial.Key);

        Assert.Equal(HttpStatusCode.OK, amended.StatusCode);
        var changed = (await amended.Content.ReadFromJsonAsync<OrderDto>())!;
        Assert.Equal("Filial", changed.DeliveryAddressSnapshot!.Label);
        Assert.Equal(changed.DeliveryAddressSnapshot.Line, changed.DeliveryAddress);
        Assert.Equal(OrderStatus.Backordered, changed.Status);
        var entries = (await admin.GetFromJsonAsync<List<AuditLogEntryDto>>("/api/admin/audit-log?pageSize=200"))!;
        var entry = Assert.Single(entries, e => e.EntityName == nameof(Order) && e.EntityId == order.Id && e.Action == "Update");
        Assert.Equal(order.Number, entry.EntityNumber);
        using var details = System.Text.Json.JsonDocument.Parse(entry.Details["data"]);
        Assert.Equal("Endereço principal", details.RootElement.GetProperty("Before").GetProperty("Label").GetString());
        Assert.Equal("Filial", details.RootElement.GetProperty("After").GetProperty("Label").GetString());
        Assert.Equal(order.Number, details.RootElement.GetProperty("OrderNumber").GetInt32());
        var customers = (await client.GetFromJsonAsync<List<OrderDto>>("/api/orders/mine"))!;
        Assert.Equal("Filial", customers.Single().DeliveryAddressSnapshot!.Label);
    }

    [Theory]
    [InlineData(OrderStatus.Fulfilled)]
    [InlineData(OrderStatus.Cancelled)]
    public async Task TheAddressOfAShippedOrAClosedOrder_CannotBeAmended_409(OrderStatus status)
    {
        var admin = await _factory.AdminAsync();
        var (client, id) = await _factory.RegisterClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        var filial = await AddAsync(client, TestAddresses.Other("200", label: "Filial"));
        var order = await PlaceOrderAsync(admin, id, product);
        await SetOrderStatusAsync(order.Id, status);

        var refused = await AmendAsync(admin, order.Number, filial.Key);

        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        var mine = (await client.GetFromJsonAsync<List<OrderDto>>("/api/orders/mine"))!;
        Assert.Equal("Endereço principal", mine.Single().DeliveryAddressSnapshot!.Label);
    }

    [Fact]
    public async Task TheAmendOfAnOrder_RefusesAForeignAddress_AnUnknownOrder_AndTheWrongRoles()
    {
        var admin = await _factory.AdminAsync();
        var (client, id) = await _factory.RegisterClientAsync();
        var (bob, _) = await _factory.RegisterClientAsync();
        var product = await admin.CreatePricedProductAsync(10m);
        var bobsKey = (await ProfileAsync(bob)).Addresses.Single().Key;
        var ownKey = (await ProfileAsync(client)).Addresses.Single().Key;
        var order = await PlaceOrderAsync(admin, id, product);

        Assert.Equal(HttpStatusCode.NotFound, (await AmendAsync(admin, order.Number, bobsKey)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await AmendAsync(admin, order.Number + 1000, ownKey)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await AmendAsync(_factory.CreateClient(), order.Number, ownKey)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AmendAsync(client, order.Number, ownKey)).StatusCode);
    }
}
