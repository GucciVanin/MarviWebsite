import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ApiError } from '../../../core/http/api-error';
import type { Loadable } from '../../../core/http/loadable';
import { iconNames } from '../app-icon/testing/icon-names';
import { LoadState } from './load-state';

function fake(over: { loading?: boolean; loaded?: boolean; data?: unknown; error?: ApiError | null } = {}): Loadable<unknown> {
  return {
    data: signal(over.data ?? []),
    loading: signal(over.loading ?? false),
    loaded: signal(over.loaded ?? false),
    error: signal(over.error ?? null),
    load: () => undefined,
  };
}

@Component({ imports: [LoadState], template: '<app-load-state [state]="state()" emptyText="Nada por aqui" />' })
class Host {
  readonly state = signal<Loadable<unknown>>(fake());
}

describe('LoadState', () => {
  function setup(state: Loadable<unknown>) {
    TestBed.configureTestingModule({ imports: [Host] });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.state.set(state);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  it('shows a spinner icon with the loading text while loading, as a status', () => {
    const { fixture, root } = setup(fake({ loading: true }));

    expect(iconNames(fixture)).toEqual(['loader']);
    expect(root.querySelector('[role="status"]')?.textContent?.trim()).toBe('Carregando…');
    expect(root.querySelector('app-icon')?.classList).toContain('icon-spin');
  });

  it('shows an inbox icon with the empty text for an empty list', () => {
    const { fixture, root } = setup(fake({ loaded: true, data: [] }));

    expect(iconNames(fixture)).toEqual(['inbox']);
    expect(root.textContent?.trim()).toBe('Nada por aqui');
  });

  it('shows the error alert, with its icons and retry, on a failure', () => {
    const { fixture, root } = setup(fake({ error: { status: 0, message: 'Sem conexão', detail: null } }));

    expect(iconNames(fixture)).toEqual(['alert-circle', 'refresh-cw']);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Sem conexão');
  });
});
