import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CatalogService } from '../../core/catalog/catalog.service';
import { action } from '../../core/http/action';
import { loadable } from '../../core/http/loadable';
import { PT } from '../../core/i18n/pt-br';
import { BrlPipe } from '../../shared/format/brl.pipe';
import { PtDatePipe } from '../../shared/format/pt-date.pipe';
import type { Category, ProductListItem } from '../../shared/models/catalog.model';
import { AppIcon } from '../../shared/ui/app-icon/app-icon';
import { ErrorAlert } from '../../shared/ui/error-alert/error-alert';
import { LoadState } from '../../shared/ui/load-state/load-state';
import { Deal, DealsService } from './api/deals.service';
import { CoverageCheckResult, CoverageService } from './api/coverage.service';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validCategory = (value: string | null): string => (value && GUID.test(value) ? value : '');

@Component({
  selector: 'app-storefront',
  imports: [FormsModule, RouterLink, AppIcon, ErrorAlert, LoadState, BrlPipe, PtDatePipe],
  templateUrl: './storefront.html',
})
export class Storefront implements OnInit {
  protected readonly t = PT.storefront;
  private readonly catalogService = inject(CatalogService);
  private readonly dealsService = inject(DealsService);
  private readonly coverageService = inject(CoverageService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  // The filters live in the URL (?category=<id>&q=<text>) so a link can point at a filtered catalog.
  private readonly route = inject(ActivatedRoute);
  private readonly query = this.route.snapshot.queryParamMap;

  // Signals, not plain fields: the app is zoneless, so only signal writes re-render after HTTP callbacks.
  protected readonly searchText = signal(this.query.get('q') ?? '');
  // A category that is not an id (a mistyped or stale link) is ignored rather than sent to the API.
  protected readonly categoryId = signal(validCategory(this.query.get('category')));
  private readonly appliedSearch = signal(this.searchText());
  private readonly appliedCategory = signal(this.categoryId());

  protected readonly products = loadable(
    () => this.catalogService.getProducts(this.appliedCategory() || undefined, this.appliedSearch() || undefined),
    [] as ProductListItem[],
  );
  protected readonly categories = loadable(() => this.catalogService.getCategories(), [] as Category[]);
  protected readonly deals = loadable(() => this.dealsService.getDeals(), [] as Deal[]);

  protected readonly coverageAddress = signal('');
  protected readonly coverageAction = action();
  protected readonly coverageResult = signal<CoverageCheckResult | null>(null);

  protected readonly isAuthenticated = this.auth.isAuthenticated;
  protected readonly homeUrl = this.auth.homeUrl;
  protected readonly areaLabel = computed(() => {
    const role = this.auth.role() ?? '';
    return role === 'Client' ? this.t.clientCta : (PT.nav.areas[role] ?? '');
  });

  constructor() {
    // The router reuses this component when only the query string changes (a header link back to the catalog clears it),
    // so follow the URL instead of reading it once.
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const category = validCategory(params.get('category'));
      const search = (params.get('q') ?? '').trim();
      if (category === this.appliedCategory() && search === this.appliedSearch()) {
        return;
      }
      this.categoryId.set(category);
      this.searchText.set(search);
      this.appliedCategory.set(category);
      this.appliedSearch.set(search);
      this.products.load();
    });
  }

  ngOnInit(): void {
    this.products.load();
    this.categories.load();
    this.deals.load();
  }

  applyFilters(): void {
    const search = this.searchText().trim();
    this.searchText.set(search);
    this.appliedSearch.set(search);
    this.appliedCategory.set(this.categoryId());
    const queryParams: Record<string, string> = {};
    if (this.categoryId()) {
      queryParams['category'] = this.categoryId();
    }
    if (search) {
      queryParams['q'] = search;
    }
    this.router.navigate([], { queryParams, replaceUrl: true });
    this.products.load();
  }

  checkCoverage(): void {
    const address = this.coverageAddress().trim();
    if (!address) {
      return;
    }
    this.coverageAction.run(this.coverageService.check({ address }), (result) => this.coverageResult.set(result));
  }
}
