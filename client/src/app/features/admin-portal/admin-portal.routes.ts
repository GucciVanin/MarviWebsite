import { Routes } from '@angular/router';
import { adminGuard } from '../../core/auth/role.guard';

// The shell shows the sub-page navigation; each sub-page is lazy-loaded.
export const ADMIN_PORTAL_ROUTES: Routes = [
  {
    path: '',
    canActivate: [adminGuard],
    loadComponent: () => import('./admin-shell').then((m) => m.AdminShell),
    children: [
      { path: '', loadComponent: () => import('./admin-portal').then((m) => m.AdminPortal) },
      { path: 'catalogo', loadComponent: () => import('./catalog/admin-catalog').then((m) => m.AdminCatalog) },
      { path: 'precos', loadComponent: () => import('./pricing/admin-pricing').then((m) => m.AdminPricing) },
    ],
  },
];
