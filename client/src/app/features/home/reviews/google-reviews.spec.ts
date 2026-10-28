import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GoogleReviews } from '../api/google-reviews.service';
import { GoogleReviewsSection } from './google-reviews';

const LONG = 'Muito bom. '.repeat(30);

const reviews = (overrides: Partial<GoogleReviews> = {}): GoogleReviews => ({
  rating: 4.8,
  count: 25,
  profileUrl: 'https://maps.google.com/?cid=1',
  reviews: [
    { authorName: 'Livia Marques', authorUrl: 'https://www.google.com/maps/contrib/1', rating: 5, text: 'Atendimento e entrega excelentes.', relativeTime: 'há 2 meses' },
    { authorName: 'silvia Garcia', authorUrl: null, rating: 1, text: LONG, relativeTime: 'há 1 ano' },
  ],
  ...overrides,
});

describe('GoogleReviewsSection (MRV-2.5b)', () => {
  function render() {
    TestBed.configureTestingModule({ imports: [GoogleReviewsSection], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(GoogleReviewsSection);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const root = fixture.nativeElement as HTMLElement;
    const answer = async (body: GoogleReviews | null | 'down') => {
      const request = http.expectOne('/api/public/reviews');
      body === 'down' ? request.flush('x', { status: 500, statusText: 'Server Error' }) : request.flush(body);
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return { fixture, root, answer };
  }
  const text = (root: HTMLElement) => (root.textContent ?? '').replace(/\s+/g, ' ');

  it('shows the rating, the count, the source and one card per review, a 1-star review included', async () => {
    const { root, answer } = render();
    await answer(reviews());

    expect(root.querySelector('[data-testid="reviews-score"]')!.textContent).toContain('4,8');
    expect(text(root)).toContain('25 avaliações · Google');
    const cards = Array.from(root.querySelectorAll('[data-testid="review"]'));
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain('Livia Marques');
    expect(cards[1].querySelectorAll('svg:not(.stars__off)').length).toBe(1);
    expect(cards[1].textContent).toContain('S'); // avatar initial, upper-cased
  });

  it('links to the author and to all reviews on Google, opening a new tab safely', async () => {
    const { root, answer } = render();
    await answer(reviews());

    const author = root.querySelector('a.review__name') as HTMLAnchorElement;
    expect(author.href).toBe('https://www.google.com/maps/contrib/1');
    const all = root.querySelector('a.reviews__all') as HTMLAnchorElement;
    expect(all.href).toBe('https://maps.google.com/?cid=1');
    for (const link of [author, all]) {
      expect(link.target).toBe('_blank');
      expect(link.rel).toContain('noopener');
    }
  });

  it('omits the all-reviews link when the API sent no profile link', async () => {
    const { root, answer } = render();
    await answer(reviews({ profileUrl: null }));

    expect(root.querySelector('a.reviews__all')).toBeNull();
  });

  it('clamps a long review and expands it on demand', async () => {
    const { fixture, root, answer } = render();
    await answer(reviews());

    const long = root.querySelectorAll('[data-testid="review"]')[1];
    const body = long.querySelector('.review__text')!;
    const more = long.querySelector('button.review__more') as HTMLButtonElement;
    expect(body.classList).toContain('review__text--clamped');
    expect(more.textContent).toContain('Ler mais');

    more.click();
    fixture.detectChanges();

    expect(body.classList).not.toContain('review__text--clamped');
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelectorAll('[data-testid="review"]')[0].querySelector('button.review__more')).toBeNull(); // short: no toggle
  });

  it('is absent, not empty or broken, when there is nothing to show', async () => {
    for (const body of [null, 'down', reviews({ count: 0, reviews: [] })] as const) {
      TestBed.resetTestingModule();
      const { root, answer } = render();
      await answer(body);

      expect(root.querySelector('[data-testid="reviews"]')).toBeNull();
      expect(text(root)).toBe('');
    }
  });
});
