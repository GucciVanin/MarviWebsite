import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { iconNames } from '../../../shared/ui/app-icon/testing/icon-names';
import type { AddressDraft } from '../../../shared/ui/address-fields/address-draft';
import { Register } from './register';

/** Types a complete billing address into the form's draft, as the fields would. */
function fillAddress(register: Register, over: Partial<Record<'postalCode' | 'street' | 'number' | 'district' | 'city' | 'state', string>> = {}) {
  const draft = (register as unknown as { address: AddressDraft }).address;
  const values = { postalCode: '01001-000', street: 'Praça da Sé', number: '10', district: 'Sé', city: 'São Paulo', state: 'SP', ...over };
  for (const [name, value] of Object.entries(values)) {
    draft[name as keyof typeof values].set(value);
  }
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
    return { fixture, http: TestBed.inject(HttpTestingController) };
  }

  it('shows the shared server message, not a data complaint, when registration hits a server failure', async () => {
    const { fixture, http } = setup();

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

  it('posts the structured billing address, the CEP as 8 digits, with no label or type (the server makes it the first address)', () => {
    const { fixture, http } = setup();
    Object.assign(fixture.componentInstance, { email: 'ana@example.com', password: 'Abc123!', companyName: 'Bar do Zé' });

    fillAddress(fixture.componentInstance, { postalCode: '01001-000' });
    fixture.componentInstance.submit();

    const request = http.expectOne('/api/auth/register');
    expect(request.request.body).toEqual({
      email: 'ana@example.com', password: 'Abc123!', companyName: 'Bar do Zé',
      billingAddress: {
        label: null, kind: null, postalCode: '01001000', street: 'Praça da Sé', number: '10', complement: null, district: 'Sé', city: 'São Paulo', state: 'SP',
        deliveryNotes: null, isBilling: false, isDefaultDelivery: false,
      },
    });
    request.flush({ id: 'a1' }, { status: 201, statusText: 'Created' });
  });

  it('says in pt-BR what is missing, and sends nothing, while the billing address is incomplete', async () => {
    const { fixture, http } = setup();

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
});

describe('Register icons', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [Register], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(Register);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  it('shows a leading icon on every field and a user-plus icon on the button', () => {
    const { fixture, root } = setup();

    expect(iconNames(fixture, 'form')).toEqual(['building', 'map-pin', 'mail', 'lock', 'user-plus']);
    for (const id of ['companyName', 'email', 'password']) {
      expect(root.querySelector(`.field__control > input#${id}`)).not.toBeNull();
    }
    expect(root.querySelector('button[type="submit"]')?.textContent?.trim()).toBe('Cadastrar');
  });

  it('renders the form in the shared auth card with ten labelled fields: company, the seven parts of the address, e-mail, password (MRV-7.4, MRV-9.3)', () => {
    const { fixture } = setup();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.auth-page .container > .card.auth-card')).not.toBeNull();
    expect(element.querySelectorAll('h1').length).toBe(1);
    expect(element.querySelectorAll('.field label').length).toBe(10);
    expect(element.querySelector('button[type="submit"]')!.classList).toContain('btn--primary');
  });
});
