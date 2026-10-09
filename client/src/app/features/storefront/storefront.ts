import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PT } from '../../core/i18n/pt-br';
import { action } from '../../core/http/action';
import { loadable } from '../../core/http/loadable';
import { ErrorAlert } from '../../shared/ui/error-alert/error-alert';
import { LoadState } from '../../shared/ui/load-state/load-state';
import { ProductsService, ProductListItem } from './api/products.service';
import { DealsService, Deal } from './api/deals.service';
import { CoverageService, CoverageCheckResult } from './api/coverage.service';

@Component({
  selector: 'app-storefront',
  imports: [FormsModule, ErrorAlert, LoadState],
  templateUrl: './storefront.html',
})
export class Storefront implements OnInit {
  protected readonly t = PT.storefront;
  private readonly productsService = inject(ProductsService);
  private readonly dealsService = inject(DealsService);
  private readonly coverageService = inject(CoverageService);

  // Signals, not plain fields: the app is zoneless, so only signal writes re-render after HTTP callbacks.
  protected readonly products = loadable(() => this.productsService.getProducts(), [] as ProductListItem[]);
  protected readonly deals = loadable(() => this.dealsService.getDeals(), [] as Deal[]);
  protected readonly coverageAction = action();
  protected readonly coverageResult = signal<CoverageCheckResult | null>(null);
  coverageAddress = '';

  ngOnInit(): void {
    this.products.load();
    this.deals.load();
  }

  checkCoverage(): void {
    if (!this.coverageAddress) {
      return;
    }
    this.coverageAction.run(this.coverageService.check({ address: this.coverageAddress }), (result) =>
      this.coverageResult.set(result),
    );
  }
}
