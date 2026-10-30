import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

// UX convenience only — hides/blocks routes client-side so the wrong portal doesn't render.
// The API's [Authorize(Roles=...)] on each controller is the real security boundary (see architecture.md, Authentication).
function roleGuard(allowedRoles: string[]): CanActivateFn {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);
    const allowed = authService.isAuthenticated() && allowedRoles.includes(authService.role() ?? '');
    return allowed ? true : router.parseUrl('');
  };
}

// Keeps signed-in users off /login and /register (registering again would silently replace their session).
export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  return authService.isAuthenticated() ? router.parseUrl(authService.homeUrl()) : true;
};

export const clientGuard: CanActivateFn = roleGuard(['Client']);
export const employeeGuard: CanActivateFn = roleGuard(['Employee', 'Admin']);
export const adminGuard: CanActivateFn = roleGuard(['Admin']);

// For a page staff open from a link, possibly in a new tab (MRV-9.2): only Employee and Admin get in; a signed-out visitor is sent to the login
// page and anyone else (a customer) to their own area. The plain employeeGuard above keeps sending every refused visitor to the landing page.
export const staffPageGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  if (!authService.isAuthenticated()) {
    return router.parseUrl('/login');
  }
  return ['Employee', 'Admin'].includes(authService.role() ?? '') ? true : router.parseUrl(authService.homeUrl());
};
