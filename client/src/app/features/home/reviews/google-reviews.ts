import { Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { AppIcon } from '../../../shared/ui/app-icon/app-icon';
import { loadable } from '../../../core/http/loadable';
import { PT } from '../../../core/i18n/pt-br';
import { GoogleReview, GoogleReviews, GoogleReviewsService } from '../api/google-reviews.service';

/** Reviews longer than this are clamped to a few lines with a "Ler mais" toggle. */
const LONG_REVIEW = 180;
const STARS = [1, 2, 3, 4, 5];

/**
 * The "Avaliações" section of the landing page (MRV-2.5): the business's Google rating and the reviews Google returns,
 * shown as the API sends them (no filtering by rating). It is decoration on a marketing page, so when the API has nothing
 * (not configured, Google down, request failed) the whole section is simply absent: no empty frame, no error banner.
 */
@Component({
  imports: [AppIcon],
  selector: 'app-google-reviews',
  templateUrl: './google-reviews.html',
  styleUrl: './google-reviews.scss',
})
export class GoogleReviewsSection implements OnInit {
  protected readonly t = PT.home.reviews;
  protected readonly stars = STARS;
  protected readonly loadingText = PT.state.loading;
  protected readonly placeholders = [1, 2, 3];
  private readonly service = inject(GoogleReviewsService);
  private readonly source = loadable(() => this.service.get(), null as GoogleReviews | null);
  private readonly track = viewChild<ElementRef<HTMLElement>>('track');
  private readonly expanded = signal<ReadonlySet<number>>(new Set());

  /** True only while the request is in flight: the section shows a skeleton then, and vanishes if nothing comes back. */
  protected readonly loading = computed(() => this.source.loading() && !this.source.loaded());

  /** The reviews to show, or null while loading, on failure and when there is nothing to show. */
  protected readonly reviews = computed(() => {
    const data = this.source.loaded() ? this.source.data() : null;
    return data && data.count > 0 && data.reviews.length > 0 ? data : null;
  });
  protected readonly ratingText = computed(() => (this.reviews()?.rating ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  protected readonly filledStars = computed(() => Math.round(this.reviews()?.rating ?? 0));
  protected readonly countText = computed(() => {
    const count = this.reviews()?.count ?? 0;
    return count === 1 ? this.t.countOne : `${count} ${this.t.countMany}`;
  });

  ngOnInit(): void {
    this.source.load();
  }

  protected initial(review: GoogleReview): string {
    return review.authorName.trim().charAt(0).toUpperCase();
  }

  protected isLong(review: GoogleReview): boolean {
    return review.text.length > LONG_REVIEW;
  }

  protected isExpanded(index: number): boolean {
    return this.expanded().has(index);
  }

  protected toggle(index: number): void {
    const next = new Set(this.expanded());
    next.has(index) ? next.delete(index) : next.add(index);
    this.expanded.set(next);
  }

  protected scroll(direction: 1 | -1): void {
    const element = this.track()?.nativeElement;
    const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    element?.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: reduceMotion ? 'auto' : 'smooth' });
  }
}
