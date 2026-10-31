// Test data for the address specs (imported only by *.spec.ts files, so it never reaches the production bundle).
import type { ClientAddress } from '../client-address.model';

/** A valid address; the key is deliberately GUID-shaped so the "no ids on screen" specs would catch it if a page rendered it. */
export function address(over: Partial<ClientAddress> = {}): ClientAddress {
  return {
    key: '6f1c2a3e-0000-4000-8000-0000000000a1',
    label: 'Matriz',
    kind: 'Both',
    postalCode: '01001000',
    street: 'Praça da Sé',
    number: '10',
    complement: null,
    district: 'Sé',
    city: 'São Paulo',
    state: 'SP',
    country: 'BR',
    deliveryNotes: null,
    isBilling: true,
    isDefaultDelivery: true,
    needsReview: false,
    ...over,
  };
}

/** The matriz (billing and default delivery) plus a delivery-only branch, with the two chosen keys. */
export function twoAddresses() {
  const matriz = address();
  const filial = address({
    key: '6f1c2a3e-0000-4000-8000-0000000000b2', label: 'Filial Campinas', kind: 'Delivery', postalCode: '13010000', street: 'Rua Barão de Jaguara', number: '200',
    complement: 'Sala 3', district: 'Centro', city: 'Campinas', isBilling: false, isDefaultDelivery: false, deliveryNotes: 'Entregar de manhã',
  });
  return { addresses: [matriz, filial], billingAddressKey: matriz.key, defaultDeliveryKey: matriz.key };
}
