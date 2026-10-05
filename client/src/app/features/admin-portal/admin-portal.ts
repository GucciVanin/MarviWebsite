import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AdminService,
  ProductAdmin,
  DealAdmin,
  Warehouse,
  CoverageArea,
  AuditLogEntry,
} from './api/admin.service';

@Component({
  selector: 'app-admin-portal',
  imports: [FormsModule],
  templateUrl: './admin-portal.html',
})
export class AdminPortal implements OnInit {
  private readonly adminService = inject(AdminService);

  // Signals, not plain fields: the app is zoneless, so only signal writes re-render after HTTP callbacks.
  protected readonly products = signal<ProductAdmin[]>([]);
  protected readonly deals = signal<DealAdmin[]>([]);
  protected readonly warehouses = signal<Warehouse[]>([]);
  protected readonly coverageAreas = signal<CoverageArea[]>([]);
  protected readonly auditLog = signal<AuditLogEntry[]>([]);

  // Form fields reset inside an HTTP callback, so they are signals too ([(ngModel)] binds to a writable signal).
  protected readonly newEmployeeEmail = signal('');
  protected readonly newEmployeePassword = signal('');
  protected readonly newEmployeeCode = signal('');

  ngOnInit(): void {
    this.adminService.getProducts().subscribe((products) => this.products.set(products));
    this.adminService.getDeals().subscribe((deals) => this.deals.set(deals));
    this.adminService.getWarehouses().subscribe((warehouses) => this.warehouses.set(warehouses));
    this.adminService.getCoverageAreas().subscribe((areas) => this.coverageAreas.set(areas));
    this.adminService.getAuditLog().subscribe((entries) => this.auditLog.set(entries));
  }

  createEmployee(): void {
    if (!this.newEmployeeEmail() || !this.newEmployeePassword() || !this.newEmployeeCode()) {
      return;
    }
    this.adminService
      .createEmployee({
        email: this.newEmployeeEmail(),
        password: this.newEmployeePassword(),
        employeeCode: this.newEmployeeCode(),
        department: null,
        hireDate: new Date().toISOString(),
      })
      .subscribe(() => {
        this.newEmployeeEmail.set('');
        this.newEmployeePassword.set('');
        this.newEmployeeCode.set('');
      });
  }
}
