import { BrlPipe } from './brl.pipe';
import { PtDatePipe } from './pt-date.pipe';

// Intl uses a no-break space between "R$" and the number; compare with ordinary spaces.
const plain = (text: string) => text.replace(/ /g, ' ');

describe('BrlPipe', () => {
  const pipe = new BrlPipe();

  it.each([
    [1234.5, 'R$ 1.234,50'],
    [0, 'R$ 0,00'],
    [9.9, 'R$ 9,90'],
    [1000000, 'R$ 1.000.000,00'],
    [-3.25, '-R$ 3,25'],
    [0.005, 'R$ 0,01'],
  ])('writes %f as %s', (value, text) => {
    expect(plain(pipe.transform(value))).toBe(text);
  });

  it('leaves a missing value empty, never 0', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
  });
});

describe('PtDatePipe', () => {
  const pipe = new PtDatePipe();

  it('writes a timestamp as dd/mm/aa hh:mm in the local time zone', () => {
    // A local-time ISO string (no Z) is read in the viewer's time zone, so the result does not depend on where the test runs.
    expect(plain(pipe.transform('2026-03-05T14:07:00'))).toMatch(/^05\/03\/(20)?26,? 14:07$/);
  });

  it('converts a UTC instant to the viewer\'s time zone', () => {
    const instant = '2026-03-05T12:00:00Z';
    const expected = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(instant));

    expect(pipe.transform(instant)).toBe(expected);
  });

  it.each([[null], [undefined], [''], ['not a date'], ['2026-13-45']])('shows nothing for %s', (value) => {
    expect(pipe.transform(value as string | null | undefined)).toBe('');
  });
});
