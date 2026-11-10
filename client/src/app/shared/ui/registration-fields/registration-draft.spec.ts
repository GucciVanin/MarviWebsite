import { personalRegistration, registration } from '../../models/testing/registration';
import { RegistrationDraft } from './registration-draft';

const TODAY = '2026-10-30';
const draft = (compact = false) => new RegistrationDraft(compact, () => TODAY);

describe('RegistrationDraft (MRV-9.4)', () => {
  it('cannot be submitted before a type and a name', () => {
    const d = draft();
    expect(d.canSubmit()).toBe(false);
    d.chooseType('Business');
    expect(d.canSubmit()).toBe(false);
    d.name.set('Bar do Zé');
    expect(d.canSubmit()).toBe(true);
  });

  it('a business needs nothing else; each filled field is checked and named in pt-BR', () => {
    const d = draft();
    d.chooseType('Business');
    d.name.set('Bar');
    d.setCnpj('11222333000182');
    d.setPhone('123');
    d.invoiceEmail.set('nope');
    d.setCnae('12');
    d.opening.set('2026-10-31');
    d.setIeStatus('Contributor');

    expect(Object.keys(d.problems()).sort()).toEqual(['cnpj', 'invoiceEmail', 'mainCnae', 'openingDate', 'phone', 'stateRegistration']);
    expect(d.problems()['cnpj']).toContain('CNPJ inválido');
    expect(d.canSubmit()).toBe(false);

    d.setCnpj('12abc34501de35');
    d.setPhone('11912345678');
    d.invoiceEmail.set('nfe@acme.com.br');
    d.setCnae('4634601');
    d.opening.set('2010-05-04');
    d.ie.set('110.042.490.114');
    expect(d.problems()).toEqual({});
    expect(d.canSubmit()).toBe(true);
  });

  it('the state registration is only for a contributor: choosing anything else empties it', () => {
    const d = draft();
    d.chooseType('Business');
    d.setIeStatus('Contributor');
    d.ie.set('123456');
    d.setIeStatus('Exempt');

    expect(d.ie()).toBe('');
    d.name.set('Bar');
    expect(d.request()).toMatchObject({ stateRegistrationStatus: 'Exempt', stateRegistration: null });
  });

  it('a personal account needs a valid CPF and a birth date of 18 or older', () => {
    const d = draft();
    d.chooseType('Personal');
    d.name.set('João');
    expect(d.canSubmit()).toBe(false);

    d.setCpf('11144477736');
    d.birth.set('2008-10-31');
    expect(d.problems()['cpf']).toContain('CPF inválido');
    expect(d.problems()['birthDate']).toContain('18 anos');
    expect(d.problems()['birthDate']).toContain('bebidas alcoólicas');

    d.setCpf('11144477735');
    d.birth.set('2008-10-30');
    expect(d.problems()).toEqual({});
    expect(d.canSubmit()).toBe(true);

    d.birth.set('2026-10-31');
    expect(d.problems()['birthDate']).toBe('Data de nascimento inválida.');
  });

  it('a stored CPF is kept by leaving the field empty, and is never loaded back', () => {
    const d = draft();
    d.load('João', personalRegistration());

    expect(d.cpf()).toBe('');
    expect(d.hasCpf()).toBe(true);
    expect(d.canSubmit()).toBe(true);
    expect(d.request()).toMatchObject({ cpf: null, birthDate: '1990-03-02' });
    d.setCpf('52998224725');
    expect(d.request()).toMatchObject({ cpf: '52998224725' });
  });

  it('sends only the fields of the chosen type, with the CNPJ and CNAE as bare characters', () => {
    const business = draft();
    business.load('Acme', registration());
    expect(business.request()).toEqual({
      phone: '(11) 91234-5678', invoiceEmail: 'nfe@acme.com.br', cnpj: '11222333000181', legalName: 'Acme Comércio Ltda', tradeName: 'Acme',
      stateRegistrationStatus: 'Contributor', stateRegistration: '110042490114', municipalRegistration: '123456', mainCnae: '4634601', taxRegime: 'SimplesNacional',
      openingDate: '2010-05-04', contactName: 'Ana Souza',
    });
    const person = draft();
    person.load('João', personalRegistration());
    const sent = person.request();
    expect(Object.keys(sent).sort()).toEqual(['birthDate', 'cpf', 'invoiceEmail', 'phone']);
  });

  it('the compact form (registration page) sends only the essentials', () => {
    const d = draft(true);
    d.chooseType('Business');
    d.name.set('Bar');
    d.setCnpj('11.222.333/0001-81');
    d.setPhone('11912345678');
    expect(d.request()).toEqual({ cnpj: '11222333000181' });
    d.chooseType('Personal');
    d.setCpf('11144477735');
    d.birth.set('1990-01-01');
    expect(d.request()).toEqual({ cpf: '11144477735', birthDate: '1990-01-01' });
  });

  it('changing the type forgets the other type\'s fields', () => {
    const d = draft();
    d.load('Acme', registration());
    d.chooseType('Personal');

    expect(d.cnpj()).toBe('');
    expect(d.legalName()).toBe('');
    expect(d.ieStatus()).toBe('');
    expect(d.phone()).toBe('(11) 91234-5678');
  });

  describe('what the server says by field', () => {
    it('shows each named problem next to its field, and returns the ones with no control', () => {
      const d = draft();
      d.chooseType('Business');
      d.name.set('Bar');

      const loose = d.setServerProblems([
        { field: 'cnpj', message: 'CNPJ inválido.' },
        { field: 'companyName', message: 'Nome obrigatório.' },
        { field: 'registration', message: 'Dados de pessoa em conta de empresa.' },
      ]);

      expect(d.problems()['cnpj']).toBe('CNPJ inválido.');
      expect(d.problems()['name']).toBe('Nome obrigatório.');
      expect(loose).toEqual(['Dados de pessoa em conta de empresa.']);
    });

    it('never blocks the next submit, and what the user typed wins over an old server message', () => {
      const d = draft();
      d.chooseType('Business');
      d.name.set('Bar');
      d.setServerProblems([{ field: 'cnpj', message: 'Do servidor.' }]);

      expect(d.canSubmit()).toBe(true);
      d.setCnpj('11222333000182');
      expect(d.problems()['cnpj']).toContain('CNPJ inválido: confira');
      d.setServerProblems([]);
      d.setCnpj('');
      expect(d.problems()).toEqual({});
    });
  });

});
