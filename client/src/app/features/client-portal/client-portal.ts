import { Component, OnInit, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PT } from '../../core/i18n/pt-br';
import { isSamePlace } from '../../shared/format/address';
import type { ClientAddress, WithAddresses } from '../../shared/models/client-address.model';
import { DeliveryPicker } from '../../shared/ui/delivery-picker/delivery-picker';
import { DeliveryTo } from '../../shared/ui/delivery-to/delivery-to';
import { action } from '../../core/http/action';
import { loadable } from '../../core/http/loadable';
import { BrlPipe } from '../../shared/format/brl.pipe';
import { DocumentNumberPipe } from '../../shared/format/number.pipes';
import { PtDatePipe } from '../../shared/format/pt-date.pipe';
import type { ProductListItem } from '../../shared/models/catalog.model';
import { ProductPicker } from '../../shared/ui/product-picker/product-picker';
import { ErrorAlert } from '../../shared/ui/error-alert/error-alert';
import { LoadState } from '../../shared/ui/load-state/load-state';
import { QuotesService, Quote } from './api/quotes.service';
import { OrdersService, Order } from './api/orders.service';
import { ClientProfile, ProfileService } from './api/profile.service';
import { ClientProfileCard } from './profile/client-profile';

interface BasketLine {
  productId: string;
  name: string;
  qty: number;
}

@Component({
  selector: 'app-client-portal',
  imports: [FormsModule, ErrorAlert, LoadState, ProductPicker, BrlPipe, PtDatePipe, DocumentNumberPipe, ClientProfileCard, DeliveryPicker, DeliveryTo],
  templateUrl: './client-portal.html',
})
export class ClientPortal implements OnInit {
  protected readonly t = PT.clientPortal;
  protected readonly refs = PT.numbers;
  protected readonly statuses = PT.statuses;
  protected readonly d = PT.delivery;
  private readonly quotesService = inject(QuotesService);
  private readonly ordersService = inject(OrdersService);
  private readonly profileService = inject(ProfileService);

  // Signals, not plain fields: the app is zoneless, so only signal writes re-render after HTTP callbacks.
  protected readonly quotes = loadable(() => this.quotesService.getMine(), [] as Quote[]);
  protected readonly orders = loadable(() => this.ordersService.getMine(), [] as Order[]);
  /** The customer's own account: its status decides whether they may build quotes at all. */
  protected readonly account = loadable(() => this.profileService.get(), null as ClientProfile | null);
  protected readonly status = computed(() => (this.account.loaded() ? this.account.data()?.status ?? null : null));

  protected readonly basket = signal<BasketLine[]>([]);
  /** The customer's addresses and their default delivery address: from the profile, and kept current by the profile card below (MRV-9.6). */
  protected readonly addresses = signal<ClientAddress[]>([]);
  protected readonly defaultKey = signal<string | null>(null);
  /** The address chosen in "Entregar em" for the next quote; null until one is chosen (a customer with none cannot ask for a quote). */
  protected readonly deliveryKey = signal<string | null>(null);
  protected readonly canRequest = computed(() => this.basket().length > 0 && this.deliveryKey() !== null && !this.requestAction.busy());
  private readonly profileCard = viewChild(ClientProfileCard);
  /** The number of the quote whose address is being changed, with the address picked for it. */
  protected readonly changingNumber = signal<number | null>(null);
  protected readonly changeKey = signal<string | null>(null);
  protected readonly changeAction = action();
  protected readonly changedNumber = signal<number | null>(null);
  protected readonly requestSent = signal(false);
  protected readonly requestAction = action();
  protected readonly acceptAction = action();
  protected readonly rejectAction = action();
  /** The quote whose rejection is waiting for a second, confirming click (it cannot be undone). */
  protected readonly confirmingRejectId = signal<string | null>(null);

  constructor() {
    effect(() => {
      const profile = this.account.data();
      if (profile) {
        untracked(() => this.useAddresses(profile));
      }
    });
  }

  ngOnInit(): void {
    this.quotes.load();
    this.orders.load();
    this.account.load();
  }

  addToBasket(product: ProductListItem): void {
    this.requestSent.set(false);
    this.basket.update((lines) =>
      lines.some((l) => l.productId === product.id)
        ? lines.map((l) => (l.productId === product.id ? { ...l, qty: l.qty + 1 } : l))
        : [...lines, { productId: product.id, name: product.name, qty: 1 }],
    );
  }

  setQuantity(productId: string, value: number | string | null): void {
    const qty = Math.floor(Number(value));
    this.basket.update((lines) => lines.map((l) => (l.productId === productId ? { ...l, qty: qty >= 1 ? qty : 1 } : l)));
  }

  removeFromBasket(productId: string): void {
    this.basket.update((lines) => lines.filter((l) => l.productId !== productId));
  }

  protected useAddresses(profile: WithAddresses): void {
    this.addresses.set(profile.addresses);
    this.defaultKey.set(profile.defaultDeliveryKey);
  }

  /** The link under "Entregar em": opens the add-address form of the profile card at the end of the page. */
  protected openAddAddress(): void {
    this.profileCard()?.startAdd();
  }

  requestQuote(): void {
    const lines = this.basket();
    const key = this.deliveryKey();
    if (lines.length === 0 || key === null) {
      return;
    }
    this.requestSent.set(false);
    this.requestAction.run(
      this.quotesService.createQuote({ lineItems: lines.map((l) => ({ productId: l.productId, qty: l.qty })), deliveryAddressKey: key }),
      () => {
        this.basket.set([]);
        this.requestSent.set(true);
        this.quotes.load();
      },
    );
  }

  /** A quote can be sent to another address until it is accepted. */
  protected canChangeAddress(quote: Quote): boolean {
    return quote.status === 'Submitted' || quote.status === 'Priced';
  }

  /** Opens the picker for a quote with its current address selected (found by place, as the snapshot carries no key). */
  protected startChange(quote: Quote): void {
    const current = quote.deliveryAddressSnapshot;
    const same = current ? this.addresses().find((a) => isSamePlace(a, { postalCode: current.postalCode, number: current.number, complement: current.complement })) : undefined;
    this.changeAction.reset();
    this.changedNumber.set(null);
    this.changeKey.set(same?.key ?? null);
    this.changingNumber.set(quote.number);
  }

  protected cancelChange(): void {
    this.changingNumber.set(null);
    this.changeAction.reset();
  }

  protected saveChange(quote: Quote): void {
    const key = this.changeKey();
    if (key === null) {
      return;
    }
    this.changeAction.run(this.quotesService.changeDeliveryAddress(quote.number, key), () => {
      this.changingNumber.set(null);
      this.changedNumber.set(quote.number);
      this.quotes.load();
    });
  }

  rejectQuote(id: string): void {
    this.rejectAction.run(this.quotesService.reject(id), () => {
      this.confirmingRejectId.set(null);
      this.quotes.load();
    });
  }

  /** A priced quote without an address (made before addresses were chosen) cannot be accepted: the picker opens instead, and accepting follows once one is chosen. */
  protected tryAccept(quote: Quote): void {
    if (!quote.deliveryAddressSnapshot) {
      this.startChange(quote);
      return;
    }
    this.acceptQuote(quote.id);
  }

  acceptQuote(id: string): void {
    this.acceptAction.run(this.quotesService.accept(id), () => {
      this.quotes.load();
      this.orders.load();
    });
  }
}
