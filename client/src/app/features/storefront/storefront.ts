import { Component, OnInit, inject } from '@angular/core';
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

  products: ProductListItem[] = [];
  deals: Deal[] = [];
  coverageAddress = '';
  coverageResult: CoverageCheckResult | null = null;

  ngOnInit(): void {
    this.productsService.getProducts().subscribe((products) => (this.products = products));
    this.dealsService.getDeals().subscribe((deals) => (this.deals = deals));
  }

  checkCoverage(): void {
    if (!this.coverageAddress) {
      return;
    }
    this.coverageService
      .check({ address: this.coverageAddress })
      .subscribe((result) => (this.coverageResult = result));
  }
}
