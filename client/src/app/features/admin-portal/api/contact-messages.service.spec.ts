import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ERROR_STATUSES, EndpointCase, call, fail, statusOf } from '../../../core/http/testing/http-testing';
import { ContactMessagesService } from './contact-messages.service';

const cases: EndpointCase<ContactMessagesService>[] = [
  { name: 'handle', call: (s) => s.handle('m1'), method: 'POST', url: '/api/admin/contact-messages/m1/handle', body: {} },
];

describe('ContactMessagesService', () => {
  let service: ContactMessagesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ContactMessagesService);
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

  it('escapes the id so it cannot change the path', () => {
    service.handle('a/b?c').subscribe();

    const request = http.expectOne((r) => r.url.startsWith('/api/admin/contact-messages/'));
    expect(request.request.url).toBe('/api/admin/contact-messages/a%2Fb%3Fc/handle');
    request.flush(null);
  });

  it('reports a message another admin handled first (409) as an error', () => {
    const errors: unknown[] = [];

    service.handle('m1').subscribe({ error: (failure: unknown) => errors.push(failure) });
    http.expectOne('/api/admin/contact-messages/m1/handle').flush({ title: 'handled' }, { status: 409, statusText: 'Conflict' });

    expect(statusOf(errors[0])).toBe(409);
  });
});
