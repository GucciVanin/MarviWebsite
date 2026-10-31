import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminCatalog } from './admin-catalog';

const category = (id: string, name: string, productCount = 0) => ({ id, name, sortOrder: 1, isActive: true, productCount });
const product = (id: string, sku: string, name: string, extra: object = {}) => ({
  id, sku, name, description: null, categoryId: 'c1', imageUrl: null, isActive: true, attributes: {}, ...extra,
});
const tiers = [{ id: 't1', name: 'Padrão', isDefault: true }, { id: 't2', name: 'Atacado', isDefault: false }];
const warehouses = [
  { id: 'w1', name: 'São Paulo', address: 'x', latitude: 0, longitude: 0 },
  { id: 'w2', name: 'Campinas', address: 'y', latitude: 0, longitude: 0 },
];

describe('Product panel (MRV-9.5)', () => {
  function setup(products: object[] = []) {
    TestBed.configureTestingModule({ imports: [AdminCatalog], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    const fixture = TestBed.createComponent(AdminCatalog);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/admin/categories').flush([category('c1', 'Refrigerantes', 3), category('c2', 'Águas')]);
    http.expectOne('/api/admin/products').flush(products);
    const root = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
    };
    const button = (testid: string) => root.querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`)!;
    const input = <T extends HTMLElement = HTMLInputElement>(id: string) => root.querySelector<T>(`#${id}`)!;
    const type = async (id: string, value: string) => {
      const el = input<HTMLInputElement | HTMLTextAreaElement>(id);
      el.value = value;
      el.dispatchEvent(new Event('input'));
      await settle();
    };
    const choose = async (id: string, value: string) => {
      const el = input<HTMLSelectElement>(id);
      el.value = value;
      el.dispatchEvent(new Event('change'));
      await settle();
    };
    const openNew = async () => {
      button('new-product').click();
      fixture.detectChanges();
      http.expectOne('/api/admin/pricing-tiers').flush(tiers);
      http.expectOne('/api/admin/warehouses').flush(warehouses);
      await settle();
    };
    const hint = (id: string) => (root.querySelector(`#${id}`)?.textContent ?? '').trim();
    const fillRequired = async () => {
      await type('productSku', ' COLA-1 ');
      await type('productName', ' Cola 2L ');
      await choose('productCategory', 'c1');
    };
    const editFirst = async () => {
      Array.from(root.querySelectorAll<HTMLButtonElement>('[data-testid="products"] tbody button')).find((b) => b.textContent?.trim() === 'Editar')!.click();
      await settle();
    };
    return { fixture, http, root, settle, button, input, type, choose, openNew, hint, fillRequired, editFirst };
  }

  // ---- AC-1: the button, the panel, focus

  it('has a "Novo produto" button above the product table and no panel until it is used', async () => {
    const { root, settle } = setup([product('p1', 'COLA-1', 'Cola 2L')]);
    await settle();

    const section = root.querySelector('[data-testid="products-section"]')!;
    const button = section.querySelector('[data-testid="new-product"]')!;
    expect(button.textContent?.trim()).toBe('Novo produto');
    expect(button.compareDocumentPosition(section.querySelector('[data-testid="products"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(root.querySelector('[data-testid="product-panel"]')).toBeNull();
  });

  it('opens a labelled panel with every field, moves focus to its heading and lists all tiers and warehouses', async () => {
    const { root, openNew, input } = setup();
    await openNew();

    const panel = root.querySelector('[data-testid="product-panel"]')!;
    const heading = panel.querySelector('h3')!;
    expect(panel.getAttribute('aria-labelledby')).toBe(heading.id);
    expect(heading.textContent).toContain('Novo produto');
    expect(document.activeElement).toBe(heading);
    for (const id of ['productSku', 'productName', 'productCategory', 'productDescription', 'productImage', 'productActive']) {
      expect(input(id), id).toBeTruthy();
      expect(root.querySelector(`label[for="${id}"]`), `label of ${id}`).toBeTruthy();
    }
    expect(Array.from(root.querySelectorAll('[data-testid="prices"] tbody tr')).map((r) => r.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['Padrão (padrão)', 'Atacado']);
    expect(Array.from(root.querySelectorAll('[data-testid="stock"] tbody tr th')).map((r) => r.textContent?.trim())).toEqual(['São Paulo', 'Campinas']);
    expect(root.querySelectorAll('.table-wrap [data-testid="prices"], .table-wrap [data-testid="stock"]').length).toBe(2);
  });

  it('Cancel closes the panel, sends nothing and returns focus to the button', async () => {
    const { http, root, settle, openNew, button } = setup();
    await openNew();

    button('cancel-product').click();
    await settle();

    expect(root.querySelector('[data-testid="product-panel"]')).toBeNull();
    expect(document.activeElement).toBe(button('new-product'));
    http.expectNone('/api/admin/products/with-setup');
  });

  // ---- attributes editor

  it('adds and removes attribute rows, focusing the new row, and offers the usual names as suggestions', async () => {
    const { root, settle, openNew, button, type, input } = setup();
    await openNew();

    button('add-attribute').click();
    await settle();
    expect(document.activeElement).toBe(input('attr-key-0'));
    button('add-attribute').click();
    await settle();
    await type('attr-key-0', 'Marca');
    await type('attr-value-0', 'Cola');
    await type('attr-key-1', 'Volume');
    expect(root.querySelectorAll('[data-testid="attributes"] tbody tr').length).toBe(2);
    const suggestions = Array.from(root.querySelectorAll('#attribute-suggestions option')).map((o) => o.getAttribute('value'));
    expect(suggestions).toEqual(['Marca', 'Unidade', 'Quantidade por caixa', 'Volume', 'Peso', 'Certificação']);
    expect(input('attr-key-0').getAttribute('list')).toBe('attribute-suggestions');

    root.querySelectorAll<HTMLButtonElement>('[data-testid="remove-attribute"]')[0].click();
    await settle();
    expect(root.querySelectorAll('[data-testid="attributes"] tbody tr').length).toBe(1);
    expect(input('attr-key-0').value).toBe('Volume');
    expect(root.querySelector('[data-testid="attributes"] tbody tr button')!.getAttribute('aria-label')).toBe('Remover atributo 1');
  });

  // ---- AC-3: validation messages

  it('does not send an empty form and says what is wrong, next to each field, in Portuguese', async () => {
    const { http, root, settle, openNew, button, hint } = setup();
    await openNew();

    button('save-product').click();
    await settle();

    http.expectNone('/api/admin/products/with-setup');
    expect(hint('productSku-hint')).toContain('3 a 40 caracteres');
    expect(hint('productName-hint')).toContain('2 a 200');
    expect(hint('productCategory-hint')).toContain('Escolha a categoria');
    expect(root.querySelector('#productSku')!.getAttribute('aria-invalid')).toBe('true');
    expect(root.querySelector('[data-testid="fix-fields"]')!.textContent).toContain('Corrija os campos');
    expect(document.activeElement).toBe(root.querySelector('#productSku'));
  });

  it('refuses a bad price, quantity, image address and repeated attribute name before sending', async () => {
    const { http, root, settle, openNew, button, type, hint, fillRequired } = setup();
    await openNew();
    await fillRequired();
    await type('price-0', '1,234');
    await type('qty-1', '-3');
    await type('productImage', 'http://exemplo.com/a.png');
    button('add-attribute').click();
    await settle();
    button('add-attribute').click();
    await settle();
    await type('attr-key-0', 'Marca');
    await type('attr-value-0', 'A');
    await type('attr-key-1', 'marca');
    await type('attr-value-1', 'B');

    button('save-product').click();
    await settle();

    http.expectNone('/api/admin/products/with-setup');
    expect(hint('price-0-hint')).toContain('maior que zero');
    expect(hint('qty-1-hint')).toContain('0 a 1.000.000');
    expect(hint('productImage-hint')).toContain('https://');
    expect(root.querySelector('[data-testid="attributes-problem"]')!.textContent).toContain('mesmo nome');
  });

  // ---- AC-2/AC-4/AC-7: the request, busy state, success

  it('sends one with-setup request (prices per tier, stock per warehouse, no blank attribute rows) and is busy until it answers', async () => {
    const { fixture, http, settle, openNew, button, type, fillRequired } = setup();
    await openNew();
    await fillRequired();
    await type('productDescription', ' Garrafa PET ');
    await type('productImage', 'https://cdn.exemplo.com/cola.png');
    button('add-attribute').click();
    await settle();
    button('add-attribute').click();
    await settle();
    await type('attr-key-0', ' Marca ');
    await type('attr-value-0', ' Cola ');
    await type('price-0', '12,50');
    await type('qty-1', '0');

    button('save-product').click();
    fixture.detectChanges();
    button('save-product').click(); // a second click while the first is on its way
    button('save-and-another').click();
    fixture.detectChanges();

    const post = http.expectOne('/api/admin/products/with-setup');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({
      sku: 'COLA-1', name: 'Cola 2L', description: 'Garrafa PET', categoryId: 'c1', imageUrl: 'https://cdn.exemplo.com/cola.png', isActive: true,
      attributes: { Marca: 'Cola' },
      prices: [{ pricingTierId: 't1', unitPrice: 12.5 }, { pricingTierId: 't2', unitPrice: null }],
      stock: [{ warehouseId: 'w1', qtyOnHand: null }, { warehouseId: 'w2', qtyOnHand: 0 }],
    });
    expect(button('save-product').disabled).toBe(true);
    expect(button('save-product').textContent).toContain('Salvando');
    post.flush(product('p9', 'COLA-1', 'Cola 2L'));
    await settle();
    http.expectOne('/api/admin/products').flush([]);
    http.expectOne('/api/admin/categories').flush([]);
    await settle();
  });

  it('after saving: names the product in a notice, closes the panel, puts it first in the table and returns focus to the button', async () => {
    const { fixture, http, root, settle, openNew, button, fillRequired } = setup([product('p1', 'AAA-1', 'Antigo')]);
    await openNew();
    await fillRequired();

    button('save-product').click();
    fixture.detectChanges();
    http.expectOne('/api/admin/products/with-setup').flush(product('p9', 'COLA-1', 'Cola 2L'));
    http.expectOne('/api/admin/products').flush([product('p1', 'AAA-1', 'Antigo'), product('p9', 'COLA-1', 'Cola 2L')]);
    http.expectOne('/api/admin/categories').flush([]);
    await settle();

    expect(root.querySelector('[data-testid="product-notice"]')!.textContent).toContain('Produto criado: Cola 2L (COLA-1).');
    expect(root.querySelector('[data-testid="product-panel"]')).toBeNull();
    const rows = root.querySelectorAll('[data-testid="products"] tbody tr');
    expect(rows[0].textContent).toContain('Cola 2L');
    expect(rows[1].textContent).toContain('Antigo');
    expect(document.activeElement).toBe(button('new-product'));
  });

  it('"Salvar e criar outro" keeps the panel open, empties the form and keeps the category', async () => {
    const { fixture, http, root, settle, openNew, button, input, fillRequired, type } = setup();
    await openNew();
    await fillRequired();
    await type('price-0', '5');

    button('save-and-another').click();
    fixture.detectChanges();
    http.expectOne('/api/admin/products/with-setup').flush(product('p9', 'COLA-1', 'Cola 2L'));
    http.expectOne('/api/admin/products').flush([product('p9', 'COLA-1', 'Cola 2L')]);
    http.expectOne('/api/admin/categories').flush([category('c1', 'Refrigerantes', 1), category('c2', 'Águas')]);
    await settle();

    expect(root.querySelector('[data-testid="product-notice"]')!.textContent).toContain('Cola 2L');
    expect(root.querySelector('[data-testid="product-panel"]')).not.toBeNull();
    expect(input('productSku').value).toBe('');
    expect(input('productName').value).toBe('');
    expect(input('price-0').value).toBe('');
    expect(input<HTMLSelectElement>('productCategory').value).toBe('c1');
    expect(button('save-product').disabled).toBe(false);
  });

  // ---- server answers

  it('shows a field-level 400 next to its field, for a row of the price table too', async () => {
    const { fixture, http, root, settle, openNew, button, fillRequired, type, hint } = setup();
    await openNew();
    await fillRequired();
    await type('price-1', '7');

    button('save-product').click();
    fixture.detectChanges();
    http.expectOne('/api/admin/products/with-setup').flush(
      [{ field: 'imageUrl', message: 'O endereço da imagem deve começar com https://.' }, { field: 'prices[1]', message: 'A faixa de preço não existe.' }],
      { status: 400, statusText: 'Bad Request' },
    );
    await settle();

    expect(hint('productImage-hint')).toContain('https://');
    expect(hint('price-1-hint')).toContain('não existe');
    expect(root.querySelector('[data-testid="fix-fields"]')).not.toBeNull();
    expect(root.querySelector('#price-1')!.getAttribute('aria-invalid')).toBe('true');
    expect(button('save-product').disabled).toBe(false); // the admin can fix and send again
  });

  it('shows "SKU já existe" on the SKU field for a 409', async () => {
    const { fixture, http, settle, openNew, button, fillRequired, hint } = setup();
    await openNew();
    await fillRequired();

    button('save-product').click();
    fixture.detectChanges();
    http.expectOne('/api/admin/products/with-setup').flush([{ field: 'sku', message: 'SKU já existe.' }], { status: 409, statusText: 'Conflict' });
    await settle();

    expect(hint('productSku-hint')).toBe('SKU já existe.');
  });

  it('after a connection failure, a retry that finds the code taken says "Este produto já foi criado" and reloads the list', async () => {
    const { fixture, http, root, settle, openNew, button, fillRequired, hint } = setup();
    await openNew();
    await fillRequired();

    button('save-product').click();
    fixture.detectChanges();
    http.expectOne('/api/admin/products/with-setup').error(new ProgressEvent('error'), { status: 0, statusText: '' });
    await settle();
    expect(root.querySelector('[role="alert"]')!.textContent).toContain('conex');
    expect(root.textContent).toContain('confira antes de tentar de novo');
    expect(button('save-product').disabled).toBe(false);

    button('save-product').click();
    fixture.detectChanges();
    http.expectOne('/api/admin/products/with-setup').flush([{ field: 'sku', message: 'SKU já existe.' }], { status: 409, statusText: 'Conflict' });
    await settle();
    http.expectOne('/api/admin/products').flush([product('p9', 'COLA-1', 'Cola 2L')]);

    expect(hint('productSku-hint')).toBe('Este produto já foi criado.');
  });

  it('after a connection failure, editing the code means the old failure no longer applies: a 409 for the new code says "SKU já existe."', async () => {
    const { fixture, http, settle, openNew, button, fillRequired, type, hint } = setup();
    await openNew();
    await fillRequired();
    button('save-product').click();
    fixture.detectChanges();
    http.expectOne('/api/admin/products/with-setup').error(new ProgressEvent('error'), { status: 0, statusText: '' });
    await settle();

    await type('productSku', 'COLA-2');
    button('save-product').click();
    fixture.detectChanges();
    http.expectOne('/api/admin/products/with-setup').flush([{ field: 'sku', message: 'SKU já existe.' }], { status: 409, statusText: 'Conflict' });
    await settle();

    expect(hint('productSku-hint')).toBe('SKU já existe.');
    http.expectNone('/api/admin/products');
  });

  it('a 409 for the code with no earlier connection failure is the plain "SKU já existe."', async () => {
    const { fixture, http, settle, openNew, button, fillRequired, hint } = setup();
    await openNew();
    await fillRequired();
    button('save-product').click();
    fixture.detectChanges();
    http.expectOne('/api/admin/products/with-setup').flush([{ field: 'sku', message: 'SKU já existe.' }], { status: 409, statusText: 'Conflict' });
    await settle();
    button('save-product').click();
    fixture.detectChanges();
    http.expectOne('/api/admin/products/with-setup').flush([{ field: 'sku', message: 'SKU já existe.' }], { status: 409, statusText: 'Conflict' });
    await settle();

    expect(hint('productSku-hint')).toBe('SKU já existe.');
  });

  it('Cancel is disabled while a save is on its way, so the answer and its notice are never lost', async () => {
    const { fixture, http, root, settle, openNew, button, fillRequired } = setup();
    await openNew();
    await fillRequired();

    button('save-product').click();
    fixture.detectChanges();
    expect(button('cancel-product').disabled).toBe(true);
    button('cancel-product').click();
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="product-panel"]')).not.toBeNull();

    http.expectOne('/api/admin/products/with-setup').flush(product('p9', 'COLA-1', 'Cola 2L'));
    http.expectOne('/api/admin/products').flush([]);
    http.expectOne('/api/admin/categories').flush([]);
    await settle();
    expect(root.querySelector('[data-testid="product-notice"]')!.textContent).toContain('Cola 2L');
  });

  it('shows a server failure with no field as an alert and keeps what was typed', async () => {
    const { fixture, http, root, settle, openNew, button, fillRequired, input } = setup();
    await openNew();
    await fillRequired();

    button('save-product').click();
    fixture.detectChanges();
    http.expectOne('/api/admin/products/with-setup').flush('boom', { status: 500, statusText: 'Server Error' });
    await settle();

    expect(root.querySelector('[role="alert"]')!.textContent).toContain('Erro no servidor');
    expect(input('productName').value).toBe(' Cola 2L ');
  });

  // ---- helpers of the form

  it('suggests the next free SKU from the category prefix', async () => {
    const { settle, openNew, button, choose, input } = setup([product('p1', 'REF-004', 'Cola')]);
    await openNew();
    await choose('productCategory', 'c1');

    button('suggest-sku').click();
    await settle();

    expect(input('productSku').value).toBe('REF-005');
  });

  it('previews an https image address and says so when it cannot be shown; nothing is previewed for another scheme', async () => {
    const { fixture, root, settle, openNew, type } = setup();
    await openNew();
    expect(root.querySelector('[data-testid="image-preview"]')).toBeNull();

    await type('productImage', 'http://exemplo.com/a.png');
    expect(root.querySelector('[data-testid="image-preview"]')).toBeNull();

    await type('productImage', 'https://exemplo.com/a.png');
    const img = root.querySelector<HTMLImageElement>('[data-testid="image-preview"] img')!;
    expect(img.getAttribute('src')).toBe('https://exemplo.com/a.png');
    expect(img.getAttribute('alt')).toBe('Prévia da imagem');
    img.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="image-preview"]')!.textContent).toContain('Não foi possível mostrar a prévia');
  });

  it('says so when there are no tiers or warehouses to fill in, and still creates the product', async () => {
    const { http, fixture, root, settle, button, fillRequired } = setup();
    button('new-product').click();
    fixture.detectChanges();
    http.expectOne('/api/admin/pricing-tiers').flush([]);
    http.expectOne('/api/admin/warehouses').flush([]);
    await settle();
    expect(root.textContent).toContain('Nenhuma faixa de preço cadastrada');
    expect(root.textContent).toContain('Nenhum armazém cadastrado');

    await fillRequired();
    button('save-product').click();
    fixture.detectChanges();
    expect(http.expectOne('/api/admin/products/with-setup').request.body).toMatchObject({ prices: [], stock: [] });
  });

  // ---- AC-5: editing in the same panel

  it('edits a product in the same panel, pre-filled, with its attributes as rows, and links to the Preços and Operação tabs instead of price and stock tables', async () => {
    const attributes = { Marca: 'Água de Côco', 'Quantidade por caixa': '12' };
    const { fixture, http, root, settle, button, type, input, editFirst } = setup([
      product('p1', 'COLA-1', 'Cola 2L', { attributes, description: 'PET', imageUrl: 'https://a.com/x.png', isActive: false }),
    ]);
    await settle();

    await editFirst();
    http.expectNone('/api/admin/pricing-tiers');
    http.expectNone('/api/admin/warehouses');

    expect(root.querySelector('#product-panel-title')!.textContent).toContain('Editar produto');
    expect(input('productSku').value).toBe('COLA-1');
    expect(input('productDescription').value).toBe('PET');
    expect(input('productImage').value).toBe('https://a.com/x.png');
    expect(input('productActive').checked).toBe(false);
    expect(input('attr-key-0').value).toBe('Marca');
    expect(input('attr-value-1').value).toBe('12');
    expect(root.querySelector('[data-testid="prices"]')).toBeNull();
    expect(root.querySelector('[data-testid="stock"]')).toBeNull();
    expect(Array.from(root.querySelectorAll('[data-testid="product-panel"] a')).map((a) => a.getAttribute('href'))).toEqual(['/admin/precos', '/admin/operacao']);
    expect(root.querySelector('[data-testid="save-and-another"]')).toBeNull();

    await type('productName', 'Cola 2 litros');
    button('save-product').click();
    fixture.detectChanges();
    const put = http.expectOne('/api/admin/products/p1');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({
      sku: 'COLA-1', name: 'Cola 2 litros', description: 'PET', categoryId: 'c1', imageUrl: 'https://a.com/x.png', isActive: false, attributes,
    });
    put.flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne('/api/admin/products').flush([]);
    http.expectOne('/api/admin/categories').flush([]);
    await settle();
    expect(root.querySelector('[data-testid="product-notice"]')!.textContent).toContain('Produto salvo: Cola 2 litros (COLA-1).');
    expect(root.querySelector('[data-testid="product-panel"]')).toBeNull();
  });

  it('lets a product with an old-style code be edited without touching its code', async () => {
    const { fixture, http, settle, button, type, editFirst } = setup([product('p1', 'old code!', 'Antigo')]);
    await settle();
    await editFirst();

    await type('productName', 'Antigo 2');
    button('save-product').click();
    fixture.detectChanges();

    expect(http.expectOne('/api/admin/products/p1').request.body).toMatchObject({ sku: 'old code!', name: 'Antigo 2' });
  });

  it('shows no product id anywhere in the panel', async () => {
    const { root, openNew, settle } = setup([product('0f8fad5b-d9cb-469f-a165-70867728950e', 'COLA-1', 'Cola')]);
    await settle();
    await openNew();

    expect(root.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});
