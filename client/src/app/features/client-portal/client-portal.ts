import { Component, OnInit, inject } from '@angular/core';
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

  quotes: Quote[] = [];
  orders: Order[] = [];
  newProductId = '';
  newQty = 1;

  ngOnInit(): void {
    this.loadQuotes();
    this.loadOrders();
  }

  loadQuotes(): void {
    this.quotesService.getMine().subscribe((quotes) => (this.quotes = quotes));
  }

  loadOrders(): void {
    this.ordersService.getMine().subscribe((orders) => (this.orders = orders));
  }

  requestQuote(): void {
    if (!this.newProductId) {
      return;
    }
    this.quotesService
      .createQuote({ lineItems: [{ productId: this.newProductId, qty: this.newQty }] })
      .subscribe(() => {
        this.newProductId = '';
        this.newQty = 1;
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
