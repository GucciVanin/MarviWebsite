import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink],
  templateUrl: './register.html',
})
export class Register {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  companyName = '';
  billingAddress = '';
  error: string | null = null;

  submit(): void {
    this.error = null;
    const { email, password, companyName, billingAddress } = this;
    this.authService.register({ email, password, companyName, billingAddress }).subscribe({
      // Clients have access immediately, so sign them straight in.
      next: () =>
        this.authService.login({ email, password }).subscribe({
          next: () => this.router.navigateByUrl('/portal'),
          error: () => this.router.navigateByUrl('/login'),
        }),
      error: (response: HttpErrorResponse) => (this.error = this.describe(response)),
    });
  }

  private describe(response: HttpErrorResponse): string {
    const body = response.error;
    if (Array.isArray(body) && body.length > 0) {
      return body.join(' ');
    }
    return 'Registration failed. Check your details and try again.';
  }
}
