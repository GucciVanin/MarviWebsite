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
  companyName: string;
  createdAt: string;
}

export interface PendingQuote {
  id: string;
  clientAccountId: string;
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

export interface UnpricedProduct {
  productId: string;
  sku: string;
  name: string;
}

/** Everything waiting on an admin (`GET /api/admin/pending-actions`). `total` is the sum of the counts. */
export interface PendingActions {
  total: number;
  customers: PendingGroup<PendingCustomer>;
  quotes: PendingGroup<PendingQuote>;
  lowStock: PendingGroup<LowStock>;
  unpricedProducts: PendingGroup<UnpricedProduct>;
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

  refresh(): void {
    this.pending.load();
  }
}
