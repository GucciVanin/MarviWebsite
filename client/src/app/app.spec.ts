import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

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
});
