import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { loadable } from '../../../core/http/loadable';
import { PT } from '../../../core/i18n/pt-br';
import { formatCustomerNumber, formatDocumentNumber } from '../../../shared/format/number.pipes';
import { PtDatePipe } from '../../../shared/format/pt-date.pipe';
import { LoadState } from '../../../shared/ui/load-state/load-state';
import { AdminService, AuditLogEntry, AuditPage } from '../api/admin.service';

const PAGE_SIZE = 25;
const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Drops every property whose value is an id from a JSON text (and any id left in plain text), so no id reaches the page. */
function withoutIds(text: string): string {
  const strip = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.filter((item) => !(typeof item === 'string' && GUID.test(item))).map(strip);
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).filter(([, item]) => !(typeof item === 'string' && GUID.test(item))).map(([key, item]) => [key, strip(item)]),
      );
    }
    return value;
  };
  try {
    return JSON.stringify(strip(JSON.parse(text)));
  } catch {
    return text.replace(new RegExp(GUID.source, 'gi'), '…');
  }
}

/** The admin audit log as its own page (MRV-2.4b.6): every change an admin made, newest first, with paging. */
@Component({
  selector: 'app-admin-audit',
  imports: [LoadState, PtDatePipe],
  templateUrl: './admin-audit.html',
})
export class AdminAudit implements OnInit {
  protected readonly t = PT.adminAudit;
  private readonly admin = inject(AdminService);

  // Signals, not plain fields: the app is zoneless, so only signal writes re-render after HTTP callbacks.
  protected readonly page = signal(1);
  protected readonly log = loadable(() => this.admin.getAuditPage(this.page(), PAGE_SIZE), { entries: [], totalCount: 0, page: 1 } as AuditPage);

  /** The page being shown: the one the server answered with, so a failed page change does not make the pager lie. */
  protected readonly shownPage = computed(() => this.log.data().page);
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.log.data().totalCount / PAGE_SIZE)));
  protected readonly isEmpty = computed(() => this.log.loaded() && this.log.data().totalCount === 0);

  ngOnInit(): void {
    this.log.load();
  }

  protected go(delta: number): void {
    const next = this.shownPage() + delta;
    if (next < 1 || next > this.totalPages()) {
      return;
    }
    this.page.set(next);
    this.log.load();
  }

  /**
   * The audit details are stored as one JSON text under `data`; entries without it show nothing. Ids inside it (a pricing tier's, say)
   * are left out: the browser never shows an id (MRV-9.1).
   */
  protected detailsOf(details: Record<string, string>): string {
    return withoutIds(details['data'] ?? '');
  }

  /** What an entry is about: the customer, quote or order by its number (never the id), any other entity by its name. */
  protected entityOf(entry: AuditLogEntry): string {
    return auditEntityLabel(entry);
  }
}

/** What an audit entry is about: the customer, quote or order by its number (never the id), any other entity by its name. */
export function auditEntityLabel(entry: AuditLogEntry): string {
  const kind = PT.adminAudit.entityKinds[entry.entityName];
  if (!kind) {
    return entry.entityName;
  }
  const number =
    entry.entityName === 'ClientAccount' || entry.entityName === 'ClientAddress'
      ? formatCustomerNumber(entry.entityNumber)
      : formatDocumentNumber(entry.entityNumber, entry.entityName === 'Quote' ? 'quote' : 'order');
  return number ? `${kind} ${number}` : kind;
}
