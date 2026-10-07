import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { PT } from '../../../core/i18n/pt-br';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: '../auth.scss',
})
export class Login {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly t = PT.auth;

  email = '';
  password = '';
  // Signals, not plain fields: the app is zoneless, so only signal writes re-render after async callbacks.
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  submit(): void {
    this.error.set(null);
    this.busy.set(true);
    this.authService.login({ email: this.email, password: this.password }).subscribe({
      next: () => this.router.navigateByUrl(this.authService.homeUrl()),
      error: () => {
        this.busy.set(false);
        this.error.set(this.t.loginFailed);
      },
    });
  }
}
