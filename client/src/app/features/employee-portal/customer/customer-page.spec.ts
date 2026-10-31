import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { EMPLOYEE_PORTAL_ROUTES } from '../employee-portal.routes';
import { staffPageGuard } from '../../../core/auth/role.guard';
import { twoAddresses } from '../../../shared/models/testing/client-address';
import { personalRegistration, registration } from '../../../shared/models/testing/registration';
import { CustomerPage } from './customer-page';

const profile = (patch: object = {}) => ({
  registration: registration(),
  id: 'c-123',
  customerNumber: 42,
  companyName: 'Bar do Zé',
  createdAt: '2026-10-14T13:42:00Z',
  ...twoAddresses(),
  pricingTierName: 'Atacado',
  contactEmail: 'ze@bar.example.com',
  status: 'Approved',
  quotes: [
    { id: 'q1', number: 7, status: 'Submitted', createdAt: '2026-10-15T10:00:00Z', lineItems: [] },
    { id: 'q2', number: 8, status: 'Accepted', createdAt: '2026-10-16T10:00:00Z', lineItems: [] },
  ],
  orders: [{ id: 'o1', number: 3, status: 'Placed', placedAt: '2026-10-17T10:00:00Z', totalAmount: 125.5, lineItems: [] }],
  ...patch,
});

