import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ERROR_STATUSES, EndpointCase, call, fail, statusOf } from '../../../core/http/testing/http-testing';
import { AdminService } from './admin.service';

const cases: EndpointCase<AdminService>[] = [
  { name: 'createEmployee', call: (s) => s.createEmployee({ email: 'e@x.com', password: 'Abc123!', employeeCode: 'E1', department: null, hireDate: '2026-01-01' }), method: 'POST', url: '/api/admin/employees', body: { email: 'e@x.com', password: 'Abc123!', employeeCode: 'E1', department: null, hireDate: '2026-01-01' }, response: { id: 'u1' } },
  { name: 'approveClient', call: (s) => s.approveClient('c1', { pricingTierId: 't1' }), method: 'PUT', url: '/api/admin/clients/c1/approve', body: { pricingTierId: 't1' } },
  { name: 'updateClientTier', call: (s) => s.updateClientTier('c1', { pricingTierId: 't1' }), method: 'PUT', url: '/api/admin/clients/c1/pricing-tier', body: { pricingTierId: 't1' } },
  { name: 'searchClients', call: (s) => s.searchClients('bar', 8), method: 'GET', url: '/api/employee/clients', query: { search: 'bar', pageSize: '8' }, response: { items: [], page: 1, pageSize: 8, totalCount: 0 } },
  { name: 'suspendClient', call: (s) => s.suspendClient('c1'), method: 'PUT', url: '/api/admin/clients/c1/suspend', body: {} },
  { name: 'getCategories', call: (s) => s.getCategories(), method: 'GET', url: '/api/admin/categories', response: [{ id: 'c1', name: 'Cervejas', sortOrder: 1, isActive: true, productCount: 3 }] },
  { name: 'createCategory', call: (s) => s.createCategory({ name: 'Cervejas', sortOrder: 1, isActive: true }), method: 'POST', url: '/api/admin/categories', body: { name: 'Cervejas', sortOrder: 1, isActive: true }, response: { id: 'c1' } },
  { name: 'updateCategory', call: (s) => s.updateCategory('c1', { name: 'Cervejas', sortOrder: 1, isActive: true }), method: 'PUT', url: '/api/admin/categories/c1', body: { name: 'Cervejas', sortOrder: 1, isActive: true }, response: { id: 'c1' } },
  { name: 'deleteCategory', call: (s) => s.deleteCategory('c1'), method: 'DELETE', url: '/api/admin/categories/c1' },
  { name: 'getPricingTiers', call: (s) => s.getPricingTiers(), method: 'GET', url: '/api/admin/pricing-tiers', response: [{ id: 't1', name: 'Ouro', isDefault: false }] },
  { name: 'createPricingTier', call: (s) => s.createPricingTier({ name: 'Ouro', isDefault: false }), method: 'POST', url: '/api/admin/pricing-tiers', body: { name: 'Ouro', isDefault: false }, response: { id: 't1' } },
  { name: 'updatePricingTier', call: (s) => s.updatePricingTier('t1', { name: 'Ouro', isDefault: false }), method: 'PUT', url: '/api/admin/pricing-tiers/t1', body: { name: 'Ouro', isDefault: false }, response: { id: 't1' } },
  { name: 'getProductPrices', call: (s) => s.getProductPrices('p1'), method: 'GET', url: '/api/admin/products/p1/pricing', response: [{ pricingTierId: 't1', pricingTierName: 'Ouro', unitPrice: 9.9, minQty: 6 }] },
  { name: 'upsertProductPrice', call: (s) => s.upsertProductPrice('p1', { pricingTierId: 't1', unitPrice: 9.9, minQty: 6 }), method: 'PUT', url: '/api/admin/products/p1/pricing', body: { pricingTierId: 't1', unitPrice: 9.9, minQty: 6 }, response: { pricingTierId: 't1' } },
  { name: 'deleteProductPrice', call: (s) => s.deleteProductPrice('p1', 't1', 6), method: 'DELETE', url: '/api/admin/products/p1/pricing/t1/6' },
  { name: 'getProducts', call: (s) => s.getProducts(), method: 'GET', url: '/api/admin/products', response: [{ id: 'p1' }] },
  { name: 'getProduct', call: (s) => s.getProduct('p1'), method: 'GET', url: '/api/admin/products/p1', response: { id: 'p1' } },
  { name: 'createProduct', call: (s) => s.createProduct({ sku: 'A1', name: 'Cerveja', description: null, categoryId: 'c1', imageUrl: null, isActive: true, attributes: { volume: '350ml' } }), method: 'POST', url: '/api/admin/products', body: { sku: 'A1', name: 'Cerveja', description: null, categoryId: 'c1', imageUrl: null, isActive: true, attributes: { volume: '350ml' } }, response: { id: 'p1' } },
  { name: 'updateProduct', call: (s) => s.updateProduct('p1', { sku: 'A1', name: 'Cerveja', description: null, categoryId: 'c1', imageUrl: null, isActive: true, attributes: { volume: '350ml' } }), method: 'PUT', url: '/api/admin/products/p1', body: { sku: 'A1', name: 'Cerveja', description: null, categoryId: 'c1', imageUrl: null, isActive: true, attributes: { volume: '350ml' } } },
  { name: 'deleteProduct', call: (s) => s.deleteProduct('p1'), method: 'DELETE', url: '/api/admin/products/p1' },
  { name: 'getDeals', call: (s) => s.getDeals(), method: 'GET', url: '/api/admin/deals', response: [{ id: 'd1' }] },
  { name: 'getDeal', call: (s) => s.getDeal('d1'), method: 'GET', url: '/api/admin/deals/d1', response: { id: 'd1' } },
  { name: 'createDeal', call: (s) => s.createDeal({ name: 'Verão', discountType: 'Percent', discountValue: 10, startDate: '2026-01-01', endDate: '2026-02-01', productIds: ['p1'], categoryIds: [], minQty: 2 }), method: 'POST', url: '/api/admin/deals', body: { name: 'Verão', discountType: 'Percent', discountValue: 10, startDate: '2026-01-01', endDate: '2026-02-01', productIds: ['p1'], categoryIds: [], minQty: 2 }, response: { id: 'd1' } },
  { name: 'updateDeal', call: (s) => s.updateDeal('d1', { name: 'Verão', discountType: 'Percent', discountValue: 10, startDate: '2026-01-01', endDate: '2026-02-01', productIds: ['p1'], categoryIds: [], minQty: 2 }), method: 'PUT', url: '/api/admin/deals/d1', body: { name: 'Verão', discountType: 'Percent', discountValue: 10, startDate: '2026-01-01', endDate: '2026-02-01', productIds: ['p1'], categoryIds: [], minQty: 2 } },
  { name: 'deleteDeal', call: (s) => s.deleteDeal('d1'), method: 'DELETE', url: '/api/admin/deals/d1' },
  { name: 'getWarehouses', call: (s) => s.getWarehouses(), method: 'GET', url: '/api/admin/warehouses', response: [{ id: 'w1' }] },
  { name: 'getWarehouse', call: (s) => s.getWarehouse('w1'), method: 'GET', url: '/api/admin/warehouses/w1', response: { id: 'w1' } },
  { name: 'createWarehouse', call: (s) => s.createWarehouse({ name: 'Centro', address: 'Rua A, 1', latitude: -23.5, longitude: -46.6 }), method: 'POST', url: '/api/admin/warehouses', body: { name: 'Centro', address: 'Rua A, 1', latitude: -23.5, longitude: -46.6 }, response: { id: 'w1' } },
  { name: 'updateWarehouse', call: (s) => s.updateWarehouse('w1', { name: 'Centro', address: 'Rua A, 1', latitude: -23.5, longitude: -46.6 }), method: 'PUT', url: '/api/admin/warehouses/w1', body: { name: 'Centro', address: 'Rua A, 1', latitude: -23.5, longitude: -46.6 } },
  { name: 'deleteWarehouse', call: (s) => s.deleteWarehouse('w1'), method: 'DELETE', url: '/api/admin/warehouses/w1' },
  { name: 'getCoverageAreas', call: (s) => s.getCoverageAreas(), method: 'GET', url: '/api/admin/coverage-areas', response: [{ id: 'a1' }] },
  { name: 'getCoverageArea', call: (s) => s.getCoverageArea('a1'), method: 'GET', url: '/api/admin/coverage-areas/a1', response: { id: 'a1' } },
  { name: 'createCoverageArea', call: (s) => s.createCoverageArea({ warehouseId: 'w1', type: 'Radius', radiusMiles: 10, polygonGeoJson: null }), method: 'POST', url: '/api/admin/coverage-areas', body: { warehouseId: 'w1', type: 'Radius', radiusMiles: 10, polygonGeoJson: null }, response: { id: 'a1' } },
  { name: 'updateCoverageArea', call: (s) => s.updateCoverageArea('a1', { warehouseId: 'w1', type: 'Radius', radiusMiles: 10, polygonGeoJson: null }), method: 'PUT', url: '/api/admin/coverage-areas/a1', body: { warehouseId: 'w1', type: 'Radius', radiusMiles: 10, polygonGeoJson: null } },
  { name: 'deleteCoverageArea', call: (s) => s.deleteCoverageArea('a1'), method: 'DELETE', url: '/api/admin/coverage-areas/a1' },
  { name: 'getStock (through the employee endpoint)', call: (s) => s.getStock(), method: 'GET', url: '/api/employee/inventory', response: [{ id: 'i1' }] },
  { name: 'upsertStock', call: (s) => s.upsertStock({ productId: 'p1', warehouseId: 'w1', qtyOnHand: 50, reorderPoint: 10 }), method: 'PUT', url: '/api/admin/inventory', body: { productId: 'p1', warehouseId: 'w1', qtyOnHand: 50, reorderPoint: 10 }, response: { id: 'i1' } },
  { name: 'getAuditLog (defaults)', call: (s) => s.getAuditLog(), method: 'GET', url: '/api/admin/audit-log', query: { page: '1', pageSize: '50' }, response: [{ id: 'a1' }] },
  { name: 'getAuditLog (explicit page)', call: (s) => s.getAuditLog(3, 20), method: 'GET', url: '/api/admin/audit-log', query: { page: '3', pageSize: '20' } },
];

