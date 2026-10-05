import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { QuotesService, Quote } from './api/quotes.service';
import { OrdersService, Order } from './api/orders.service';

@Component({
  selector: 'app-client-portal',
  imports: [FormsModule],
  templateUrl: './client-portal.html',
})
export class ClientPortal implements OnInit {
  private readonly quotesService = inject(QuotesService);
  private readonly ordersService = inject(OrdersService);

  // Signals, not plain fields: the app is zoneless, so only signal writes re-render after HTTP callbacks.
  protected readonly quotes = signal<Quote[]>([]);
  protected readonly orders = signal<Order[]>([]);
  protected readonly newProductId = signal('');
  protected readonly newQty = signal(1);

  ngOnInit(): void {
    this.loadQuotes();
    this.loadOrders();
  }

  loadQuotes(): void {
    this.quotesService.getMine().subscribe((quotes) => this.quotes.set(quotes));
  }

  loadOrders(): void {
    this.ordersService.getMine().subscribe((orders) => this.orders.set(orders));
  }

  requestQuote(): void {
    if (!this.newProductId()) {
      return;
    }
    this.quotesService
      .createQuote({ lineItems: [{ productId: this.newProductId(), qty: this.newQty() }] })
      .subscribe(() => {
        this.newProductId.set('');
        this.newQty.set(1);
        this.loadQuotes();
      });
  }

  acceptQuote(id: string): void {
    this.quotesService.accept(id).subscribe(() => {
      this.loadQuotes();
      this.loadOrders();
    });
  }
}
