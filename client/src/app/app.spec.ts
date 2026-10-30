import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { PrivacyNoticeState } from './shared/ui/privacy-notice/privacy-notice-state';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  // Regression: a bare href="#content" resolves against <base href="/"> and navigates away instead of skipping.
  it('moves focus to the main content instead of navigating when the skip link is used', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('.skip-link')!;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });

    link.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('content');
  });

  // MRV-8.2: the fixed privacy notice must never leave the last footer links under it, so the shell pads itself by the
  // notice's height while it shows and by nothing once it is dismissed. (Whether the links really clear it is the layout audit's job.)
  it('pads the bottom of the shell by the privacy notice height, and by nothing once it is gone', () => {
    const fixture = TestBed.createComponent(App);
    const root = fixture.nativeElement as HTMLElement;
    const state = TestBed.inject(PrivacyNoticeState);

    state.height.set(96);
    fixture.detectChanges();
    expect(root.style.paddingBottom).toBe('96px');

    state.height.set(0);
    fixture.detectChanges();
    expect(root.style.paddingBottom).toBe('0px');
  });

  // A jsdom spec cannot measure layout shift; this pins the structure the CLS fix relies on: the footer is a sibling
  // after <main> (which holds the router outlet) inside the shell, so main's minimum height keeps it below the fold.
  it('puts the footer after the routed <main> in the shell, so the page area can reserve space above it (CLS)', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const main = root.querySelector('main#content')!;

    expect(main.querySelector('router-outlet')).not.toBeNull();
    expect(main.nextElementSibling?.tagName.toLowerCase()).toBe('app-footer');
    expect(root.querySelector('app-footer')!.parentElement).toBe(root);
  });
});
