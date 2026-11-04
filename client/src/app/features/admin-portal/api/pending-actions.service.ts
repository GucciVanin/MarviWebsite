import { Injectable, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { loadable } from '../../../core/http/loadable';

/** One kind of thing waiting on an admin: how many there are in all, and the first few (the ones waiting longest). */
export interface PendingGroup<T> {
  count: number;
  items: T[];
}

export interface PendingCustomer {
  id: string;
  customerNumber: number;
  companyName: string;
  createdAt: string;
}

export interface PendingQuote {
  id: string;
  number: number;
  clientAccountId: string;
  customerNumber: number;
  companyName: string;
  createdAt: string;
  lineCount: number;
}

export interface LowStock {
  productId: string;
  sku: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  available: number;
  reorderPoint: number;
}

/** A product that needs attention: an active product with no price a visitor can see, or with no stock record at all. */
export interface ProductRef {
  productId: string;
  sku: string;
  name: string;
}

/** A contact-form message nobody has handled yet. Every text field is a visitor's: show it as plain text only. */
export interface PendingContactMessage {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  message: string;
  createdAt: string;
}

/** Everything waiting on an admin (`GET /api/admin/pending-actions`). `total` is the sum of the counts. */
export interface PendingActions {
  total: number;
  customers: PendingGroup<PendingCustomer>;
  quotes: PendingGroup<PendingQuote>;
  lowStock: PendingGroup<LowStock>;
  unpricedProducts: PendingGroup<ProductRef>;
  unstockedProducts: PendingGroup<ProductRef>;
  contactMessages: PendingGroup<PendingContactMessage>;
}

/**
 * The admin's inbox, shared by the inbox page and the admin navigation (which shows how many things are waiting). One service
 * so both read the same data and a decision made in the inbox updates the count in the navigation at once.
 */
@Injectable({ providedIn: 'root' })
export class PendingActionsService {
  private readonly http = inject(HttpClient);

  readonly pending = loadable(() => this.http.get<PendingActions>('/api/admin/pending-actions'), null as PendingActions | null);

  /** How many things are waiting, or null until it is known. */
  readonly total = computed(() => this.pending.data()?.total ?? null);

  /**
   * Asks again. While a request is already on its way a plain refresh adds nothing (the screen and the navigation both ask when
   * an admin page opens), so it is skipped; after a change the admin has just made, `force` makes sure the answer is newer than it.
   */
  refresh(force = false): void {
    if (force || !this.pending.loading()) {
      this.pending.load();
    }
  }
}
