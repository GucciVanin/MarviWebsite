import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface GoogleReview {
  authorName: string;
  /** The author's Google profile, when the API vouches for it (https, google.com). */
  authorUrl: string | null;
  rating: number;
  text: string;
  relativeTime: string;
}

/** The business's public Google rating and the reviews Google returned (MRV-2.5). */
export interface GoogleReviews {
  rating: number;
  count: number;
  profileUrl: string | null;
  reviews: GoogleReview[];
}

@Injectable({ providedIn: 'root' })
export class GoogleReviewsService {
  private readonly http = inject(HttpClient);

  /** Emits null when the API has nothing to show (204: not configured or Google unavailable). */
  get(): Observable<GoogleReviews | null> {
    return this.http.get<GoogleReviews | null>('/api/public/reviews');
  }
}
