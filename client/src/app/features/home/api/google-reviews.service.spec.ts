import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ERROR_STATUSES, EndpointCase, call, fail, statusOf } from '../../../core/http/testing/http-testing';
import { GoogleReviewsService } from './google-reviews.service';

const cases: EndpointCase<GoogleReviewsService>[] = [
  {
    name: 'get',
    call: (s) => s.get(),
    method: 'GET',
    url: '/api/public/reviews',
    response: { rating: 4.7, count: 31, profileUrl: 'https://www.google.com/maps/place/x', reviews: [] },
  },
];

describe('GoogleReviewsService', () => {
  let service: GoogleReviewsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(GoogleReviewsService);
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

  it('emits null when the API has nothing to show (204)', () => {
    const results: unknown[] = [];

    service.get().subscribe((value) => results.push(value));
    http.expectOne('/api/public/reviews').flush(null, { status: 204, statusText: 'No Content' });

    expect(results).toEqual([null]);
  });
});
