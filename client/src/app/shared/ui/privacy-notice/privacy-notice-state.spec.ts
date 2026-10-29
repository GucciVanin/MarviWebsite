import { TestBed } from '@angular/core/testing';
import { PRIVACY_NOTICE_KEY, PrivacyNoticeState } from './privacy-notice-state';

describe('PrivacyNoticeState', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  const create = () => TestBed.inject(PrivacyNoticeState);

  it('is visible on a first visit, with no height yet', () => {
    const state = create();

    expect(state.visible()).toBe(true);
    expect(state.height()).toBe(0);
  });

  it('stays hidden once the visitor dismissed it before', () => {
    localStorage.setItem(PRIVACY_NOTICE_KEY, '1');

    expect(create().visible()).toBe(false);
  });

  it('dismiss() hides it, drops its height and remembers the choice', () => {
    const state = create();
    state.height.set(80);

    state.dismiss();

    expect(state.visible()).toBe(false);
    expect(state.height()).toBe(0);
    expect(localStorage.getItem(PRIVACY_NOTICE_KEY)).not.toBeNull();
  });

  it('shows the notice when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(create().visible()).toBe(true);
  });

  it('still hides it for this session when storage cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const state = create();

    expect(() => state.dismiss()).not.toThrow();

    expect(state.visible()).toBe(false);
    expect(localStorage.getItem(PRIVACY_NOTICE_KEY)).toBeNull();
  });
});
