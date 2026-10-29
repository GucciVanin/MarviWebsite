import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ERROR_STATUSES, fail } from '../../../core/http/testing/http-testing';
import { PendingActions, PendingActionsService } from './pending-actions.service';

const URL = '/api/admin/pending-actions';
const group = { count: 0, items: [] };
const pending = (total: number): PendingActions => ({
  total,
  customers: { count: total, items: [] },
  quotes: group,
  lowStock: group,
  unpricedProducts: group,
  unstockedProducts: group,
  contactMessages: group,
});

describe('PendingActionsService', () => {
  let service: PendingActionsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(PendingActionsService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('knows nothing, and asks for nothing, until someone refreshes', () => {
    expect(service.pending.data()).toBeNull();
    expect(service.pending.loaded()).toBe(false);
    expect(service.total()).toBeNull();
    http.expectNone(URL);
  });

  it('refresh() reads the pending actions with a GET and exposes the total', () => {
    service.refresh();
    expect(service.pending.loading()).toBe(true);

    const request = http.expectOne(URL);
    expect(request.request.method).toBe('GET');
    request.flush(pending(7));

    expect(service.pending.data()?.total).toBe(7);
    expect(service.total()).toBe(7);
    expect(service.pending.loading()).toBe(false);
    expect(service.pending.loaded()).toBe(true);
  });

  it('skips a plain refresh while a request is already on its way', () => {
    service.refresh();
    service.refresh();

    http.expectOne(URL).flush(pending(1));
  });

  it('asks again after the first answer arrived', () => {
    service.refresh();
    http.expectOne(URL).flush(pending(1));

    service.refresh();
    http.expectOne(URL).flush(pending(2));

    expect(service.total()).toBe(2);
  });

  it('force makes a new request even while one is on its way, and the newer answer wins', () => {
    service.refresh();
    service.refresh(true);

    const [older, newer] = http.match(URL);
    newer.flush(pending(5));
    older.flush(pending(9));

    expect(service.total()).toBe(5);
  });

  it.each(ERROR_STATUSES)('shows an HTTP %i as an error and keeps the last good numbers', (status) => {
    service.refresh();
    http.expectOne(URL).flush(pending(3));

    service.refresh();
    fail(http.expectOne(URL), status);

    expect(service.pending.error()?.status).toBe(status);
    expect(service.pending.loading()).toBe(false);
    expect(service.total()).toBe(3);
  });

  it('forgets an old failure when it asks again', () => {
    service.refresh();
    fail(http.expectOne(URL), 500);
    expect(service.pending.error()).not.toBeNull();

    service.refresh();
    expect(service.pending.error()).toBeNull();
    http.expectOne(URL).flush(pending(0));

    expect(service.total()).toBe(0);
  });
});
