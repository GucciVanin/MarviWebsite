import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PT } from '../../core/i18n/pt-br';
import { action } from '../../core/http/action';
import { loadable } from '../../core/http/loadable';
import { BrlPipe } from '../../shared/format/brl.pipe';
import { PtDatePipe } from '../../shared/format/pt-date.pipe';
import type { ProductListItem } from '../../shared/models/catalog.model';
import { ProductPicker } from '../../shared/ui/product-picker/product-picker';
import { ErrorAlert } from '../../shared/ui/error-alert/error-alert';
import { LoadState } from '../../shared/ui/load-state/load-state';
import { QuotesService, Quote } from './api/quotes.service';
import { OrdersService, Order } from './api/orders.service';
import { ClientProfileCard } from './profile/client-profile';

interface BasketLine {
  productId: string;
  name: string;
  qty: number;
}

@Component({
  selector: 'app-client-portal',
  imports: [FormsModule, ErrorAlert, LoadState, ProductPicker, BrlPipe, PtDatePipe, ClientProfileCard],
  templateUrl: './client-portal.html',
})
export class ClientPortal implements OnInit {
  protected readonly t = PT.clientPortal;
  protected readonly statuses = PT.statuses;
  private readonly quotesService = inject(QuotesService);
  private readonly ordersService = inject(OrdersService);

  // Signals, not plain fields: the app is zoneless, so only signal writes re-render after HTTP callbacks.
  protected readonly quotes = loadable(() => this.quotesService.getMine(), [] as Quote[]);
  protected readonly orders = loadable(() => this.ordersService.getMine(), [] as Order[]);

  protected readonly basket = signal<BasketLine[]>([]);
  protected readonly requestSent = signal(false);
  protected readonly requestAction = action();
  protected readonly acceptAction = action();
  protected readonly rejectAction = action();
  /** The quote whose rejection is waiting for a second, confirming click (it cannot be undone). */
  protected readonly confirmingRejectId = signal<string | null>(null);

  ngOnInit(): void {
    this.quotes.load();
    this.orders.load();
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

  requestQuote(): void {
    const lines = this.basket();
    if (lines.length === 0) {
      return;
    }
    this.requestSent.set(false);
    this.requestAction.run(
      this.quotesService.createQuote({ lineItems: lines.map((l) => ({ productId: l.productId, qty: l.qty })) }),
      () => {
        this.basket.set([]);
        this.requestSent.set(true);
        this.quotes.load();
      },
    );
  }

  rejectQuote(id: string): void {
    this.rejectAction.run(this.quotesService.reject(id), () => {
      this.confirmingRejectId.set(null);
      this.quotes.load();
    });
  }

  acceptQuote(id: string): void {
    this.acceptAction.run(this.quotesService.accept(id), () => {
      this.quotes.load();
      this.orders.load();
    });
  }
}
