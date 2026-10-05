import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { PT } from '../../../core/i18n/pt-br';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './app-header.html',
  styleUrl: './app-header.scss',
})
export class AppHeader {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly t = PT;
  protected readonly isAuthenticated = this.authService.isAuthenticated;
  protected readonly homeUrl = this.authService.homeUrl;
  protected readonly areaLabel = computed(() => PT.nav.areas[this.authService.role() ?? ''] ?? '');
  protected readonly menuOpen = signal(false);

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  protected logout(): void {
    this.authService.logout();
    this.closeMenu();
    this.router.navigateByUrl('/');
  }
}
