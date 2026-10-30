import { Pipe, PipeTransform } from '@angular/core';

/** `C-000042`: a number with its letter and at least six digits. A missing or non-positive number is shown as nothing, never as 0. */
function formatNumber(letter: string, value: number | null | undefined): string {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? `${letter}-${String(value).padStart(6, '0')}` : '';
}

export function formatCustomerNumber(value: number | null | undefined): string {
  return formatNumber('C', value);
}

/** Reads `C-000042` (or plain digits) back into the number; null for anything else, so a hand-typed address cannot reach the API. */
export function parseCustomerNumber(text: string | null | undefined): number | null {
  const match = /^(?:C-)?(\d{1,9})$/i.exec((text ?? '').trim());
  const value = match ? Number(match[1]) : 0;
  return value > 0 ? value : null;
}

export type DocumentKind = 'quote' | 'order';

export function formatDocumentNumber(value: number | null | undefined, kind: DocumentKind): string {
  return formatNumber(kind === 'quote' ? 'Q' : 'P', value);
}

/** The customer number as staff read it out: C-000042. The customer's id is never shown (MRV-9.1). */
@Pipe({ name: 'customerNumber' })
export class CustomerNumberPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return formatCustomerNumber(value);
  }
}

/** The number of a quote (Q-000123) or an order (P-000045), whichever `kind` says. */
@Pipe({ name: 'documentNumber' })
export class DocumentNumberPipe implements PipeTransform {
  transform(value: number | null | undefined, kind: DocumentKind): string {
    return formatDocumentNumber(value, kind);
  }
}
