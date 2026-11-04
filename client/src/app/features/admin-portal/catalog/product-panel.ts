import { Component, ElementRef, Injector, OnInit, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, finalize, tap } from 'rxjs';
import { PT } from '../../../core/i18n/pt-br';
import { action } from '../../../core/http/action';
import { fieldProblems } from '../../../core/http/api-error';
import { loadable } from '../../../core/http/loadable';
import { ErrorAlert } from '../../../shared/ui/error-alert/error-alert';
import { LoadState } from '../../../shared/ui/load-state/load-state';
import { ProductPhoto } from '../../../shared/ui/product-photo/product-photo';
import { AdminService, CategoryAdmin, PricingTier, ProductAdmin, Warehouse } from '../api/admin.service';
import { AttributeRow, PRODUCT_LIMITS, attributesOf, formatBytes, isActivationOnly, parsePrice, parseQuantity, photoDimensionsProblem, photoFileProblem, rowsOf, suggestSku, validateProduct } from './product-rules';

/** What the panel tells the page when a product was saved: its name and code for the notice, and whether to stay open for another. */
export interface ProductSaved {
  id: string | null;
  name: string;
  sku: string;
  created: boolean;
  again: boolean;
}

/**
 * The guided product form (MRV-9.5), a panel on the Catálogo page: product data, structured attributes and, for a new product,
 * a price per tier and an opening quantity per warehouse, saved together in one request. Editing reuses it for the product data
 * and the attributes only: prices and stock stay in their own tabs.
 */
@Component({
  selector: 'app-product-panel',
  imports: [RouterLink, ErrorAlert, LoadState, ProductPhoto],
  templateUrl: './product-panel.html',
})
export class ProductPanel implements OnInit {
  protected readonly t = PT.adminCatalog;
  protected readonly limits = PRODUCT_LIMITS;
  private readonly admin = inject(AdminService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  readonly categories = input.required<CategoryAdmin[]>();
  /** The codes already in use, to suggest the next free one. */
  readonly existingSkus = input<readonly string[]>([]);
  /** The product being edited; null for a new one. */
  readonly product = input<ProductAdmin | null>(null);
  readonly saved = output<ProductSaved>();
  readonly cancelled = output<void>();
  /** The list should be read again (the product may exist already). */
  readonly refresh = output<void>();

  protected readonly tiers = loadable(() => this.admin.getPricingTiers(), [] as PricingTier[]);
  protected readonly warehouses = loadable(() => this.admin.getWarehouses(), [] as Warehouse[]);
  protected readonly request = action();

  protected readonly sku = signal('');
  protected readonly name = signal('');
  protected readonly categoryId = signal('');
  protected readonly description = signal('');
  protected readonly active = signal(true);
  protected readonly rows = signal<AttributeRow[]>([]);
  protected readonly prices = signal<string[]>([]);
  protected readonly quantities = signal<string[]>([]);
  protected readonly clientProblems = signal<Record<string, string>>({});
  // The photo (MRV-9.7). A chosen file is uploaded at once and shown from the server's own (same-origin) address; it joins the product when the
  // product is saved, by the token. On an edit the stored photo is shown until a new file replaces it or "Remover foto" clears it.
  protected readonly storedPhoto = signal<string | null>(null);
  protected readonly pendingPhoto = signal<{ token: string; url: string; name: string; size: number } | null>(null);
  protected readonly photoRemoved = signal(false);
  protected readonly photoUpload = action();
  /** True from the moment a file is chosen until its upload ends (reading its size counts): saving waits for it. */
  protected readonly photoWorking = signal(false);
  // Bumped when the form is reset: an upload that finishes after that belongs to a form that is gone.
  private formGeneration = 0;
  protected readonly savingBlocked = computed(() => this.request.busy() || this.photoWorking());
  protected readonly photoMessage = signal('');
  protected readonly createdBefore = signal(false);
  // A connection failure leaves it unknown whether the product was created: a retry that finds the code taken is then told so.
  private maybeCreated = false;

  protected readonly creating = computed(() => this.product() === null);
  /** The photo the form shows now: the one just uploaded, else the stored one unless it was removed. */
  protected readonly shownPhoto = computed(() => this.pendingPhoto()?.url ?? (this.photoRemoved() ? null : this.storedPhoto()));
  protected readonly photoChanged = computed(() => this.pendingPhoto() !== null || (this.photoRemoved() && this.storedPhoto() !== null));
  protected readonly photoStatus = computed(() => {
    const pending = this.pendingPhoto();
    if (this.photoWorking()) {
      return this.t.photoUploading;
    }
    if (pending) {
      return this.t.photoReady(pending.name, formatBytes(pending.size));
    }
    if (this.photoRemoved()) {
      return this.t.photoRemoved;
    }
    return this.storedPhoto() ? this.t.photoCurrent : '';
  });
  /** The problem to show under the chooser: the form's own, the upload's, or the one the product save named on the photo. */
  protected readonly photoProblem = computed(
    () => this.photoMessage() || this.photoUpload.error()?.fields?.find((p) => p.field === 'photo')?.message || this.photoUpload.error()?.message || this.serverProblems()['photo'] || '',
  );
  protected readonly serverProblems = computed(() => {
    const found: Record<string, string> = {};
    for (const problem of this.request.error()?.fields ?? []) {
      found[problem.field] = problem.message;
    }
    return found;
  });
  /** The message for a control: what the form found, or what the server answered. */
  protected problem(field: string): string {
    if (field === 'sku' && this.createdBefore()) {
      return this.t.alreadyCreated;
    }
    return this.clientProblems()[field] ?? this.serverProblems()[field] ?? '';
  }
  protected readonly anyProblem = computed(() => Object.keys(this.clientProblems()).length > 0 || Object.keys(this.serverProblems()).length > 0);
  /** A failure that is not about one control (a connection failure, a refusal with no field). */
  protected readonly generalError = computed(() => {
    const error = this.request.error();
    return error && !error.fields ? error : null;
  });
  protected readonly formLevel = computed(() => this.serverProblems()['form'] ?? '');

  constructor() {
    afterNextRender(() => this.heading().nativeElement.focus());
  }

  ngOnInit(): void {
    const product = this.product();
    if (product) {
      this.fill(product);
      return;
    }
    this.rows.set([]);
    this.tiers.load();
    this.warehouses.load();
  }

  /** The code was edited: a lost connection says nothing about the new code. */
  protected setSku(value: string): void {
    this.sku.set(value);
    this.maybeCreated = false;
    this.createdBefore.set(false);
  }

  private fill(product: ProductAdmin): void {
    this.sku.set(product.sku);
    this.name.set(product.name);
    this.categoryId.set(product.categoryId ?? '');
    this.description.set(product.description ?? '');
    this.storedPhoto.set(product.imageUrl);
    this.active.set(product.isActive);
    this.rows.set(rowsOf(product.attributes));
  }

  /** The tables follow the lists once they are loaded; one text per row, empty. */
  protected readonly priceRows = computed(() => this.tiers.data());
  protected readonly stockRows = computed(() => this.warehouses.data());

  protected priceText(index: number): string {
    return this.prices()[index] ?? '';
  }

  protected quantityText(index: number): string {
    return this.quantities()[index] ?? '';
  }

  protected setPrice(index: number, value: string): void {
    this.prices.update((all) => this.withAt(all, index, value, this.priceRows().length));
  }

  protected setQuantity(index: number, value: string): void {
    this.quantities.update((all) => this.withAt(all, index, value, this.stockRows().length));
  }

  private withAt(all: string[], index: number, value: string, length: number): string[] {
    const next = Array.from({ length }, (_, i) => all[i] ?? '');
    next[index] = value;
    return next;
  }

  protected setKey(index: number, key: string): void {
    this.rows.update((all) => all.map((row, i) => (i === index ? { ...row, key } : row)));
  }

  protected setValue(index: number, value: string): void {
    this.rows.update((all) => all.map((row, i) => (i === index ? { ...row, value } : row)));
  }

  protected addRow(): void {
    const index = this.rows().length;
    this.rows.update((all) => [...all, { key: '', value: '' }]);
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLInputElement>(`#attr-key-${index}`)?.focus(), { injector: this.injector });
  }

