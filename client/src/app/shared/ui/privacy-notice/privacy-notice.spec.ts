import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PrivacyNotice } from './privacy-notice';
import { PRIVACY_NOTICE_KEY, PrivacyNoticeState } from './privacy-notice-state';

describe('PrivacyNotice', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  function setup(): ComponentFixture<PrivacyNotice> {
    TestBed.configureTestingModule({ imports: [PrivacyNotice], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(PrivacyNotice);
    fixture.detectChanges();
    return fixture;
  }
  const render = (): HTMLElement => setup().nativeElement as HTMLElement;

  const region = (el: HTMLElement) => el.querySelector('[role="region"]');

  it('shows on a first visit with the label, the link to the policy and the button', () => {
    const el = render();

    expect(region(el)?.getAttribute('aria-label')).toBe('Aviso de privacidade');
    expect(el.querySelector('a[href="/privacidade"]')).not.toBeNull();
    expect(el.querySelector('button')?.textContent).toContain('Entendi');
  });

  it('does not write storage on a first load', () => {
    const set = vi.spyOn(Storage.prototype, 'setItem');

    render();

    expect(set).not.toHaveBeenCalled();
  });

  it('hides on "Entendi" and stores the dismissal', () => {
    const fixture = setup();
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector<HTMLButtonElement>('button')!.click();
    fixture.detectChanges();

    expect(localStorage.getItem(PRIVACY_NOTICE_KEY)).not.toBeNull();
    expect(region(el)).toBeNull();
  });

  it('stays hidden when the dismissal is already stored', () => {
    localStorage.setItem(PRIVACY_NOTICE_KEY, '1');

    expect(region(render())).toBeNull();
  });

  it('renders when reading storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(region(render())).not.toBeNull();
  });

  it('still dismisses for the session when writing storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const fixture = setup();
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector<HTMLButtonElement>('button')!.click();
    fixture.detectChanges();

    expect(region(el)).toBeNull();
  });

  it('has a plain button, and dismiss() hides the notice and zeroes the height', () => {
    const fixture = setup();
    const state = TestBed.inject(PrivacyNoticeState);
    state.height.set(80);

    expect((fixture.nativeElement as HTMLElement).querySelector('button')?.getAttribute('type')).toBe('button');
    state.dismiss();

    expect(state.height()).toBe(0);
    expect(state.visible()).toBe(false);
  });

  it('reports its measured height through a ResizeObserver', async () => {
    let callback: () => void = () => undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          callback = cb;
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(72);
    const fixture = setup();
    await fixture.whenStable();
    callback();

    expect(TestBed.inject(PrivacyNoticeState).height()).toBe(72);
  });
});
