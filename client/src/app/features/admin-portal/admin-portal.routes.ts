import { Routes } from '@angular/router';
import { adminGuard } from '../../core/auth/role.guard';
import { PT } from '../../core/i18n/pt-br';

// The shell shows the sub-page navigation; each sub-page is lazy-loaded.
export const ADMIN_PORTAL_ROUTES: Routes = [
  {
    path: '',
    canActivate: [adminGuard],
    loadComponent: () => import('./admin-shell').then((m) => m.AdminShell),
    children: [
      { path: '', loadComponent: () => import('./inbox/admin-inbox').then((m) => m.AdminInbox) },
      { path: 'visao-geral', title: PT.seo.titles.adminOverview, loadComponent: () => import('./admin-portal').then((m) => m.AdminPortal) },
      { path: 'catalogo', title: PT.seo.titles.adminCatalog, loadComponent: () => import('./catalog/admin-catalog').then((m) => m.AdminCatalog) },
      { path: 'precos', title: PT.seo.titles.adminPricing, loadComponent: () => import('./pricing/admin-pricing').then((m) => m.AdminPricing) },
      { path: 'operacao', title: PT.seo.titles.adminOperations, loadComponent: () => import('./operations/admin-operations').then((m) => m.AdminOperations) },
      { path: 'clientes', title: PT.seo.titles.adminCustomers, loadComponent: () => import('./customers/admin-customers').then((m) => m.AdminCustomers) },
      { path: 'importacao', title: PT.seo.titles.adminImport, loadComponent: () => import('./import/admin-import').then((m) => m.AdminImport) },
      { path: 'auditoria', title: PT.seo.titles.adminAudit, loadComponent: () => import('./audit/admin-audit').then((m) => m.AdminAudit) },
    ],
  },
];
