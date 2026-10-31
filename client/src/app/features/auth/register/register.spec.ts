import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { iconNames } from '../../../shared/ui/app-icon/testing/icon-names';
import type { AddressDraft } from '../../../shared/ui/address-fields/address-draft';
import type { RegistrationDraft } from '../../../shared/ui/registration-fields/registration-draft';
import { Register } from './register';

/** Types a complete billing address into the form's draft, as the fields would. */
function fillAddress(register: Register, over: Partial<Record<'postalCode' | 'street' | 'number' | 'district' | 'city' | 'state', string>> = {}) {
  const draft = (register as unknown as { address: AddressDraft }).address;
  const values = { postalCode: '01001-000', street: 'Praça da Sé', number: '10', district: 'Sé', city: 'São Paulo', state: 'SP', ...over };
  for (const [name, value] of Object.entries(values)) {
    draft[name as keyof typeof values].set(value);
  }
}

const registrationOf = (register: Register) => (register as unknown as { registration: RegistrationDraft }).registration;

/** Chooses the business account and types a name, as the page would. */
function fillBusiness(register: Register, name = 'Bar do Zé', cnpj = '') {
  const draft = registrationOf(register);
  draft.chooseType('Business');
  draft.name.set(name);
  draft.setCnpj(cnpj);
}

