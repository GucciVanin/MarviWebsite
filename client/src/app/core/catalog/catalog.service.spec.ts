import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ERROR_STATUSES, EndpointCase, call, fail, statusOf } from '../http/testing/http-testing';
import { CatalogService } from './catalog.service';

const cases: EndpointCase<CatalogService>[] = [
  { name: 'getProducts (everything)', call: (s) => s.getProducts(), method: 'GET', url: '/api/products', response: [{ id: 'p1', sku: 'A1' }] },
  { name: 'getProducts (one category)', call: (s) => s.getProducts('c1'), method: 'GET', url: '/api/products', query: { category: 'c1' } },
  { name: 'getProducts (search is trimmed)', call: (s) => s.getProducts(undefined, '  cerveja '), method: 'GET', url: '/api/products', query: { search: 'cerveja' } },
  { name: 'getProducts (blank search is left out)', call: (s) => s.getProducts(undefined, '   '), method: 'GET', url: '/api/products' },
  { name: 'getProducts (empty category is left out)', call: (s) => s.getProducts('', 'lata'), method: 'GET', url: '/api/products', query: { search: 'lata' } },
  { name: 'getProducts (category and search)', call: (s) => s.getProducts('c1', 'lata'), method: 'GET', url: '/api/products', query: { category: 'c1', search: 'lata' } },
  { name: 'getCategories', call: (s) => s.getCategories(), method: 'GET', url: '/api/categories', response: [{ id: 'c1', name: 'Cervejas' }] },
];

describe('CatalogService', () => {
  let service: CatalogService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(CatalogService);
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
});
