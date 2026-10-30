import { Pipe, PipeTransform } from '@angular/core';
import type { ClientAddress } from '../models/client-address.model';

/** The 27 federative units, in the order a select lists them (by name of the state, as Brazilians expect). */
export const BRAZIL_STATES: readonly { uf: string; name: string }[] = [
  { uf: 'AC', name: 'Acre' }, { uf: 'AL', name: 'Alagoas' }, { uf: 'AP', name: 'Amapá' }, { uf: 'AM', name: 'Amazonas' },
  { uf: 'BA', name: 'Bahia' }, { uf: 'CE', name: 'Ceará' }, { uf: 'DF', name: 'Distrito Federal' }, { uf: 'ES', name: 'Espírito Santo' },
  { uf: 'GO', name: 'Goiás' }, { uf: 'MA', name: 'Maranhão' }, { uf: 'MT', name: 'Mato Grosso' }, { uf: 'MS', name: 'Mato Grosso do Sul' },
  { uf: 'MG', name: 'Minas Gerais' }, { uf: 'PA', name: 'Pará' }, { uf: 'PB', name: 'Paraíba' }, { uf: 'PR', name: 'Paraná' },
  { uf: 'PE', name: 'Pernambuco' }, { uf: 'PI', name: 'Piauí' }, { uf: 'RJ', name: 'Rio de Janeiro' }, { uf: 'RN', name: 'Rio Grande do Norte' },
  { uf: 'RS', name: 'Rio Grande do Sul' }, { uf: 'RO', name: 'Rondônia' }, { uf: 'RR', name: 'Roraima' }, { uf: 'SC', name: 'Santa Catarina' },
  { uf: 'SP', name: 'São Paulo' }, { uf: 'SE', name: 'Sergipe' }, { uf: 'TO', name: 'Tocantins' },
];

/** What a CEP field shows while typing: digits only, at most 8, the dash after the fifth (`01001-000`). */
export function maskPostalCode(text: string | null | undefined): string {
  const digits = (text ?? '').replace(/\D/g, '').slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

/** A stored CEP (8 digits) as shown: `00000-000`. Anything else is shown as it is, so a half-migrated value is not hidden. */
export function formatPostalCode(code: string | null | undefined): string {
  return /^\d{8}$/.test(code ?? '') ? `${code!.slice(0, 5)}-${code!.slice(5)}` : (code ?? '');
}

/** The street line of an address: `Rua A, 10 - Sala 3`. */
export function formatStreetLine(address: Pick<ClientAddress, 'street' | 'number' | 'complement'>): string {
  const head = address.number ? `${address.street}, ${address.number}` : address.street;
  return address.complement ? `${head} - ${address.complement}` : head;
}

/** The place line: `Centro, Campinas/SP, CEP 13010-000`. Empty parts (an address still waiting for review) are left out. */
export function formatPlaceLine(address: Pick<ClientAddress, 'district' | 'city' | 'state' | 'postalCode'>): string {
  const cityState = [address.city, address.state].filter(Boolean).join('/');
  return [address.district, cityState, address.postalCode ? `CEP ${formatPostalCode(address.postalCode)}` : ''].filter(Boolean).join(', ');
}

/** The whole address on one line, for a place that has room for one (a lookup fact, a table cell). */
export function formatAddress(address: Pick<ClientAddress, 'street' | 'number' | 'complement' | 'district' | 'city' | 'state' | 'postalCode'> | null | undefined): string {
  if (!address) {
    return '';
  }
  return [formatStreetLine(address), formatPlaceLine(address)].filter(Boolean).join(', ');
}

/** Lower case without accents or surrounding spaces: "Sala 2" and "SALÁ 2 " are one place (the server folds the same way). */
export function foldText(text: string | null | undefined): string {
  return (text ?? '').trim().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** True when both addresses are the same place: same CEP, number and complement, ignoring case and accents. */
export function isSamePlace(
  a: Pick<ClientAddress, 'postalCode' | 'number' | 'complement'>,
  b: Pick<ClientAddress, 'postalCode' | 'number' | 'complement'>,
): boolean {
  return (
    a.postalCode.replace(/\D/g, '') === b.postalCode.replace(/\D/g, '') &&
    foldText(a.number) === foldText(b.number) &&
    foldText(a.complement) === foldText(b.complement)
  );
}

/** `{{ address | address }}`: the whole address on one line. */
@Pipe({ name: 'address' })
export class AddressPipe implements PipeTransform {
  transform(value: Parameters<typeof formatAddress>[0]): string {
    return formatAddress(value);
  }
}

type WithAddressList = { addresses?: ClientAddress[] | null; billingAddressKey?: string | null };

/** The billing address of a customer (the one `billingAddressKey` names), or null when there is none. */
export function billingAddressOf(customer: WithAddressList): ClientAddress | null {
  return (customer.addresses ?? []).find((a) => a.key === customer.billingAddressKey) ?? null;
}

/** Every address that is not the billing one, in the order the server listed them. */
export function otherAddressesOf(customer: WithAddressList): ClientAddress[] {
  return (customer.addresses ?? []).filter((a) => a.key !== customer.billingAddressKey);
}
