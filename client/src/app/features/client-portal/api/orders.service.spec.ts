import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ERROR_STATUSES, EndpointCase, call, fail, statusOf } from '../../../core/http/testing/http-testing';
import { OrdersService } from './orders.service';

const cases: EndpointCase<OrdersService>[] = [
  { name: 'getMine', call: (s) => s.getMine(), method: 'GET', url: '/api/orders/mine', response: [{ id: 'o1', status: 'Confirmed' }] },
  { name: 'getMine (none yet)', call: (s) => s.getMine(), method: 'GET', url: '/api/orders/mine', response: [] },
];

describe('OrdersService', () => {
  let service: OrdersService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(OrdersService);
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
