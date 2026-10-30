import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PT } from '../../../core/i18n/pt-br';
import { action } from '../../../core/http/action';
import { BrlPipe } from '../../../shared/format/brl.pipe';
import { CustomerNumberPipe, DocumentNumberPipe, parseCustomerNumber } from '../../../shared/format/number.pipes';
import { PtDatePipe } from '../../../shared/format/pt-date.pipe';
import { ErrorAlert } from '../../../shared/ui/error-alert/error-alert';
import { openDocuments } from '../../../shared/ui/customer-lookup/customer-lookup';
import { ClientProfile, EmployeeService } from '../api/employee.service';

/**
 * The customer's page (MRV-9.2): `/employee/clientes/C-000042`. Read-only detail for staff, found by the customer number (never the id).
 * An unknown or malformed number shows "Cliente não encontrado". Editing stays in the admin customers tab.
 */
@Component({
  selector: 'app-customer-page',
  imports: [RouterLink, ErrorAlert, BrlPipe, PtDatePipe, CustomerNumberPipe, DocumentNumberPipe],
  templateUrl: './customer-page.html',
})
export class CustomerPage implements OnInit {
  protected readonly t = PT.customerPage;
  protected readonly l = PT.customerLookup;
  protected readonly refs = PT.numbers;
  protected readonly statuses = PT.statuses;
  protected readonly clientStatus = PT.employeePortal.clientStatus;
  private readonly employeeService = inject(EmployeeService);
  private readonly route = inject(ActivatedRoute);

  protected readonly profile = signal<ClientProfile | null>(null);
  protected readonly notFound = signal(false);
  protected readonly loadAction = action({ latestOnly: true });
  protected readonly counts = computed(() => {
    const profile = this.profile();
    return profile ? openDocuments(profile) : null;
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    const number = parseCustomerNumber(this.route.snapshot.paramMap.get('number'));
    this.notFound.set(false);
    if (number === null) {
      this.notFound.set(true);
      return;
    }
    this.loadAction.run(this.employeeService.getClientByNumber(number), (profile) => this.profile.set(profile));
  }

  /** A 404 (no such customer) or a 400 (not a number) is "not found"; any other failure keeps its own message and a retry. */
  protected readonly missing = computed(() => this.notFound() || [400, 404].includes(this.loadAction.error()?.status ?? 0));
}
