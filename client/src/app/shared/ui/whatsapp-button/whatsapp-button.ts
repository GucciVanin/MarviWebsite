import { Component, computed, inject } from '@angular/core';
import { CONTACT_INFO, contactLinks } from '../../../core/contact/contact-info';
import { PT } from '../../../core/i18n/pt-br';
import { PrivacyNoticeState } from '../privacy-notice/privacy-notice-state';

/** Floating "Falar no WhatsApp" button (MRV-2.6). Absent while the number is a placeholder, so the page never shows a dead button. */
@Component({
  selector: 'app-whatsapp-button',
  template: `
    @if (href; as link) {
      <a class="whatsapp" data-testid="whatsapp-button" [href]="link" [style.bottom]="bottom()" target="_blank" rel="noopener noreferrer" [attr.aria-label]="label">
        <svg viewBox="0 0 24 24" width="28" height="28" focusable="false" aria-hidden="true">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </a>
    }
  `,
  styles: `
    .whatsapp {
      position: fixed;
      right: 1rem;
      bottom: 1rem;
      z-index: 20;
      display: grid;
      place-items: center;
      width: 3.4rem;
      height: 3.4rem;
      border-radius: 50%;
      color: #fff;
      background: #167a3e;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
      transition: transform 0.15s ease;

      svg { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
      &:hover { transform: scale(1.06); }
      &:focus-visible { outline: 3px solid var(--color-gold-500); outline-offset: 3px; }
    }

    @media (prefers-reduced-motion: reduce) {
      .whatsapp { transition: none; }
    }
  `,
})
export class WhatsappButton {
  private readonly notice = inject(PrivacyNoticeState);
  /** Stacks above the privacy notice while it shows (AC-8, MRV-2.7); null keeps the stylesheet's default offset. */
  protected readonly bottom = computed(() => (this.notice.height() > 0 ? `calc(${this.notice.height()}px + 1rem)` : null));
  protected readonly label = PT.contact.whatsappButton;
  protected readonly href = contactLinks(inject(CONTACT_INFO)).whatsapp;
}
