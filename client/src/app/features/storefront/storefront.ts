import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProductsService, ProductListItem } from './api/products.service';
import { DealsService, Deal } from './api/deals.service';
import { CoverageService, CoverageCheckResult } from './api/coverage.service';

@Component({
  selector: 'app-storefront',
  imports: [FormsModule],
  templateUrl: './storefront.html',
})
export class Storefront implements OnInit {
  private readonly productsService = inject(ProductsService);
  private readonly dealsService = inject(DealsService);
  private readonly coverageService = inject(CoverageService);

  // Signals, not plain fields: the app is zoneless, so only signal writes re-render after HTTP callbacks.
  protected readonly products = signal<ProductListItem[]>([]);
  protected readonly deals = signal<Deal[]>([]);
  protected readonly coverageResult = signal<CoverageCheckResult | null>(null);
  coverageAddress = '';

  ngOnInit(): void {
    this.productsService.getProducts().subscribe((products) => this.products.set(products));
    this.dealsService.getDeals().subscribe((deals) => this.deals.set(deals));
  }

  checkCoverage(): void {
    if (!this.coverageAddress) {
      return;
    }
    this.coverageService
      .check({ address: this.coverageAddress })
      .subscribe((result) => this.coverageResult.set(result));
  }
}
