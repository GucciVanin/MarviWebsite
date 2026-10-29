import { Component, ElementRef, afterNextRender, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppIcon } from '../app-icon/app-icon';
import { PT } from '../../../core/i18n/pt-br';
import { PrivacyNoticeState } from './privacy-notice-state';

/** Informational privacy notice fixed at the bottom (MRV-2.7). It does not block the page or trap focus. */
@Component({
  selector: 'app-privacy-notice',
  imports: [RouterLink, AppIcon],
  template: `
    @if (state.visible()) {
      <div class="notice" role="region" [attr.aria-label]="t.label" data-testid="privacy-notice">
        <p class="notice__text">
          {{ t.text }} <a routerLink="/privacidade">{{ link }}</a>.
        </p>
        <button type="button" class="btn btn--primary notice__ok" (click)="state.dismiss()"><app-icon name="check" />{{ t.ok }}</button>
      </div>
    }
  `,
  styles: `
    .notice {
      position: fixed;
      inset: auto 0 0 0;
      z-index: 30;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem 1rem;
      padding: 0.75rem 1rem;
      color: var(--color-text-inverse);
      background: var(--color-navy-900);
      box-shadow: 0 -4px 14px rgba(0, 0, 0, 0.3);
    }
    .notice__text { margin: 0; flex: 1 1 18rem; font-size: 0.9rem; }
    .notice__text a { color: var(--color-gold-500); }
    .notice__ok { flex: 0 0 auto; }
  `,
})
export class PrivacyNotice {
  protected readonly t = PT.privacy.notice;
  protected readonly link = PT.privacy.link;
  protected readonly state = inject(PrivacyNoticeState);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // Report the bar's height so the floating WhatsApp button can sit above it (AC-8).
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') {
        return;
      }
      const observer = new ResizeObserver(() => {
        const bar = this.host.nativeElement.querySelector<HTMLElement>('.notice');
        this.state.height.set(bar ? bar.offsetHeight : 0);
      });
      observer.observe(this.host.nativeElement);
      const bar = this.host.nativeElement.querySelector<HTMLElement>('.notice');
      if (bar) {
        observer.observe(bar);
        this.state.height.set(bar.offsetHeight);
      }
    });
  }
}
