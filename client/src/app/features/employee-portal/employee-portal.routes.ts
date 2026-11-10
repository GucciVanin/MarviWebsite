import { Routes } from '@angular/router';
import { employeeGuard, staffPageGuard } from '../../core/auth/role.guard';
import { PT } from '../../core/i18n/pt-br';

export const EMPLOYEE_PORTAL_ROUTES: Routes = [
  {
    path: '',
    canActivate: [employeeGuard],
    loadComponent: () => import('./employee-portal').then((m) => m.EmployeePortal),
  },
  {
    path: 'historico',
    title: PT.seo.titles.employeeHistory,
    canActivate: [employeeGuard],
    loadComponent: () => import('./history/employee-history').then((m) => m.EmployeeHistory),
  },
  {
    path: 'clientes/:number',
    title: PT.seo.titles.employeeCustomer,
    canActivate: [staffPageGuard],
    loadComponent: () => import('./customer/customer-page').then((m) => m.CustomerPage),
  },
];
