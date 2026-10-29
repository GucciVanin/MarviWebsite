import { Routes } from '@angular/router';
import { guestGuard } from '../../core/auth/role.guard';
import { PT } from '../../core/i18n/pt-br';

export const AUTH_ROUTES: Routes = [
  {
    path: 'login',
    title: PT.seo.titles.login,
    data: { description: PT.seo.descriptions.login, noindex: true },
    canActivate: [guestGuard],
    loadComponent: () => import('./login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    title: PT.seo.titles.register,
    data: { description: PT.seo.descriptions.register, noindex: true },
    canActivate: [guestGuard],
    loadComponent: () => import('./register/register').then((m) => m.Register),
  },
];
