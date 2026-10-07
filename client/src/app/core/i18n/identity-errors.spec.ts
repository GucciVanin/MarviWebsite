import { PT } from './pt-br';
import { translateIdentityErrors } from './identity-errors';

describe('translateIdentityErrors', () => {
  it('translates the Identity password and email messages the API passes through', () => {
    const text = translateIdentityErrors([
      'Passwords must be at least 6 characters.',
      "Passwords must have at least one digit ('0'-'9').",
      "Email 'a@b.com' is already taken.",
    ]);
    expect(text).toContain('pelo menos 6 caracteres');
    expect(text).toContain('pelo menos um número');
    expect(text).toContain('Já existe uma conta');
    expect(text).not.toMatch(/Passwords|already taken/);
  });

  it('never shows an unrecognised English message', () => {
    expect(translateIdentityErrors(['Something the server invented.'])).toBe(
      PT.auth.registerFailed,
    );
  });

  it('falls back to the generic message when there is no error list', () => {
    expect(translateIdentityErrors(null)).toBe(PT.auth.registerFailed);
    expect(translateIdentityErrors([])).toBe(PT.auth.registerFailed);
  });

  it('does not repeat the same sentence', () => {
    const text = translateIdentityErrors([
      'Passwords must have at least one uppercase',
      'Passwords must have at least one uppercase',
    ]);
    expect(text.match(/maiúscula/g)).toHaveLength(1);
  });
});