describe('AdminService', () => {
  let service: AdminService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  describe.each(cases)('$name', (endpoint) => {
    it('sends the right method, URL, query and body, and hands back the answer', () => {
      const { request, results, errors, query } = call(service, http, endpoint);

      expect(request.request.method).toBe(endpoint.method);
      expect(query).toEqual(endpoint.query ?? {});
      expect(request.request.body).toEqual(endpoint.body ?? null);
      request.flush(endpoint.response ?? null);

      expect(results).toEqual([endpoint.response ?? null]);
      expect(errors).toEqual([]);
    });

    it.each(ERROR_STATUSES)('passes on an HTTP %i failure instead of an answer', (status) => {
      const { request, results, errors } = call(service, http, endpoint);

      fail(request, status);

      expect(results).toEqual([]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(HttpErrorResponse);
      expect(statusOf(errors[0])).toBe(status);
    });
  });

  describe('importProducts', () => {
    const file = () => new File(['sku;name'], 'produtos.csv', { type: 'text/csv' });
    const report = { dryRun: true, applied: false, rows: 2, created: 0, updated: 0, errors: [{ line: 2, message: 'SKU em branco' }] };

    it('uploads the file as multipart form data under the name "file", with no query for a real import', () => {
      service.importProducts(file(), false, '').subscribe();

      const request = http.expectOne('/api/admin/products/import');
      expect(request.request.method).toBe('POST');
      expect(request.request.params.keys()).toEqual([]);
      const body = request.request.body as FormData;
      expect(body).toBeInstanceOf(FormData);
      expect((body.get('file') as File).name).toBe('produtos.csv');
      request.flush({ ...report, dryRun: false, applied: true, errors: [] });
    });

    it('asks for a dry run and a warehouse through the query string', () => {
      service.importProducts(file(), true, 'w1').subscribe();

      const request = http.expectOne((r) => r.url === '/api/admin/products/import');
      expect(request.request.params.get('dryRun')).toBe('true');
      expect(request.request.params.get('warehouseId')).toBe('w1');
      request.flush(report);
    });

    it('hands back the report of a successful import', () => {
      const results: unknown[] = [];
      const applied = { dryRun: false, applied: true, rows: 2, created: 1, updated: 1, errors: [] };

      service.importProducts(file(), false, '').subscribe((value) => results.push(value));
      http.expectOne('/api/admin/products/import').flush(applied);

      expect(results).toEqual([applied]);
    });

    it('turns a 400 whose body is a report into the report (a result to show, not a failure)', () => {
      const results: unknown[] = [];
      const errors: unknown[] = [];

      service.importProducts(file(), true, '').subscribe({ next: (v) => results.push(v), error: (e: unknown) => errors.push(e) });
      http.expectOne((r) => r.url === '/api/admin/products/import').flush(report, { status: 400, statusText: 'Bad Request' });

      expect(results).toEqual([report]);
      expect(errors).toEqual([]);
    });

    it.each([0, 401, 403, 404, 500])('keeps an HTTP %i as an error', (status) => {
      const results: unknown[] = [];
      const errors: unknown[] = [];

      service.importProducts(file(), false, '').subscribe({ next: (v) => results.push(v), error: (e: unknown) => errors.push(e) });
      fail(http.expectOne('/api/admin/products/import'), status);

      expect(results).toEqual([]);
      expect(statusOf(errors[0])).toBe(status);
    });

    it('keeps a 400 without a report (no "errors" list) as an error', () => {
      const results: unknown[] = [];
      const errors: unknown[] = [];

      service.importProducts(file(), false, '').subscribe({ next: (v) => results.push(v), error: (e: unknown) => errors.push(e) });
      http.expectOne('/api/admin/products/import').flush({ title: 'Arquivo inválido' }, { status: 400, statusText: 'Bad Request' });

      expect(results).toEqual([]);
      expect(statusOf(errors[0])).toBe(400);
    });
  });

  describe('getAuditPage', () => {
    const entries = [{ id: 'a1' }, { id: 'a2' }];

    function page(pageNumber: number, pageSize: number, headers: Record<string, string>, body: unknown[]) {
      const results: { entries: unknown[]; totalCount: number; page: number }[] = [];
      service.getAuditPage(pageNumber, pageSize).subscribe((value) => results.push(value));
      const request = http.expectOne((r) => r.url === '/api/admin/audit-log');
      expect(request.request.method).toBe('GET');
      expect(request.request.params.get('page')).toBe(String(pageNumber));
      expect(request.request.params.get('pageSize')).toBe(String(pageSize));
      request.flush(body, { headers });
      return results[0];
    }

    it('reads the size of the whole log from X-Total-Count', () => {
      expect(page(2, 2, { 'X-Total-Count': '37' }, entries)).toEqual({ entries, totalCount: 37, page: 2 });
    });

    it('accepts a total of 0 for an empty log', () => {
      expect(page(1, 50, { 'X-Total-Count': '0' }, [])).toEqual({ entries: [], totalCount: 0, page: 1 });
    });

    it('offers one more page after a full one when a proxy strips the header', () => {
      expect(page(2, 2, {}, entries).totalCount).toBe(2 + 2 + 1);
    });

    it('knows the log ends with a short page when the header is missing', () => {
      expect(page(3, 5, {}, [{ id: 'a1' }]).totalCount).toBe(2 * 5 + 1);
    });

    it.each(['abc', '-4'])('does not trust a bad header (%s)', (value) => {
      expect(page(1, 2, { 'X-Total-Count': value }, entries).totalCount).toBe(3);
    });

    it('treats a missing body as an empty page', () => {
      expect(page(1, 50, { 'X-Total-Count': '0' }, null as never).entries).toEqual([]);
    });

    it.each([0, 400, 401, 403, 404, 500])('passes on an HTTP %i failure', (status) => {
      const results: unknown[] = [];
      const errors: unknown[] = [];

      service.getAuditPage(1, 50).subscribe({ next: (v) => results.push(v), error: (e: unknown) => errors.push(e) });
      fail(http.expectOne((r) => r.url === '/api/admin/audit-log'), status);

      expect(results).toEqual([]);
      expect(statusOf(errors[0])).toBe(status);
    });
  });
});
