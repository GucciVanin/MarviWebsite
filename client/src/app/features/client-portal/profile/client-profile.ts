import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { action } from '../../../core/http/action';
import { loadable } from '../../../core/http/loadable';
import { PT } from '../../../core/i18n/pt-br';
import { PtDatePipe } from '../../../shared/format/pt-date.pipe';
import { ErrorAlert } from '../../../shared/ui/error-alert/error-alert';
import { LoadState } from '../../../shared/ui/load-state/load-state';
import { ClientProfile, ProfileService } from '../api/profile.service';

// The server's limits (ClientProfileRules): checked here too so the customer is told in pt-BR before sending.
const MAX_COMPANY_LENGTH = 200;
const MAX_ADDRESS_LENGTH = 500;
const MAX_SHIPPING_ADDRESSES = 10;

/** The customer's own company details (MRV-2.2): company name, billing address and a list of shipping addresses, one per line. */
@Component({
  selector: 'app-client-profile',
  imports: [FormsModule, ErrorAlert, LoadState, PtDatePipe],
  templateUrl: './client-profile.html',
})
export class ClientProfileCard implements OnInit {
  protected readonly t = PT.clientProfile;
  private readonly service = inject(ProfileService);

  protected readonly profile = loadable(() => this.service.get(), null as ClientProfile | null);
  protected readonly saveAction = action();

  // Signals, not plain fields: the app is zoneless, so only signal writes re-render.
  protected readonly companyName = signal('');
  protected readonly billingAddress = signal('');
  protected readonly shippingText = signal('');
  protected readonly saved = signal(false);
  /** The shipping addresses as the server will see them: one per line, trimmed, without blank lines or repeats (ignoring case). */
  private readonly shippingLines = computed(() => {
    const lines = this.shippingText().split('\n').map((line) => line.trim()).filter((line) => line !== '');
    return lines.filter((line, index) => lines.findIndex((other) => other.toLowerCase() === line.toLowerCase()) === index);
  });
  /** The limits the server enforces, said in pt-BR before anything is sent. */
  protected readonly problem = computed(() => {
    const lines = this.shippingLines();
    if (lines.length > MAX_SHIPPING_ADDRESSES) {
      return this.t.tooManyAddresses;
    }
    return lines.some((line) => line.length > MAX_ADDRESS_LENGTH) ? this.t.addressTooLong : null;
  });
  protected readonly canSave = computed(
    () => this.companyName().trim() !== '' && this.billingAddress().trim() !== '' && this.problem() === null && !this.saveAction.busy(),
  );
  protected readonly maxCompany = MAX_COMPANY_LENGTH;
  protected readonly maxAddress = MAX_ADDRESS_LENGTH;

  private filled = false;

  constructor() {
    // Fill the form once, when the details first arrive; a retry after an error must not overwrite what is being typed.
    effect(() => {
      const loaded = this.profile.data();
      if (loaded && !this.filled) {
        untracked(() => this.fill(loaded));
      }
    });
  }

  ngOnInit(): void {
    this.profile.load();
  }

  save(): void {
    if (!this.canSave()) {
      return;
    }
    this.saved.set(false);
    this.saveAction.run(
      this.service.update({ companyName: this.companyName().trim(), billingAddress: this.billingAddress().trim(), shippingAddresses: this.shippingLines() }),
      (saved) => {
        this.fill(saved);
        this.saved.set(true);
      },
    );
  }

  private fill(profile: ClientProfile): void {
    this.filled = true;
    this.companyName.set(profile.companyName);
    this.billingAddress.set(profile.billingAddress);
    this.shippingText.set(profile.shippingAddresses.join('\n'));
  }
}
