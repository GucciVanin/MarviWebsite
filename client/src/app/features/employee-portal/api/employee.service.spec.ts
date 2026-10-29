import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ERROR_STATUSES, EndpointCase, call, fail, statusOf } from '../../../core/http/testing/http-testing';
import { EmployeeService } from './employee.service';

const cases: EndpointCase<EmployeeService>[] = [
  { name: 'getQuoteQueue (all)', call: (s) => s.getQuoteQueue(), method: 'GET', url: '/api/employee/quotes/queue', response: [{ id: 'q1' }] },
  { name: 'getQuoteQueue (by status)', call: (s) => s.getQuoteQueue('Submitted'), method: 'GET', url: '/api/employee/quotes/queue', query: { status: 'Submitted' } },
  {
    name: 'priceQuote',
    call: (s) => s.priceQuote('q1', { lineItems: [{ lineItemId: 'l1', finalUnitPrice: 12.5 }] }),
    method: 'PUT',
    url: '/api/employee/quotes/q1/price',
    body: { lineItems: [{ lineItemId: 'l1', finalUnitPrice: 12.5 }] },
    response: { id: 'q1', status: 'Priced' },
  },
  {
    name: 'createOrder',
    call: (s) => s.createOrder({ clientId: 'c1', deliveryAddress: 'Rua A, 1', lineItems: [{ productId: 'p1', qty: 2 }] }),
    method: 'POST',
    url: '/api/employee/orders',
    body: { clientId: 'c1', deliveryAddress: 'Rua A, 1', lineItems: [{ productId: 'p1', qty: 2 }] },
    response: { id: 'o1' },
  },
  { name: 'getInventory (all warehouses)', call: (s) => s.getInventory(), method: 'GET', url: '/api/employee/inventory', response: [{ id: 'i1' }] },
  { name: 'getInventory (one warehouse)', call: (s) => s.getInventory('w1'), method: 'GET', url: '/api/employee/inventory', query: { warehouseId: 'w1' } },
  {
    name: 'searchClients',
    call: (s) => s.searchClients('bar'),
    method: 'GET',
    url: '/api/employee/clients',
    query: { search: 'bar', pageSize: '10' },
    response: { items: [], page: 1, pageSize: 10, totalCount: 0 },
  },
  { name: 'searchClients (empty text lists everyone)', call: (s) => s.searchClients(''), method: 'GET', url: '/api/employee/clients', query: { search: '', pageSize: '10' } },
  {
    name: 'getQuoteHistory (page only)',
    call: (s) => s.getQuoteHistory({ page: 2, pageSize: 20 }),
    method: 'GET',
    url: '/api/employee/quotes/history',
    query: { page: '2', pageSize: '20' },
  },
  {
    name: 'getQuoteHistory (every filter)',
    call: (s) => s.getQuoteHistory({ clientId: 'c1', status: 'Priced', from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00Z', page: 1, pageSize: 20 }),
    method: 'GET',
    url: '/api/employee/quotes/history',
    query: { clientId: 'c1', status: 'Priced', from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00Z', page: '1', pageSize: '20' },
  },
  {
    name: 'getQuoteHistory (empty filters are left out)',
    call: (s) => s.getQuoteHistory({ clientId: '', status: '', from: '', to: '', page: 1, pageSize: 5 }),
    method: 'GET',
    url: '/api/employee/quotes/history',
    query: { page: '1', pageSize: '5' },
  },
  {
    name: 'getOrderHistory (every filter)',
    call: (s) => s.getOrderHistory({ clientId: 'c1', status: 'Confirmed', from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00Z', page: 3, pageSize: 10 }),
    method: 'GET',
    url: '/api/employee/orders/history',
    query: { clientId: 'c1', status: 'Confirmed', from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00Z', page: '3', pageSize: '10' },
    response: { items: [], page: 3, pageSize: 10, totalCount: 0 },
  },
  { name: 'getClient', call: (s) => s.getClient('c1'), method: 'GET', url: '/api/employee/clients/c1', response: { id: 'c1', companyName: 'Bar do Zé' } },
];

describe('EmployeeService', () => {
  let service: EmployeeService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(EmployeeService);
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
