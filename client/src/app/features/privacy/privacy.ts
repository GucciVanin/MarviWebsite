import { Component, inject } from '@angular/core';
import { CONTACT_INFO, CONTACT_PLACEHOLDER, contactLinks } from '../../core/contact/contact-info';
import { PT } from '../../core/i18n/pt-br';

/** Public privacy policy (MRV-2.7). A draft for legal review; contact values come from CONTACT_INFO and show as plain text while placeholders. */
@Component({
  selector: 'app-privacy',
  templateUrl: './privacy.html',
  styleUrl: './privacy.scss',
})
export class Privacy {
  protected readonly t = PT.privacy.page;
  protected readonly contact = inject(CONTACT_INFO);
  protected readonly links = contactLinks(this.contact);
  protected readonly placeholderAddress = CONTACT_PLACEHOLDER.address;
}
