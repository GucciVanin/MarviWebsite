import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { translateIdentityErrors } from '../../../core/i18n/identity-errors';
import { PT } from '../../../core/i18n/pt-br';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: '../auth.scss',
})
export class Register {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly t = PT.auth;

  email = '';
  password = '';
  companyName = '';
  billingAddress = '';
  // Signals, not plain fields: the app is zoneless, so only signal writes re-render after async callbacks.
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  submit(): void {
    this.error.set(null);
    this.busy.set(true);
    const { email, password, companyName, billingAddress } = this;
    this.authService.register({ email, password, companyName, billingAddress }).subscribe({
      // Clients have access immediately, so sign them straight in.
      next: () =>
        this.authService.login({ email, password }).subscribe({
          next: () => this.router.navigateByUrl(this.authService.homeUrl()),
          error: () => this.router.navigateByUrl('/login'),
        }),
      error: (response: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set(this.describe(response));
      },
    });
  }

  // The API returns Identity's validation messages (English) as an array; show them translated to pt-BR.
  private describe(response: HttpErrorResponse): string {
    return translateIdentityErrors(response.error);
  }
}
