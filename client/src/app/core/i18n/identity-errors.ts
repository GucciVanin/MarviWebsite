import { PT } from './pt-br';

// ASP.NET Identity returns its validation messages in English (AuthController passes them through). The UI is pt-BR
// only, so known messages are mapped here; anything unrecognised falls back to the generic registration message.
const KNOWN: [RegExp, string][] = [
  [/at least \d+ characters/i, 'A senha deve ter pelo menos 6 caracteres.'],
  [/non[ -]?alphanumeric/i, 'A senha deve ter pelo menos um caractere especial.'],
  [/at least one digit/i, 'A senha deve ter pelo menos um número.'],
  [/at least one uppercase/i, 'A senha deve ter pelo menos uma letra maiúscula.'],
  [/at least one lowercase/i, 'A senha deve ter pelo menos uma letra minúscula.'],
  [/already taken/i, 'Já existe uma conta com este e-mail.'],
  [/invalid.*email|email.*invalid/i, 'Informe um e-mail válido.'],
];

export function translateIdentityErrors(messages: unknown): string {
  if (!Array.isArray(messages) || messages.length === 0) {
    return PT.auth.registerFailed;
  }
  const translated = messages.map(
    (message) => KNOWN.find(([pattern]) => pattern.test(String(message)))?.[1] ?? PT.auth.registerFailed,
  );
  return [...new Set(translated)].join(' ');
}
