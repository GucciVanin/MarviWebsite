// Test helper (imported only by *.spec.ts files, so it never reaches the production bundle).
// Must match the claim name the API really issues (see AuthController / auth.service.ts).
const ROLE_CLAIM = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

/** Builds an unsigned JWT; the client only decodes the payload (the API is the real security boundary). */
export function fakeToken(role: string, expiresInSeconds = 3600): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return `${encode({ alg: 'none' })}.${encode({ [ROLE_CLAIM]: role, exp })}.sig`;
}
