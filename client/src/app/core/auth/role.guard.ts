import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

// UX convenience only — hides/blocks routes client-side so the wrong portal doesn't render.
// The API's [Authorize(Roles=...)] on each controller is the real security boundary (see architecture.md, Authentication).
function roleGuard(allowedRoles: string[]): CanActivateFn {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);
    return allowedRoles.includes(authService.role() ?? '') ? true : router.parseUrl('');
  };
}

export const clientGuard: CanActivateFn = roleGuard(['Client']);
export const employeeGuard: CanActivateFn = roleGuard(['Employee', 'Admin']);
export const adminGuard: CanActivateFn = roleGuard(['Admin']);
