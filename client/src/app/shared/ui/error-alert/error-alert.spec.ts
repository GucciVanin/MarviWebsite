import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ApiError } from '../../../core/http/api-error';
import { iconNames } from '../app-icon/testing/icon-names';
import { ErrorAlert } from './error-alert';

@Component({
  imports: [ErrorAlert],
  template: '<app-error-alert [error]="error()" [retryable]="retryable()" (retry)="retried = retried + 1" />',
})
class Host {
  readonly error = signal<ApiError | null>({ status: 500, message: 'Erro no servidor', detail: 'boom' });
  readonly retryable = signal(false);
  retried = 0;
}

describe('ErrorAlert', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [Host] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  it('shows nothing without an error', () => {
    const { fixture, root } = setup();
    fixture.componentInstance.error.set(null);
    fixture.detectChanges();

    expect(root.querySelector('[role="alert"]')).toBeNull();
  });

  it('is an alert with an alert-circle icon, the message and the server detail', () => {
    const { fixture, root } = setup();

    expect(root.querySelector('[role="alert"]')?.classList).toContain('alert--error');
    expect(iconNames(fixture, '[role="alert"]')).toEqual(['alert-circle']);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Erro no servidor');
    expect(root.querySelector('small')?.textContent).toBe('boom');
  });

  it('offers a retry button with a refresh icon and its text as the accessible name, and emits on click', () => {
    const { fixture, root } = setup();
    fixture.componentInstance.retryable.set(true);
    fixture.detectChanges();
    const button = root.querySelector('button')!;

    expect(iconNames(fixture, 'button')).toEqual(['refresh-cw']);
    expect(button.textContent?.trim()).toBe('Tentar novamente');
    button.click();
    expect(fixture.componentInstance.retried).toBe(1);
  });
});
