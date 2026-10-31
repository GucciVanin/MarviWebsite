import { Component, ElementRef, Injector, OnInit, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PT } from '../../../core/i18n/pt-br';
import { loadable } from '../../../core/http/loadable';
import { confirmedDelete, formFeedback } from '../../../shared/crud/admin-crud';
import { ErrorAlert } from '../../../shared/ui/error-alert/error-alert';
import { LoadState } from '../../../shared/ui/load-state/load-state';
import { AdminService, CategoryAdmin, ProductAdmin } from '../api/admin.service';
import { ProductPanel, ProductSaved } from './product-panel';

@Component({
  selector: 'app-admin-catalog',
  imports: [FormsModule, ErrorAlert, LoadState, ProductPanel],
  templateUrl: './admin-catalog.html',
})
export class AdminCatalog implements OnInit {
  protected readonly t = PT.adminCatalog;
  private readonly admin = inject(AdminService);

  // Signals, not plain fields: the app is zoneless, so only signal writes re-render after HTTP callbacks.
  protected readonly categories = loadable(() => this.admin.getCategories(), [] as CategoryAdmin[]);
  protected readonly products = loadable(() => this.admin.getProducts(), [] as ProductAdmin[]);

  // ---- category form
  protected readonly editingCategoryId = signal<string | null>(null);
  protected readonly categoryName = signal('');
  protected readonly categorySort = signal(1);
  protected readonly categoryActive = signal(true);
  protected readonly categoryForm = formFeedback();
  protected readonly categoryDelete = confirmedDelete();

  // ---- product panel (MRV-9.5): the guided form for a new product, and the same form to edit one
  private readonly injector = inject(Injector);
  private readonly newProductButton = viewChild<ElementRef<HTMLButtonElement>>('newProductButton');
  /** A key per opening, so opening it for another product starts a fresh form. Null: closed. */
  protected readonly panelKey = signal<number | null>(null);
  protected readonly editingProduct = signal<ProductAdmin | null>(null);
  private opened = 0;
  protected readonly notice = signal('');
  /** The product created last: the table lists it first. */
  private readonly newestId = signal<string | null>(null);
  protected readonly productRows = computed(() => {
    const newest = this.newestId();
    const all = this.products.data();
    return newest ? [...all.filter((p) => p.id === newest), ...all.filter((p) => p.id !== newest)] : all;
  });
  protected readonly skus = computed(() => this.products.data().map((p) => p.sku));
  protected readonly productDelete = confirmedDelete();

  ngOnInit(): void {
    this.categories.load();
    this.products.load();
  }

  categoryNameOf(id: string | null): string {
    return this.categories.data().find((c) => c.id === id)?.name ?? this.t.noCategory;
  }

  // ---- categories

  editCategory(category: CategoryAdmin): void {
    this.categoryForm.clear();
    this.editingCategoryId.set(category.id);
    this.categoryName.set(category.name);
    this.categorySort.set(category.sortOrder);
    this.categoryActive.set(category.isActive);
  }

  resetCategoryForm(): void {
    this.editingCategoryId.set(null);
    this.categoryName.set('');
    this.categorySort.set(1);
    this.categoryActive.set(true);
    this.categoryForm.problem.set(null);
  }

  saveCategory(): void {
    this.categoryForm.clear();
    const name = this.categoryName().trim();
    if (!name) {
      this.categoryForm.refuse(this.t.categoryNameRequired);
      return;
    }
    const request = { name, sortOrder: Number(this.categorySort()) || 0, isActive: this.categoryActive() };
    const id = this.editingCategoryId();
    const call = id ? this.admin.updateCategory(id, request) : this.admin.createCategory(request);
    this.categoryForm.send(call, () => {
      this.resetCategoryForm();
      this.categories.load();
    });
  }

  askDeleteCategory(id: string): void {
    this.categoryDelete.ask(id);
  }

  deleteCategory(id: string): void {
    this.categoryDelete.run(this.admin.deleteCategory(id), () => this.categories.load());
  }

  // ---- products

  openPanel(product: ProductAdmin | null): void {
    this.notice.set('');
    this.editingProduct.set(product);
    this.panelKey.set(++this.opened);
  }

  closePanel(): void {
    this.panelKey.set(null);
    this.editingProduct.set(null);
    afterNextRender(() => this.newProductButton()?.nativeElement.focus(), { injector: this.injector });
  }

  productSaved(saved: ProductSaved): void {
    this.notice.set(saved.created ? this.t.created(saved.name, saved.sku) : this.t.updated(saved.name, saved.sku));
    if (saved.created && saved.id) {
      this.newestId.set(saved.id);
    }
    this.products.load();
    this.categories.load(); // the product counts changed
    if (!saved.again) {
      this.closePanel();
    }
  }

  askDeleteProduct(id: string): void {
    this.productDelete.ask(id);
  }

  deleteProduct(id: string): void {
    this.productDelete.run(this.admin.deleteProduct(id), () => {
      this.products.load();
      this.categories.load();
    });
  }
}
