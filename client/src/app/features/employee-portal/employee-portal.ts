import { Component, OnInit, inject } from '@angular/core';
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

  quoteQueue: Quote[] = [];
  inventory: InventoryRecord[] = [];
  lookupClientId = '';
  clientProfile: ClientProfile | null = null;

  ngOnInit(): void {
    this.employeeService.getQuoteQueue().subscribe((quotes) => (this.quoteQueue = quotes));
    this.employeeService.getInventory().subscribe((records) => (this.inventory = records));
  }

  lookupClient(): void {
    if (!this.lookupClientId) {
      return;
    }
    this.employeeService
      .getClient(this.lookupClientId)
      .subscribe((profile) => (this.clientProfile = profile));
  }
}
