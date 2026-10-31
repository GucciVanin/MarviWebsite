import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { DeliveryAddressSnapshot } from '../../models/delivery-address.model';
import { DeliveryTo } from './delivery-to';

const snapshot: DeliveryAddressSnapshot = {
  label: 'Filial Campinas', postalCode: '13010000', street: 'Rua Barão de Jaguara', number: '200', complement: 'Sala 3', district: 'Centro', city: 'Campinas', state: 'SP',
  notes: 'Entregar de manhã', line: 'Rua Barão de Jaguara, 200 - Sala 3, Centro, Campinas/SP, CEP 13010-000',
};

@Component({
  imports: [DeliveryTo],
  template: `<app-delivery-to [snapshot]="snapshot" [text]="text" [compact]="compact" />`,
})
class Host {
  snapshot: DeliveryAddressSnapshot | null = null;
  text: string | null = null;
  compact = false;
}

describe('DeliveryTo (MRV-9.6)', () => {
  function render(over: Partial<Host>) {
    const fixture = TestBed.createComponent(Host);
    Object.assign(fixture.componentInstance, over);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ').trim();
  }

  it('shows the label, the street and place lines and the delivery notes of the snapshot', () => {
    const shown = render({ snapshot });

    expect(shown).toContain('Entregar em: Filial Campinas');
    expect(shown).toContain('Rua Barão de Jaguara, 200 - Sala 3');
    expect(shown).toContain('Centro, Campinas/SP, CEP 13010-000');
    expect(shown).toContain('Notas de entrega: Entregar de manhã');
  });

  it('shows the label and the whole address on one line when compact', () => {
    expect(render({ snapshot, compact: true })).toBe(`Filial Campinas: ${snapshot.line}`);
  });

  it('falls back to the old free text, then to "Endereço a confirmar"', () => {
    expect(render({ text: 'Rua Antiga, 5' })).toBe('Entregar em: Rua Antiga, 5');
    expect(render({ text: '' })).toBe('Entregar em: Endereço a confirmar');
    expect(render({ text: null, compact: true })).toBe('Endereço a confirmar');
    expect(render({ text: 'Rua Antiga, 5', compact: true })).toBe('Rua Antiga, 5');
  });

  it('shows the customer\'s text as text, never as markup', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.snapshot = { ...snapshot, label: '<img src=x onerror=alert(1)>', notes: '<b>negrito</b>' };
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('b')).toBeNull();
    expect(root.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
