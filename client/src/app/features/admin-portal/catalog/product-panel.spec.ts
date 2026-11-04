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
    for (const id of ['productSku', 'productName', 'productCategory', 'productDescription', 'productPhoto', 'productActive']) {
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

  it('refuses a bad price, quantity and repeated attribute name before sending', async () => {
    const { http, root, settle, openNew, button, type, hint, fillRequired } = setup();
    await openNew();
    await fillRequired();
    await type('price-0', '1,234');
    await type('qty-1', '-3');
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
    expect(root.querySelector('[data-testid="attributes-problem"]')!.textContent).toContain('mesmo nome');
  });

  // ---- AC-2/AC-4/AC-7: the request, busy state, success

  it('sends one with-setup request (prices per tier, stock per warehouse, no blank attribute rows) and is busy until it answers', async () => {
    const { fixture, http, settle, openNew, button, type, fillRequired } = setup();
    await openNew();
    await fillRequired();
    await type('productDescription', ' Garrafa PET ');
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
      sku: 'COLA-1', name: 'Cola 2L', description: 'Garrafa PET', categoryId: 'c1', photoToken: null, isActive: true,
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
      [{ field: 'name', message: 'O nome deve ter de 2 a 200 caracteres, sem caracteres de controle.' }, { field: 'prices[1]', message: 'A faixa de preço não existe.' }],
      { status: 400, statusText: 'Bad Request' },
    );
    await settle();

    expect(hint('productName-hint')).toContain('2 a 200');
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
      product('p1', 'COLA-1', 'Cola 2L', { attributes, description: 'PET', imageUrl: '/api/public/media/products/0123456789abcdef0123456789abcdef.jpg', isActive: false }),
    ]);
    await settle();

    await editFirst();
    http.expectNone('/api/admin/pricing-tiers');
    http.expectNone('/api/admin/warehouses');

    expect(root.querySelector('#product-panel-title')!.textContent).toContain('Editar produto');
    expect(input('productSku').value).toBe('COLA-1');
    expect(input('productDescription').value).toBe('PET');
    expect(root.querySelector('[data-testid="photo-preview"] img')!.getAttribute('src')).toBe('/api/public/media/products/0123456789abcdef0123456789abcdef.jpg');
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
      sku: 'COLA-1', name: 'Cola 2 litros', description: 'PET', categoryId: 'c1', isActive: false, attributes, photoToken: null, removePhoto: false,
    });
    put.flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne('/api/admin/products').flush([]);
    http.expectOne('/api/admin/categories').flush([]);
    await settle();
    expect(root.querySelector('[data-testid="product-notice"]')!.textContent).toContain('Produto salvo: Cola 2 litros (COLA-1).');
    expect(root.querySelector('[data-testid="product-panel"]')).toBeNull();
  });

  it('applies the same SKU rule to an edit: a stored code that breaks it must be corrected before anything is sent', async () => {
    const { fixture, http, settle, button, type, editFirst, hint } = setup([product('p1', 'old code!', 'Antigo')]);
    await settle();
    await editFirst();

    await type('productName', 'Antigo 2');
    button('save-product').click();
    fixture.detectChanges();

    http.expectNone('/api/admin/products/p1');
    expect(hint('productSku-hint')).toContain('3 a 40');
    await type('productSku', 'OLD-1');
    button('save-product').click();
    fixture.detectChanges();
    expect(http.expectOne('/api/admin/products/p1').request.body).toMatchObject({ sku: 'OLD-1', name: 'Antigo 2' });
  });

  it('shows the API field messages of a refused edit next to their fields, like a refused create (409 on the code too)', async () => {
    const { fixture, http, settle, button, type, editFirst, hint } = setup([product('p1', 'COLA-1', 'Cola 2L')]);
    await settle();
    await editFirst();

    await type('productName', 'Cola 2 litros');
    button('save-product').click();
    fixture.detectChanges();
    http.expectOne('/api/admin/products/p1').flush(
      [{ field: 'description', message: 'A descrição deve ter no máximo 2.000 caracteres, sem caracteres de controle.' }, { field: 'attributes', message: 'Use no máximo 30 atributos.' }],
      { status: 400, statusText: 'Bad Request' },
    );
    await settle();
    expect(hint('productDescription-hint')).toContain('2.000');

    button('save-product').click();
    fixture.detectChanges();
    http.expectOne('/api/admin/products/p1').flush([{ field: 'sku', message: 'SKU já existe.' }], { status: 409, statusText: 'Conflict' });
    await settle();
    expect(hint('productSku-hint')).toBe('SKU já existe.');
  });

  it('sends a deactivation of a product that breaks the rules as it is: only "Ativo" changed, the same exception as the API', async () => {
    const stored = product('p1', 'old code!', 'Antigo', { description: 'd'.repeat(2500), attributes: { Marca: 'A', marca: 'B' } });
    const { fixture, http, settle, button, input, editFirst } = setup([stored]);
    await settle();
    await editFirst();

    const active = input('productActive');
    active.click();
    await settle();
    button('save-product').click();
    fixture.detectChanges();

    const put = http.expectOne('/api/admin/products/p1');
    expect(put.request.body).toMatchObject({ sku: 'old code!', name: 'Antigo', description: 'd'.repeat(2500), isActive: false });
  });

  it('shows no product id anywhere in the panel', async () => {
    const { root, openNew, settle } = setup([product('0f8fad5b-d9cb-469f-a165-70867728950e', 'COLA-1', 'Cola')]);
    await settle();
    await openNew();

    expect(root.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  // ---- MRV-9.7: the product photo

  const PHOTO_URL = '/api/public/media/products/0123456789abcdef0123456789abcdef.png';
  const PHOTO_URL_2 = '/api/public/media/products/fedcba9876543210fedcba9876543210.webp';

  /** Puts a file in the chooser the way the browser does and fires its change event. */
  async function pick(root: HTMLElement, settle: () => Promise<void>, file: File) {
    const el = root.querySelector<HTMLInputElement>('#productPhoto')!;
    Object.defineProperty(el, 'files', { configurable: true, value: [file] }); // jsdom has no DataTransfer to build a FileList with
    el.dispatchEvent(new Event('change'));
    await settle();
    await new Promise((resolve) => setTimeout(resolve));
    await settle();
  }
  const png = (name = 'cola.png', size = 1024) => new File([new Uint8Array(size)], name, { type: 'image/png' });

  it('replaces the image address with a labelled file chooser that accepts only JPEG, PNG and WebP, and says what it expects', async () => {
    const { root, openNew, input, hint } = setup();
    await openNew();

    expect(root.querySelector('#productImage')).toBeNull();
    const chooser = input('productPhoto');
    expect(chooser.type).toBe('file');
    expect(chooser.accept).toContain('image/jpeg');
    expect(chooser.accept).toContain('image/webp');
    expect(root.querySelector('label[for="productPhoto"]')!.textContent).toContain('Escolher foto');
    expect(root.querySelector('fieldset[data-testid="photo-field"] legend')!.textContent).toContain('Foto do produto');
    expect(hint('productPhoto-hint')).toContain('5 MB');
    expect(root.querySelector('[data-testid="photo-preview"] [data-has-photo="false"]')).not.toBeNull(); // the neutral placeholder, same box
    expect(root.querySelector('[data-testid="remove-photo"]')).toBeNull();
  });

  it('uploads the chosen file, previews it from the same-origin address the API answered, and sends its token with the product', async () => {
    const { fixture, http, root, settle, openNew, button, fillRequired } = setup();
    await openNew();
    await fillRequired();

    await pick(root, settle, png('cola.png', 2048));
    expect(root.querySelector('[data-testid="photo-preview"]')!.getAttribute('aria-busy')).toBe('true');
    expect(root.querySelector('#productPhoto')!.getAttribute('aria-disabled')).toBe('true');
    expect(button('save-product').disabled).toBe(true); // the product waits for its photo
    expect(button('save-and-another').disabled).toBe(true);
    const upload = http.expectOne('/api/admin/media/product-photos');
    expect(upload.request.method).toBe('POST');
    expect(upload.request.body).toBeInstanceOf(FormData);
    expect((upload.request.body as FormData).get('photo')).toBeInstanceOf(File);
    expect(root.querySelector('[data-testid="photo-status"]')!.textContent).toContain('Enviando');
    upload.flush({ photoToken: '0123456789abcdef0123456789abcdef', previewUrl: PHOTO_URL });
    await settle();

    const img = root.querySelector<HTMLImageElement>('[data-testid="photo-preview"] img')!;
    expect(img.getAttribute('src')).toBe(PHOTO_URL); // not a blob: or data: address, so the CSP is untouched
    expect(img.getAttribute('alt')).toBe('Cola 2L');
    expect(root.querySelector('[data-testid="photo-status"]')!.textContent).toContain('cola.png (2 KB)');
    expect(root.querySelector('label[for="productPhoto"]')!.textContent).toContain('Trocar foto');

    button('save-product').click();
    fixture.detectChanges();
    const post = http.expectOne('/api/admin/products/with-setup');
    expect(post.request.body).toMatchObject({ photoToken: '0123456789abcdef0123456789abcdef' });
    expect(post.request.body).not.toHaveProperty('imageUrl');
    post.flush(product('p9', 'COLA-1', 'Cola 2L'));
    await settle();
    http.expectOne('/api/admin/products').flush([]);
    http.expectOne('/api/admin/categories').flush([]);
    await settle();
  });

  it('refuses a file of the wrong type or over 5 MB before uploading, in Portuguese, and names no file', async () => {
    const { http, root, settle, openNew, hint } = setup();
    await openNew();

    await pick(root, settle, new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }));
    expect(hint('productPhoto-hint')).toBe('Use uma foto JPEG, PNG ou WebP.');
    await pick(root, settle, new File([new Uint8Array(1)], 'a.gif', { type: 'image/gif' }));
    expect(hint('productPhoto-hint')).toBe('Use uma foto JPEG, PNG ou WebP.');
    await pick(root, settle, new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'grande.jpg', { type: 'image/jpeg' }));
    expect(hint('productPhoto-hint')).toBe('A foto deve ter no máximo 5 MB.');
    expect(root.querySelector('#productPhoto')!.getAttribute('aria-invalid')).toBe('true');
    http.expectNone('/api/admin/media/product-photos');
    expect(root.textContent).not.toContain('grande.jpg');
  });

  it('refuses a photo smaller than 400 or larger than 6000 pixels when the browser can read its size, and leaves the call to the API when it cannot', async () => {
    const { http, root, settle, openNew, hint } = setup();
    await openNew();
    const sizes = [{ width: 300, height: 900, close: () => undefined }, { width: 7000, height: 800, close: () => undefined }];
    vi.stubGlobal('createImageBitmap', vi.fn(async () => sizes.shift()));

    await pick(root, settle, png());
    expect(hint('productPhoto-hint')).toBe('A foto deve ter pelo menos 400 x 400 pixels.');
    await pick(root, settle, png());
    expect(hint('productPhoto-hint')).toBe('A foto deve ter no máximo 6000 x 6000 pixels.');
    http.expectNone('/api/admin/media/product-photos');

    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('cannot decode'); }));
    await pick(root, settle, png());
    http.expectOne('/api/admin/media/product-photos').flush([{ field: 'photo', message: 'O arquivo não é uma imagem válida. Escolha outra foto.' }], { status: 400, statusText: 'Bad Request' });
    await settle();
    expect(hint('productPhoto-hint')).toBe('O arquivo não é uma imagem válida. Escolha outra foto.');
    vi.unstubAllGlobals();
  });

  it('shows the API refusal of an upload, keeps the form usable and shows no photo', async () => {
    const { http, root, settle, openNew, hint, button } = setup();
    await openNew();

    await pick(root, settle, png());
    http.expectOne('/api/admin/media/product-photos').flush([{ field: 'photo', message: 'Use uma foto JPEG, PNG ou WebP.' }], { status: 400, statusText: 'Bad Request' });
    await settle();

    expect(hint('productPhoto-hint')).toBe('Use uma foto JPEG, PNG ou WebP.');
    expect(root.querySelector('[data-testid="photo-preview"] [data-has-photo="false"]')).not.toBeNull();
    expect(root.querySelector('#productPhoto')!.getAttribute('aria-disabled')).toBeNull();
    expect(button('save-product').disabled).toBe(false);
  });

  it('removes a photo just uploaded (back to none) with the button, and returns focus to the chooser', async () => {
    const { fixture, http, root, settle, openNew, button, fillRequired } = setup();
    await openNew();
    await fillRequired();
    await pick(root, settle, png());
    http.expectOne('/api/admin/media/product-photos').flush({ photoToken: '0123456789abcdef0123456789abcdef', previewUrl: PHOTO_URL });
    await settle();

    button('remove-photo').click();
    await settle();

    expect(root.querySelector('[data-testid="photo-preview"] [data-has-photo="false"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="remove-photo"]')).toBeNull();
    button('save-product').click();
    fixture.detectChanges();
    expect(http.expectOne('/api/admin/products/with-setup').request.body).toMatchObject({ photoToken: null });
  });

  it('on an edit shows the current photo, replaces it with a token, and sends removePhoto only when it was removed', async () => {
    const { fixture, http, root, settle, button, editFirst } = setup([product('p1', 'COLA-1', 'Cola 2L', { imageUrl: PHOTO_URL })]);
    await settle();
    await editFirst();

    expect(root.querySelector('[data-testid="photo-preview"] img')!.getAttribute('src')).toBe(PHOTO_URL);
    expect(root.querySelector('[data-testid="photo-status"]')!.textContent).toContain('foto atual');
    expect(root.querySelector('label[for="productPhoto"]')!.textContent).toContain('Trocar foto');

    await pick(root, settle, png('nova.png'));
    http.expectOne('/api/admin/media/product-photos').flush({ photoToken: 'fedcba9876543210fedcba9876543210', previewUrl: PHOTO_URL_2 });
    await settle();
    expect(root.querySelector('[data-testid="photo-preview"] img')!.getAttribute('src')).toBe(PHOTO_URL_2);

    button('remove-photo').click(); // drops the new file: the stored photo shows again
    await settle();
    expect(root.querySelector('[data-testid="photo-preview"] img')!.getAttribute('src')).toBe(PHOTO_URL);

    button('remove-photo').click(); // now marks the stored photo for removal
    await settle();
    expect(root.querySelector('[data-testid="photo-preview"] [data-has-photo="false"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="photo-status"]')!.textContent).toContain('será removida');

    button('save-product').click();
    fixture.detectChanges();
    const put = http.expectOne('/api/admin/products/p1');
    expect(put.request.body).toMatchObject({ photoToken: null, removePhoto: true });
    put.flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne('/api/admin/products').flush([]);
    http.expectOne('/api/admin/categories').flush([]);
    await settle();
  });

  it('sends a replacement as photoToken with removePhoto false, and a form with no photo change sends neither', async () => {
    const { fixture, http, root, settle, button, type, editFirst } = setup([product('p1', 'COLA-1', 'Cola 2L', { imageUrl: PHOTO_URL })]);
    await settle();
    await editFirst();
    await type('productName', 'Cola 2 litros');
    button('save-product').click();
    fixture.detectChanges();
    const first = http.expectOne('/api/admin/products/p1');
    expect(first.request.body).toMatchObject({ photoToken: null, removePhoto: false });
    first.flush([{ field: 'name', message: 'x' }], { status: 400, statusText: 'Bad Request' });
    await settle();

    await pick(root, settle, png('nova.png'));
    http.expectOne('/api/admin/media/product-photos').flush({ photoToken: 'fedcba9876543210fedcba9876543210', previewUrl: PHOTO_URL_2 });
    await settle();
    button('save-product').click();
    fixture.detectChanges();
    expect(http.expectOne('/api/admin/products/p1').request.body).toMatchObject({ photoToken: 'fedcba9876543210fedcba9876543210', removePhoto: false });
  });

  it('treats a changed photo as a real edit: a form that differs in "Ativo" and the photo is validated, not sent as an activation-only edit', async () => {
    const { fixture, http, root, settle, button, input, editFirst } = setup([product('p1', 'x', 'Antigo', { imageUrl: PHOTO_URL })]);
    await settle();
    await editFirst();
    input('productActive').click();
    await pick(root, settle, png());
    http.expectOne('/api/admin/media/product-photos').flush({ photoToken: 'fedcba9876543210fedcba9876543210', previewUrl: PHOTO_URL_2 });
    await settle();

    button('save-product').click();
    fixture.detectChanges();

    http.expectNone('/api/admin/products/p1'); // the SKU "x" breaks the rules: the form says so instead of sending
    expect(root.querySelector('[data-testid="fix-fields"]')).not.toBeNull();
  });

  it('shows the API message when a photo token is refused at save and asks for the file again', async () => {
    const { fixture, http, root, settle, openNew, button, fillRequired, hint } = setup();
    await openNew();
    await fillRequired();
    await pick(root, settle, png());
    http.expectOne('/api/admin/media/product-photos').flush({ photoToken: '0123456789abcdef0123456789abcdef', previewUrl: PHOTO_URL });
    await settle();

    button('save-product').click();
    fixture.detectChanges();
    http.expectOne('/api/admin/products/with-setup').flush([{ field: 'photo', message: 'A foto enviada expirou, já foi usada ou não é sua. Envie a foto de novo.' }], { status: 400, statusText: 'Bad Request' });
    await settle();

    expect(hint('productPhoto-hint')).toContain('expirou');
    expect(root.querySelector('[data-testid="photo-preview"] [data-has-photo="false"]')).not.toBeNull(); // the dead token is dropped
  });

  it('says to wait when another file is chosen during an upload', async () => {
    const { http, root, settle, openNew, hint } = setup();
    await openNew();
    await pick(root, settle, png());
    const first = http.expectOne('/api/admin/media/product-photos');

    await pick(root, settle, png('outra.png'));
    expect(hint('productPhoto-hint')).toBe('Aguarde o envio da foto atual.');
    http.expectNone('/api/admin/media/product-photos');
    first.flush({ photoToken: '0123456789abcdef0123456789abcdef', previewUrl: PHOTO_URL });
    await settle();
  });

  it('shows a failure that names no field (a 500, a 429, a lost connection) instead of saying nothing, and frees the form', async () => {
    const { http, root, settle, openNew, hint, button } = setup();
    await openNew();

    await pick(root, settle, png());
    http.expectOne('/api/admin/media/product-photos').flush('x', { status: 500, statusText: 'Server Error' });
    await settle();
    expect(hint('productPhoto-hint')).not.toContain('JPEG, PNG ou WebP, até 5 MB');
    expect(hint('productPhoto-hint').length).toBeGreaterThan(10);
    expect(button('save-product').disabled).toBe(false);

    await pick(root, settle, png());
    http.expectOne('/api/admin/media/product-photos').error(new ProgressEvent('error'), { status: 0 });
    await settle();
    expect(hint('productPhoto-hint')).not.toContain('JPEG, PNG ou WebP, até 5 MB');
  });

  it('waits for a photo that is still uploading before saving, and sends its token once it is ready', async () => {
    const { fixture, http, root, settle, openNew, button, fillRequired } = setup();
    await openNew();
    await fillRequired();
    await pick(root, settle, png()); // upload in flight
    const upload = http.expectOne('/api/admin/media/product-photos');

    button('save-and-another').click(); // blocked: the product waits
    fixture.detectChanges();
    http.expectNone('/api/admin/products/with-setup');
    upload.flush({ photoToken: '0123456789abcdef0123456789abcdef', previewUrl: PHOTO_URL });
    await settle();
    expect(root.querySelector('[data-testid="photo-preview"] img')!.getAttribute('src')).toBe(PHOTO_URL);

    button('save-and-another').click();
    fixture.detectChanges();
    const post = http.expectOne('/api/admin/products/with-setup');
    expect(post.request.body).toMatchObject({ photoToken: '0123456789abcdef0123456789abcdef' });
    post.flush(product('p9', 'COLA-1', 'Cola 2L'));
    await settle();
    http.expectOne('/api/admin/products').flush([]);
    http.expectOne('/api/admin/categories').flush([]);
    await settle();
    expect(root.querySelector('[data-testid="photo-preview"] [data-has-photo="false"]')).not.toBeNull(); // the next product starts with no photo
  });
});
