import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminPricing } from './admin-pricing';

const tier = (id: string, name: string, isDefault = false) => ({ id, name, isDefault });
const product = (id: string, sku: string, name: string) => ({
  id, sku, name, description: null, categoryId: null, imageUrl: null, isActive: true, attributes: {},
});
const price = (pricingTierId: string, pricingTierName: string, unitPrice: number, minQty: number) => ({ pricingTierId, pricingTierName, unitPrice, minQty });

describe('AdminPricing', () => {
  function setup(data: { tiers?: object[]; products?: object[] } = {}) {
    TestBed.configureTestingModule({ imports: [AdminPricing], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(AdminPricing);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/admin/pricing-tiers').flush(data.tiers ?? []);
    http.expectOne('/api/admin/products').flush(data.products ?? []);
    const root = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
    };
    const button = (label: string, within: ParentNode = root) =>
      Array.from(within.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === label)!;
    const field = <T extends HTMLElement>(name: string) => root.querySelector<T>(`[name="${name}"]`)!;
    const type = async (name: string, value: string) => {
      const input = field<HTMLInputElement>(name);
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await settle();
    };
    const choose = async (name: string, value: string) => {
      const select = field<HTMLSelectElement>(name);
      select.value = value;
      select.dispatchEvent(new Event('change'));
      await settle();
    };
    const tick = async (name: string, checked: boolean) => {
      const box = field<HTMLInputElement>(name);
      box.checked = checked;
      box.dispatchEvent(new Event('change'));
      await settle();
    };
    /** Picks a product and answers the price request the choice triggers. */
    const pickProduct = async (productId: string, prices: object[]) => {
      await choose('priceProduct', productId);
      http.expectOne(`/api/admin/products/${productId}/pricing`).flush(prices);
      await settle();
    };
    return { fixture, http, root, settle, button, type, choose, tick, field, pickProduct };
  }
  const text = (root: HTMLElement) => (root.textContent ?? '').replace(/\s+/g, ' ');

  // ---- tiers

  it('lists the tiers and marks the default one', async () => {
    const { root, settle } = setup({ tiers: [tier('t1', 'Padrão', true), tier('t2', 'Atacado')] });
    await settle();

    const rows = root.querySelectorAll('[data-testid="tiers"] tbody tr');
    expect(rows[0].textContent).toContain('Padrão');
    expect(rows[0].textContent).toContain('Faixa padrão');
    expect(rows[1].textContent).toContain('Atacado');
    expect(rows[1].textContent).not.toContain('Faixa padrão');
  });

  it('says so when there are no tiers, and shows a failed load with a retry', async () => {
    const { root, settle } = setup();
    await settle();
    expect(text(root)).toContain('Nenhuma faixa de preço cadastrada');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [AdminPricing], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const failing = TestBed.createComponent(AdminPricing);
    failing.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/admin/pricing-tiers').flush('x', { status: 500, statusText: 'Server Error' });
    http.expectOne('/api/admin/products').flush([]);
    await failing.whenStable();
    failing.detectChanges();
    const failedRoot = failing.nativeElement as HTMLElement;
    expect(failedRoot.querySelector('[role="alert"]')?.textContent).toContain('Erro no servidor');
    failedRoot.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    http.expectOne('/api/admin/pricing-tiers').flush([tier('t1', 'Padrão', true)]);
    await failing.whenStable();
    failing.detectChanges();
    expect(failedRoot.querySelector('[role="alert"]')).toBeNull();
  });

  it('creates a tier and clears the form', async () => {
    const { fixture, http, root, settle, button, type } = setup();
    await settle();
    await type('tierName', '  Atacado ');

    button('Salvar faixa').click();
    fixture.detectChanges();
    const post = http.expectOne('/api/admin/pricing-tiers');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ name: 'Atacado', isDefault: false });
    post.flush(tier('t2', 'Atacado'));
    http.expectOne('/api/admin/pricing-tiers').flush([tier('t2', 'Atacado')]);
    await settle();

    expect(text(root)).toContain('Faixa salva');
    expect(root.querySelector<HTMLInputElement>('[name="tierName"]')!.value).toBe('');
  });

  it('does not save a tier without a name', async () => {
    const { fixture, http, root, settle, button } = setup();
    await settle();

    button('Salvar faixa').click();
    fixture.detectChanges();
    await settle();

    http.expectNone('/api/admin/pricing-tiers');
    expect(root.querySelector('[data-testid="tier-form"] [role="alert"]')?.textContent).toContain('Informe o nome da faixa');
  });

  it('makes another tier the default with one click', async () => {
    const { fixture, http, root, settle, button } = setup({ tiers: [tier('t1', 'Padrão', true), tier('t2', 'Atacado')] });
    await settle();

    button('Tornar padrão', root.querySelectorAll('[data-testid="tiers"] tbody tr')[1]).click();
    fixture.detectChanges();
    const put = http.expectOne('/api/admin/pricing-tiers/t2');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ name: 'Atacado', isDefault: true });
    put.flush(tier('t2', 'Atacado', true));
    http.expectOne('/api/admin/pricing-tiers').flush([tier('t1', 'Padrão'), tier('t2', 'Atacado', true)]);
    await settle();

    const rows = root.querySelectorAll('[data-testid="tiers"] tbody tr');
    expect(rows[1].textContent).toContain('Faixa padrão');
    expect(rows[0].textContent).not.toContain('Faixa padrão');
  });

  it('offers no "make default" on the tier that already is the default, and cannot untick it while editing', async () => {
    const { root, settle, button, field } = setup({ tiers: [tier('t1', 'Padrão', true)] });
    await settle();
    const row = root.querySelector('[data-testid="tiers"] tbody tr')!;
    expect(Array.from(row.querySelectorAll('button')).map((b) => b.textContent?.trim())).toEqual(['Editar']);

    button('Editar', row).click();
    await settle();

    expect(field<HTMLInputElement>('tierDefault').checked).toBe(true);
    expect(field<HTMLInputElement>('tierDefault').disabled).toBe(true);
  });

  it('renames a tier', async () => {
    const { fixture, http, settle, button, type, root } = setup({ tiers: [tier('t2', 'Atacado')] });
    await settle();
    button('Editar', root.querySelector('[data-testid="tiers"] tbody tr')!).click();
    await settle();
    await type('tierName', 'Atacado VIP');

    button('Salvar faixa').click();
    fixture.detectChanges();
    const put = http.expectOne('/api/admin/pricing-tiers/t2');
    expect(put.request.body).toEqual({ name: 'Atacado VIP', isDefault: false });
    put.flush(tier('t2', 'Atacado VIP'));
    http.expectOne('/api/admin/pricing-tiers').flush([tier('t2', 'Atacado VIP')]);
    await settle();
    expect(text(root)).toContain('Faixa salva');
  });

  it('shows the API\'s refusal of a tier change in pt-BR with its reason', async () => {
    const { fixture, http, root, settle, button } = setup({ tiers: [tier('t1', 'Padrão', true), tier('t2', 'Atacado')] });
    await settle();

    button('Tornar padrão', root.querySelectorAll('[data-testid="tiers"] tbody tr')[1]).click();
    fixture.detectChanges();
    http.expectOne('/api/admin/pricing-tiers/t2').flush('A default tier is required. Make another tier the default instead.', { status: 400, statusText: 'Bad Request' });
    await settle();

    const alert = root.querySelector('[data-testid="tiers-section"] [role="alert"]')!;
    expect(alert.textContent).toContain('dados enviados são inválidos');
    expect(alert.querySelector('small')?.textContent).toContain('A default tier is required');
  });

  // ---- prices per product

  it('asks to choose a product before showing any prices', async () => {
    const { root, settle } = setup({ products: [product('p1', 'COLA-1', 'Cola 2L')] });
    await settle();

    expect(text(root)).toContain('Escolha um produto');
    expect(root.querySelector('[data-testid="prices"]')).toBeNull();
  });

  it('shows the tier prices and quantity breaks of the chosen product', async () => {
    const { root, settle, pickProduct } = setup({ products: [product('p1', 'COLA-1', 'Cola 2L')], tiers: [tier('t1', 'Padrão', true)] });
    await settle();

    await pickProduct('p1', [price('t1', 'Padrão', 8.5, 1), price('t1', 'Padrão', 7.25, 10)]);

    const rows = root.querySelectorAll('[data-testid="prices"] tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Padrão');
    expect(rows[0].textContent).toContain('8,50');
    expect(rows[1].textContent).toContain('10');
    expect(rows[1].textContent).toContain('7,25');
  });

  it('says so when the chosen product has no prices yet', async () => {
    const { root, settle, pickProduct } = setup({ products: [product('p1', 'COLA-1', 'Cola 2L')] });
    await settle();

    await pickProduct('p1', []);

    expect(text(root)).toContain('Nenhum preço definido para este produto');
  });

  it('sets a price for a tier at a minimum quantity', async () => {
    const { fixture, http, root, settle, button, type, choose, pickProduct } = setup({
      products: [product('p1', 'COLA-1', 'Cola 2L')],
      tiers: [tier('t1', 'Padrão', true), tier('t2', 'Atacado')],
    });
    await settle();
    await pickProduct('p1', []);
    await choose('priceTier', 't2');
    await type('priceMinQty', '10');
    await type('priceUnit', '7.5');

    button('Salvar preço').click();
    fixture.detectChanges();
    const put = http.expectOne('/api/admin/products/p1/pricing');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ pricingTierId: 't2', unitPrice: 7.5, minQty: 10 });
    put.flush(price('t2', 'Atacado', 7.5, 10));
    http.expectOne('/api/admin/products/p1/pricing').flush([price('t2', 'Atacado', 7.5, 10)]);
    await settle();

    expect(text(root)).toContain('Preço salvo');
    expect(root.querySelector('[data-testid="prices"] tbody tr')!.textContent).toContain('Atacado');
  });

  it('does not save a price with no tier, a negative price or a minimum quantity below 1', async () => {
    const { fixture, http, root, settle, button, type, choose, pickProduct } = setup({
      products: [product('p1', 'COLA-1', 'Cola 2L')],
      tiers: [tier('t1', 'Padrão', true)],
    });
    await settle();
    await pickProduct('p1', []);
    const alert = () => root.querySelector('[data-testid="price-form"] [role="alert"]')?.textContent;
    const save = async () => {
      button('Salvar preço').click();
      fixture.detectChanges();
      await settle();
    };

    await type('priceUnit', '5');
    await save();
    expect(alert()).toContain('Escolha a faixa de preço');

    await choose('priceTier', 't1');
    await type('priceUnit', '-1');
    await save();
    expect(alert()).toContain('preço unitário');

    await type('priceUnit', '5');
    await type('priceMinQty', '0');
    await save();
    expect(alert()).toContain('quantidade mínima');

    http.expectNone('/api/admin/products/p1/pricing');
  });

  it('edits a price: the form is filled in and keeps its tier and minimum quantity', async () => {
    const { fixture, http, root, settle, button, type, field, pickProduct } = setup({
      products: [product('p1', 'COLA-1', 'Cola 2L')],
      tiers: [tier('t1', 'Padrão', true)],
    });
    await settle();
    await pickProduct('p1', [price('t1', 'Padrão', 8.5, 1)]);

    button('Editar', root.querySelector('[data-testid="prices"] tbody tr')!).click();
    await settle();
    expect(field<HTMLSelectElement>('priceTier').value).toBe('t1');
    expect(field<HTMLInputElement>('priceUnit').value).toBe('8.5');
    await type('priceUnit', '9');

    button('Salvar preço').click();
    fixture.detectChanges();
    const put = http.expectOne('/api/admin/products/p1/pricing');
    expect(put.request.body).toEqual({ pricingTierId: 't1', unitPrice: 9, minQty: 1 });
    put.flush(price('t1', 'Padrão', 9, 1));
    http.expectOne('/api/admin/products/p1/pricing').flush([price('t1', 'Padrão', 9, 1)]);
    await settle();
    expect(text(root)).toContain('9,00');
  });

  it('removes a price only after a confirming click', async () => {
    const { fixture, http, root, settle, button, pickProduct } = setup({ products: [product('p1', 'COLA-1', 'Cola 2L')] });
    await settle();
    await pickProduct('p1', [price('t1', 'Padrão', 8.5, 10)]);
    const row = () => root.querySelector('[data-testid="prices"] tbody tr')!;

    button('Remover', row()).click();
    await settle();
    http.expectNone('/api/admin/products/p1/pricing/t1/10');

    button('Confirmar remoção', row()).click();
    fixture.detectChanges();
    const del = http.expectOne('/api/admin/products/p1/pricing/t1/10');
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne('/api/admin/products/p1/pricing').flush([]);
    await settle();

    expect(text(root)).toContain('Nenhum preço definido para este produto');
  });

  it('shows the API\'s refusal of a price in the price form, with its reason', async () => {
    const { fixture, http, root, settle, button, type, choose, pickProduct } = setup({
      products: [product('p1', 'COLA-1', 'Cola 2L')],
      tiers: [tier('t1', 'Padrão', true)],
    });
    await settle();
    await pickProduct('p1', []);
    await choose('priceTier', 't1');
    await type('priceUnit', '5');

    button('Salvar preço').click();
    fixture.detectChanges();
    http.expectOne('/api/admin/products/p1/pricing').flush('Pricing tier not found.', { status: 400, statusText: 'Bad Request' });
    await settle();

    const alert = root.querySelector('[data-testid="price-form"] [role="alert"]')!;
    expect(alert.textContent).toContain('dados enviados são inválidos');
    expect(alert.querySelector('small')?.textContent).toContain('Pricing tier not found');
  });

  it('reports a failed price list for the chosen product', async () => {
    const { http, root, settle, choose } = setup({ products: [product('p1', 'COLA-1', 'Cola 2L')] });
    await settle();

    await choose('priceProduct', 'p1');
    http.expectOne('/api/admin/products/p1/pricing').error(new ProgressEvent('error'));
    await settle();

    expect(root.querySelector('[data-testid="prices-section"] [role="alert"]')?.textContent).toContain('conectar ao servidor');
  });
});
