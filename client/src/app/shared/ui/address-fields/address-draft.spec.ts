import { address } from '../../models/testing/client-address';
import { AddressDraft } from './address-draft';

function filled(draft: AddressDraft) {
  draft.label.set('Depósito');
  draft.postalCode.set('07190-100');
  draft.street.set(' Rua do Depósito ');
  draft.number.set('s/n');
  draft.district.set('Cumbica');
  draft.city.set('Guarulhos');
  draft.state.set('SP');
  return draft;
}

describe('AddressDraft (MRV-9.3)', () => {
  it('is not submittable until every required part is there, the label included', () => {
    const draft = new AddressDraft();
    expect(draft.canSubmit()).toBe(false);
    filled(draft);
    expect(draft.canSubmit()).toBe(true);

    for (const part of ['label', 'street', 'number', 'district', 'city', 'state'] as const) {
      const other = filled(new AddressDraft());
      other[part].set('  ');
      expect(other.canSubmit(), part).toBe(false);
    }
  });

  it('wants a whole CEP, and says so in pt-BR once something is typed', () => {
    const draft = filled(new AddressDraft());
    draft.postalCode.set('');
    expect(draft.problem()).toBeNull();
    expect(draft.canSubmit()).toBe(false);
    draft.postalCode.set('0719');
    expect(draft.problem()).toBe('O CEP deve ter 8 dígitos.');
    expect(draft.canSubmit()).toBe(false);
    draft.postalCode.set('07190-100');
    expect(draft.problem()).toBeNull();
    expect(draft.canSubmit()).toBe(true);
  });

  it('accepts only the 27 states', () => {
    const draft = filled(new AddressDraft());
    draft.state.set('XX');
    expect(draft.canSubmit()).toBe(false);
    draft.state.set('');
    expect(draft.canSubmit()).toBe(false);
  });

  it('builds the request trimmed, with the CEP as 8 digits and empty optional parts as null', () => {
    const draft = filled(new AddressDraft());
    draft.kind.set('Delivery');
    draft.makeDefault.set(true);

    expect(draft.request()).toEqual({
      label: 'Depósito', kind: 'Delivery', postalCode: '07190100', street: 'Rua do Depósito', number: 's/n', complement: null, district: 'Cumbica', city: 'Guarulhos', state: 'SP',
      deliveryNotes: null, isBilling: false, isDefaultDelivery: true,
    });
  });

  it('in the compact form (registration) needs no label and sends no label, type, notes or choices', () => {
    const draft = filled(new AddressDraft(true));
    draft.label.set('');
    draft.makeBilling.set(true);
    draft.deliveryNotes.set('x');

    expect(draft.canSubmit()).toBe(true);
    expect(draft.request()).toMatchObject({ label: null, kind: null, deliveryNotes: null, isBilling: false, isDefaultDelivery: false });
  });

  it('loads an address for editing (CEP masked, empty parts as empty text, choices cleared) and resets', () => {
    const draft = new AddressDraft();
    draft.makeBilling.set(true);
    draft.load(address({ label: 'Sede', kind: 'Billing', complement: null, deliveryNotes: null }));

    expect(draft.label()).toBe('Sede');
    expect(draft.kind()).toBe('Billing');
    expect(draft.postalCode()).toBe('01001-000');
    expect(draft.complement()).toBe('');
    expect(draft.makeBilling()).toBe(false);
    expect(draft.canSubmit()).toBe(true);

    draft.reset();
    expect(draft.label()).toBe('');
    expect(draft.kind()).toBe('Both');
    expect(draft.canSubmit()).toBe(false);
  });
});
