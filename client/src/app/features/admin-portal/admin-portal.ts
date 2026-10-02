import { Component, OnInit, inject } from '@angular/core';
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

  products: ProductAdmin[] = [];
  deals: DealAdmin[] = [];
  warehouses: Warehouse[] = [];
  coverageAreas: CoverageArea[] = [];
  auditLog: AuditLogEntry[] = [];

  newEmployeeEmail = '';
  newEmployeePassword = '';
  newEmployeeCode = '';

  ngOnInit(): void {
    this.adminService.getProducts().subscribe((products) => (this.products = products));
    this.adminService.getDeals().subscribe((deals) => (this.deals = deals));
    this.adminService.getWarehouses().subscribe((warehouses) => (this.warehouses = warehouses));
    this.adminService.getCoverageAreas().subscribe((areas) => (this.coverageAreas = areas));
    this.adminService.getAuditLog().subscribe((entries) => (this.auditLog = entries));
  }

  createEmployee(): void {
    if (!this.newEmployeeEmail || !this.newEmployeePassword || !this.newEmployeeCode) {
      return;
    }
    this.adminService
      .createEmployee({
        email: this.newEmployeeEmail,
        password: this.newEmployeePassword,
        employeeCode: this.newEmployeeCode,
        department: null,
        hireDate: new Date().toISOString(),
      })
      .subscribe(() => {
        this.newEmployeeEmail = '';
        this.newEmployeePassword = '';
        this.newEmployeeCode = '';
      });
  }
}