describe('CustomerPage', () => {
  function setup(number: string | null = 'C-000042') {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(number === null ? {} : { number }) } } },
      ],
    });
    const fixture = TestBed.createComponent(CustomerPage);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const root = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
    };
    // Each fact as "label value", so a spec reads what a person reads.
    const facts = () => Array.from(root.querySelectorAll('dt')).map((dt) => `${dt.textContent?.trim()} ${dt.nextElementSibling?.textContent?.trim()}`);
    const text = () => `${(root.textContent ?? '').replace(/\s+/g, ' ')} | ${facts().join(' | ')}`;
    return { fixture, http, root, settle, text };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('loads the customer by the number in the address and shows the full read-only detail', async () => {
    const { http, root, settle, text } = setup();

    http.expectOne('/api/employee/clients/by-number/42').flush(profile());
    await settle();

    expect(root.querySelector('h1')?.textContent).toContain('Bar do Zé');
    expect(text()).toContain('C-000042');
    expect(text()).toContain('Aprovado');
    expect(text()).toContain('Cliente desde 14/10/2026');
    expect(text()).toContain('Faixa de preço Atacado');
    // The billing address in full, then the other addresses as boxes (MRV-9.3): label, kind, lines and notes. No key anywhere.
    const billing = root.querySelector('[data-testid="billing-address"]')?.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(billing).toContain('Matriz');
    expect(billing).toContain('Principal');
    expect(billing).toContain('Entrega padrão');
    expect(billing).toContain('Praça da Sé, 10');
    expect(billing).toContain('Sé, São Paulo/SP, CEP 01001-000');
    const others = root.querySelectorAll('[data-testid="other-addresses"] li');
    expect(others.length).toBe(1);
    expect(others[0].textContent).toContain('Filial Campinas');
    expect(others[0].textContent).toContain('Rua Barão de Jaguara, 200 - Sala 3');
    expect(others[0].textContent).toContain('Centro, Campinas/SP, CEP 13010-000');
    expect(others[0].textContent).toContain('Entregar de manhã');
    expect(root.innerHTML).not.toContain('6f1c2a3e');
    expect(text()).toContain('E-mail de contato ze@bar.example.com');
    expect(text()).toContain('Cotações em aberto 1');
    expect(text()).toContain('Pedidos em aberto 1');
    // The account type and the registration data (MRV-9.4).
    expect(text()).toContain('Tipo de conta Empresa');
    expect(text()).toContain('CNPJ 11.222.333/0001-81 (Matriz)');
    expect(text()).toContain('Razão social Acme Comércio Ltda');
    expect(text()).toContain('Inscrição estadual Contribuinte do ICMS · 110042490114');
    expect(text()).toContain('CNAE principal 4634-6/01');
    expect(text()).toContain('Data de abertura 04/05/2010');
  });

  it('shows a personal account with the "Pessoa física" badge, the CPF masked, the birth date and what is missing (MRV-9.4)', async () => {
    const { http, root, settle, text } = setup();

    http.expectOne('/api/employee/clients/by-number/42').flush(
      profile({ companyName: 'João Silva', registration: personalRegistration({ missing: ['phone'] }) }),
    );
    await settle();

    expect(root.querySelector('[data-testid="customer-registration"] [data-testid="account-type"]')?.textContent).toBe('Pessoa física');
    expect(text()).toContain('CPF ***.444.777-**');
    expect(text()).toContain('Data de nascimento 02/03/1990');
    expect(text()).toContain('Falta: Telefone');
    expect(text()).not.toContain('111.444.777-35');
    expect(text()).not.toContain('Razão social');
  });

  it('lists the customer\'s quotes and orders by their numbers', async () => {
    const { http, root, settle } = setup();

    http.expectOne('/api/employee/clients/by-number/42').flush(profile());
    await settle();

    const quotes = root.querySelector('[data-testid="customer-quotes"]')!.textContent!;
    expect(quotes).toContain('Q-000007');
    expect(quotes).toContain('Aguardando preço');
    expect(quotes).toContain('Q-000008');
    const orders = root.querySelector('[data-testid="customer-orders"]')!.textContent!;
    expect(orders).toContain('P-000003');
    expect(orders).toContain('Realizado');
    expect(orders).toMatch(/125,50/);
  });

  it('has a back link to the employee portal', async () => {
    const { http, root, settle } = setup();

    http.expectOne('/api/employee/clients/by-number/42').flush(profile());
    await settle();

    const back = root.querySelector<HTMLAnchorElement>('a[href="/employee"]')!;
    expect(back.textContent).toContain('Voltar à área do funcionário');
  });

  it('offers to start an order for an approved customer, by number, and explains why not for one who is not approved', async () => {
    const approved = setup();
    approved.http.expectOne('/api/employee/clients/by-number/42').flush(profile());
    await approved.settle();
    const start = Array.from(approved.root.querySelectorAll<HTMLAnchorElement>('a')).find((a) => a.textContent?.includes('Iniciar pedido'))!;
    expect(start.getAttribute('href')).toBe('/employee?cliente=C-000042');
    TestBed.resetTestingModule();

    const pending = setup();
    pending.http.expectOne('/api/employee/clients/by-number/42').flush(profile({ status: 'Pending' }));
    await pending.settle();
    expect(pending.text()).toContain('não está aprovado');
    expect(Array.from(pending.root.querySelectorAll('a')).some((a) => a.textContent?.includes('Iniciar pedido'))).toBe(false);
  });

  it('says "Cliente não encontrado" for an unknown number, with no raw error and no id', async () => {
    const { http, root, settle, text } = setup('C-009999');

    http.expectOne('/api/employee/clients/by-number/9999').flush('Not Found', { status: 404, statusText: 'Not Found' });
    await settle();

    expect(root.querySelector('[data-testid="customer-not-found"] h1')?.textContent).toContain('Cliente não encontrado');
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(text()).not.toContain('Not Found');
    expect(text()).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
    expect(root.querySelector('a[href="/employee"]')).not.toBeNull();
  });

  it.each(['abc', 'C-', '0', 'C-000000', '12; drop', '../42'])('says "Cliente não encontrado" for the address %s without asking the API', async (bad) => {
    const { http, root, settle } = setup(bad);
    await settle();

    http.expectNone((r) => r.url.includes('/clients/'));
    expect(root.querySelector('[data-testid="customer-not-found"]')).not.toBeNull();
  });

  it('accepts plain digits as well as C-000042', async () => {
    const { http, settle } = setup('42');

    http.expectOne('/api/employee/clients/by-number/42').flush(profile());
    await settle();
  });

  it('keeps a server failure as an error with a retry (it is not "not found")', async () => {
    const { http, root, settle } = setup();
    http.expectOne('/api/employee/clients/by-number/42').flush('boom', { status: 500, statusText: 'Server Error' });
    await settle();

    expect(root.querySelector('[data-testid="customer-not-found"]')).toBeNull();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Erro no servidor');
    Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.includes('Tentar novamente'))!.click();
    http.expectOne('/api/employee/clients/by-number/42').flush(profile());
    await settle();

    expect(root.querySelector('h1')?.textContent).toContain('Bar do Zé');
  });

  it('shows "—" for a customer with no tier and no billing address', async () => {
    const { http, settle, text } = setup();

    http.expectOne('/api/employee/clients/by-number/42').flush(profile({ pricingTierName: null, addresses: [], billingAddressKey: null, defaultDeliveryKey: null, contactEmail: null }));
    await settle();

    expect(text()).toContain('Faixa de preço —');
    expect(text()).toContain('E-mail de contato —');
    expect(text()).toContain('Nenhum endereço de cobrança cadastrado');
    expect(text()).toContain('Nenhum outro endereço cadastrado');
  });
});

describe('the customer page route', () => {
  const route = EMPLOYEE_PORTAL_ROUTES.find((r) => r.path === 'clientes/:number')!;

  it('is under the employee area, titled, and guarded by the staff page guard', () => {
    expect(route).toBeDefined();
    expect(route.title).toBe('Cliente');
    expect(route.canActivate).toEqual([staffPageGuard]);
  });
});
