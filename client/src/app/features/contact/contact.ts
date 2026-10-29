import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, throwError } from 'rxjs';
import { CONTACT_INFO, CONTACT_PLACEHOLDER, contactLinks } from '../../core/contact/contact-info';
import { action } from '../../core/http/action';
import { ApiError } from '../../core/http/api-error';
import { PT } from '../../core/i18n/pt-br';
import { AppIcon } from '../../shared/ui/app-icon/app-icon';
import { ErrorAlert } from '../../shared/ui/error-alert/error-alert';
import { ContactService } from './contact.service';

/** Mirrors the server's limits (ContactRules). */
export const CONTACT_LIMITS = { name: 100, email: 200, phone: 30, company: 150, messageMin: 10, messageMax: 2000 } as const;

type Field = 'name' | 'email' | 'phone' | 'company' | 'message';
type FieldErrors = Partial<Record<Field, string>>;

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const FIELDS: readonly Field[] = ['name', 'email', 'phone', 'company', 'message'];

/** Public contact page (MRV-2.8b): a form that writes to the business, plus the contact details as plain text while they are placeholders. */
@Component({
  selector: 'app-contact',
  imports: [FormsModule, ErrorAlert, AppIcon],
  templateUrl: './contact.html',
  styleUrl: './contact.scss',
})
export class Contact {
  private readonly service = inject(ContactService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly t = PT.contactPage;
  protected readonly contact = inject(CONTACT_INFO);
  protected readonly links = contactLinks(this.contact);
  protected readonly placeholderAddress = CONTACT_PLACEHOLDER.address;
  protected readonly limits = CONTACT_LIMITS;

  protected name = '';
  protected email = '';
  protected phone = '';
  protected company = '';
  protected message = '';
  /** Honeypot: hidden from people, so only a bot fills it. */
  protected website = '';

  protected readonly sendAction = action();
  protected readonly fieldErrors = signal<FieldErrors>({});
  protected readonly sent = signal(false);
  // A 429 gets its own explanation; every other failure uses the shared status message.
  protected readonly failure = computed<ApiError | null>(() => {
    const error = this.sendAction.error();
    // The server's own text is never shown: only ours, in pt-BR.
    return error ? { ...error, message: error.status === 429 ? this.t.rateLimited : error.message, detail: null } : null;
  });

  protected submit(): void {
    if (this.sendAction.busy()) {
      return;
    }
    this.sent.set(false);
    const request = {
      name: this.name.trim(),
      email: this.email.trim(),
      phone: this.phone.trim(),
      company: this.company.trim(),
      message: this.message.trim(),
      website: this.website,
    };
    const problems = this.validate(request);
    this.fieldErrors.set(problems);
    if (Object.keys(problems).length > 0) {
      this.sendAction.reset();
      this.focus(`#contact-${FIELDS.find((f) => problems[f])}`);
      return;
    }
    this.sendAction.run(
      this.service.send(request).pipe(
        catchError((failure: unknown) => {
          if (failure instanceof HttpErrorResponse && failure.status === 400) {
            this.fieldErrors.set(this.serverProblems(failure.error));
          }
          this.focus(Object.keys(this.fieldErrors()).length > 0 ? `#contact-${FIELDS.find((f) => this.fieldErrors()[f])}` : '#contact-failure');
          return throwError(() => failure);
        }),
      ),
      () => {
        this.name = this.email = this.phone = this.company = this.message = this.website = '';
        this.fieldErrors.set({});
        this.sent.set(true);
        this.focus('#contact-sent');
      },
    );
  }

  // Moves focus once the view has rendered the target (the zoneless app renders after signal writes).
  private focus(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), { injector: this.injector });
  }

  private validate(value: Record<Field, string>): FieldErrors {
    const e = this.t.errors;
    const problems: FieldErrors = {};
    if (!value.name) problems.name = e.nameRequired;
    else if (value.name.length > CONTACT_LIMITS.name) problems.name = e.nameLong;
    if (!value.email) problems.email = e.emailRequired;
    else if (value.email.length > CONTACT_LIMITS.email || !EMAIL_PATTERN.test(value.email)) problems.email = e.emailInvalid;
    if (value.phone.length > CONTACT_LIMITS.phone) problems.phone = e.phoneLong;
    if (value.company.length > CONTACT_LIMITS.company) problems.company = e.companyLong;
    if (!value.message) problems.message = e.messageRequired;
    else if (value.message.length < CONTACT_LIMITS.messageMin) problems.message = e.messageShort;
    else if (value.message.length > CONTACT_LIMITS.messageMax) problems.message = e.messageLong;
    return problems;
  }

  // The server's 400 names the fields in `errors`; its English text is not shown, our own pt-BR text for the field is.
  private serverProblems(body: unknown): FieldErrors {
    const errors = (body as { errors?: unknown } | null)?.errors;
    const problems: FieldErrors = {};
    if (errors && typeof errors === 'object') {
      for (const key of Object.keys(errors)) {
        const field = FIELDS.find((f) => f === key.charAt(0).toLowerCase() + key.slice(1));
        if (field) {
          problems[field] = this.t.errors.serverInvalid;
        }
      }
    }
    return problems;
  }
}
