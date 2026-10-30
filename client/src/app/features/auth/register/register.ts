import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { translateIdentityErrors } from '../../../core/i18n/identity-errors';
import { describeApiError } from '../../../core/http/api-error';
import { AddressDraft } from '../../../shared/ui/address-fields/address-draft';
import { AddressFields } from '../../../shared/ui/address-fields/address-fields';
import { AppIcon } from '../../../shared/ui/app-icon/app-icon';
import { PT } from '../../../core/i18n/pt-br';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink, AppIcon, AddressFields],
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
  companyName = '';
  /** The billing address, in the structured form (MRV-9.3): it becomes the customer's first address, billing and default delivery. */
  protected readonly address = new AddressDraft(true);
  // Signals, not plain fields: the app is zoneless, so only signal writes re-render after async callbacks.
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  submit(): void {
    this.error.set(null);
    if (!this.address.canSubmit()) {
      this.error.set(this.t.addressIncomplete);
      return;
    }
    this.busy.set(true);
    const { email, password, companyName } = this;
    this.authService.register({ email, password, companyName, billingAddress: this.address.request() }).subscribe({
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
    return response.status === 400 ? translateIdentityErrors(response.error) : describeApiError(response).message;
  }
}
