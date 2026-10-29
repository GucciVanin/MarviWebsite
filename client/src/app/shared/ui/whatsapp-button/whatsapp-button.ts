import { Component, computed, inject } from '@angular/core';
import { CONTACT_INFO, contactLinks } from '../../../core/contact/contact-info';
import { AppIcon } from '../app-icon/app-icon';
import { PT } from '../../../core/i18n/pt-br';
import { PrivacyNoticeState } from '../privacy-notice/privacy-notice-state';

/** Floating "Falar no WhatsApp" button (MRV-2.6). Absent while the number is a placeholder, so the page never shows a dead button. */
@Component({
  selector: 'app-whatsapp-button',
  imports: [AppIcon],
  template: `
    @if (href; as link) {
      <a class="whatsapp" data-testid="whatsapp-button" [href]="link" [style.bottom]="bottom()" target="_blank" rel="noopener noreferrer" [attr.aria-label]="label">
        <app-icon name="message-circle" size="1.75rem" />
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
