import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PT } from './core/i18n/pt-br';
import { AppFooter } from './shared/ui/app-footer/app-footer';
import { WhatsappButton } from './shared/ui/whatsapp-button/whatsapp-button';
import { PrivacyNotice } from './shared/ui/privacy-notice/privacy-notice';
import { PrivacyNoticeState } from './shared/ui/privacy-notice/privacy-notice-state';
import { AppHeader } from './shared/ui/app-header/app-header';

@Component({
  imports: [RouterOutlet, AppHeader, AppFooter, WhatsappButton, PrivacyNotice],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
  // The fixed privacy notice covers the bottom of the viewport; the page keeps that much room below the footer so the
  // last links can always be scrolled clear of it (MRV-8.2). 0 once the notice is dismissed.
  host: { '[style.padding-bottom.px]': 'notice.height()' },
})
export class App {
  protected readonly t = PT;
  protected readonly notice = inject(PrivacyNoticeState);

  // A bare href="#content" resolves against <base href="/"> and would navigate to "/#content"; focus the element instead.
  protected skipToContent(event: Event): void {
    event.preventDefault();
    document.getElementById('content')?.focus();
  }
}
