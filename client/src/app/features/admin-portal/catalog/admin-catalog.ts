import { Component, OnInit, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { PT } from '../../../core/i18n/pt-br';
import { loadable } from '../../../core/http/loadable';
import { confirmedDelete, formFeedback } from '../../../shared/crud/admin-crud';
import { ErrorAlert } from '../../../shared/ui/error-alert/error-alert';
import { LoadState } from '../../../shared/ui/load-state/load-state';
import { AdminService, CategoryAdmin, ProductAdmin } from '../api/admin.service';

/** "name: value" per line, as typed in the product form; null when a line is not in that shape. */
function parseAttributes(text: string): Record<string, string> | null {
  const attributes: Record<string, string> = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) {
      continue;
    }
    const colon = line.indexOf(':');
    const name = colon > 0 ? line.slice(0, colon).trim() : '';
    const value = colon > 0 ? line.slice(colon + 1).trim() : '';
    if (!name || !value) {
      return null;
    }
    attributes[name] = value;
  }
  return attributes;
}

function formatAttributes(attributes: Record<string, string>): string {
  return Object.entries(attributes).map(([name, value]) => `${name}: ${value}`).join('\n');
}

@Component({
  selector: 'app-admin-catalog',
  imports: [FormsModule, ErrorAlert, LoadState],
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

  // ---- product form
  protected readonly editingProductId = signal<string | null>(null);
  protected readonly productSku = signal('');
  protected readonly productName = signal('');
  protected readonly productDescription = signal('');
  protected readonly productCategory = signal('');
  protected readonly productImage = signal('');
  protected readonly productActive = signal(true);
  protected readonly productAttributes = signal('');
  protected readonly productForm = formFeedback();
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

  editProduct(product: ProductAdmin): void {
    this.productForm.clear();
    this.editingProductId.set(product.id);
    this.productSku.set(product.sku);
    this.productName.set(product.name);
    this.productDescription.set(product.description ?? '');
    this.productCategory.set(product.categoryId ?? '');
    this.productImage.set(product.imageUrl ?? '');
    this.productActive.set(product.isActive);
    this.productAttributes.set(formatAttributes(product.attributes));
  }

  resetProductForm(): void {
    this.editingProductId.set(null);
    this.productSku.set('');
    this.productName.set('');
    this.productDescription.set('');
    this.productCategory.set('');
    this.productImage.set('');
    this.productActive.set(true);
    this.productAttributes.set('');
    this.productForm.problem.set(null);
  }

  saveProduct(): void {
    this.productForm.clear();
    const sku = this.productSku().trim();
    const name = this.productName().trim();
    if (!sku || !name) {
      this.productForm.refuse(this.t.productRequired);
      return;
    }
    const attributes = parseAttributes(this.productAttributes());
    if (attributes === null) {
      this.productForm.refuse(this.t.attributeFormat);
      return;
    }
    const request = {
      sku,
      name,
      description: this.productDescription().trim() || null,
      categoryId: this.productCategory() || null,
      imageUrl: this.productImage().trim() || null,
      isActive: this.productActive(),
      attributes,
    };
    const id = this.editingProductId();
    const call: Observable<unknown> = id ? this.admin.updateProduct(id, request) : this.admin.createProduct(request);
    this.productForm.send(call, () => {
      this.resetProductForm();
      this.products.load();
      this.categories.load(); // the product counts changed
    });
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
