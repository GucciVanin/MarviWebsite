import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PT } from '../../core/i18n/pt-br';
import { action } from '../../core/http/action';
import { loadable } from '../../core/http/loadable';
import { ErrorAlert } from '../../shared/ui/error-alert/error-alert';
import { PtDatePipe } from '../../shared/format/pt-date.pipe';
import { LoadState } from '../../shared/ui/load-state/load-state';
import {
  AdminService,
  DealAdmin,
  AuditLogEntry,
} from './api/admin.service';

@Component({
  selector: 'app-admin-portal',
  imports: [FormsModule, ErrorAlert, LoadState, PtDatePipe],
  templateUrl: './admin-portal.html',
})
export class AdminPortal implements OnInit {
  protected readonly t = PT.adminPortal;
  private readonly adminService = inject(AdminService);

  // Signals, not plain fields: the app is zoneless, so only signal writes re-render after HTTP callbacks.
  protected readonly deals = loadable(() => this.adminService.getDeals(), [] as DealAdmin[]);
  protected readonly auditLog = loadable(() => this.adminService.getAuditLog(), [] as AuditLogEntry[]);
  protected readonly createEmployeeAction = action();

  // Form fields reset inside an HTTP callback, so they are signals too ([(ngModel)] binds to a writable signal).
  protected readonly newEmployeeEmail = signal('');
  protected readonly newEmployeePassword = signal('');
  protected readonly newEmployeeCode = signal('');

  ngOnInit(): void {
    this.deals.load();
    this.auditLog.load();
  }

  createEmployee(): void {
    if (!this.newEmployeeEmail() || !this.newEmployeePassword() || !this.newEmployeeCode()) {
      return;
    }
    this.createEmployeeAction.run(
      this.adminService.createEmployee({
        email: this.newEmployeeEmail(),
        password: this.newEmployeePassword(),
        employeeCode: this.newEmployeeCode(),
        department: null,
        hireDate: new Date().toISOString(),
      }),
      () => {
        this.newEmployeeEmail.set('');
        this.newEmployeePassword.set('');
        this.newEmployeeCode.set('');
      },
    );
  }
}
