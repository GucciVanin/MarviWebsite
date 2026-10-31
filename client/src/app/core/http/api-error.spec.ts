import { HttpErrorResponse } from '@angular/common/http';
import { PT } from '../i18n/pt-br';
import { describeApiError, hasStatus, fieldProblems } from './api-error';

const failure = (status: number, error: unknown = null) => new HttpErrorResponse({ status, error });

describe('describeApiError', () => {
  it.each([
    [0, PT.errors.network],
    [400, PT.errors.badRequest],
    [403, PT.errors.forbidden],
    [404, PT.errors.notFound],
    [409, PT.errors.conflict],
    [500, PT.errors.server],
    [502, PT.errors.server],
    [503, PT.errors.server],
    [401, PT.errors.generic],
    [418, PT.errors.generic],
    [422, PT.errors.generic],
  ])('chooses the pt-BR message for HTTP %i', (status, message) => {
    const described = describeApiError(failure(status));

    expect(described.status).toBe(status);
    expect(described.message).toBe(message);
  });

  it('is generic, with status 0 and no detail, for something that is not an HTTP failure', () => {
    for (const thing of [new Error('boom'), 'text', null, undefined, { status: 500 }]) {
      expect(describeApiError(thing)).toEqual({ status: 0, message: PT.errors.generic, detail: null });
    }
  });

  describe('detail', () => {
    it('is the text body of the answer, trimmed', () => {
      expect(describeApiError(failure(409, '  SKU duplicado  ')).detail).toBe('SKU duplicado');
    });

    it('is the title of a problem-details body', () => {
      expect(describeApiError(failure(400, { title: 'Dados inválidos' })).detail).toBe('Dados inválidos');
    });

    it('is the message of a body that has no title', () => {
      expect(describeApiError(failure(400, { message: 'Senha fraca' })).detail).toBe('Senha fraca');
    });

    it('prefers the title over the message', () => {
      expect(describeApiError(failure(400, { title: 'T', message: 'M' })).detail).toBe('T');
    });

    it.each([
      ['an empty string', ''],
      ['a blank string', '   '],
      ['no body', null],
      ['a body of another type', 42],
      ['an object without text', { errors: ['x'] }],
      ['an object whose title is not text', { title: 5 }],
      ['a blank title', { title: '  ' }],
    ])('is null for %s', (_label, body) => {
      expect(describeApiError(failure(400, body)).detail).toBeNull();
    });

    it('is never shown for a network failure, whatever the browser event holds', () => {
      expect(describeApiError(failure(0, 'ProgressEvent')).detail).toBeNull();
      expect(describeApiError(failure(0, { message: 'Http failure response: 0' })).detail).toBeNull();
    });
  });
});

describe('hasStatus', () => {
  it('is true when the HTTP failure has one of the statuses', () => {
    expect(hasStatus(failure(401), 400, 401)).toBe(true);
    expect(hasStatus(failure(400), 400, 401)).toBe(true);
  });

  it('is false for another status or without statuses', () => {
    expect(hasStatus(failure(500), 400, 401)).toBe(false);
    expect(hasStatus(failure(400))).toBe(false);
  });

  it('is false for anything that is not an HTTP failure', () => {
    expect(hasStatus(new Error('x'), 0)).toBe(false);
    expect(hasStatus({ status: 401 }, 401)).toBe(false);
    expect(hasStatus(null, 0)).toBe(false);
  });
});

describe('field problems (MRV-9.4)', () => {
  it('reads a list of { field, message } and makes its messages the detail', () => {
    const error = new HttpErrorResponse({ status: 400, error: [{ field: 'cnpj', message: 'CNPJ inválido.' }, { field: 'phone', message: 'Telefone inválido.' }] });

    const described = describeApiError(error);

    expect(described.fields).toEqual([{ field: 'cnpj', message: 'CNPJ inválido.' }, { field: 'phone', message: 'Telefone inválido.' }]);
    expect(described.detail).toBe('CNPJ inválido. Telefone inválido.');
  });

  it('leaves any other body alone', () => {
    expect(fieldProblems(['a string'])).toBeNull();
    expect(fieldProblems([{ field: 'x' }])).toBeNull();
    expect(fieldProblems([])).toBeNull();
    expect(fieldProblems('text')).toBeNull();
    expect(describeApiError(new HttpErrorResponse({ status: 400, error: 'plain' })).fields).toBeUndefined();
  });
});
