import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ERROR_STATUSES, EndpointCase, call, fail, statusOf } from '../../../core/http/testing/http-testing';
import { QuotesService } from './quotes.service';

const cases: EndpointCase<QuotesService>[] = [
  {
    name: 'createQuote',
    call: (s) => s.createQuote({ lineItems: [{ productId: 'p1', qty: 3 }], deliveryAddressKey: 'k1' }),
    method: 'POST',
    url: '/api/quotes',
    body: { lineItems: [{ productId: 'p1', qty: 3 }], deliveryAddressKey: 'k1' },
    response: { id: 'q1', status: 'Requested' },
  },
  { name: 'changeDeliveryAddress', call: (s) => s.changeDeliveryAddress(123, 'k1'), method: 'PUT', url: '/api/quotes/123/delivery-address', body: { deliveryAddressKey: 'k1' }, response: { id: 'q1' } },
  { name: 'getMine', call: (s) => s.getMine(), method: 'GET', url: '/api/quotes/mine', response: [{ id: 'q1' }] },
  { name: 'reject', call: (s) => s.reject('q1'), method: 'POST', url: '/api/quotes/q1/reject', body: {}, response: { id: 'q1', status: 'Rejected' } },
  { name: 'accept', call: (s) => s.accept('q1'), method: 'POST', url: '/api/quotes/q1/accept', body: {}, response: { id: 'o1', status: 'Confirmed' } },
];

describe('QuotesService', () => {
  let service: QuotesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(QuotesService);
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
