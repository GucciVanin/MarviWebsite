import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { loadable } from '../../../core/http/loadable';
import { PT } from '../../../core/i18n/pt-br';
import { PtDatePipe } from '../../../shared/format/pt-date.pipe';
import { LoadState } from '../../../shared/ui/load-state/load-state';
import { AdminService, AuditPage } from '../api/admin.service';

const PAGE_SIZE = 25;

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
  protected readonly log = loadable(() => this.admin.getAuditPage(this.page(), PAGE_SIZE), { entries: [], totalCount: 0 } as AuditPage);

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.log.data().totalCount / PAGE_SIZE)));
  protected readonly isEmpty = computed(() => this.log.loaded() && this.log.data().totalCount === 0);

  ngOnInit(): void {
    this.log.load();
  }

  protected go(delta: number): void {
    const next = this.page() + delta;
    if (next < 1 || next > this.totalPages()) {
      return;
    }
    this.page.set(next);
    this.log.load();
  }

  /** The audit details are stored as one JSON text under `data`; entries without it show nothing. */
  protected detailsOf(details: Record<string, string>): string {
    return details['data'] ?? '';
  }
}
