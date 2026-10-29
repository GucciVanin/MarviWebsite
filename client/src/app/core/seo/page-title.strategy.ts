import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { PT } from '../i18n/pt-br';
import { SeoService } from './seo.service';

/** Sets "<page> | MARVI" for every route (the home page gets the full brand title) and refreshes the SEO tags (MRV-2.9). */
@Injectable({ providedIn: 'root' })
export class PageTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly seo = inject(SeoService);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const page = this.buildTitle(snapshot);
    const path = snapshot.url.split(/[?#]/)[0];
    this.title.setTitle(path === '/' || !page ? PT.seo.siteTitle : `${page} | ${PT.brand.name}`);
    this.seo.update(snapshot);
  }
}
