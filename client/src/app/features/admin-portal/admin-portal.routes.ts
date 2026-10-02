import { Routes } from '@angular/router';
import { adminGuard } from '../../core/auth/role.guard';

export const ADMIN_PORTAL_ROUTES: Routes = [
  {
    path: '',
    canActivate: [adminGuard],
    loadComponent: () => import('./admin-portal').then((m) => m.AdminPortal),
  },
];
