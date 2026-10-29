import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ERROR_STATUSES, EndpointCase, call, fail, statusOf } from '../../../core/http/testing/http-testing';
import { ProfileService } from './profile.service';

const cases: EndpointCase<ProfileService>[] = [
  { name: 'get', call: (s) => s.get(), method: 'GET', url: '/api/client/profile', response: { id: 'c1', companyName: 'Bar do Zé' } },
  {
    name: 'update',
    call: (s) => s.update({ companyName: 'Bar do Zé', billingAddress: 'Rua B, 2', shippingAddresses: ['Rua C, 3'] }),
    method: 'PUT',
    url: '/api/client/profile',
    body: { companyName: 'Bar do Zé', billingAddress: 'Rua B, 2', shippingAddresses: ['Rua C, 3'] },
    response: { id: 'c1', companyName: 'Bar do Zé' },
  },
];

describe('ProfileService', () => {
  let service: ProfileService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ProfileService);
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
