import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
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
import { Reveal } from '../../shared/ui/reveal/reveal';
import { Deal, DealsService } from './api/deals.service';
import { CoverageCheckResult, CoverageService } from './api/coverage.service';


@Component({
  selector: 'app-storefront',
  imports: [FormsModule, RouterLink, AppIcon, ErrorAlert, LoadState, Reveal, BrlPipe, PtDatePipe],
  templateUrl: './storefront.html',
})
export class Storefront implements OnInit {
  protected readonly t = PT.storefront;
  private readonly catalogService = inject(CatalogService);
  private readonly dealsService = inject(DealsService);
  private readonly coverageService = inject(CoverageService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  // The filters live in the URL (?category=<name>&q=<text>) so a link can point at a filtered catalog. The category is named, never
  // identified by its id: no id is ever put in a URL (MRV-9.1). Category names are unique ignoring case.
  private readonly route = inject(ActivatedRoute);
  private readonly query = this.route.snapshot.queryParamMap;

  // Signals, not plain fields: the app is zoneless, so only signal writes re-render after HTTP callbacks.
  protected readonly searchText = signal(this.query.get('q') ?? '');
  // The category is the id the API filters by; it is known once the categories have arrived (a category named in the URL waits for them).
  // A name that matches no category (a mistyped or stale link) is ignored.
  protected readonly categoryId = signal('');
  private readonly appliedSearch = signal(this.searchText());
  private readonly appliedCategory = signal('');
  private categoryFromUrl = (this.query.get('category') ?? '').trim();
  private awaitingCategories = this.categoryFromUrl !== '';

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
      const search = (params.get('q') ?? '').trim();
      if (this.awaitingCategories) {
        // The categories have not settled yet, so the products have not been asked for: follow the URL as it is now, never a stale one.
        this.categoryFromUrl = (params.get('category') ?? '').trim();
        this.searchText.set(search);
        this.appliedSearch.set(search);
        if (this.categoryFromUrl === '') {
          this.awaitingCategories = false;
          this.products.load();
        }
        return;
      }
      const category = this.categoryIdOf(params.get('category'));
      if (category === this.appliedCategory() && search === this.appliedSearch()) {
        return;
      }
      this.categoryId.set(category);
      this.searchText.set(search);
      this.appliedCategory.set(category);
      this.appliedSearch.set(search);
      this.products.load();
    });

    // A category named in the URL is turned into its id as soon as the categories are known, and only then are the products asked for.
    effect(() => {
      const settled = this.categories.loaded() || this.categories.error() !== null;
      if (settled && this.awaitingCategories) {
        untracked(() => {
          this.awaitingCategories = false;
          const id = this.categoryIdOf(this.categoryFromUrl);
          this.categoryId.set(id);
          this.appliedCategory.set(id);
          this.products.load();
        });
      }
    });
  }

  ngOnInit(): void {
    if (!this.awaitingCategories) {
      this.products.load();
    }
    this.categories.load();
    this.deals.load();
  }

  /** The id of the category called `name` (ignoring case), or '' when there is none. */
  private categoryIdOf(name: string | null): string {
    const wanted = (name ?? '').trim().toLowerCase();
    return wanted === '' ? '' : (this.categories.data().find((c) => c.name.trim().toLowerCase() === wanted)?.id ?? '');
  }

  applyFilters(): void {
    const search = this.searchText().trim();
    this.searchText.set(search);
    this.appliedSearch.set(search);
    this.appliedCategory.set(this.categoryId());
    const queryParams: Record<string, string> = {};
    const name = this.categories.data().find((c) => c.id === this.categoryId())?.name;
    if (name) {
      queryParams['category'] = name;
    }
    if (search) {
      queryParams['q'] = search;
    }
    this.router.navigate([], { queryParams, replaceUrl: true });
    this.products.load();
  }

  /** A category chip: sets the category and runs the search with the text already typed. */
  pickCategory(id: string): void {
    this.categoryId.set(id);
    this.applyFilters();
  }

  checkCoverage(): void {
    const address = this.coverageAddress().trim();
    if (!address) {
      return;
    }
    this.coverageAction.run(this.coverageService.check({ address }), (result) => this.coverageResult.set(result));
  }
}
