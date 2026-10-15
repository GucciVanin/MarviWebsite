import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { action } from '../../../core/http/action';
import { loadable } from '../../../core/http/loadable';
import { PT } from '../../../core/i18n/pt-br';
import { ErrorAlert } from '../../../shared/ui/error-alert/error-alert';
import { LoadState } from '../../../shared/ui/load-state/load-state';
import { ClientProfile, ProfileService } from '../api/profile.service';

/** The customer's own company details (MRV-2.2): company name, billing address and a list of shipping addresses, one per line. */
@Component({
  selector: 'app-client-profile',
  imports: [FormsModule, ErrorAlert, LoadState],
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
  protected readonly canSave = computed(() => this.companyName().trim() !== '' && this.billingAddress().trim() !== '' && !this.saveAction.busy());

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
    const shippingAddresses = this.shippingText()
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
    this.saveAction.run(
      this.service.update({ companyName: this.companyName().trim(), billingAddress: this.billingAddress().trim(), shippingAddresses }),
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
