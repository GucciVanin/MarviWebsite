import { Component, OnInit, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PT } from '../../../core/i18n/pt-br';
import { loadable } from '../../../core/http/loadable';
import { CatalogService } from '../../../core/catalog/catalog.service';
import { BrlPipe } from '../../format/brl.pipe';
import type { Category, ProductListItem } from '../../models/catalog.model';
import { AppIcon } from '../app-icon/app-icon';
import { LoadState } from '../load-state/load-state';

/** Search and filter the public catalog and pick products; the screen decides what picking means (a quote line, an order line). */
@Component({
  selector: 'app-product-picker',
  imports: [FormsModule, LoadState, BrlPipe, AppIcon],
  templateUrl: './product-picker.html',
})
export class ProductPicker implements OnInit {
  protected readonly t = PT.productPicker;
  private readonly catalogService = inject(CatalogService);

  /** Emitted each time the user presses "Adicionar" on a product. */
  readonly picked = output<ProductListItem>();

  // Signals, not plain fields: the app is zoneless, so only signal writes re-render after HTTP callbacks.
  // The filters are applied together when submitted, not on every keystroke.
  protected readonly searchText = signal('');
  protected readonly categoryId = signal('');
  private readonly appliedSearch = signal('');
  private readonly appliedCategory = signal('');

  protected readonly catalog = loadable(
    () => this.catalogService.getProducts(this.appliedCategory() || undefined, this.appliedSearch() || undefined),
    [] as ProductListItem[],
  );
  protected readonly categories = loadable(() => this.catalogService.getCategories(), [] as Category[]);

  ngOnInit(): void {
    this.catalog.load();
    this.categories.load();
  }

  applyFilters(): void {
    this.appliedSearch.set(this.searchText());
    this.appliedCategory.set(this.categoryId());
    this.catalog.load();
  }
}
