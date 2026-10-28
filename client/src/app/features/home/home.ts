import { CUSTOM_ELEMENTS_SCHEMA, Component, OnInit, afterNextRender, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CatalogService } from '../../core/catalog/catalog.service';
import { loadable } from '../../core/http/loadable';
import { PT } from '../../core/i18n/pt-br';
import type { Category } from '../../shared/models/catalog.model';
import { CountUp } from '../../shared/ui/count-up/count-up';
import { GoogleReviewsSection } from './reviews/google-reviews';
import { PublicStats, PublicStatsService } from './api/public-stats.service';
import { loadHeroRibbons, whenIdle } from './hero-ribbons.loader';

interface Tile {
  name: string;
  /** Set when the tile comes from the API: it links to that category in the catalog. */
  categoryId: string | null;
  productCount: number | null;
}

const MAX_TILES = 6;

/**
 * The public landing page (project.md section 10). Its live numbers and category tiles come from the API, but every
 * area also has static copy, so the page is complete while the numbers load and when the API is down: no blanks and
 * no error banners on a marketing page.
 */
@Component({
  selector: 'app-home',
  imports: [RouterLink, CountUp, GoogleReviewsSection],
  schemas: [CUSTOM_ELEMENTS_SCHEMA], // <marvi-ribbons> is defined by the lazily loaded React island
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home implements OnInit {
  protected readonly t = PT.home;
  protected readonly isAuthenticated = inject(AuthService).isAuthenticated;
  private readonly statsService = inject(PublicStatsService);
  private readonly catalogService = inject(CatalogService);

  // Signals, not plain fields: the app is zoneless, so only signal writes re-render after HTTP callbacks.
  private readonly statsData = loadable(() => this.statsService.get(), null as PublicStats | null);
  private readonly categoriesData = loadable(() => this.catalogService.getCategories(), [] as Category[]);

  /** The live numbers once they have arrived, otherwise null (the template then shows its static copy). */
  protected readonly stats = computed(() => (this.statsData.loaded() ? this.statsData.data() : null));
  protected readonly hasProducts = computed(() => (this.stats()?.productCount ?? 0) > 0);
  protected readonly hasAreas = computed(() => (this.stats()?.coverageAreaCount ?? 0) > 0);
  protected readonly categoriesWord = computed(() => (this.stats()?.categoryCount === 1 ? this.t.categoriesOne : this.t.categoriesMany));
  protected readonly areasWord = computed(() => (this.stats()?.coverageAreaCount === 1 ? this.t.areasOne : this.t.areasMany));

  protected readonly tiles = computed<Tile[]>(() => {
    const categories = this.categoriesData.loaded() ? this.categoriesData.data() : [];
    return categories.length > 0
      ? categories.slice(0, MAX_TILES).map((c) => ({ name: c.name, categoryId: c.id, productCount: c.productCount }))
      : this.t.fallbackCategories.map((name) => ({ name, categoryId: null, productCount: null }));
  });

  constructor() {
    // After the first paint and when the browser is idle, load the animated ribbons; the static ones are already there.
    afterNextRender(() => whenIdle(() => void loadHeroRibbons()));
  }

  ngOnInit(): void {
    this.statsData.load();
    this.categoriesData.load();
  }
}
