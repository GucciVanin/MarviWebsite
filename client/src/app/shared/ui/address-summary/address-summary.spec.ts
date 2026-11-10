import { TestBed } from '@angular/core/testing';
import { address } from '../../models/testing/client-address';
import { AddressSummary } from './address-summary';

describe('AddressSummary (MRV-9.3)', () => {
  function render(over: Parameters<typeof address>[0] = {}) {
    const fixture = TestBed.createComponent(AddressSummary);
    fixture.componentRef.setInput('address', address(over));
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ');
  }

  it('shows the label, the markers, the kind, both lines and the notes, and never the key', () => {
    const shown = render({ complement: 'Sala 3', deliveryNotes: 'Portão azul' });

    expect(shown).toContain('Matriz');
    expect(shown).toContain('Principal');
    expect(shown).toContain('Entrega padrão');
    expect(shown).toContain('Cobrança e entrega');
    expect(shown).toContain('Praça da Sé, 10 - Sala 3');
    expect(shown).toContain('Sé, São Paulo/SP, CEP 01001-000');
    expect(shown).toContain('Notas de entrega: Portão azul');
    expect(shown).not.toContain('6f1c2a3e');
  });

  it('marks neither Principal nor Entrega padrão on a plain address, and flags one that needs review', () => {
    const shown = render({ isBilling: false, isDefaultDelivery: false, kind: 'Delivery', needsReview: true });

    expect(shown).not.toContain('Principal');
    expect(shown).not.toContain('Entrega padrão');
    expect(shown).toContain('Precisa ser completado');
    expect(shown).not.toContain('Notas de entrega');
  });
});