describe('Register', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  function setup() {
    TestBed.configureTestingModule({
      imports: [Register],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(Register);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const type = (id: string, value: string) => {
      const el = root.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)!;
      el.value = value;
      el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input'));
      fixture.detectChanges();
    };
    const choose = (kind: 'business' | 'personal') => {
      root.querySelector<HTMLInputElement>(`#register-type-${kind}`)!.click();
      fixture.detectChanges();
    };
    return { fixture, root, type, choose, http: TestBed.inject(HttpTestingController) };
  }

  it('shows the shared server message, not a data complaint, when registration hits a server failure', async () => {
    const { fixture, http } = setup();

    fillBusiness(fixture.componentInstance);
    fillAddress(fixture.componentInstance);
    fixture.componentInstance.submit();
    http.expectOne('/api/auth/register').flush('x', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();

    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent ?? '';
    expect(alert).toContain('Erro no servidor');
    expect(alert).not.toContain('Verifique os dados');
  });

  it('shows registration problems in Portuguese and re-enables the button', async () => {
    const { fixture, http } = setup();

    fillBusiness(fixture.componentInstance);
    fillAddress(fixture.componentInstance);
    fixture.componentInstance.submit();
    http
      .expectOne('/api/auth/register')
      .flush(['Passwords must have at least one non alphanumeric character.'], {
        status: 400,
        statusText: 'Bad Request',
      });
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const alert = element.querySelector('[role="alert"]')?.textContent ?? '';
    expect(alert).toContain('caractere especial');
    expect(alert).not.toContain('Passwords');
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
  });

  it('posts the account type, its data and the structured billing address (CEP as 8 digits, no label or type: the server makes it the first address)', () => {
    const { fixture, http } = setup();
    Object.assign(fixture.componentInstance, { email: 'ana@example.com', password: 'Abc123!' });

    fillBusiness(fixture.componentInstance, ' Bar do Zé ', '11.222.333/0001-81');
    fillAddress(fixture.componentInstance, { postalCode: '01001-000' });
    fixture.componentInstance.submit();

    const request = http.expectOne('/api/auth/register');
    expect(request.request.body).toEqual({
      email: 'ana@example.com', password: 'Abc123!', companyName: 'Bar do Zé',
      billingAddress: {
        label: null, kind: null, postalCode: '01001000', street: 'Praça da Sé', number: '10', complement: null, district: 'Sé', city: 'São Paulo', state: 'SP',
        deliveryNotes: null, isBilling: false, isDefaultDelivery: false,
      },
      accountType: 'Business',
      registration: { cnpj: '11222333000181' },
    });
    request.flush({ id: 'a1' }, { status: 201, statusText: 'Created' });
  });

  it('says in pt-BR what is missing, and sends nothing, while the billing address is incomplete', async () => {
    const { fixture, http } = setup();

    fillBusiness(fixture.componentInstance);
    fillAddress(fixture.componentInstance, { postalCode: '0100', state: '' });
    fixture.componentInstance.submit();
    await fixture.whenStable();
    fixture.detectChanges();

    http.expectNone('/api/auth/register');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain('Preencha o endereço de cobrança completo');
  });

  it('masks the CEP while typing and lists the 27 states', () => {
    const { fixture } = setup();
    const root = fixture.nativeElement as HTMLElement;

    const cep = root.querySelector<HTMLInputElement>('#register-address-cep')!;
    cep.value = '01001000';
    cep.dispatchEvent(new Event('input'));

    expect(cep.value).toBe('01001-000');
    expect(root.querySelector<HTMLSelectElement>('#register-address-state')!.options.length).toBe(28);
    expect(root.querySelector('#register-address-label')).toBeNull(); // no label or type on registration
  });

  it('links to the privacy policy', () => {
    const { fixture } = setup();

    expect((fixture.nativeElement as HTMLElement).querySelector('a[href="/privacidade"]')).not.toBeNull();
  });

  describe('the account type (MRV-9.4)', () => {
    it('starts with the two-option choice and no type selected, and shows no data field until one is chosen', () => {
      const { root } = setup();

      const radios = Array.from(root.querySelectorAll<HTMLInputElement>('fieldset.choice-group input[type="radio"]'));
      expect(radios.map((r) => r.id)).toEqual(['register-type-business', 'register-type-personal']);
      expect(radios.every((r) => !r.checked)).toBe(true);
      const text = (root.textContent ?? '').replace(/\s+/g, ' ');
      expect(text).toContain('Conta empresarial');
      expect(text).toContain('Conta pessoal');
      expect(text).toContain('Para empresas');
      expect(text).toContain('Para pessoas físicas');
      expect(text).toContain('Escolha o tipo de conta para continuar');
      expect(root.querySelector('#register-name')).toBeNull();
      expect(root.querySelector('legend')?.textContent).toContain('Tipo de conta');
    });

    it('refuses to submit before a type is chosen, in pt-BR, and sends nothing', () => {
      const { fixture, http, root } = setup();
      fillAddress(fixture.componentInstance);

      fixture.componentInstance.submit();
      fixture.detectChanges();

      http.expectNone('/api/auth/register');
      expect(root.querySelector('[role="alert"]')?.textContent).toContain('escolha o tipo de conta');
    });

    it('a business account asks for the company name and an optional CNPJ that accepts letters, and says Matriz or Filial', () => {
      const { root, type, choose, fixture } = setup();
      choose('business');

      expect(root.querySelector('label[for="register-name"]')?.textContent).toBe('Nome da empresa');
      expect(root.querySelector('label[for="register-cnpj"]')?.textContent).toContain('opcional');
      expect(root.querySelector('#register-cpf')).toBeNull();
      type('register-cnpj', '12abc34501de35');
      expect(root.querySelector<HTMLInputElement>('#register-cnpj')!.value).toBe('12.ABC.345/01DE-35');
      expect((root.querySelector('#register-cnpj-hint')?.textContent ?? '')).toContain('Estabelecimento: Filial');
      type('register-cnpj', '11222333000181');
      expect(root.querySelector('#register-cnpj-hint')?.textContent).toContain('Matriz');
      expect(fixture.componentInstance).toBeTruthy();
    });

    it('a wrong CNPJ is named in pt-BR under the field and stops the submit; an empty one is fine', () => {
      const { fixture, http, root, type, choose } = setup();
      Object.assign(fixture.componentInstance, { email: 'a@b.com', password: 'Abc123!' });
      choose('business');
      type('register-name', 'Bar do Zé');
      fillAddress(fixture.componentInstance);

      type('register-cnpj', '11222333000182');
      expect(root.querySelector('#register-cnpj-hint')?.textContent).toContain('CNPJ inválido');
      expect(root.querySelector('#register-cnpj')!.getAttribute('aria-invalid')).toBe('true');
      fixture.componentInstance.submit();
      http.expectNone('/api/auth/register');

      type('register-cnpj', '');
      fixture.componentInstance.submit();
      http.expectOne('/api/auth/register').flush({ id: 'a1' }, { status: 201, statusText: 'Created' });
    });

    it('a personal account asks for the full name, a masked CPF and the birth date with the 18+ explanation', () => {
      const { root, type, choose } = setup();
      choose('personal');

      expect(root.querySelector('label[for="register-name"]')?.textContent).toBe('Nome completo');
      expect(root.querySelector('#register-cnpj')).toBeNull();
      type('register-cpf', '11144477735');
      expect(root.querySelector<HTMLInputElement>('#register-cpf')!.value).toBe('111.444.777-35');
      expect(root.querySelector('#register-birth-hint')?.textContent).toContain('proibida para menores de 18 anos');
      type('register-birth', '2020-01-01');
      expect(root.querySelector('#register-birth-hint')?.textContent).toContain('18 anos ou mais');
    });

    it('posts a personal account with the CPF as digits and the birth date, and blocks an invalid CPF or a minor', () => {
      const { fixture, http, type, choose } = setup();
      Object.assign(fixture.componentInstance, { email: 'a@b.com', password: 'Abc123!' });
      choose('personal');
      type('register-name', 'João Silva');
      fillAddress(fixture.componentInstance);

      type('register-cpf', '11144477736');
      type('register-birth', '1990-03-02');
      fixture.componentInstance.submit();
      http.expectNone('/api/auth/register');

      type('register-cpf', '11144477735');
      type('register-birth', '2999-01-01');
      fixture.componentInstance.submit();
      http.expectNone('/api/auth/register');

      type('register-birth', '1990-03-02');
      fixture.componentInstance.submit();
      const body = http.expectOne('/api/auth/register').request.body;
      expect(body.accountType).toBe('Personal');
      expect(body.companyName).toBe('João Silva');
      expect(body.registration).toEqual({ cpf: '11144477735', birthDate: '1990-03-02' });
    });

    it('switching the type forgets the first type\'s fields, so nothing of the other type is sent', () => {
      const { fixture, http, type, choose } = setup();
      Object.assign(fixture.componentInstance, { email: 'a@b.com', password: 'Abc123!' });
      choose('business');
      type('register-name', 'Bar do Zé');
      type('register-cnpj', '11222333000181');
      choose('personal');
      type('register-cpf', '11144477735');
      type('register-birth', '1990-03-02');
      choose('business');
      type('register-name', 'Bar do Zé');
      fillAddress(fixture.componentInstance);

      fixture.componentInstance.submit();

      expect(http.expectOne('/api/auth/register').request.body.registration).toEqual({ cnpj: null });
    });

    it('shows the one generic pt-BR answer for a duplicate (409) and keeps the form', async () => {
      const { fixture, http } = setup();
      fillBusiness(fixture.componentInstance, 'Bar do Zé', '11222333000181');
      fillAddress(fixture.componentInstance);

      fixture.componentInstance.submit();
      http.expectOne('/api/auth/register').flush(['Não foi possível concluir o cadastro com estes dados. Se você já tem conta, entre ou fale conosco.'], { status: 409, statusText: 'Conflict' });
      await fixture.whenStable();
      fixture.detectChanges();

      const element = fixture.nativeElement as HTMLElement;
      expect(element.querySelector('[role="alert"]')?.textContent).toContain('Se você já tem conta, entre ou fale conosco.');
      expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
    });

    it('puts each problem the server names by field under its control, and tells the user to check the fields', async () => {
      const { fixture, http, root } = setup();
      fillBusiness(fixture.componentInstance, 'Bar do Zé', '11222333000181');
      fillAddress(fixture.componentInstance);

      fixture.componentInstance.submit();
      http.expectOne('/api/auth/register').flush(
        [{ field: 'cnpj', message: 'CNPJ inválido: confira os 14 caracteres e os dois dígitos verificadores.' }, { field: 'companyName', message: 'Nome da empresa obrigatório.' }],
        { status: 400, statusText: 'Bad Request' },
      );
      await fixture.whenStable();
      fixture.detectChanges();

      expect(root.querySelector('#register-cnpj-hint')?.textContent).toContain('CNPJ inválido');
      expect(root.querySelector('#register-name-hint')?.textContent).toContain('Nome da empresa obrigatório');
      expect(root.querySelector('[role="alert"]')?.textContent).toContain('Confira os dados do cadastro');
      expect(root.querySelector('[role="alert"]')?.textContent).not.toContain('CNPJ inválido');

      fixture.componentInstance.submit(); // trying again forgets the server's words
      fixture.detectChanges();
      http.expectOne('/api/auth/register');
      expect(root.querySelector('#register-name-hint')?.textContent?.trim()).toBe('');
    });

    it('keeps in the alert a problem that has no control to sit under', async () => {
      const { fixture, http, root } = setup();
      fillBusiness(fixture.componentInstance);
      fillAddress(fixture.componentInstance);

      fixture.componentInstance.submit();
      http.expectOne('/api/auth/register').flush([{ field: 'registration', message: 'Os dados cadastrais não podem ter caracteres de controle.' }], { status: 400, statusText: 'Bad Request' });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(root.querySelector('[role="alert"]')?.textContent).toContain('caracteres de controle');
    });
  });
});

describe('Register icons', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [Register], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(Register);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  it('shows a leading icon on the e-mail and password and a user-plus icon on the button', () => {
    const { fixture, root } = setup();

    expect(iconNames(fixture, 'form')).toEqual(['mail', 'lock', 'map-pin', 'user-plus']);
    for (const id of ['email', 'password']) {
      expect(root.querySelector(`.field__control > input#${id}`)).not.toBeNull();
    }
    expect(root.querySelector('button[type="submit"]')?.textContent?.trim()).toBe('Cadastrar');
  });

  it('renders the form in the shared auth card: the type choice, then (for a business) the name and CNPJ, the seven parts of the address, e-mail and password (MRV-7.4, MRV-9.3, MRV-9.4)', () => {
    const { fixture } = setup();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.auth-page .container > .card.auth-card')).not.toBeNull();
    expect(element.querySelectorAll('h1').length).toBe(1);
    // Before a type is chosen: the seven address parts, e-mail, password.
    expect(element.querySelectorAll('.field label').length).toBe(9);
    element.querySelector<HTMLInputElement>('#register-type-business')!.click();
    fixture.detectChanges();
    expect(element.querySelectorAll('.field label').length).toBe(11);
    expect(element.querySelector('button[type="submit"]')!.classList).toContain('btn--primary');
  });
});
