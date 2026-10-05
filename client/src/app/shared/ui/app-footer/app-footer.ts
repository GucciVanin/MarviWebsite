import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { PT } from '../../../core/i18n/pt-br';

@Component({
  selector: 'app-footer',
  imports: [RouterLink],
  templateUrl: './app-footer.html',
  styleUrl: './app-footer.scss',
})
export class AppFooter {
  protected readonly t = PT;
  protected readonly year = new Date().getFullYear();
  protected readonly isAuthenticated = inject(AuthService).isAuthenticated;
}
