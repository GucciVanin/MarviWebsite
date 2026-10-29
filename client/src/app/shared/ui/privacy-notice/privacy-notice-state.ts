import { Injectable, signal } from '@angular/core';

export const PRIVACY_NOTICE_KEY = 'marvi.privacy-notice';

function dismissedBefore(): boolean {
  try {
    return localStorage.getItem(PRIVACY_NOTICE_KEY) !== null;
  } catch {
    return false; // storage blocked: show the notice
  }
}

/** Whether the privacy notice (MRV-2.7) is showing, and how tall it is so the WhatsApp button can stack above it. */
@Injectable({ providedIn: 'root' })
export class PrivacyNoticeState {
  readonly visible = signal(!dismissedBefore());
  /** Height in px of the notice while it is showing, else 0. */
  readonly height = signal(0);

  dismiss(): void {
    // Hide first: a storage failure must still dismiss the notice for this session.
    this.visible.set(false);
    this.height.set(0);
    try {
      localStorage.setItem(PRIVACY_NOTICE_KEY, '1');
    } catch {
      // ignored: the dismissal lasts for the session only
    }
  }
}
