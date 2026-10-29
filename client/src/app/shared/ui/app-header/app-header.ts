import { ViewportScroller } from '@angular/common';
import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { AppIcon } from '../app-icon/app-icon';
import { PT } from '../../../core/i18n/pt-br';
import { observeHeaderOffset } from '../../../core/motion/header-offset';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive, AppIcon],
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

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const scroller = inject(ViewportScroller);
    const destroyRef = inject(DestroyRef);
    // The real height of this sticky header is the offset fragment links must leave free (MRV-7.3, AC-14).
    afterNextRender(() => destroyRef.onDestroy(observeHeaderOffset(host, host.ownerDocument.documentElement, scroller)));
  }

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
