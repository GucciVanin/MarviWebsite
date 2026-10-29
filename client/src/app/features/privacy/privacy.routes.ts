import { Routes } from '@angular/router';

export const PRIVACY_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./privacy').then((m) => m.Privacy) },
];
