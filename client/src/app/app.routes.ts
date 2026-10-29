import { Routes } from '@angular/router';
import { PT } from './core/i18n/pt-br';

const T = PT.seo.titles;
const D = PT.seo.descriptions;

// Each feature owns a `*.routes.ts` and is lazy-loaded, so removing a feature means deleting its
// folder under features/ and its entry here.
// `title` feeds PageTitleStrategy; `data.description` and `data.noindex` feed SeoService (MRV-2.9). Private areas are noindex.
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: T.home,
    data: { description: D.home },
    loadChildren: () => import('./features/home/home.routes').then((m) => m.HOME_ROUTES),
  },
  {
    path: '', // serves /login and /register (titles and SEO data are on the auth routes)
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: 'privacidade',
    title: T.privacy,
    data: { description: D.privacy },
    loadChildren: () => import('./features/privacy/privacy.routes').then((m) => m.PRIVACY_ROUTES),
  },
  {
    path: 'contato',
    title: T.contact,
    data: { description: D.contact },
    loadChildren: () => import('./features/contact/contact.routes').then((m) => m.CONTACT_ROUTES),
  },
  {
    path: 'storefront',
    title: T.storefront,
    data: { description: D.storefront },
    loadChildren: () =>
      import('./features/storefront/storefront.routes').then((m) => m.STOREFRONT_ROUTES),
  },
  {
    path: 'portal',
    title: T.client,
    data: { noindex: true },
    loadChildren: () =>
      import('./features/client-portal/client-portal.routes').then((m) => m.CLIENT_PORTAL_ROUTES),
  },
  {
    path: 'employee',
    title: T.employee,
    data: { noindex: true },
    loadChildren: () =>
      import('./features/employee-portal/employee-portal.routes').then(
        (m) => m.EMPLOYEE_PORTAL_ROUTES,
      ),
  },
  {
    path: 'admin',
    title: T.admin,
    data: { noindex: true },
    loadChildren: () =>
      import('./features/admin-portal/admin-portal.routes').then((m) => m.ADMIN_PORTAL_ROUTES),
  },
];
