import { HttpErrorResponse } from '@angular/common/http';
import { PT } from '../i18n/pt-br';

/** A failed request as the UI shows it: a pt-BR message chosen by HTTP status, plus the server's own text as detail. */
export interface ApiError {
  status: number;
  message: string;
  detail: string | null;
  /** The problems the server named by field (`[{ field, message }]`, MRV-9.4), so a form can show each next to its control. */
  fields?: FieldProblem[];
}

export interface FieldProblem {
  field: string;
  message: string;
}

/** The `[{ field, message }]` list the API answers a registration-data 400 with; null for any other body. */
export function fieldProblems(body: unknown): FieldProblem[] | null {
  if (!Array.isArray(body) || body.length === 0) {
    return null;
  }
  const found = body.filter((item): item is FieldProblem => !!item && typeof item === 'object' && typeof item.field === 'string' && typeof item.message === 'string');
  return found.length === body.length ? found : null;
}

function serverText(body: unknown): string | null {
  if (typeof body === 'string') {
    return body.trim() || null;
  }
  if (body && typeof body === 'object') {
    const { title, message } = body as { title?: unknown; message?: unknown };
    const text = typeof title === 'string' ? title : typeof message === 'string' ? message : null;
    return text?.trim() || null;
  }
  return null;
}

function messageFor(status: number): string {
  if (status === 0) return PT.errors.network;
  if (status === 400) return PT.errors.badRequest;
  if (status === 403) return PT.errors.forbidden;
  if (status === 404) return PT.errors.notFound;
  if (status === 409) return PT.errors.conflict;
  if (status >= 500) return PT.errors.server;
  return PT.errors.generic;
}

/** True when `error` is an HTTP failure with one of the given statuses (e.g. 400/401 for rejected credentials). */
export function hasStatus(error: unknown, ...statuses: number[]): boolean {
  return error instanceof HttpErrorResponse && statuses.includes(error.status);
}

export function describeApiError(error: unknown): ApiError {
  if (!(error instanceof HttpErrorResponse)) {
    return { status: 0, message: PT.errors.generic, detail: null };
  }
  const fields = error.status === 0 ? null : fieldProblems(error.error);
  return {
    status: error.status,
    message: messageFor(error.status),
    // No server text on a network failure: the "body" is a browser event, not something to show.
    detail: error.status === 0 ? null : fields ? fields.map((p) => p.message).join(' ') : serverText(error.error),
    ...(fields ? { fields } : {}),
  };
}
