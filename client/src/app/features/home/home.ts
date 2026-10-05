import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { PT } from '../../core/i18n/pt-br';

// Interim welcome page. The full landing page from the owner's design replaces it in MRV-2.3c.
@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  protected readonly t = PT.home;
  protected readonly isAuthenticated = inject(AuthService).isAuthenticated;
}
