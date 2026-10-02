import { Routes } from '@angular/router';

export const STOREFRONT_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./storefront').then((m) => m.Storefront) },
];
