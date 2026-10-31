import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AdminInbox } from './admin-inbox';

const group = (items: object[], count = items.length) => ({ count, items });
const inbox = (over: Partial<Record<'customers' | 'quotes' | 'lowStock' | 'unpricedProducts' | 'unstockedProducts' | 'contactMessages', object>> = {}) => {
  const body = {
    customers: group([]), quotes: group([]), lowStock: group([]), unpricedProducts: group([]), unstockedProducts: group([]), contactMessages: group([]), ...over,
  } as Record<string, { count: number }>;
  return { total: Object.values(body).reduce((sum, g) => sum + g.count, 0), ...body };
};
const waiting = (id: string, companyName: string) => ({ id, companyName, createdAt: '2026-10-14T13:42:00Z' });
const contactMessage = (id: string, over: object = {}) => ({
  id, name: 'Ana Souza', email: 'ana@bar.com.br', phone: '(11) 99999-0000', company: 'Bar da Ana', message: 'Quero pedir\nem volume.',
  createdAt: '2026-10-20T09:30:00Z', ...over,
});
const tiers = [{ id: 't-std', name: 'Standard', isDefault: true }, { id: 't-gold', name: 'Ouro', isDefault: false }];

describe('AdminInbox', () => {
  function setup(first = inbox({ customers: group([waiting('c1', 'Loja Nova'), waiting('c2', 'Bar Novo')]) })) {
    TestBed.configureTestingModule({ imports: [AdminInbox], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(AdminInbox);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/admin/pending-actions').flush(first);
    http.expectOne('/api/admin/pricing-tiers').flush(tiers);
    const root = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
    };
    const button = (label: string, within: ParentNode = root) =>
      Array.from(within.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === label)!;
    const row = (company: string) => Array.from(root.querySelectorAll<HTMLElement>('[data-testid="pending-customer"]')).find((r) => r.textContent?.includes(company))!;
    const card = (name: string) => Array.from(root.querySelectorAll<HTMLElement>('[data-testid="pending-contact"]')).find((r) => r.textContent?.includes(name))!;
    const reload = (next: ReturnType<typeof inbox>) => http.expectOne('/api/admin/pending-actions').flush(next);
    return { fixture, http, root, settle, button, row, card, reload };
  }
  const text = (root: HTMLElement) => (root.textContent ?? '').replace(/\s+/g, ' ');

  it('lists the customers waiting for a decision, with when they registered', async () => {
    const { root, settle, row } = setup();
    await settle();

    expect(text(root)).toContain('2 itens aguardando');
    expect(root.querySelectorAll('[data-testid="pending-customer"]').length).toBe(2);
    expect(row('Loja Nova').textContent).toContain('14/10/2026');
    expect(text(root)).toContain('Clientes aguardando aprovação');
  });

  it('lists quotes awaiting a price, stock to reorder and products with no price, each with the screen that resolves it', async () => {
    const { root, settle } = setup(inbox({
      quotes: group([{ id: 'q1', number: 123, clientAccountId: 'c1', customerNumber: 42, companyName: 'Bar do Zé', createdAt: '2026-10-15T10:00:00Z', lineCount: 3 }]),
      lowStock: group([{ productId: 'p1', sku: 'COLA-2L', productName: 'Refrigerante Cola 2L', warehouseId: 'w1', warehouseName: 'CD São Paulo', available: 4, reorderPoint: 20 }]),
      unpricedProducts: group([{ productId: 'p2', sku: 'TONICA', name: 'Água Tônica' }]),
    }));
    await settle();

    const quote = root.querySelector('[data-testid="pending-quote"]')!;
    expect(quote.textContent).toContain('Bar do Zé (C-000042)');
    expect(quote.textContent).toContain('Q-000123');
    expect(quote.textContent).toContain('3 itens');
    expect(quote.querySelector('a')!.getAttribute('href')).toBe('/employee');
    const stock = root.querySelector('[data-testid="pending-stock"]')!;
    expect(stock.textContent).toContain('Refrigerante Cola 2L');
    expect(stock.textContent).toContain('CD São Paulo');
    expect(stock.textContent).toContain('4');
    expect(stock.querySelector('a')!.getAttribute('href')).toBe('/admin/operacao');
    const unpriced = root.querySelector('[data-testid="pending-unpriced"]')!;
    expect(unpriced.textContent).toContain('Água Tônica');
    expect(unpriced.querySelector('a')!.getAttribute('href')).toBe('/admin/precos');
  });

  it('lists active products that no warehouse has ever held, with the screen to stock them', async () => {
    const { root, settle } = setup(inbox({ unstockedProducts: group([{ productId: 'p9', sku: 'NOVO-1', name: 'Produto Novo' }]) }));
    await settle();

    const item = root.querySelector('[data-testid="pending-unstocked"]')!;
    expect(item.textContent).toContain('Produto Novo');
    expect(item.querySelector('a')!.getAttribute('href')).toBe('/admin/operacao');
    expect(text(root)).toContain('Produtos ativos sem estoque cadastrado');
  });

  it('takes a decided customer off the list at once, before the refreshed list arrives, so it cannot be decided twice', async () => {
    const { fixture, http, root, settle, button, row, reload } = setup();
    await settle();
    button('Suspender', row('Bar Novo')).click();
    await settle();
    button('Confirmar suspensão').click();
    fixture.detectChanges();
    http.expectOne('/api/admin/clients/c2/suspend').flush(null, { status: 204, statusText: 'No Content' });
    await settle(); // the refreshed list has not arrived yet

    expect(root.querySelectorAll('[data-testid="pending-customer"]').length).toBe(1);
    expect(text(root)).not.toContain('Bar Novo');
    reload(inbox({ customers: group([waiting('c1', 'Loja Nova')]) }));
  });

  it('says so when the tier list cannot be loaded, instead of offering a form that can never be confirmed', async () => {
    TestBed.configureTestingModule({ imports: [AdminInbox], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(AdminInbox);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/admin/pending-actions').flush(inbox({ customers: group([waiting('c1', 'Loja Nova')]) }));
    http.expectOne('/api/admin/pricing-tiers').flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === 'Aprovar')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root.querySelector('[data-testid="pending-approval"] [role="alert"]')?.textContent).toContain('Erro no servidor');
  });

  it('closes an open form when a 409 shows the list was stale', async () => {
    const { fixture, http, root, settle, button, row, reload } = setup();
    await settle();
    button('Aprovar', row('Loja Nova')).click();
    await settle();
    const select = root.querySelector<HTMLSelectElement>('select[name="approve-tier"]')!;
    select.value = 't-std';
    select.dispatchEvent(new Event('change'));
    await settle();

    button('Confirmar aprovação').click();
    fixture.detectChanges();
    http.expectOne('/api/admin/clients/c1/approve').flush('This customer is already approved.', { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    reload(inbox({ customers: group([waiting('c2', 'Bar Novo')]) }));
    await settle();

    expect(root.querySelector('select[name="approve-tier"]')).toBeNull();
  });

  it('says so, group by group, when nothing is waiting, and celebrates an empty inbox', async () => {
    const { root, settle } = setup(inbox());
    await settle();

    expect(text(root)).toContain('Nada pendente');
    expect(text(root)).toContain('Nenhum cliente aguardando aprovação');
    expect(root.querySelector('[data-testid="pending-customer"]')).toBeNull();
  });

  it('approves a waiting customer only with a tier the admin chose, and the customer leaves the list', async () => {
    const { fixture, http, root, settle, button, row, reload } = setup();
    await settle();

    button('Aprovar', row('Loja Nova')).click();
    await settle();
    const select = root.querySelector<HTMLSelectElement>('select[name="approve-tier"]')!;
    expect(select.value).toBe('');
    expect(button('Confirmar aprovação').disabled).toBe(true);
    select.value = 't-gold';
    select.dispatchEvent(new Event('change'));
    await settle();
    button('Confirmar aprovação').click();
    fixture.detectChanges();

    const request = http.expectOne('/api/admin/clients/c1/approve');
    expect(request.request.body).toEqual({ pricingTierId: 't-gold' });
    request.flush(null, { status: 204, statusText: 'No Content' });
    reload(inbox({ customers: group([waiting('c2', 'Bar Novo')]) }));
    await settle();

    expect(text(root)).toContain('Cliente aprovado');
    expect(root.querySelectorAll('[data-testid="pending-customer"]').length).toBe(1);
    expect(text(root)).toContain('1 item aguardando');
  });

  it('suspends a waiting customer only after a confirming click', async () => {
    const { fixture, http, root, settle, button, row, reload } = setup();
    await settle();

    button('Suspender', row('Bar Novo')).click();
    await settle();
    http.expectNone('/api/admin/clients/c2/suspend');
    expect(text(root)).toContain('Confirmar suspensão');

    button('Confirmar suspensão').click();
    fixture.detectChanges();
    http.expectOne('/api/admin/clients/c2/suspend').flush(null, { status: 204, statusText: 'No Content' });
    reload(inbox({ customers: group([waiting('c1', 'Loja Nova')]) }));
    await settle();

    expect(text(root)).toContain('Cliente suspenso');
    expect(root.querySelectorAll('[data-testid="pending-customer"]').length).toBe(1);
  });

  it('when another admin decided first (a 409), says so and refreshes the list by itself', async () => {
    const { fixture, http, root, settle, button, row, reload } = setup();
    await settle();
    button('Suspender', row('Bar Novo')).click();
    await settle();

    button('Confirmar suspensão').click();
    fixture.detectChanges();
    http.expectOne('/api/admin/clients/c2/suspend').flush('This customer is already suspended.', { status: 409, statusText: 'Conflict' });
    fixture.detectChanges(); // the effect that refreshes a stale list runs with change detection
    reload(inbox({ customers: group([waiting('c1', 'Loja Nova')]) }));
    await settle();

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('conflito');
    expect(root.querySelector('[role="alert"] small')?.textContent).toContain('already suspended');
    expect(root.querySelectorAll('[data-testid="pending-customer"]').length).toBe(1);
  });

  it('says how many there are when more are waiting than are shown', async () => {
    const { root, settle } = setup(inbox({ customers: group([waiting('c1', 'Loja Nova')], 80) }));
    await settle();

    expect(text(root)).toContain('Mostrando 1 de 80');
  });

  it('can be refreshed by hand', async () => {
    const { fixture, root, settle, button, reload } = setup();
    await settle();

    button('Atualizar').click();
    fixture.detectChanges();
    reload(inbox({ customers: group([waiting('c3', 'Mercearia Chegou Agora')]) }));
    await settle();

    expect(text(root)).toContain('Mercearia Chegou Agora');
  });

  it('shows a failure to load as an error with a retry, not as an empty inbox', async () => {
    TestBed.configureTestingModule({ imports: [AdminInbox], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(AdminInbox);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/admin/pending-actions').flush('boom', { status: 500, statusText: 'Server Error' });
    http.expectOne('/api/admin/pricing-tiers').flush(tiers);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Erro no servidor');
    expect(text(root)).not.toContain('Nada pendente');
  });

  describe('contact messages', () => {
    it('lists each message with name, e-mail, phone, company, date and text', async () => {
      const { root, settle, card } = setup(inbox({ contactMessages: group([contactMessage('m1')]) }));
      await settle();

      const item = card('Ana Souza');
      expect(text(root)).toContain('Mensagens de contato');
      expect(item.textContent).toContain('ana@bar.com.br');
      expect(item.textContent).toContain('(11) 99999-0000');
      expect(item.textContent).toContain('Bar da Ana');
      expect(item.textContent).toContain('20/10/2026');
      expect(item.querySelector('[data-testid="contact-message"]')!.textContent).toBe('Quero pedir\nem volume.');
      expect(item.querySelector('[data-testid="contact-message"]')!.classList).toContain('pre-wrap');
      expect(item.querySelector('a')!.getAttribute('href')).toBe('mailto:ana@bar.com.br');
      expect(item.querySelector('a[href^="tel:"]')).toBeNull();
      expect(text(root)).toContain('1 item aguardando');
    });

    it('shows a hostile message as text: no element is created from it', async () => {
      const evil = '<script>alert(1)</script><b>x</b>';
      const { root, settle, card } = setup(inbox({ contactMessages: group([contactMessage('m1', { message: evil, name: '<i>Eve</i>' })]) }));
      await settle();

      const item = card('Eve');
      expect(item.querySelector('[data-testid="contact-message"]')!.textContent).toBe(evil);
      expect(item.querySelector('[data-testid="contact-message"]')!.children.length).toBe(0);
      expect(item.querySelector('[data-testid="contact-name"]')!.children.length).toBe(0);
      expect(root.querySelector('script')).toBeNull();
    });

    it('links the e-mail only when it looks like an address, and always shows it as text', async () => {
      const { settle, card } = setup(inbox({ contactMessages: group([
        contactMessage('m1', { name: 'Bom', email: 'bom@x.com' }),
        contactMessage('m2', { name: 'Mau', email: 'javascript:alert(1)' }),
        contactMessage('m3', { name: 'Outro', email: 'a b@x.com' }),
      ]) }));
      await settle();

      expect(card('Bom').querySelector('a')!.getAttribute('href')).toBe('mailto:bom@x.com');
      expect(card('Mau').querySelector('a')).toBeNull();
      expect(card('Mau').textContent).toContain('javascript:alert(1)');
      expect(card('Outro').querySelector('a')).toBeNull();
    });

    it('never links an address that could pre-fill the mail client (extra parameters, headers, paths)', async () => {
      const tricky = ['a@b.com?bcc=x@y.z', 'a@b.com%0d%0abcc:x', 'a@b.com&body=hi', 'a/b@c.com', 'a@b.com#x', 'a`b@c.com'];
      const { root, settle } = setup(inbox({ contactMessages: group(tricky.map((email, i) => contactMessage('t' + i, { name: 'N' + i, email }))) }));
      await settle();

      expect(root.querySelectorAll('[data-testid="pending-contact"] a').length).toBe(0);
      expect(root.querySelectorAll('[data-testid="pending-contact"]').length).toBe(tricky.length);
      expect(text(root)).toContain('a@b.com?bcc=x@y.z');
    });

    it('still links an ordinary address with dots and a plus in the local part', async () => {
      const { settle, card } = setup(inbox({ contactMessages: group([contactMessage('m1', { name: 'Plus', email: 'jo.ao+vendas@mail.exemplo.com.br' })]) }));
      await settle();

      expect(card('Plus').querySelector('a')!.getAttribute('href')).toBe('mailto:jo.ao+vendas@mail.exemplo.com.br');
    });

    it('gives each handle button the sender in its accessible name', async () => {
      const { root, settle } = setup(inbox({ contactMessages: group([contactMessage('m1'), contactMessage('m2', { name: 'Beto' })]) }));
      await settle();

      const labels = Array.from(root.querySelectorAll('[data-testid="pending-contact"] button')).map((b) => b.getAttribute('aria-label'));
      expect(labels).toEqual(['Marcar como atendida: Ana Souza', 'Marcar como atendida: Beto']);
    });

    it('treats a response without the contact group as an empty group', async () => {
      const body = inbox() as Record<string, unknown>;
      delete body['contactMessages'];
      const { root, settle } = setup(body as ReturnType<typeof inbox>);
      await settle();

      expect(text(root)).toContain('Nenhuma mensagem de contato.');
    });

    it('omits a missing phone and company', async () => {
      const { settle, card } = setup(inbox({ contactMessages: group([contactMessage('m1', { phone: null, company: null })]) }));
      await settle();

      expect(card('Ana Souza').textContent).not.toContain('Telefone');
      expect(card('Ana Souza').textContent).not.toContain('Empresa');
    });

    it('takes a handled message off the list at once, calls the endpoint and refreshes the count', async () => {
      const { fixture, http, root, settle, button, card, reload } = setup(inbox({ contactMessages: group([contactMessage('m1'), contactMessage('m2', { name: 'Beto' })]) }));
      await settle();

      button('Marcar como atendida', card('Ana Souza')).click();
      fixture.detectChanges();
      const request = http.expectOne('/api/admin/contact-messages/m1/handle');
      expect(request.request.method).toBe('POST');
      request.flush(null, { status: 204, statusText: 'No Content' });
      await settle(); // the refreshed list has not arrived yet

      expect(root.querySelectorAll('[data-testid="pending-contact"]').length).toBe(1);
      expect(text(root)).not.toContain('Ana Souza');
      expect(text(root)).toContain('Mensagem marcada como atendida');
      reload(inbox({ contactMessages: group([contactMessage('m2', { name: 'Beto' })]) }));
      await settle();
      expect(text(root)).toContain('1 item aguardando');
    });

    it('when another admin handled it first (409), says so and refreshes the list', async () => {
      const { fixture, http, root, settle, button, card, reload } = setup(inbox({ contactMessages: group([contactMessage('m1')]) }));
      await settle();

      button('Marcar como atendida', card('Ana Souza')).click();
      fixture.detectChanges();
      http.expectOne('/api/admin/contact-messages/m1/handle').flush('This message is already handled.', { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();
      reload(inbox());
      await settle();

      expect(root.querySelector('[role="alert"]')?.textContent).toContain('conflito');
      expect(root.querySelector('[data-testid="pending-contact"]')).toBeNull();
    });

    it('when the message no longer exists (404), says so and refreshes the list', async () => {
      const { fixture, http, root, settle, button, card, reload } = setup(inbox({ contactMessages: group([contactMessage('m1')]) }));
      await settle();

      button('Marcar como atendida', card('Ana Souza')).click();
      fixture.detectChanges();
      http.expectOne('/api/admin/contact-messages/m1/handle').flush('Not found', { status: 404, statusText: 'Not Found' });
      fixture.detectChanges();
      reload(inbox());
      await settle();

      expect(root.querySelector('[role="alert"]')?.textContent).toContain('não existe mais');
      expect(root.querySelector('[data-testid="pending-contact"]')).toBeNull();
    });

    it('uses the standard error alert for any other failure', async () => {
      const { fixture, http, root, settle, button, card } = setup(inbox({ contactMessages: group([contactMessage('m1')]) }));
      await settle();

      button('Marcar como atendida', card('Ana Souza')).click();
      fixture.detectChanges();
      http.expectOne('/api/admin/contact-messages/m1/handle').flush('boom', { status: 500, statusText: 'Server Error' });
      await settle();

      expect(root.querySelector('[role="alert"]')?.textContent).toContain('Erro no servidor');
      expect(root.querySelectorAll('[data-testid="pending-contact"]').length).toBe(1);
    });

    it('says so when the group is empty, and keeps the inbox not-empty when it is the only group with items', async () => {
      const empty = setup(inbox());
      await empty.settle();
      expect(text(empty.root)).toContain('Nenhuma mensagem de contato.');
      expect(text(empty.root)).toContain('Nada pendente. Tudo em dia.');
      TestBed.resetTestingModule();

      const only = setup(inbox({ contactMessages: group([contactMessage('m1')]) }));
      await only.settle();
      expect(text(only.root)).not.toContain('Nada pendente');
      expect(text(only.root)).toContain('1 item aguardando');
    });

    it('says how many there are when more are waiting than are shown', async () => {
      const { root, settle } = setup(inbox({ contactMessages: group([contactMessage('m1')], 60) }));
      await settle();

      expect(text(root)).toContain('Mostrando 1 de 60');
    });
  });
});
