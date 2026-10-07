import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export interface RegisterRequest {
  email: string;
  password: string;
  companyName: string;
  billingAddress: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  expiresAt: string;
}

// Decoded JWT payload claims. ASP.NET Core's JwtSecurityToken constructor writes the raw
// Claim.Type as the JSON key, so ClaimTypes.Role ends up as the long claims-schema URI below
// rather than a short "role" name. The API's ClaimTypes.Role is the Microsoft 2008 URI below; the SPA once
// used a different (xmlsoap 2005) string, which is why role() was always null. AuthControllerTests pins the
// issued name, so change that test and this constant together.
export interface JwtClaims {
  sub?: string;
  client_id?: string;
  employee_id?: string;
  exp?: number;
  [claimType: string]: unknown;
}

const TOKEN_STORAGE_KEY = 'marvi_auth_token';
const ROLE_CLAIM = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

function isExpired(claims: JwtClaims | null): boolean {
  return claims?.exp !== undefined && claims.exp * 1000 <= Date.now();
}

function decodeToken(token: string | null): JwtClaims | null {
  if (!token) {
    return null;
  }
  const payload = token.split('.')[1];
  if (!payload) {
    return null;
  }
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokenSignal = signal<string | null>(localStorage.getItem(TOKEN_STORAGE_KEY));
  private readonly claims = computed(() => decodeToken(this.tokenSignal()));

  // Signed in means a decodable, unexpired token that carries a known role; anything else is treated as signed out.
  // A plain function, not a computed(): a computed would memoise on the token and never notice it expiring mid-session.
  readonly isAuthenticated = (): boolean => this.role() !== null && !isExpired(this.claims());
  readonly role = computed(() => {
    const claim = this.claims()?.[ROLE_CLAIM];
    // A token with several roles carries an array; each account has exactly one role today.
    return (Array.isArray(claim) ? claim[0] : (claim as string | undefined)) ?? null;
  });
  readonly clientId = computed(() => this.claims()?.client_id ?? null);
  readonly employeeId = computed(() => this.claims()?.employee_id ?? null);
  /** The landing route for the signed-in role; '/' when signed out. */
  readonly homeUrl = computed(() => {
    switch (this.role()) {
      case 'Client':
        return '/portal';
      case 'Employee':
        return '/employee';
      case 'Admin':
        return '/admin';
      default:
        return '/';
    }
  });

  constructor() {
    // Drop a stale token left in storage (expired, or without a role) so the UI does not look signed in.
    if (this.tokenSignal() !== null && !this.isAuthenticated()) {
      this.setToken(null);
    }
  }

  register(request: RegisterRequest): Observable<{ id: string }> {
    return this.http.post<{ id: string }>('/api/auth/register', request);
  }

  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>('/api/auth/login', request)
      .pipe(tap((response) => this.setToken(response.token)));
  }

  logout(): void {
    this.setToken(null);
  }

  getToken(): string | null {
    return this.tokenSignal();
  }

  private setToken(token: string | null): void {
    this.tokenSignal.set(token);
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  }
}
