import { Component, ElementRef, Injector, OnInit, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { PT } from '../../../core/i18n/pt-br';
import { action } from '../../../core/http/action';
import { fieldProblems } from '../../../core/http/api-error';
import { loadable } from '../../../core/http/loadable';
import { ErrorAlert } from '../../../shared/ui/error-alert/error-alert';
import { LoadState } from '../../../shared/ui/load-state/load-state';
import { AdminService, CategoryAdmin, PricingTier, ProductAdmin, Warehouse } from '../api/admin.service';
import { AttributeRow, PRODUCT_LIMITS, attributesOf, parsePrice, parseQuantity, rowsOf, suggestSku, validateProduct } from './product-rules';

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
  imports: [RouterLink, ErrorAlert, LoadState],
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
  protected readonly imageUrl = signal('');
  protected readonly active = signal(true);
  protected readonly rows = signal<AttributeRow[]>([]);
  protected readonly prices = signal<string[]>([]);
  protected readonly quantities = signal<string[]>([]);
  protected readonly clientProblems = signal<Record<string, string>>({});
  protected readonly imageBroken = signal(false);
  protected readonly createdBefore = signal(false);
  // A connection failure leaves it unknown whether the product was created: a retry that finds the code taken is then told so.
  private maybeCreated = false;

  protected readonly creating = computed(() => this.product() === null);
  protected readonly previewable = computed(() => !this.clientProblems()['imageUrl'] && /^https:\/\//i.test(this.imageUrl().trim()));
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

  private original() {
    const product = this.product();
    return product ? { description: product.description ?? '', imageUrl: product.imageUrl ?? '', attributes: rowsOf(product.attributes) } : undefined;
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
    this.imageUrl.set(product.imageUrl ?? '');
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

  protected suggest(): void {
    const category = this.categories().find((c) => c.id === this.categoryId());
    this.setSku(suggestSku(category?.name ?? '', this.existingSkus()));
  }

  protected save(again = false): void {
    if (this.request.busy()) {
      return; // a second click while the first is on its way must not create a second product
    }
    this.request.reset();
    const problems = validateProduct(
      {
        sku: this.sku(), name: this.name(), categoryId: this.categoryId(), description: this.description(), imageUrl: this.imageUrl(),
        attributes: this.rows(), prices: this.priceRows().map((_, i) => this.priceText(i)), quantities: this.stockRows().map((_, i) => this.quantityText(i)),
      },
      { creating: this.creating(), originalSku: this.product()?.sku, original: this.original() },
    );
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
      imageUrl: this.imageUrl().trim() || null,
      isActive: this.active(),
      attributes: attributesOf(this.rows()),
    };
    const editing = this.product();
    const call: Observable<unknown> = editing
      ? this.admin.updateProduct(editing.id, base)
      : this.admin.createProductWithSetup({
          ...base,
          prices: this.priceRows().map((tier, i) => ({ pricingTierId: tier.id, unitPrice: parsePrice(this.priceText(i)) })),
          stock: this.stockRows().map((warehouse, i) => ({ warehouseId: warehouse.id, qtyOnHand: parseQuantity(this.quantityText(i)) })),
        });
    this.request.run(call.pipe(tap({ error: (failure: unknown) => this.noteFailure(failure) })), (result) => {
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
    if (failure.status === 0) {
      this.maybeCreated = true;
    } else if (this.maybeCreated && failure.status === 409 && fieldProblems(failure.error)?.some((p) => p.field === 'sku')) {
      this.maybeCreated = false;
      this.createdBefore.set(true);
      this.refresh.emit();
    }
  }

  private reset(): void {
    this.sku.set('');
    this.name.set('');
    this.description.set('');
    this.imageUrl.set('');
    this.active.set(true);
    this.rows.set([]);
    this.prices.set([]);
    this.quantities.set([]);
    this.clientProblems.set({});
    this.imageBroken.set(false);
    afterNextRender(() => this.heading().nativeElement.focus(), { injector: this.injector });
  }

  private focusFirstProblem(): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), { injector: this.injector });
  }
}
