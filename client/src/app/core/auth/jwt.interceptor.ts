import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { isSuspendedAnswer } from '../http/api-error';
import { AuthService } from './auth.service';

export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = authService.getToken();

  const authedReq = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authedReq).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        authService.logout();
        router.navigateByUrl('/login');
      } else if (isSuspendedAnswer(error) && !req.url.endsWith('/api/auth/login')) {
        // The company suspended this account after the person signed in (MRV-9.9): end the session and say why on the login page.
        // The sign-in's own refusal is shown by the login page itself.
        authService.endSuspendedSession();
        router.navigateByUrl('/login');
      }
      return throwError(() => error);
    }),
  );
};
