import { Routes } from '@angular/router';

// Each feature owns a `*.routes.ts` and is lazy-loaded, so removing a feature means deleting its
// folder under features/ and its entry here.
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadChildren: () => import('./features/home/home.routes').then((m) => m.HOME_ROUTES),
  },
  {
    path: '', // serves /login and /register
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: 'storefront',
    loadChildren: () =>
      import('./features/storefront/storefront.routes').then((m) => m.STOREFRONT_ROUTES),
  },
  {
    path: 'portal',
    loadChildren: () =>
      import('./features/client-portal/client-portal.routes').then((m) => m.CLIENT_PORTAL_ROUTES),
  },
  {
    path: 'employee',
    loadChildren: () =>
      import('./features/employee-portal/employee-portal.routes').then(
        (m) => m.EMPLOYEE_PORTAL_ROUTES,
      ),
  },
  {
    path: 'admin',
    loadChildren: () =>
      import('./features/admin-portal/admin-portal.routes').then((m) => m.ADMIN_PORTAL_ROUTES),
  },
];
