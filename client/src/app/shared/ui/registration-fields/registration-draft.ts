import { computed, signal } from '@angular/core';
import { PT } from '../../../core/i18n/pt-br';
import { cnpjCharacters, cpfDigits, isAdult, isValidCnpj, isValidCpf, maskCnae, maskCnpj, maskCpf, maskPhone, todayInBrazil } from '../../format/registration';
import type { FieldProblem } from '../../../core/http/api-error';
import type { AccountType, Registration, RegistrationRequest, StateRegistrationStatus, TaxRegime } from '../../models/registration.model';

/** The server's limits (RegistrationRules), checked here too so the customer is told in pt-BR before anything is sent. */
export const REGISTRATION_LIMITS = { name: 200, legalName: 200, tradeName: 200, municipal: 30, contact: 120, email: 200, ie: 14 } as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The text being typed into the registration data of an account (MRV-9.4): the account type, the display name and the fields of the type. Signals,
 * not plain fields: the app is zoneless, so only signal writes re-render. `compact` is the registration page's short form (only the essentials);
 * the profile and the admin editor use the full one. The CPF is never loaded back (the API sends it masked): `hasCpf` says one is stored, and
 * leaving the field empty keeps it.
 */
export class RegistrationDraft {
  readonly type = signal<AccountType | null>(null);
  readonly name = signal('');
  readonly phone = signal('');
  readonly invoiceEmail = signal('');
  readonly cnpj = signal('');
  readonly legalName = signal('');
  readonly tradeName = signal('');
  readonly ieStatus = signal<StateRegistrationStatus | ''>('');
  readonly ie = signal('');
  readonly municipal = signal('');
  readonly cnae = signal('');
  readonly regime = signal<TaxRegime | ''>('');
  readonly opening = signal('');
  readonly contact = signal('');
  readonly cpf = signal('');
  readonly birth = signal('');
  /** A CPF is already stored, so an empty CPF field means "keep it". */
  readonly hasCpf = signal(false);
  /** The stored CPF as the API sends it (`***.444.777-**`), only ever shown as the current value; the full number is never in the page. */
  readonly cpfMasked = signal<string | null>(null);

  constructor(readonly compact = false, private readonly today: () => string = todayInBrazil) {}

  /** What the server said was wrong, by field (the last refused save). Shown next to the field until the next attempt; they never block `canSubmit`. */
  private readonly fromServer = signal<Record<string, string>>({});

  /** The fields that have a message under them; a server problem for any other field goes in the form's alert. */
  private static readonly SHOWN = ['name', 'legalName', 'tradeName', 'municipalRegistration', 'contactName', 'cnpj', 'cpf', 'birthDate', 'phone', 'invoiceEmail', 'mainCnae', 'openingDate', 'stateRegistration'];

  /**
   * Remembers the server's problems so each shows next to its control. Returns the messages that have no control to sit under (for example the one about
   * company fields on a personal account), which the caller puts in its alert. Pass an empty list to forget them.
   */
  setServerProblems(list: readonly FieldProblem[]): string[] {
    const shown: Record<string, string> = {};
    const loose: string[] = [];
    for (const problem of list) {
      const field = problem.field === 'companyName' ? 'name' : problem.field;
      if (RegistrationDraft.SHOWN.includes(field) && !(field in shown)) shown[field] = problem.message;
      else loose.push(problem.message);
    }
    this.fromServer.set(shown);
    return loose;
  }

  /** What is wrong with what is typed, by field, in pt-BR, plus what the server said about the last attempt. Empty required fields are not problems while typing (see `complete`). */
  readonly problems = computed<Record<string, string>>(() => ({ ...this.fromServer(), ...this.clientProblems() }));

  private readonly clientProblems = computed<Record<string, string>>(() => {
    const t = PT.registration.problems;
    const found: Record<string, string> = {};
    const today = this.today();
    const phoneDigits = this.phone().replace(/\D/g, '');
    if (phoneDigits.length > 0 && (phoneDigits.length < 10 || phoneDigits.length > 11)) found['phone'] = t.phone;
    if (this.invoiceEmail().trim() !== '' && !EMAIL.test(this.invoiceEmail().trim())) found['invoiceEmail'] = t.email;
    if (this.type() === 'Business') {
      if (cnpjCharacters(this.cnpj()).length > 0 && !isValidCnpj(this.cnpj())) found['cnpj'] = t.cnpj;
      const cnae = this.cnae().replace(/\D/g, '');
      if (cnae.length > 0 && cnae.length !== 7) found['mainCnae'] = t.cnae;
      if (this.ieStatus() === 'Contributor' && (this.ie().replace(/[.\-/\s]/g, '').length < 2)) found['stateRegistration'] = t.ie;
      if (this.opening() !== '' && this.opening() > today) found['openingDate'] = t.opening;
    } else if (this.type() === 'Personal') {
      if (cpfDigits(this.cpf()).length > 0 && !isValidCpf(this.cpf())) found['cpf'] = t.cpf;
      const birth = this.birth();
      if (birth !== '') {
        if (birth > today || birth < '1900-01-01') found['birthDate'] = t.birthInvalid;
        else if (!isAdult(birth, today)) found['birthDate'] = t.minor;
      }
    }
    return found;
  });

