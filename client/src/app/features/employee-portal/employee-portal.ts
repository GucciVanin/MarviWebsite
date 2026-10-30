import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PT } from '../../core/i18n/pt-br';
import { action } from '../../core/http/action';
import { loadable } from '../../core/http/loadable';
import { BrlPipe } from '../../shared/format/brl.pipe';
import { CustomerNumberPipe, DocumentNumberPipe, parseCustomerNumber } from '../../shared/format/number.pipes';
import { PtDatePipe } from '../../shared/format/pt-date.pipe';
import type { ProductListItem } from '../../shared/models/catalog.model';
import type { Order } from '../../shared/models/order.model';
import type { Quote } from '../../shared/models/quote.model';
import { CustomerLookup } from '../../shared/ui/customer-lookup/customer-lookup';
import { ErrorAlert } from '../../shared/ui/error-alert/error-alert';
import { LoadState } from '../../shared/ui/load-state/load-state';
import { ProductPicker } from '../../shared/ui/product-picker/product-picker';
import type { PagedResult } from '../../shared/models/paged.model';
import { ClientProfile, ClientSummary, EmployeeService, InventoryRecord } from './api/employee.service';

interface OrderLine {
  productId: string;
  name: string;
  qty: number;
}

@Component({
  selector: 'app-employee-portal',
  imports: [FormsModule, RouterLink, CustomerLookup, ErrorAlert, LoadState, ProductPicker, BrlPipe, PtDatePipe, CustomerNumberPipe, DocumentNumberPipe],
  templateUrl: './employee-portal.html',
})
export class EmployeePortal implements OnInit {
  protected readonly t = PT.employeePortal;
  protected readonly refs = PT.numbers;
  private readonly employeeService = inject(EmployeeService);
  private readonly route = inject(ActivatedRoute);

  // Signals, not plain fields: the app is zoneless, so only signal writes re-render after HTTP callbacks.
  protected readonly quoteQueue = loadable(() => this.employeeService.getQuoteQueue(), [] as Quote[]);
  protected readonly inventory = loadable(() => this.employeeService.getInventory(), [] as InventoryRecord[]);

  // Pricing: what the employee typed per quote line (until then, the system's suggestion is shown).
  protected readonly typedPrices = signal<Record<string, string | number | null>>({});
  protected readonly pricedQuoteId = signal<string | null>(null);
  protected readonly priceProblem = signal<string | null>(null);
  protected readonly priceAction = action();
  protected readonly pricesSent = signal(false);

  // Customer and new order.
  protected readonly clientSearch = signal('');
  protected readonly clientMatches = signal<PagedResult<ClientSummary> | null>(null);
  protected readonly searchAction = action({ latestOnly: true });
  protected readonly clientProfile = signal<ClientProfile | null>(null);
  protected readonly lookupAction = action();
  protected readonly deliveryAddress = signal('');
  protected readonly orderLines = signal<OrderLine[]>([]);
  protected readonly orderAction = action();
  protected readonly placedOrder = signal<Order | null>(null);

  ngOnInit(): void {
    this.quoteQueue.load();
    this.inventory.load();
    // "Iniciar pedido" on the customer page arrives as ?cliente=C-000042: open that customer's order form.
    const number = parseCustomerNumber(this.route.snapshot.queryParamMap.get('cliente'));
    if (number !== null) {
      this.lookupAction.run(this.employeeService.getClientByNumber(number), (profile) => this.useCustomer(profile));
    }
  }

  // ---- pricing quotes

  priceValue(lineId: string, suggested: number | null): string | number | null {
    const typed = this.typedPrices()[lineId];
    return typed === undefined ? suggested : typed;
  }

  setPrice(lineId: string, value: string | number | null): void {
    this.typedPrices.update((prices) => ({ ...prices, [lineId]: value }));
  }

  sendPrices(quote: Quote): void {
    this.pricedQuoteId.set(quote.id);
    this.pricesSent.set(false);
    this.priceProblem.set(null);

    const prices = quote.lineItems.map((item) => ({
      lineItemId: item.id,
      finalUnitPrice: Number(this.priceValue(item.id, item.suggestedUnitPrice)),
    }));
    const complete = quote.lineItems.every((item) => {
      const value = this.priceValue(item.id, item.suggestedUnitPrice);
      return value !== null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
    });
    if (!complete) {
      this.priceProblem.set(this.t.priceAllRequired);
      return;
    }

    this.priceAction.run(this.employeeService.priceQuote(quote.id, { lineItems: prices }), () => {
      this.pricesSent.set(true);
      this.quoteQueue.load();
    });
  }

  // ---- customer and order

  /** Finds customers by company name; the employee then picks one of the matches. */
  searchClients(): void {
    this.searchAction.run(this.employeeService.searchClients(this.clientSearch().trim()), (page) => this.clientMatches.set(page));
  }

  /**
   * The customer the lookup widget is showing (from a queued quote's "Consultar cliente" or a search match) becomes the customer of the
   * order form below, with a fresh basket.
   */
  useCustomer(profile: ClientProfile): void {
    // Looking at the customer already in the order form again must not empty the basket.
    if (this.clientProfile()?.customerNumber !== profile.customerNumber) {
      this.placedOrder.set(null);
      this.orderLines.set([]);
    }
    this.clientProfile.set(profile);
  }

  addOrderLine(product: ProductListItem): void {
    this.placedOrder.set(null);
    this.orderLines.update((lines) =>
      lines.some((l) => l.productId === product.id)
        ? lines.map((l) => (l.productId === product.id ? { ...l, qty: l.qty + 1 } : l))
        : [...lines, { productId: product.id, name: product.name, qty: 1 }],
    );
  }

  setOrderQuantity(productId: string, value: number | string | null): void {
    const qty = Math.floor(Number(value));
    this.orderLines.update((lines) => lines.map((l) => (l.productId === productId ? { ...l, qty: qty >= 1 ? qty : 1 } : l)));
  }

  removeOrderLine(productId: string): void {
    this.orderLines.update((lines) => lines.filter((l) => l.productId !== productId));
  }

  canPlaceOrder(): boolean {
    return this.orderLines().length > 0 && this.deliveryAddress().trim().length > 0 && !this.orderAction.busy();
  }

  placeOrder(): void {
    const profile = this.clientProfile();
    if (!profile || !this.canPlaceOrder()) {
      return;
    }
    this.orderAction.run(
      this.employeeService.createOrder({
        clientId: profile.id,
        deliveryAddress: this.deliveryAddress().trim(),
        lineItems: this.orderLines().map((l) => ({ productId: l.productId, qty: l.qty })),
      }),
      (order) => {
        this.placedOrder.set(order);
        this.orderLines.set([]);
        this.deliveryAddress.set('');
      },
    );
  }
}
