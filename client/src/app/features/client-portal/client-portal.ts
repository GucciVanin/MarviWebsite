import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PT } from '../../core/i18n/pt-br';
import { action } from '../../core/http/action';
import { loadable } from '../../core/http/loadable';
import { ErrorAlert } from '../../shared/ui/error-alert/error-alert';
import { LoadState } from '../../shared/ui/load-state/load-state';
import { QuotesService, Quote } from './api/quotes.service';
import { OrdersService, Order } from './api/orders.service';

@Component({
  selector: 'app-client-portal',
  imports: [FormsModule, ErrorAlert, LoadState],
  templateUrl: './client-portal.html',
})
export class ClientPortal implements OnInit {
  protected readonly t = PT.clientPortal;
  private readonly quotesService = inject(QuotesService);
  private readonly ordersService = inject(OrdersService);

  // Signals, not plain fields: the app is zoneless, so only signal writes re-render after HTTP callbacks.
  protected readonly quotes = loadable(() => this.quotesService.getMine(), [] as Quote[]);
  protected readonly orders = loadable(() => this.ordersService.getMine(), [] as Order[]);
  protected readonly requestAction = action();
  protected readonly acceptAction = action();
  protected readonly newProductId = signal('');
  protected readonly newQty = signal(1);

  ngOnInit(): void {
    this.quotes.load();
    this.orders.load();
  }

  requestQuote(): void {
    if (!this.newProductId()) {
      return;
    }
    this.requestAction.run(
      this.quotesService.createQuote({ lineItems: [{ productId: this.newProductId(), qty: this.newQty() }] }),
      () => {
        this.newProductId.set('');
        this.newQty.set(1);
        this.quotes.load();
      },
    );
  }

  acceptQuote(id: string): void {
    this.acceptAction.run(this.quotesService.accept(id), () => {
      this.quotes.load();
      this.orders.load();
    });
  }
}