  protected removeRow(index: number): void {
    this.rows.update((all) => all.filter((_, i) => i !== index));
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('[data-testid="add-attribute"]')?.focus(), { injector: this.injector });
  }

  /** A file was chosen: checked here for the obvious (type, size, pixels), then uploaded; the API checks the real bytes again. */
  protected async choosePhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // the same file can be chosen again after a refusal
    if (!file) {
      return;
    }
    if (this.photoWorking()) {
      this.photoMessage.set(this.t.photoWait); // the picker can open while an upload runs (aria-disabled does not stop it)
      return;
    }
    this.photoUpload.reset();
    this.photoMessage.set('');
    const obvious = photoFileProblem(file);
    if (obvious) {
      this.photoMessage.set(obvious);
      return;
    }
    const generation = this.formGeneration;
    this.photoWorking.set(true);
    const sides = await this.sidesOf(file);
    const outOfRange = sides ? photoDimensionsProblem(sides.width, sides.height) : '';
    if (outOfRange || generation !== this.formGeneration) {
      this.photoMessage.set(generation === this.formGeneration ? outOfRange : '');
      this.photoWorking.set(false);
      return;
    }
    this.photoUpload.run(this.admin.uploadProductPhoto(file).pipe(finalize(() => { if (generation === this.formGeneration) { this.photoWorking.set(false); } })), (uploaded) => {
      if (generation !== this.formGeneration) {
        return; // the form was reset while the file was on its way
      }
      this.pendingPhoto.set({ token: uploaded.photoToken, url: uploaded.previewUrl, name: file.name, size: file.size });
      this.photoRemoved.set(false);
      afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('#productPhoto')?.focus(), { injector: this.injector });
    });
  }

  // The size in pixels, read without drawing the file anywhere (the CSP allows no blob: images). null when the browser cannot say: the API decides then.
  private async sidesOf(file: File): Promise<{ width: number; height: number } | null> {
    try {
      const bitmap = await createImageBitmap(file);
      const sides = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return sides;
    } catch {
      return null;
    }
  }

  /** "Remover foto": drops the file just uploaded (the stored photo shows again) or, with none pending, marks the stored one for removal. */
  protected removePhoto(): void {
    this.photoUpload.reset();
    this.photoMessage.set('');
    if (this.pendingPhoto()) {
      this.pendingPhoto.set(null);
    } else if (this.storedPhoto()) {
      this.photoRemoved.set(true);
    }
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('#productPhoto')?.focus(), { injector: this.injector });
  }

  protected suggest(): void {
    const category = this.categories().find((c) => c.id === this.categoryId());
    this.setSku(suggestSku(category?.name ?? '', this.existingSkus()));
  }

  protected save(again = false): void {
    if (this.savingBlocked()) {
      return; // a second click, or a photo still on its way (it would be left out of the product) while the first is on its way must not create a second product
    }
    this.request.reset();
    const draft = {
      sku: this.sku(), name: this.name(), categoryId: this.categoryId(), description: this.description(),
      attributes: this.rows(), prices: this.priceRows().map((_, i) => this.priceText(i)), quantities: this.stockRows().map((_, i) => this.quantityText(i)),
    };
    // One rule set for a new product and an edit (the API's `ProductRules`). The one exception mirrors the API: a form that differs from the
    // stored product only in "Ativo" is sent as it is, so a product that breaks the rules can still be deactivated.
    const stored = this.product();
    const problems = stored && isActivationOnly(stored, draft, this.active(), this.photoChanged()) ? {} : validateProduct(draft);
    this.clientProblems.set(problems);
    if (Object.keys(problems).length > 0) {
      this.focusFirstProblem();
      return;
    }

    const sku = this.sku().trim();
    const name = this.name().trim();
    const base = {
      sku,
      name,
      description: this.description().trim() || null,
      categoryId: this.categoryId() || null,
      isActive: this.active(),
      attributes: attributesOf(this.rows()),
    };
    const editing = this.product();
    const photo = {
      photoToken: this.pendingPhoto()?.token ?? null,
      ...(editing ? { removePhoto: this.photoRemoved() && !this.pendingPhoto() } : {}),
    };
    const call: Observable<unknown> = editing
      ? this.admin.updateProduct(editing.id, { ...base, ...photo })
      : this.admin.createProductWithSetup({
          ...base,
          ...photo,
          prices: this.priceRows().map((tier, i) => ({ pricingTierId: tier.id, unitPrice: parsePrice(this.priceText(i)) })),
          stock: this.stockRows().map((warehouse, i) => ({ warehouseId: warehouse.id, qtyOnHand: parseQuantity(this.quantityText(i)) })),
        });
    this.request.run(call.pipe(tap({ error: (failure: unknown) => this.noteFailure(failure) })), (result) => {
      this.pendingPhoto.set(null);
      this.photoRemoved.set(false);
      this.maybeCreated = false;
      this.createdBefore.set(false);
      this.saved.emit({ id: editing ? editing.id : ((result as ProductAdmin | null)?.id ?? null), name, sku, created: !editing, again });
      if (again) {
        this.reset();
      }
    });
  }

  // A lost connection leaves it unknown whether the product was created; the retry that finds the code taken is then told the product
  // already exists (and the list is reloaded so it shows), instead of "the code exists" as if it were somebody else's.
  private noteFailure(failure: unknown): void {
    if (!(failure instanceof HttpErrorResponse)) {
      return;
    }
    if (failure.status === 400 && fieldProblems(failure.error)?.some((p) => p.field === 'photo')) {
      this.pendingPhoto.set(null); // the token expired or was used: the file must be sent again
    }
    if (failure.status === 0) {
      this.maybeCreated = true;
    } else if (this.maybeCreated && failure.status === 409 && fieldProblems(failure.error)?.some((p) => p.field === 'sku')) {
      this.maybeCreated = false;
      this.createdBefore.set(true);
      this.refresh.emit();
    }
  }

  private reset(): void {
    this.formGeneration++;
    this.photoWorking.set(false);
    this.sku.set('');
    this.name.set('');
    this.description.set('');
    this.pendingPhoto.set(null);
    this.photoRemoved.set(false);
    this.photoMessage.set('');
    this.photoUpload.reset();
    this.active.set(true);
    this.rows.set([]);
    this.prices.set([]);
    this.quantities.set([]);
    this.clientProblems.set({});
    afterNextRender(() => this.heading().nativeElement.focus(), { injector: this.injector });
  }

  private focusFirstProblem(): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), { injector: this.injector });
  }
}
