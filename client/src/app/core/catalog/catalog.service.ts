import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { Category, ProductListItem } from '../../shared/models/catalog.model';

/** The public catalog (anonymous API), shared by every screen that picks products. */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly http = inject(HttpClient);

  getProducts(category?: string, search?: string): Observable<ProductListItem[]> {
    const params: Record<string, string> = {};
    if (category) {
      params['category'] = category;
    }
    if (search?.trim()) {
      params['search'] = search.trim();
    }
    return this.http.get<ProductListItem[]>('/api/products', { params });
  }

  getCategories(): Observable<Category[]> {
    return this.http.get<Category[]>('/api/categories');
  }
}
