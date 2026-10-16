import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PT } from '../../../core/i18n/pt-br';
import { action } from '../../../core/http/action';
import { loadable } from '../../../core/http/loadable';
import { confirmedDelete, formFeedback } from '../../../shared/crud/admin-crud';
import { BrlPipe } from '../../../shared/format/brl.pipe';
import { ErrorAlert } from '../../../shared/ui/error-alert/error-alert';
import { LoadState } from '../../../shared/ui/load-state/load-state';
import { AdminService, PricingTier, ProductAdmin, ProductPrice } from '../api/admin.service';

@Component({
  selector: 'app-admin-pricing',
  imports: [FormsModule, ErrorAlert, LoadState, BrlPipe],
  templateUrl: './admin-pricing.html',
})
export class AdminPricing implements OnInit {
  protected readonly t = PT.adminPricing;
  private readonly admin = inject(AdminService);

  // Signals, not plain fields: the app is zoneless, so only signal writes re-render after HTTP callbacks.
  protected readonly tiers = loadable(() => this.admin.getPricingTiers(), [] as PricingTier[]);
  protected readonly products = loadable(() => this.admin.getProducts(), [] as ProductAdmin[]);
  protected readonly prices = loadable(() => this.admin.getProductPrices(this.selectedProductId()), [] as ProductPrice[]);

  // ---- tier form
  protected readonly editingTierId = signal<string | null>(null);
  protected readonly editingTierIsDefault = signal(false);
  protected readonly tierName = signal('');
  protected readonly tierDefault = signal(false);
  protected readonly tierForm = formFeedback();
  protected readonly tierListAction = action();

  // ---- price form
  protected readonly selectedProductId = signal('');
  protected readonly editingPrice = signal(false);
  protected readonly priceTier = signal('');
  protected readonly priceMinQty = signal<number | string>(1);
  protected readonly priceUnit = signal<number | string | null>(null);
  protected readonly priceForm = formFeedback();
  protected readonly priceDelete = confirmedDelete();

  ngOnInit(): void {
    this.tiers.load();
    this.products.load();
  }

  // ---- tiers

  editTier(tier: PricingTier): void {
    this.tierForm.clear();
    this.editingTierId.set(tier.id);
    this.editingTierIsDefault.set(tier.isDefault);
    this.tierName.set(tier.name);
    this.tierDefault.set(tier.isDefault);
  }

  resetTierForm(): void {
    this.editingTierId.set(null);
    this.editingTierIsDefault.set(false);
    this.tierName.set('');
    this.tierDefault.set(false);
    this.tierForm.problem.set(null);
  }

  saveTier(): void {
    this.tierForm.clear();
    const name = this.tierName().trim();
    if (!name) {
      this.tierForm.refuse(this.t.tierNameRequired);
      return;
    }
    const request = { name, isDefault: this.tierDefault() };
    const id = this.editingTierId();
    this.tierForm.send(id ? this.admin.updatePricingTier(id, request) : this.admin.createPricingTier(request), () => {
      this.resetTierForm();
      this.tiers.load();
    });
  }

  makeDefault(tier: PricingTier): void {
    this.tierListAction.run(this.admin.updatePricingTier(tier.id, { name: tier.name, isDefault: true }), () => this.tiers.load());
  }

  // ---- prices

  onProductChosen(): void {
    this.resetPriceForm();
    this.priceForm.saved.set(false);
    if (this.selectedProductId()) {
      this.prices.load();
    }
  }

  editPrice(price: ProductPrice): void {
    this.priceForm.clear();
    this.editingPrice.set(true);
    this.priceTier.set(price.pricingTierId);
    this.priceMinQty.set(price.minQty);
    this.priceUnit.set(price.unitPrice);
  }

  resetPriceForm(): void {
    this.editingPrice.set(false);
    this.priceTier.set('');
    this.priceMinQty.set(1);
    this.priceUnit.set(null);
    this.priceForm.problem.set(null);
  }

  savePrice(): void {
    this.priceForm.clear();
    const productId = this.selectedProductId();
    if (!productId) {
      return;
    }
    const unit = this.priceUnit();
    const unitPrice = unit === null || unit === '' ? NaN : Number(unit);
    const minQty = Number(this.priceMinQty());
    if (!this.priceTier()) {
      this.priceForm.refuse(this.t.tierRequired);
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      this.priceForm.refuse(this.t.priceInvalid);
      return;
    }
    if (!Number.isInteger(minQty) || minQty < 1) {
      this.priceForm.refuse(this.t.minQtyInvalid);
      return;
    }
    this.priceForm.send(this.admin.upsertProductPrice(productId, { pricingTierId: this.priceTier(), unitPrice, minQty }), () => {
      this.resetPriceForm();
      this.prices.load();
    });
  }

  priceKey(price: ProductPrice): string {
    return `${price.pricingTierId}/${price.minQty}`;
  }

  askRemovePrice(price: ProductPrice): void {
    this.priceDelete.ask(this.priceKey(price));
  }

  removePrice(price: ProductPrice): void {
    this.priceDelete.run(this.admin.deleteProductPrice(this.selectedProductId(), price.pricingTierId, price.minQty), () => this.prices.load());
  }
}
