import { Routes } from '@angular/router';
import { employeeGuard } from '../../core/auth/role.guard';

export const EMPLOYEE_PORTAL_ROUTES: Routes = [
  {
    path: '',
    canActivate: [employeeGuard],
    loadComponent: () => import('./employee-portal').then((m) => m.EmployeePortal),
  },
];
