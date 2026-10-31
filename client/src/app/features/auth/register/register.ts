import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { translateIdentityErrors } from '../../../core/i18n/identity-errors';
import { describeApiError, fieldProblems } from '../../../core/http/api-error';
import { AddressDraft } from '../../../shared/ui/address-fields/address-draft';
import { AddressFields } from '../../../shared/ui/address-fields/address-fields';
import { AppIcon } from '../../../shared/ui/app-icon/app-icon';
import { RegistrationDraft } from '../../../shared/ui/registration-fields/registration-draft';
import { RegistrationFields } from '../../../shared/ui/registration-fields/registration-fields';
import { PT } from '../../../core/i18n/pt-br';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink, AppIcon, AddressFields, RegistrationFields],
  templateUrl: './register.html',
  styleUrl: '../auth.scss',
})
export class Register {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly t = PT.auth;
  protected readonly privacy = PT.privacy;

  email = '';
  password = '';
  /** The account type (business or personal, none chosen yet) and the essentials of it: the name, and the CNPJ or the CPF and birth date (MRV-9.4). */
  protected readonly registration = new RegistrationDraft(true);
  /** The billing address, in the structured form (MRV-9.3): it becomes the customer's first address, billing and default delivery. */
  protected readonly address = new AddressDraft(true);
  // Signals, not plain fields: the app is zoneless, so only signal writes re-render after async callbacks.
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  submit(): void {
    this.error.set(null);
    this.registration.setServerProblems([]);
    if (!this.registration.canSubmit()) {
      this.error.set(this.t.registrationIncomplete);
      return;
    }
    if (!this.address.canSubmit()) {
      this.error.set(this.t.addressIncomplete);
      return;
    }
    this.busy.set(true);
    const { email, password } = this;
    const draft = this.registration;
    this.authService
      .register({ email, password, companyName: draft.name().trim(), billingAddress: this.address.request(), accountType: draft.type()!, registration: draft.request() })
      .subscribe({
        // A new customer is Pending until an admin approves them, but can sign in at once to keep their details up to date;
        // the portal tells them their account awaits approval.
        next: () =>
          this.authService.login({ email, password }).subscribe({
            next: () => this.router.navigateByUrl(this.authService.homeUrl()),
            error: () => this.router.navigateByUrl('/login'),
          }),
        error: (response: HttpErrorResponse) => {
          this.busy.set(false);
          this.error.set(this.describe(response));
        },
      });
  }

  // The API returns Identity's validation messages (English) as an array on 400; show them translated to pt-BR. Other failures use the shared status message.
  private describe(response: HttpErrorResponse): string {
    // Problems named by field (MRV-9.4) go under their controls; the alert keeps only those with no control, or says to check the fields.
    const fields = response.status === 400 ? fieldProblems(response.error) : null;
    if (fields) {
      const loose = this.registration.setServerProblems(fields);
      return loose.length > 0 ? translateIdentityErrors(loose) : this.t.registrationIncomplete;
    }
    return response.status === 400 || response.status === 409 ? translateIdentityErrors(response.error) : describeApiError(response).message;
  }
}
