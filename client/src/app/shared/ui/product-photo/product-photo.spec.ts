import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProductPhoto } from './product-photo';

const PATH = '/api/public/media/products/0123456789abcdef0123456789abcdef.jpg';

@Component({
  imports: [ProductPhoto],
  template: '<app-product-photo [src]="src()" [alt]="alt()" [size]="size()" [eager]="eager()" />',
})
class Host {
  readonly src = signal<string | null>(PATH);
  readonly alt = signal('Cola 2L');
  readonly size = signal<'card' | 'thumb' | 'panel'>('card');
  readonly eager = signal(false);
}

describe('ProductPhoto (MRV-9.7)', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [Host] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    return { fixture, root, host: fixture.componentInstance, img: () => root.querySelector('img'), box: () => root.querySelector('app-product-photo')! };
  }

  it('draws the photo with the product name as alt text, a fixed width and height (no layout shift) and lazy loading', () => {
    const { img, box } = setup();

    expect(img()!.getAttribute('src')).toBe(PATH);
    expect(img()!.getAttribute('alt')).toBe('Cola 2L');
    expect(img()!.getAttribute('width')).toBe('320');
    expect(img()!.getAttribute('height')).toBe('240');
    expect(img()!.getAttribute('loading')).toBe('lazy');
    expect(box().className).toContain('photo--card');
  });

  it('loads at once when the page marks it eager (the first row)', () => {
    const { fixture, host, img } = setup();
    host.eager.set(true);
    fixture.detectChanges();

    expect(img()!.getAttribute('loading')).toBe('eager');
  });

  it('has a square thumbnail and panel size', () => {
    const { fixture, host, img, box } = setup();
    host.size.set('thumb');
    fixture.detectChanges();
    expect([img()!.getAttribute('width'), img()!.getAttribute('height')]).toEqual(['48', '48']);
    expect(box().className).toContain('photo--thumb');

    host.size.set('panel');
    fixture.detectChanges();
    expect([img()!.getAttribute('width'), img()!.getAttribute('height')]).toEqual(['160', '160']);
  });

  it('shows a neutral placeholder of the same box, without an image, when there is no photo', () => {
    const { fixture, host, img, box } = setup();
    host.src.set(null);
    fixture.detectChanges();

    expect(img()).toBeNull();
    expect(box().querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    expect(box().getAttribute('data-has-photo')).toBe('false');
    expect(box().className).toContain('photo--card');
  });

  it('never draws an address that is not one the API serves (an old external URL, a data: or javascript: address)', () => {
    const { fixture, host, img, box } = setup();
    for (const src of ['https://cdn.exemplo.com/cola.png', 'http://exemplo.com/a.png', 'javascript:alert(1)', 'data:image/png;base64,AAAA', '/api/public/media/products/../x.png', '//exemplo.com/a.png']) {
      host.src.set(src);
      fixture.detectChanges();
      if (!src.startsWith('/api/public/media/products/')) {
        expect(img(), src).toBeNull();
        expect(box().getAttribute('data-has-photo')).toBe('false');
      }
    }
  });

  it('falls back to the placeholder when the file cannot be loaded, and tries again for a new address', () => {
    const { fixture, host, img, box } = setup();

    img()!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(img()).toBeNull();
    expect(box().getAttribute('data-has-photo')).toBe('false');

    host.src.set('/api/public/media/products/fedcba9876543210fedcba9876543210.png');
    fixture.detectChanges();
    expect(img()!.getAttribute('src')).toBe('/api/public/media/products/fedcba9876543210fedcba9876543210.png');
  });
});
