// Test helpers for the API services (imported only by *.spec.ts files, so they never reach the production bundle).
// No test globals here: the app's tsconfig compiles this file without the vitest types.
import { HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { Observable } from 'rxjs';

/** Every kind of failure a screen has to cope with: no network, bad input, signed out, forbidden, missing, server down. */
export const ERROR_STATUSES: readonly number[] = [0, 400, 401, 403, 404, 500];

/** One endpoint of a service: what calling the method must send, and what the answer must turn into. */
export interface EndpointCase<S> {
  name: string;
  call: (service: S) => Observable<unknown>;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** The URL without its query string. */
  url: string;
  /** The query string the call must produce (every key, nothing else). */
  query?: Record<string, string>;
  /** The request body; absent means no body. */
  body?: unknown;
  /** What the API answers with; absent means an empty 200. */
  response?: unknown;
}

/** Answers a request with the given failure: status 0 is a network error, anything else an HTTP error with a problem body. */
export function fail(request: TestRequest, status: number): void {
  if (status === 0) {
    request.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
  } else {
    request.flush({ title: `failure ${status}` }, { status, statusText: `Failure ${status}` });
  }
}

/** Calls the method and returns the request it made together with everything the observable emitted. */
export function call<S>(service: S, http: HttpTestingController, endpoint: EndpointCase<S>) {
  const results: unknown[] = [];
  const errors: unknown[] = [];
  endpoint.call(service).subscribe({ next: (value) => results.push(value), error: (failure: unknown) => errors.push(failure) });
  const request = http.expectOne((r) => r.url === endpoint.url);
  const query: Record<string, string | null> = {};
  for (const key of request.request.params.keys()) {
    query[key] = request.request.params.get(key);
  }
  return { request, results, errors, query };
}

export function statusOf(failure: unknown): number | null {
  return failure instanceof HttpErrorResponse ? failure.status : null;
}
