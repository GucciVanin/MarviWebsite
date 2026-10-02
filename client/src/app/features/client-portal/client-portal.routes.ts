import { Routes } from '@angular/router';
import { clientGuard } from '../../core/auth/role.guard';

export const CLIENT_PORTAL_ROUTES: Routes = [
  {
    path: '',
    canActivate: [clientGuard],
    loadComponent: () => import('./client-portal').then((m) => m.ClientPortal),
  },
];
