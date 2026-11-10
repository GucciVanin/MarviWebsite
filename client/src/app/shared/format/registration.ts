/** Brazilian registration identifiers (MRV-9.4): masks while typing, formatting for display and the same check-digit rules as the server (CnpjRules, CpfRules). */

const BODY = /^[0-9A-Z]{12}$/;

/** The CNPJ as typed, reduced to its characters: digits and the letters A-Z (the Receita issues alphanumeric numbers since July 2026), upper-case, at most 14. */
export function cnpjCharacters(text: string | null | undefined): string {
  return (text ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 14);
}

/** What a CNPJ field shows while typing: `AA.AAA.AAA/AAAA-DD`, as far as the characters go. */
export function maskCnpj(text: string | null | undefined): string {
  const c = cnpjCharacters(text);
  const parts = [c.slice(0, 2), c.slice(2, 5), c.slice(5, 8)].filter(Boolean);
  let out = parts.join('.');
  if (c.length > 8) out += `/${c.slice(8, 12)}`;
  if (c.length > 12) out += `-${c.slice(12)}`;
  return out;
}

/** A stored CNPJ (14 characters) as shown; anything else as it is. */
export function formatCnpj(cnpj: string | null | undefined): string {
  return cnpj && cnpj.length === 14 ? maskCnpj(cnpj) : (cnpj ?? '');
}

function cnpjDigit(chars: string, weights: number[]): number {
  const sum = weights.reduce((total, weight, i) => total + (chars.charCodeAt(i) - 48) * weight, 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

/** Módulo 11 over each character's ASCII code minus 48 (digits keep their value, "A" is 17): the Receita's rule for numeric and alphanumeric CNPJs. */
export function isValidCnpj(text: string | null | undefined): boolean {
  const c = cnpjCharacters(text);
  if (c.length !== 14 || !BODY.test(c.slice(0, 12)) || !/^\d\d$/.test(c.slice(12)) || new Set(c).size === 1) {
    return false;
  }
  const one = cnpjDigit(c, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const two = cnpjDigit(c.slice(0, 12) + one, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return c.slice(12) === `${one}${two}`;
}

/** The establishment order 0001 is the head office (matriz); any other is a branch (filial). Null until all 14 characters are there. */
export function cnpjKind(text: string | null | undefined): 'Matriz' | 'Filial' | null {
  const c = cnpjCharacters(text);
  return c.length === 14 ? (c.slice(8, 12) === '0001' ? 'Matriz' : 'Filial') : null;
}

export function cpfDigits(text: string | null | undefined): string {
  return (text ?? '').replace(/\D/g, '').slice(0, 11);
}

/** What a CPF field shows while typing: `000.000.000-00`, as far as the digits go. */
export function maskCpf(text: string | null | undefined): string {
  const d = cpfDigits(text);
  let out = d.slice(0, 3);
  if (d.length > 3) out += `.${d.slice(3, 6)}`;
  if (d.length > 6) out += `.${d.slice(6, 9)}`;
  if (d.length > 9) out += `-${d.slice(9)}`;
  return out;
}

export function isValidCpf(text: string | null | undefined): boolean {
  const d = cpfDigits(text);
  if (d.length !== 11 || new Set(d).size === 1) {
    return false;
  }
  const digit = (count: number) => {
    const sum = [...d.slice(0, count)].reduce((total, c, i) => total + Number(c) * (count + 1 - i), 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return Number(d[9]) === digit(9) && Number(d[10]) === digit(10);
}

/** What a phone field shows while typing: `(11) 91234-5678` or `(11) 3333-4444`. */
export function maskPhone(text: string | null | undefined): string {
  const d = (text ?? '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  const split = d.length > 10 ? 7 : 6;
  return `(${d.slice(0, 2)}) ${d.slice(2, split)}${d.length > split ? `-${d.slice(split)}` : ''}`;
}

/** What a CNAE field shows while typing: `0000-0/00`. */
export function maskCnae(text: string | null | undefined): string {
  const d = (text ?? '').replace(/\D/g, '').slice(0, 7);
  let out = d.slice(0, 4);
  if (d.length > 4) out += `-${d.slice(4, 5)}`;
  if (d.length > 5) out += `/${d.slice(5)}`;
  return out;
}

/** True when someone born on `birth` (`yyyy-mm-dd`) is 18 or older on `today` (`yyyy-mm-dd`); exactly 18 today counts. A 29 February birthday counts from 1 March (the conservative day, as on the server). */
export function isAdult(birth: string, today: string): boolean {
  const [by, bm, bd] = birth.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - by > 18 || (ty - by === 18 && (tm > bm || (tm === bm && td >= bd)));
}

/** Today as `yyyy-mm-dd` in Brazil (UTC-3, no daylight saving since 2019): the day the age and opening-date rules count. */
export function todayInBrazil(now: Date = new Date()): string {
  return new Date(now.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

/** A calendar date from the API (`yyyy-mm-dd`, no time) as `dd/mm/aaaa`, cut apart as text so no time zone can move the day. */
export function formatDateOnly(date: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}
