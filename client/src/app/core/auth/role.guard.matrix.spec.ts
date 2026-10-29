import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { ActivatedRouteSnapshot, CanActivateFn, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { adminGuard, clientGuard, employeeGuard, guestGuard } from './role.guard';
import { fakeToken } from './testing/fake-token';

type Visitor = 'Anonymous' | 'Client' | 'Employee' | 'Admin' | 'Expired Admin' | 'Unknown role';

describe('route guards, every visitor against every guard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient()] });
  });
  afterEach(() => localStorage.clear());

  function signInAs(visitor: Visitor): void {
    switch (visitor) {
      case 'Anonymous':
        return;
      case 'Expired Admin':
        localStorage.setItem('marvi_auth_token', fakeToken('Admin', -60));
        return;
      case 'Unknown role':
        localStorage.setItem('marvi_auth_token', fakeToken('Visitor'));
        return;
      default:
        localStorage.setItem('marvi_auth_token', fakeToken(visitor));
    }
  }

  const run = (guard: CanActivateFn) => TestBed.runInInjectionContext(() => guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));

  /** Where a refused visitor lands: the landing page. */
  function expectRedirect(result: unknown, url: string): void {
    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe(url);
  }

  describe.each([
    ['clientGuard', clientGuard, { Client: true }],
    ['employeeGuard', employeeGuard, { Employee: true, Admin: true }],
    ['adminGuard', adminGuard, { Admin: true }],
  ] as [string, CanActivateFn, Partial<Record<Visitor, boolean>>][])('%s', (_name, guard, allowed) => {
    const visitors: Visitor[] = ['Anonymous', 'Client', 'Employee', 'Admin', 'Expired Admin', 'Unknown role'];

    it.each(visitors)('for %s', (visitor) => {
      signInAs(visitor);

      const result = run(guard);

      if (allowed[visitor]) {
        expect(result).toBe(true);
      } else {
        expectRedirect(result, '/');
      }
    });
  });

  describe('guestGuard', () => {
    it.each([
      ['Anonymous', true, ''],
      ['Expired Admin', true, ''],
      ['Client', false, '/portal'],
      ['Employee', false, '/employee'],
      ['Admin', false, '/admin'],
      // Signed in with a role the SPA has no portal for: kept off the auth pages, sent to the landing page.
      ['Unknown role', false, '/'],
    ] as [Visitor, boolean, string][])('for %s', (visitor, passes, redirect) => {
      signInAs(visitor);

      const result = run(guestGuard);

      if (passes) {
        expect(result).toBe(true);
      } else {
        expectRedirect(result, redirect);
      }
    });
  });

  it('notices a session that ends between two navigations', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      localStorage.setItem('marvi_auth_token', fakeToken('Client', 60));
      expect(run(clientGuard)).toBe(true);

      vi.setSystemTime(Date.now() + 120_000);

      expectRedirect(run(clientGuard), '/');
    } finally {
      vi.useRealTimers();
    }
  });
});
