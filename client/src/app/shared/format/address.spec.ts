import { address } from '../models/testing/client-address';
import {
  BRAZIL_STATES, AddressPipe, billingAddressOf, defaultDeliveryOf, deliverableAddresses, foldText, formatAddress, formatPlaceLine, formatPostalCode, formatStreetLine, isSamePlace, maskPostalCode, otherAddressesOf,
} from './address';

describe('address formatting (MRV-9.3)', () => {
  it('masks a CEP while typing: digits only, at most 8, the dash after the fifth', () => {
    expect(maskPostalCode('')).toBe('');
    expect(maskPostalCode(null)).toBe('');
    expect(maskPostalCode('0')).toBe('0');
    expect(maskPostalCode('01001')).toBe('01001');
    expect(maskPostalCode('010010')).toBe('01001-0');
    expect(maskPostalCode('01001000')).toBe('01001-000');
    expect(maskPostalCode('01001-000')).toBe('01001-000');
    expect(maskPostalCode(' 01.001-000 99')).toBe('01001-000');
    expect(maskPostalCode('abc')).toBe('');
  });

  it('shows a stored CEP as 00000-000 and anything else as it is', () => {
    expect(formatPostalCode('01001000')).toBe('01001-000');
    expect(formatPostalCode('')).toBe('');
    expect(formatPostalCode(null)).toBe('');
    expect(formatPostalCode('123')).toBe('123');
  });

  it('writes the street line and the place line, leaving out what is empty', () => {
    expect(formatStreetLine(address({ complement: 'Sala 3' }))).toBe('Praça da Sé, 10 - Sala 3');
    expect(formatStreetLine(address())).toBe('Praça da Sé, 10');
    expect(formatPlaceLine(address())).toBe('Sé, São Paulo/SP, CEP 01001-000');
    // An address still waiting for review has only the old text in the street.
    const legacy = address({ street: 'Rua Velha, 1, Santos', number: '', district: '', city: '', state: '', postalCode: '' });
    expect(formatStreetLine(legacy)).toBe('Rua Velha, 1, Santos');
    expect(formatPlaceLine(legacy)).toBe('');
    expect(formatAddress(legacy)).toBe('Rua Velha, 1, Santos');
    expect(formatAddress(null)).toBe('');
    expect(new AddressPipe().transform(address())).toBe('Praça da Sé, 10, Sé, São Paulo/SP, CEP 01001-000');
  });

  it('lists exactly the 27 states, once each', () => {
    expect(BRAZIL_STATES.length).toBe(27);
    expect(new Set(BRAZIL_STATES.map((s) => s.uf)).size).toBe(27);
    expect(BRAZIL_STATES.every((s) => /^[A-Z]{2}$/.test(s.uf))).toBe(true);
  });

  it('folds case and accents, and spots the same place', () => {
    expect(foldText('  Sálá ÇÃO ')).toBe('sala cao');
    const saved = { postalCode: '01001000', number: '10', complement: 'Sala 2' };
    expect(isSamePlace({ postalCode: '01001-000', number: '10', complement: 'SALÁ 2 ' }, saved)).toBe(true);
    expect(isSamePlace({ postalCode: '01001000', number: '11', complement: 'Sala 2' }, saved)).toBe(false);
    expect(isSamePlace({ postalCode: '01001000', number: '10', complement: null }, saved)).toBe(false);
    expect(isSamePlace({ postalCode: '01001000', number: '10', complement: '' }, { ...saved, complement: null })).toBe(true);
  });

  it('lists only the addresses that can receive goods (MRV-9.6)', () => {
    const both = address({ key: 'a', kind: 'Both' });
    const billing = address({ key: 'b', kind: 'Billing' });
    const delivery = address({ key: 'c', kind: 'Delivery' });
    expect(deliverableAddresses([both, billing, delivery])).toEqual([both, delivery]);
    expect(deliverableAddresses(null)).toEqual([]);
    expect(deliverableAddresses(undefined)).toEqual([]);
  });

  it('picks the default delivery address, else the only deliverable one, else none (the same rule as the server)', () => {
    const both = address({ key: 'a', kind: 'Both' });
    const billing = address({ key: 'b', kind: 'Billing' });
    const delivery = address({ key: 'c', kind: 'Delivery' });
    expect(defaultDeliveryOf({ addresses: [both, delivery], defaultDeliveryKey: 'c' })).toBe(delivery);
    expect(defaultDeliveryOf({ addresses: [billing, delivery], defaultDeliveryKey: null })).toBe(delivery);
    expect(defaultDeliveryOf({ addresses: [both, delivery], defaultDeliveryKey: null })).toBeNull();
    // A default that cannot receive goods (it should not exist) is not used.
    expect(defaultDeliveryOf({ addresses: [billing, delivery], defaultDeliveryKey: 'b' })).toBe(delivery);
    expect(defaultDeliveryOf({ addresses: [billing], defaultDeliveryKey: 'b' })).toBeNull();
    expect(defaultDeliveryOf({})).toBeNull();
  });

  it('finds the billing address and the others by the chosen key', () => {
    const a = address({ key: 'a' });
    const b = address({ key: 'b', isBilling: false });
    expect(billingAddressOf({ addresses: [a, b], billingAddressKey: 'a' })).toBe(a);
    expect(otherAddressesOf({ addresses: [a, b], billingAddressKey: 'a' })).toEqual([b]);
    expect(billingAddressOf({ addresses: [a, b], billingAddressKey: null })).toBeNull();
    expect(otherAddressesOf({ addresses: [a, b], billingAddressKey: null })).toEqual([a, b]);
    expect(billingAddressOf({})).toBeNull();
    expect(otherAddressesOf({})).toEqual([]);
  });
});
