import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PT } from '../../core/i18n/pt-br';
import { action } from '../../core/http/action';
import { loadable } from '../../core/http/loadable';
import { ErrorAlert } from '../../shared/ui/error-alert/error-alert';
import { LoadState } from '../../shared/ui/load-state/load-state';
import type { Quote } from '../../shared/models/quote.model';
import { EmployeeService, ClientProfile, InventoryRecord } from './api/employee.service';

@Component({
  selector: 'app-employee-portal',
  imports: [FormsModule, ErrorAlert, LoadState],
  templateUrl: './employee-portal.html',
})
export class EmployeePortal implements OnInit {
  protected readonly t = PT.employeePortal;
  private readonly employeeService = inject(EmployeeService);

  // Signals, not plain fields: the app is zoneless, so only signal writes re-render after HTTP callbacks.
  protected readonly quoteQueue = loadable(() => this.employeeService.getQuoteQueue(), [] as Quote[]);
  protected readonly inventory = loadable(() => this.employeeService.getInventory(), [] as InventoryRecord[]);
  protected readonly lookupAction = action();
  protected readonly clientProfile = signal<ClientProfile | null>(null);
  lookupClientId = '';

  ngOnInit(): void {
    this.quoteQueue.load();
    this.inventory.load();
  }

  lookupClient(): void {
    if (!this.lookupClientId) {
      return;
    }
    this.lookupAction.run(this.employeeService.getClient(this.lookupClientId), (profile) =>
      this.clientProfile.set(profile),
    );
  }
}
