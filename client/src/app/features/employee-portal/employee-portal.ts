import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Quote } from '../../shared/models/quote.model';
import { EmployeeService, ClientProfile, InventoryRecord } from './api/employee.service';

@Component({
  selector: 'app-employee-portal',
  imports: [FormsModule],
  templateUrl: './employee-portal.html',
})
export class EmployeePortal implements OnInit {
  private readonly employeeService = inject(EmployeeService);

  // Signals, not plain fields: the app is zoneless, so only signal writes re-render after HTTP callbacks.
  protected readonly quoteQueue = signal<Quote[]>([]);
  protected readonly inventory = signal<InventoryRecord[]>([]);
  protected readonly clientProfile = signal<ClientProfile | null>(null);
  lookupClientId = '';

  ngOnInit(): void {
    this.employeeService.getQuoteQueue().subscribe((quotes) => this.quoteQueue.set(quotes));
    this.employeeService.getInventory().subscribe((records) => this.inventory.set(records));
  }

  lookupClient(): void {
    if (!this.lookupClientId) {
      return;
    }
    this.employeeService
      .getClient(this.lookupClientId)
      .subscribe((profile) => this.clientProfile.set(profile));
  }
}
