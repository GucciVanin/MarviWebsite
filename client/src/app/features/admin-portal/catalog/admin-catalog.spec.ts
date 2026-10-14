import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminCatalog } from './admin-catalog';

const category = (id: string, name: string, productCount = 0, isActive = true, sortOrder = 1) => ({ id, name, sortOrder, isActive, productCount });
const product = (id: string, sku: string, name: string, categoryId: string | null = null, extra: object = {}) => ({
  id, sku, name, description: null, categoryId, imageUrl: null, isActive: true, attributes: {}, ...extra,
});

describe('AdminCatalog', () => {
  function setup(data: { categories?: object[]; products?: object[] } = {}) {
    TestBed.configureTestingModule({ imports: [AdminCatalog], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(AdminCatalog);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/admin/categories').flush(data.categories ?? []);
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
      const input = field<HTMLInputElement | HTMLTextAreaElement>(name);
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
    return { fixture, http, root, settle, button, type, choose, tick };
  }
  const text = (root: HTMLElement) => (root.textContent ?? '').replace(/\s+/g, ' ');

  // ---- lists

  it('lists categories with their product counts and products with their category', async () => {
    const { root, settle } = setup({
      categories: [category('c1', 'Refrigerantes', 3), category('c2', 'Águas', 0, false)],
      products: [product('p1', 'COLA-1', 'Cola 2L', 'c1'), product('p2', 'X-1', 'Sem categoria')],
    });
    await settle();

    const categories = root.querySelectorAll('[data-testid="categories"] tbody tr');
    expect(categories[0].textContent).toContain('Refrigerantes');
    expect(categories[0].textContent).toContain('3');
    expect(categories[1].textContent).toContain('Inativa');
    const products = root.querySelectorAll('[data-testid="products"] tbody tr');
    expect(products[0].textContent).toContain('COLA-1');
    expect(products[0].textContent).toContain('Refrigerantes');
    expect(products[1].textContent).toContain('Sem categoria');
  });

  it('says so when there are no categories or products', async () => {
    const { root, settle } = setup();
    await settle();

    expect(text(root)).toContain('Nenhuma categoria cadastrada');
    expect(text(root)).toContain('Nenhum produto cadastrado');
  });

  it('tells a failed list from an empty one, and retries just that list', async () => {
    TestBed.configureTestingModule({ imports: [AdminCatalog], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(AdminCatalog);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/admin/categories').flush('x', { status: 500, statusText: 'Server Error' });
    http.expectOne('/api/admin/products').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Erro no servidor');
    expect(text(root)).not.toContain('Nenhuma categoria cadastrada');

    root.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    http.expectOne('/api/admin/categories').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(root)).toContain('Nenhuma categoria cadastrada');
  });

  // ---- categories

  it('creates a category and clears the form', async () => {
    const { fixture, http, root, settle, button, type, tick } = setup();
    await settle();
    await type('categoryName', '  Cervejas ');
    await type('categorySort', '4');
    await tick('categoryActive', false);

    button('Salvar categoria').click();
    fixture.detectChanges();
    const post = http.expectOne('/api/admin/categories');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ name: 'Cervejas', sortOrder: 4, isActive: false });
    post.flush(category('c9', 'Cervejas', 0, false, 4));
    http.expectOne('/api/admin/categories').flush([category('c9', 'Cervejas', 0, false, 4)]);
    await settle();

    expect(text(root)).toContain('Categoria salva');
    expect(field(root, 'categoryName').value).toBe('');
    expect(root.querySelector('[data-testid="categories"] tbody tr')!.textContent).toContain('Cervejas');
  });

  function field(root: HTMLElement, name: string) {
    return root.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
  }

  it('does not save a category without a name', async () => {
    const { fixture, http, root, settle, button } = setup();
    await settle();

    button('Salvar categoria').click();
    fixture.detectChanges();
    await settle();

    http.expectNone('/api/admin/categories');
    expect(root.querySelector('[data-testid="category-form"] [role="alert"]')?.textContent).toContain('Informe o nome da categoria');
  });

  it('edits a category: the form is filled in, saving sends a PUT, and cancel goes back to creating', async () => {
    const { fixture, http, root, settle, button, type } = setup({ categories: [category('c1', 'Refrigerantes', 3, true, 2)] });
    await settle();

    button('Editar', root.querySelector('[data-testid="categories"] tbody tr')!).click();
    await settle();
    expect(field(root, 'categoryName').value).toBe('Refrigerantes');
    expect(text(root)).toContain('Editar categoria');

    await type('categoryName', 'Refrigerantes e sucos');
    button('Salvar categoria').click();
    fixture.detectChanges();
    const put = http.expectOne('/api/admin/categories/c1');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ name: 'Refrigerantes e sucos', sortOrder: 2, isActive: true });
    put.flush(category('c1', 'Refrigerantes e sucos', 3, true, 2));
    http.expectOne('/api/admin/categories').flush([category('c1', 'Refrigerantes e sucos', 3)]);
    await settle();

    expect(text(root)).toContain('Nova categoria');
    expect(field(root, 'categoryName').value).toBe('');
  });

  it('cancelling an edit leaves the category untouched', async () => {
    const { http, root, settle, button } = setup({ categories: [category('c1', 'Refrigerantes', 3)] });
    await settle();
    button('Editar', root.querySelector('[data-testid="categories"] tbody tr')!).click();
    await settle();

    button('Cancelar', root.querySelector('[data-testid="category-form"]')!).click();
    await settle();

    http.expectNone('/api/admin/categories/c1');
    expect(text(root)).toContain('Nova categoria');
  });

  it('shows why a category could not be saved (duplicate name, 409)', async () => {
    const { fixture, http, root, settle, button, type } = setup();
    await settle();
    await type('categoryName', 'Cervejas');

    button('Salvar categoria').click();
    fixture.detectChanges();
    http.expectOne('/api/admin/categories').flush('A category with this name already exists.', { status: 409, statusText: 'Conflict' });
    await settle();

    const alert = root.querySelector('[data-testid="category-form"] [role="alert"]')!;
    expect(alert.textContent).toContain('conflito');
    expect(alert.querySelector('small')?.textContent).toContain('already exists');
    expect(field(root, 'categoryName').value).toBe('Cervejas');
  });

  it('deletes a category only after a second, confirming click', async () => {
    const { fixture, http, root, settle, button } = setup({ categories: [category('c1', 'Refrigerantes')] });
    await settle();
    const row = () => root.querySelector('[data-testid="categories"] tbody tr')!;

    button('Excluir', row()).click();
    await settle();
    http.expectNone('/api/admin/categories/c1');
    expect(row().textContent).toContain('Confirmar exclusão');

    button('Confirmar exclusão', row()).click();
    fixture.detectChanges();
    const del = http.expectOne('/api/admin/categories/c1');
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne('/api/admin/categories').flush([]);
    await settle();

    expect(text(root)).toContain('Nenhuma categoria cadastrada');
  });

  it('says why a category in use cannot be deleted', async () => {
    const { fixture, http, root, settle, button } = setup({ categories: [category('c1', 'Refrigerantes', 3)] });
    await settle();
    const row = () => root.querySelector('[data-testid="categories"] tbody tr')!;
    button('Excluir', row()).click();
    await settle();

    button('Confirmar exclusão', row()).click();
    fixture.detectChanges();
    http.expectOne('/api/admin/categories/c1').flush('The category still has products. Move them or deactivate the category instead.', { status: 409, statusText: 'Conflict' });
    await settle();

    const alert = root.querySelector('[data-testid="categories-section"] [role="alert"]')!;
    expect(alert.textContent).toContain('conflito');
    expect(alert.querySelector('small')?.textContent).toContain('still has products');
    expect(text(root)).toContain('Refrigerantes');
  });

  // ---- products

  it('creates a product with a category and free-form attributes', async () => {
    const { fixture, http, root, settle, button, type, choose } = setup({ categories: [category('c1', 'Refrigerantes')] });
    await settle();
    await type('productSku', ' COLA-1 ');
    await type('productName', 'Cola 2L');
    await type('productDescription', 'Garrafa PET');
    await choose('productCategory', 'c1');
    await type('productAttributes', 'marca: Cola\nvolume: 2L\n\n  ');

    button('Salvar produto').click();
    fixture.detectChanges();
    const post = http.expectOne('/api/admin/products');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({
      sku: 'COLA-1', name: 'Cola 2L', description: 'Garrafa PET', categoryId: 'c1', imageUrl: null, isActive: true,
      attributes: { marca: 'Cola', volume: '2L' },
    });
    post.flush(product('p1', 'COLA-1', 'Cola 2L', 'c1'));
    http.expectOne('/api/admin/products').flush([product('p1', 'COLA-1', 'Cola 2L', 'c1')]);
    http.expectOne('/api/admin/categories').flush([category('c1', 'Refrigerantes', 1)]);
    await settle();

    expect(text(root)).toContain('Produto salvo');
    expect(root.querySelector('[data-testid="products"] tbody tr')!.textContent).toContain('Cola 2L');
  });

  it('does not save a product without a SKU and a name', async () => {
    const { fixture, http, root, settle, button, type } = setup();
    await settle();
    await type('productSku', 'COLA-1');

    button('Salvar produto').click();
    fixture.detectChanges();
    await settle();

    http.expectNone('/api/admin/products');
    expect(root.querySelector('[data-testid="product-form"] [role="alert"]')?.textContent).toContain('Informe o código (SKU) e o nome');
  });

  it('refuses an attribute line that is not "name: value"', async () => {
    const { fixture, http, root, settle, button, type } = setup();
    await settle();
    await type('productSku', 'COLA-1');
    await type('productName', 'Cola 2L');
    await type('productAttributes', 'isto não tem dois pontos');

    button('Salvar produto').click();
    fixture.detectChanges();
    await settle();

    http.expectNone('/api/admin/products');
    expect(root.querySelector('[data-testid="product-form"] [role="alert"]')?.textContent).toContain('nome: valor');
  });

  it('shows why a product could not be saved (duplicate SKU, 409)', async () => {
    const { fixture, http, root, settle, button, type } = setup();
    await settle();
    await type('productSku', 'COLA-1');
    await type('productName', 'Cola 2L');

    button('Salvar produto').click();
    fixture.detectChanges();
    http.expectOne('/api/admin/products').flush('A product with this SKU already exists.', { status: 409, statusText: 'Conflict' });
    await settle();

    const alert = root.querySelector('[data-testid="product-form"] [role="alert"]')!;
    expect(alert.textContent).toContain('conflito');
    expect(alert.querySelector('small')?.textContent).toContain('SKU already exists');
  });

  it('edits a product: the form shows its attributes one per line and saving sends a PUT', async () => {
    const { fixture, http, root, settle, button, type } = setup({
      categories: [category('c1', 'Refrigerantes')],
      products: [product('p1', 'COLA-1', 'Cola 2L', 'c1', { attributes: { marca: 'Cola', volume: '2L' }, description: 'PET' })],
    });
    await settle();

    button('Editar', root.querySelector('[data-testid="products"] tbody tr')!).click();
    await settle();
    expect(field(root, 'productSku').value).toBe('COLA-1');
    expect((root.querySelector('[name="productAttributes"]') as HTMLTextAreaElement).value).toBe('marca: Cola\nvolume: 2L');

    await type('productName', 'Cola 2 litros');
    button('Salvar produto').click();
    fixture.detectChanges();
    const put = http.expectOne('/api/admin/products/p1');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toMatchObject({ sku: 'COLA-1', name: 'Cola 2 litros', categoryId: 'c1', attributes: { marca: 'Cola', volume: '2L' } });
    put.flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne('/api/admin/products').flush([]);
    http.expectOne('/api/admin/categories').flush([]);
    await settle();

    expect(text(root)).toContain('Produto salvo');
  });

  it('says why a product with history cannot be deleted', async () => {
    const { fixture, http, root, settle, button } = setup({ products: [product('p1', 'COLA-1', 'Cola 2L')] });
    await settle();
    const row = () => root.querySelector('[data-testid="products"] tbody tr')!;
    button('Excluir', row()).click();
    await settle();

    button('Confirmar exclusão', row()).click();
    fixture.detectChanges();
    http.expectOne('/api/admin/products/p1').flush('The product appears on quotes or orders and cannot be deleted. Deactivate it instead.', { status: 409, statusText: 'Conflict' });
    await settle();

    const alert = root.querySelector('[data-testid="products-section"] [role="alert"]')!;
    expect(alert.textContent).toContain('conflito');
    expect(alert.querySelector('small')?.textContent).toContain('Deactivate it instead');
  });
});
