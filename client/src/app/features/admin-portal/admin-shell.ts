import { Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { PT } from '../../core/i18n/pt-br';
import { PendingActionsService } from './api/pending-actions.service';

/**
 * The admin area: a title, the sub-pages and where the chosen one is shown. The first tab is the inbox of things waiting on an
 * admin (MRV-6.3), with a count so it is seen from every admin page.
 */
@Component({
  selector: 'app-admin-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './admin-shell.html',
})
export class AdminShell implements OnInit {
  protected readonly t = PT.adminNav;
  private readonly pending = inject(PendingActionsService);

  /** How many things are waiting, or null when none or not known yet (the tab then shows no count). */
  protected readonly waiting = computed(() => this.pending.total() || null);
  protected readonly waitingLabel = computed(() => {
    const count = this.waiting();
    return count === null ? null : `${this.t.inbox}: ${count} ${count === 1 ? this.t.waitingOne : this.t.waitingMany}`;
  });

  ngOnInit(): void {
    this.pending.refresh();
  }
}
