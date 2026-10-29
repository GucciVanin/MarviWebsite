import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { PT } from '../i18n/pt-br';
import { CONTACT_INFO, CONTACT_PLACEHOLDER, contactLinks } from '../contact/contact-info';

const JSON_LD_ID = 'marvi-local-business';

/** Keeps the description and robots meta tags and the LocalBusiness JSON-LD in step with the current route (MRV-2.9). */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly contact = inject(CONTACT_INFO);

  /** Called by the title strategy after every successful navigation. */
  update(snapshot: RouterStateSnapshot): void {
    const data = this.routeData(snapshot);
    const description = typeof data['description'] === 'string' ? data['description'] : null;

    if (description) {
      this.meta.updateTag({ name: 'description', content: description });
    } else {
      this.meta.removeTag("name='description'");
    }
    if (data['noindex'] === true) {
      this.meta.updateTag({ name: 'robots', content: 'noindex' });
    } else {
      this.meta.removeTag("name='robots'");
    }
    this.writeStructuredData();
  }

  /** Route data merged from the root down to the deepest primary child, so a lazy parent's data reaches its leaf. */
  private routeData(snapshot: RouterStateSnapshot): Record<string, unknown> {
    const merged: Record<string, unknown> = {};
    let route: ActivatedRouteSnapshot | undefined = snapshot.root;
    while (route) {
      Object.assign(merged, route.routeConfig?.data);
      route = route.children.find((c) => c.outlet === 'primary');
    }
    return merged;
  }

  /** The LocalBusiness object. Placeholder contact values are left out, never published. */
  structuredData(): Record<string, unknown> {
    const links = contactLinks(this.contact);
    const data: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: PT.brand.name,
      url: this.document.location.origin,
      sameAs: [this.contact.facebook, this.contact.instagram],
    };
    if (links.phone) {
      data['telephone'] = this.contact.phone;
    }
    if (links.email) {
      data['email'] = this.contact.email;
    }
    if (this.contact.address.trim() && this.contact.address !== CONTACT_PLACEHOLDER.address) {
      data['address'] = { '@type': 'PostalAddress', streetAddress: this.contact.address };
    }
    return data;
  }

  private writeStructuredData(): void {
    let script = this.document.getElementById(JSON_LD_ID);
    if (!script) {
      script = this.document.createElement('script');
      script.id = JSON_LD_ID;
      script.setAttribute('type', 'application/ld+json');
      this.document.head.appendChild(script);
    }
    // textContent: the JSON is data, never parsed as HTML. "<" is escaped so a value can never close the script element.
    script.textContent = JSON.stringify(this.structuredData()).replace(/</g, '\\u003c');
  }
}
