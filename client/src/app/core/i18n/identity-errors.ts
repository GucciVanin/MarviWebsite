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

// The registration data rules (MRV-9.4) answer in pt-BR already, naming the field ("CNPJ inválido: ...", "CPF já cadastrado."); every other message is
// English, and carries no accented letter. A known English message is mapped above; a message with accents is the server's own pt-BR text and is kept.
const PORTUGUESE = /[à-úÀ-Ú]/;

export function translateIdentityErrors(messages: unknown): string {
  if (!Array.isArray(messages) || messages.length === 0) {
    return PT.auth.registerFailed;
  }
  const translated = messages.map((item) => {
    // A registration-data problem arrives as { field, message } (MRV-9.4); anything else is a plain string.
    const message = item && typeof item === 'object' && 'message' in item ? String((item as { message: unknown }).message) : String(item);
    return KNOWN.find(([pattern]) => pattern.test(message))?.[1] ?? (PORTUGUESE.test(message) ? message : PT.auth.registerFailed);
  });
  return [...new Set(translated)].join(' ');
}
