import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { PT } from '../../core/i18n/pt-br';

/** The admin area: a title, the sub-pages (overview, catalog, prices, operations) and where the chosen one is shown. */
@Component({
  selector: 'app-admin-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './admin-shell.html',
})
export class AdminShell {
  protected readonly t = PT.adminNav;
}
