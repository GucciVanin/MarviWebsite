import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html',
})
export class Login {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  error: string | null = null;

  submit(): void {
    this.error = null;
    this.authService.login({ email: this.email, password: this.password }).subscribe({
      next: () => this.router.navigateByUrl(this.homeFor(this.authService.role())),
      error: () => (this.error = 'Login failed. Check your email and password.'),
    });
  }

  private homeFor(role: string | null): string {
    switch (role) {
      case 'Client':
        return '/portal';
      case 'Employee':
        return '/employee';
      case 'Admin':
        return '/admin';
      default:
        return '/';
    }
  }
}
