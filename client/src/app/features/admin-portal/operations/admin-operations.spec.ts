import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminOperations } from './admin-operations';

const warehouse = (id: string, name: string, address = 'Rua A, 1', latitude = -23.5, longitude = -46.6) => ({ id, name, address, latitude, longitude });
const area = (id: string, warehouseId: string, type: 'Radius' | 'Polygon', radiusMiles: number | null = null, polygonGeoJson: string | null = null) => ({
  id, warehouseId, type, radiusMiles, polygonGeoJson,
});
const stock = (id: string, productId: string, productName: string, warehouseId: string, qtyOnHand: number, qtyReserved = 0, reorderPoint = 5) => ({
  id, productId, productName, warehouseId, qtyOnHand, qtyReserved, reorderPoint,
});
const product = (id: string, sku: string, name: string) => ({ id, sku, name, description: null, categoryId: null, imageUrl: null, isActive: true, attributes: {} });

interface Data {
  warehouses?: object[];
  areas?: object[];
  stock?: object[];
  products?: object[];
}

describe('AdminOperations', () => {
  function setup(data: Data = {}) {
    TestBed.configureTestingModule({ imports: [AdminOperations], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(AdminOperations);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/admin/warehouses').flush(data.warehouses ?? []);
    http.expectOne('/api/admin/coverage-areas').flush(data.areas ?? []);
    http.expectOne((r) => r.url === '/api/employee/inventory').flush(data.stock ?? []);
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
    /** Clicks a submit button and returns once Angular has seen the click. */
    const submit = async (label: string) => {
      button(label).click();
      fixture.detectChanges();
      await settle();
    };
    return { fixture, http, root, settle, button, type, choose, submit, field };
  }
  const text = (root: HTMLElement) => (root.textContent ?? '').replace(/\s+/g, ' ');

  // ---- warehouses

  it('lists warehouses, coverage areas and stock, with names instead of IDs', async () => {
    const { root, settle } = setup({
      warehouses: [warehouse('w1', 'CD São Paulo', 'Av. Industrial 100')],
      areas: [area('a1', 'w1', 'Radius', 30)],
      stock: [stock('s1', 'p1', 'Cola 2L', 'w1', 120, 20, 10)],
    });
    await settle();

    expect(root.querySelector('[data-testid="warehouses"] tbody tr')!.textContent).toContain('Av. Industrial 100');
    const areaRow = root.querySelector('[data-testid="areas"] tbody tr')!.textContent!;
    expect(areaRow).toContain('CD São Paulo');
    expect(areaRow).toContain('Raio');
    expect(areaRow).toContain('30');
    const stockRow = root.querySelector('[data-testid="stock"] tbody tr')!.textContent!;
    expect(stockRow).toContain('Cola 2L');
    expect(stockRow).toContain('CD São Paulo');
    expect(stockRow).toContain('120');
  });

  it('says so when each list is empty', async () => {
    const { root, settle } = setup();
    await settle();

    expect(text(root)).toContain('Nenhum depósito cadastrado');
    expect(text(root)).toContain('Nenhuma área de cobertura cadastrada');
    expect(text(root)).toContain('Nenhum item em estoque');
  });

  it('creates a warehouse with trimmed text and numeric coordinates', async () => {
    const { http, root, settle, type, submit } = setup();
    await settle();
    await type('warehouseName', '  CD Rio ');
    await type('warehouseAddress', ' Rua do Porto, 50 ');
    await type('warehouseLat', '-22.9');
    await type('warehouseLng', '-43.17');

    await submit('Salvar depósito');
    const post = http.expectOne('/api/admin/warehouses');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ name: 'CD Rio', address: 'Rua do Porto, 50', latitude: -22.9, longitude: -43.17 });
    post.flush(warehouse('w2', 'CD Rio'));
    http.expectOne('/api/admin/warehouses').flush([warehouse('w2', 'CD Rio')]);
    await settle();

    expect(text(root)).toContain('Depósito salvo');
    expect(root.querySelector<HTMLInputElement>('[name="warehouseName"]')!.value).toBe('');
  });

  it('does not save a warehouse without a name and address, or with impossible coordinates', async () => {
    const { http, root, settle, type, submit } = setup();
    await settle();
    const alert = () => root.querySelector('[data-testid="warehouse-form"] [role="alert"]')?.textContent;

    await submit('Salvar depósito');
    expect(alert()).toContain('Informe o nome e o endereço');

    await type('warehouseName', 'CD');
    await type('warehouseAddress', 'Rua A');
    await type('warehouseLat', '95');
    await type('warehouseLng', '0');
    await submit('Salvar depósito');
    expect(alert()).toContain('latitude');

    await type('warehouseLat', '10');
    await type('warehouseLng', '181');
    await submit('Salvar depósito');
    expect(alert()).toContain('longitude');

    http.expectNone('/api/admin/warehouses');
  });

  it('edits a warehouse', async () => {
    const { http, root, settle, button, type, field, submit } = setup({ warehouses: [warehouse('w1', 'CD São Paulo', 'Av. 1', -23.5, -46.6)] });
    await settle();

    button('Editar', root.querySelector('[data-testid="warehouses"] tbody tr')!).click();
    await settle();
    expect(field<HTMLInputElement>('warehouseName').value).toBe('CD São Paulo');
    expect(field<HTMLInputElement>('warehouseLat').value).toBe('-23.5');
    await type('warehouseName', 'CD Central');

    await submit('Salvar depósito');
    const put = http.expectOne('/api/admin/warehouses/w1');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ name: 'CD Central', address: 'Av. 1', latitude: -23.5, longitude: -46.6 });
    put.flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne('/api/admin/warehouses').flush([]);
    await settle();
    expect(text(root)).toContain('Depósito salvo');
  });

  it('deletes a warehouse after confirming, then reloads warehouses, areas and stock', async () => {
    const { http, root, settle, button, fixture } = setup({ warehouses: [warehouse('w1', 'CD')] });
    await settle();
    const row = () => root.querySelector('[data-testid="warehouses"] tbody tr')!;

    button('Excluir', row()).click();
    await settle();
    http.expectNone('/api/admin/warehouses/w1');
    button('Confirmar exclusão', row()).click();
    fixture.detectChanges();
    const del = http.expectOne('/api/admin/warehouses/w1');
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne('/api/admin/warehouses').flush([]);
    http.expectOne('/api/admin/coverage-areas').flush([]);
    http.expectOne((r) => r.url === '/api/employee/inventory').flush([]);
    await settle();

    expect(text(root)).toContain('Nenhum depósito cadastrado');
  });

  it('says why a warehouse with stock cannot be deleted', async () => {
    const { http, root, settle, button, fixture } = setup({ warehouses: [warehouse('w1', 'CD')] });
    await settle();
    const row = () => root.querySelector('[data-testid="warehouses"] tbody tr')!;
    button('Excluir', row()).click();
    await settle();

    button('Confirmar exclusão', row()).click();
    fixture.detectChanges();
    http.expectOne('/api/admin/warehouses/w1').flush('The warehouse still has inventory or orders.', { status: 409, statusText: 'Conflict' });
    await settle();

    const alert = root.querySelector('[data-testid="warehouses-section"] [role="alert"]')!;
    expect(alert.textContent).toContain('conflito');
    expect(alert.querySelector('small')?.textContent).toContain('still has inventory or orders');
  });

  // ---- coverage areas

  it('creates a radius coverage area for a warehouse', async () => {
    const { http, root, settle, type, choose, submit } = setup({ warehouses: [warehouse('w1', 'CD São Paulo')] });
    await settle();
    await choose('areaWarehouse', 'w1');
    await type('areaRadius', '25');

    await submit('Salvar área');
    const post = http.expectOne('/api/admin/coverage-areas');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ warehouseId: 'w1', type: 'Radius', radiusMiles: 25, polygonGeoJson: null });
    post.flush(area('a1', 'w1', 'Radius', 25));
    http.expectOne('/api/admin/coverage-areas').flush([area('a1', 'w1', 'Radius', 25)]);
    await settle();

    expect(text(root)).toContain('Área salva');
  });

  it('stores a polygon area but says it is not used in the delivery check yet', async () => {
    const { http, root, settle, type, choose, submit } = setup({ warehouses: [warehouse('w1', 'CD São Paulo')] });
    await settle();
    await choose('areaWarehouse', 'w1');
    await choose('areaType', 'Polygon');
    expect(text(root)).toContain('ainda não são usadas');
    await type('areaPolygon', '{"type":"Polygon","coordinates":[]}');

    await submit('Salvar área');
    const post = http.expectOne('/api/admin/coverage-areas');
    expect(post.request.body).toEqual({ warehouseId: 'w1', type: 'Polygon', radiusMiles: null, polygonGeoJson: '{"type":"Polygon","coordinates":[]}' });
    post.flush(area('a1', 'w1', 'Polygon', null, '{}'));
    http.expectOne('/api/admin/coverage-areas').flush([area('a1', 'w1', 'Polygon', null, '{}')]);
    await settle();

    expect(root.querySelector('[data-testid="areas"] tbody tr')!.textContent).toContain('Polígono');
    expect(root.querySelector('[data-testid="areas"] tbody tr')!.textContent).toContain('ainda não usada');
  });

  it('does not save a coverage area with no warehouse, a bad radius or invalid GeoJSON', async () => {
    const { http, root, settle, type, choose, submit } = setup({ warehouses: [warehouse('w1', 'CD')] });
    await settle();
    const alert = () => root.querySelector('[data-testid="area-form"] [role="alert"]')?.textContent;

    await submit('Salvar área');
    expect(alert()).toContain('Escolha o depósito');

    await choose('areaWarehouse', 'w1');
    await type('areaRadius', '0');
    await submit('Salvar área');
    expect(alert()).toContain('raio');

    await type('areaRadius', '20001');
    await submit('Salvar área');
    expect(alert()).toContain('20000');

    await choose('areaType', 'Polygon');
    await type('areaPolygon', 'isto não é JSON');
    await submit('Salvar área');
    expect(alert()).toContain('GeoJSON');

    http.expectNone('/api/admin/coverage-areas');
  });

  it('edits and deletes a coverage area', async () => {
    const { http, root, settle, button, type, submit, fixture } = setup({
      warehouses: [warehouse('w1', 'CD')],
      areas: [area('a1', 'w1', 'Radius', 30)],
    });
    await settle();
    const row = () => root.querySelector('[data-testid="areas"] tbody tr')!;

    button('Editar', row()).click();
    await settle();
    await type('areaRadius', '40');
    await submit('Salvar área');
    const put = http.expectOne('/api/admin/coverage-areas/a1');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ warehouseId: 'w1', type: 'Radius', radiusMiles: 40, polygonGeoJson: null });
    put.flush(area('a1', 'w1', 'Radius', 40));
    http.expectOne('/api/admin/coverage-areas').flush([area('a1', 'w1', 'Radius', 40)]);
    await settle();

    button('Excluir', row()).click();
    await settle();
    button('Confirmar exclusão', row()).click();
    fixture.detectChanges();
    http.expectOne('/api/admin/coverage-areas/a1').flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne('/api/admin/coverage-areas').flush([]);
    await settle();
    expect(text(root)).toContain('Nenhuma área de cobertura cadastrada');
  });

  // ---- stock

  it('sets the stock of a product in a warehouse', async () => {
    const { http, root, settle, type, choose, submit } = setup({
      warehouses: [warehouse('w1', 'CD São Paulo')],
      products: [product('p1', 'COLA-1', 'Cola 2L')],
    });
    await settle();
    await choose('stockProduct', 'p1');
    await choose('stockWarehouse', 'w1');
    await type('stockOnHand', '120');
    await type('stockReorder', '15');

    await submit('Salvar estoque');
    const put = http.expectOne('/api/admin/inventory');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ productId: 'p1', warehouseId: 'w1', qtyOnHand: 120, reorderPoint: 15 });
    put.flush(stock('s1', 'p1', 'Cola 2L', 'w1', 120, 0, 15));
    http.expectOne((r) => r.url === '/api/employee/inventory').flush([stock('s1', 'p1', 'Cola 2L', 'w1', 120, 0, 15)]);
    await settle();

    expect(text(root)).toContain('Estoque salvo');
    expect(root.querySelector('[data-testid="stock"] tbody tr')!.textContent).toContain('120');
  });

  it('does not save stock without a product and warehouse or with a negative quantity', async () => {
    const { http, root, settle, type, choose, submit } = setup({
      warehouses: [warehouse('w1', 'CD')],
      products: [product('p1', 'COLA-1', 'Cola 2L')],
    });
    await settle();
    const alert = () => root.querySelector('[data-testid="stock-form"] [role="alert"]')?.textContent;

    await submit('Salvar estoque');
    expect(alert()).toContain('Escolha o produto e o depósito');

    await choose('stockProduct', 'p1');
    await choose('stockWarehouse', 'w1');
    await type('stockOnHand', '-1');
    await submit('Salvar estoque');
    expect(alert()).toContain('inteiros');

    http.expectNone('/api/admin/inventory');
  });

  it('adjusts an existing stock row: product and warehouse stay, the quantities change', async () => {
    const { http, root, settle, button, type, field, submit } = setup({
      warehouses: [warehouse('w1', 'CD')],
      products: [product('p1', 'COLA-1', 'Cola 2L')],
      stock: [stock('s1', 'p1', 'Cola 2L', 'w1', 120, 20, 10)],
    });
    await settle();

    button('Ajustar', root.querySelector('[data-testid="stock"] tbody tr')!).click();
    await settle();
    expect(field<HTMLSelectElement>('stockProduct').value).toBe('p1');
    expect(field<HTMLSelectElement>('stockProduct').disabled).toBe(true);
    expect(field<HTMLInputElement>('stockOnHand').value).toBe('120');
    await type('stockOnHand', '90');

    await submit('Salvar estoque');
    const put = http.expectOne('/api/admin/inventory');
    expect(put.request.body).toEqual({ productId: 'p1', warehouseId: 'w1', qtyOnHand: 90, reorderPoint: 10 });
    put.flush(stock('s1', 'p1', 'Cola 2L', 'w1', 90, 20, 10));
    http.expectOne((r) => r.url === '/api/employee/inventory').flush([]);
    await settle();
    expect(text(root)).toContain('Estoque salvo');
  });

  it('shows the API\'s refusal of a stock change with its reason', async () => {
    const { http, root, settle, type, choose, submit } = setup({
      warehouses: [warehouse('w1', 'CD')],
      products: [product('p1', 'COLA-1', 'Cola 2L')],
    });
    await settle();
    await choose('stockProduct', 'p1');
    await choose('stockWarehouse', 'w1');
    await type('stockOnHand', '5');

    await submit('Salvar estoque');
    http.expectOne('/api/admin/inventory').flush('The data was changed by someone else.', { status: 409, statusText: 'Conflict' });
    await settle();

    const alert = root.querySelector('[data-testid="stock-form"] [role="alert"]')!;
    expect(alert.textContent).toContain('conflito');
    expect(alert.querySelector('small')?.textContent).toContain('changed by someone else');
  });

  it('reports a failed stock load and retries only that list', async () => {
    TestBed.configureTestingModule({ imports: [AdminOperations], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(AdminOperations);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/admin/warehouses').flush([]);
    http.expectOne('/api/admin/coverage-areas').flush([]);
    http.expectOne((r) => r.url === '/api/employee/inventory').flush('x', { status: 500, statusText: 'Server Error' });
    http.expectOne('/api/admin/products').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('[data-testid="stock-section"] [role="alert"]')?.textContent).toContain('Erro no servidor');
    root.querySelector<HTMLButtonElement>('[data-testid="stock-section"] [role="alert"] button')!.click();
    http.expectOne((r) => r.url === '/api/employee/inventory').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="stock-section"] [role="alert"]')).toBeNull();
  });
});