  /** Every required part is filled in: a type, a name and, for a person, a CPF (or the stored one) and a birth date. */
  readonly complete = computed(() => {
    const type = this.type();
    if (type === null || this.name().trim() === '') return false;
    return type === 'Business' || ((this.cpf() !== '' || this.hasCpf()) && this.birth() !== '');
  });

  readonly canSubmit = computed(() => this.complete() && Object.keys(this.clientProblems()).length === 0);

  /** Fills the draft from the saved profile (the CPF stays empty: the API sends it masked). */
  load(name: string, registration: Registration): void {
    this.type.set(registration.accountType);
    this.name.set(name);
    this.phone.set(maskPhone(registration.phone));
    this.invoiceEmail.set(registration.invoiceEmail ?? '');
    this.cnpj.set(maskCnpj(registration.cnpj));
    this.legalName.set(registration.legalName ?? '');
    this.tradeName.set(registration.tradeName ?? '');
    this.ieStatus.set(registration.stateRegistrationStatus ?? '');
    this.ie.set(registration.stateRegistration ?? '');
    this.municipal.set(registration.municipalRegistration ?? '');
    this.cnae.set(maskCnae(registration.mainCnae));
    this.regime.set(registration.taxRegime ?? '');
    this.opening.set(registration.openingDate ?? '');
    this.contact.set(registration.contactName ?? '');
    this.cpf.set('');
    this.birth.set(registration.birthDate ?? '');
    this.hasCpf.set(registration.hasCpf);
    this.cpfMasked.set(registration.cpfMasked);
  }

  /** What is typed, trimmed, as the API wants it: only the fields of the chosen type. In the compact form only the essentials are sent. */
  request(): RegistrationRequest {
    const optional = (text: string) => (text.trim() === '' ? null : text.trim());
    const common = this.compact ? {} : { phone: optional(this.phone()), invoiceEmail: optional(this.invoiceEmail()) };
    if (this.type() === 'Personal') {
      return { ...common, cpf: this.cpf() === '' ? null : cpfDigits(this.cpf()), birthDate: optional(this.birth()) };
    }
    const cnpj = cnpjCharacters(this.cnpj());
    if (this.compact) {
      return { cnpj: cnpj === '' ? null : cnpj };
    }
    const status = this.ieStatus();
    const regime = this.regime();
    const contributor = status === 'Contributor';
    return {
      ...common,
      cnpj: cnpj === '' ? null : cnpj,
      legalName: optional(this.legalName()),
      tradeName: optional(this.tradeName()),
      stateRegistrationStatus: status === '' ? null : status,
      stateRegistration: contributor ? optional(this.ie()) : null,
      municipalRegistration: optional(this.municipal()),
      mainCnae: optional(this.cnae().replace(/\D/g, '')),
      taxRegime: regime === '' ? null : regime,
      openingDate: optional(this.opening()),
      contactName: optional(this.contact()),
    };
  }

  setCnpj(text: string): void {
    this.cnpj.set(maskCnpj(text));
  }

  setCpf(text: string): void {
    this.cpf.set(maskCpf(text));
  }

  setPhone(text: string): void {
    this.phone.set(maskPhone(text));
  }

  setCnae(text: string): void {
    this.cnae.set(maskCnae(text));
  }

  /** Choosing another type forgets the first type's fields, so nothing of the other type is ever sent. */
  chooseType(type: AccountType): void {
    if (this.type() === type) return;
    this.type.set(type);
    for (const field of [this.cnpj, this.legalName, this.tradeName, this.ie, this.municipal, this.cnae, this.opening, this.contact, this.cpf, this.birth]) field.set('');
    this.ieStatus.set('');
    this.regime.set('');
  }

  setIeStatus(status: StateRegistrationStatus | ''): void {
    this.ieStatus.set(status);
    if (status !== 'Contributor') this.ie.set('');
  }
}
