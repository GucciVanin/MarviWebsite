import { Component, computed, input, signal } from '@angular/core';

/** Where the API serves uploaded product photos (MRV-9.7). Anything else (an old address, a typo) is not drawn: the CSP only allows this origin. */
export const PHOTO_PATH_PREFIX = '/api/public/media/products/';

/** The sizes a photo is drawn at: a fixed box each, so the page does not move when the image arrives (`width`/`height` attributes plus an aspect ratio in CSS). */
const SIZES = {
  card: { width: 320, height: 240 },
  thumb: { width: 48, height: 48 },
  panel: { width: 160, height: 160 },
} as const;

/**
 * A product's display photo (MRV-9.7) in a box of fixed proportions, or a neutral placeholder (an outline box, drawn inline so it is not one of the
 * site's icons) of the same size when the product has none or the file cannot be shown. The alt text is the product name. Images load lazily except the ones the page marks `eager` (the first row).
 */
@Component({
  selector: 'app-product-photo',
  host: { '[class]': '"photo photo--" + size()', '[attr.data-has-photo]': 'visible() ? "true" : "false"' },
  template: `
    @if (visible()) {
      <img
        [src]="src()"
        [alt]="alt()"
        [attr.width]="box().width"
        [attr.height]="box().height"
        [attr.loading]="eager() ? 'eager' : 'lazy'"
        decoding="async"
        (error)="failedPath.set(src())"
      />
    } @else {
      <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v8" /></svg>
    }
  `,
})
export class ProductPhoto {
  /** The relative path the API stored (`/api/public/media/products/{name}`); null for a product without a photo. */
  readonly src = input<string | null | undefined>(null);
  /** The product name. */
  readonly alt = input.required<string>();
  readonly size = input<keyof typeof SIZES>('card');
  /** True for the first row of a list: those load at once, the rest lazily. */
  readonly eager = input(false);

  // The path that failed to load, so a new path (a replaced photo) gets its own chance.
  protected readonly failedPath = signal<string | null | undefined>(null);
  protected readonly box = computed(() => SIZES[this.size()]);
  protected readonly visible = computed(() => {
    const path = this.src();
    return !!path && path.startsWith(PHOTO_PATH_PREFIX) && this.failedPath() !== path;
  });
}
