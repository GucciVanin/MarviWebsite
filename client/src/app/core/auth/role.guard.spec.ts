import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { adminGuard, clientGuard, employeeGuard, guestGuard } from './role.guard';
import { fakeToken } from './testing/fake-token';

describe('route guards', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient()] });
  });
  afterEach(() => localStorage.clear());

  const run = (guard: CanActivateFn) =>
    TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
  const signIn = (role: string, expiresInSeconds?: number) =>
    localStorage.setItem('marvi_auth_token', fakeToken(role, expiresInSeconds));

  it('lets the right role in and sends everyone else home', () => {
    signIn('Admin');
    expect(run(adminGuard)).toBe(true);
    expect(run(employeeGuard)).toBe(true);
    expect(run(clientGuard)).toBeInstanceOf(UrlTree);
  });

  it('sends a signed-out visitor home from a portal', () => {
    expect(run(adminGuard)).toBeInstanceOf(UrlTree);
  });

  it('does not let an expired session into a portal', () => {
    signIn('Admin', -60);
    expect(run(adminGuard)).toBeInstanceOf(UrlTree);
  });

  describe('guestGuard', () => {
    it('lets a signed-out visitor reach /login and /register', () => {
      expect(run(guestGuard)).toBe(true);
    });

    it('redirects a signed-in user to their own area instead of the auth pages', () => {
      signIn('Client');
      const result = run(guestGuard);
      expect(result).toBeInstanceOf(UrlTree);
      expect((result as UrlTree).toString()).toBe('/portal');
    });
  });
});
