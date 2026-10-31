import {
  cnpjCharacters, cnpjKind, formatCnpj, formatDateOnly, isAdult, isValidCnpj, isValidCpf, maskCnae, maskCnpj, maskCpf, maskPhone, todayInBrazil,
} from './registration';

describe('registration identifiers (MRV-9.4)', () => {
  describe('CNPJ', () => {
    it.each(['11.222.333/0001-81', '11444777000161', '00.000.000/0001-91', '12.ABC.345/01DE-35', '12abc34501de35'])('accepts the valid number %s', (cnpj) => {
      expect(isValidCnpj(cnpj)).toBe(true);
    });

    it.each(['11222333000182', '11222333000171', '12ABC34501DE3A', '12ABC34501DEAA', '00000000000000', '11111111111111', '1122233300018', '', null])(
      'refuses %s',
      (cnpj) => {
        expect(isValidCnpj(cnpj as string)).toBe(false);
      },
    );

    it('masks while typing, letters allowed and upper-cased, nothing but letters and digits kept', () => {
      expect(maskCnpj('12abc34501de35')).toBe('12.ABC.345/01DE-35');
      expect(maskCnpj('11.222-x!333')).toBe('11.222.X33/3');
      expect(maskCnpj('1')).toBe('1');
      expect(maskCnpj('11222')).toBe('11.222');
      expect(maskCnpj('112223330001811999')).toBe('11.222.333/0001-81');
      expect(maskCnpj(null)).toBe('');
      expect(cnpjCharacters('11.222.333/0001-81')).toBe('11222333000181');
    });

    it('tells the head office (order 0001) from a branch, only once all 14 characters are there', () => {
      expect(cnpjKind('11222333000181')).toBe('Matriz');
      expect(cnpjKind('11222333000262')).toBe('Filial');
      expect(cnpjKind('1122233300')).toBeNull();
      expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81');
      expect(formatCnpj(null)).toBe('');
    });
  });

  describe('CPF', () => {
    it.each(['111.444.777-35', '52998224725', '280.012.389-38'])('accepts %s', (cpf) => expect(isValidCpf(cpf)).toBe(true));
    it.each(['111.444.777-36', '11111111111', '00000000000', '1114447773', ''])('refuses %s', (cpf) => expect(isValidCpf(cpf)).toBe(false));

    it('masks while typing', () => {
      expect(maskCpf('11144477735')).toBe('111.444.777-35');
      expect(maskCpf('1114')).toBe('111.4');
      expect(maskCpf('111.444.777-35999')).toBe('111.444.777-35');
      expect(maskCpf(null)).toBe('');
    });
  });

  describe('phone and CNAE', () => {
    it('masks a mobile and a landline number', () => {
      expect(maskPhone('11912345678')).toBe('(11) 91234-5678');
      expect(maskPhone('1133334444')).toBe('(11) 3333-4444');
      expect(maskPhone('1')).toBe('(1');
      expect(maskPhone('')).toBe('');
    });

    it('masks the CNAE as 0000-0/00', () => {
      expect(maskCnae('4634601')).toBe('4634-6/01');
      expect(maskCnae('46')).toBe('46');
      expect(maskCnae(null)).toBe('');
    });
  });

  describe('age and dates', () => {
    it('exactly 18 today is an adult; one day short is not', () => {
      expect(isAdult('2008-10-30', '2026-10-30')).toBe(true);
      expect(isAdult('2008-10-31', '2026-10-30')).toBe(false);
      expect(isAdult('1990-03-02', '2026-10-30')).toBe(true);
    });

    it('a 29 February birthday counts from 1 March, like the server', () => {
      expect(isAdult('2008-02-29', '2026-02-28')).toBe(false);
      expect(isAdult('2008-02-29', '2026-03-01')).toBe(true);
    });

    it('today in Brazil is UTC minus 3 hours', () => {
      expect(todayInBrazil(new Date('2026-10-30T02:59:00Z'))).toBe('2026-10-29');
      expect(todayInBrazil(new Date('2026-10-30T03:00:00Z'))).toBe('2026-10-30');
    });

    it('formats a date without a time zone moving the day', () => {
      expect(formatDateOnly('2010-05-04')).toBe('04/05/2010');
      expect(formatDateOnly(null)).toBe('');
      expect(formatDateOnly('not a date')).toBe('');
    });
  });
});
