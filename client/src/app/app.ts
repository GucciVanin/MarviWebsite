import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PT } from './core/i18n/pt-br';
import { AppFooter } from './shared/ui/app-footer/app-footer';
import { WhatsappButton } from './shared/ui/whatsapp-button/whatsapp-button';
import { AppHeader } from './shared/ui/app-header/app-header';

@Component({
  imports: [RouterOutlet, AppHeader, AppFooter, WhatsappButton],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly t = PT;

  // A bare href="#content" resolves against <base href="/"> and would navigate to "/#content"; focus the element instead.
  protected skipToContent(event: Event): void {
    event.preventDefault();
    document.getElementById('content')?.focus();
  }
}
