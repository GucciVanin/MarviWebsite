import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { action } from '../../../core/http/action';
import { Loadable, loadable } from '../../../core/http/loadable';
import { PT } from '../../../core/i18n/pt-br';
import { BrlPipe } from '../../../shared/format/brl.pipe';
import { PtDatePipe } from '../../../shared/format/pt-date.pipe';
import type { PagedResult } from '../../../shared/models/paged.model';
import { ErrorAlert } from '../../../shared/ui/error-alert/error-alert';
import { LoadState } from '../../../shared/ui/load-state/load-state';
import { ClientSummary, EmployeeService, HistoryQuery, OrderHistoryItem, QuoteHistoryItem } from '../api/employee.service';

type Kind = 'quotes' | 'orders';

const PAGE_SIZE = 20;
const QUOTE_STATUSES = ['Submitted', 'Priced', 'Accepted', 'Rejected', 'Expired'];
const ORDER_STATUSES = ['Placed', 'Backordered', 'Fulfilled', 'Cancelled'];

function emptyPage<T>(): PagedResult<T> {
  return { items: [], page: 1, pageSize: PAGE_SIZE, totalCount: 0 };
}

/** A date input's "2026-10-15" as the start of that day in the employee's time zone, as the instant the API expects. */
function startOfDay(date: string, plusDays = 0): string {
  const day = new Date(`${date}T00:00:00`);
  day.setDate(day.getDate() + plusDays);
  return day.toISOString();
}

interface AppliedFilters {
  client: { id: string; companyName: string } | null;
  status: string;
  from: string;
  to: string;
}

const NO_FILTERS: AppliedFilters = { client: null, status: '', from: '', to: '' };

/**
 * The quotes and orders history for staff (MRV-2.4b.2): every quote or order ever, newest first, filtered by customer, status
 * and date and paged. The filters are a draft until "Filtrar" applies them, so a page change never uses half-typed values.
 */
@Component({
  selector: 'app-employee-history',
  imports: [FormsModule, RouterLink, ErrorAlert, LoadState, BrlPipe, PtDatePipe],
  templateUrl: './employee-history.html',
})
export class EmployeeHistory implements OnInit {
  protected readonly t = PT.employeeHistory;
  protected readonly portal = PT.employeePortal;
  protected readonly statuses = PT.statuses;
  private readonly employeeService = inject(EmployeeService);

  protected readonly kind = signal<Kind>('quotes');

  // The filters being edited (draft) and the ones in force (applied). Signals: the app is zoneless.
  protected readonly clientSearch = signal('');
  protected readonly clientMatches = signal<ClientSummary[] | null>(null);
  protected readonly searchAction = action({ latestOnly: true });
  protected readonly draft = signal<AppliedFilters>(NO_FILTERS);
  private readonly applied = signal<AppliedFilters>(NO_FILTERS);
  protected readonly page = signal(1);

  protected readonly quotes = loadable(() => this.employeeService.getQuoteHistory(this.query()), emptyPage<QuoteHistoryItem>());
  protected readonly orders = loadable(() => this.employeeService.getOrderHistory(this.query()), emptyPage<OrderHistoryItem>());

  protected readonly current = computed<Loadable<PagedResult<unknown>>>(() => (this.kind() === 'quotes' ? this.quotes : this.orders));
  protected readonly statusOptions = computed(() => (this.kind() === 'quotes' ? QUOTE_STATUSES : ORDER_STATUSES));
  protected readonly statusLabels = computed(() => (this.kind() === 'quotes' ? this.statuses.quote : this.statuses.order));
  /** The page being shown: the one the server answered with, so a failed page change does not make the pager lie. */
  protected readonly shownPage = computed(() => this.current().data().page);
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.current().data().totalCount / PAGE_SIZE)));
  protected readonly isEmpty = computed(() => this.current().loaded() && this.current().data().items.length === 0);

  ngOnInit(): void {
    this.quotes.load();
  }

  protected setKind(kind: Kind): void {
    if (kind === this.kind()) {
      return;
    }
    this.kind.set(kind);
    // The statuses of quotes and orders are different lists, so the status filter does not carry over.
    this.draft.update((d) => ({ ...d, status: '' }));
    this.applied.update((a) => ({ ...a, status: '' }));
    this.page.set(1);
    this.current().load();
  }

  protected setDraft(change: Partial<AppliedFilters>): void {
    this.draft.update((d) => ({ ...d, ...change }));
  }

  protected searchClients(): void {
    this.searchAction.run(this.employeeService.searchClients(this.clientSearch().trim()), (found) => this.clientMatches.set(found.items));
  }

  protected pickClient(match: ClientSummary): void {
    this.setDraft({ client: { id: match.id, companyName: match.companyName } });
    this.clientMatches.set(null);
  }

  protected apply(): void {
    this.applied.set(this.draft());
    this.page.set(1);
    this.current().load();
  }

  protected clear(): void {
    this.draft.set(NO_FILTERS);
    this.applied.set(NO_FILTERS);
    this.clientSearch.set('');
    this.clientMatches.set(null);
    this.page.set(1);
    this.current().load();
  }

  protected go(delta: number): void {
    const next = this.shownPage() + delta;
    if (next < 1 || next > this.totalPages()) {
      return;
    }
    this.page.set(next);
    this.current().load();
  }

  /** The request for the filters in force and the current page; read when a load starts. */
  private query(): HistoryQuery {
    const f = this.applied();
    return {
      clientId: f.client?.id,
      status: f.status || undefined,
      from: f.from ? startOfDay(f.from) : undefined,
      // `to` is exclusive in the API, so the chosen last day is included by sending the start of the day after it.
      to: f.to ? startOfDay(f.to, 1) : undefined,
      page: this.page(),
      pageSize: PAGE_SIZE,
    };
  }
}
