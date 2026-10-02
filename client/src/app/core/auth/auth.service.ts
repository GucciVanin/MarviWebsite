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
// rather than a short "role" name.
export interface JwtClaims {
  sub?: string;
  client_id?: string;
  employee_id?: string;
  exp?: number;
  [claimType: string]: unknown;
}

const TOKEN_STORAGE_KEY = 'marvi_auth_token';
const ROLE_CLAIM = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/role';

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

  readonly isAuthenticated = computed(() => this.tokenSignal() !== null);
  readonly role = computed(() => (this.claims()?.[ROLE_CLAIM] as string | undefined) ?? null);
  readonly clientId = computed(() => this.claims()?.client_id ?? null);
  readonly employeeId = computed(() => this.claims()?.employee_id ?? null);

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
