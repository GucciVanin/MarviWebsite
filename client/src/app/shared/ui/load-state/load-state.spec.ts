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

@Component({ imports: [LoadState], template: '<app-load-state [state]="state()" emptyText="Nada por aqui" [variant]="variant()" [skeletonCount]="3" />' })
class Host {
  readonly state = signal<Loadable<unknown>>(fake());
  readonly variant = signal<'text' | 'cards'>('text');
}

describe('LoadState', () => {
  function setup(state: Loadable<unknown>, variant: 'text' | 'cards' = 'text') {
    TestBed.configureTestingModule({ imports: [Host] });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.state.set(state);
    fixture.componentInstance.variant.set(variant);
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

  describe('cards variant (MRV-7.3)', () => {
    it('shows skeleton cards while loading, with the loading text kept as a status for assistive technology', () => {
      const { root } = setup(fake({ loading: true }), 'cards');

      expect(root.querySelectorAll('.skeleton-card').length).toBe(3);
      expect(root.querySelector('[role="status"]')?.textContent?.trim()).toBe('Carregando…');
      expect(root.querySelector('.skeleton-card')?.getAttribute('aria-hidden')).toBe('true');
      expect(root.querySelector('app-icon')).toBeNull();
    });

    it('shows no skeleton once loaded: the empty text takes over', () => {
      expect(setup(fake({ loaded: true, data: [] }), 'cards').root.textContent?.trim()).toBe('Nada por aqui');
    });

    it('shows the error, not the skeleton, on a failure', () => {
      const { root } = setup(fake({ loading: true, error: { status: 0, message: 'Sem conexão', detail: null } }), 'cards');

      expect(root.querySelector('.skeleton-card')).toBeNull();
      expect(root.querySelector('[role="alert"]')).not.toBeNull();
    });

    it('keeps the default variant a plain spinner line', () => {
      const { root } = setup(fake({ loading: true }));

      expect(root.querySelector('.skeleton-card')).toBeNull();
      expect(root.querySelector('app-icon')).not.toBeNull();
    });
  });

  describe('product skeleton (MRV-7.4)', () => {
    it('has the same two parts as a product card, an art block and a body, all hidden from assistive technology', () => {
      const { root } = setup(fake({ loading: true }), 'cards');
      const card = root.querySelector('.skeleton-card')!;

      expect(card.classList).toContain('skeleton-card--product');
      expect(card.querySelector('.skeleton-card__art')).not.toBeNull();
      expect(card.querySelector('.skeleton-card__body .skeleton')).not.toBeNull();
      expect(card.getAttribute('aria-hidden')).toBe('true');
      expect(root.querySelector('.product-grid')).not.toBeNull();
    });
  });
});
